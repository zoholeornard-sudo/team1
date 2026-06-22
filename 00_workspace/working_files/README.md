# Unit Workspace — Working Files

**Purpose:** Coordination workspace for the team1 platform. Progress logs, artifact indexing, cross-unit handoffs, and temporary working documents live here.

**Rule:** Evidence and deliverables belong in each unit's directory. `working_files/` holds the coordination layer — nothing final, everything traceable.

## Directory Structure

```text
00_workspace/working_files/
  README.md
  ARTIFACT_INDEX.md
  progress/
    README.md
    YYYY-MM-DD_[task]_[status].md
  uploads/
    ... temp incoming files
```

## Activity Logging Mandate

All unit PMs and agents performing work must:

1. Create a progress report in `progress/` using `YYYY-MM-DD_[task]_[status].md`.
2. Complete the standard template from `progress/README.md`.
3. Update `ARTIFACT_INDEX.md` with artifact paths and status.
4. Reference cross-unit dependencies, blockers, and open questions.

## Status Values

- `complete`: task finished and limitations recorded
- `pending_review`: ready for review, not final truth
- `partial`: useful work exists, known gaps remain
- `in_progress`: ongoing work, more sessions planned
- `blocked`: halted pending external input
- `superseded`: replaced by later evidence

## Unit Directories

| Unit | Dir | Manager |
|---|---|---|
| SaaS Development | `saas-dev/` | @saas-delivery-manager |
| Mobile Development | `mobile-dev/` | @mobile-platform-manager |
| Web Development | `web-dev/` | @web-delivery-manager |
| Desktop Solutions | `desktop-dev/` | @desktop-solutions-manager |
| Cloud Infrastructure | `cloud-infra/` | @cloud-ops-manager |
| ML/Ops | `mlops/` | @mlops-manager |
| AI Research | `ai-research/` | @research-innovation-manager |
| Data Science | `data-science/` | @data-science-manager |
| Security & Compliance | `security-compliance/` | @security-compliance-manager |

## Quality Rules

- Be specific about sources, endpoints, parameters, screens, and database fields.
- Mark assumptions and verification status explicitly.
- Preserve contradictions for resolution during synthesis.
- Log every session — even incomplete ones.
