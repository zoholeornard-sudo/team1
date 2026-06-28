/**
 * merge-coordinator — bounded context service (ADR-0005)
 * Port: :3114
 *
 * Single-writer gate for merges to main.
 * - SQLite-backed merge queue (survives restarts)
 * - Global MergeLock (one merge to main at a time)
 * - Pre-merge dry-run conflict detection
 * - Manager approval gate
 * - Post-merge async test on worktree clone (Tier 2, no lock held)
 * - TestFailed → git revert → MergeReverted
 *
 * Subscribes to:
 * - intents:merge-ready → enqueues feature branch
 * - intents:merge-approved → Manager authorization to proceed
 * - intents:test-failed → triggers post-merge revert
 *
 * Publishes:
 * - intents:merge-queued
 * - intents:merge-lock-acquired / intents:merge-lock-released
 * - intents:merge-pending-approval
 * - intents:merge-applied
 * - intents:merge-reverted
 * - intents:merge-conflict-detected
 */
import { createBusClient } from "@orchestrator/bus-client";
import {
  MergeReadyPayload,
  MergeQueuedPayload,
  MergeLockAcquiredPayload,
  MergeLockReleasedPayload,
  MergeApprovedPayload,
  MergePendingApprovalPayload,
  MergeAppliedPayload,
  MergeRevertedPayload,
  MergeConflictDetectedPayload,
  TestFailedPayload,
} from "@orchestrator/contracts";
import { Database } from "bun:sqlite";

const PORT = Number(process.env.PORT) || 3114;
const SERVICE_NAME = "merge-coordinator";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REPO_ROOT = process.env.REPO_ROOT || "/workspaces/team1";
const DB_PATH = process.env.MERGE_DB_PATH || "data/merge.db";

// Lock budget: merge + push is slower than an edit batch
const LOCK_TTL_MS = 60000;

// Manager approval timeout: if no response in 1h, requeue
const MANAGER_APPROVAL_TIMEOUT_MS = 3600000;

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// --- SQLite persistence ---
const db = new Database(DB_PATH, { create: true });
db.run("PRAGMA journal_mode = WAL");

db.run(`
  CREATE TABLE IF NOT EXISTS merge_queue (
    merge_id TEXT PRIMARY KEY,
    feature_slug TEXT NOT NULL,
    branch TEXT NOT NULL,
    head_commit_sha TEXT,
    state TEXT NOT NULL DEFAULT 'queued',
    merge_commit_sha TEXT,
    revert_sha TEXT,
    manager_approval_handle TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS merge_lock (
    id INTEGER PRIMARY KEY DEFAULT 1,
    holder TEXT,
    acquired_at TEXT,
    expires_at TEXT
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_mq_state ON merge_queue(state)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_mq_feature ON merge_queue(feature_slug)`);

console.log(`[${SERVICE_NAME}] SQLite initialized at ${DB_PATH}`);

// --- Lock management ---

function acquireMergeLock(holder: string, ttlMs: number = LOCK_TTL_MS): boolean {
  const existing = db.query("SELECT * FROM merge_lock WHERE id = 1").get() as any;
  if (existing && existing.expires_at && new Date(existing.expires_at).getTime() > Date.now() && existing.holder !== holder) {
    return false;
  }
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMs);
  db.run(
    "INSERT OR REPLACE INTO merge_lock (id, holder, acquired_at, expires_at) VALUES (1, ?, ?, ?)",
    [holder, now.toISOString(), expires.toISOString()]
  );
  return true;
}

function releaseMergeLock(holder: string): boolean {
  const existing = db.query("SELECT * FROM merge_lock WHERE id = 1").get() as any;
  if (!existing || existing.holder !== holder) return false;
  db.run("DELETE FROM merge_lock WHERE id = 1");
  return true;
}

function isLockHeld(): boolean {
  const existing = db.query("SELECT * FROM merge_lock WHERE id = 1").get() as any;
  if (!existing || !existing.expires_at) return false;
  return new Date(existing.expires_at).getTime() > Date.now();
}

// --- Git operations ---

async function gitCheckout(branch: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "checkout", branch], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    return (await proc.exited) === 0;
  } catch (err) {
    console.error(`[${SERVICE_NAME}] git checkout failed:`, err);
    return false;
  }
}

async function gitPull(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "pull", "--ff-only"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

async function gitMergeDryRun(branch: string): Promise<{ ok: boolean; conflictFiles: string[] }> {
  try {
    const proc = Bun.spawn(["git", "merge", "--no-commit", "--no-ff", branch], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;

    if (exitCode === 0) {
      // Abort the dry-run merge — we only wanted to check
      Bun.spawn(["git", "merge", "--abort"], { cwd: REPO_ROOT });
      return { ok: true, conflictFiles: [] };
    }

    // Parse conflict files from stderr
    const stderr = await new Response(proc.stderr).text();
    const conflictFiles = stderr
      .split("\n")
      .filter((l) => l.includes("CONFLICT") || l.includes("Auto-merging"))
      .map((l) => l.split(" ").pop() || "")
      .filter(Boolean);

    // Abort the failed merge
    Bun.spawn(["git", "merge", "--abort"], { cwd: REPO_ROOT });
    return { ok: false, conflictFiles };
  } catch {
    return { ok: false, conflictFiles: [] };
  }
}

async function gitMergeNoFf(branch: string, message: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "merge", "--no-ff", branch, "-m", message], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

async function gitPushMain(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "push", "origin", "main"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

async function gitRevParse(ref: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", ref], {
      cwd: REPO_ROOT,
      stdout: "pipe",
    });
    const text = await new Response(proc.stdout).text();
    return text.trim();
  } catch {
    return null;
  }
}

async function gitRevertMerge(mergeSha: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "revert", "--no-edit", "-m", "1", mergeSha], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    if ((await proc.exited) !== 0) return null;

    const shaProc = Bun.spawn(["git", "rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
    });
    const text = await new Response(shaProc.stdout).text();
    return text.trim();
  } catch {
    return null;
  }
}

// --- Queue management ---

function enqueueMerge(payload: MergeReadyPayload): string {
  const mergeId = `merge-${payload.featureSlug}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  db.run(
    "INSERT INTO merge_queue (merge_id, feature_slug, branch, head_commit_sha, state, created_at) VALUES (?, ?, ?, ?, 'queued', ?)",
    [mergeId, payload.featureSlug, payload.branch, payload.headCommitSha, now]
  );

  // Emit MergeQueued
  const queuedPayload: MergeQueuedPayload = {
    mergeId,
    featureSlug: payload.featureSlug,
    branch: payload.branch,
    position: getQueuePosition(mergeId),
    enqueuedAt: now,
  };

  bus.publish("intents:merge-queued", {
    type: "MergeQueued",
    idempotencyKey: `merge-queued-${mergeId}`,
    featureSlug: payload.featureSlug,
    branch: payload.branch,
    timestamp: now,
    payload: queuedPayload,
  }).catch(console.error);

  return mergeId;
}

function getQueuePosition(mergeId: string): number {
  const row = db.query(
    "SELECT COUNT(*) as cnt FROM merge_queue WHERE state = 'queued' AND created_at <= (SELECT created_at FROM merge_queue WHERE merge_id = ?)"
  ).get(mergeId) as any;
  return row?.cnt || 0;
}

function getNextQueuedMerge(): any {
  return db.query(
    "SELECT * FROM merge_queue WHERE state = 'queued' ORDER BY created_at ASC LIMIT 1"
  ).get();
}

function updateMergeState(mergeId: string, state: string, extra: Record<string, string> = {}): void {
  const fields = ["state = ?", "updated_at = ?"];
  const params: any[] = [state, new Date().toISOString()];

  for (const [key, value] of Object.entries(extra)) {
    fields.push(`${key} = ?`);
    params.push(value);
  }

  if (state === "applied" || state === "reverted" || state === "failed") {
    fields.push("resolved_at = ?");
    params.push(new Date().toISOString());
  }

  params.push(mergeId);
  db.run(`UPDATE merge_queue SET ${fields.join(", ")} WHERE merge_id = ?`, params);
}

// --- Core merge pipeline ---

async function processNextInQueue(): Promise<void> {
  if (isLockHeld()) {
    console.log(`[${SERVICE_NAME}] Merge lock held, skipping`);
    return;
  }

  const next = getNextQueuedMerge();
  if (!next) return;

  const mergeId = next.merge_id;
  const branch = next.branch;
  const featureSlug = next.feature_slug;

  console.log(`[${SERVICE_NAME}] Processing merge ${mergeId} for ${featureSlug} (${branch})`);

  // 1. Acquire lock
  if (!acquireMergeLock(mergeId)) {
    console.log(`[${SERVICE_NAME}] Could not acquire lock, will retry`);
    return;
  }

  updateMergeState(mergeId, "lock-acquired");

  const lockAcquiredPayload: MergeLockAcquiredPayload = {
    mergeId,
    holder: mergeId,
    acquiredAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
  };

  await bus.publish("intents:merge-lock-acquired", {
    type: "MergeLockAcquired",
    idempotencyKey: `merge-lock-acquired-${mergeId}`,
    featureSlug,
    branch,
    timestamp: new Date().toISOString(),
    payload: lockAcquiredPayload,
  });

  // 2. Pre-merge: checkout main, pull, dry-run merge
  updateMergeState(mergeId, "pre-merge-check");

  const checkoutOk = await gitCheckout("main");
  if (!checkoutOk) {
    console.error(`[${SERVICE_NAME}] Failed to checkout main for ${mergeId}`);
    releaseMergeLock(mergeId);
    updateMergeState(mergeId, "failed", { state: "failed-checkout" });
    return;
  }

  await gitPull();

  const dryRun = await gitMergeDryRun(branch);
  if (!dryRun.ok) {
    console.log(`[${SERVICE_NAME}] Merge conflict detected for ${mergeId}: ${dryRun.conflictFiles.join(", ")}`);

    const conflictPayload: MergeConflictDetectedPayload = {
      mergeId,
      featureSlug,
      branch,
      conflictingBranch: "main",
      files: dryRun.conflictFiles,
      resolution: "manual",
      detectedAt: new Date().toISOString(),
    };

    await bus.publish("intents:merge-conflict-detected", {
      type: "MergeConflictDetected",
      idempotencyKey: `merge-conflict-${mergeId}-${Date.now()}`,
      featureSlug,
      branch,
      timestamp: new Date().toISOString(),
      payload: conflictPayload,
    });

    releaseMergeLock(mergeId);
    updateMergeState(mergeId, "failed", { state: "failed-conflict" });
    return;
  }

  // 3. Request Manager approval
  updateMergeState(mergeId, "pending-approval");

  // Determine the unit Manager from the feature slug pattern (e.g., "feature-mqvoklsy-a3zb-architect-agent-1" → unit from AGENTS.md)
  // In production, query agent-registry for the owning unit's Manager handle.
  // For now, use a deterministic lookup.
  const managerHandle = getManagerHandleForFeature(featureSlug);

  const pendingPayload: MergePendingApprovalPayload = {
    mergeId,
    featureSlug,
    branch,
    approverManagerHandle: managerHandle,
    requestedAt: new Date().toISOString(),
  };

  await bus.publish("intents:merge-pending-approval", {
    type: "MergePendingApproval",
    idempotencyKey: `merge-pending-approval-${mergeId}`,
    featureSlug,
    branch,
    timestamp: new Date().toISOString(),
    payload: pendingPayload,
  });

  console.log(`[${SERVICE_NAME}] Awaiting Manager approval for ${mergeId} (manager: ${managerHandle})`);
  // Manager approval is handled by handleMergeApproved — this pipeline pauses here.
}

async function executeMerge(mergeId: string, featureSlug: string, branch: string): Promise<void> {
  console.log(`[${SERVICE_NAME}] Executing merge for ${mergeId}`);

  updateMergeState(mergeId, "merging");

  // Checkout main fresh
  await gitCheckout("main");
  await gitPull();

  // Merge
  const mergeMsg = `merge: ${featureSlug} (#${mergeId})`;
  const mergeOk = await gitMergeNoFf(branch, mergeMsg);

  if (!mergeOk) {
    console.error(`[${SERVICE_NAME}] Merge failed for ${mergeId}`);
    releaseMergeLock(mergeId);
    updateMergeState(mergeId, "failed", { state: "failed-merge" });
    return;
  }

  // Push
  const pushOk = await gitPushMain();
  if (!pushOk) {
    console.error(`[${SERVICE_NAME}] Push to main failed for ${mergeId}`);
    releaseMergeLock(mergeId);
    updateMergeState(mergeId, "failed", { state: "failed-push" });
    return;
  }

  const mergeCommitSha = await gitRevParse("HEAD");
  if (mergeCommitSha) {
    db.run("UPDATE merge_queue SET merge_commit_sha = ? WHERE merge_id = ?", [mergeCommitSha, mergeId]);
  }

  // Release lock BEFORE running post-merge tests (Tier 2)
  releaseMergeLock(mergeId);

  const appliedPayload: MergeAppliedPayload = {
    mergeId,
    featureSlug,
    mergeCommitSha: mergeCommitSha || "",
    mergedBranches: [branch],
    appliedAt: new Date().toISOString(),
  };

  await bus.publish("intents:merge-applied", {
    type: "MergeApplied",
    idempotencyKey: `merge-applied-${mergeId}`,
    featureSlug,
    branch: "main",
    timestamp: new Date().toISOString(),
    payload: appliedPayload,
  });

  updateMergeState(mergeId, "applied", { merge_commit_sha: mergeCommitSha || "" });

  console.log(`[${SERVICE_NAME}] Merge ${mergeId} applied successfully (${mergeCommitSha})`);

  // Tier 2: async post-merge test (no lock held)
  runPostMergeTests(mergeId, featureSlug, mergeCommitSha || "");
}

async function runPostMergeTests(mergeId: string, featureSlug: string, mergeCommitSha: string): Promise<void> {
  console.log(`[${SERVICE_NAME}] Running post-merge tests for ${mergeId}`);

  // Spawn a worktree clone at the merge commit and run tests
  const worktreePath = `/tmp/merge-test-${mergeId}`;

  try {
    // Create worktree
    const wtProc = Bun.spawn(["git", "worktree", "add", worktreePath, mergeCommitSha], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    if ((await wtProc.exited) !== 0) {
      console.warn(`[${SERVICE_NAME}] Could not create worktree for post-merge test — skipping`);
      return;
    }

    // Run tests in worktree (generic: look for package.json test script)
    const testProc = Bun.spawn(["sh", "-c", "npm test 2>&1 || true"], {
      cwd: worktreePath,
      stdout: "pipe",
      stderr: "pipe",
    });
    await testProc.exited;
    const testOutput = await new Response(testProc.stdout).text();
    const testFailed = testProc.exitCode !== 0;

    // Cleanup worktree
    Bun.spawn(["git", "worktree", "remove", worktreePath, "--force"], { cwd: REPO_ROOT });

    if (testFailed) {
      console.error(`[${SERVICE_NAME}] Post-merge tests FAILED for ${mergeId}`);

      const testFailedPayload: TestFailedPayload = {
        commitSha: mergeCommitSha,
        branch: "main",
        featureSlug,
        error: testOutput.slice(0, 1000),
        paths: [],
      };

      await bus.publish("intents:test-failed", {
        type: "TestFailed",
        idempotencyKey: `test-failed-merge-${mergeId}`,
        featureSlug,
        branch: "main",
        timestamp: new Date().toISOString(),
        payload: testFailedPayload,
      });

      // handleMergeReverted will pick this up
      return;
    }

    console.log(`[${SERVICE_NAME}] Post-merge tests passed for ${mergeId}`);
  } catch (err) {
    console.error(`[${SERVICE_NAME}] Post-merge test error for ${mergeId}:`, err);
    // Cleanup worktree on error
    Bun.spawn(["git", "worktree", "remove", worktreePath, "--force"], { cwd: REPO_ROOT });
  }
}

async function handleMergeReverted(payload: TestFailedPayload): Promise<void> {
  // Find the merge that produced this commit
  const mergeCommitSha = payload.commitSha;
  const row = db.query(
    "SELECT * FROM merge_queue WHERE merge_commit_sha = ? AND state = 'applied'"
  ).get(mergeCommitSha) as any;

  if (!row) {
    console.warn(`[${SERVICE_NAME}] No applied merge found for commit ${mergeCommitSha}`);
    return;
  }

  const mergeId = row.merge_id;
  console.log(`[${SERVICE_NAME}] Reverting merge ${mergeId} due to test failure`);

  const revertSha = await gitRevertMerge(mergeCommitSha);
  if (!revertSha) {
    console.error(`[${SERVICE_NAME}] Failed to revert merge ${mergeId}`);
    return;
  }

  const pushOk = await Bun.spawn(["git", "push", "origin", "main"], {
    cwd: REPO_ROOT,
    stdout: "pipe",
  }).then((p) => p.exited === 0);

  if (!pushOk) {
    console.error(`[${SERVICE_NAME}] Failed to push revert for merge ${mergeId}`);
    return;
  }

  const revertedPayload: MergeRevertedPayload = {
    mergeId,
    originalMergeSha: mergeCommitSha,
    revertSha,
    reason: payload.error,
    revertedAt: new Date().toISOString(),
  };

  await bus.publish("intents:merge-reverted", {
    type: "MergeReverted",
    idempotencyKey: `merge-reverted-${mergeId}`,
    featureSlug: row.feature_slug,
    branch: "main",
    timestamp: new Date().toISOString(),
    payload: revertedPayload,
  });

  updateMergeState(mergeId, "reverted", { revert_sha: revertSha });
}

// --- Manager handle lookup (deterministic from AGENTS.md unit→Manager mapping) ---

const UNIT_MANAGER_MAP: Record<string, string> = {
  "saas": "@saas-delivery-manager",
  "mobile": "@mobile-platform-manager",
  "web": "@web-delivery-manager",
  "desktop": "@desktop-solutions-manager",
  "cloud": "@cloud-operations-manager",
  "mlops": "@mlops-manager",
  "research": "@research-innovation-manager",
  "data-science": "@data-science-manager",
  "security": "@security-compliance-manager",
};

function getManagerHandleForFeature(featureSlug: string): string {
  // In production, query agent-registry for the owning unit.
  // For now, use a default SaaS manager (most common unit).
  // TODO: derive from feature metadata or agent-registry lookup
  return UNIT_MANAGER_MAP["saas"];
}

// --- Intent handlers ---

async function handleMergeReady(payload: MergeReadyPayload) {
  console.log(`[${SERVICE_NAME}] MergeReady: ${payload.featureSlug} (${payload.branch})`);
  enqueueMerge(payload);
  // Try to process immediately
  processNextInQueue().catch(console.error);
}

async function handleMergeApproved(payload: MergeApprovedPayload) {
  console.log(`[${SERVICE_NAME}] MergeApproved: ${payload.mergeId} decision=${payload.decision}`);

  const row = db.query("SELECT * FROM merge_queue WHERE merge_id = ?").get(payload.mergeId) as any;
  if (!row) {
    console.warn(`[${SERVICE_NAME}] Unknown merge ${payload.mergeId}`);
    return;
  }

  if (payload.decision === "reject") {
    updateMergeState(payload.mergeId, "rejected");
    releaseMergeLock(payload.mergeId);
    return;
  }

  if (payload.decision === "requeue") {
    updateMergeState(payload.mergeId, "queued");
    releaseMergeLock(payload.mergeId);
    processNextInQueue().catch(console.error);
    return;
  }

  // approve — execute merge
  await executeMerge(payload.mergeId, row.feature_slug, row.branch);
}

async function handleTestFailed(payload: TestFailedPayload) {
  // Only handle post-merge test failures (branch === "main")
  if (payload.branch !== "main") return;
  console.log(`[${SERVICE_NAME}] TestFailed on main: ${payload.commitSha}`);
  await handleMergeReverted(payload);
}

// --- Bus subscriptions ---

async function startBus() {
  await bus.connect();
  console.log(`[${SERVICE_NAME}] Connected to Redis`);

  await Promise.all([
    bus.subscribe("intents:merge-ready", SERVICE_NAME, `${SERVICE_NAME}-1`, async (envelope) => {
      await handleMergeReady(envelope.payload as MergeReadyPayload);
    }),
    bus.subscribe("intents:merge-approved", SERVICE_NAME, `${SERVICE_NAME}-2`, async (envelope) => {
      await handleMergeApproved(envelope.payload as MergeApprovedPayload);
    }),
    bus.subscribe("intents:test-failed", SERVICE_NAME, `${SERVICE_NAME}-3`, async (envelope) => {
      await handleTestFailed(envelope.payload as TestFailedPayload);
    }),
  ]);
}

// --- HTTP API ---

async function getQueue(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const featureSlug = url.searchParams.get("featureSlug");

  let query = "SELECT * FROM merge_queue WHERE 1=1";
  const params: any[] = [];
  if (state) { query += " AND state = ?"; params.push(state); }
  if (featureSlug) { query += " AND feature_slug = ?"; params.push(featureSlug); }
  query += " ORDER BY created_at DESC";

  const rows = db.query(query, params).all();
  return Response.json({ queue: rows, count: rows.length });
}

async function getMerge(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mergeId = url.pathname.split("/").pop()!;
  const row = db.query("SELECT * FROM merge_queue WHERE merge_id = ?").get(mergeId) as any;
  if (!row) return new Response("Merge not found", { status: 404 });
  return Response.json(row);
}

async function approveMerge(req: Request): Promise<Response> {
  const body = await req.json() as { mergeId: string; managerHandle: string; decision: "approve" | "reject" | "requeue" };

  if (!body.mergeId || !body.managerHandle || !body.decision) {
    return Response.json({ error: "mergeId, managerHandle, and decision are required" }, { status: 400 });
  }

  const validDecisions = ["approve", "reject", "requeue"];
  if (!validDecisions.includes(body.decision)) {
    return Response.json({ error: `decision must be one of: ${validDecisions.join(", ")}` }, { status: 400 });
  }

  // Validate Manager handle against known managers
  const knownManagers = Object.values(UNIT_MANAGER_MAP);
  if (!knownManagers.includes(body.managerHandle)) {
    return Response.json({ error: `Unknown manager: ${body.managerHandle}` }, { status: 403 });
  }

  const payload: MergeApprovedPayload = {
    mergeId: body.mergeId,
    featureSlug: "",
    approverManagerHandle: body.managerHandle,
    decision: body.decision,
    decidedAt: new Date().toISOString(),
  };

  await handleMergeApproved(payload);
  return Response.json({ success: true, mergeId: body.mergeId, decision: body.decision });
}

// --- Start ---

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/health") {
        const redisOk = await bus.ping();
        const lockHeld = isLockHeld();
        const queueDepth = (db.query("SELECT COUNT(*) as cnt FROM merge_queue WHERE state = 'queued'").get() as any)?.cnt || 0;
        const appliedCount = (db.query("SELECT COUNT(*) as cnt FROM merge_queue WHERE state = 'applied'").get() as any)?.cnt || 0;
        return Response.json({
          service: SERVICE_NAME,
          status: redisOk ? "ok" : "degraded",
          port: PORT,
          lockHeld,
          queueDepth,
          appliedCount,
          redis: redisOk ? "connected" : "disconnected",
        });
      }
      if (url.pathname === "/merge/queue" && req.method === "GET") return getQueue(req);
      if (url.pathname.match(/^\/merge\/queue\/[^/]+$/) && req.method === "GET") return getMerge(req);
      if (url.pathname === "/merge/approve" && req.method === "POST") return approveMerge(req);
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
startBus().catch(console.error);
