/**
 * edit-coordinator — bounded context service (ADR-0001, ADR-0003)
 * Port: :3106
 *
 * Single-writer lock for repository edits.
 * Implements Tier 1 (git ops under lock) + Tier 2 (async tests).
 *
 * Subscribes to:
 * - intents:edit-intent → applies edits under lock
 * - intents:acquire-checkout → manages branch locks
 *
 * Publishes:
 * - intents:edit-applied
 * - intents:checkout-denied
 * - intents:test-needed (Tier 2)
 * - intents:test-failed (Tier 2)
 * - intents:edit-reverted (Tier 2)
 */
import { createBusClient } from "@orchestrator/bus-client";
import { EditIntentPayload, AcquireCheckoutPayload, EditAppliedPayload } from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3106;
const SERVICE_NAME = "edit-coordinator";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Tier 1 lock budget (ms) — git ops only
const LOCK_TTL_MS = 5000;

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// In-memory lock state (Redlock in production)
const locks: Map<string, { holder: string; expiresAt: number }> = new Map();

// --- Lock management ---

function acquireLock(resource: string, holder: string, ttlMs: number = LOCK_TTL_MS): boolean {
  const existing = locks.get(resource);
  if (existing && existing.expiresAt > Date.now()) {
    return false; // Lock held by another
  }

  locks.set(resource, { holder, expiresAt: Date.now() + ttlMs });
  console.log(`[${SERVICE_NAME}] Lock acquired: ${resource} by ${holder}`);
  return true;
}

function releaseLock(resource: string, holder: string): boolean {
  const existing = locks.get(resource);
  if (!existing || existing.holder !== holder) {
    return false;
  }

  locks.delete(resource);
  console.log(`[${SERVICE_NAME}] Lock released: ${resource} by ${holder}`);
  return true;
}

// --- Edit application (Tier 1 — under lock) ---

async function applyEditBatch(intents: EditIntentPayload[], instanceId: string, branch: string, featureSlug: string) {
  const lockKey = `locks:repo:global`;

  if (!acquireLock(lockKey, instanceId)) {
    // Lock contention — deny checkout
    await bus.publish("intents:checkout-denied", {
      type: "CheckoutDenied",
      idempotencyKey: `checkout-denied-${instanceId}-${Date.now()}`,
      featureSlug,
      instanceId,
      branch,
      timestamp: new Date().toISOString(),
      payload: { instanceId, branch, retryAfterMs: 1000 },
    });
    return null;
  }

  try {
    // Tier 1: Apply edits (in production: git checkout + file writes + commit + push)
    console.log(`[${SERVICE_NAME}] Applying ${intents.length} edits for ${instanceId} on ${branch}`);

    const paths = intents.map(i => i.path);

    // Simulate commit SHA
    const commitSha = `commit-${Date.now().toString(36)}`;

    // Publish EditApplied
    const editAppliedPayload: EditAppliedPayload = {
      instanceId,
      commitSha,
      appliedCount: intents.length,
    };

    await bus.publish("intents:edit-applied", {
      type: "EditApplied",
      idempotencyKey: `edit-applied-${commitSha}`,
      featureSlug,
      instanceId,
      branch,
      timestamp: new Date().toISOString(),
      payload: editAppliedPayload,
    });

    // Publish TestNeeded (Tier 2 trigger)
    await bus.publish("intents:test-needed", {
      type: "TestNeeded",
      idempotencyKey: `test-needed-${commitSha}`,
      featureSlug,
      branch,
      timestamp: new Date().toISOString(),
      payload: {
        commitSha,
        branch,
        featureSlug,
        paths,
      },
    });

    return commitSha;
  } finally {
    releaseLock(lockKey, instanceId);
  }
}

// --- Intent handlers ---

async function handleEditIntent(payload: EditIntentPayload) {
  console.log(`[${SERVICE_NAME}] Edit intent: ${payload.op} ${payload.path}`);
  // In production: batch edits and apply under lock
}

async function handleAcquireCheckout(payload: AcquireCheckoutPayload) {
  console.log(`[${SERVICE_NAME}] Checkout request: ${payload.instanceId} → ${payload.branch}`);

  const commitSha = await applyEditBatch(payload.batch, payload.instanceId, payload.branch, payload.featureSlug);

  if (!commitSha) {
    console.log(`[${SERVICE_NAME}] Checkout denied for ${payload.instanceId}`);
  }
}

// --- Start bus subscription ---

async function startBus() {
  await bus.connect();
  console.log(`[${SERVICE_NAME}] Connected to Redis`);

  await Promise.all([
    bus.subscribe("intents:edit-intent", SERVICE_NAME, `${SERVICE_NAME}-1`, async (envelope) => {
      await handleEditIntent(envelope.payload as EditIntentPayload);
    }),
    bus.subscribe("intents:acquire-checkout", SERVICE_NAME, `${SERVICE_NAME}-2`, async (envelope) => {
      await handleAcquireCheckout(envelope.payload as AcquireCheckoutPayload);
    }),
  ]);
}

// --- HTTP API ---

async function getLocks(req: Request): Promise<Response> {
  const lockList = Array.from(locks.entries()).map(([resource, state]) => ({
    resource,
    holder: state.holder,
    expiresAt: new Date(state.expiresAt).toISOString(),
    expired: state.expiresAt <= Date.now(),
  }));

  return Response.json({ locks: lockList, count: lockList.length });
}

async function submitEdit(req: Request): Promise<Response> {
  const body = await req.json() as {
    instanceId: string;
    branch: string;
    featureSlug: string;
    edits: EditIntentPayload[];
  };

  const commitSha = await applyEditBatch(body.edits, body.instanceId, body.branch, body.featureSlug);

  return Response.json({
    success: true,
    commitSha,
    editsApplied: body.edits.length,
  });
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
        return Response.json({
          service: SERVICE_NAME,
          status: redisOk ? "ok" : "degraded",
          port: PORT,
          activeLocks: locks.size,
          lockTtlMs: LOCK_TTL_MS,
          redis: redisOk ? "connected" : "disconnected",
        });
      }

      if (url.pathname === "/locks" && req.method === "GET") {
        return getLocks(req);
      }

      if (url.pathname === "/edit" && req.method === "POST") {
        return submitEdit(req);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
