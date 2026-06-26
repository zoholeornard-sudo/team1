/**
 * team1 Orchestrator — M6: Reap & History Tests
 *
 * Tests history scraper + reaping workflow.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { execa } from "execa";
import fs from "fs/promises";
import path from "path";

const REPO_ROOT = process.env.REPO_ROOT || "/home/workspace/projects/team1";
const ORCHESTRATOR_ROOT = path.join(REPO_ROOT, "orchestrator");
const LIFECYCLE_URL = "http://localhost:3104";
const API_URL = "http://localhost:3098";

async function bootServices() {
  await execa("bash", ["scripts/boot-all.sh"], { cwd: ORCHESTRATOR_ROOT });
}

async function shutdownServices() {
  await execa("bash", ["scripts/shutdown-all.sh"], { cwd: ORCHESTRATOR_ROOT }).catch(() => {});
}

async function advancePhase(featureSlug: string, phase: string) {
  await fetch(`${LIFECYCLE_URL}/phase/gate-check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      check: {
        featureSlug,
        phase,
        artifactsProduced: [],
        mboMetrics: [],
        plannedGaps: [],
      },
    }),
  });
}

describe("M6 reap & history", () => {
  beforeAll(async () => {
    await bootServices();
  }, 120000);

  afterAll(async () => {
    await shutdownServices();
  });

  it("history scraper returns feature progress from progress files", async () => {
    const featureSlug = "m6-test-" + Date.now();
    const progressDir = path.join(REPO_ROOT, "00_workspace/working_files/progress");

    // Create fake progress files on a branch
    const branch = `feature/${featureSlug}`;
    await execa("git", ["-C", REPO_ROOT, "checkout", "-b", branch, "main"]);
    await fs.mkdir(progressDir, { recursive: true });
    await fs.writeFile(
      path.join(progressDir, `test-agent-1-${featureSlug}.md`),
      "# Progress\n\n## Summary\n\nMade progress.\n"
    );
    await fs.writeFile(
      path.join(progressDir, `test-agent-2-${featureSlug}.md`),
      "# Progress\n\n## Summary\n\nAlso made progress.\n"
    );
    await execa("git", ["-C", REPO_ROOT, "add", "."]);
    await execa("git", ["-C", REPO_ROOT, "commit", "-m", `test: M6 progress ${featureSlug}`]);
    await execa("git", ["-C", REPO_ROOT, "push", "origin", branch]).catch(() => {});

    // Scrape history
    const resp = await fetch(`${API_URL}/history/${featureSlug}`);
    const body = await resp.json();

    expect(body.featureSlug).toBe(featureSlug);
    expect(body.instances.length).toBe(2);
    expect(body.instances[0].handle).toContain("test-agent");

    // Cleanup
    await execa("git", ["-C", REPO_ROOT, "checkout", "main"]);
    await execa("git", ["-C", REPO_ROOT, "branch", "-D", branch]);
  }, 30000);

  it("history scraper returns 404 for unknown feature", async () => {
    const resp = await fetch(`${API_URL}/history/nonexistent-feature-${Date.now()}`);
    expect(resp.status).toBe(404);
  });

  it("feature progresses through all 7 phases then can be considered complete", async () => {
    const featureSlug = "m6-full-" + Date.now();
    for (let p = 1; p <= 7; p++) {
      await advancePhase(featureSlug, String(p));
    }

    const resp = await fetch(`${LIFECYCLE_URL}/phase/${featureSlug}`);
    const state = await resp.json();
    expect(["complete", "7"]).includes(state.currentPhase);
  });
});
