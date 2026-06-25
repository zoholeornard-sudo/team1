/**
 * team1 Orchestrator — Intent Catalog
 *
 * Shared contract imported by all 6 services + runtime + agent-registry + orchestrator-api.
 * Every intent carries a mandatory idempotencyKey (24h TTL dedupe per service).
 * See ADR-0002 for bus topology, ADR-0004 for the polling-agent execution model.
 */

export type IntentType =
  // Feature + spawn lifecycle
  | "FeatureSubmitted"
  | "SpawnAgents"
  | "AgentAssigned"
  | "SessionStarted"
  | "ReapInstance"
  // Task lifecycle
  | "TaskCreated"
  | "TaskCompleted"
  // Edit coordination (ADR-0003)
  | "EditIntent"
  | "AcquireCheckout"
  | "EditApplied"
  | "CheckoutDenied"
  // Lifecycle gating (ADR-0001, lifecycle-management)
  | "PhaseGateCheck"
  | "PhaseGatePassed"
  | "PhaseGateFailed"
  // Health (ADR-0001, health-monitoring)
  | "Heartbeat"
  | "InstanceStalled"
  // Cross-feature (milestone 5 — stub)
  | "MergeConflictDetected"
  // Async test coordination (v1.1.0 §11.1 — two-tier lock strategy)
  | "TestNeeded"
  | "TestFailed"
  | "EditReverted"
  // Lifecycle escalation (v1.1.0 §11.2 — backtrack counter)
  | "PhaseEscalation"
  // Bus hygiene
  | "DeadLetter";

export type EditOp = "create" | "update" | "delete" | "progress";

export interface IntentEnvelope<T extends IntentType, P = unknown> {
  type: T;
  idempotencyKey: string; // mandatory, 24h TTL dedupe
  featureSlug: string; // globally-unique kebab-case, minted by orchestrator-api
  instanceId?: string; // agent instance ID (e.g. "architect-agent-2")
  branch: string; // authoritative per-intent; defaults to feature/<slug>-<handle>
  timestamp: string; // ISO-8601 UTC
  payload: P;
}

// --- Feature + spawn ---

export interface FeatureSubmittedPayload {
  featureSlug: string;
  description: string;
  requestingManager: string; // handle of the Manager agent
  units: string[]; // units involved
}

export interface SpawnAgentsPayload {
  featureSlug: string;
  personaHandle: string; // base persona to instantiate (e.g. "@architect-agent")
  count: number;
  branchPrefix: string; // e.g. "feature/<slug>"
}

export interface AgentAssignedPayload {
  instanceId: string;
  personaHandle: string;
  featureSlug: string;
  branch: string;
  taskPayload: TaskCreatedPayload; // injected into first turn's seed context (ADR-0004)
}

export interface SessionStartedPayload {
  instanceId: string;
  branch: string;
  seedContext: Record<string, unknown>;
}

export interface ReapInstancePayload {
  instanceId: string;
  reason: "stalled" | "phase-complete" | "manager-cancel";
  finalProgressCommitted: boolean; // must be true before reap (designer2 smaller-gap)
}

// --- Task lifecycle ---

export interface TaskCreatedPayload {
  taskId: string;
  featureSlug: string;
  assignedInstance: string;
  phase: string; // current lifecycle phase
  description: string;
  acceptanceCriteria: string[];
  mboMetrics: { name: string; target: string }[]; // pulled from metrics/mbo-targets.yaml
}

export interface TaskCompletedPayload {
  taskId: string;
  instanceId: string;
  result: "done" | "blocked" | "needs-review";
  artifacts: { id: string; path: string; type: string }[];
}

// --- Edit coordination (ADR-0003) ---

export interface EditIntentPayload {
  op: EditOp; // create | update | delete | progress
  path: string; // repo-relative file path
  content?: string; // for create/update
  progressReportPath?: string; // for op=progress: 00_workspace/working_files/progress/<handle>-<date>.md
}

export interface AcquireCheckoutPayload {
  instanceId: string;
  branch: string;
  batch: EditIntentPayload[]; // full batch attached (turn-bounded, ADR-0003)
}

export interface EditAppliedPayload {
  instanceId: string;
  commitSha: string;
  appliedCount: number;
}

export interface CheckoutDeniedPayload {
  instanceId: string;
  retryAfterMs: number;
}

// --- Lifecycle gating ---

export interface PhaseGateCheckPayload {
  featureSlug: string;
  instanceId: string;
  phase: string;
  artifactsProduced: string[];
  mboMetrics: { name: string; value: string; target: string; onTarget: boolean }[];
  plannedGaps: { metric: string; declaredGap: string }[]; // path (c) — default-available (designer2 B1)
}

export interface PhaseGateResultPayload {
  featureSlug: string;
  phase: string;
  passed: boolean;
  reason: string;
}

// --- Health ---

export interface HeartbeatPayload {
  instanceId: string;
  turnId: string;
  load: {
    activeTurns: number;
    pendingIntents: number;
    lastHeartbeatAgeMs: number;
  };
}

export interface InstanceStalledPayload {
  instanceId: string;
  lastHeartbeatAt: string;
  missedBeats: number; // 3 = stall (90s at 30s interval)
}

// --- Cross-feature (milestone 5 — stub) ---

export interface MergeConflictDetectedPayload {
  featureSlug: string;
  branch: string;
  conflictingBranch: string;
  files: string[];
  // Resolution path: milestone 5. No MergeResolutionApplied / RebaseRequested in v1 catalog.
}

// --- v1.1.0 additions: async test coordination + lifecycle escalation ---

export interface TestNeededPayload {
  commitSha: string;
  branch: string;
  featureSlug: string;
  paths: string[];
}

export interface TestFailedPayload {
  commitSha: string;
  branch: string;
  featureSlug: string;
  error: string;
  paths: string[];
}

export interface EditRevertedPayload {
  originalCommitSha: string;
  revertCommitSha: string;
  branch: string;
  featureSlug: string;
  reason: string;
}

export interface PhaseEscalationPayload {
  featureSlug: string;
  phase: number;
  backtrackCount: number;
  reason: string;
  managerOptions: ("accept_planned_gap" | "extend_deadline" | "kill_feature")[];
}

// --- Bus hygiene ---

export interface DeadLetterPayload {
  originalIntentType: IntentType;
  originalIdempotencyKey: string;
  error: string;
  failedAt: string;
}

// --- Typed intent aliases ---

export type FeatureSubmitted = IntentEnvelope<"FeatureSubmitted", FeatureSubmittedPayload>;
export type SpawnAgents = IntentEnvelope<"SpawnAgents", SpawnAgentsPayload>;
export type AgentAssigned = IntentEnvelope<"AgentAssigned", AgentAssignedPayload>;
export type SessionStarted = IntentEnvelope<"SessionStarted", SessionStartedPayload>;
export type ReapInstance = IntentEnvelope<"ReapInstance", ReapInstancePayload>;
export type TaskCreated = IntentEnvelope<"TaskCreated", TaskCreatedPayload>;
export type TaskCompleted = IntentEnvelope<"TaskCompleted", TaskCompletedPayload>;
export type EditIntent = IntentEnvelope<"EditIntent", EditIntentPayload>;
export type AcquireCheckout = IntentEnvelope<"AcquireCheckout", AcquireCheckoutPayload>;
export type EditApplied = IntentEnvelope<"EditApplied", EditAppliedPayload>;
export type CheckoutDenied = IntentEnvelope<"CheckoutDenied", CheckoutDeniedPayload>;
export type PhaseGateCheck = IntentEnvelope<"PhaseGateCheck", PhaseGateCheckPayload>;
export type PhaseGatePassed = IntentEnvelope<"PhaseGatePassed", PhaseGateResultPayload>;
export type PhaseGateFailed = IntentEnvelope<"PhaseGateFailed", PhaseGateResultPayload>;
export type Heartbeat = IntentEnvelope<"Heartbeat", HeartbeatPayload>;
export type InstanceStalled = IntentEnvelope<"InstanceStalled", InstanceStalledPayload>;
export type MergeConflictDetected = IntentEnvelope<"MergeConflictDetected", MergeConflictDetectedPayload>;
export type TestNeeded = IntentEnvelope<"TestNeeded", TestNeededPayload>;
export type TestFailed = IntentEnvelope<"TestFailed", TestFailedPayload>;
export type EditReverted = IntentEnvelope<"EditReverted", EditRevertedPayload>;
export type PhaseEscalation = IntentEnvelope<"PhaseEscalation", PhaseEscalationPayload>;
export type DeadLetter = IntentEnvelope<"DeadLetter", DeadLetterPayload>;
