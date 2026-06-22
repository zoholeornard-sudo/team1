# Design Review Reconciliation — designer1 / designer2 / designer3

**Date:** 2026-06-21
**Reconciled by:** `@architect-agent`
**Input:** three independent design reviews of the team1 Orchestrator sketch
**Output:** this reconciliation → fed into `file orchestrator-design-spec.md` §2

---

## Lenses (non-overlapping by design)

| Reviewer | Lens | Approves M0? |
| --- | --- | --- |
| **designer1** | Distributed systems — transport, idempotency, single-writer lock, persistence, failure modes | Yes (with 2 mandatory fixes) |
| **designer2** | Agent experience — how an agent gets work, does work, reports, gets gated, gets reaped | Yes (with 2 M0 contract fixes + 1 M2 risk) |
| **designer3** | Build readiness & contract-ripple — can we execute milestones, what ripples into the 39 skill files | Yes (with M0 scope expanded 2→4 edits) |

The three lenses are **complementary, not redundant** — each catches a class of defect the others structurally cannot.

---

## 1. Convergences (independent agreement → high confidence)

### C1. Execution-model conflict (designer1 M1 ≡ designer2 A1)

Both independently identified the **same root defect** from different angles:

- designer1 (systems): "/zo/ask is request/response — a child cannot hold a Redis subscriber loop."
- designer2 (agent): "When my turn starts, how do I find out what to do? The subscription language implies a push model the execution substrate doesn't support."

**Resolution:** Polling-agent model (option a). `runtime/` is the stateful bridge — subscribes to bus, injects matched `TaskCreated` + current phase into each turn's seed context. Agents never see Redis. → ADR-0004.

### C2. Rendering defects (all three flagged)

- `EditIntent` row truncated mid-enum (load-bearing — hides `op=progress`).
- "Progress report" identity row blank.
- designer3 added a third: `load` field in agent-registry schema undefined.

**Resolution:** All three fixed in the design spec. `load` defined as `{activeTurns, pendingIntents, lastHeartbeatAgeMs}`.

### C3. Approve milestone 0 (unanimous)

All three approve. No reviewer blocks the scaffold.

---

## 2. Divergences (reviewers disagreed → resolved)

### D1. Milestone ordering: when must M1 be resolved?

| Reviewer | Position |
| --- | --- |
| designer1 | "Do not start milestone 1 until M1 resolved" (M1 blocks bus boot) |
| designer3 | Relax to "before milestone 2" — bus boot is M1-independent |

**Resolution:** **Adopted designer3's relaxation.** Ordering: 0 → 1 (bus boot) → resolve M1 → 2 (spawn). M1 is now resolved anyway (§2.1), so the point is moot — but the principle (don't block M1-independent work on M1) stands. designer3's build-readiness lens correctly identified that designer1's constraint was over-tight.

### D2. Is MBO gating a risk or a fix?

| Reviewer | Position |
| --- | --- |
| designer2 | B1: co-equal MBO gates punish ambition; path (c) must be routine, not escalation |
| designer1, designer3 | Silent on this — neither addresses the behavioral side effect of gating |

**Resolution:** **Adopted designer2's B1.** Path (c) is a per-phase default-available declaration, reviewed at Phase 7. designer2 was the only reviewer who thought about *what the gating does to agent behavior* — a blind spot in the systems and build lenses.

---

## 3. Unique findings (each reviewer's distinct contribution)

### designer1-only (distributed systems)

| Finding | Class | Resolution |
| --- | --- | --- |
| M2 — test isolation under global lock (tests serialize across all agents) | Should-fix | Deferred to milestone 3 — tests run on throwaway `git worktree add` clone after lock release |
| Cross-DB consistency (6 SQLite files, no shared transaction) | Should-fix | Resolved — each service replays its stream from last-acked position on boot |
| `MergeConflictDetected` resolution path is a stub | Should-fix | Flagged as known gap in intent catalog; milestone 5 concern (multi-feature merge) |
| Heartbeat 30s / stall 90s vs long `/zo/ask` turn | Should-fix | Resolved — `runtime` emits heartbeat on behalf of child (converges with polling-agent model) |

### designer2-only (agent experience)

| Finding | Class | Resolution |
| --- | --- | --- |
| `ReapInstance` at Phase 7 exit is abrupt — no wrap-up turn | Smaller gap | Resolved — `ReapInstance` preceded by final `TurnEnd` requiring retrospective `EditIntent` applied first |
| No "what is my current phase?" introspection | Smaller gap | Resolved — `runtime` injects current phase + pending gates into every turn's seed context (chosen over query API — cheaper) |
| Skill-template "Turn protocol" section doesn't exist | M0 contract | Resolved — added to `file skill-template.md`; inherited by all 39 skill files |

### designer3-only (build readiness & contract ripple)

| Finding | Class | Resolution |
| --- | --- | --- |
| M0 scope is 4 contract edits, not 2 (skill-template + progress-template on critical path) | **Load-bearing** | Adopted — expanded M0 to 4 edits; both template edits landed before scaffold |
| No authority model for `SpawnAgents` (who is a Manager in code?) | Should-fix | Resolved — `Manager` = agent whose skill file's `Reports To` field names a Manager role; `agent-registry` enforces |
| `featureSlug` is load-bearing but undefined | Should-fix | Resolved — globally-unique kebab-case, minted by `orchestrator-api` at `FeatureSubmitted` time |
| `branch` in envelope vs per-agent branch (which is authoritative?) | Should-fix | Resolved — envelope `branch` authoritative per-intent; instance branch is default when omitted |
| `load` field undefined in registry schema | Rendering | Resolved — concrete schema |

---

## 4. Resolution matrix (every finding → status)

| \# | Source | Finding | Severity | Status |
| --- | --- | --- | --- | --- |
| C1 | d1 M1 / d2 A1 | Execution-model conflict | **M1-blocker** | RESOLVED — polling-agent (ADR-0004) |
| C2 | all three | Rendering defects (EditIntent trunc, blank rows, `load` undefined) | Rendering | RESOLVED — spec + schema fixed |
| C3 | all three | Approve M0 | Verdict | ADOPTED |
| D1 | d1 vs d3 | Milestone ordering for M1 | Process | ADOPTED d3 — relaxed to "before M2" |
| D2 | d2 only | MBO gating punishes ambition (B1) | M0 wording | ADOPTED d2 — path (c) as default |
| d1-M2 | d1 | Test isolation under global lock | M3 should-fix | DEFERRED to milestone 3 |
| d1-xDB | d1 | Cross-DB consistency | Should-fix | RESOLVED — replay on boot |
| d1-merge | d1 | MergeConflictDetected stub | Should-fix | FLAGGED — known gap, M5 |
| d1-hb | d1 | Heartbeat vs long turn | Should-fix | RESOLVED — runtime emits |
| d2-reap | d2 | ReapInstance abrupt | Smaller | RESOLVED — wrap-up turn first |
| d2-intro | d2 | No phase introspection | Smaller | RESOLVED — seed context injection |
| d2-turn | d2 | Skill-template Turn protocol missing | **M0 contract** | RESOLVED — added to template |
| d3-scope | d3 | M0 scope = 4 edits not 2 | **Load-bearing** | ADOPTED — 4 edits landed |
| d3-auth | d3 | SpawnAgents authority undefined | Should-fix | RESOLVED — Reports To check |
| d3-slug | d3 | featureSlug undefined | Should-fix | RESOLVED — kebab, api-minted |
| d3-branch | d3 | branch authority ambiguous | Should-fix | RESOLVED — envelope authoritative |
| d3-load | d3 | load field undefined | Rendering | RESOLVED — concrete schema |

**17 findings total: 13 resolved, 1 deferred (M3), 1 flagged (M5), 2 adopted-as-process.** Zero unresolved.

---

## 5. What each lens caught that the others couldn't

| Lens | Uniquely caught |
| --- | --- |
| **d1 distributed-systems** | Test-lock serialization, cross-DB divergence, merge-resolution stub, heartbeat-vs-turn-length — all *runtime failure modes* invisible from the agent seat or the build plan |
| **d2 agent-experience** | MBO-punishes-ambition, abrupt reap, no phase introspection, missing Turn protocol — all *agent usability* defects invisible from the transport or the milestone plan |
| **d3 build-readiness** | Contract-ripple undercount, SpawnAgents authority, featureSlug, branch authority — all *cross-contract* issues invisible from a single service's internals or a single agent's experience |

The pattern: **systems lens catches runtime failures, agent lens catches usability failures, build lens catches contract-ripple failures.** None subsumes another. The three-lens review was the right structure.

---

## 6. Net effect on the design

- **1 blocker resolved** (C1 execution model → ADR-0004)
- **M0 scope expanded 2→4 edits** (d3-scope — the single most load-bearing finding)
- **1 behavioral risk designed out** (D2 — path (c) as default)
- **1 process decision adopted** (D1 — relaxed milestone ordering)
- **9 should-fixes resolved**, 2 deferred to later milestones (test isolation M3, merge resolution M5)
- **3 rendering defects fixed**

The design that emerged is materially different from the sketch: polling-agent runtime, 4-contract M0, routine planned-gap path, concrete `load`/`featureSlug`/`branch`/Manager-authority contracts. All three reviewers approve M0; the scaffold proceeds.

---

## Revision history

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-06-21 | @architect-agent | Initial reconciliation of designer1/2/3 |
