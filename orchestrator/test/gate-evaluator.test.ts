/**
 * orchestrator/test/gate-evaluator.test.ts
 *
 * M4 contract test — verifies the gate enforcer applies the aligned rule
 * correctly across all three paths (a/b/c) and the Phase 2 lens gate.
 *
 * Source: .main.lifecycle.md "Aligned rule" + lifecycle-loop-extraction.md
 * Phase 2 multi-lens review protocol.
 */

import { describe, it, expect } from "bun:test";
import {
  evaluateGate,
  buildGatePassed,
  buildGateFailed,
  type GateVerdict,
} from "../services/lifecycle-management/src/gate-evaluator";
import type { PhaseGateCheck, PhaseReviewScore } from "@team1/contracts";

function makeCheck(overrides: Partial<PhaseGateCheck["payload"]> = {}): PhaseGateCheck["payload"] {
  return {
    featureSlug: "test-feature",
    instanceId: "architect-agent-2",
    phase: "3",
    artifactsProduced: ["src/index.ts"],
    mboMetrics: [],
    plannedGaps: [],
    ...overrides,
  };
}

function makeLensScore(lens: string, score: number, remediation?: string): PhaseReviewScore["payload"] {
  return {
    featureSlug: "test-feature",
    phase: "2",
    lens: lens as PhaseReviewScore["payload"]["lens"],
    reviewerInstance: "manager-1",
    score,
    rationale: `Test score ${score} for ${lens}`,
    remediation,
  };
}

describe("GateEvaluator — artifact gate", () => {
  it("blocks when no artifacts produced", () => {
    const result = evaluateGate(makeCheck({ artifactsProduced: [] }));
    expect(result.verdict).toBe("blocked");
    expect(result.artifactGate.passed).toBe(false);
  });

  it("passes when artifacts present", () => {
    const result = evaluateGate(makeCheck({ artifactsProduced: ["src/index.ts"] }));
    expect(result.artifactGate.passed).toBe(true);
  });
});

describe("GateEvaluator — MBO gate (phases 3-7)", () => {
  it("passes when all metrics on-target (path a — remediate)", () => {
    const result = evaluateGate(makeCheck({
      phase: "3",
      mboMetrics: [
        { name: "tech-debt-ratio", value: "10", target: "<15", onTarget: true },
      ],
    }));
    expect(result.mboGate.passed).toBe(true);
    expect(result.mboGate.onTarget).toContain("tech-debt-ratio");
    expect(result.verdict).toBe("proceed");
  });

  it("passes when MBO miss is declared as planned gap (path c)", () => {
    const result = evaluateGate(makeCheck({
      phase: "3",
      mboMetrics: [
        { name: "tech-debt-ratio", value: "20", target: "<15", onTarget: false },
      ],
      plannedGaps: [
        { metric: "tech-debt-ratio", declaredGap: "Refactor legacy auth module — accepted for M3" },
      ],
    }));
    expect(result.mboGate.passed).toBe(true);
    expect(result.mboGate.declared.length).toBe(1);
    expect(result.verdict).toBe("proceed");
  });

  it("returns backward verdict when MBO miss has no declaration (path b)", () => {
    const result = evaluateGate(makeCheck({
      phase: "3",
      mboMetrics: [
        { name: "tech-debt-ratio", value: "20", target: "<15", onTarget: false },
      ],
      plannedGaps: [],
    }));
    expect(result.verdict).toBe("backward");
    expect(result.mboGate.missing).toContain("tech-debt-ratio");
  });

  it("passes with mix of on-target and declared metrics", () => {
    const result = evaluateGate(makeCheck({
      phase: "4",
      mboMetrics: [
        { name: "bug-escape-rate", value: "3", target: "<5", onTarget: true },
        { name: "test-coverage", value: "70", target: ">80", onTarget: false },
      ],
      plannedGaps: [
        { metric: "test-coverage", declaredGap: "Integration tests deferred to M4" },
      ],
    }));
    expect(result.mboGate.passed).toBe(true);
    expect(result.verdict).toBe("proceed");
  });

  it("returns backward when any metric is missing without declaration", () => {
    const result = evaluateGate(makeCheck({
      phase: "4",
      mboMetrics: [
        { name: "bug-escape-rate", value: "3", target: "<5", onTarget: true },
        { name: "test-coverage", value: "70", target: ">80", onTarget: false },
      ],
      plannedGaps: [],
    }));
    expect(result.verdict).toBe("backward");
    expect(result.mboGate.missing).toContain("test-coverage");
  });
});

describe("GateEvaluator — MBO gate (phases 1-2, no MBO)", () => {
  it("does not evaluate MBO metrics in Phase 1", () => {
    const result = evaluateGate(makeCheck({
      phase: "1",
      mboMetrics: [
        { name: "some-metric", value: "999", target: ">0", onTarget: false },
      ],
    }));
    // Phase 1 has no MBO gate — mboGate.passed should be true regardless
    expect(result.mboGate.passed).toBe(true);
  });
});

describe("GateEvaluator — lens gate (Phase 2)", () => {
  it("passes when all four lenses score >= 7", () => {
    const scores = [
      makeLensScore("ceo", 8),
      makeLensScore("eng", 9),
      makeLensScore("design", 7),
      makeLensScore("dx", 8),
    ];
    const result = evaluateGate(makeCheck({ phase: "2" }), scores);
    expect(result.lensGate.required).toBe(true);
    expect(result.lensGate.passed).toBe(true);
    expect(result.verdict).toBe("proceed");
  });

  it("blocks when any lens scores below 7 without remediation", () => {
    const scores = [
      makeLensScore("ceo", 8),
      makeLensScore("eng", 6), // below 7, no remediation
      makeLensScore("design", 7),
      makeLensScore("dx", 8),
    ];
    const result = evaluateGate(makeCheck({ phase: "2" }), scores);
    expect(result.lensGate.passed).toBe(false);
    expect(result.verdict).toBe("remedy");
  });

  it("passes when low score has accepted remediation", () => {
    const scores = [
      makeLensScore("ceo", 8),
      makeLensScore("eng", 6, "Add caching layer — accepted by Manager"),
      makeLensScore("design", 7),
      makeLensScore("dx", 8),
    ];
    const result = evaluateGate(makeCheck({ phase: "2" }), scores);
    expect(result.lensGate.passed).toBe(true);
    expect(result.verdict).toBe("proceed");
  });

  it("blocks when a lens is missing entirely", () => {
    const scores = [
      makeLensScore("ceo", 8),
      makeLensScore("eng", 9),
      // design and dx missing
    ];
    const result = evaluateGate(makeCheck({ phase: "2" }), scores);
    expect(result.lensGate.passed).toBe(false);
    expect(result.verdict).toBe("remedy");
  });

  it("does not require lenses for non-Phase-2 phases", () => {
    const result = evaluateGate(makeCheck({ phase: "3" }), []);
    expect(result.lensGate.required).toBe(false);
    expect(result.lensGate.passed).toBe(true);
  });
});

describe("GateEvaluator — combined verdicts", () => {
  it("blocked takes precedence over backward when both artifact and MBO fail", () => {
    const result = evaluateGate(makeCheck({
      artifactsProduced: [],
      phase: "3",
      mboMetrics: [
        { name: "tech-debt-ratio", value: "20", target: "<15", onTarget: false },
      ],
    }));
    expect(result.verdict).toBe("blocked");
  });

  it("lens remedy takes precedence over MBO backward", () => {
    const scores = [
      makeLensScore("ceo", 5),
      makeLensScore("eng", 6),
      makeLensScore("design", 7),
      makeLensScore("dx", 8),
    ];
    const result = evaluateGate(makeCheck({
      phase: "2",
      mboMetrics: [
        { name: "tech-debt-ratio", value: "20", target: "<15", onTarget: false },
      ],
    }), scores);
    expect(result.verdict).toBe("remedy");
  });
});

describe("GateEvaluator — intent builders", () => {
  it("buildGatePassed produces correct payload", () => {
    const evalResult = evaluateGate(makeCheck({ phase: "3" }));
    const passed = buildGatePassed(evalResult);
    expect(passed.passed).toBe(true);
    expect(passed.featureSlug).toBe("test-feature");
    expect(passed.phase).toBe("3");
  });

  it("buildGateFailed produces correct payload", () => {
    const evalResult = evaluateGate(makeCheck({
      artifactsProduced: [],
      phase: "3",
    }));
    const failed = buildGateFailed(evalResult);
    expect(failed.passed).toBe(false);
    expect(failed.reason).toContain("Artifact gate failed");
  });
});
