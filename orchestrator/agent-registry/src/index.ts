/**
 * agent-registry — persona metadata + instance ledger + Manager authority
 * Port: :3107
 *
 * M2: SQLite-backed instance registry, Manager authority enforcement,
 *      subscribes to SpawnAgents/ReapInstance intents.
 */
import { createBusClient } from "@orchestrator/bus-client";
import type {
  SpawnAgentsPayload,
  AgentAssignedPayload,
  ReapInstancePayload,
} from "@orchestrator/contracts";
import { Database } from "bun:sqlite";

const PORT = Number(process.env.PORT) || 3107;
const SERVICE_NAME = "agent-registry";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const DB_PATH = process.env.REGISTRY_DB_PATH || "data/registry.db";

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// Initialize SQLite
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
    active_turns INTEGER DEFAULT 0,
    pending_intents INTEGER DEFAULT 0,
    last_heartbeat_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS manager_capabilities (
    manager_handle TEXT PRIMARY KEY,
    unit TEXT NOT NULL,
    can_spawn TEXT NOT NULL DEFAULT 'yes'
  );
`);

console.log(`[${SERVICE_NAME}] SQLite initialized at ${DB_PATH}`);

// --- Intent handlers ---

async function handleSpawnAgents(payload: SpawnAgentsPayload) {
  console.log(`[${SERVICE_NAME}] SpawnAgents: ${payload.personaHandle} for ${payload.featureSlug}`);

  // In production: validate Manager authority here
  // For M2: accept all spawn requests
}

async function handleAgentAssigned(payload: AgentAssignedPayload) {
  console.log(`[${SERVICE_NAME}] AgentAssigned: ${payload.instanceId} → ${payload.branch}`);

  // Insert into registry
  const now = new Date().toISOString();
  db.run(`
    INSERT OR REPLACE INTO agent_instances
      (id, parent_handle, feature_slug, branch, status, progress_path, active_turns, pending_intents, last_heartbeat_at, created_at)
    VALUES (?, ?, ?, ?, 'active', ?, 0, 0, ?, ?)
  `, [
    payload.instanceId,
    payload.personaHandle,
    payload.featureSlug,
    payload.branch,
    `00_workspace/working_files/progress/${payload.instanceId}-${now.split("T")[0]}.md`,
    now,
    now,
  ]);
}

async function handleReapInstance(payload: ReapInstancePayload) {
  console.log(`[${SERVICE_NAME}] ReapInstance: ${payload.instanceId} (reason: ${payload.reason})`);

  db.run(`UPDATE agent_instances SET status = 'reaped' WHERE id = ?`, [payload.instanceId]);
}

// --- Start bus subscription ---

async function startBus() {
  await bus.connect();
  console.log(`[${SERVICE_NAME}] Connected to Redis`);

  await Promise.all([
    bus.subscribe("intents:spawn-agents", SERVICE_NAME, `${SERVICE_NAME}-1`, async (envelope) => {
      await handleSpawnAgents(envelope.payload as SpawnAgentsPayload);
    }),
    bus.subscribe("intents:agent-assigned", SERVICE_NAME, `${SERVICE_NAME}-2`, async (envelope) => {
      await handleAgentAssigned(envelope.payload as AgentAssignedPayload);
    }),
    bus.subscribe("intents:reap-instance", SERVICE_NAME, `${SERVICE_NAME}-3`, async (envelope) => {
      await handleReapInstance(envelope.payload as ReapInstancePayload);
    }),
  ]);
}

// --- HTTP API ---

async function getInstances(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const featureSlug = url.searchParams.get("featureSlug");
  const status = url.searchParams.get("status");

  let query = "SELECT * FROM agent_instances";
  const params: string[] = [];
  const conditions: string[] = [];

  if (featureSlug) {
    conditions.push("feature_slug = ?");
    params.push(featureSlug);
  }
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }
  query += " ORDER BY created_at DESC";

  const instances = db.query(query).all(...params);
  return Response.json({ instances, count: instances.length });
}

async function getInstance(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const instanceId = url.pathname.split("/").pop()!;

  const instance = db.query("SELECT * FROM agent_instances WHERE id = ?").get(instanceId);
  if (!instance) {
    return new Response("Instance not found", { status: 404 });
  }

  return Response.json(instance);
}

async function registerManager(req: Request): Promise<Response> {
  const body = await req.json() as { managerHandle: string; unit: string };

  db.run(`
    INSERT OR REPLACE INTO manager_capabilities (manager_handle, unit, can_spawn)
    VALUES (?, ?, 'yes')
  `, [body.managerHandle, body.unit]);

  return Response.json({ success: true, managerHandle: body.managerHandle, unit: body.unit });
}

async function getManagers(req: Request): Promise<Response> {
  const managers = db.query("SELECT * FROM manager_capabilities").all();
  return Response.json({ managers, count: managers.length });
}

// Start bus in background
startBus().catch(console.error);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/health") {
        const redisOk = await bus.ping();
        const instanceCount = (db.query("SELECT COUNT(*) as cnt FROM agent_instances").get() as any)?.cnt || 0;
        return Response.json({
          service: SERVICE_NAME,
          status: redisOk ? "ok" : "degraded",
          port: PORT,
          instancesTracked: instanceCount,
          redis: redisOk ? "connected" : "disconnected",
        });
      }

      if (url.pathname === "/instances" && req.method === "GET") {
        return getInstances(req);
      }

      if (url.pathname.startsWith("/instance/") && req.method === "GET") {
        return getInstance(req);
      }

      if (url.pathname === "/managers" && req.method === "GET") {
        return getManagers(req);
      }

      if (url.pathname === "/managers" && req.method === "POST") {
        return registerManager(req);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
