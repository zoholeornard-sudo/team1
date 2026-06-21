# team1 Orchestrator — Design Sketch (refined)

> Status: **Decisions locked.** This is the binding plan. Refinement v2 adds: persistence model, agent execution runtime, bus topology clarification, completed intent catalog, idempotency/error model, unit-generic MBO gating, and single-writer ceiling acknowledgment. Markdown rendering fixed.
>
> **Binding decision record:** `file working_files/drafts/architect-decisions.md` — ADR-001…ADR-007, issued by `@architect-agent` after ingesting designer1/2/3. Where this sketch and the ADR set disagree, **the ADR set wins**. The runtime, checkout, and test-isolation sections below have been updated to match.

## How the 5 decisions reshape the design

| \# | Decision | Architectural consequence |
| --- | --- | --- |
| 1 | **Branch-only** | No worktrees. The Orchestrator is the **sole filesystem writer** — agents emit edit intents, the Orchestrator applies them to the agent's branch. One working directory, serialized commits. |
| 2 | **Distinct handles** | Spawned instances get `@architect-agent-2`, `-3`, … Inheritance model: base persona's skill file is the template; instance gets own ID, own progress file, own branch. AGENTS.md gains an instances sub-table. |
| 3 | **Revise & align gating/exit** | MBO metrics become a **co-equal exit condition** alongside artifacts — not bolted on. The lifecycle doc's exit criteria table gets revised (draft below). |
| 4 | **New** `orchestrator/` **dir** | `projects/team1/orchestrator/` — monorepo, sits alongside `agent-skills/`, `assignments/`, `working_files/`. |
| 5 | **Decompose from start** | Bounded contexts are **separate service processes from day one**, not in-process modules. Real transport (Redis Streams) from day one. |

Two decomposition axes, kept distinct:

- **Infra axis** (decision 5): bounded contexts = separate processes.
- **Work axis** (decision 1): agent work = branches in one repo.

## Decomposed architecture (decision 5)

```
projects/team1/orchestrator/
├─ services/                    ← one process per bounded context
│  ├─ task-management/          → :3101
│  ├─ session-management/       → :3102
│  ├─ health-monitoring/        → :3103
│  ├─ lifecycle-management/     → :3104
│  ├─ event-coordination/       → :3105  (intent policy: validation, tracing, dead-letter)
│  └─ agent-registry/           → :3106
├─ packages/
│  ├─ contracts/                ← intent DTO types, event schemas (shared)
│  └─ bus-client/               ← Redis Streams wrapper (shared)
├─ kernel/                      ← boots services, wires DI, starts bus
├─ runtime/                     ← agent-session launcher (the spawner)
├─ work-coordinator/            ← branch lock + edit-intent applier (decision 1)
├─ data/                        ← per-service SQLite DBs (durable state)
├─ apps/
│  ├─ orchestrator-api/         → :3099  (control plane: spawn, status, workflow)
│  └─ orchestrator-cli/         ← `orchestrator` command
├─ infra/
│  └─ docker-compose.yml        ← redis + the 6 services + api
└─ docs/
   └─ adr/                      ← ADRs per the architect agent's template
```

Each service: clean architecture (Domain → Application → Infrastructure), own schema, no cross-service DB joins, communicates **only** via intents over the bus.

**Transport: Redis Streams** (not Kafka) to start. Simplest reliable at-least-once transport; the `bus-client` package abstracts it so Kafka is a drop-in later.

**Intent envelope** (every intent carries these):

```
{ type, payload, ts, traceId, featureSlug, branch, idempotencyKey, emittedBy }
```

The `idempotencyKey` (derived from `traceId + type + seq`) is mandatory — at-least-once delivery requires idempotent consumers. Each service tracks processed keys with a 24h TTL; duplicates are acked and dropped.

## Persistence model

Redis is the **bus only** — it is not the state store. Each service owns a durable SQLite database under `orchestrator/data/<service>.db`:

| Service | DB | Contents |
| --- | --- | --- |
| task-management | `tasks.db` | tasks, phase-task links, completion records |
| session-management | `sessions.db` | session metadata, bus subscription filters |
| agent-registry | `registry.db` | persona catalog, instance records, reap history |
| lifecycle-management | `lifecycle.db` | feature → phase state, gate results, remediation backlogs |
| health-monitoring | `health.db` | heartbeats, stall events, MBO metric snapshots |
| work-coordinator | `work.db` | checkout lock log, applied-edit commit SHAs |

SQLite is file-backed, needs no extra process, and keeps the "own schema, no cross-service joins" rule honest. **Postgres is the documented upgrade path** when a service outgrows single-file SQLite — captured as an ADR stub in `docs/adr/`.

## Bus topology — `bus-client` vs `event-coordination`

These are **not** two ways to publish. They are different concerns:

| Component | Layer | Responsibility |
| --- | --- | --- |
| `bus-client` (package) | Transport library | Read/write Redis Streams. Used by **every** service and by agent sessions. No business logic. |
| `event-coordination` (service) | Policy | Subscribes to **all** streams. Validates each intent against the `contracts/` schema; propagates `traceId` across service boundaries; routes invalid intents to a dead-letter stream; owns replay. |

Services publish **directly** to Redis via `bus-client`. `event-coordination` does **not** proxy traffic — it observes and enforces policy in parallel. This avoids a single-point-of-failure gateway while still giving us schema validation and trace continuity.

## Agent execution runtime

> **Binding decision — ADR-001.** The execution model is **option (a): polling agent**. `runtime/` is the stateful bridge, not a thin launcher. See `file projects/team1/working_files/drafts/architect-decisions.md`. This resolves the M1/A1 conflict (designer1/designer2): `/zo/ask` is request/response and cannot hold a bus subscriber loop, so the agent neither subscribes to nor sees Redis.

`runtime/` is a **stateful bridge**, not an LLM host and not a thin launcher. It does not run model inference in-process. For each spawned instance it owns a **session loop**:

1. Reserves the instance ID via `agent-registry`.
2. Opens a Redis subscription (via `bus-client`) scoped to that instance's capability filter — **`runtime` subscribes, the agent never does.**
3. Spawns a **child Zo session** (via the `/zo/ask` API) seeded with:
   - base skill file path (inherited role/skills/collaboration-matrix/escalation — decision 2)
   - unit MBO loaded from `file assignments/<project>.json`
   - `featureSlug` + branch name (decision 1)
   - **the assigned `TaskCreated` payload** (the agent's task is handed to it in the seed — see ADR-001/A1; the agent never pulls work)
   - **current phase + pending gates** (injected every turn so the agent can decide `TaskCompleted` vs `PhaseGateCheck` — ADR-006, resolves designer2's "no phase introspection")
   - bus endpoint is **not** given to the child — the child returns intents as structured output in its `/zo/ask` response, and `runtime` publishes them.
4. Emits `AgentAssigned` → `session-management` opens the session record.

**Turn protocol (turn-bounded, stateless across turns):** `runtime` dequeues a bus intent for the instance (e.g. `TaskCreated`, `CheckoutGranted`, `MergeConflictDetected`), packs it + session state into a `/zo/ask` turn, the child runs to completion and returns any intents to emit (`EditIntent`, `AcquireCheckout{batch}`, `TaskCompleted`, progress `EditIntent`); `runtime` publishes them and decides whether to start another turn. The agent is **stateless across turns** — all state lives in `runtime` + the service DBs. **Agents never touch the filesystem and never see Redis** (decision 1, extended).

**Heartbeat protocol (ADR-004):** the heartbeat is emitted **by `runtime` on behalf of the child**, once per turn boundary — not by the child itself. This is correct because `runtime` owns the turn boundary; a child stuck in a long `/zo/ask` turn cannot emit its own beat and would otherwise be reaped mid-work. Stall declared after 90s of no turn-boundary beat → `AgentStalled` → `agent-registry` reassigns.

**Checkout protocol (ADR-002, resolves designer2 A2):** the agent emits `AcquireCheckout{batch}` with the **full edit batch attached** in a single turn's output. `work-coordinator` either applies-and-commits and returns `EditApplied{commitSha}`, or returns `CheckoutDenied{retryAfterMs}`. The agent **never holds a lock across turns** — the lock is held by the coordinator for the duration of one apply, and the protocol is turn-bounded. No agent-side retry loops; `runtime` re-enters the agent on `CheckoutDenied` after the backoff.

## Branch-only coordination (decision 1)

Since there are no worktrees, the collision problem moves to commit serialization. The model:

| Component | Role |
| --- | --- |
| **work-coordinator** | Holds a single mutex on the repo working directory. Owns `git checkout`, `git commit`, `git push`. |
| **EditIntent** | `{agentId, branch, path, op, content}` — `op` ∈ `create | update | delete | progress` (the `progress` op targets `working_files/progress/<handle>-<date>.md` and is how agents log activity without touching the FS). |
| **AcquireCheckout / ReleaseCheckout** | Agents request the lock before a batch of edits; coordinator checks out their branch, applies the batch, commits, releases. |

```
Agent session emits AcquireCheckout{batch} (full edit batch attached — ADR-002)
→ work-coordinator acquires the write lock (checkout + apply + commit only — short)
→ git checkout <agent-branch>
→ applies edits
→ git commit + push
→ releases the write lock
→ emits EditApplied{agentId, commitSha}
→ spawns a throwaway `git worktree` (test scratch only — does NOT violate decision 1, which covers the authoritative working dir) and runs lint/test for touched paths
→ on pass: emits EditApplied already done; on fail: emits TestFailed{agentId, commitSha, failures} → work-coordinator reverts the commit
```

**Lock split (ADR-003, resolves designer1 M2):** the global lock serializes **writes only** (checkout + apply + commit — short), not test execution. Tests run **after** lock release on a throwaway worktree, so a slow suite on branch A never blocks branch B's `AcquireCheckout`. A `TestFailed` intent reverts the commit retroactively. This keeps the single-writer ceiling honest without making tests a global serialization point.

## Distinct-handle identity (decision 2)

| Element | Base persona (`@architect-agent`) | Instance (`@architect-agent-2`) |
| --- | --- | --- |
| Skill file | `file agent-skills/architect-agent-skills.md` (authoritative) | **Inherits** base; no separate skill file |
| Progress report | `working_files/progress/architect-agent-<date>.md` | `working_files/progress/architect-agent-2-<date>.md` |
| Branch | `main` / feature branch | `feature/<slug>-architect-agent-2` |
| agent-registry entry | capability catalog source | runtime instance: `{id, parentHandle, instanceN, status, featureSlug}` |
| AGENTS.md | static row | **instances sub-table** below the unit, listing active instances |

Inheritance rule: an instance reads its base persona's skill file for role/skills/collaboration-matrix/escalation-triggers, but its **identity** (ID, progress log, branch, registry entry) is distinct. When an instance completes and is reaped, its progress reports remain in `working_files/progress/` as history; the registry entry is marked `reaped`.

## Lifecycle gating revision (decision 3)

Current exit criteria are artifact-only. Revised so MBO is co-equal and **aligned** (a phase exits only when **both** gates pass, or an accepted remediation feeds the next Planning):

| \# | Phase | Revised exit criteria (artifact **AND** MBO) |
| --- | --- | --- |
| 1 | Planning | Scope doc approved **AND** metric targets loaded from `file assignments/<project>.json` with baselines recorded. |
| 2 | Architecture | ARB sign-off, NFRs shown achievable **AND** architecture-review-coverage MBO on target (100% of major changes). |
| 3 | Implementation | Code merged via PR, unit/integration tests green **AND** technical-debt-ratio MBO on target (&lt;15%) or remediation backlog accepted by Manager. |
| 4 | Testing | QA gate passed **AND** bug-escape-rate MBO on target (&lt;5%) or accepted remediation. |
| 5 | Deployment | Deployment success, release notes published **AND** deployment-success-rate MBO on target (&gt;99%). |
| 6 | Monitoring | SLOs observed **AND** the owning unit's MBO metrics within target (e.g. SaaS: 99.9% uptime / sub-200ms; Cloud: 95% cost util; Sec: zero critical vulns); off-target triggers a `RemediationIntent` back to the relevant phase, not a silent pass. |
| 7 | Analysis | Retrospective complete, improvements backlogged **AND** MBO gaps from phases 3–6 are mandatory inputs to the next cycle's Phase 1. |

> Phase 6 now references **the owning unit's** MBO generically — the prior draft hardcoded SaaS's 99.9%/sub-200ms, which was wrong for the other 8 units. Each unit's targets come from `file assignments/<project>.json`.

**Aligned rule**: an MBO miss does **not** block forever — it either (a) gets remediated in-phase, (b) triggers a backward `RemediationIntent` to the relevant phase (e.g. Monitoring → Implementation), or (c) is accepted by the unit Manager as a planned gap that becomes a Phase-1 input next cycle. The Orchestrator's `lifecycle-management` service enforces this: no phase transition without both gates resolved. This is the "revise and align" — gating and exit are now one coherent rule, not two competing ones.

## Intent catalog (binding on all services)

| Intent | Emitted by | Consumed by |
| --- | --- | --- |
| `FeatureSubmitted` | orchestrator-api | lifecycle-management → opens Phase 1 |
| `TaskCreated` | task-management | agent-registry (match), session-management (open session) |
| `AgentAssigned` | agent-registry | runtime (launch session), session-management |
| `SpawnAgents` | unit Manager (via api) | agent-registry, runtime |
| `Heartbeat` | agent session | health-monitoring |
| `EditIntent` | agent session | work-coordinator (decision 1) |
| `AcquireCheckout` | agent session | work-coordinator |
| `CheckoutGranted` / `CheckoutDenied` | work-coordinator | agent session |
| `EditApplied` | work-coordinator | task-management (progress), session-management |
| `TestFailed` | work-coordinator (post-commit test on throwaway worktree — ADR-003) | work-coordinator (revert commit), task-management |
| `TaskCompleted` | agent session | task-management, event-coordination |
| `PhaseGateCheck` | task-management (all phase tasks done) | lifecycle-management (enforces decision 3 gates) |
| `MboMetricReport` | health-monitoring | lifecycle-management (co-equal gate) |
| `RemediationIntent` | lifecycle-management | task-management (re-opens a phase) |
| `MergeConflictDetected` | work-coordinator (pre-merge diff) | owning unit's lead agent |
| `MergeResolutionApplied` | owning unit's lead agent | work-coordinator — **stub, milestone-5 gap** (designer1): resolution path for `MergeConflictDetected` is not yet specified; flagged here as a known gap rather than implied done. |
| `MergeRequested` | lifecycle-management (phase 5 exit) | work-coordinator |
| `MergeOrdered` / `MergeCompleted` | work-coordinator | lifecycle-management |
| `AgentStalled` | health-monitoring (heartbeat loss) | agent-registry (reassign) |
| `ReapInstance` | lifecycle-management (phase 7 exit) | runtime, agent-registry |
| `InstanceReaped` | runtime | agent-registry (mark `reaped`), session-management (close) |
| `DeadLetter` | event-coordination (schema-invalid intent) | orchestrator-api (surfaced to Manager) |

All intents carry `idempotencyKey`; consumers dedupe. `DeadLetter` is the escape hatch for malformed intents — they never silently disappear.

## Spawning flow (distinct handles + decomposed)

```
Manager → POST /agents/spawn {unit, personaHandle, capability, count, featureSlug}
→ orchestrator-api validates Manager authority
→ agent-registry reserves IDs: @architect-agent-2 .. -N (decision 2)
→ for each instance:
    • runtime spawns child Zo session seeded with:
        - base skill file (inherited role/skills/collab-matrix/escalation)
        - unit MBO from assignments/<project>.json
        - featureSlug + branch name (decision 1)
        - capability subscription filter on bus
        - bus endpoint (Redis URL)
    • session emits AgentAssigned → session-management opens session
    • session begins Heartbeat cadence (30s)
→ each instance subscribes to TaskCreated intents matching its capability
→ work begins; EditIntents flow through work-coordinator (serialized)
```

## Revised milestones (decomposed from start)

| \# | Milestone | Done when |
| --- | --- | --- |
| 0 | **Contracts extension** — feature-manifest schema; instance-aware progress filename; AGENTS.md instances sub-table; **revised lifecycle exit criteria applied** (decision 3) | `file .main.lifecycle.md` updated; AGENTS.md extended |
| 1 | **Bus + 6 services boot** — Redis Streams up; 6 services start, ping each other via intents | `docker compose up` → all 6 report healthy via `HealthCheck` intents |
| 2 | **Spawn + assign** — Manager spawns 3 instances of one persona; intents route to matched instances | 3 distinct-handle agents complete a trivial task each, progress files written |
| 3 | **Branch-only work coordination** — agents emit EditIntents; work-coordinator serializes to correct branches | 2 agents edit different files concurrently on different branches, no collision |
| 4 | **Lifecycle gating with MBO** — a feature runs end-to-end through 7 phases; both gates enforced per decision 3 | A feature completes Phase 7 with MBO gaps backlogged to next Phase 1 |
| 5 | **Multi-feature, single repo** — two units ship two features; merge coordination prevents rebase thrash | Two PRs merge in dependency order with no manual rebase |
| 6 | **Reap + history** — instances reaped on completion; progress reports retained; registry entries marked `reaped` | A completed feature's agent instances are gone but their progress logs persist |

Milestone 0 is the only one that touches existing contracts — and it's the one that makes decisions 2 and 3 real.

## What's unblocked next (milestone 0)

Two concrete actions, both ready:

1. **Apply the lifecycle gating revision** to `file projects/team1/.main.lifecycle.md` — the revised exit-criteria table above. Contract change affecting all 39 agents; needs explicit go-ahead before editing the canonical doc.
2. **Scaffold** `orchestrator/` — create the dir structure, `file docker-compose.yml`, `packages/contracts/` with intent DTO types, `data/` for SQLite, and stub service entry points. No business logic yet.

Say "apply both" and I'll do 1 then 2 in order.