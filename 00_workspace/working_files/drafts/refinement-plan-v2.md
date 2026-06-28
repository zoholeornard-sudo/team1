# team1 Orchestrator — Refinement Plan v2.0

**Version:** 2.0.0
**Date:** 2026-06-28
**Author:** `@architect-agent` (via Zo)
**Status:** Canonical Refinement Blueprint
**Supersedes:** `imp plan draft` (v1.2.0, milestones 0–6)

---

## 1. Executive Summary

M0–M3 are implemented and verified (55/55 integration tests passing). M4–M6 have partial implementations but lack the depth described in the original plan. This refinement plan addresses:

1. **Performance bottlenecks** discovered during testing (health check latency, sequential service polling)
2. **Architectural gaps** between the original plan and what was built (M4-M6 lifecycle depth, workflow service, session management)
3. **Production readiness** (error recovery, observability, configuration management)
4. **Web dashboard integration** (the Next.js frontend exists but isn't connected to live data)

---

## 2. Current State Assessment

### 2.1 What Works (Verified)

| Component | Tests | Status |
|---|---|---|
| Bus & 14 services boot (M1) | 14/14 health | ✅ Complete |
| Spawn & Assign (M2) | 8/8 lifecycle | ✅ Complete |
| Branch-Only Work Coordination (M3) | 5/5 edit flows | ✅ Complete |
| Multi-instance spawning | 12/12 concurrent | ✅ Complete |
| Multi-orchestrator isolation | 14/14 isolation | ✅ Complete |
| Instance manager | 19/19 evaluation | ✅ Complete |
| **Total** | **55/55** | |

### 2.2 What Needs Refinement

| Component | Current State | Target State |
|---|---|---|
| **M4: Dual-Gate Lifecycle** | Basic gate evaluator with in-memory state | SQLite-backed, backtrack counter, Phase 7 no-backtrack, planned-gap declarations |
| **M5: Multi-Feature Merge** | Stub (no endpoint) | `POST /dependencies`, `GET /can-deploy`, dependency graph |
| **M6: Reap & History** | Basic reap handler in runtime | Full teardown sequence, history scraper, metrics aggregation |
| **Workflow service** | DuckDB schema only | Full CRUD, task state machine, phase mapping |
| **Session management** | Stub (bus boot only) | Turn history, seed context persistence |
| **Health monitoring** | Heartbeat logging only | Stall detection, `InstanceStalled` intent, auto-recovery |
| **Manager loop** | In-memory stub | Real Redis consumer, coordination loop, conflict resolution |
| **Event coordination** | 10 upstream streams only | Full source→target routing, validation, dead-letter handling |
| **Web dashboard** | Static pages | Live data via API rewrites, real-time updates |

---

## 3. Refinement Milestones (R1–R6)

---

### R1: Lifecycle Depth (M4 Completion)

**Goal:** Full dual-gate lifecycle with persistence, backtracking, and gap management.

#### 1.1 Lifecycle Management SQLite Schema
```sql
CREATE TABLE IF NOT EXISTS phase_gates (
  id TEXT PRIMARY KEY,
  feature_slug TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  phase INTEGER NOT NULL,
  artifact_passed BOOLEAN DEFAULT 0,
  mbo_passed BOOLEAN DEFAULT 0,
  gap_declared BOOLEAN DEFAULT 0,
  backtrack_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending | passed | failed | escalated
  result_reason TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS planned_gaps (
  id TEXT PRIMARY KEY,
  feature_slug TEXT NOT NULL,
  phase INTEGER NOT NULL,
  metric TEXT NOT NULL,
  declared_gap TEXT NOT NULL,
  declared_by TEXT NOT NULL,
  status TEXT DEFAULT 'declared', -- declared | accepted | rejected
  manager_reviewed BOOLEAN DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS escalation_log (
  id TEXT PRIMARY KEY,
  feature_slug TEXT NOT NULL,
  phase INTEGER NOT NULL,
  backtrack_count INTEGER NOT NULL,
  manager_action TEXT, -- accept_planned_gap | extend_deadline | kill_feature
  resolved_at TEXT
);
```

#### 1.2 Backtrack Counter with Forced Escalation
- Track `backtrack_count` per `(featureSlug, phase)` in SQLite
- After 3 backtracks on same phase → emit `PhaseEscalation` to Manager
- Phase 7 does NOT backtrack (throws, Manager must intervene)
- Manager response via `POST /features/:slug/escalation-response`

#### 1.3 Planned-Gap Declaration Flow
- Agent declares gap in progress report (free, no token required)
- Stored in `planned_gaps` table
- Manager reviews at Phase 7 (token required to reject)
- Accepted gaps become mandatory Phase-1 inputs next cycle

#### 1.4 MBO Metric Integration
- Load targets from `metrics/mbo-targets.yaml`
- Connect `MboMetricReport` stream to lifecycle-management
- Evaluate metrics against targets at each gate
- Emit `RemediationIntent` for off-target metrics

#### 1.5 Verification Tests
- [ ] Gate passes when both artifact and MBO on target
- [ ] Gate fails when MBO off target → backtrack to previous phase
- [ ] Backtrack counter increments per attempt
- [ ] PhaseEscalation emitted after 3 backtracks
- [ ] Phase 7 does not backtrack (throws)
- [ ] Planned gap declaration resolves MBO gate
- [ ] Manager rejection forces backward intent

---

### R2: Workflow Service Completion

**Goal:** Full workflow CRUD, task state machine, and phase mapping.

#### 2.1 Workflow State Machine
```
draft → active → completed
                  ↕
              failed (on 3+ backtracks)
```

#### 2.2 Workflow Task State Machine
```
pending → ready → in_progress → done
              ↕          ↕
          blocked    needs_review
```

#### 2.3 API Endpoints
```
POST   /workflows              — create workflow from feature definition
GET    /workflows              — list workflows
GET    /workflows/:id          — get workflow with tasks
POST   /workflows/:id/tasks    — add task
PATCH  /tasks/:id/state        — update task state
GET    /tasks?featureSlug=     — query tasks by feature
GET    /tasks?instance=        — query tasks by assigned instance
```

#### 2.4 Phase Mapping
- Map lifecycle phases (1-7) to workflow phases
- Auto-create tasks for each phase on workflow creation
- Track phase completion via task state aggregation

#### 2.5 Verification Tests
- [ ] Create workflow with tasks for all 7 phases
- [ ] Transition task through full state machine
- [ ] Query tasks by feature slug
- [ ] Query tasks by assigned instance
- [ ] Workflow completes when all tasks done
- [ ] Workflow fails when tasks blocked > threshold

---

### R3: Multi-Feature Merge Coordination (M5 Completion)

**Goal:** Dependency tracking, merge serialization, and integration testing.

#### 3.1 Dependency API
```
POST   /features/:slug/dependsOn/:otherSlug  — declare dependency (Manager token)
GET    /features/:slug/dependencies          — list dependencies
GET    /features/:slug/can-deploy            — check if all deps passed Phase 7
DELETE /features/:slug/dependsOn/:otherSlug  — remove dependency
```

#### 3.2 SQLite Schema
```sql
CREATE TABLE IF NOT EXISTS feature_dependencies (
  feature TEXT NOT NULL,
  depends_on_feature TEXT NOT NULL,
  declared_at TEXT NOT NULL,
  PRIMARY KEY (feature, depends_on_feature)
);
```

#### 3.3 Merge Rules
- Feature B cannot enter Phase 5 (Deployment) until all features in `B.dependsOn` have Phase 7 = passed
- Explicit dependency declaration only (no auto-detection for v2)
- Manager authority required to declare dependencies

#### 3.4 Integration Lock Queue
- When feature enters Phase 5, block downstream merge requests
- Integration testing verifies master consistency
- Release lock after successful integration

#### 3.5 Verification Tests
- [ ] Declare dependency between two features
- [ ] Block Phase 5 entry when dependency not passed
- [ ] Allow Phase 5 entry when all dependencies passed
- [ ] Remove dependency
- [ ] can-deploy returns correct status

---

### R4: Reap & History (M6 Completion)

**Goal:** Full teardown sequence, history preservation, and metrics aggregation.

#### 4.1 Reap Teardown Sequence
1. Ensure final `TurnEnd` intent is processed
2. Agent commits retrospective progress log on branch
3. Run git merge `feature/<slug>-<handle>` → master
4. Mark instance status to `reaped` in registry
5. Archive branch (don't delete — audit trail)
6. Record reap history with metrics

#### 4.2 History Scraper
- Parse all reaped progress reports
- Generate metrics: execution runtime, token cost, plan accuracy
- Store in `reap_history` SQLite table

#### 4.3 Runtime Reap Handler
```typescript
async function handleReapInstance(payload: ReapInstancePayload) {
  // 1. Remove from agentStates
  // 2. Record reap history
  // 3. Emit ReapInstance to bus
  // 4. Clean up in-flight turns
}
```

#### 4.4 API Endpoints
```
POST   /instances/:id/reap         — trigger reap
GET    /reap/history               — list reap history
GET    /reap/history/:featureSlug  — get reap details for feature
GET    /metrics/aggregate          — aggregated metrics across all reaps
```

#### 4.5 Verification Tests
- [ ] Reap instance removes from runtime tracking
- [ ] Reap history records execution metrics
- [ ] ReapInstance intent emitted to bus
- [ ] Branch archived after reap
- [ ] Aggregate metrics calculated correctly

---

### R5: Observability & Production Hardening

**Goal:** Make the orchestrator production-ready with proper error recovery, health management, and configuration.

#### 5.1 Health Check Performance
- **Problem:** Instance-manager health check takes ~24s (sequential 14-service polling)
- **Fix:** Parallelize health checks with `Promise.all`, reduce timeout to 500ms
- **Target:** <3s for full instance health check

#### 5.2 Service Recovery
- Auto-restart crashed services (process supervisor)
- Health-monitoring emits `InstanceStalled` after 3 missed heartbeats (90s)
- Task-management re-queues orphaned tasks
- Dead-letter stream triage endpoint

#### 5.3 Configuration Management
```yaml
# config/orchestrator.yaml
orchestrator:
  heartbeat_interval_ms: 30000
  stall_threshold_ms: 90000
  max_backtracks: 3
  lock_ttl_ms: 5000
  dedup_ttl_seconds: 86400
  health_check_timeout_ms: 500
  max_concurrent_edits: 1
  log_level: info
  
  ports:
    orchestrator_api: 3099
    instance_manager: 3098
    base_port: 3100
    port_stride: 100
    
  redis:
    url: redis://localhost:6379
    max_retries: 3
    
  git:
    repo_root: /workspaces/team1
    auto_push: true
    branch_prefix: feature/
```

#### 5.4 Structured Logging
- JSON log format for Loki compatibility
- Trace ID propagation across all intents
- Per-service log files in `/dev/shm/<service>.log`

#### 5.5 Bus Client Improvements
- Fix Redis encoder error (`Invalid argument type` with @redis/client)
- Add connection retry with exponential backoff
- Add consumer group offset persistence (SQLite per service)
- Stream replay-on-boot for crash recovery

#### 5.6 Verification Tests
- [ ] Health check completes <3s for 14 services
- [ ] Crashed service auto-restarts within 30s
- [ ] Stalled instance detected after 90s
- [ ] Orphaned task re-queued
- [ ] Configuration loaded from YAML
- [ ] Stream replay recovers state after crash

---

### R6: Web Dashboard Integration

**Goal:** Connect the Next.js dashboard to live orchestrator data.

#### 6.1 API Routes (Next.js Rewrites)
```
/api/orchestrator/*    → http://localhost:3099/*
/api/registry/*        → http://localhost:3107/*
/api/workflow/*        → http://localhost:3108/*
/api/metrics/*         → http://localhost:3112/*
/api/instances/*       → http://localhost:3098/*
```

#### 6.2 Dashboard Pages
| Page | Data Source | Features |
|---|---|---|
| `/` (Dashboard) | All services | Overview stats, active features, health |
| `/features` | orchestrator-api | List, create, spawn, detail views |
| `/features/[slug]` | orchestrator-api + registry | Feature detail, instances, tasks, gates |
| `/features/new` | — | Feature creation form |
| `/agents` | agent-registry | Instance ledger, status, heartbeats |
| `/workflows` | workflow | Workflow list, task board |
| `/services` | All /health | Service health grid |
| `/metrics` | metric-alert + lifecycle | MBO dashboards, gate status |

#### 6.3 Real-Time Updates
- Server-Sent Events (SSE) for health status
- Polling fallback for feature/task state
- WebSocket for edit-coordinator live log

#### 6.4 Verification Tests
- [ ] Dashboard loads with live data from all services
- [ ] Feature creation flow works end-to-end
- [ ] Instance spawning shows real-time progress
- [ ] Health grid reflects actual service status
- [ ] Navigation between pages works

---

## 4. Implementation Priority

| Priority | Milestone | Effort | Impact |
|---|---|---|---|
| **P0** | R5.1 Health check perf | 2h | Unblocks instance-manager scaling |
| **P0** | R5.6 Bus client fix | 4h | Fixes Redis encoder crash |
| **P1** | R1 Lifecycle depth | 8h | Completes M4 (core differentiator) |
| **P1** | R2 Workflow service | 6h | Enables task tracking UI |
| **P2** | R3 Merge coordination | 4h | Completes M5 |
| **P2** | R4 Reap & history | 4h | Completes M6 |
| **P3** | R5 Observability | 6h | Production readiness |
| **P3** | R6 Dashboard | 8h | User-facing value |

---

## 5. Risk Zones & Mitigations

### 5.1 Risk: Bus Client Redis Encoder Crash
**Symptom:** `TypeError: Invalid argument type` in `@redis/client` encoder
**Root cause:** The `redis` npm package's RESP2 encoder doesn't handle Bun's stream types
**Mitigation:** Switch bus-client from `redis` to `ioredis` (already in package.json but not used)

### 5.2 Risk: Git Branch Proliferation
**Symptom:** Each test run creates 5+ branches, polluting the repo
**Mitigation:** Add `POST /features/:slug/cleanup` to archive/delete branches after reap

### 5.3 Risk: Idempotency Key Collisions
**Symptom:** Agent-registry only registers 1 of 5 instances
**Root cause:** `Date.now()` returns same value in tight loop → same idempotency key
**Mitigation:** Use `crypto.randomUUID()` or include instance ID in key

### 5.4 Risk: Health Check Timeout Cascade
**Symptom:** Instance-manager health check takes 24s for 14 services
**Root cause:** Sequential polling with 2s timeout per service
**Mitigation:** Parallelize with `Promise.all`, reduce timeout to 500ms

---

## 6. Acceptance Criteria

### R1 (Lifecycle)
- [ ] All 7 lifecycle phases have gate evaluation
- [ ] Backtrack counter works (max 3 → escalation)
- [ ] Phase 7 does not backtrack
- [ ] Planned gaps stored and reviewable
- [ ] 8+ new integration tests passing

### R2 (Workflow)
- [ ] Full task state machine (6 states)
- [ ] CRUD API for workflows and tasks
- [ ] Phase-to-task mapping
- [ ] 6+ new integration tests passing

### R3 (Merge)
- [ ] Dependency declaration API
- [ ] can-deploy check
- [ ] Merge serialization
- [ ] 5+ new integration tests passing

### R4 (Reap)
- [ ] Full teardown sequence
- [ ] History scraper with metrics
- [ ] Archive (not delete) branches
- [ ] 5+ new integration tests passing

### R5 (Production)
- [ ] Health check <3s
- [ ] Auto-restart crashed services
- [ ] Configuration from YAML
- [ ] Stream replay recovery
- [ ] 6+ new integration tests passing

### R6 (Dashboard)
- [ ] All pages show live data
- [ ] Feature creation flow works
- [ ] Real-time health updates
- [ ] Manual verification complete

---

## 7. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-06-21 | `@architect-agent` | Original implementation plan (M0-M6) |
| 1.1.0 | 2026-06-21 | `@architect-agent` | Added risk zones, design calls |
| 1.2.0 | 2026-06-22 | `@architect-agent` | Code refactors, open question resolutions |
| 2.0.0 | 2026-06-28 | `@architect-agent` | Refinement plan based on 55/55 test results, performance findings, and production readiness gaps |
