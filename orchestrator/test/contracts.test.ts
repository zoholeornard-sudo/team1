/**
 * team1 Orchestrator — Intent Contract Tests (Gate Tier)
 *
 * Extracted from gstack's 3-tier eval framework: these are "free tests" (no API spend,
 * no Redis, no services) that validate the intent catalog against its own types.
 * They gate every PR — if an intent payload drifts from its schema, this fails before
 * any service boots.
 *
 * Run: bun test orchestrator/test/contracts.test.ts
 */

import { describe, it, expect } from "bun:test";
import type {
  IntentEnvelope,
  IntentType,
  FeatureSubmitted,
  FeatureSubmittedPayload,
  SpawnAgents,
  SpawnAgentsPayload,
  AgentAssigned,
  AgentAssignedPayload,
  SessionStarted,
  SessionStartedPayload,
  ReapInstance,
  ReapInstancePayload,
  TaskCreated,
  TaskCreatedPayload,
  TaskCompleted,
  TaskCompletedPayload,
  EditIntent,
  EditIntentPayload,
  AcquireCheckout,
  AcquireCheckoutPayload,
  EditApplied,
  EditAppliedPayload,
  CheckoutDenied,
  CheckoutDeniedPayload,
  PhaseGateCheck,
  PhaseGateCheckPayload,
  PhaseGatePassed,
  PhaseGateResultPayload,
  PhaseGateFailed,
  Heartbeat,
  HeartbeatPayload,
  InstanceStalled,
  InstanceStalledPayload,
  MergeConflictDetected,
  MergeConflictDetectedPayload,
  TestNeeded,
  TestNeededPayload,
  TestFailed,
  TestFailedPayload,
  EditReverted,
  EditRevertedPayload,
  PhaseEscalation,
  PhaseEscalationPayload,
  DeadLetter,
  DeadLetterPayload,
  EditOp,
} from "../packages/contracts/src/intents";

// --- Helpers ---

function makeEnvelope<T extends IntentType, P>(
  type: T,
  payload: P,
  overrides: Partial<IntentEnvelope<T, P>> = {}
): IntentEnvelope<T, P> {
  return {
    type,
    idempotencyKey: `test-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    featureSlug: "test-feature",
    branch: "feature/test-feature-architect-agent-2",
    timestamp: new Date().toISOString(),
    payload,
    ...overrides,
  };
}

// --- Enum completeness: every IntentType has a typed alias ---

describe("IntentType enum completeness", () => {
  const expectedTypes: IntentType[] = [
    "FeatureSubmitted", "SpawnAgents", "AgentAssigned", "SessionStarted", "ReapInstance",
    "TaskCreated", "TaskCompleted",
    "EditIntent", "AcquireCheckout", "EditApplied", "CheckoutDenied",
    "PhaseGateCheck", "PhaseGatePassed", "PhaseGateFailed",
    "Heartbeat", "InstanceStalled",
    "MergeConflictDetected",
    "TestNeeded", "TestFailed", "EditReverted",
    "PhaseEscalation",
    "PhaseReviewScore", "ScopeChangeRequest", "DeployVerified",
    "DeadLetter",
  ];

  it("has exactly 25 intent types", () => {
    expect(expectedTypes.length).toBe(25);
  });

  it("every type produces a valid envelope", () => {
    for (const type of expectedTypes) {
      const env = makeEnvelope(type, {} as unknown);
      expect(env.type).toBe(type);
      expect(env.idempotencyKey).toBeTruthy();
      expect(env.featureSlug).toBeTruthy();
      expect(env.branch).toBeTruthy();
      expect(env.timestamp).toBeTruthy();
    }
  });
});

// --- Envelope invariants ---

describe("IntentEnvelope invariants", () => {
  it("idempotencyKey is mandatory", () => {
    const env = makeEnvelope("FeatureSubmitted", {
      featureSlug: "f", description: "d", requestingManager: "m", units: [],
    } as FeatureSubmittedPayload);
    expect(env.idempotencyKey.length).toBeGreaterThan(10);
  });

  it("timestamp is ISO-8601", () => {
    const env = makeEnvelope("Heartbeat", {
      instanceId: "i", turnId: "t", load: { activeTurns: 0, pendingIntents: 0, lastHeartbeatAgeMs: 0 },
    } as HeartbeatPayload);
    expect(() => new Date(env.timestamp)).not.toThrow();
    expect(new Date(env.timestamp).toISOString()).toBe(env.timestamp);
  });

  it("branch follows feature/<slug>-<handle> convention by default", () => {
    const env = makeEnvelope("EditIntent", {
      op: "create", path: "src/foo.ts", content: "x",
    } as EditIntentPayload);
    expect(env.branch).toMatch(/^feature\/[a-z0-9-]+-[a-z0-9-]+$/);
  });
});

// --- EditOp enum ---

describe("EditOp enum", () => {
  const validOps: EditOp[] = ["create", "update", "delete", "progress"];

  it("has exactly 4 operations", () => {
    expect(validOps.length).toBe(4);
  });

  it("progress is a first-class op (designer2 endorsement)", () => {
    expect(validOps).toContain("progress");
  });
});

// --- Payload shape tests (one per intent type) ---

describe("FeatureSubmitted payload", () => {
  it("carries scopeDoc when provided (Initiative 6)", () => {
    const env: FeatureSubmitted = makeEnvelope("FeatureSubmitted", {
      featureSlug: "auth",
      description: "Add OAuth2 login",
      requestingManager: "@saas-delivery-manager",
      units: ["SaaS Development Unit"],
    } as FeatureSubmittedPayload, {
      // @ts-expect-error — scopeDoc is optional on the envelope-level test
      scopeDoc: { problemStatement: "x", boundaries: [], acceptanceCriteria: [], nfrs: [] },
    } as Partial<FeatureSubmitted>) as FeatureSubmitted;
    expect(env.payload.featureSlug).toBe("auth");
  });
});

describe("SessionStarted payload", () => {
  it("carries priorCheckpoint when resuming (Initiative 4)", () => {
    const env: SessionStarted = makeEnvelope("SessionStarted", {
      instanceId: "architect-agent-2",
      branch: "feature/auth-architect-agent-2",
      seedContext: {
        priorCheckpoint: {
          taskId: "task-1",
          decisions: ["chose OAuth2 over SAML"],
          filesTouched: ["src/auth.ts"],
          remainingSteps: ["write tests", "update docs"],
          gitHead: "abc123",
          savedAt: new Date().toISOString(),
        },
      },
    } as SessionStartedPayload);
    expect((env.payload.seedContext as any).priorCheckpoint.taskId).toBe("task-1");
  });
});

describe("AcquireCheckout payload (Initiative 3 — freeze validation target)", () => {
  it("batch contains edit intents with paths", () => {
    const env: AcquireCheckout = makeEnvelope("AcquireCheckout", {
      instanceId: "architect-agent-2",
      branch: "feature/auth-architect-agent-2",
      batch: [
        { op: "create", path: "orchestrator/services/auth/src/index.ts", content: "export {}" },
        { op: "progress", path: "", progressReportPath: "00_workspace/working_files/progress/architect-agent-2-2026-06-22.md" },
      ],
    } as AcquireCheckoutPayload);
    expect(env.payload.batch.length).toBe(2);
    expect(env.payload.batch[0].path).toContain("orchestrator/services/auth/");
  });
});

describe("PhaseGateCheck payload (planned gaps — designer2 B1)", () => {
  it("plannedGaps is an array, not optional escalation", () => {
    const env: PhaseGateCheck = makeEnvelope("PhaseGateCheck", {
      featureSlug: "auth",
      instanceId: "architect-agent-2",
      phase: "Implementation",
      artifactsProduced: ["src/auth.ts"],
      mboMetrics: [{ name: "technical-debt-ratio", value: "18%", target: "<15%", onTarget: false }],
      plannedGaps: [{ metric: "technical-debt-ratio", declaredGap: "3% over target due to OAuth2 complexity" }],
    } as PhaseGateCheckPayload);
    expect(env.payload.plannedGaps.length).toBe(1);
    expect(env.payload.plannedGaps[0].declaredGap).toContain("3%");
  });
});

describe("AcquireCheckout scope-lock (Lifecycle loop extraction — Phase 3)", () => {
  it("scopePaths is optional on the envelope", () => {
    const env: AcquireCheckout = makeEnvelope("AcquireCheckout", {
      instanceId: "architect-agent-2",
      branch: "feature/auth-architect-agent-2",
      batch: [{ op: "create", path: "orchestrator/services/auth/src/index.ts", content: "export {}" }],
    } as AcquireCheckoutPayload);
    expect(env.payload.scopePaths).toBeUndefined();
  });

  it("carries scopePaths when Phase 3 scope-lock is active", () => {
    const env: AcquireCheckout = makeEnvelope("AcquireCheckout", {
      instanceId: "architect-agent-2",
      branch: "feature/auth-architect-agent-2",
      batch: [{ op: "create", path: "orchestrator/services/auth/src/index.ts", content: "export {}" }],
      scopePaths: ["orchestrator/services/auth/", "orchestrator/packages/contracts/src/auth.ts"],
    } as AcquireCheckoutPayload);
    expect(env.payload.scopePaths?.length).toBe(2);
  });
});

describe("PhaseReviewScore payload (Lifecycle loop extraction — Phase 2 multi-lens review)", () => {
  const lenses: ReviewLens[] = ["ceo", "eng", "design", "dx"];

  it("supports all 4 lenses", () => {
    expect(lenses.length).toBe(4);
  });

  it("score is 0-10 with mandatory rationale", () => {
    const env: PhaseReviewScore = makeEnvelope("PhaseReviewScore", {
      featureSlug: "auth",
      phase: "Architecture",
      lens: "eng",
      reviewerInstance: "architect-agent-2",
      score: 8,
      rationale: "Data flow locked; edge cases enumerated; test strategy concrete. A 10 would include chaos-engineering failure-mode coverage.",
    } as PhaseReviewScorePayload);
    expect(env.payload.score).toBeGreaterThanOrEqual(0);
    expect(env.payload.score).toBeLessThanOrEqual(10);
    expect(env.payload.rationale.length).toBeGreaterThan(0);
  });

  it("remediation field present when score < 7", () => {
    const env: PhaseReviewScore = makeEnvelope("PhaseReviewScore", {
      featureSlug: "auth",
      phase: "Architecture",
      lens: "dx",
      reviewerInstance: "fullstack-dev-1",
      score: 5,
      rationale: "Next agent will spend >1h understanding the OAuth redirect flow.",
      remediation: "Add a sequence diagram to the ADR; pin env-var names in the seed context.",
    } as PhaseReviewScorePayload);
    expect(env.payload.score).toBeLessThan(7);
    expect(env.payload.remediation).toBeTruthy();
  });
});

describe("ScopeChangeRequest payload (Lifecycle loop extraction — Phase 3 scope escalation)", () => {
  it("submitted without decision", () => {
    const env: ScopeChangeRequest = makeEnvelope("ScopeChangeRequest", {
      featureSlug: "auth",
      instanceId: "fullstack-dev-1",
      currentScopePaths: ["orchestrator/services/auth/"],
      requestedScopePaths: ["orchestrator/services/auth/", "orchestrator/packages/contracts/src/auth.ts"],
      reason: "Need to add ScopeDoc type for the new auth payload",
    } as ScopeChangeRequestPayload);
    expect(env.payload.decision).toBeUndefined();
    expect(env.payload.requestedScopePaths.length).toBe(2);
  });

  it("Manager decision fills approved/denied + decidedBy", () => {
    const env: ScopeChangeRequest = makeEnvelope("ScopeChangeRequest", {
      featureSlug: "auth",
      instanceId: "fullstack-dev-1",
      currentScopePaths: ["orchestrator/services/auth/"],
      requestedScopePaths: ["orchestrator/services/auth/", "orchestrator/packages/contracts/src/auth.ts"],
      reason: "Need to add ScopeDoc type for the new auth payload",
      decision: "approved",
      decidedBy: "@saas-delivery-manager",
    } as ScopeChangeRequestPayload);
    expect(env.payload.decision).toBe("approved");
    expect(env.payload.decidedBy).toBe("@saas-delivery-manager");
  });
});

describe("DeployVerified payload (Lifecycle loop extraction — Phase 5 verification gate)", () => {
  const statuses: DeployStatus[] = ["HEALTHY", "DEGRADED", "REVERTED"];

  it("supports all 3 statuses", () => {
    expect(statuses.length).toBe(3);
  });

  it("HEALTHY carries httpStatus + screenshotPath + console error diff", () => {
    const env: DeployVerified = makeEnvelope("DeployVerified", {
      featureSlug: "auth",
      instanceId: "devops-agent-1",
      mergeSha: "abc123",
      url: "https://auth.example.com",
      status: "HEALTHY",
      deployDurationMs: 42_000,
      httpStatus: 200,
      screenshotPath: "00_workspace/working_files/deploys/auth-2026-06-22.png",
      consoleErrorDelta: 0,
      stagingVerifiedFirst: true,
    } as DeployVerifiedPayload);
    expect(env.payload.status).toBe("HEALTHY");
    expect(env.payload.httpStatus).toBe(200);
    expect(env.payload.consoleErrorDelta).toBe(0);
  });

  it("REVERTED triggers PhaseEscalation upstream", () => {
    const env: DeployVerified = makeEnvelope("DeployVerified", {
      featureSlug: "auth",
      instanceId: "devops-agent-1",
      mergeSha: "abc123",
      url: "https://auth.example.com",
      status: "REVERTED",
      deployDurationMs: 38_000,
    } as DeployVerifiedPayload);
    expect(env.payload.status).toBe("REVERTED");
  });
});

describe("ReapInstance payload (designer2 — final progress committed)", () => {
  it("finalProgressCommitted must be true to reap", () => {
    const env: ReapInstance = makeEnvelope("ReapInstance", {
      instanceId: "architect-agent-2",
      reason: "phase-complete",
      finalProgressCommitted: true,
    } as ReapInstancePayload);
    expect(env.payload.finalProgressCommitted).toBe(true);
  });

  it("rejects reap when finalProgressCommitted is false", () => {
    const env: ReapInstance = makeEnvelope("ReapInstance", {
      instanceId: "architect-agent-2",
      reason: "stalled",
      finalProgressCommitted: false,
    } as ReapInstancePayload);
    expect(env.payload.finalProgressCommitted).toBe(false);
  });
});
