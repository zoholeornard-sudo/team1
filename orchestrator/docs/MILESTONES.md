# team1 Orchestrator — Milestones

Tracks the 7-milestone build sequence from `orchestrator-design-spec.md`. Updated as work lands.

| # | Milestone | Status | Done when | Evidence |
|---|-----------|--------|-----------|----------|
| 0 | Contracts + scaffold | ✅ Done | 4 contract edits + ADRs + dir tree | `packages/contracts/src/intents.ts`, `docs/adr/0001–0004`, skill-template Turn protocol, lifecycle rev 1.1 |
| 1 | Bus + 6 services boot | ✅ Done | Redis Streams up; 6 services start, ping via intents | `scripts/boot-all.sh`, all services serve `/healthz`; bus-roundtrip test passes |
| 2 | Spawn + assign | ✅ Done | Manager spawns 3 distinct-handle instances; intents route | `orchestrator-api/src/index.ts` spawn flow; `spawn.test.ts` (7 assertions, skipIf API down) |
| 3 | Branch-only coordination | ✅ Done | Agents emit AcquireCheckout{batch}; edit-coordinator serializes | `edit-coordinator/src/index.ts` (209 LOC, Redis lock + scope check); `m3-edit-coordinator.test.ts` (2 tests) |
| 4 | Lifecycle gating with MBO | 🔄 In progress | Feature runs end-to-end; both gates enforced; planned-gaps flow to Phase 7 | `gate-evaluator.ts` (197 LOC, 17 unit tests); `lifecycle-management` `/phase/gate-check` endpoint; `gate-check.test.ts`. **Remaining:** task-management must emit PhaseGateCheck when phase tasks complete |
| 5 | Multi-feature, single repo | ⬜ Not started | Two units ship two features; merge coordination | `MergeConflictDetected` intent defined (stub); `dependsOn` endpoint stubbed in orchestrator-api |
| 6 | Reap + history | ⬜ Not started | Instances reaped; progress reports retained; registry marked `reaped` | `ReapInstance` intent defined; supervisor has reap logic (425 LOC) but not yet wired to feature completion |

## Per-service implementation depth

| Service | LOC | State |
|---------|-----|-------|
| orchestrator-api | 305 | Real — spawn flow, spec endpoint, M5 stubs |
| runtime (total) | 916 | Real — supervisor, seed-context, return-value, zo-ask, context-checkpoint |
| edit-coordinator | 209 | Real — Redis lock, scope-check, git apply+commit |
| lifecycle-management | 346 | Real — gate-evaluator + /phase/gate-check endpoint |
| health-monitoring | 68 | Partial — quality-score only; canary deferred (needs browse daemon) |
| task-management | 54 | **Stub** — healthz only |
| session-management | 54 | **Stub** — healthz only |
| event-coordination | 54 | **Stub** — healthz only |

## Test inventory

| Test file | Tests | Notes |
|-----------|-------|-------|
| contracts.test.ts | 23 | Intent envelope validation, all 22 types |
| gate-evaluator.test.ts | 17 | Gate logic: artifact, MBO, lens, planned gaps |
| quality-score.test.ts | 5 | Weighted composite scoring |
| spec-endpoint.test.ts | 5 | /features/spec endpoint |
| spawn.test.ts | 7 | M2 spawn flow (skipIf services down) |
| m3-edit-coordinator.test.ts | 2 | Branch serialization + scope check |
| gate-check.test.ts | 1 | M4 endpoint integration |
| bus-roundtrip.test.ts | 4 | **3 are placeholder assertions** |
| service-health.test.ts | 7 | /healthz on all services |
| **Total** | **71** | **0 fail** |
