# AGENTS.md — team1 routing index

Compact routing map for the team1 platform. 9 units, 39 agents. Each agent's full skill definition lives in `agent-skills/<file>`; MBO targets live in `file assignments/teamelite-2025.json`.

## SaaS Development Unit — Manager: SaaS Delivery Manager (6 agents)

| Handle | Role | Skill file |
| --- | --- | --- |
| `@architect-agent` | Architect Agent |  |
| `@fullstack-dev` | Full-Stack Dev Agent |  |
| `@devops-agent` | DevOps Agent |  |
| `@uiux-agent` | UI/UX Agent |  |
| `@product-manager-agent` | Product Manager Agent |  |
| `@qa-agent` | QA Agent |  |

## Mobile Development Unit — Manager: Mobile Platform Manager (4 agents)

| Handle | Role | Skill file |
| --- | --- | --- |
| `@mobile-architect-agent` | Mobile Architect Agent |  |
| `@frontend-dev-mobile` | Frontend Dev Agent |  |
| `@backend-dev-mobile` | Backend Dev Agent |  |
| `@release-agent-mobile` | Release Agent |  |

## Web Development Unit — Manager: Web Delivery Manager (1 agent)

| Handle | Role | Skill file |
| --- | --- | --- |
| `@web-architect-agent` | Web Architect Agent |  |

## Desktop Development Unit — Manager: Desktop Solutions Manager (1 agent)

| Handle | Role | Skill file |
| --- | --- | --- |
| `@desktop-architect-agent` | Desktop Architect Agent |  |

## Cloud Infrastructure Unit — Manager: Cloud Operations Manager (6 agents)

| Handle | Role | Skill file |
| --- | --- | --- |
| `@infra-architect-agent` | Cloud Infra Architect Agent |  |
| `@iac-agent` | IaC Agent |  |
| `@provisioning-agent` | Provisioning Agent |  |
| `@cost-analyst-agent` | Cost Analyst Agent |  |
| `@drift-detector-agent` | Drift Detector Agent |  |
| `@security-agent` | Security Agent |  |

## ML/Ops Unit — Manager: MLOps Manager (6 agents)

| Handle | Role | Skill file |
| --- | --- | --- |
| `@data-prep-agent` | Data Prep Agent |  |
| `@trainer-agent` | Trainer Agent |  |
| `@validation-agent` | Validation Agent |  |
| `@deployment-agent-mlops` | Deployment Agent |  |
| `@monitor-agent-mlops` | Monitor Agent |  |
| `@retrain-scheduler-agent` | Retrain Scheduler Agent |  |

## AI Research Unit — Manager: Research & Innovation Manager (5 agents)

| Handle | Role | Skill file |
| --- | --- | --- |
| `@lit-review-agent` | Literature Review Agent |  |
| `@experiment-runner-agent` | Experiment Runner Agent |  |
| `@metric-analyzer-agent` | Metric Analyzer Agent |  |
| `@publication-agent` | Publication Agent |  |
| `@collaboration-agent` | Collaboration Agent |  |

## Data Science Unit — Manager: Data Science Manager (5 agents)

| Handle | Role | Skill file |
| --- | --- | --- |
| `@data-ingestion-agent` | Data Ingestion Agent |  |
| `@feature-engineering-agent` | Feature Engineering Agent |  |
| `@stats-agent` | Statistical Analysis Agent |  |
| `@reporting-agent-ds` | Reporting Agent |  |
| `@insight-delivery-agent` | Insight Delivery Agent |  |

## Security & Compliance Unit — Manager: Security & Compliance Manager (5 agents)

| Handle | Role | Skill file |
| --- | --- | --- |
| `@vuln-scanner-agent` | Vulnerability Scanner Agent |  |
| `@policy-auditor-agent` | Policy Auditor Agent |  |
| `@incident-response-agent` | Incident Response Agent |  |
| `@threat-intelligence-agent` | Threat Intelligence Agent |  |
| `@reporting-agent-sec` | Reporting Agent |  |

---

## Where to look next

- **Skill detail**: `agent-skills/<file>` — role, skills, collaboration matrix, escalation triggers.
- **MBO targets**: `file assignments/teamelite-2025.json` — unit objectives and metrics.
- **Lifecycle**: `file .main.lifecycle.md` — canonical phases and which agents lead/support each.
- **Activity logs**: `file 00_workspace/working_files/progress/<handle>-<YYYY-MM-DD>.md`.
- **Deliverables**: `file 00_workspace/working_files/ARTIFACT_INDEX.md`.
- **Templates**: `file agent-skills/references/skill-template.md`, `file agent-skills/references/domain-template.md`, `file 00_workspace/working_files/progress/_template.md`.

---

## Active instances ledger

Runtime-populated by the Orchestrator's `agent-registry` service. Base personas are static (the tables above); spawned instances are dynamic and append rows here as they are minted, then are marked `reaped` when their feature completes. The ledger is the single place to see which agent *instances* are live at any moment.

| Instance handle | Base persona | Unit | Feature slug | Branch | Status | Spawned (UTC) | Reaped (UTC) |
|-----------------|--------------|------|--------------|--------|--------|---------------|--------------|
| _@handle-N_ | _@base-handle_ | _Unit_ | _feature-slug_ | _feature/<slug>-<handle>-N_ | _spawning / active / reaped_ | _YYYY-MM-DD HH:MM_ | _YYYY-MM-DD HH:MM_ |

### Instance inheritance rule

An instance (e.g. `@architect-agent-2`) **inherits** its base persona's skill file (`agent-skills/architect-agent-skills.md`) for role, skills, collaboration matrix, and escalation triggers. It does **not** get its own skill file. Its distinct identity is its handle suffix, its branch (`feature/<slug>-<handle>-N`), its progress file (`00_workspace/working_files/progress/<handle>-N-<date>.md`), and its `agent-registry` entry. When reaped, progress reports are retained as history; the registry entry is marked `reaped`.

### `load` field (registry entry)

Each instance's registry entry includes a `load` field: `{ activeTurns: int, pendingIntents: int, lastHeartbeatAgeMs: int }`. Used by `runtime` for capability matching and stall detection. Not a CPU metric.

### Manager authority

`SpawnAgents` is authorized only for agents whose skill file's `Reports To` field names a Manager role. `agent-registry` enforces this check. See `orchestrator/docs/adr/0004-polling-agent-execution-model.md`.

### `featureSlug` contract

Globally-unique kebab-case, minted by `orchestrator-api` at `FeatureSubmitted` time. No two features share a slug. Used in: intent envelope, spawn payload, branch name (`feature/<slug>-<handle>-N`), progress filename.