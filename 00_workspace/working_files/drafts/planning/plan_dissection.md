# Plan Dissection: team1 Orchestrator (Milestones 0–6)

## Quick Overview
**Scope:** Build a distributed multi-agent orchestration engine using 6 isolated microservices, Redis Streams event bus, and centralized git repository write-lock.  
**Timeline:** Estimated 8–12 weeks of full-time engineering (6 engineers working in parallel on services)  
**Architectural Constraint:** Single writer (`edit-coordinator`) with Redlock serialization.

---

## The Five Locked Decisions (Immutable Constraints)

| # | Decision | Implication |
|---|----------|-------------|
| 1 | **Branch-Only Isolation** | No git worktrees. All writes serialized through `edit-coordinator` service. Agents submit `EditIntent` messages over Redis bus. |
| 2 | **Distinct-Handle Instances** | Each spawned agent (e.g., `@architect-agent-2`) gets unique branch, progress file, registry entry. Inherits base persona skills. |
| 3 | **Dual-Gate Lifecycle Gating** | Phase exit requires BOTH artifact completion AND MBO metric pass. "Planned gaps" can be declared to unblock phases. |
| 4 | **Isolated `orchestrator/` Monorepo** | Sits under `projects/team1/orchestrator/` as clean TypeScript repo. Separates engine from agent space. |
| 5 | **Decoupled Microservices** | 6 processes + Redis Streams. No shared database. At-least-once delivery via consumer groups. |

---

## Architectural Pillars

### Pillar 1: Event Bus Transport (`packages/bus-client`)
- **Redis Streams** as transport (`intents:<type>` channels)
- **Idempotency key** (24h TTL) prevents duplicate messages
- **Consumer groups** ensure at-least-once delivery with replay-on-boot
- **Dead-letter stream** for failed messages after 3 retries
- **Contract validation** via JSON Schema (Ajv) at publish time

**Criticality:** FOUNDATIONAL. Everything else depends on this. Must be reliable and well-tested before M1 completion.

### Pillar 2: Intent Contracts (`packages/contracts`)
11 core intent types:
```
FeatureSubmitted → SpawnAgents → TaskCreated → [Agent Turn] → EditIntent → EditApplied
                                                              → TaskCompleted
PhaseGateCheck (with backtrack logic)
MboMetricReport, MergeConflictDetected, AgentStalled
```

**Criticality:** FOUNDATIONAL. Must be finalized before any service writes message handlers.

### Pillar 3: Registry & State Tracking (`services/agent-registry`)
- SQLite database tracking agent instances
- Columns: `id`, `parent_handle`, `feature_slug`, `branch`, `status`, `progress_path`, `active_turns`, `pending_intents`, `last_heartbeat_at`, `created_at`
- System of record for agent lifecycle state
- Queried by health-monitoring for heartbeat checks

**Criticality:** HIGH. Required for M2 (spawning) and M6 (reaping).

### Pillar 4: Polling-Agent Runtime (`runtime/supervisor`)
- Stateful consumer of `intents:TaskCreated`
- Invokes agents via stateless `/zo/ask` endpoint
- Manages heartbeat on agent's behalf (30s interval)
- Parses agent turn results and re-emits intents (EditIntent, TaskCompleted)
- Tracks pending tasks per agent instance

**Criticality:** HIGH. This is the agent-runner orchestrator. Without it, agents can't execute.

### Pillar 5: Git Write Serializer (`orchestrator/edit-coordinator`)
- Consumes `intents:EditIntent` in batches
- Acquires **Redis Redlock** on global `repo:lock:global` key (45s lease)
- Checks out branch → applies file edits → runs lint/test in throwaway worktree → commits/pushes
- On validation failure: `git reset --hard` (rollback, no commit)
- On success: emits `EditApplied` intent

**Criticality:** CRITICAL. Single point of serialization for entire repository. Bottleneck for throughput.

### Pillar 6: Lifecycle State Machine (`services/lifecycle-management`)
- Consumes `MboMetricReport` from `health-monitoring`
- Evaluates dual-gate logic:
  - **Path A:** Artifact complete ✅ + MBO pass ✅ → Advance phase
  - **Path B:** Either gate fails → Backtrack phase (phase-specific rollback map)
  - **Path C:** MBO pass + manager approval flag on "planned-gaps" → Advance phase (Phase 7 special case)
- Maps backward phases (e.g., Phase 4 Testing fail → Phase 3 Implementation)

**Criticality:** HIGH. Core decision engine. Prevents phase-lock deadlocks.

---

## Dependency Graph: Which Milestones Block Others

```
M0: Contract Baseline
  ↓ (Unlocks all parallel work)
  ├─→ M1: Bus & Services Boot ←─┐
  │     (Redis, contracts, 6 containers booting)        │
  │     ↓                                                │
  ├─→ M2: Spawn & Assign        (M1 required first)    │
  │     (agent-registry, orchestrator-api)              │
  │     ↓                                                │
  ├─→ M3: Branch-Only Coordination (M1+M2 required)   │
  │     (edit-coordinator, Redlock)                     │
  │     ↓                                                │
  ├─→ M4: Dual-Gate Lifecycle (M1+M3 required)        │
  │     (lifecycle-management, health-monitoring)       │
  │     ↓                                                │
  ├─→ M5: Multi-Feature Merge (M3+M4 required)        │
  │     (MergeCoordinator, integration locks)           │
  │     ↓                                                │
  └─→ M6: Reap & History (All prior required)         │
        (Teardown, audit trails)                        │

PARALLELIZABLE PAIRS (after M0, M1):
- M2 + contract finalization work (can start simultaneously)
- Basic M3 structure + M2 integration (when M1 complete)
```

**Realistic Dependency Chain:**
- M0 + M1: **Must complete sequentially** (contracts → services boot)
- M1 → M2 → M3: **Tight coupling** (each unlocks next)
- M3 opens M4, M5 in parallel (both depend on lock serializer)
- M6 last (depends on all prior)

---

## The 6 Services & Their Roles

| Service | Port | Input Streams | Output Streams | State | Purpose |
|---------|------|---------------|----------------|-------|---------|
| **orchestrator-api** | 3099 | (HTTP only) | SpawnAgents | None | Entry point for feature submission & agent spawning |
| **agent-registry** | 3106 | SpawnAgents | (DB only) | SQLite | Tracks agent instance lifecycle, heartbeats |
| **runtime/supervisor** | 3105 | TaskCreated, SpawnAgents | EditIntent, TaskCompleted | In-memory task queue | Invokes agents via `/zo/ask`, manages heartbeats |
| **edit-coordinator** | 3103 | EditIntent | EditApplied, MergeConflictDetected | Redis Redlock | Serializes git writes, validates before commit |
| **lifecycle-management** | 3102 | MboMetricReport | PhaseGateCheck | SQLite (phase state) | Gate evaluator, phase backtrack logic |
| **health-monitoring** | 3104 | (All intents via Redis consumer) | MboMetricReport, AgentStalled | SQLite (metrics) | Tracks agent heartbeats, emits health reports |

**Startup Order:**
1. Redis (dependency for all services)
2. All 6 services boot in parallel
3. Redlock coordination begins (M3)
4. Agent tasks can be assigned (M2 forward)

---

## Critical Hotspots & Complexity Zones

### Hotspot 1: The Redlock Serializer (M3)
**Why it matters:** Single point of contention for all file writes.
- **Risk:** If lock acquisition fails or times out, entire orchestrator stalls
- **Mitigation:** Implement exponential backoff (10 retries, 500ms delay per attempt)
- **Concern:** 45s lease for lint+test might be too short for large monorepos. What if test suite takes 60s?
  - **Plan mitigation:** Use throwaway worktree to isolate; run only affected-path tests, not full suite
  - **Realistic concern:** Still unvalidated. May need tuning post-M3.

### Hotspot 2: Phase Backtrack Logic (M4)
**Why it matters:** Backward gate failures can trigger cascading re-work.
- **Risk:** If backtrack map is wrong, agents can loop indefinitely (e.g., Phase 3 fails → backtracks to Phase 2 → re-runs same assignment)
- **Mitigation:** Table in code is explicit; each backward edge must be justified in ADR
- **Concern:** What happens if Phase 7 (Analysis) fails? Current map: Phase 7 → Phase 6 (Monitoring). Is that correct?
  - **Plan mitigation:** Requires product/design review before M4 implementation

### Hotspot 3: Concurrent Feature Merge (M5)
**Why it matters:** Multiple agents across features writing to same repo.
- **Risk:** Merge conflicts, branch dependency tracking, integration validation complexity
- **Mitigation:** `MergeCoordinator` module evaluates feature dependencies before allowing merge
- **Concern:** Automated dependency detection (e.g., "beta depends on alpha") is not trivial. Requires path-level analysis.
  - **Plan mitigation:** Start with explicit dependency declaration API; move to heuristic detection later

### Hotspot 4: Agent Polling & Heartbeat (M2 forward)
**Why it matters:** Agents are invoked via stateless `/zo/ask`, not persistent connections.
- **Risk:** If supervisor crashes, heartbeat mechanism breaks; agents marked stalled prematurely
- **Mitigation:** Supervisor maintains heartbeat on behalf of agent; stored in registry DB
- **Concern:** What if supervisor crashes mid-heartbeat update? (Partial write to DB)
  - **Plan mitigation:** Use atomic SQLite transactions; replay from Redis stream on reboot

---

## Scope: What's IN vs. OUT

### What's IN
- Redis Streams bus with contract validation
- 6 isolated TypeScript services (monorepo structure)
- Git branch isolation per agent instance
- Dual-gate phase logic with backward rollback
- Heartbeat & stall detection
- Pre-commit validation via throwaway worktree
- Multi-feature coordination framework

### What's EXPLICITLY OUT (Deferred or Noted as Future)
- Full GraphQL API (REST only in initial plan)
- Real-time event visualization dashboard
- Complex dependency heuristics (Phase 5 M5 uses explicit API)
- Cross-repository orchestration
- Automatic performance tuning (lock lease time, test timeouts)

---

## Execution Risk Summary

| Risk | Severity | Mitigation | Owner |
|------|----------|-----------|-------|
| Redlock lease timeout during heavy testing | HIGH | Profile test suite early; implement adaptive lease adjustment | M3 |
| Backtrack phase map incorrectness | HIGH | Design review + ADR justification before M4 code start | M4 Lead |
| Agent stall detection false positives | MEDIUM | Tune heartbeat interval (30s) & detect grace period (90s) after M2 | M2 |
| Multi-feature merge conflicts | MEDIUM | Start with explicit dependency API; add heuristics post-MVP | M5 |
| SQLite consistency on hard failures | MEDIUM | Implement stream replay-on-boot; document recovery procedure | M1 |

---

## Realistic Timeline Estimate

Assuming 6 engineers working in parallel:

| Milestone | Eng Count | Effort (weeks) | Start | End | Notes |
|-----------|-----------|----------------|-------|-----|-------|
| M0 | 1 | 1 | W0 | W1 | Document baseline, ADRs, contracts |
| M1 | 2 | 2 | W1 | W3 | Redis setup, 6 services boot, health checks |
| M2 | 2 | 2 | W3 | W5 | Spawning, registry, orchestrator-api |
| M3 | 2 | 3 | W5 | W8 | Redlock, edit-coordinator, validation (highest risk) |
| M4 | 2 | 2 | W8 | W10 | Gate logic, phase transitions |
| M5 | 2 | 2 | W10 | W12 | Merge coordinator, dependency tracking |
| M6 | 1 | 1 | W12 | W13 | Teardown, history scraper |
| **Integration & Testing** | 2 | 2 | W8 (overlapping) | W13 | End-to-end scenarios, load testing |
| **Total** | 6 (avg) | **10–13 weeks** | W0 | W13 | Parallelization reduces sequential path |

---

## Open Questions for Design Review

1. **Phase 7 Backtrack:** If analysis fails, should we loop back to Phase 6 (Monitoring) or Phase 3 (Implementation)?
2. **Test Isolation:** Can we safely run only affected-path tests, or do we need full suite validation per commit?
3. **Lock Lease Window:** Is 45s sufficient? Should we measure typical test suite runtime first?
4. **Planned-Gaps Approval:** Who approves planned gaps? Manager role? Explicit token?
5. **Multi-Feature Dependency:** Start with explicit API or heuristic detection? (Affects M5 effort)
6. **Heartbeat Interval:** Is 30s too aggressive? Risk of false-positive stalls in high-latency conditions?
