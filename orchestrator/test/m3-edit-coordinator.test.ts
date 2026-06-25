import { describe, it, expect, beforeAll } from "bun:test";
import { execa } from "execa";

const REPO_ROOT = process.env.REPO_ROOT || "/home/workspace/projects/team1/orchestrator";
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
    await execa("bash", ["scripts/boot-all.sh"], { cwd: REPO_ROOT });
  }, 120000);

  it("serializes writes and applies to the branch", async () => {
    const branch = "feature/m3-test";
    const path = "00_workspace/working_files/drafts/m3-scratch.md";

    const result = await applyBatch(branch, path, "hello M3\n");
    expect(result.commitSha).toBeTruthy();

    const log = await execa("git", ["-C", REPO_ROOT, "log", "--oneline", "-1", branch]);
    expect(log.stdout).toContain("feat(feature/m3-test)");
  });
});
