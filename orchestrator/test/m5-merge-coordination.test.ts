/**
 * team1 Orchestrator — Multi-Feature Merge Coordination Test (Milestone 5)
 *
 * Verifies the M5 scope (§11.3, §11.8):
 * - POST /features/:slug/dependsOn/:otherSlug declares explicit dependency
 * - GET /features/:slug/can-deploy blocks Phase 5 entry if deps unmet
 * - Cycle detection rejects A→B→A
 *
 * Requires: lifecycle-management service running (bash scripts/boot-all.sh)
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { $ } from "bun";

const LIFECYCLE_URL = "http://localhost:3104";

async function declareDependency(
  feature: string,
  dependsOn: string,
  managerToken = "test-manager-token"
) {
  return fetch(`${LIFECYCLE_URL}/features/${feature}/dependsOn/${dependsOn}`, {
    method: "POST",
    headers: { "x-manager-token": managerToken },
  });
}

async function getDependencies(feature: string) {
  const resp = await fetch(`${LIFECYCLE_URL}/features/${feature}/dependencies`);
  return resp.json();
}

async function canDeploy(feature: string) {
  const resp = await fetch(`${LIFECYCLE_URL}/features/${feature}/can-deploy`);
  return resp.json();
}

async function advancePhase(feature: string, phase: string, artifacts = true, mbo = true) {
  return fetch(`${LIFECYCLE_URL}/phase/gate-check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      check: {
        featureSlug: feature,
        phase,
        artifactsProduced: artifacts ? ["doc.md"] : [],
        mboMetrics: mbo
          ? [{ name: "coverage", value: "90%", target: "80%", onTarget: true }]
          : [{ name: "coverage", value: "50%", target: "80%", onTarget: false }],
      },
    }),
  });
}

describe("M5 multi-feature merge coordination", () => {
  beforeAll(async () => {
    await $`bash /home/workspace/projects/team1/orchestrator/scripts/boot-all.sh`.quiet();
    await new Promise((r) => setTimeout(r, 3000));
  }, 30000);

  it("declares explicit dependency via POST /features/:slug/dependsOn/:otherSlug", async () => {
    const resp = await declareDependency("m5-beta", "m5-alpha");
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.feature).toBe("m5-beta");
    expect(body.dependsOn).toBe("m5-alpha");
  });

  it("GET /features/:slug/dependencies lists declared dependencies", async () => {
    const body = await getDependencies("m5-beta");
    expect(body.feature).toBe("m5-beta");
    expect(body.dependencies).toContain("m5-alpha");
  });

  it("rejects cycle: m5-alpha → m5-beta should fail (already has beta→alpha)", async () => {
    const resp = await declareDependency("m5-alpha", "m5-beta");
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain("cycle");
  });

  it("rejects self-dependency", async () => {
    const resp = await declareDependency("m5-gamma", "m5-gamma");
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain("self");
  });

  it("requires Manager token (403 without x-manager-token)", async () => {
    const resp = await fetch(
      `${LIFECYCLE_URL}/features/m5-delta/dependsOn/m5-alpha`,
      { method: "POST" }
    );
    expect(resp.status).toBe(403);
  });

  it("can-deploy returns blocked=true when dependency not at Phase 7", async () => {
    // Use a fresh dependency chain: m5-gamma depends on m5-pending (not advanced)
    await declareDependency("m5-gamma", "m5-pending");
    const body = await canDeploy("m5-gamma");
    expect(body.canDeploy).toBe(false);
    expect(body.blockedBy.length).toBeGreaterThan(0);
    expect(body.blockedBy[0].feature).toBe("m5-pending");
  });

  it("can-deploy returns ok=true when dependency has Phase 7 = passed", async () => {
    // Advance m5-alpha through all 7 phases
    for (let p = 1; p <= 7; p++) {
      await advancePhase("m5-alpha", String(p));
    }
    await new Promise((r) => setTimeout(r, 500));
    const body = await canDeploy("m5-beta");
    expect(body.canDeploy).toBe(true);
    expect(body.blockedBy.length).toBe(0);
  });

  it("can-deploy returns ok=true for feature with no dependencies", async () => {
    const body = await canDeploy("m5-standalone");
    expect(body.canDeploy).toBe(true);
    expect(body.blockedBy.length).toBe(0);
  });

  it("GET /features/dependencies exports all dependencies", async () => {
    const resp = await fetch(`${LIFECYCLE_URL}/features/dependencies`);
    const body = await resp.json();
    expect(Array.isArray(body.dependencies)).toBe(true);
    expect(body.dependencies.length).toBeGreaterThan(0);
  });
});
