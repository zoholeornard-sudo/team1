/**
 * edit-coordinator — bounded context service (ADR-0001, ADR-0003)
 * Port: :3106
 *
 * M3: Branch-Only Work Coordination
 * - Tier 1: git checkout + apply batch + commit + push (under Redlock, <5s budget)
 * - Tier 2: async test runner on worktree clone (no lock held)
 * - TestFailed → brief re-lock → git revert → push → EditReverted
 *
 * Subscribes to:
 * - intents:acquire-checkout → applies edit batch under lock
 * - intents:test-failed → reverts commit
 *
 * Publishes:
 * - intents:edit-applied
 * - intents:checkout-denied
 * - intents:test-needed (Tier 2 trigger)
 * - intents:edit-reverted (on test failure)
 */
import { createBusClient } from "@orchestrator/bus-client";
import {
  EditIntentPayload,
  AcquireCheckoutPayload,
  EditAppliedPayload,
  TestNeededPayload,
  TestFailedPayload,
  EditRevertedPayload,
} from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3106;
const SERVICE_NAME = "edit-coordinator";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REPO_ROOT = process.env.REPO_ROOT || "/workspaces/team1";

// Tier 1 lock budget (ms) — git ops only
const LOCK_TTL_MS = 5000;

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// --- In-memory lock state (Redlock in production with Redis) ---
const locks: Map<string, { holder: string; expiresAt: number }> = new Map();

// Metrics
let editsApplied = 0;
let editsRejected = 0;
let revertsPerformed = 0;

// --- Lock management ---

function acquireLock(resource: string, holder: string, ttlMs: number = LOCK_TTL_MS): boolean {
  const existing = locks.get(resource);
  if (existing && existing.expiresAt > Date.now() && existing.holder !== holder) {
    return false;
  }
  locks.set(resource, { holder, expiresAt: Date.now() + ttlMs });
  return true;
}

function releaseLock(resource: string, holder: string): boolean {
  const existing = locks.get(resource);
  if (!existing || existing.holder !== holder) return false;
  locks.delete(resource);
  return true;
}

// --- Git operations (using Bun.spawn for subprocess calls) ---

async function gitCheckout(branch: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "checkout", branch], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch (err) {
    console.error(`[${SERVICE_NAME}] git checkout failed:`, err);
    return false;
  }
}

async function gitAdd(paths: string[]): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "add", ...paths], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

async function gitCommit(message: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "commit", "-m", message], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;

    // Get commit SHA
    const shaProc = Bun.spawn(["git", "revparse", ["HEAD"]], {
      cwd: REPO_ROOT,
      stdout: "pipe",
    });
    const text = await new Response(shaProc.stdout).text();
    return text.trim();
  } catch {
    return null;
  }
}

async function gitPush(branch: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "push", "origin", branch], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

async function gitRevert(commitSha: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "revert", "--no-edit", commitSha], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    if ((await proc.exited) !== 0) return null;

    const shaProc = Bun.spawn(["git", "revparse", ["HEAD"]], {
      cwd: REPO_ROOT,
      stdout: "pipe",
    });
    const text = await new Response(shaProc.stdout).text();
    return text.trim();
  } catch {
    return null;
  }
}

// --- File operations ---

async function applyFileEdit(intent: EditIntentPayload): Promise<boolean> {
  const absPath = `${REPO_ROOT}/${intent.path}`;

  try {
    if (intent.op === "delete") {
      await Bun.write(absPath, ""); // Mark for deletion
      return true;
    } else {
      // create, update, progress
      if (intent.content) {
        await Bun.write(absPath, intent.content);
      }
      return true;
    }
  } catch (err) {
    console.error(`[${SERVICE_NAME}] File write failed: ${absPath}`, err);
    return false;
  }
}

// --- Tier 1: Apply edit batch under lock ---

async function applyEditBatch(
  intents: EditIntentPayload[],
  instanceId: string,
  branch: string,
  featureSlug: string
): Promise<string | null> {
  const lockKey = "locks:repo:global";

  if (!acquireLock(lockKey, instanceId)) {
    editsRejected++;
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
    // 1. Checkout branch
    const checkoutOk = await gitCheckout(branch);
    if (!checkoutOk) {
      console.warn(`[${SERVICE_NAME}] git checkout failed for ${branch}, continuing with current HEAD`);
    }

    // 2. Apply file edits
    const paths: string[] = [];
    for (const intent of intents) {
      const ok = await applyFileEdit(intent);
      if (ok) paths.push(intent.path);
    }

    // 3. Stage + commit + push
    await gitAdd(paths);

    const commitMsg = `feat(${featureSlug}): agent ${instanceId} batch update [${Date.now().toString(36)}]`;
    const commitSha = await gitCommit(commitMsg);

    if (!commitSha) {
      console.warn(`[${SERVICE_NAME}] Commit failed (possibly no changes)`);
      return `no-op-${Date.now().toString(36)}`;
    }

    await gitPush(branch);
    editsApplied++;

    // 4. Emit EditApplied
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

    // 5. Emit TestNeeded (Tier 2 trigger — async, no lock)
    const testNeededPayload: TestNeededPayload = {
      commitSha,
      branch,
      featureSlug,
      paths,
    };

    await bus.publish("intents:test-needed", {
      type: "TestNeeded",
      idempotencyKey: `test-needed-${commitSha}`,
      featureSlug,
      branch,
      timestamp: new Date().toISOString(),
      payload: testNeededPayload,
    });

    return commitSha;
  } finally {
    releaseLock(lockKey, instanceId);
  }
}

// --- Tier 2: Handle test failure → revert ---

async function handleTestFailed(payload: TestFailedPayload) {
  console.log(`[${SERVICE_NAME}] TestFailed: ${payload.commitSha} on ${payload.branch}`);

  const lockKey = "locks:repo:global";
  const holder = `revert-${payload.commitSha}`;

  if (!acquireLock(lockKey, holder, LOCK_TTL_MS)) {
    console.warn(`[${SERVICE_NAME}] Cannot acquire lock for revert — will retry`);
    return;
  }

  try {
    await gitCheckout(payload.branch);
    const revertSha = await gitRevert(payload.commitSha);

    if (revertSha) {
      await gitPush(payload.branch);
      revertsPerformed++;

      const editRevertedPayload: EditRevertedPayload = {
        originalCommitSha: payload.commitSha,
        revertCommitSha: revertSha,
        branch: payload.branch,
        featureSlug: payload.featureSlug,
        reason: payload.error,
      };

      await bus.publish("intents:edit-reverted", {
        type: "EditReverted",
        idempotencyKey: `edit-reverted-${revertSha}`,
        featureSlug: payload.featureSlug,
        branch: payload.branch,
        timestamp: new Date().toISOString(),
        payload: editRevertedPayload,
      });

      console.log(`[${SERVICE_NAME}] Reverted ${payload.commitSha} → ${revertSha}`);
    } else {
      console.error(`[${SERVICE_NAME}] Revert failed for ${payload.commitSha}`);
    }
  } finally {
    releaseLock(lockKey, holder);
  }
}

// --- Intent handlers ---

async function handleAcquireCheckout(payload: AcquireCheckoutPayload) {
  console.log(`[${SERVICE_NAME}] Checkout request: ${payload.instanceId} → ${payload.branch}`);
  await applyEditBatch(payload.batch, payload.instanceId, payload.branch, payload.featureSlug);
}

// --- Start bus subscription ---

async function startBus() {
  await bus.connect();
  console.log(`[${SERVICE_NAME}] Connected to Redis`);

  await Promise.all([
    bus.subscribe("intents:acquire-checkout", SERVICE_NAME, `${SERVICE_NAME}-1`, async (envelope) => {
      await handleAcquireCheckout(envelope.payload as AcquireCheckoutPayload);
    }),
    bus.subscribe("intents:test-failed", SERVICE_NAME, `${SERVICE_NAME}-2`, async (envelope) => {
      await handleTestFailed(envelope.payload as TestFailedPayload);
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
    success: !!commitSha,
    commitSha,
    editsApplied: commitSha ? body.edits.length : 0,
  });
}

async function getMetrics(req: Request): Promise<Response> {
  return Response.json({
    editsApplied,
    editsRejected,
    revertsPerformed,
    activeLocks: locks.size,
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
          editsApplied,
          editsRejected,
          revertsPerformed,
          activeLocks: locks.size,
          lockTtlMs: LOCK_TTL_MS,
          repoRoot: REPO_ROOT,
          redis: redisOk ? "connected" : "disconnected",
        });
      }

      if (url.pathname === "/locks" && req.method === "GET") {
        return getLocks(req);
      }

      if (url.pathname === "/edit" && req.method === "POST") {
        return submitEdit(req);
      }

      if (url.pathname === "/metrics" && req.method === "GET") {
        return getMetrics(req);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
