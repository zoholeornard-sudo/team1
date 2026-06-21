# team1 Orchestrator — Design Specification

**Status:** Approved (milestone 0 scaffold unblocked)
**Date:** 2026-06-21
**Authors:** `@architect-agent` (via Zo), reconciling reviews by designer1 / designer2 / designer3
**Supersedes:** `file sketch1.md` (folded in; sketch retired)
**Authoritative for:** milestone 0 scaffold and all downstream milestones
**Source reviews:** `working_files/drafts/designer1`, `designer2`, `designer3`

> team1's `agent-skills/`, `assignments/`, and `working_files/` define *what* the platform is. The orchestrator is the runtime engine that makes those docs *do*: it reads skill files to spawn agents, pulls MBO targets to set task acceptance criteria, drives the 7-phase lifecycle as enforced phase transitions, and writes progress + artifacts back to the `working_files/` the agents already use. It is not a new system alongside the repo — it is the execution layer for the repo already written.

---

## 1. Three reviewers, three lenses (non-overlapping by design)

| Reviewer | Lens | Verdict |
| --- | --- | --- |
| **designer1** | Distributed systems — transport semantics, idempotency, the single-writer lock, persistence, failure modes, cross-service consistency | Approve M0, **two mandatory fixes** (M1, M2), three should-fix |
| **designer2** | Agent experience — how an agent gets work, does work, reports progress, gets gated, gets reaped. "Not whether the distributed system is sound (designer1 owns that), but whether the system is *usable by the 39 agents it governs*" | Approve M0, **two M0 contract fixes** (A1, A2), one M2 behavioral risk (B1), three smaller agent-experience gaps |
| **designer3** | Build readiness & contract-ripple — "can we actually execute milestones 0→6 on this design, and what contract changes ripple into the 39 skill files, `file AGENTS.md`, `assignments/`, and the progress template?" Authored by `@architect-agent` itself, distinct from designer1's systems lens and designer2's agent-experience lens | Approve M0, **expand M0 scope from 2 to 4 contract edits**, relax M1 ordering, four should-fixes |

The three lenses are complementary — each catches a class of defect the others structurally cannot. designer1 catches what breaks the system; designer2 catches what breaks the agent; designer3 catches what breaks the build sequence.

---

## 2. What each reviewer endorsed (strengths that survived review)

These are not synthesis — they are the explicit endorsements each reviewer led with. They are the load-bearing decisions the spec must not regress.

### 2.1 designer1 endorsements

| Endorsement | Why it survived |
| --- | --- |
| **Idempotency is first-class** | `idempotencyKey` mandatory on every intent, 24h TTL dedupe, `DeadLetter` escape hatch — "the correct response to at-least-once delivery and most agent-orchestrator designs hand-wave it" |
| **Bus topology split is right** | `bus-client` (transport) vs `event-coordination` (policy / observe-in-parallel, not proxy) — "avoids the single-point-of-failure gateway that 'intent bus gateway' usually implies" |
| **Persistence pinned** | SQLite-per-service keeps "own schema, no cross-service joins" real without a second long-running process; Postgres is a documented ADR path rather than a premature dependency |
| **Ceilings are named** | The single-writer lock is acknowledged as a ceiling with a concrete upgrade path (per-path-prefix locks / sharded coordinators). "Not building it now is the correct call for milestones 0–4" |

### 2.2 designer2 endorsements

| Endorsement | Why it survived |
| --- | --- |
| **Progress reports as** `EditIntent` **with** `op=progress` | "The single best decision in the v2 refinement. It makes the sole-writer rule uniform (no special-case FS access for logging), and it means an agent's progress history lives in git alongside its code — reaped instances leave a durable, reviewable trail. Elegant." |
| **MBO-as-co-equal-gate, not MBO-as-afterthought** | The aligned rule (remediate / backward intent / accepted-as-Phase-1-input) is the right framing — treats a metric miss as *information* rather than a hard stop. Agents won't get stuck in an infinite "phase won't exit" loop *as long as the Manager-acceptance path (c) is real and easy* |
| **Distinct-handle inheritance is clean** | An instance inheriting the base skill file but owning its own ID/branch/progress is exactly right — no duplicated persona definitions, no ambiguity about which `@architect-agent` did what |

### 2.3 designer3 endorsements

| Endorsement | Why it survived |
| --- | --- |
| **The milestone sequence is honest** | "Milestone 0 is correctly isolated as the only contract-touching step, and each later milestone has a concrete 'done when.' No fake parallelism." |
| **Two-axis decomposition is stated, not blurred** | Infra axis (processes) vs work axis (branches) kept distinct — "this is the design's load-bearing clarity and it survives review" |
| **ADRs have a home** | `docs/adr/` + the architect skill file's ADR template — "the decisions this review produces can be persisted in the agreed shape" |

---

## 3. Converged findings (independent agreement → high confidence)

### 3.1 Execution-model conflict — designer1 M1 ≡ designer2 A1 — RESOLVED

Both reviewers independently found the same root defect from different angles:

- **designer1 (M1, distributed-systems angle):** "`runtime/` spawns 'a child Zo session (via the `/zo/ask` API or a local subprocess)' and gives it 'bus endpoint (Redis URL) so the child can emit intents via `bus-client`.' But `/zo/ask` is **request/response** — a child invoked that way runs to completion and returns; it cannot hold open a Redis subscriber loop to receive `TaskCreated`, `CheckoutGranted`, or `MergeConflictDetected`. The sketch describes agents that both *emit* and *subscribe*, but only the emit half has a viable mechanism."
- **designer2 (A1, agent-experience angle):** "The spawning flow says 'each instance subscribes to `TaskCreated` intents matching its capability.' But an agent invoked via `/zo/ask` is a single turn — it can't subscribe to anything. From the agent's perspective the question is: *when my turn starts, how do I find out what to do?*"

designer1 offered two coherent options: **(a) Polling agent** — runtime subscribes, dequeues, feeds into `/zo/ask` turns; agent stateless across turns; runtime is the stateful bridge; agents never see Redis. **(b) Long-lived subprocess** — runtime spawns a real process that links `bus-client` and runs its own subscriber loop. designer1 recommended (a) for milestones 0–4.

designer2's two resolution options for A1 map onto designer1's: either runtime hands the agent its `TaskCreated` payload as seed context (push — designer1's (a)), or the agent calls out to query task-management (pull — neither of designer1's options, and designer2 noted "the subscription language implies a push model the execution substrate doesn't support").

**Adopted: option (a) — polling agent, push model.** `runtime/` is the stateful bridge.

| Aspect | Decision |
| --- | --- |
| `runtime/` role | Subscribes to the bus, dequeues intents for an instance, feeds each as seed context into a `/zo/ask` turn |
| Agent across turns | Stateless. Each turn is a fresh `/zo/ask` call; `runtime` holds all state between turns |
| Agent sees Redis? | **No.** Agents never import `bus-client`. All bus interaction is mediated by `runtime` |
| How agent receives work | `runtime` injects the matched `TaskCreated` payload into the turn's seed context (designer2's push model, chosen over pull) |
| `runtime/` is… | The real agent runtime, not just a launcher. designer1: "this fits the `/zo/ask` model cleanly but makes `runtime` the real agent runtime, not just a launcher." |

This resolution is recorded as **ADR-0004**.

### 3.2 Rendering defects — all three reviewers — CORRECTED

designer1 and designer2 both flagged: (1) `EditIntent` row truncated mid-enum (`op ∈ \`create`and cuts off); (2) "Distinct-handle identity" table's Progress-report row blank. designer3 added a third: the`agent-registry entry`row's`load\` field is in the schema but never defined — "undefined fields in a schema are worse than absent ones."

**Corrections applied in this spec:**

- `EditIntent` enum stated in full: `op ∈ { create | update | delete | progress }` (§10).
- Progress-report identity row: `file working_files/progress/<handle>-<instance>-<date>.md` (base persona owns the canonical file; instance inherits persona, owns its own progress file with instance suffix).
- `load` field defined: `{activeTurns: int, pendingIntents: int, lastHeartbeatAgeMs: int}` (§5).
- Code blocks tagged with correct language (`text` for ASCII/flow, `typescript` for code, not `markdown`).

---

## 4. Per-reviewer findings and resolutions

### designer1 — M2 (test isolation under the global lock) — DEFERRED TO MILESTONE 3

> "If tests for branch A touch files outside A's edit batch (common), or are slow, branch B's `AcquireCheckout` blocks behind A's test run — not A's edit. The lock now serializes test execution across all agents, not just writes."

designer1's two options, preserved for the milestone-3 decision:

- **(a)** Tests run **after** release on a throwaway `git worktree add` clone (doesn't violate decision 1 — that's about the *authoritative* working dir, not test scratch space).
- **(b)** Split the lock into `WriteLock` (checkout+apply+commit, short) and run tests async, failing the commit retroactively via a `TestFailed` intent that reverts.

designer1: "M2 can land at milestone 3."

### designer1 — should-fix: `MergeConflictDetected` resolution path is a stub — FLAGGED FOR MILESTONE 5

> "Emitted to 'the owning unit's lead agent' — via what intent does the lead agent *resolve* it? There's no `MergeResolutionApplied` or `RebaseRequested` in the catalog. Conflict resolution is a milestone-5 concern (multi-feature), so this can stay a stub, but flag it as a known gap in the intent catalog rather than implying it's done."

**Resolution:** Flagged as a known gap in §10 and §14. No resolution intent defined yet; milestone 5 will add `MergeResolutionApplied` / `RebaseRequested`.

### designer1 — should-fix: cross-DB consistency — RESOLVED

> "Six SQLite files, no shared transaction. `EditApplied` updates `tasks.db` (progress) and `work.db` (commit log); a crash between the two leaves them divergent. Acceptable if each service reconciles on startup from the bus (replay), but the sketch doesn't say replay-on-boot exists. Add one line."

**Resolution:** Each service **replays its stream from last-acked position on boot** to rebuild in-memory state. This is what makes at-least-once + per-service SQLite actually consistent. Stated in §8 (persistence).

### designer1 — should-fix: heartbeat ownership — RESOLVED

> "`Heartbeat` every 30s, stall at 90s. Fine, but a child stuck in a long `/zo/ask` turn (a 2-minute model call) will miss 4 beats and get reaped mid-work. Either the heartbeat is emitted *by* `runtime` *on behalf of the child* (correct, since `runtime` owns the turn boundary), or the stall timeout must exceed max turn length. Specify which; as written it reads as if the child emits its own heartbeat, which loops back to M1."

**Resolution:** Heartbeat emitted by `runtime` on behalf of the child — every 30s while a turn is in flight; stall at 90s (3 missed beats). This converges naturally with the polling-agent model (§3.1), since `runtime` owns the turn boundary. A child in a long `/zo/ask` call does not miss beats because `runtime` is alive and emitting on its behalf.

### designer2 — A2 (`AcquireCheckout` / `ReleaseCheckout` ergonomics) — RESOLVED

> "The agent requests the lock 'before a batch of edits,' but the sketch doesn't say how the agent *knows* it has a batch ready, or what happens to its `EditIntent`s if `CheckoutDenied` (busy). Does the agent queue intents locally and retry? Does it get `CheckoutDenied` and re-emit `AcquireCheckout` on a backoff? Does `runtime` buffer? If undefined, every agent will invent its own retry behavior and most will get it wrong."

designer2's minimum contract, adopted verbatim:

- Agent emits `AcquireCheckout{batch}` with the **full edit batch attached**.
- `edit-coordinator` either applies-and-commits and returns `EditApplied{commitSha}`, or returns `CheckoutDenied{retryAfterMs}`.
- Agent's turn ends; `runtime` re-enters it later if denied.
- Agent never holds a lock across turns — the lock is held by the coordinator for the duration of one apply.

designer2: "This kills the 'agent holds lock, does more work, releases' pattern (which is unimplementable over `/zo/ask` anyway) and makes the protocol turn-bounded."

### designer2 — B1 (MBO gating punishes ambition) — APPLIED

> "An agent in Implementation knows the phase won't exit unless technical-debt-ratio &lt; 15% (or remediation accepted). The safest way to hit that gate is to write less code, write obvious code, and avoid anything that might spike the debt ratio — which is precisely the opposite of the high-agency, opinionated behavior the skill files (and this whole platform) are trying to elicit. Co-equal MBO gates, applied naively, *punish ambition*."

designer2's recommendation, adopted: path (c) is a **per-phase default-available declaration**, not an escalation. The agent declares "this phase ships X debt points as a planned gap, signed off in the progress report" and the phase exits. The unit Manager reviews all declared gaps **at Phase 7**, not gate-by-gate.

designer2: "If accepting a planned gap is a heavyweight, escalation-only event, agents will avoid it and play safe. If it's a normal, cheap, per-phase declaration, agents will take real swings and declare the debt honestly. The sketch treats (c) as an exception path; it should be a routine path."

**Applied to:** `file .main.lifecycle.md` (revision 1.1 — aligned gating rule) and `file working_files/progress/_template.md` (Planned gaps field added).

### designer2 — smaller gap: `ReapInstance` is abrupt — RESOLVED

> "An agent that just finished Phase 7 gets reaped with no 'wrap up' turn — its final progress report (the retrospective input) has to already be committed. Specify that `ReapInstance` is preceded by a final `TurnEnd` that requires the retrospective `EditIntent` to be applied first; otherwise the most valuable progress report (the one summarizing the whole feature) is the one most likely to be lost."

**Resolution:** `ReapInstance` is preceded by a final `TurnEnd` that requires the retrospective `EditIntent{op=progress}` to be applied first. The most valuable progress report is the last thing committed, not the first thing lost. Stated in §11 (execution loop).

### designer2 — smaller gap: no phase introspection — RESOLVED

> "An agent mid-feature needs to know which phase it's in and what gates are pending, or it can't decide whether to emit `TaskCompleted` or `PhaseGateCheck`. There's no intent/API for the agent to query lifecycle state. Add a `PhaseStatusQuery`/`PhaseStatus` pair, or have `runtime` inject current phase into every turn's seed context (cheaper — prefer this)."

**Resolution:** `runtime` injects current phase + pending gates into every turn's seed context. No query API — designer2's preferred (cheaper) option. Stated in §11 (execution loop, seed context).

### designer2 — smaller gap: skill-template "how to begin a turn" doesn't exist — APPLIED (M0 contract edit)

> "The skill-template 'how to begin a turn' section doesn't exist yet (A1 depends on it). When milestone 0 extends the skill template, add a short 'Turn protocol' subsection: how you receive a task, how you request checkout, how you emit completion. Without it the 39 skill files describe *what* agents do but not *how* they interface with the Orchestrator."

**Applied as M0 contract edit #3** (§6): `file agent-skills/references/skill-template.md` gains a "Turn protocol (Orchestrator runtime)" subsection. This is the dependency A1 needed — without it, A1's resolution has nowhere to be written down for the 39 agents to inherit.

### designer3 — contract-ripple surface (M0 is 4 edits, not 2) — ADOPTED

> "The sketch treats milestone 0 as 'update `file .main.lifecycle.md` + extend AGENTS.md.' That undercounts. The mandatory fixes from designer1/designer2 ripple into **four** inherited contracts, not two."

designer3's ripple map, adopted as the M0 scope:

| Fix (from) | Contract it actually touches |
| --- | --- |
| A1 — how an agent *receives* work (designer2) | `file agent-skills/references/skill-template.md` — Turn protocol subsection inherited by all 39 |
| A2 — `AcquireCheckout{batch}` turn-bounded semantics (designer2) | `file skill-template.md` Turn protocol **and** the intent catalog |
| B1 — path (c) as routine declaration (designer2) | `file .main.lifecycle.md` (applied) **and** `file working_files/progress/_template.md` — Planned gaps field |
| Distinct-handle instances sub-table (decision 2) | `file AGENTS.md` (sketch said this) **and** `file skill-template.md` (instance inheritance note) |

designer3: "If the scaffold starts before the `file skill-template.md` Turn-protocol and the progress-template Planned-gaps field land, the first spawned agents (milestone 2) inherit a template that can't tell them how to begin a turn or how to declare a gap — exactly the 'agents stall / loop / produce thin logs' failure designer2 predicted. **These two template edits are on the milestone-0 critical path, not milestone-2.**"

### designer3 — milestone-ordering relaxation — ADOPTED

> "designer1's M1 (execution-model conflict) is the milestone-1 blocker, and it is genuinely unresolved in the sketch. But from a *build* standpoint the question is narrower than designer1 frames it: **what does** `runtime/` **actually contain?** Until that's pinned, milestone 1's '6 services boot and ping each other' is fine, but milestone 2's 'spawn 3 instances' is unbuildable. So M1 must be resolved **before milestone 2, not before milestone 1** — the bus boot doesn't depend on it."

designer3: "This relaxes designer1's 'do not start milestone 1 until M1 resolved' to 'do not start milestone 2 until M1 resolved,' which keeps the critical path moving."

**Adopted.** M1 is now resolved (§3.1), so this is moot for the current sequence — but the principle stands: **milestone ordering is 0 → 1 (bus boot, M1-independent) → resolve M1 → 2 (spawn).** M1's resolution (polling-agent model, ADR-0004) IS the runtime/ shape pinning designer3 asked for.

### designer3 — should-fix: Manager authority undefined — PINNED

> "The intent catalog says `SpawnAgents` is 'emitted by unit Manager (via api)' but nothing defines *who is a Manager* in code. `agent-registry` needs a Manager-capability check or any agent could spawn. This is a one-line contract."

**Pinned:** `Manager` = agent whose skill file's `Reports To` field names a Manager role. `agent-registry` enforces this check on `SpawnAgents`. Required before milestone 2 spawns anything.

### designer3 — should-fix: `featureSlug` undefined — PINNED

> "`featureSlug` is load-bearing but undefined. It's in the intent envelope, the spawn payload, the branch name, the progress filename — and never specified as a format/scope rule. Is it globally unique? Per-unit? Who mints it? Without a rule, two features collide on `featureSlug` and the work-coordinator can't tell their branches apart."

**Pinned:** `featureSlug` = globally-unique kebab-case, minted by `orchestrator-api` at `FeatureSubmitted` time. No two features share a slug. Required before milestone 2.

### designer3 — should-fix: `branch` authority — PINNED

> "`branch` in the intent envelope vs the per-agent branch in decision 2. The envelope carries `branch` per-intent, but decision 2 says an instance's branch is `feature/<slug>-<handle>`. Are these always equal? If an agent can edit on a branch other than its own (e.g. a shared `feature/<slug>` integration branch), the envelope `branch` diverges from the instance branch — and the work-coordinator's checkout logic needs to know which is authoritative."

**Pinned:** Envelope `branch` is authoritative per-intent. Instance branch `feature/<slug>-<handle>` is the *default* when the envelope omits it. Stated in §10 (intent catalog).

### designer3 — rendering defect: `load` undefined — RESOLVED

> "The 'Distinct-handle identity' table's `agent-registry entry` row says the instance entry is `{id, parentHandle, instanceN, status, load, featureSlug}` but `load` is never defined anywhere — is it CPU? Bus backlog? Concurrent turns? Either define it or drop it from the v1 schema."

**Resolved:** `load` = `{activeTurns: int, pendingIntents: int, lastHeartbeatAgeMs: int}`. Defined in §5, no longer vague.

---

## 5. Five binding decisions

| \# | Decision | Architectural consequence |
| --- | --- | --- |
| 1 | **Branch-only isolation** (no worktrees) | The orchestrator is the sole filesystem writer — agents emit edit intents, the `edit-coordinator` applies them to the agent's branch. One working directory, serialized commits. |
| 2 | **Distinct handles** (`@architect-agent-2`, `-3`, …) | Spawned instances inherit the base persona's skill file but own a distinct ID, branch, progress file, and registry entry. AGENTS.md gains an instances ledger; skill-template gains an inheritance note. |
| 3 | **MBO as co-equal gate** (revised & aligned) | Each phase exits only when *both* the artifact gate and the MBO gate resolve. Three resolution paths: remediate, backward intent, planned-gap declaration (default-available, reviewed at Phase 7 — designer2 B1). |
| 4 | **New** `orchestrator/` **dir** in team1 | Monorepo; sits alongside `agent-skills/`, `assignments/`, `working_files/`. |
| 5 | **Decompose from start** | Bounded contexts are separate service processes from day one. Real transport (Redis Streams) from day one. |

Two decomposition axes, kept distinct (designer3 endorsement §2.3):

- **Infra axis** (decision 5): bounded contexts = separate processes.
- **Work axis** (decision 1): agent work = branches in one repo.

---

## 6. Expanded milestone-0 scope (designer3, 4 contract edits)

designer3 corrected the undercount: milestone 0 touches **four** inherited contracts, not two.

| \# | Contract | Edit | Status |
| --- | --- | --- | --- |
| 1 |  | Revised exit criteria + aligned gating rule (paths a/b/c, path c as default per designer2 B1) | ✅ Applied (rev 1.1) |
| 2 |  | Active-instances ledger section (runtime-populated) + inheritance rule + `load` field definition | ✅ Applied |
| 3 |  | "Turn protocol (Orchestrator runtime)" subsection (designer2 A1/A2) + instance inheritance note | ✅ Applied |
| 4 |  | "Planned gaps" field (designer2 B1) | ✅ Applied |

Without #3 and #4, the first spawned agents (milestone 2) inherit a template that can't tell them how to begin a turn or how to declare a gap — the exact "agents stall / loop / produce thin logs" failure designer2 predicted (§4, designer3 contract-ripple).

---

## 7. Decomposed architecture (decision 5)

```text
projects/team1/orchestrator/
├─ services/
│  ├─ task-management/        → :3101
│  ├─ session-management/     → :3102
│  ├─ health-monitoring/      → :3103
│  ├─ lifecycle-management/   → :3104
│  ├─ event-coordination/     → :3105  (intent gateway — validation choke point)
│  └─ edit-coordinator/       → :3107  (renamed from work-coordinator — designer1 smaller call)
├─ packages/
│  ├─ contracts/              (intent DTOs — runtime-facing, shaped by §3.1)
│  ├─ bus-client/             (Redis Streams primitive — transport only)
│  └─ kernel/                 (importable bootstrap lib, NOT a meta-process — designer1 smaller call)
├─ runtime/
│  ├─ supervisor.ts           (long-lived: spawns/reaps agent-session turns, emits heartbeats)
│  ├─ agent-session.ts        (one /zo/ask turn entrypoint — stateless across turns)
│  ├─ prompt-builder.ts       (assembles seed context from repo docs — the binding)
│  ├─ tools/                  (read, edit, progress, artifact, emit — return-value contract)
│  └─ llm-provider.ts         (pluggable interface)
├─ agent-registry/            → :3106  (durable: SQLite system of record; Manager authority check)
├─ apps/
│  ├─ orchestrator-api/       → :3099  (mints featureSlug; Manager authority check)
│  └─ orchestrator-cli/
├─ data/                      (SQLite files — registry, tasks, workflows)
├─ infra/
│  └─ docker-compose.yml      (redis + services + api + supervisor; logs → Loki :3100 — designer1 smaller call)
└─ docs/
   ├─ README.md               (with the closure sentence above)
   └─ adr/
      ├─ 0001-bounded-contexts-as-processes.md
      ├─ 0002-redis-streams-intent-bus.md
      ├─ 0003-branch-lock-edit-intent-applier.md
      └─ 0004-polling-agent-execution-model.md
```

Each service: clean architecture (Domain → Application → Infrastructure), own schema, no cross-service DB joins, communicates only via intents through `event-coordination`.

**Smaller calls folded in (designer1):**

- `work-coordinator` → `edit-coordinator` — "it applies edits and holds locks; 'work' collides with 'event-coordination' semantically."
- `kernel/` is a shared boot lib each service imports, not a meta-process — "the wording 'boots services' hints at a meta-orchestrator, which is a boot-order SPOF."
- Observability hooks into the existing Loki at `:3100` — "don't invent one."

---

## 8. Persistence (designer1 gap #1, pinned)

| Store | Holds | Why |
| --- | --- | --- |
| **Redis** (ephemeral) | Session state, task queues, in-flight intent stream, heartbeat TTLs | In-memory, bus-adjacent, loss-tolerant. Keyspace prefixes: `t1:task:*`, `t1:session:*`, `t1:registry:hb:*` |
| **SQLite** (durable) | agent-registry (system of record), task records, workflow state, artifact-index mirror | Single-file, zero-ops, lives in `orchestrator/data/`. **Replays stream from last-acked position on boot** (designer1 cross-DB consistency fix). |

Migration trigger to Postgres: multi-writer contention or a second orchestrator host.

---

## 9. Two paths to the bus (designer1 gap #3, pinned)

| Path | Used by | Purpose |
| --- | --- | --- |
| `packages/bus-client` | `event-coordination` (internally); services for intra-service event publish only | Redis Streams wire primitive |
| `event-coordination` (:3105) | **All cross-service intent routing** | Schema validation, `traceId` assignment, ordering, validation choke point |

**Rule: services publish cross-service intents through** `event-coordination`**'s API, never directly to the raw stream.** Bypassing the gateway loses validation + trace correlation — out of contract.

---

## 10. Intent catalog (binding on all services; runtime-facing per §3.1)

| Intent | Emitted by | Consumed by | Notes |
| --- | --- | --- | --- |
| `FeatureSubmitted` | orchestrator-api | lifecycle-management → opens Phase 1 | Mints `featureSlug` (globally-unique kebab-case — designer3) |
| `TaskCreated` | task-management | runtime (matches to agent by capability) → injected as seed context | Runtime-facing, not agent-subscribed (§3.1) |
| `AgentAssigned` | runtime | session-management (opens session) |  |
| `SpawnAgents` | unit Manager (via api) | agent-registry (Manager authority check — designer3), runtime | `Manager` = agent whose `Reports To` names a Manager role |
| `AcquireCheckout{batch}` | agent turn (return value) → runtime → edit-coordinator | edit-coordinator | Full edit batch attached; turn-bounded (designer2 A2, §4) |
| `EditApplied{commitSha}` | edit-coordinator | runtime → next turn's seed context | Applied + committed atomically |
| `CheckoutDenied{retryAfterMs}` | edit-coordinator | runtime → re-enters agent later |  |
| `TaskCompleted` | agent turn (return value) → runtime | task-management, event-coordination |  |
| `PhaseGateCheck` | task-management (all phase tasks done) | lifecycle-management (enforces both gates) |  |
| `MboMetricReport` | health-monitoring | lifecycle-management (co-equal gate) |  |
| `MergeConflictDetected` | edit-coordinator (pre-merge diff) | owning unit's lead agent | **Known gap** (designer1) — no resolution intent yet; milestone 5 |
| `AgentStalled` | health-monitoring (3 missed beats) | runtime (reap), agent-registry (reassign) | Heartbeat emitted by runtime, not child (designer1, §4) |
| `ReapInstance` | runtime (feature done or stall) | agent-registry | Preceded by final `TurnEnd` requiring retrospective `EditIntent{op=progress}` applied first (designer2, §4) |
| `EditIntent` | agent turn (return value) → runtime → edit-coordinator | edit-coordinator | \`op ∈ { create |

Every intent carries: `{type, payload, ts, traceId, featureSlug, branch, idempotencyKey}`. `idempotencyKey` mandatory, 24h TTL dedupe (designer1 endorsement §2.1). Envelope `branch` authoritative per-intent; instance branch `feature/<slug>-<handle>` is the default when omitted (designer3, §4).

---

## 11. Agent execution loop (per turn, per §3.1)

```text
1. runtime dequeues a matched intent (TaskCreated or EditApplied or CheckoutDenied)
2. prompt-builder assembles seed context:
     - skill .md (role, skills, collab-matrix, escalation) via `git show main:<path>`
     - unit MBO from assignments/<project>.json
     - current phase + pending gates (injected every turn — designer2 phase introspection)
     - the matched intent payload
3. llm-provider.call(messages) → returns action list
4. runtime/tools execute each action via return-value contract:
     read(path)        → `git show <ref>:<path>`   (no checkout, no lock)
     edit(path,op,txt) → return AcquireCheckout{batch}; turn ends
     progress(entry)   → EditIntent{op=progress} in the same batch
     artifact(row)     → EditIntent appending to artifact_index.md in the same batch
     emit(intentType)  → return value; runtime publishes via event-coordination
     task_complete()   → return value; runtime emits TaskCompleted
5. turn ends. runtime decides whether to start another turn (more queued intents, or retry on CheckoutDenied)
```

Reads use `git show <ref>:<path>` — ref-stable, no checkout, no lock. Writes flow exclusively through `edit-coordinator` via `AcquireCheckout{batch}`. The agent never opens a file handle.

### Reap sequencing (designer2 smaller fix, §4)

`ReapInstance` is preceded by a final `TurnEnd` that requires the retrospective `EditIntent{op=progress}` to be applied first. The most valuable progress report (the one summarizing the whole feature) is the last thing committed, not the first thing lost.

---

## 12. Supervision

`file runtime/supervisor.ts` is the long-lived service (registered via `register_user_service`, `mode="process"`). It owns the agent process table: spawn, heartbeat-watch (emitting heartbeats on behalf of in-flight turns — designer1, §4), reap-on-stall, reap-on-feature-done with the §11 reap sequencing. Agent sessions are its turns — short-lived, one per intent. The supervisor is the only thing that outlives a turn.

---

## 13. Milestones (revised; M1-independent bus boot per designer3 §4)

| \# | Milestone | Done when | M1 dependency |
| --- | --- | --- | --- |
| 0 | **4 contract edits + scaffold** | Lifecycle rev 1.1, AGENTS.md instances ledger, skill-template Turn protocol, progress-template Planned gaps; ADRs 0001–0004; `orchestrator/` tree + `packages/contracts/` + `file docker-compose.yml` | None |
| 1 | **Bus + 6 services boot** | Redis Streams up; 6 services start, ping each other via intents through event-coordination | None — bus boot is M1-independent (designer3) |
| 2 | **Spawn + assign** | Manager spawns 3 distinct-handle instances; intents route to matched instances; 3 trivial tasks complete with progress files written | **Requires M1 resolved** (it is, §3.1). Also requires `featureSlug` + Manager authority pinned (designer3, §4) |
| 3 | **Branch-only work coordination** | Agents emit AcquireCheckout{batch}; edit-coordinator serializes to correct branches; **test isolation lands here** (designer1 M2, §4) |  |
| 4 | **Lifecycle gating with MBO** | A feature runs end-to-end through 7 phases; both gates enforced; planned-gap declarations flow to Phase 7 (designer2 B1) |  |
| 5 | **Multi-feature, single repo** | Two units ship two features; merge coordination prevents rebase thrash; `MergeConflictDetected` resolution intent lands here (designer1, §4) |  |
| 6 | **Reap + history** | Instances reaped on completion with §11 sequencing; progress reports retained; registry entries marked `reaped` |  |

---

## 14. Open items deferred (not milestone-0)

| Item | Milestone | Source |
| --- | --- | --- |
| `MergeResolutionApplied` / `RebaseRequested` intent | 5 | designer1 should-fix |
| Test isolation model (worktree clone vs split WriteLock + async `TestFailed`) | 3 | designer1 M2 |
| Postgres migration | when scale triggers fire | designer1 persistence |
| Kafka swap for Redis Streams | cross-host agents or &gt;1 orchestrator process | transport-agnostic by design |

---

## Revision history

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-06-21 | `@architect-agent` (via Zo) | Initial consolidated spec from sketch1 + designer1/2/3 reviews |
| 1.1 | 2026-06-21 | `@architect-agent` (via Zo) | Redo based on real designer docs — restructured to track each reviewer's actual review structure (lens / what's strong / mandatory fixes / should-fix / rendering / call); added §2 endorsements, §3 convergences, §4 per-reviewer findings with 16 explicit resolutions; folded in designer2's two previously-dropped smaller gaps (phase introspection, skill-template turn-protocol dependency) and designer3's build-readiness framing |
