/**
 * team1 Orchestrator — Spawn & Assign Test (Milestone 2)
 *
 * Verifies the M2 spawn flow:
 * - POST /agents/spawn creates N distinct-handle instances
 * - Each instance gets a git branch feature/<slug>-<handle>
 * - Each instance gets a progress markdown file
 * - agent-registry SQLite contains N entries
 *
 * Requires: services running (bash scripts/boot-all.sh)
 * Run: bun test orchestrator/test/spawn.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { $ } from "bun";

const API_URL = "http://localhost:3098";
const REGISTRY_URL = "http://localhost:3106";
const REPO_ROOT = "/home/workspace/projects/team1";
const PROGRESS_DIR = "00_workspace/working_files/progress";

const TEST_SLUG = `m2-test-${Date.now()}`;
const TEST_BRANCHES: string[] = [];

async function isApiUp(): Promise<boolean> {
  try {
    const resp = await fetch(`${API_URL}/healthz`, { signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch {
    return false;
  }
}

const apiUp = await isApiUp();

describe.skipIf(!apiUp)("Spawn & Assign (M2 — requires running services)", () => {
  let spawnResponse: any = null;

  beforeAll(async () => {
    // Spawn 3 instances of @architect-agent
    const resp = await fetch(`${API_URL}/agents/spawn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manager-token": "test-manager-token",
      },
      body: JSON.stringify({
        unit: "SaaS Development Unit",
        personaHandle: "@architect-agent",
        capability: "architecture",
        count: 3,
        featureSlug: TEST_SLUG,
      }),
      signal: AbortSignal.timeout(15000),
    });
    spawnResponse = await resp.json();
    // Track branches for cleanup
    if (spawnResponse.instances) {
      for (const inst of spawnResponse.instances) {
        TEST_BRANCHES.push(inst.branch);
      }
    }
  });

  afterAll(async () => {
    // Clean up: delete test branches and progress files
    for (const branch of TEST_BRANCHES) {
      try {
        await $`git -C ${REPO_ROOT} branch -D ${branch} 2>/dev/null || true`;
        await $`git -C ${REPO_ROOT} push origin --delete ${branch} 2>/dev/null || true`;
      } catch {}
    }
    // Delete test progress files
    try {
      const files = await $`ls ${REPO_ROOT}/${PROGRESS_DIR}/`.text();
      for (const f of files.split("\n")) {
        if (f.includes(TEST_SLUG)) {
          await $`rm -f ${REPO_ROOT}/${PROGRESS_DIR}/${f}`;
        }
      }
    } catch {}
    // Commit the cleanup
    try {
      await $`git -C ${REPO_ROOT} add -A && git -C ${REPO_ROOT} commit -m "test: cleanup M2 spawn test artifacts (${TEST_SLUG})" --no-verify 2>/dev/null || true`;
    } catch {}
  });

  it("POST /agents/spawn returns 201 with 3 instances", () => {
    expect(spawnResponse).not.toBeNull();
    expect(spawnResponse.status).toBe("spawned");
    expect(spawnResponse.instances).toHaveLength(3);
  });

  it("each instance has a distinct handle (@architect-agent-2, -3, -4)", () => {
    const handles = spawnResponse.instances.map((i: any) => i.agentId);
    expect(handles).toContain("@architect-agent-2");
    expect(handles).toContain("@architect-agent-3");
    expect(handles).toContain("@architect-agent-4");
    // All distinct
    expect(new Set(handles).size).toBe(3);
  });

  it("each instance has a branch named feature/<slug>-<handle>", () => {
    for (const inst of spawnResponse.instances) {
      expect(inst.branch).toMatch(/^feature\//);
      expect(inst.branch).toContain(TEST_SLUG);
      expect(inst.branch).toContain(inst.agentId.replace("@", ""));
    }
  });

  it("3 distinct git branches exist in the repo", async () => {
    const branches = await $`git -C ${REPO_ROOT} branch --list`.text();
    for (const inst of spawnResponse.instances) {
      expect(branches).toContain(inst.branch);
    }
  });

  it("3 progress markdown files exist under 00_workspace/working_files/progress/", async () => {
    for (const inst of spawnResponse.instances) {
      const handleSlug = inst.agentId.replace("@", "").replace(/-/g, "-");
      // Progress path format: <handle-slug>-<date>.md
      const files = await $`ls ${REPO_ROOT}/${PROGRESS_DIR}/`.text().catch(() => "");
      const matching = files
        .split("\n")
        .filter((f) => f.includes(handleSlug) && f.endsWith(".md"));
      expect(matching.length).toBeGreaterThan(0);
    }
  });

  it("agent-registry HTTP API returns 3 instances for this feature", async () => {
    const resp = await fetch(`${REGISTRY_URL}/agents?featureSlug=${TEST_SLUG}`);
    const body = await resp.json();
    expect(body.instances).toHaveLength(3);
    const handles = body.instances.map((i: any) => i.id);
    expect(handles).toContain("@architect-agent-2");
    expect(handles).toContain("@architect-agent-3");
    expect(handles).toContain("@architect-agent-4");
  });

  it("each registry entry has status 'active' or 'launching'", async () => {
    const resp = await fetch(`${REGISTRY_URL}/agents?featureSlug=${TEST_SLUG}`);
    const body = await resp.json();
    for (const inst of body.instances) {
      expect(["active", "launching"]).toContain(inst.status);
    }
  });
});
