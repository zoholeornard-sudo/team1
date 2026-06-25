/**
 * lifecycle-management/src/gate-evaluator.ts
 *
 * The M4 gate enforcer. Consumes PhaseGateCheck intents (one per phase
 * transition request) and applies the aligned rule from .main.lifecycle.md:
 *
 *   A phase exits only when BOTH the artifact gate and the MBO gate resolve.
 *   MBO miss resolves via exactly one of:
 *     (a) remediate in-phase  — metric on-target at evaluation time
 *     (b) backward intent     — RemediationIntent to an earlier phase
 *     (c) planned-gap declaration — default-available, reviewed at Phase 7
 *
 * Phase 2 (Architecture) has an additional requirement: all four review lenses
 * (ceo, eng, design, dx) must score >= 7 (or carry accepted remediation).
 *
 * Emits PhaseGatePassed or PhaseGateFailed. Never both. Never neither.
 */

import type {
  PhaseGateCheck,
  PhaseGatePassed,
  PhaseGateFailed,
  PhaseReviewScore,
} from "@team1/contracts";

export type GateVerdict = "proceed" | "remedy" | "blocked" | "backward";

export interface GateEvaluation {
  featureSlug: string;
  phase: string;
  artifactGate: { passed: boolean; missing: string[] };
  mboGate: {
    passed: boolean;
    onTarget: string[];
    remediated: string[];
    declared: { metric: string; declaredGap: string }[];
    missing: string[];
  };
  lensGate: { required: boolean; passed: boolean; scores: PhaseReviewScore["payload"][] };
  verdict: GateVerdict;
  reason: string;
}

// Phases that require the multi-lens review (Phase 2 = Architecture).
const LENS_REQUIRED_PHASES = new Set(["2", "Architecture & Design", "architecture"]);

// Phases where MBO metrics are evaluated (3-7). Phases 1-2 have lighter MBO gates.
const MBO_PHASES = new Set([
  "3", "Implementation & Build", "implementation",
  "4", "Testing & QA", "testing",
  "5", "Deployment & Release", "deployment",
  "6", "Monitoring & Incident Response", "monitoring",
  "7", "Analysis & Feedback", "analysis",
]);

const LENS_MIN_SCORE = 7;
const REQUIRED_LENSES = ["ceo", "eng", "design", "dx"] as const;

/**
 * Evaluate a single phase gate check.
 *
 * Pure function — no I/O, no bus calls. The caller (service handler) is
 * responsible for emitting the resulting intent. This keeps the rule testable
 * in isolation (M4 contract test) without a running Redis.
 */
export function evaluateGate(
  check: PhaseGateCheck["payload"],
  priorLensScores: PhaseReviewScore["payload"][] = [],
): GateEvaluation {
  const { featureSlug, phase, artifactsProduced, mboMetrics, plannedGaps } = check;

  // --- Artifact gate: every declared artifact must be present ---
  // (The caller passes artifactsProduced as the list of artifacts the agent
  // claims to have produced. The phase contract defines required artifacts;
  // here we treat the presence of at least one artifact as the gate, and a
  // structured acceptance-criteria check happens in the task layer.)
  const artifactGate = {
    passed: artifactsProduced.length > 0,
    missing: artifactsProduced.length === 0 ? ["no artifacts declared"] : [],
  };

  // --- MBO gate: only phases 3-7 carry MBO metrics ---
  const mboGate = {
    passed: true,
    onTarget: [] as string[],
    remediated: [] as string[],
    declared: [] as { metric: string; declaredGap: string }[],
    missing: [] as string[],
  };

  if (MBO_PHASES.has(phase)) {
    for (const metric of mboMetrics) {
      if (metric.onTarget) {
        mboGate.onTarget.push(metric.name);
      } else {
        // Check if this metric has a planned-gap declaration (path c)
        const declared = plannedGaps.find((g) => g.metric === metric.name);
        if (declared) {
          mboGate.declared.push({ metric: metric.name, declaredGap: declared.declaredGap });
        } else {
          mboGate.missing.push(metric.name);
        }
      }
    }
    // MBO passes if every metric is either on-target or declared as a planned gap.
    // (Path a — remediate in-phase — is reflected as on-target at eval time.
    //  Path b — backward intent — is handled by the caller when verdict=backward.)
    mboGate.passed = mboGate.missing.length === 0;
  }

  // --- Lens gate: Phase 2 requires all four lenses >= 7 ---
  const lensGate = { required: false, passed: true, scores: priorLensScores };
  if (LENS_REQUIRED_PHASES.has(phase)) {
    lensGate.required = true;
    const byLens = new Map<string, PhaseReviewScore["payload"]>();
    for (const s of priorLensScores) {
      byLens.set(s.lens, s);
    }
    for (const lens of REQUIRED_LENSES) {
      const score = byLens.get(lens);
      if (!score) {
        lensGate.passed = false;
      } else if (score.score < LENS_MIN_SCORE && !score.remediation) {
        lensGate.passed = false;
      }
    }
  }

  // --- Verdict ---
  let verdict: GateVerdict;
  let reason: string;

  if (artifactGate.passed && mboGate.passed && lensGate.passed) {
    verdict = "proceed";
    reason = buildProceedReason(mboGate, lensGate);
  } else if (!artifactGate.passed) {
    verdict = "blocked";
    reason = `Artifact gate failed: ${artifactGate.missing.join(", ")}`;
  } else if (lensGate.required && !lensGate.passed) {
    verdict = "remedy";
    reason = "Architecture review incomplete: one or more lenses score below 7 without accepted remediation";
  } else if (!mboGate.passed) {
    // MBO miss with undeclared gaps → backward intent to the relevant phase
    verdict = "backward";
    reason = `MBO miss on: ${mboGate.missing.join(", ")}. No planned-gap declaration — backward intent required.`;
  } else {
    verdict = "blocked";
    reason = "Gate evaluation indeterminate";
  }

  return { featureSlug, phase, artifactGate, mboGate, lensGate, verdict, reason };
}

function buildProceedReason(
  mboGate: GateEvaluation["mboGate"],
  lensGate: GateEvaluation["lensGate"],
): string {
  const parts: string[] = ["artifact gate passed"];
  if (mboGate.onTarget.length > 0) {
    parts.push(`MBO on-target: ${mboGate.onTarget.join(", ")}`);
  }
  if (mboGate.declared.length > 0) {
    parts.push(`planned gaps declared: ${mboGate.declared.map((d) => d.metric).join(", ")}`);
  }
  if (lensGate.required && lensGate.passed) {
    parts.push("all review lenses >= 7");
  }
  return parts.join("; ");
}

/**
 * Build the PhaseGatePassed intent payload from a successful evaluation.
 */
export function buildGatePassed(
  evalResult: GateEvaluation,
): PhaseGatePassed["payload"] {
  return {
    featureSlug: evalResult.featureSlug,
    phase: evalResult.phase,
    passed: true,
    reason: evalResult.reason,
  };
}

/**
 * Build the PhaseGateFailed intent payload from a blocked/remedy/backward evaluation.
 */
export function buildGateFailed(
  evalResult: GateEvaluation,
): PhaseGateFailed["payload"] {
  return {
    featureSlug: evalResult.featureSlug,
    phase: evalResult.phase,
    passed: false,
    reason: evalResult.reason,
  };
}
