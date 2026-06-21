# Artifact Index

Central ledger of deliverables produced by team1 agents. Every artifact logged in a progress report should also appear here. Append rows; do not delete historical entries (mark superseded ones with status `superseded` and link the replacement).

## Schema

| Column | Description |
|--------|-------------|
| ID | `A-NNNN`, zero-padded, monotonic. |
| Date | YYYY-MM-DD (UTC). |
| Agent | Producing agent handle. |
| Unit | Owning unit. |
| Artifact | Display name. |
| Path | Location (relative to repo root, or external URL). |
| Type | dataset / model / report / diagram / adr / code / config / other. |
| Phase | Lifecycle phase that produced it. |
| Status | active / draft / superseded / deprecated. |
| Notes | Brief context or dependencies. |

## Ledger

| ID | Date | Agent | Unit | Artifact | Path | Type | Phase | Status | Notes |
|----|------|-------|------|----------|------|------|-------|--------|-------|
| A-0002 | 2026-06-21 | @architect-agent | SaaS Development | Orchestrator Design Spec | `working_files/drafts/orchestrator-design-spec.md` | adr | Architecture | active | v1.1 — redone based on real designer docs; restructured to track each reviewer's actual review structure (lens/strong/fixes/call); 16 per-reviewer findings with verbatim quotes; all 3 designer2 smaller gaps captured |
| A-0003 | 2026-06-21 | @architect-agent | SaaS Development | Lifecycle gating revision (MBO-as-co-equal-gate) | `.main.lifecycle.md` | code | Architecture | active | Revision 1.1 — exit criteria now artifact AND MBO; path (c) planned-gap as default |
| A-0004 | 2026-06-21 | @architect-agent | SaaS Development | AGENTS.md instances ledger | `AGENTS.md` | code | Architecture | active | Active instances sub-table + inheritance rule + `load` field definition |
| A-0005 | 2026-06-21 | @architect-agent | SaaS Development | Skill template Turn protocol | `agent-skills/references/skill-template.md` | code | Architecture | active | How agents receive work, seed context, checkout protocol (A1/A2 resolved) |
| A-0006 | 2026-06-21 | @architect-agent | SaaS Development | Progress template Planned gaps field | `working_files/progress/_template.md` | code | Architecture | active | B1 resolved — per-phase gap declaration, Phase 7 review |
| A-0007 | 2026-06-21 | @architect-agent | SaaS Development | ADR-0001 Bounded contexts as processes | `orchestrator/docs/adr/0001-bounded-contexts-as-processes.md` | adr | Architecture | active | DDD bounded contexts → 6 process services |
| A-0008 | 2026-06-21 | @architect-agent | SaaS Development | ADR-0002 Redis Streams intent bus | `orchestrator/docs/adr/0002-redis-streams-intent-bus.md` | adr | Architecture | active | bus-client (transport) vs event-coordination (policy) split |
| A-0009 | 2026-06-21 | @architect-agent | SaaS Development | ADR-0003 Branch lock + edit-intent applier | `orchestrator/docs/adr/0003-branch-lock-edit-intent-applier.md` | adr | Architecture | active | Single-writer, turn-bounded checkout, global lock ceiling named |
| A-0010 | 2026-06-21 | @architect-agent | SaaS Development | ADR-0004 Polling-agent execution model | `orchestrator/docs/adr/0004-polling-agent-execution-model.md` | adr | Architecture | active | designer1 M1 + designer2 A1 resolved; runtime as stateful bridge |
| A-0011 | 2026-06-21 | @architect-agent | SaaS Development | Intent catalog (shared contract) | `orchestrator/packages/contracts/src/intents.ts` | code | Architecture | active | 18 typed intents; idempotencyKey mandatory; EditIntent op=progress |
| A-0012 | 2026-06-21 | @architect-agent | SaaS Development | Orchestrator tree skeleton | `orchestrator/` | code | Architecture | active | 27 files: 6 services + runtime + registry + api + contracts + infra |
| A-0013 | 2026-06-21 | @architect-agent | SaaS Development | Redis keyspaces doc | `orchestrator/infra/redis-keyspaces.md` | config | Architecture | active | Persistence made explicit; Postgres upgrade path noted |
| A-0014 | 2026-06-21 | @architect-agent | SaaS Development | docker-compose | `orchestrator/infra/docker-compose.yml` | config | Architecture | active | Redis 7 + AOF; milestone 1 boot infrastructure |
| A-0015 | 2026-06-21 | @architect-agent | SaaS Development | Design review reconciliation (d1/d2/d3) | `working_files/drafts/design-review-reconciliation.md` | report | Architecture | active | 17 findings: 13 resolved, 1 deferred M3, 1 flagged M5, 2 adopted-as-process |

---

## Conventions

- **IDs** are assigned in creation order across the whole platform — never reuse a number.
- **Paths** are relative to the repo root (`projects/team1/`) so links stay portable.
- **Superseding**: add a new row with a new ID, then update the old row's status to `superseded` and add a `→ A-NNNN` note pointing to the replacement.
- **External artifacts** (models in a registry, datasets in a lake): record the canonical external path/URL and note the local mirror if one exists.
