---
version: 1.2.0
---

# AGENTS.md — team1 routing index

Compact routing map for the team1 platform. 9 units, 39 agents. Each agent's full skill definition lives in `agent-skills/<file>`; MBO targets live in [`metrics/mbo-targets.yaml`](metrics/mbo-targets.yaml); lifecycle phases are defined in [`.main.lifecycle.md`](.main.lifecycle.md).

## SaaS Development Unit — Manager: SaaS Delivery Manager (6 agents)

| Handle | Role | Skill file | Phase(s) |
| --- | --- | --- | --- |
| `@architect-agent` | Architect Agent | [architect-agent-skills.md](agent-skills/architect-agent-skills.md) | Architecture (L), Implementation (S), Deployment (S) |
| `@fullstack-dev` | Full-Stack Dev Agent | [fullstack-dev-agent-skills.md](agent-skills/fullstack-dev-agent-skills.md) | Architecture (S), Implementation (L), Testing (S) |
| `@devops-agent` | DevOps Agent | [devops-agent-skills.md](agent-skills/devops-agent-skills.md) | Architecture (S), Implementation (S), Deployment (L), Monitoring (L) |
| `@uiux-agent` | UI/UX Agent | [ui-ux-agent-skills.md](agent-skills/ui-ux-agent-skills.md) | Implementation (S) |
| `@product-manager-agent` | Product Manager Agent | [product-manager-agent-skills.md](agent-skills/product-manager-agent-skills.md) | Planning (L), Analysis (L) |
| `@qa-agent` | QA Agent | [qa-agent-skills.md](agent-skills/qa-agent-skills.md) | Testing (L), Monitoring (S) |

## Mobile Development Unit — Manager: Mobile Platform Manager (4 agents)

| Handle | Role | Skill file | Phase(s) |
| --- | --- | --- | --- |
| `@mobile-architect-agent` | Mobile Architect Agent | [mobile-architect-agent-skills.md](agent-skills/mobile-architect-agent-skills.md) | Planning (L), Architecture (L), Analysis (L) |
| `@frontend-dev-mobile` | Frontend Dev Agent | [frontend-dev-agent-mobile-skills.md](agent-skills/frontend-dev-agent-mobile-skills.md) | Planning (S), Implementation (L), Testing (S) |
| `@backend-dev-mobile` | Backend Dev Agent | [backend-dev-agent-mobile-skills.md](agent-skills/backend-dev-agent-mobile-skills.md) | Planning (S), Implementation (L), Testing (S) |
| `@release-agent-mobile` | Release Agent | [release-agent-mobile-skills.md](agent-skills/release-agent-mobile-skills.md) | Architecture (S), Testing (L), Deployment (L), Monitoring (L) |

## Web Development Unit — Manager: Web Delivery Manager (1 agent)

| Handle | Role | Skill file | Phase(s) |
| --- | --- | --- | --- |
| `@web-architect-agent` | Web Architect Agent | [web-architect-agent-skills.md](agent-skills/web-architect-agent-skills.md) | Planning → Analysis (solo; coordinates with SaaS/Cloud) |

## Desktop Development Unit — Manager: Desktop Solutions Manager (1 agent)

| Handle | Role | Skill file | Phase(s) |
| --- | --- | --- | --- |
| `@desktop-architect-agent` | Desktop Architect Agent | [desktop-architect-agent-skills.md](agent-skills/desktop-architect-agent-skills.md) | Planning → Analysis (solo; coordinates with SaaS/Cloud) |

## Cloud Infrastructure Unit — Manager: Cloud Operations Manager (6 agents)

| Handle | Role | Skill file | Phase(s) |
| --- | --- | --- | --- |
| `@infra-architect-agent` | Cloud Infra Architect Agent | [infra-architect-agent-skills.md](agent-skills/infra-architect-agent-skills.md) | Planning (L), Architecture (L), Analysis (S) |
| `@iac-agent` | IaC Agent | [iac-agent-skills.md](agent-skills/iac-agent-skills.md) | Architecture (S), Implementation (L), Testing (S), Deployment (S) |
| `@provisioning-agent` | Provisioning Agent | [provisioning-agent-skills.md](agent-skills/provisioning-agent-skills.md) | Implementation (S), Testing (L), Deployment (L) |
| `@cost-analyst-agent` | Cost Analyst Agent | [cost-analyst-agent-skills.md](agent-skills/cost-analyst-agent-skills.md) | Planning (S), Monitoring (S), Analysis (L) |
| `@drift-detector-agent` | Drift Detector Agent | [drift-detector-agent-skills.md](agent-skills/drift-detector-agent-skills.md) | Monitoring (L) |
| `@security-agent` | Security Agent | [security-agent-skills.md](agent-skills/security-agent-skills.md) | Architecture (S), Monitoring (S) |

## ML/Ops Unit — Manager: MLOps Manager (6 agents)

| Handle | Role | Skill file | Phase(s) |
| --- | --- | --- | --- |
| `@data-prep-agent` | Data Prep Agent | [data-prep-agent-skills.md](agent-skills/data-prep-agent-skills.md) | Planning (L) |
| `@trainer-agent` | Trainer Agent | [trainer-agent-skills.md](agent-skills/trainer-agent-skills.md) | Planning (S), Training (L), Retrain (S) |
| `@validation-agent` | Validation Agent | [validation-agent-skills.md](agent-skills/validation-agent-skills.md) | Training (S) |
| `@deployment-agent-mlops` | Deployment Agent | [deployment-agent-mlops-skills.md](agent-skills/deployment-agent-mlops-skills.md) | Deployment (L) |
| `@monitor-agent-mlops` | Monitor Agent | [monitor-agent-mlops-skills.md](agent-skills/monitor-agent-mlops-skills.md) | Monitoring (L) |
| `@retrain-scheduler-agent` | Retrain Scheduler Agent | [retrain-scheduler-agent-skills.md](agent-skills/retrain-scheduler-agent-skills.md) | Monitoring (S), Retrain (L) |

## AI Research Unit — Manager: Research & Innovation Manager (5 agents)

| Handle | Role | Skill file | Phase(s) |
| --- | --- | --- | --- |
| `@lit-review-agent` | Literature Review Agent | [literature-review-agent-skills.md](agent-skills/literature-review-agent-skills.md) | Literature review (L) |
| `@experiment-runner-agent` | Experiment Runner Agent | [experiment-runner-agent-skills.md](agent-skills/experiment-runner-agent-skills.md) | Experiment design (L), Experimentation (L) |
| `@metric-analyzer-agent` | Metric Analyzer Agent | [metric-analyzer-agent-skills.md](agent-skills/metric-analyzer-agent-skills.md) | Experiment design (S), Experimentation (S), Analysis (L) |
| `@publication-agent` | Publication Agent | [publication-agent-skills.md](agent-skills/publication-agent-skills.md) | Publication (L) |
| `@collaboration-agent` | Collaboration Agent | [collaboration-agent-skills.md](agent-skills/collaboration-agent-skills.md) | Literature review (S), Publication (S), Outreach (L) |

## Data Science Unit — Manager: Data Science Manager (5 agents)

| Handle | Role | Skill file | Phase(s) |
| --- | --- | --- | --- |
| `@data-ingestion-agent` | Data Ingestion Agent | [data-ingestion-agent-skills.md](agent-skills/data-ingestion-agent-skills.md) | Data acquisition (L) |
| `@feature-engineering-agent` | Feature Engineering Agent | [feature-engineering-agent-skills.md](agent-skills/feature-engineering-agent-skills.md) | Feature work (L), Data acquisition (S) |
| `@stats-agent` | Statistical Analysis Agent | [statistical-analysis-agent-skills.md](agent-skills/statistical-analysis-agent-skills.md) | Analysis (L), Feature work (S) |
| `@reporting-agent-ds` | Reporting Agent | [reporting-agent-ds-skills.md](agent-skills/reporting-agent-ds-skills.md) | Reporting (L), Delivery (S) |
| `@insight-delivery-agent` | Insight Delivery Agent | [insight-delivery-agent-skills.md](agent-skills/insight-delivery-agent-skills.md) | Reporting (S), Delivery (L) |

## Security & Compliance Unit — Manager: Security & Compliance Manager (5 agents)

| Handle | Role | Skill file | Phase(s) |
| --- | --- | --- | --- |
| `@vuln-scanner-agent` | Vulnerability Scanner Agent | [vulnerability-scanner-agent-skills.md](agent-skills/vulnerability-scanner-agent-skills.md) | Scanning (L), Response (S) |
| `@policy-auditor-agent` | Policy Auditor Agent | [policy-auditor-agent-skills.md](agent-skills/policy-auditor-agent-skills.md) | Audit (L), Threat intel (S) |
| `@incident-response-agent` | Incident Response Agent | [incident-response-agent-skills.md](agent-skills/incident-response-agent-skills.md) | Response (L) |
| `@threat-intelligence-agent` | Threat Intelligence Agent | [threat-intelligence-agent-skills.md](agent-skills/threat-intelligence-agent-skills.md) | Threat intel (L), Audit (S) |
| `@reporting-agent-sec` | Reporting Agent | [reporting-agent-sec-skills.md](agent-skills/reporting-agent-sec-skills.md) | Reporting (L), Response (S) |

---

## Where to look next

- **Skill detail**: [`agent-skills/`](agent-skills/) — role, skills, collaboration matrix, escalation triggers.
- **MBO targets**: [`metrics/mbo-targets.yaml`](metrics/mbo-targets.yaml) — unit objectives and metrics.
- **Lifecycle**: [`.main.lifecycle.md`](.main.lifecycle.md) — canonical phases and which agents lead/support each.
- **Orchestrator runtime**: [`orchestrator/`](orchestrator/) — services, contracts, ADRs, bus topology.
- **Activity logs**: [`00_workspace/working_files/progress/<handle>-<YYYY-MM-DD>.md`](00_workspace/working_files/progress/).
- **Deliverables**: [`00_workspace/working_files/ARTIFACT_INDEX.md`](00_workspace/working_files/ARTIFACT_INDEX.md).
- **Templates**: [`agent-skills/references/skill-template.md`](agent-skills/references/skill-template.md), [`agent-skills/references/domain-template.md`](agent-skills/references/domain-template.md), [`00_workspace/working_files/progress/_template.md`](00_workspace/working_files/progress/_template.md).

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