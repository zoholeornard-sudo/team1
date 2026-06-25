---
version: 1.1
---

# team1 Project Assignments

MBO (Management by Objectives) targets are **not defined in unit templates**. They are specified at assignment time, per project, in this directory.

## Convention

- One file per project: `file assignments/<project-slug>.json`
- `project-slug` is lowercase, alphanumeric, hyphens only (e.g. `teamelite-2025`)
- Each unit deployed for the project is listed under `units`, keyed by the unit's full `name` as it appears in `file metrics/mbo-targets.yaml` / `file agent-skills/plugin-manifest.json`
- A unit may be listed even if its `mboObjective` is `null` — meaning "unit participates in this project, but the PM has not yet set targets for it"

## Shape

```json
{
  "project": "<project-slug>",
  "assignedAt": "<ISO-8601 date>",
  "units": {
    "<Unit Name>": {
      "mboObjective": "<string or null>",
      "metrics": [
        { "name": "<Metric>", "target": "<Target>", "measurement": "<How measured>" }
      ]
    }
  }
}
```

## Resolution rule

When a manager or agent needs the MBO for a `(unit, project)` pair:

1. Look up the unit's `name` in this project's assignment file
2. If the project file is missing or the unit is not listed, MBO is **unassigned** — escalate to the Platform Executive, do not invent values

## Why this exists

The unit templates (`file agent-skills/plugin-manifest.json`, `file pm/*.md`) used to bake MBO strings in directly. That made the templates project-specific, which broke reuse: a new project would inherit the original project's targets. This directory is the single source of truth for project-specific MBO.

See  `file pm/README.md` for the current template defaults (now placeholders).

## Precedent

This directory formalizes the assignment-time pattern as a first-class artifact, which was originally introduced in early playbook drafts ("Define the Unit" and "Integration with MBO").

## Version history

| Version | Date | Changes |
| --- | --- | --- |
| 1.0 | 2025-06-10 | Initial convention; seeded with `file metrics/mbo-targets.yaml` (the values previously baked into the templates) |
