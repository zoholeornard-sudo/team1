# Architect Decision Set — ingesting designer1, designer2, designer3

**Issued by:** `@architect-agent` (SaaS Development Unit)
**Status:** Binding on milestones 0–6. Supersedes any conflicting wording in `sketch1.md`.
**Ingested:** `designer1` (distributed-systems), `designer2` (agent-experience), `designer3` (build-readiness & contract-ripple).

All three reviewers approved milestone 0. The convergent finding across designer1 (M1) and designer2 (A1) — the execution-model/bus-subscriber conflict — is the single most important defect and is resolved below as **ADR-001**. designer3's contract-ripple map expands milestone 0 from two contract edits to four; that expansion is accepted and reflected in the revised milestone-0 scope.

---

## ADR-001: Execution model — polling agent, runtime is the stateful bridge

**Status:** Accepted
**Resolves:** designer1 M1, designer2 A1
**Context:** `/zo/ask` is request/response. A child invoked that way runs one turn and returns; it cannot hold a Redis subscriber loop to receive `TaskCreated`, `CheckoutGranted`, or `MergeConflictDetected`. The sketch described agents that both emit and subscribe, but only the emit half had a mechanism.
**Decision:** **Option (a) — polling agent.** `runtime/` is the stateful bridge, not just a launcher.

- `runtime` owns the Redis subscription per instance. It dequeues intents addressed to that instance and feeds each into a `/zo/ask` turn as seed context.
- The agent is **stateless across turns**. Per-turn seed context (injected by `runtime`) carries: base skill file path, unit MBO, `featureSlug` + branch, **current phase + pending gates** (resolves designer2's "no phase introspection"), and the dequeued intent payload (the task, or a `CheckoutGranted`/`CheckoutDenied`/`MergeConflictDetected` reply).
- The agent emits intents (`EditIntent`, `TaskCompleted`, `AcquireCheckout`, progress `EditIntent`) by returning them in its `/zo/ask` response; `runtime` publishes them via `bus-client`. **Agents never see Redis.**
- **Heartbeat is emitted by `runtime` on behalf of the child**, not by the child. This resolves designer1's "long turn reaped mid-work" problem and the M1 loop — the bridge owns the turn boundary, so heartbeats continue across a 2-minute model call.
- `runtime` holds session state (turn count, last checkpoint, in-flight batch); the child holds none.

**Consequences:** `runtime` becomes the real agent runtime — more responsibility than "launcher," which is honest. Statelessness makes restart/replay cheap (re-seed from `session-management` + bus replay). **Trade-off accepted:** `runtime` is now a single component every agent depends on; mitigated by it being stateless per-instance (one bridge process per instance, crash = respawn + replay).
**Alternatives rejected:** (b) long-lived subprocess with its own subscriber loop — more infra, closer to "agent as persistent actor," premature for milestones 0–4.

---

## ADR-002: Checkout is turn-bounded; the agent never holds a lock

**Status:** Accepted
**Resolves:** designer2 A2, and the unimplementable "agent holds lock across turns" pattern
**Decision:** `AcquireCheckout{batch}` carries the **full edit batch** attached. `work-coordinator` either applies-and-commits in one shot and returns `EditApplied{commitSha}`, or returns `CheckoutDenied{retryAfterMs}`. The agent's turn ends either way; `runtime` re-enters it later on `CheckoutDenied`. **The lock is held by the coordinator for the duration of one apply, never across turns.**

**Consequences:** Kills the "acquire → do more work → release" pattern (unimplementable over `/zo/ask` anyway). No agent-side retry logic — `runtime` handles backoff from `retryAfterMs`. The agent's Turn protocol (see ADR-004) becomes: emit `AcquireCheckout{batch}` → end turn → next turn opens with `EditApplied` or `CheckoutDenied` in seed context.

---

## ADR-003: Test execution runs on a throwaway worktree, after lock release

**Status:** Accepted
**Resolves:** designer1 M2 (global lock serializes test runs across all agents)
**Decision:** The `work-coordinator` lock covers **checkout + apply + commit** only (short). Tests run **after release** on a throwaway `git worktree add` scratch clone — this does **not** violate decision 1, which governs the *authoritative* working directory, not test scratch space. If post-commit tests fail, `work-coordinator` emits `TestFailed{commitSha, branch}` and reverts the commit.

**Consequences:** Branch B's `AcquireCheckout` is no longer blocked behind branch A's test suite. `TestFailed` is added to the intent catalog (consumed by `task-management` → reopens the task; emitted to the owning agent via `runtime`).
**Alternatives rejected:** async tests failing the commit retroactively without revert — leaves broken commits in history.

---

## ADR-004: skill-template gains a "Turn protocol" subsection (milestone-0 contract)

**Status:** Accepted — milestone-0 critical path
**Resolves:** designer2 A1/A2, designer3 contract-ripple
**Decision:** `agent-skills/references/skill-template.md` gets a new **"Turn protocol"** section inherited by all 39 skill files. It documents, in agent terms: how you receive a task (it's in your seed context — you don't subscribe), how you request checkout (`AcquireCheckout{batch}`, turn ends, you get the result next turn), how you emit completion (`TaskCompleted` in your response), and that you are stateless across turns. Without this, the skill files describe *what* agents do but not *how* they interface with the Orchestrator.

---

## ADR-005: progress template gains a "Planned gaps" field (milestone-0 contract)

**Status:** Accepted — milestone-0 critical path
**Resolves:** designer2 B1, designer3 contract-ripple
**Decision:** `working_files/progress/_template.md` gets a **"Planned gaps"** field. This operationalizes path (c) as a routine per-phase declaration: an agent records debt/metric gaps here as a normal field, not an escalation. The Manager reviews accumulated declared gaps at Phase 7. This is what makes co-equal MBO gating not punish ambition — the gate stays honest (gaps are *declared*, never hidden) while agents take real swings.

---

## ADR-006: featureSlug contract + Manager authority

**Status:** Accepted
**Resolves:** designer3 should-fix (featureSlug undefined, SpawnAgents authority)
**Decision:**
- `featureSlug` = globally-unique kebab-case, **minted by `orchestrator-api` at `FeatureSubmitted` time**. It is the join key across intent envelope, branch name, progress filename, and registry entry.
- Envelope `branch` is **authoritative per-intent**; the instance branch (`feature/<slug>-<handle>`) is the **default** when the envelope omits `branch`. An agent editing a shared `feature/<slug>` integration branch sets envelope `branch` explicitly.
- `Manager` authority for `SpawnAgents` = the agent whose skill file's `Reports To` field names a Manager role. `agent-registry` enforces this check; non-Managers' `SpawnAgents` intents are `DeadLetter`'d.

---

## ADR-007: cross-DB consistency via replay-on-boot

**Status:** Accepted
**Resolves:** designer1 should-fix (six SQLite files, no shared transaction)
**Decision:** Each service rebuilds its in-memory + DB state from its stream's last-acked position **on boot**. This is what makes at-least-once delivery + per-service SQLite actually consistent: a crash between `EditApplied` updating `tasks.db` and `work.db` is reconciled by replay. Add one line to each service's startup: "replay from last-acked; idempotencyKey dedupe applies."

---

## Known gaps (deferred, not blocking)

- **`MergeConflictDetected` resolution path** (designer1 should-fix): milestone-5 concern. Added to the catalog as a known stub; `MergeResolutionApplied` intent to be defined at milestone 5.
- **`load` field in the registry instance schema** (designer3 rendering defect): dropped from the v1 schema — undefined fields are worse than absent ones. Re-introduce at milestone 5 with a concrete definition (likely "concurrent in-flight turns") if load-based scheduling is needed.

---

## Revised milestone-0 scope (accepted expansion)

| Edit | Contract | Driven by |
| --- | --- | --- |
| Apply gating revision | `.main.lifecycle.md` | decision 3, B1 — **DONE** |
| Instances sub-table | `AGENTS.md` | decision 2 |
| Turn protocol subsection | `agent-skills/references/skill-template.md` | ADR-004 (A1/A2) |
| Planned-gaps field | `working_files/progress/_template.md` | ADR-005 (B1) |

**Milestone ordering, relaxed per designer3:** 0 → 1 (bus boot, M1-independent) → resolve M1 (ADR-001, now resolved) → 2 (spawn). The bus boot is **not** blocked on the execution-model decision; spawn is.

---

## Rendering defects in `sketch1.md` (to fix now — file is about to be canonical)

1. `EditIntent` table row truncated mid-enum → restore `op` ∈ `create | update | delete | progress`.
2. "Distinct-handle identity" table — "Progress report" row has two empty cells → restore base/instance progress-file paths.
3. All code blocks tagged ` ```markdown ` (incl. ASCII tree, shell flow, JSON) → remove wrong language tags.
4. `agent-registry entry` row: drop undefined `load` field (ADR-007 known gaps).

These four are applied to `sketch1.md` in the same pass as reflecting ADR-001/002/003/006/007.
