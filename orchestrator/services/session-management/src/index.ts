/**
 * session-management — bounded context service (ADR-0001)
 * Port: :3102
 *
 * Subscribes to:
 * - intents:session-started → tracks agent session
 * - intents:reap-instance → cleans up session state
 *
 * Tracks agent session state and turn history.
 */
import { createBusClient } from "@orchestrator/bus-client";
import { SessionStartedPayload, ReapInstancePayload } from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3102;
const SERVICE_NAME = "session-management";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// In-memory session store (SQLite in production)
interface SessionRecord {
  instanceId: string;
  branch: string;
  seedContext: Record<string, unknown>;
  status: "active" | "reaped";
  startedAt: string;
  reapedAt?: string;
}

const sessions: Map<string, SessionRecord> = new Map();

// --- Intent handlers ---

async function handleSessionStarted(payload: SessionStartedPayload) {
  console.log(`[${SERVICE_NAME}] Session started: ${payload.instanceId}`);

  sessions.set(payload.instanceId, {
    instanceId: payload.instanceId,
    branch: payload.branch,
    seedContext: payload.seedContext,
    status: "active",
    startedAt: new Date().toISOString(),
  });
}

async function handleReapInstance(payload: ReapInstancePayload) {
  console.log(`[${SERVICE_NAME}] Reaping instance: ${payload.instanceId}`);

  const session = sessions.get(payload.instanceId);
  if (session) {
    session.status = "reaped";
    session.reapedAt = new Date().toISOString();
  }
}

// --- Start bus subscription ---

async function startBus() {
  await bus.connect();
  console.log(`[${SERVICE_NAME}] Connected to Redis`);

  await Promise.all([
    bus.subscribe("intents:session-started", SERVICE_NAME, `${SERVICE_NAME}-1`, async (envelope) => {
      await handleSessionStarted(envelope.payload as SessionStartedPayload);
    }),
    bus.subscribe("intents:reap-instance", SERVICE_NAME, `${SERVICE_NAME}-2`, async (envelope) => {
      await handleReapInstance(envelope.payload as ReapInstancePayload);
    }),
  ]);
}

// --- HTTP API ---

async function getSessions(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let sessionList = Array.from(sessions.values());
  if (status) sessionList = sessionList.filter(s => s.status === status);

  return Response.json({ sessions: sessionList, count: sessionList.length });
}

async function getSession(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const instanceId = url.pathname.split("/").pop()!;

  const session = sessions.get(instanceId);
  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  return Response.json(session);
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
          sessionsTracked: sessions.size,
          redis: redisOk ? "connected" : "disconnected",
        });
      }

      if (url.pathname === "/sessions" && req.method === "GET") {
        return getSessions(req);
      }

      if (url.pathname.startsWith("/session/") && req.method === "GET") {
        return getSession(req);
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
// subscribe() enters an infinite xreadgroup loop and would block Bun.serve() if called first.
startBus().catch(console.error);
