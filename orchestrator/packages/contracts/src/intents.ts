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
  // Lifecycle loop extraction (gstack → team1): Phase 2 multi-lens review
  | "PhaseReviewScore"
  // Lifecycle loop extraction: Phase 3 scope-lock
  | "ScopeChangeRequest"
  // Lifecycle loop extraction: Phase 5 deploy verification
  | "DeployVerified"
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

export type ReviewLens = "ceo" | "eng" | "design" | "dx";

export type DeployStatus = "HEALTHY" | "DEGRADED" | "REVERTED";

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
  scopeDoc?: ScopeDoc; // structured spec from /spec 5-phase process (gstack extraction Initiative 6)
}

export interface ScopeDoc {
  problemStatement: string;
  boundaries: string[];      // what's in scope / out of scope
  acceptanceCriteria: string[];
  nfrs: { name: string; target: string }[];  // non-functional requirements
  existingCodeRead: boolean;  // Phase 3 of /spec: "HARD requirement: read code first"
  dedupedAgainst: string[];   // existing issues/features checked for overlap
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
  priorCheckpoint?: ContextCheckpoint; // gstack extraction Initiative 4 — resume after stall/reassign
}

export interface ContextCheckpoint {
  taskId: string;
  decisions: { description: string; rationale: string; timestamp: string }[];
  filesTouched: string[];
  remainingSteps: string[];
  lastTurnId: string;
  savedAt: string; // ISO-8601 UTC
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
  mboMetrics: { name: string; target: string }[]; // pulled from assignments/<project>.json
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
  // Lifecycle loop extraction Phase 3 — scope-lock protocol.
  // Lead dev agent declares the directory/file boundary when Phase 3 opens.
  // edit-coordinator rejects any EditIntent whose path falls outside scopePaths
  // with CheckoutDenied{reason: "out-of-scope"}. Scope changes go through ScopeChangeRequest.
  scopePaths?: string[];
}

export interface EditAppliedPayload {
  instanceId: string;
  commitSha: string;
  appliedCount: number;
}

export interface CheckoutDeniedPayload {
  instanceId: string;
  retryAfterMs: number;
  reason?: "lock-busy" | "out-of-scope" | "invalid-batch";
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

// --- Lifecycle loop extraction: Phase 2 multi-lens review ---
// Each lens reviewer emits one PhaseReviewScore intent. lifecycle-management
// consumes them and gates Phase 2 on all four lens scores ≥ 7 (or accepted remediation).
// See lifecycle-loop-extraction.md Phase 2 — multi-lens review protocol.

export interface PhaseReviewScorePayload {
  featureSlug: string;
  phase: string;
  lens: ReviewLens;
  reviewerInstance: string; // instanceId of the lens reviewer (Manager for ceo, Architect for eng, etc.)
  score: number; // 0-10
  rationale: string; // required — "what does a 10 look like?" framing
  remediation?: string; // optional — accepted remediation path if score < 7
}

// --- Lifecycle loop extraction: Phase 3 scope-lock escalation ---
// Lead dev agent or Manager emits this when the declared scope needs to change.
// The Manager approves/denies; on approval, edit-coordinator updates its scopePaths
// allowlist for this feature. Agents may NOT self-expand scope — they escalate.

export interface ScopeChangeRequestPayload {
  featureSlug: string;
  instanceId: string;
  currentScopePaths: string[];
  requestedScopePaths: string[];
  reason: string;
  decision?: "approved" | "denied"; // filled by Manager; absent on submission
  decidedBy?: string;
}

// --- Lifecycle loop extraction: Phase 5 deploy verification ---
// DevOps Agent / Release Agent emits after merge + deploy + verify.
// lifecycle-management requires DeployVerified{status: "HEALTHY"} as part of the
// Phase 5 artifact gate. DEGRADED/REVERTED triggers PhaseEscalation.
export interface DeployVerifiedPayload {
  featureSlug: string;
  instanceId: string;
  mergeSha: string;
  url: string; // production URL
  status: DeployStatus;
  deployDurationMs: number;
  httpStatus?: number;
  screenshotPath?: string;
  consoleErrorDelta?: number; // diff against pre-deploy baseline
  stagingVerifiedFirst?: boolean;
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
export type PhaseReviewScore = IntentEnvelope<"PhaseReviewScore", PhaseReviewScorePayload>;
export type ScopeChangeRequest = IntentEnvelope<"ScopeChangeRequest", ScopeChangeRequestPayload>;
export type DeployVerified = IntentEnvelope<"DeployVerified", DeployVerifiedPayload>;
export type Heartbeat = IntentEnvelope<"Heartbeat", HeartbeatPayload>;
export type InstanceStalled = IntentEnvelope<"InstanceStalled", InstanceStalledPayload>;
export type MergeConflictDetected = IntentEnvelope<"MergeConflictDetected", MergeConflictDetectedPayload>;
export type TestNeeded = IntentEnvelope<"TestNeeded", TestNeededPayload>;
export type TestFailed = IntentEnvelope<"TestFailed", TestFailedPayload>;
export type EditReverted = IntentEnvelope<"EditReverted", EditRevertedPayload>;
export type PhaseEscalation = IntentEnvelope<"PhaseEscalation", PhaseEscalationPayload>;
export type DeadLetter = IntentEnvelope<"DeadLetter", DeadLetterPayload>;