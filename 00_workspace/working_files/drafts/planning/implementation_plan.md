# Restructure Workspace Working Files & Unit Documentation

This plan outlines the restructuring of `working_files` into `00_workspace`, merging the artifact indices, resolving progress report guide duplication, creating the missing `web-dev` lifecycle document, and updating all reference paths.

## User Review Required

> [!IMPORTANT]
> The root-level `working_files/` directory will be deleted. All working documents (drafts, templates, progress reports) will move into `00_workspace/working_files/` and unit-specific `working_files/` directories.
>
> All agent skill definitions, template files, and orchestrator code/docs that reference `working_files/` will be updated to point to the new paths (e.g., `00_workspace/<unit-dir>/working_files/` or `00_workspace/working_files/` depending on the context).

## Open Questions

None. The user's request is clear and direct.

## Proposed Changes

### Merging and Relocating working_files

We will move the contents of `working_files/` to `00_workspace/working_files/` and merge them.
Specifically:
- Move `working_files/drafts/` to `00_workspace/working_files/drafts/`.
- Move `working_files/progress/architect-agent-2026-06-21.md` and `_template.md` to `00_workspace/working_files/progress/`.
- Merge the deliverables ledger from `working_files/artifact_index.md` (root) into `00_workspace/working_files/ARTIFACT_INDEX.md` as a new section: `## Deliverables Ledger`.
- Update paths within the ledger from `working_files/...` to `00_workspace/working_files/...`.
- Delete the root `working_files/` directory.

### Consolidating Activity Logging Guide

Instead of maintaining a duplicate 49-line Activity Logging Guide in all 9 unit subdirectories (`00_workspace/<unit>/working_files/progress/README.md`), we will:
- Maintain the central guide at `00_workspace/working_files/progress/README.md`.
- Replace the duplicate `README.md` files in all 9 unit progress directories with a short file referencing/linking to the central guide.

### Web Unit Lifecycle Doc

We will create `00_workspace/web-dev/lifecycle.md` using the standard structure mapping onto the Web Development Unit's sole-agent setup (Web Architect Agent) and MBOs: `<1s TTFB @ 100k users`, `WCAG 2.1 AA`, `SEO >90`, and `Core Web Vitals green`.

### Ripple Effect Path Resolution

We will find and update all references to `working_files/` in:
- `README.md` (root)
- `AGENTS.md` (root)
- `assignments/README.md`
- `orchestrator/README.md`
- `orchestrator/packages/contracts/src/intents.ts`
- `agent-skills/references/skill-template.md`
- All affected agent skill files in `agent-skills/`
- Central `00_workspace/working_files/README.md` and `00_workspace/working_files/progress/README.md`

---

### [NEW] Web Dev Unit Lifecycle

#### [NEW] [lifecycle.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/00_workspace/web-dev/lifecycle.md)
Define the 7 phases, input/output artifacts, and gates for the Web Development Unit.

---

### [MODIFY] Workspace Progress READMEs

#### [MODIFY] [README.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/00_workspace/working_files/progress/README.md)
Update paths and instructions to reflect the new structure.

#### [MODIFY] [README.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/00_workspace/ai-research/working_files/progress/README.md)
#### [MODIFY] [README.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/00_workspace/cloud-infra/working_files/progress/README.md)
#### [MODIFY] [README.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/00_workspace/data-science/working_files/progress/README.md)
#### [MODIFY] [README.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/00_workspace/desktop-dev/working_files/progress/README.md)
#### [MODIFY] [README.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/00_workspace/mlops/working_files/progress/README.md)
#### [MODIFY] [README.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/00_workspace/mobile-dev/working_files/progress/README.md)
#### [MODIFY] [README.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/00_workspace/saas-dev/working_files/progress/README.md)
#### [MODIFY] [README.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/00_workspace/security-compliance/working_files/progress/README.md)
#### [MODIFY] [README.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/00_workspace/web-dev/working_files/progress/README.md)

Replace with a single referenced link to the central guide.

---

### [MODIFY] Reference Files & Agent Skills

#### [MODIFY] [README.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/README.md)
#### [MODIFY] [AGENTS.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/AGENTS.md)
#### [MODIFY] [README.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/orchestrator/README.md)
#### [MODIFY] [intents.ts](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/orchestrator/packages/contracts/src/intents.ts)
#### [MODIFY] [skill-template.md](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/agent-skills/references/skill-template.md)
#### [MODIFY] Agent Skills files in [agent-skills/](file:///c:/accord/active_26/dex_26/draft/04_dev/team1-fork1/agent-skills/)

Update all occurrences of `working_files/` to point to the correct, localized path (e.g. `00_workspace/<unit>/working_files/progress/...` or `00_workspace/working_files/progress/...`).

## Verification Plan

### Manual Verification
- Verify that no `working_files/` folder remains at the repository root.
- Verify that `00_workspace/working_files/` contains all merged documents and folders.
- Verify that each unit's progress `README.md` links correctly to the central activity logging guide.
- Verify that `web-dev` has a `lifecycle.md` matching standard unit formatting.
- Verify that a global search for old `working_files/` references returns no incorrect paths.
