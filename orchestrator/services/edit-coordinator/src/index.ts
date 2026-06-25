import { createClient } from "redis";
import simpleGit from "simple-git";
import fs from "fs/promises";
import { execa } from "execa";
import { BusClient } from "@team1/bus-client";
import type {
  AcquireCheckout,
  EditIntent,
  TestNeeded,
  TestFailed,
  EditReverted,
  CheckoutDenied,
  EditApplied,
  IntentEnvelope,
} from "@team1/contracts";

const SERVICE_NAME = "edit-coordinator";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REPO_ROOT = process.env.REPO_ROOT || process.cwd();
const LOCK_KEY = "locks:repo:global";
const LOCK_TTL_MS = 5000;

const redis = createClient({ url: REDIS_URL });
const bus = new BusClient({ redisUrl: REDIS_URL, serviceName: SERVICE_NAME });
const git = simpleGit({ baseDir: REPO_ROOT });

// Simple Redis-based mutex (single-instance — no Redlock quorum needed)
async function acquireLock(key: string, ttlMs: number): Promise<string> {
  const token = crypto.randomUUID();
  for (let i = 0; i < 50; i++) {
    const ok = await redis.set(key, token, { NX: true, PX: ttlMs });
    if (ok) return token;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`lock timeout: ${key}`);
}

async function releaseLock(key: string, token: string): Promise<void> {
  const script = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
  await redis.eval(script, { keys: [key], arguments: [token] }).catch(() => {});
}

function log(...args: unknown[]) {
  console.log(`[${SERVICE_NAME}]`, ...args);
}

async function main() {
  await redis.connect();
  await bus.connect();

  log("connected to Redis bus — consuming edit/test streams");

  void consumeEdits();
  void consumeTests();

  const PORT = Number(process.env.PORT) || 3107;
  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/healthz") {
        return Response.json({ status: "ok", service: SERVICE_NAME });
      }
      if (url.pathname === "/apply" && req.method === "POST") {
        const body = await req.json();
        try {
          const result = await handleAcquireCheckout(body);
          return Response.json(result);
        } catch (err: any) {
          return Response.json({ status: "error", error: err.message }, { status: 500 });
        }
      }
      return new Response("Not found", { status: 404 });
    },
  });
  log(`HTTP control endpoint on :${PORT}`);

  process.on("SIGINT", async () => {
    await redis.quit().catch(() => {});
    process.exit(0);
  });
}

async function consumeEdits() {
  await bus.ensureConsumerGroup("edit-coordination", "edit-coordinator");
  for await (const [messageId, intent] of bus.consume("edit-coordination", "edit-coordinator")) {
    try {
      if (intent.type !== "AcquireCheckout") {
        await bus.ack("edit-coordination", "edit-coordinator", messageId);
        continue;
      }
      await handleAcquireCheckout(intent as AcquireCheckout);
      await bus.ack("edit-coordination", "edit-coordinator", messageId);
    } catch (err) {
      console.error("[edit-coordinator] edit consumption error:", err);
      try { await bus.ack("edit-coordination", "edit-coordinator", messageId); } catch {}
    }
  }
}

async function consumeTests() {
  await bus.ensureConsumerGroup("edit-coordination", "edit-coordinator-tests");
  for await (const [messageId, intent] of bus.consume("edit-coordination", "edit-coordinator-tests")) {
    try {
      if (intent.type === "TestNeeded") {
        await runTier2Test(intent as TestNeeded);
      } else if (intent.type === "TestFailed") {
        await handleTestFailed(intent as TestFailed);
      }
      await bus.ack("edit-coordination", "edit-coordinator-tests", messageId);
    } catch (err) {
      console.error("[edit-coordinator] test consumption error:", err);
      try { await bus.ack("edit-coordination", "edit-coordinator-tests", messageId); } catch {}
    }
  }
}

async function handleAcquireCheckout(intent: AcquireCheckout): Promise<{ commitSha: string }> {
  const { instanceId, branch, batch, scopePaths } = intent.payload;
  const lockToken = await acquireLock(LOCK_KEY, LOCK_TTL_MS);

  try {
    const commitSha = await applyBatchUnderLock(instanceId, branch, batch, scopePaths ?? []);

    const applied: IntentEnvelope<"EditApplied", EditApplied["payload"]> = {
      type: "EditApplied",
      idempotencyKey: crypto.randomUUID(),
      ts: Date.now(),
      traceId: intent.traceId,
      featureSlug: intent.featureSlug,
      branch,
      source: SERVICE_NAME,
      payload: { instanceId, commitSha, appliedCount: batch.length },
    };
    await bus.publish(applied);

    const testNeeded: IntentEnvelope<"TestNeeded", TestNeeded["payload"]> = {
      type: "TestNeeded",
      idempotencyKey: crypto.randomUUID(),
      ts: Date.now(),
      traceId: intent.traceId,
      featureSlug: intent.featureSlug,
      branch,
      source: SERVICE_NAME,
      payload: {
        commitSha,
        branch,
        featureSlug: intent.featureSlug,
        paths: batch.map((item) => item.path),
      },
    };
    await bus.publish(testNeeded);
    return { commitSha };
  } finally {
    await releaseLock(LOCK_KEY, lockToken);
  }
}

async function applyBatchUnderLock(
  instanceId: string,
  branch: string,
  batch: EditIntent["payload"][],
  scopePaths: string[]
): Promise<string> {
  await git.checkout(branch);

  for (const intent of batch) {
    if (scopePaths.length > 0 && !scopePaths.some((prefix) => intent.path.startsWith(prefix))) {
      const denied: IntentEnvelope<"CheckoutDenied", CheckoutDenied["payload"]> = {
        type: "CheckoutDenied",
        idempotencyKey: crypto.randomUUID(),
        ts: Date.now(),
        traceId: crypto.randomUUID(),
        featureSlug: "",
        branch,
        source: SERVICE_NAME,
        payload: { instanceId, retryAfterMs: 1000, reason: "out-of-scope" },
      };
      await bus.publish(denied);
      throw new Error(`out-of-scope path: ${intent.path}`);
    }

    const abs = `${REPO_ROOT}/${intent.path}`;
    if (intent.op === "delete") {
      await fs.rm(abs, { force: true });
      await git.rm([intent.path]);
    } else if (intent.op === "create" || intent.op === "update" || intent.op === "progress") {
      await fs.mkdir(abs.substring(0, abs.lastIndexOf("/")), { recursive: true }).catch(() => {});
      await fs.writeFile(abs, intent.content ?? "", "utf8");
      await git.add([intent.path]);
    }
  }

  await git.addConfig("user.name", "Zo Computer");
  await git.addConfig("user.email", "zo@zocomputer.com");
  await git.commit(`feat(${branch}): agent batch update`);
  try {
    await git.push(["origin", branch]);
  } catch (err) {
    log("push failed (continuing with local commit):", (err as Error).message);
  }
  return (await git.revparse(["HEAD"])).trim();
}

// Tier 2: async test runner (no lock held)
async function runTier2Test(intent: TestNeeded) {
  const worktreePath = `/tmp/t1-${crypto.randomUUID()}`;
  try {
    await git.raw(["worktree", "add", "--detach", worktreePath, intent.payload.branch]);
    await execa("bun", ["test"], { cwd: worktreePath });
    log(`Tier 2 tests PASSED for ${intent.payload.commitSha}`);
  } catch (err: any) {
    const failed: IntentEnvelope<"TestFailed", TestFailed["payload"]> = {
      type: "TestFailed",
      idempotencyKey: crypto.randomUUID(),
      ts: Date.now(),
      traceId: intent.traceId,
      featureSlug: intent.featureSlug,
      branch: intent.payload.branch,
      source: SERVICE_NAME,
      payload: {
        commitSha: intent.payload.commitSha,
        branch: intent.payload.branch,
        featureSlug: intent.featureSlug,
        error: err?.stderr || err?.message || "test failed",
        paths: intent.payload.paths,
      },
    };
    await bus.publish(failed);
    log(`Tier 2 tests FAILED for ${intent.payload.commitSha}`);
  } finally {
    await execa("rm", ["-rf", worktreePath]).catch(() => {});
    await git.raw(["worktree", "prune"]).catch(() => {});
  }
}

// Revert handler: brief re-lock on TestFailed
async function handleTestFailed(intent: TestFailed) {
  const lockToken = await acquireLock(LOCK_KEY, LOCK_TTL_MS);
  try {
    await git.checkout(intent.payload.branch);
    await git.raw(["revert", "--no-edit", intent.payload.commitSha]);
    try {
      await git.push(["origin", intent.payload.branch]);
    } catch (err) {
      log("revert push failed:", (err as Error).message);
    }
    const revertCommitSha = (await git.revparse(["HEAD"])).trim();

    const reverted: IntentEnvelope<"EditReverted", EditReverted["payload"]> = {
      type: "EditReverted",
      idempotencyKey: crypto.randomUUID(),
      ts: Date.now(),
      traceId: intent.traceId,
      featureSlug: intent.featureSlug,
      branch: intent.payload.branch,
      source: SERVICE_NAME,
      payload: {
        originalCommitSha: intent.payload.commitSha,
        revertCommitSha,
        branch: intent.payload.branch,
        featureSlug: intent.featureSlug,
        reason: intent.payload.error,
      },
    };
    await bus.publish(reverted);
    log(`reverted ${intent.payload.commitSha} → ${revertCommitSha}`);
  } finally {
    await releaseLock(LOCK_KEY, lockToken);
  }
}

main().catch((err) => {
  console.error(`[${SERVICE_NAME}] fatal:`, err);
  process.exit(1);
});
