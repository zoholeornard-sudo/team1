# Redis Keyspace Prefixes

All Redis keys used by the orchestrator. Documented so services don't collide and so the
upgrade path to Postgres (ADR-0005) or Kafka (ADR-0002 upgrade) is legible.

## Streams (intent bus)

| Prefix | Purpose | Producer | Consumer(s) |
|--------|---------|----------|-------------|
| `intents:feature-submitted` | FeatureSubmitted | orchestrator-api | task-management, agent-registry |
| `intents:spawn-agents` | SpawnAgents | orchestrator-api | agent-registry |
| `intents:agent-assigned` | AgentAssigned | agent-registry | runtime, session-management |
| `intents:session-started` | SessionStarted | runtime | session-management, health-monitoring |
| `intents:reap-instance` | ReapInstance | health-monitoring, lifecycle-management | runtime, session-management |
| `intents:task-created` | TaskCreated | task-management | runtime (injects into seed context) |
| `intents:task-completed` | TaskCompleted | runtime (agent return value) | task-management, lifecycle-management |
| `intents:edit-intent` | EditIntent | runtime (agent return value) | edit-coordinator |
| `intents:acquire-checkout` | AcquireCheckout | runtime | edit-coordinator |
| `intents:edit-applied` | EditApplied | edit-coordinator | runtime, task-management |
| `intents:checkout-denied` | CheckoutDenied | edit-coordinator | runtime |
| `intents:phase-gate-check` | PhaseGateCheck | runtime | lifecycle-management |
| `intents:phase-gate-passed` | PhaseGatePassed | lifecycle-management | runtime, task-management |
| `intents:phase-gate-failed` | PhaseGateFailed | lifecycle-management | runtime |
| `intents:heartbeat` | Heartbeat | runtime | health-monitoring |
| `intents:instance-stalled` | InstanceStalled | health-monitoring | runtime, session-management |
| `intents:merge-conflict-detected` | MergeConflictDetected | edit-coordinator | runtime (milestone 5) |
| `intents:dead-letter` | DeadLetter | any service | (manual triage) |

## Refinement plan streams (v1.2.0)

| Prefix | Purpose | Producer | Consumer(s) |
|--------|---------|----------|-------------|
| `intents:workflow-created` | WorkflowCreated | orchestrator-api | workflow |
| `intents:workflow-task-state-changed` | WorkflowTaskStateChanged | workflow | task-management, lifecycle-management |
| `intents:manager-heartbeat` | ManagerHeartbeat | manager-loop | event-coordination |
| `intents:reassign-task` | ReassignTask | manager-loop | task-management |
| `intents:scope-change-request` | ScopeChangeRequest | manager-loop, metric-alert | lifecycle-management |
| `intents:review-requested` | ReviewRequested | review-scheduler | lifecycle-management |
| `intents:review-report` | ReviewReport | lifecycle-management | event-coordination |
| `intents:conflict-detected` | ConflictDetected | conflict-detector | event-coordination |
| `intents:backup-agent-spawned` | BackupAgentSpawned | conflict-detector | agent-registry |
| `intents:metric-alert` | MetricAlert | metric-alert | event-coordination, lifecycle-management |

## Per-service state (SQLite, not Redis)

| Service | DB file | Tables |
|---------|---------|--------|
| task-management | `data/tasks.db` | tasks, task_assignments |
| session-management | `data/sessions.db` | sessions, turn_history |
| health-monitoring | `data/health.db` | heartbeats, stall_events |
| lifecycle-management | `data/lifecycle.db` | phase_gates, planned_gaps, mbo_snapshots |
| event-coordination | `data/bus.db` | stream_offsets (last-acked positions) |
| edit-coordinator | `data/work.db` | commits, lock_log |
| agent-registry | `data/registry.db` | personas, instances, manager_capabilities |
| runtime | `data/runtime.db` | in_flight_turns, agent_state |
| workflow | `data/workflow.db` | workflows, workflow_tasks |
| manager-loop | `data/manager.db` | agent_states, manager_states |
| review-scheduler | `data/review.db` | review_reports |
| conflict-detector | `data/conflict.db` | proposals, conflicts |
| metric-alert | `data/metric.db` | tracked_metrics, alert_history |

## Idempotency dedupe

| Prefix | TTL | Purpose |
|--------|-----|---------|
| `idem:{serviceName}:{idempotencyKey}` | 24h | Per-service dedupe map. Presence = already processed. |

## Cross-service replay

On boot, each service reads its `stream_offsets` table (or equivalent) and replays from the
last-acked position. This is what makes at-least-once + per-service SQLite consistent without a
shared transaction (designer1 should-fix, ADR-0002).
