# team1 Orchestrator — Milestones

Tracks the 7-milestone build sequence from `file orchestrator-design-spec.md`. Updated as work lands.

| \# | Milestone | Status | Done when | Evidence |
| --- | --- | --- | --- | --- |
| 0 | Contracts + scaffold | ✅ Done | 4 contract edits + ADRs + dir tree | `file packages/contracts/src/intents.ts`, `docs/adr/0001–0004`, skill-template Turn protocol, lifecycle rev 1.1 |
| 1 | Bus + 6 services boot | ✅ Done | Redis Streams up; 6 services start, ping via intents | `file scripts/boot-all.sh`, all services serve `/healthz`; bus-roundtrip test passes |
| 2 | Spawn + assign | ✅ Done | Manager spawns 3 distinct-handle instances; intents route | `file orchestrator-api/src/index.ts` spawn flow; `file spawn.test.ts` (7 assertions, skipIf API down) |
| 3 | Branch-only coordination | ✅ Done | Agents emit AcquireCheckout{batch}; edit-coordinator serializes | `file edit-coordinator/src/index.ts` (276 LOC, Redis lock + scope check); `file m3-edit-coordinator.test.ts` (2 tests) |
| 4 | Lifecycle gating with MBO | ✅ Done | Feature runs end-to-end; both gates enforced; planned-gaps flow to Phase 7 | `file gate-evaluator.ts` (197 LOC, 17 unit tests); `lifecycle-management` `/phase/gate-check` endpoint; `task-management` emits `PhaseGateCheck` when phase tasks complete (185 LOC); `file gate-check.test.ts` + `file task-management.test.ts` (5 tests total) |
| 5 | Multi-feature, single repo | 🔄 In progress | Two units ship two features; merge coordination | `dependsOn` endpoint in orchestrator-api; `file m5-merge-coordination.test.ts` (9 tests — cycle detection, self-dep, auth gate). **Remaining:** `MergeConflictDetected` resolution intent; end-to-end two-feature merge test |
| 6 | Reap + history | ⬜ Not started | Instances reaped; progress reports retained; registry marked `reaped` | `ReapInstance` intent defined; supervisor has reap logic (425 LOC) but not yet wired to feature completion |

## Per-service implementation depth

| Service | LOC | State |
| --- | --- | --- |
| orchestrator-api | 305 | Real — spawn flow, spec endpoint, M5 dependsOn stubs |
| runtime (total) | 916 | Real — supervisor, seed-context, return-value, zo-ask, context-checkpoint |
| edit-coordinator | 276 | Real — Redis lock, scope-check, git apply+commit |
| lifecycle-management | 383 | Real — gate-evaluator + /phase/gate-check endpoint + bus emission |
| agent-registry | 140 | Real — SQLite registry, register/query/reap endpoints |
| task-management | 185 | Real — task CRUD, phase-task tracking, PhaseGateCheck emission |
| health-monitoring | 122 | Partial — quality-score + healthz; canary deferred (needs browse daemon) |
| session-management | 54 | Stub — healthz only |
| event-coordination | 54 | Stub — healthz only |

## Test inventory

| Test file | Tests | Notes |
| --- | --- | --- |
| contracts.test.ts | 23 | Intent envelope validation, all 22 types |
| gate-evaluator.test.ts | 17 | Gate logic: artifact, MBO, lens, planned gaps |
| m5-merge-coordination.test.ts | 9 | Cycle detection, self-dep rejection, auth gate |
| spawn.test.ts | 7 | M2 spawn flow (skipIf services down) |
| service-health.test.ts | 8 | /healthz on all services |
| quality-score.test.ts | 5 | Weighted composite scoring |
| spec-endpoint.test.ts | 5 | /features/spec endpoint |
| task-management.test.ts | 4 | Task CRUD + PhaseGateCheck emission |
| m3-edit-coordinator.test.ts | 2 | Branch serialization + scope check |
| bus-roundtrip.test.ts | 3 | Bus publish/consume round-trip |
| gate-check.test.ts | 1 | M4 endpoint integration |
| **Total** | **84** | **0 fail** |
