---
version: 2.1.0
---

# team1

Agentic AI platform built on a Management by Objectives (MBO) framework: functional units are managed by AI Managers and executed by specialized AI Agents. Each agent owns a defined skill set, MBO target, and progress log.

## Repository layout

| Path | Purpose |
|------|---------|
| `agent-skills/` | Skill definitions for all 39 agents across 9 units. See `agent-skills/README.md` for the navigation table. |
| `agent-skills/references/` | Templates — `skill-template.md` (new agent), `domain-template.md` (new unit). |
| `metrics/mbo-targets.yaml` | Source of truth for each unit's MBO objective + metrics (assigned 2025-06-10). |
| `00_workspace/` | Unit workspaces (9 units) + shared working files (progress logs, drafts, artifact ledger). |
| `00_workspace/working_files/` | Shared working area — progress logs, drafts, artifact index, and the central Activity Logging Guide. |
| `00_workspace/working_files/progress/` | Progress reports and the central Activity Logging Guide. Copy `_template.md` for each new report. |
| `00_workspace/working_files/ARTIFACT_INDEX.md` | Central ledger of deliverables (datasets, models, reports, diagrams). |
| `AGENTS.md` | Compact routing index of all 39 agents by unit. |
| `.main.lifecycle.md` | Canonical platform lifecycle reference (phases per unit). |

## Working in this repo

1. **Read your skill file** in `agent-skills/<handle>-agent-*-skills.md` — it defines your role, skills, collaboration matrix, and escalation triggers.
2. **Read your unit's MBO target** in `metrics/mbo-targets.yaml` — your quality targets and metrics point there.
3. **Log activity** by copying `00_workspace/working_files/progress/_template.md` to `00_workspace/working_files/progress/<handle>-<YYYY-MM-DD>.md` and filling it in.
4. **Register deliverables** by appending a row to `00_workspace/working_files/ARTIFACT_INDEX.md`.
5. **Escalate** to your unit's AI Manager per the triggers in your skill file.

## Units

9 units, 39 agents. See `AGENTS.md` for the full roster and `agent-skills/README.md` for per-unit skill links.

## Version history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.1.0 | 2026-06-22 | team1 | Moved `working_files/` into `00_workspace/working_files/`; merged artifact ledger; consolidated Activity Logging Guide; added `web-dev/lifecycle.md`. |
| 2.0.0 | 2025-06-21 | team1 | Added root README, AGENTS.md, lifecycle reference, and `00_workspace/` structure. |
| 1.1.0 | 2025-06-10 | TeamElite | MBO objectives moved to assignment-time (`metrics/mbo-targets.yaml`). |
| 1.0.0 | 2025-06-03 | TeamElite | Initial 39 agent skill definitions. |
