import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { execa } from "execa";

const REPO_ROOT = "/home/workspace/projects/team1";
const EDIT_COORDINATOR = "http://localhost:3107";

async function applyBatch(branch: string, path: string, content: string) {
  const payload = {
    type: "AcquireCheckout",
    idempotencyKey: crypto.randomUUID(),
    ts: Date.now(),
    traceId: crypto.randomUUID(),
    featureSlug: "m3-test",
    branch,
    source: "m3-test",
    payload: {
      instanceId: `test-${branch}`,
      branch,
      batch: [{ op: "update", path, content }],
      scopePaths: [path],
    },
  };

  const resp = await fetch(`${EDIT_COORDINATOR}/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    throw new Error(`apply failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

describe("M3 branch-only work coordination", () => {
  beforeAll(async () => {
    await execa("redis-cli", ["DEL", "locks:repo:global"]).catch(() => {});
    await execa("git", ["-C", REPO_ROOT, "checkout", "main"]).catch(() => {});
    await execa("git", ["-C", REPO_ROOT, "branch", "feature/m3-test"]).catch(() => {});
    await execa("git", ["-C", REPO_ROOT, "branch", "feature/m3-test-b"]).catch(() => {});
    await execa("git", ["-C", REPO_ROOT, "checkout", "main"]).catch(() => {});
  }, 30000);

  afterAll(async () => {
    await execa("git", ["-C", REPO_ROOT, "branch", "-D", "feature/m3-test"]).catch(() => {});
    await execa("git", ["-C", REPO_ROOT, "branch", "-D", "feature/m3-test-b"]).catch(() => {});
    await execa("redis-cli", ["DEL", "locks:repo:global"]).catch(() => {});
  });

  it("serializes writes and applies to the branch", async () => {
    const branch = "feature/m3-test";
    const path = "00_workspace/working_files/drafts/m3-scratch.md";

    const result = await applyBatch(branch, path, "hello M3\n");
    expect(result.commitSha).toBeTruthy();

    const log = await execa("git", ["-C", REPO_ROOT, "log", "--oneline", "-1", branch]);
    expect(log.stdout).toContain("feat(feature/m3-test)");
  }, 30000);

  it("concurrent edits on different branches serialize without collision", async () => {
    const branchA = "feature/m3-test";
    const branchB = "feature/m3-test-b";
    const pathA = "00_workspace/working_files/drafts/m3-concurrent-a.md";
    const pathB = "00_workspace/working_files/drafts/m3-concurrent-b.md";

    const [resultA, resultB] = await Promise.all([
      applyBatch(branchA, pathA, "content A\n"),
      applyBatch(branchB, pathB, "content B\n"),
    ]);

    expect(resultA.commitSha).toBeTruthy();
    expect(resultB.commitSha).toBeTruthy();
    expect(resultA.commitSha).not.toBe(resultB.commitSha);

    const logA = await execa("git", ["-C", REPO_ROOT, "log", "--oneline", "-1", branchA]);
    const logB = await execa("git", ["-C", REPO_ROOT, "log", "--oneline", "-1", branchB]);
    expect(logA.stdout).toContain("feat(feature/m3-test)");
    expect(logB.stdout).toContain("feat(feature/m3-test-b)");
  }, 30000);
});
