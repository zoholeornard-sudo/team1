# team1

Agentic AI platform built on a Management by Objectives (MBO) framework: functional units are managed by AI Managers and executed by specialized AI Agents. Each agent owns a defined skill set, MBO target, and progress log.

## Repository layout

| Path | Purpose |
|------|---------|
| `agent-skills/` | Skill definitions for all 39 agents across 9 units. See `agent-skills/README.md` for the navigation table. |
| `agent-skills/references/` | Templates — `skill-template.md` (new agent), `domain-template.md` (new unit). |
| `assignments/teamelite-2025.json` | Source of truth for each unit's MBO objective + metrics (assigned 2025-06-10). |
| `working_files/` | Agent working area — progress logs and artifact ledger. |
| `working_files/progress/` | Per-agent progress reports. Copy `_template.md` for each new report. |
| `working_files/artifact_index.md` | Central ledger of deliverables (datasets, models, reports, diagrams). |
| `AGENTS.md` | Compact routing index of all 39 agents by unit. |
| `.main.lifecycle.md` | Canonical platform lifecycle reference (phases per unit). |

## Working in this repo

1. **Read your skill file** in `agent-skills/<handle>-agent-*-skills.md` — it defines your role, skills, collaboration matrix, and escalation triggers.
2. **Read your unit's MBO target** in `assignments/teamelite-2025.json` — your quality targets and metrics point there.
3. **Log activity** by copying `working_files/progress/_template.md` to `working_files/progress/<handle>-<YYYY-MM-DD>.md` and filling it in.
4. **Register deliverables** by appending a row to `working_files/artifact_index.md`.
5. **Escalate** to your unit's AI Manager per the triggers in your skill file.

## Units

9 units, 39 agents. See `AGENTS.md` for the full roster and `agent-skills/README.md` for per-unit skill links.

## Version history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.0.0 | 2025-06-21 | team1 | Renamed platform dbox → team1; added root README, AGENTS.md, lifecycle reference, and `working_files/` structure. |
| 1.1.0 | 2025-06-10 | TeamElite | MBO objectives moved to assignment-time (`assignments/teamelite-2025.json`). |
| 1.0.0 | 2025-06-03 | TeamElite | Initial 39 agent skill definitions. |
