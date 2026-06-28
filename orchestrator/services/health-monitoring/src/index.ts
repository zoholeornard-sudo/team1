/**
 * health-monitoring — bounded context service (ADR-0001)
 * Port: :3103
 *
 * R5: Observability & Production Hardening
 * - SQLite-backed heartbeat store (survives restarts)
 * - Automatic stall detection (configurable threshold)
 * - Emits InstanceStalled intent when agent misses 3+ heartbeats
 * - Structured JSON logging for Loki compatibility
 * - Health history API for dashboards
 *
 * Subscribes to:
 * - intents:heartbeat → tracks agent liveness
 *
 * Publishes:
 * - intents:instance-stalled → when heartbeat exceeds threshold
 */
import { createBusClient } from "@orchestrator/bus-client";
import { HeartbeatPayload, InstanceStalledPayload } from "@orchestrator/contracts";
import { Database } from "bun:sqlite";

const PORT = Number(process.env.PORT) || 3103;
const SERVICE_NAME = "health-monitoring";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const DB_PATH = process.env.HEALTH_DB_PATH || "data/health.db";
const STALL_THRESHOLD_MS = Number(process.env.STALL_THRESHOLD_MS) || 90000;
const CHECK_INTERVAL_MS = Number(process.env.HEALTH_CHECK_INTERVAL_MS) || 30000;

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// --- SQLite persistence ---
const db = new Database(DB_PATH, { create: true });
db.run("PRAGMA journal_mode = WAL");

db.run(`
  CREATE TABLE IF NOT EXISTS heartbeats (
    instance_id TEXT PRIMARY KEY,
    feature_slug TEXT,
    last_heartbeat_at TEXT NOT NULL,
    turn_id TEXT,
    active_turns INTEGER DEFAULT 0,
    pending_intents INTEGER DEFAULT 0,
    missed_beats INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS stall_events (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    feature_slug TEXT,
    last_heartbeat_at TEXT,
    missed_beats INTEGER,
    detected_at TEXT NOT NULL
  )
`);

// --- Structured logging ---
function log(level: string, msg: string, extra: Record<string, unknown> = {}) {
  const entry = { ts: new Date().toISOString(), level, service: SERVICE_NAME, msg, ...extra };
  console.log(JSON.stringify(entry));
}

// --- Intent handler ---
async function handleHeartbeat(payload: HeartbeatPayload) {
  const now = new Date().toISOString();
  const existing = db.query("SELECT * FROM heartbeats WHERE instance_id = ?").get(payload.instanceId) as any;

  if (existing) {
    db.run(`
      UPDATE heartbeats SET
        last_heartbeat_at = ?, turn_id = ?, active_turns = ?, pending_intents = ?,
        missed_beats = 0, updated_at = ?
      WHERE instance_id = ?
    `, [now, payload.turnId, payload.load.activeTurns, payload.load.pendingIntents, now, payload.instanceId]);
  } else {
    db.run(`
      INSERT INTO heartbeats (instance_id, last_heartbeat_at, turn_id, active_turns, pending_intents, missed_beats, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `, [payload.instanceId, now, payload.turnId, payload.load.activeTurns, payload.load.pendingIntents, now, now]);
  }
}

// --- Stall detection loop ---
async function checkForStalls() {
  const now = Date.now();
  const rows = db.query("SELECT * FROM heartbeats").all() as any[];

  for (const row of rows) {
    const lastBeat = new Date(row.last_heartbeat_at).getTime();
    const age = now - lastBeat;

    if (age > STALL_THRESHOLD_MS) {
      const missedBeats = Math.floor(age / (STALL_THRESHOLD_MS / 3));

      // Update missed beats
      db.run("UPDATE heartbeats SET missed_beats = ? WHERE instance_id = ?", [missedBeats, row.instance_id]);

      // Emit stall intent
      const stallPayload: InstanceStalledPayload = {
        instanceId: row.instance_id,
        lastHeartbeatAt: row.last_heartbeat_at,
        missedBeats,
      };

      await bus.publish("intents:instance-stalled", {
        type: "InstanceStalled",
        idempotencyKey: `stall-${row.instance_id}-${Date.now()}`,
        featureSlug: row.feature_slug || "unknown",
        instanceId: row.instance_id,
        timestamp: new Date().toISOString(),
        payload: stallPayload,
      });

      // Record stall event
      db.run(`
        INSERT INTO stall_events (id, instance_id, feature_slug, last_heartbeat_at, missed_beats, detected_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [`stall-${row.instance_id}-${Date.now()}`, row.instance_id, row.feature_slug, row.last_heartbeat_at, missedBeats, new Date().toISOString()]);

      log("warn", "Instance stalled", { instanceId: row.instance_id, missedBeats, ageMs: age });
    }
  }
}

// Start stall detection loop
setInterval(checkForStalls, CHECK_INTERVAL_MS);
log("info", "Stall detection loop started", { intervalMs: CHECK_INTERVAL_MS, thresholdMs: STALL_THRESHOLD_MS });

// --- Start bus subscription ---
async function startBus() {
  await bus.connect();
  log("info", "Connected to Redis");
  await bus.subscribe("intents:heartbeat", SERVICE_NAME, `${SERVICE_NAME}-1`, async (envelope) => {
    await handleHeartbeat(envelope.payload as HeartbeatPayload);
  });
}

// --- HTTP API ---
Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/health") {
        const redisOk = await bus.ping();
        const hbCount = (db.query("SELECT COUNT(*) as cnt FROM heartbeats").get() as any)?.cnt || 0;
        const stallCount = (db.query("SELECT COUNT(*) as cnt FROM stall_events").get() as any)?.cnt || 0;
        return Response.json({
          service: SERVICE_NAME, status: redisOk ? "ok" : "degraded", port: PORT,
          heartbeatsTracked: hbCount, stallEvents: stallCount,
          thresholdMs: STALL_THRESHOLD_MS, redis: redisOk ? "connected" : "disconnected",
        });
      }
      if (url.pathname === "/heartbeats" && req.method === "GET") {
        const rows = db.query("SELECT * FROM heartbeats ORDER BY updated_at DESC").all();
        return Response.json({ heartbeats: rows, count: rows.length });
      }
      if (url.pathname === "/stalls" && req.method === "GET") {
        const rows = db.query("SELECT * FROM stall_events ORDER BY detected_at DESC").all();
        return Response.json({ stalls: rows, count: rows.length });
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      log("error", "Request failed", { error: String(err) });
      return new Response("Internal server error", { status: 500 });
    }
  },
});

log("info", "listening", { port: PORT });
startBus().catch((err) => log("error", "Bus subscription failed", { error: String(err) }));
