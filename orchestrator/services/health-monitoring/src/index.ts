/**
 * health-monitoring — bounded context service (ADR-0001)
 * Port: :3103
 *
 * Subscribes to:
 * - intents:heartbeat → tracks agent liveness
 *
 * Publishes:
 * - intents:instance-stalled → when heartbeat exceeds threshold
 *
 * Monitors agent health and emits stall alerts.
 */
import { createBusClient } from "@orchestrator/bus-client";
import { HeartbeatPayload, InstanceStalledPayload } from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3103;
const SERVICE_NAME = "health-monitoring";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Configurable thresholds
const STALL_THRESHOLD_MS = Number(process.env.STALL_THRESHOLD_MS) || 90000; // 3 missed beats at 30s

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// In-memory heartbeat store
interface HeartbeatRecord {
  instanceId: string;
  lastHeartbeatAt: string;
  turnId: string;
  load: {
    activeTurns: number;
    pendingIntents: number;
    lastHeartbeatAgeMs: number;
  };
  missedBeats: number;
}

const heartbeats: Map<string, HeartbeatRecord> = new Map();

// --- Intent handlers ---

async function handleHeartbeat(payload: HeartbeatPayload) {
  const now = new Date().toISOString();

  heartbeats.set(payload.instanceId, {
    instanceId: payload.instanceId,
    lastHeartbeatAt: now,
    turnId: payload.turnId,
    load: payload.load,
    missedBeats: 0, // Reset on successful heartbeat
  });

  console.log(`[${SERVICE_NAME}] Heartbeat from ${payload.instanceId} (turn: ${payload.turnId})`);
}

// --- Stall detection loop ---

function checkForStalls() {
  const now = Date.now();

  for (const [instanceId, record] of heartbeats) {
    const lastBeat = new Date(record.lastHeartbeatAt).getTime();
    const age = now - lastBeat;

    if (age > STALL_THRESHOLD_MS) {
      const missedBeats = Math.floor(age / 30000); // Assuming 30s interval
      record.missedBeats = missedBeats;

      console.log(`[${SERVICE_NAME}] Agent ${instanceId} STALLED (missed ${missedBeats} beats, age: ${age}ms)`);

      // Publish stall intent
      const stallPayload: InstanceStalledPayload = {
        instanceId,
        lastHeartbeatAt: record.lastHeartbeatAt,
        missedBeats,
      };

      bus.publish("intents:instance-stalled", {
        type: "InstanceStalled",
        idempotencyKey: `stall-${instanceId}-${Date.now()}`,
        featureSlug: "unknown",
        instanceId,
        branch: "main",
        timestamp: new Date().toISOString(),
        payload: stallPayload,
      });
    }
  }
}

// Start stall detection loop (every 30s)
setInterval(checkForStalls, 30000);

// --- Start bus subscription ---

async function startBus() {
  await bus.connect();
  console.log(`[${SERVICE_NAME}] Connected to Redis`);

  await bus.subscribe("intents:heartbeat", SERVICE_NAME, `${SERVICE_NAME}-1`, async (envelope) => {
    await handleHeartbeat(envelope.payload as HeartbeatPayload);
  });
}

// --- HTTP API ---

async function getHeartbeats(req: Request): Promise<Response> {
  const heartbeatList = Array.from(heartbeats.values());
  return Response.json({ heartbeats: heartbeatList, count: heartbeatList.length });
}

async function getStalled(req: Request): Promise<Response> {
  const now = Date.now();
  const stalled = Array.from(heartbeats.values()).filter(h => {
    const age = now - new Date(h.lastHeartbeatAt).getTime();
    return age > STALL_THRESHOLD_MS;
  });
  return Response.json({ stalled, count: stalled.length, thresholdMs: STALL_THRESHOLD_MS });
}

// Start HTTP server first so /health responds before the blocking subscribe loop starts.
Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/health") {
        const redisOk = await bus.ping();
        return Response.json({
          service: SERVICE_NAME,
          status: redisOk ? "ok" : "degraded",
          port: PORT,
          agentsTracked: heartbeats.size,
          stallThresholdMs: STALL_THRESHOLD_MS,
          redis: redisOk ? "connected" : "disconnected",
        });
      }

      if (url.pathname === "/heartbeats" && req.method === "GET") {
        return getHeartbeats(req);
      }

      if (url.pathname === "/stalled" && req.method === "GET") {
        return getStalled(req);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);

// Start bus subscriptions after the HTTP server is listening.
startBus().catch(console.error);
