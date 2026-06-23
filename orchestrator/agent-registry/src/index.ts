/**
 * agent-registry — bounded context service (ADR-0001)
 * Port: :3106
 *
 * Milestone 2: SQLite-backed agent instance registry.
 * Stores spawned agent instances with distinct handles, branches, and progress paths.
 */
import { Database } from "bun:sqlite";
import { BusClient } from "@team1/bus-client";

const PORT = Number(process.env.PORT) || 3106;
const SERVICE_NAME = "agent-registry";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const DB_PATH = process.env.REGISTRY_DB || "./data/registry.db";

// --- SQLite registry ---
const db = new Database(DB_PATH, { create: true });
db.run("PRAGMA journal_mode = WAL");
db.run(`
  CREATE TABLE IF NOT EXISTS agent_instances (
    id TEXT PRIMARY KEY,
    parent_handle TEXT NOT NULL,
    feature_slug TEXT NOT NULL,
    branch TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'launching',
    progress_path TEXT NOT NULL,
    capability TEXT,
    active_turns INTEGER DEFAULT 0,
    pending_intents INTEGER DEFAULT 0,
    last_heartbeat_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS persona_handles (
    handle TEXT PRIMARY KEY,
    next_instance INTEGER DEFAULT 2
  )
`);

// --- Bus connection ---
let busConnected = false;
const bus = new BusClient({ redisUrl: REDIS_URL, serviceName: SERVICE_NAME });
bus.connect().then(() => {
  busConnected = true;
  console.log(`[${SERVICE_NAME}] connected to Redis bus`);
}).catch((err) => {
  console.warn(`[${SERVICE_NAME}] Redis bus connection failed (non-fatal):`, err?.message);
});

// --- HTTP API ---
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Health
    if (path === "/healthz") {
      return Response.json({ status: "ok", service: SERVICE_NAME, port: PORT, busConnected });
    }
    if (path === "/readyz") {
      return Response.json({ ready: busConnected, service: SERVICE_NAME });
    }

    // POST /agents/register — register a new agent instance
    if (path === "/agents/register" && req.method === "POST") {
      try {
        const body = await req.json();
        const { id, parentHandle, featureSlug, branch, progressPath, capability } = body;
        if (!id || !parentHandle || !featureSlug || !branch || !progressPath) {
          return Response.json({ error: "Missing required fields" }, { status: 400 });
        }
        const now = Date.now();
        db.run(
          `INSERT OR REPLACE INTO agent_instances (id, parent_handle, feature_slug, branch, status, progress_path, capability, active_turns, pending_intents, last_heartbeat_at, created_at) VALUES (?, ?, ?, ?, 'launching', ?, ?, 0, 0, ?, ?)`,
          [id, parentHandle, featureSlug, branch, progressPath, capability || null, now, now]
        );
        // Track persona handle for instance numbering
        db.run(
          `INSERT OR REPLACE INTO persona_handles (handle, next_instance) VALUES (?, ?)`,
          [parentHandle, parseInt(id.split("-").pop() || "2") + 1]
        );
        console.log(`[${SERVICE_NAME}] registered instance: ${id} on branch ${branch}`);
        return Response.json({ status: "registered", id, branch, progressPath });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // GET /agents — list all instances
    if (path === "/agents" && req.method === "GET") {
      const rows = db.query("SELECT * FROM agent_instances ORDER BY created_at DESC").all();
      return Response.json({ instances: rows });
    }

    // GET /agents/:id — get single instance
    const agentMatch = path.match(/^\/agents\/(.+)$/);
    if (agentMatch && req.method === "GET") {
      const agentId = decodeURIComponent(agentMatch[1]);
      const row = db.query("SELECT * FROM agent_instances WHERE id = ?").get(agentId);
      if (!row) return Response.json({ error: "Not found" }, { status: 404 });
      return Response.json(row);
    }

    // POST /agents/:id/heartbeat — update heartbeat
    const hbMatch = path.match(/^\/agents\/(.+)\/heartbeat$/);
    if (hbMatch && req.method === "POST") {
      const agentId = decodeURIComponent(hbMatch[1]);
      db.run("UPDATE agent_instances SET last_heartbeat_at = ? WHERE id = ?", [Date.now(), agentId]);
      return Response.json({ status: "heartbeat-updated", id: agentId });
    }

    // POST /agents/:id/status — update status
    const statusMatch = path.match(/^\/agents\/(.+)\/status$/);
    if (statusMatch && req.method === "POST") {
      try {
        const agentId = decodeURIComponent(statusMatch[1]);
        const body = await req.json();
        const { status } = body;
        if (!status) return Response.json({ error: "Missing status" }, { status: 400 });
        db.run("UPDATE agent_instances SET status = ? WHERE id = ?", [status, agentId]);
        return Response.json({ status: "updated", id: agentId, newStatus: status });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT} (SQLite: ${DB_PATH})`);

process.on("SIGTERM", () => {
  console.log(`[${SERVICE_NAME}] shutting down`);
  server.stop();
  db.close();
  process.exit(0);
});
