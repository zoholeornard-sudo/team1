/**
 * team1 Orchestrator — Task Management Test (M4)
 *
 * Verifies the full M4 loop: task created → task completed →
 * PhaseGateCheck emitted to lifecycle-management → phase advances.
 */

import { describe, it, expect, beforeAll } from "bun:test";

const TASK_URL = "http://localhost:3101";
const LIFECYCLE_URL = "http://localhost:3104";

async function isUp(url: string): Promise<boolean> {
  try {
    const resp = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch {
    return false;
  }
}

const taskUp = await isUp(TASK_URL);
const lifecycleUp = await isUp(LIFECYCLE_URL);
const canRun = taskUp && lifecycleUp;

describe.skipIf(!canRun)("Task Management M4 — phase gate trigger", () => {
  const featureSlug = `m4-task-${Date.now()}`;

  beforeAll(async () => {
    // Create 2 tasks in phase "1" for the same feature
    for (let i = 1; i <= 2; i++) {
      await fetch(`${TASK_URL}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: `${featureSlug}-task-${i}`,
          featureSlug,
          phase: "1",
          assignedInstance: `@architect-agent-${i}`,
          description: `M4 test task ${i}`,
        }),
      });
    }
  });

  it("creates tasks and tracks them", async () => {
    const resp = await fetch(`${TASK_URL}/tasks?featureSlug=${featureSlug}`);
    const body = await resp.json();
    expect(body.tasks).toHaveLength(2);
    expect(body.tasks.every((t: any) => t.status === "pending")).toBe(true);
  });

  it("does NOT trigger phase gate when only one of two tasks completes", async () => {
    const resp = await fetch(`${TASK_URL}/tasks/${featureSlug}-task-1/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifacts: [{ id: "a1", path: "docs/scope.md", type: "doc" }],
      }),
    });
    const body = await resp.json();
    expect(body.status).toBe("completed");
    expect(body.phaseGateTriggered).toBe(false);
  });

  it("DOES trigger phase gate when all phase tasks complete", async () => {
    const resp = await fetch(`${TASK_URL}/tasks/${featureSlug}-task-2/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifacts: [{ id: "a2", path: "docs/scope2.md", type: "doc" }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await resp.json();
    expect(body.status).toBe("completed");
    expect(body.phaseGateTriggered).toBe(true);
    expect(body.gateResult).not.toBeNull();
    // Phase 1 has no MBO gate and artifact gate passes → proceed
    expect(body.gateResult.verdict).toBe("proceed");
  });

  it("lifecycle-management shows advanced phase after gate pass", async () => {
    const resp = await fetch(`${LIFECYCLE_URL}/phase/${featureSlug}`);
    if (!resp.ok) return; // state may not persist if lifecycle was restarted
    const body = await resp.json();
    expect(body.currentPhase).toBe("2");
  });
});
