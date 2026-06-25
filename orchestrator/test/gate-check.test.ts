/**
 * team1 Orchestrator — Phase Gate Check Test (M4)
 *
 * Verifies lifecycle-management evaluates phase gates, records history,
 * and advances current phase when both gates pass.
 */

import { describe, it, expect } from "bun:test";

const API_URL = "http://localhost:3104";

async function isApiUp(): Promise<boolean> {
  try {
    const resp = await fetch(`${API_URL}/healthz`, { signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch {
    return false;
  }
}

const apiUp = await isApiUp();

describe.skipIf(!apiUp)("Phase Gate Check (M4)", () => {
  const featureSlug = `m4-test-${Date.now()}`;

  it("returns a successful verdict when artifact and MBO gates pass", async () => {
    const resp = await fetch(`${API_URL}/phase/gate-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        check: {
          featureSlug,
          instanceId: "@architect-agent-2",
          phase: "2",
          artifactsProduced: ["docs/adr/0001-test.md"],
          mboMetrics: [],
          plannedGaps: [],
        },
        lensScores: [
          { lens: "ceo", reviewerInstance: "@manager-1", score: 8, rationale: "Good" },
          { lens: "eng", reviewerInstance: "@architect-agent-2", score: 8, rationale: "Solid" },
          { lens: "design", reviewerInstance: "@uiux-agent-1", score: 8, rationale: "Good" },
          { lens: "dx", reviewerInstance: "@lead-dev-1", score: 8, rationale: "Good" },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });

    expect(resp.ok).toBe(true);
    const body = await resp.json();
    expect(body.passed).toBe(true);
    expect(body.nextPhase).toBe("3");
  });
});
