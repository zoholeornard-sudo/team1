/**
 * team1 Orchestrator — Spawn & Assign Test (Milestone 2)
 *
 * Tests the POST /agents/spawn endpoint:
 * - Manager authority validation
 * - Creates 3 distinct-handle instances
 * - Each instance has a git branch, progress file, and registry entry
 *
 * Requires: services running (bash scripts/boot-all.sh)
 * Run: bun test orchestrator/test/spawn.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";

const API_URL = "http://localhost:3098";
const REGISTRY_URL = "http://localhost:3106";
const REPO_ROOT = "/home/workspace/projects/team1";
const DB_PATH = `${REPO_ROOT}/orchestrator/data/registry.db`;

const TEST_FEATURE = "test-spawn-m2";
const TEST_PERSONA = "@architect-agent";
const TEST_UNIT = "SaaS Development Unit";

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
  const spawnedBranches: string[] = [];

  beforeAll(async () => {
    // Clean up any prior test data
    const db = new Database(DB_PATH, { readonly: false });
    db.run("DELETE FROM agent_instances WHERE feature_slug = ?", [TEST_FEATURE]);
    db.close();
  });

  afterAll(async () => {
    // Clean up test branches
    for (const branch of spawnedBranches) {
      try {
        const proc = Bun.spawn(["git", "branch", "-D", branch.replace("feature/", "")], {
          cwd: REPO_ROOT,
          stdout: "pipe",
          stderr: "pipe",
        });
        await proc.exited;
      } catch {}
    }
    // Clean up registry entries
    try {
      const db = new Database(DB_PATH, { readonly: false });
      db.run("DELETE FROM agent_instances WHERE feature_slug = ?", [TEST_FEATURE]);
      db.close();
    } catch {}
  });

  it("rejects spawn without manager token (403)", async () => {
    const resp = await fetch(`${API_URL}/agents/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unit: TEST_UNIT,
        personaHandle: TEST_PERSONA,
        capability: "architecture",
        count: 1,
        featureSlug: TEST_FEATURE,
      }),
    });
    expect(resp.status).toBe(403);
  });

  it("spawns 3 distinct-handle instances with branches, progress files, and registry entries", async () => {
    const resp = await fetch(`${API_URL}/agents/spawn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manager-token": "test-manager-token",
      },
      body: JSON.stringify({
        unit: TEST_UNIT,
        personaHandle: TEST_PERSONA,
        capability: "architecture",
        count: 3,
        featureSlug: TEST_FEATURE,
      }),
    });

    expect(resp.status).toBe(201);
    const body = await resp.json();
    expect(body.status).toBe("spawned");
    expect(body.instances).toHaveLength(3);

    // Verify distinct handles
    const handles = body.instances.map((i: any) => i.agentId);
    expect(handles).toContain("@architect-agent-2");
    expect(handles).toContain("@architect-agent-3");
    expect(handles).toContain("@architect-agent-4");
    expect(new Set(handles).size).toBe(3); // all unique

    // Collect branches for cleanup
    for (const inst of body.instances) {
      spawnedBranches.push(inst.branch);
    }

    // 1. Verify git branches exist
    const branchProc = Bun.spawn(["git", "branch", "-a", "--list", `feature/${TEST_FEATURE}*`], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const branchOutput = await new Response(branchProc.stdout).text();
    for (const inst of body.instances) {
      const branchName = inst.branch.replace("feature/", "");
      expect(branchOutput).toContain(branchName);
    }

    // 2. Verify progress files exist on each branch
    for (const inst of body.instances) {
      const checkoutProc = Bun.spawn(["git", "show", `${inst.branch}:${inst.progressPath}`], {
        cwd: REPO_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });
      const fileContent = await new Response(checkoutProc.stdout).text();
      const checkoutExit = await checkoutProc.exited;
      expect(checkoutExit).toBe(0);
      expect(fileContent).toContain(inst.agentId);
      expect(fileContent).toContain("Progress Report");
    }

    // 3. Verify registry entries in SQLite
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.query("SELECT * FROM agent_instances WHERE feature_slug = ? ORDER BY id").all(TEST_FEATURE);
    expect(rows).toHaveLength(3);
    const ids = rows.map((r: any) => r.id);
    expect(ids).toContain("@architect-agent-2");
    expect(ids).toContain("@architect-agent-3");
    expect(ids).toContain("@architect-agent-4");
    for (const row of rows as any[]) {
      expect(row.status).toBe("launching");
      expect(row.branch).toContain(TEST_FEATURE);
      expect(row.parent_handle).toBe(TEST_PERSONA);
    }
    db.close();

    // 4. Verify registry API returns the instances
    const regResp = await fetch(`${REGISTRY_URL}/agents`);
    const regBody = await regResp.json();
    const testInstances = regBody.instances.filter((i: any) => i.feature_slug === TEST_FEATURE);
    expect(testInstances).toHaveLength(3);
  });

  it("GET /agents returns all registered instances", async () => {
    const resp = await fetch(`${API_URL}/agents`);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.instances).toBeDefined();
    expect(Array.isArray(body.instances)).toBe(true);
    const testInstances = body.instances.filter((i: any) => i.feature_slug === TEST_FEATURE);
    expect(testInstances).toHaveLength(3);
  });
});

if (!apiUp) {
  console.log("ℹ️  Spawn tests skipped — orchestrator-api not running. Run `bash scripts/boot-all.sh` to enable.");
}
