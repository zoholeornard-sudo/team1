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
  | "DeadLetter"
  // Workflow service (P2 — refinement plan)
  | "WorkflowCreated"
  | "WorkflowTaskStateChanged"
  // Manager loop (P1 — refinement plan)
  | "ManagerHeartbeat"
  | "ReassignTask"
  | "ScopeChangeRequest"
  // Review scheduler (P3 — refinement plan)
  | "ReviewRequested"
  | "ReviewReport"
  // Conflict handling (P4 — refinement plan)
  | "ConflictDetected"
  | "BackupAgentSpawned"
  // Metric alerts (P5 — refinement plan)
  | "MetricAlert"
  // Feature rollout playbook intents
  | "SpecCommitted"
  | "ScanCompleted"
  | "InfraProvisioned"
  | "DeployCompleted"
  | "ModelsIntegrated"
  | "AnalyticsLive"
  | "MonitoringActive"
  | "RollbackTriggered"
  | "RollbackWarning"
  | "MetricWarning"
  | "MetricCritical"
  | "FeatureFlagUpdated"
  | "WorkflowStepCompleted";

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

// --- Feature rollout playbook ---

export interface SpecCommittedPayload {
  featureSlug: string;
  specPath: string;
  requestingManager: string;
}

export interface ScanCompletedPayload {
  featureSlug: string;
  criticalVulns: number;
  passed: boolean;
}

export interface InfraProvisionedPayload {
  featureSlug: string;
  resources: string[];
  provisioningTimeMs: number;
}

export interface DeployCompletedPayload {
  featureSlug: string;
  commitSha: string;
  rolloutMode: "full" | "phased" | "dark" | "beta";
  trafficPercentage: number;
}

export interface ModelsIntegratedPayload {
  featureSlug: string;
  models: string[];
}

export interface AnalyticsLivePayload {
  featureSlug: string;
  events: string[];
}

export interface MonitoringActivePayload {
  featureSlug: string;
  services: string[];
}

export interface RollbackTriggeredPayload {
  featureSlug: string;
  reason: string;
  metricName: string;
  currentValue: string;
  targetValue: string;
  autoRollback: boolean;
}

export interface RollbackWarningPayload {
  featureSlug: string;
  reason: string;
  recommendedAction: string;
}

export interface MetricWarningPayload {
  featureSlug: string;
  metricName: string;
  currentValue: string;
  targetValue: string;
  severity: "warning";
}

export interface MetricCriticalPayload {
  featureSlug: string;
  metricName: string;
  currentValue: string;
  targetValue: string;
  severity: "critical";
  autoAction: string;
}

export interface FeatureFlagUpdatedPayload {
  featureSlug: string;
  flagName: string;
  flagType: "percentage" | "cohort" | "kill_switch";
  value: string | number | boolean;
}

export interface WorkflowStepCompletedPayload {
  featureSlug: string;
  stepNumber: number;
  stepName: string;
  output: string;
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

// --- Workflow service (P2) ---

export interface WorkflowCreatedPayload {
  workflowId: string;
  featureSlug: string;
  tasks: Array<{
    taskId: string;
    taskOrder: number;
    phase: string;
    description: string;
    acceptanceCriteria: string[];
    mboMetrics: { name: string; target: string }[];
  }>;
}

export interface WorkflowTaskStateChangedPayload {
  workflowId: string;
  taskId: string;
  previousState: string;
  newState: string;
  assignedInstance?: string;
}

// --- Manager loop (P1) ---

export interface ManagerHeartbeatPayload {
  managerHandle: string;
  timestamp: string;
  activeWorkflows: number;
  stalledAgents: Array<{ instanceId: string; lastHeartbeatAgeMs: number }>;
}

export interface ReassignTaskPayload {
  workflowId: string;
  taskId: string;
  fromInstance: string;
  toInstance: string;
  reason: string;
}

export interface ScopeChangeRequestPayload {
  workflowId: string;
  requestedBy: string;
  changeType: "add_task" | "remove_task" | "modify_acceptance" | "change_phase_target";
  details: Record<string, unknown>;
}

// --- Review scheduler (P3) ---

export interface ReviewRequestedPayload {
  workflowId: string;
  featureSlug: string;
  reviewTurn: number;
  metricsSnapshot: Array<{ name: string; value: string; target: string; onTarget: boolean }>;
}

export interface ReviewReportPayload {
  workflowId: string;
  featureSlug: string;
  reviewTurn: number;
  overallStatus: "on_track" | "at_risk" | "off_track";
  findings: string[];
  recommendations: string[];
}

// --- Conflict handling (P4) ---

export interface ConflictDetectedPayload {
  workflowId: string;
  taskId: string;
  conflictingInstances: string[];
  conflictType: "contradictory_output" | "duplicate_work" | "resource_contention";
  details: string;
}

export interface BackupAgentSpawnedPayload {
  workflowId: string;
  taskId: string;
  primaryInstance: string;
  backupInstance: string;
  reason: string;
}

// --- Metric alerts (P5) ---

export interface MetricAlertPayload {
  featureSlug: string;
  metricName: string;
  currentValue: string;
  targetValue: string;
  threshold: "warning" | "critical";
  recommendedAction: string;
}

// --- Typed intent aliases (new) ---

export type WorkflowCreated = IntentEnvelope<"WorkflowCreated", WorkflowCreatedPayload>;
export type WorkflowTaskStateChanged = IntentEnvelope<"WorkflowTaskStateChanged", WorkflowTaskStateChangedPayload>;
export type ManagerHeartbeat = IntentEnvelope<"ManagerHeartbeat", ManagerHeartbeatPayload>;
export type ReassignTask = IntentEnvelope<"ReassignTask", ReassignTaskPayload>;
export type ScopeChangeRequest = IntentEnvelope<"ScopeChangeRequest", ScopeChangeRequestPayload>;
export type ReviewRequested = IntentEnvelope<"ReviewRequested", ReviewRequestedPayload>;
export type ReviewReport = IntentEnvelope<"ReviewReport", ReviewReportPayload>;
export type ConflictDetected = IntentEnvelope<"ConflictDetected", ConflictDetectedPayload>;
export type BackupAgentSpawned = IntentEnvelope<"BackupAgentSpawned", BackupAgentSpawnedPayload>;
export type MetricAlert = IntentEnvelope<"MetricAlert", MetricAlertPayload>;
export type SpecCommitted = IntentEnvelope<"SpecCommitted", SpecCommittedPayload>;
export type ScanCompleted = IntentEnvelope<"ScanCompleted", ScanCompletedPayload>;
export type InfraProvisioned = IntentEnvelope<"InfraProvisioned", InfraProvisionedPayload>;
export type DeployCompleted = IntentEnvelope<"DeployCompleted", DeployCompletedPayload>;
export type ModelsIntegrated = IntentEnvelope<"ModelsIntegrated", ModelsIntegratedPayload>;
export type AnalyticsLive = IntentEnvelope<"AnalyticsLive", AnalyticsLivePayload>;
export type MonitoringActive = IntentEnvelope<"MonitoringActive", MonitoringActivePayload>;
export type RollbackTriggered = IntentEnvelope<"RollbackTriggered", RollbackTriggeredPayload>;
export type RollbackWarning = IntentEnvelope<"RollbackWarning", RollbackWarningPayload>;
export type MetricWarning = IntentEnvelope<"MetricWarning", MetricWarningPayload>;
export type MetricCritical = IntentEnvelope<"MetricCritical", MetricCriticalPayload>;
export type FeatureFlagUpdated = IntentEnvelope<"FeatureFlagUpdated", FeatureFlagUpdatedPayload>;
export type WorkflowStepCompleted = IntentEnvelope<"WorkflowStepCompleted", WorkflowStepCompletedPayload>;
