# Unit Workspace — Artifact Index & Activity Log

**Last Updated:** 2026-06-05
**Purpose:** Coordination registry for the 9 dbox platform units in `00_workspace/`.

Unit-level artifacts live in their respective directories. This index tracks what exists, what state it is in, and what still needs verification.

## Unit Work Register

| Date | Task | Agent | Status | Document |
|---|---|---|---|---|
| 2026-06-05 | Full Unit Activation | dbox PMs | Complete | `progress/2026-06-05_full_unit_activation_complete.md` |
| 2026-06-05 | SaaS Unit — reqs analysis & bootstrap | @saas-delivery-manager | Complete | `../saas-dev/ANALYSIS.md`, `../saas-dev/TASKS.md` |
| 2026-06-05 | Mobile Unit — reqs analysis & bootstrap | @mobile-platform-manager | Complete | `../mobile-dev/ANALYSIS.md`, `../mobile-dev/TASKS.md` |
| 2026-06-05 | Web Unit — reqs analysis & bootstrap | @web-delivery-manager | Complete | `../web-dev/ANALYSIS.md`, `../web-dev/TASKS.md` |
| 2026-06-05 | Desktop Unit — reqs analysis & bootstrap | @desktop-solutions-manager | Complete | `../desktop-dev/ANALYSIS.md`, `../desktop-dev/TASKS.md` |
| 2026-06-05 | Cloud Infra Unit — reqs analysis & bootstrap | @cloud-ops-manager | Complete | `../cloud-infra/ANALYSIS.md`, `../cloud-infra/TASKS.md` |
| 2026-06-05 | ML/Ops Unit — reqs analysis & bootstrap | @mlops-manager | Complete | `../mlops/ANALYSIS.md`, `../mlops/TASKS.md` |
| 2026-06-05 | AI Research Unit — reqs analysis & bootstrap | @research-innovation-manager | Complete | `../ai-research/ANALYSIS.md`, `../ai-research/TASKS.md` |
| 2026-06-05 | Data Science Unit — reqs analysis & bootstrap | @data-science-manager | Complete | `../data-science/ANALYSIS.md`, `../data-science/TASKS.md` |
| 2026-06-05 | Security & Compliance Unit — reqs analysis & bootstrap | @security-compliance-manager | Complete | `../security-compliance/ANALYSIS.md`, `../security-compliance/TASKS.md` |

## Per-Unit Artifacts

| Unit | ANALYSIS.md | SLACK.md | TASKS.md | README.md | working_files/ |
|---|---|---|---|---|---|
| SaaS Dev | `../saas-dev/ANALYSIS.md` | `../saas-dev/SLACK.md` | `../saas-dev/TASKS.md` | `../saas-dev/README.md` | `../saas-dev/working_files/` |
| Mobile Dev | `../mobile-dev/ANALYSIS.md` | `../mobile-dev/SLACK.md` | `../mobile-dev/TASKS.md` | `../mobile-dev/README.md` | `../mobile-dev/working_files/` |
| Web Dev | `../web-dev/ANALYSIS.md` | `../web-dev/SLACK.md` | `../web-dev/TASKS.md` | `../web-dev/README.md` | `../web-dev/working_files/` |
| Desktop Dev | `../desktop-dev/ANALYSIS.md` | `../desktop-dev/SLACK.md` | `../desktop-dev/TASKS.md` | `../desktop-dev/README.md` | `../desktop-dev/working_files/` |
| Cloud Infra | `../cloud-infra/ANALYSIS.md` | `../cloud-infra/SLACK.md` | `../cloud-infra/TASKS.md` | `../cloud-infra/README.md` | `../cloud-infra/working_files/` |
| ML/Ops | `../mlops/ANALYSIS.md` | `../mlops/SLACK.md` | `../mlops/TASKS.md` | `../mlops/README.md` | `../mlops/working_files/` |
| AI Research | `../ai-research/ANALYSIS.md` | `../ai-research/SLACK.md` | `../ai-research/TASKS.md` | `../ai-research/README.md` | `../ai-research/working_files/` |
| Data Science | `../data-science/ANALYSIS.md` | `../data-science/SLACK.md` | `../data-science/TASKS.md` | `../data-science/README.md` | `../data-science/working_files/` |
| Security & Compliance | `../security-compliance/ANALYSIS.md` | `../security-compliance/SLACK.md` | `../security-compliance/TASKS.md` | `../security-compliance/README.md` | `../security-compliance/working_files/` |

## Cross-Unit Dependencies (Active)

| Depends On | Needed By | For What | Status |
|---|---|---|---|
| Cloud Infra — deployment env spec | SaaS, Web, Mobile | Target architecture decisions | Waiting |
| Security Compliance — auth framework | SaaS, Web, Mobile, Desktop | Endpoint security design | Waiting |
| SaaS Unit — API contracts | Web, Mobile, Desktop | Frontend integration | Waiting |
| Web Unit — teacher component tree | Mobile, Desktop | Responsive/offline assessment | Waiting |
| Data Science — feature engineering | ML/Ops, AI Research | ML model inputs | Waiting |
| AI Research — model handoff | ML/Ops | Production deployment | Future |

## Update Procedure

After completing any work:

1. Store artifacts in the correct unit directory.
2. Create or update a progress report in `progress/`.
3. Add or update the artifact entry here.
4. Record verification state, risks, assumptions, and review status.

## Deliverables Ledger

Central ledger of deliverables produced by team1 agents. Every artifact logged in a progress report should also appear here. Append rows; do not delete historical entries (mark superseded ones with status `superseded` and link the replacement).

### Schema

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

### Ledger

| ID | Date | Agent | Unit | Artifact | Path | Type | Phase | Status | Notes |
|----|------|-------|------|----------|------|------|-------|--------|-------|
| A-0002 | 2026-06-21 | @architect-agent | SaaS Development | Orchestrator Design Spec | `00_workspace/working_files/drafts/orchestrator-design-spec.md` | adr | Architecture | active | v1.1 — redone based on real designer docs; restructured to track each reviewer's actual review structure (lens/strong/fixes/call); 16 per-reviewer findings with verbatim quotes; all 3 designer2 smaller gaps captured |
| A-0003 | 2026-06-21 | @architect-agent | SaaS Development | Lifecycle gating revision (MBO-as-co-equal-gate) | `.main.lifecycle.md` | code | Architecture | active | Revision 1.1 — exit criteria now artifact AND MBO; path (c) planned-gap as default |
| A-0004 | 2026-06-21 | @architect-agent | SaaS Development | AGENTS.md instances ledger | `AGENTS.md` | code | Architecture | active | Active instances sub-table + inheritance rule + `load` field definition |
| A-0005 | 2026-06-21 | @architect-agent | SaaS Development | Skill template Turn protocol | `agent-skills/references/skill-template.md` | code | Architecture | active | How agents receive work, seed context, checkout protocol (A1/A2 resolved) |
| A-0006 | 2026-06-21 | @architect-agent | SaaS Development | Progress template Planned gaps field | `00_workspace/working_files/progress/_template.md` | code | Architecture | active | B1 resolved — per-phase gap declaration, Phase 7 review |
| A-0007 | 2026-06-21 | @architect-agent | SaaS Development | ADR-0001 Bounded contexts as processes | `orchestrator/docs/adr/0001-bounded-contexts-as-processes.md` | adr | Architecture | active | DDD bounded contexts → 6 process services |
| A-0008 | 2026-06-21 | @architect-agent | SaaS Development | ADR-0002 Redis Streams intent bus | `orchestrator/docs/adr/0002-redis-streams-intent-bus.md` | adr | Architecture | active | bus-client (transport) vs event-coordination (policy) split |
| A-0009 | 2026-06-21 | @architect-agent | SaaS Development | ADR-0003 Branch lock + edit-intent applier | `orchestrator/docs/adr/0003-branch-lock-edit-intent-applier.md` | adr | Architecture | active | Single-writer, turn-bounded checkout, global lock ceiling named |
| A-0010 | 2026-06-21 | @architect-agent | SaaS Development | ADR-0004 Polling-agent execution model | `orchestrator/docs/adr/0004-polling-agent-execution-model.md` | adr | Architecture | active | designer1 M1 + designer2 A1 resolved; runtime as stateful bridge |
| A-0011 | 2026-06-21 | @architect-agent | SaaS Development | Intent catalog (shared contract) | `orchestrator/packages/contracts/src/intents.ts` | code | Architecture | active | 18 typed intents; idempotencyKey mandatory; EditIntent op=progress |
| A-0012 | 2026-06-21 | @architect-agent | SaaS Development | Orchestrator tree skeleton | `orchestrator/` | code | Architecture | active | 27 files: 6 services + runtime + registry + api + contracts + infra |
| A-0013 | 2026-06-21 | @architect-agent | SaaS Development | Redis keyspaces doc | `orchestrator/infra/redis-keyspaces.md` | config | Architecture | active | Persistence made explicit; Postgres upgrade path noted |
| A-0014 | 2026-06-21 | @architect-agent | SaaS Development | docker-compose | `orchestrator/infra/docker-compose.yml` | config | Architecture | active | Redis 7 + AOF; milestone 1 boot infrastructure |
| A-0015 | 2026-06-21 | @architect-agent | SaaS Development | Design review reconciliation (d1/d2/d3) | `00_workspace/working_files/drafts/design-review-reconciliation.md` | report | Architecture | active | 17 findings: 13 resolved, 1 deferred M3, 1 flagged M5, 2 adopted-as-process |

### Conventions

- **IDs** are assigned in creation order across the whole platform — never reuse a number.
- **Paths** are relative to the repo root so links stay portable.
- **Superseding**: add a new row with a new ID, then update the old row's status to `superseded` and add a `→ A-NNNN` note pointing to the replacement.
- **External artifacts** (models in a registry, datasets in a lake): record the canonical external path/URL and note the local mirror if one exists.

## Version History

| Date | Change | Updated By |
|---|---|---|
| 2026-06-05 | Initial workspace working_files created | dbox PMs |
| 2026-06-05 | Per-unit lifecycle.md + phase-reorganized TASKS.md | dbox PMs |
| 2026-06-05 | Per-unit working_files replicated across all 9 units | dbox PMs |
| 2026-06-05 | Per-unit lifecycle.md + TASKS.md reorganized under lifecycle phases | dbox PMs |
| 2026-06-22 | Merged root working_files/artifact_index.md deliverables ledger; paths updated | Restructure |

