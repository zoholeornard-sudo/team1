# Progress Reports — Activity Logging Guide

Progress reports provide the audit trail for all unit workspace work. They keep history transparent and track alignment with unit Management by Objectives (MBOs).

## Required For Every Work Session

- **Who:** The agent/role performing the work.
- **When:** The timestamp/date of execution.
- **What:** The tasks analyzed and files modified.
- **How:** The tools or methods used for verification.
- **Findings:** Direct findings and their technical/operational impact.
- **Artifacts:** Any deliverables produced or changed.
- **Risks & Uncertainties:** What remains unknown or blocked.
- **Next Steps:** Actionable tasks for the next work session.

## File Naming Convention

All progress reports must be saved in the unit-specific `working_files/progress/` directory (or the central workspace directory) using the following name format:
```text
<handle>-<YYYY-MM-DD>.md
```
*For spawned instances (e.g. `@architect-agent-2`), append the instance identifier:*
```text
<handle>-<instance>-<date>.md
```
Example: `architect-agent-2026-06-21.md` or `architect-agent-2-2026-06-21.md`.

## The Standard Progress Report Template

Every report must use the following standard structure:

```markdown
# Progress Report — <Agent Name>

> File naming: `<slack-handle-without-@>-<YYYY-MM-DD>.md` (e.g. `architect-agent-2025-06-21.md`).

---

## Header

| Field | Value |
|-------|-------|
| **Agent** | <Name> (`@handle`) |
| **Unit** | <Department> |
| **Report Date** | YYYY-MM-DD |
| **Reporting Period** | YYYY-MM-DD → YYYY-MM-DD |
| **Lifecycle Phase** | Planning / Architecture / Implementation / Testing / Deployment / Monitoring / Analysis |
| **Manager** | <AI Manager name> |

---

## Summary

One paragraph: what was attempted, what was achieved, headline status (on-track / at-risk / blocked).

---

## Activity log

| Time (UTC) | Action | Phase | Artifact(s) | Status |
|------------|--------|-------|-------------|--------|
| HH:MM | <Action taken> | <Phase> | <path or "none"> | done / in-progress / blocked |

---

## MBO progress

Pull your unit's metrics from `metrics/mbo-targets.yaml`. Report each metric you touched this period.

| Metric | Target | Current value | Trend | Notes |
|--------|--------|---------------|-------|-------|
| <Metric name> | <target> | <value> | ↑ / ↓ / → | <context> |

---

## Planned gaps

Per the lifecycle's "Aligned gating rule" path (c), an MBO miss can be declared as a **planned gap** — a per-phase default-available declaration, not an escalation. The phase exits; the unit Manager reviews all declared gaps at Phase 7. Use this section to declare any gap for the current phase.

| Metric | Target | Actual value | Gap reason | Phase | Accepted? |
|--------|--------|--------------|------------|-------|-----------|
| <Metric name> | <target> | <value> | <why it missed / why it's planned> | <phase #> | _pending Manager review at Phase 7_ |

> Declare honestly. Co-equal MBO gates applied naively punish ambition; routine gap declaration lets you take real swings and report the debt transparently. The gate stays honest; ambition stays cheap.

---

## Artifacts produced

For each deliverable, also append a row to `00_workspace/working_files/ARTIFACT_INDEX.md`.

| Artifact | Path | Type | Purpose |
|----------|------|------|---------|
| <name> | `00_workspace/working_files/...` | dataset / model / report / diagram / code | <why it exists> |

---

## Blockers & risks

- <Blocker 1> — owner, mitigation, ETA.
- <Risk 1> — likelihood, impact, mitigation.

---

## Collaboration

| Agent/Unit | Interaction | Outcome |
|------------|-------------|---------|
| <@handle / unit> | <requested / reviewed / handed-off> | <result> |

---

## Escalations

Escalations raised to <Manager> this period (or "none"):

- <Trigger> — raised YYYY-MM-DD — status.

---

## Next period plan

- <Planned action 1>
- <Planned action 2>

---

## Sign-off

| Field | Value |
|-------|-------|
| **Author** | <Agent Name> |
| **Submitted** | YYYY-MM-DD HH:MM UTC |
| **Acknowledged by Manager** | _pending_ |
```

## Status Values

- `complete`: objective finished and limitations recorded.
- `pending_review`: ready for review, not final truth.
- `partial`: useful work exists, known gaps remain.
- `in_progress`: active work continues.
- `blocked`: external input/blocker resolution needed.
- `superseded`: replaced by later evidence or a newer run.

## Rules of Logging

1. **Store deliverables in unit directories**: Do not clutter `working_files/` with source code or primary assets. Save them in `00_workspace/<unit>/` (e.g. `00_workspace/saas-dev/`).
2. **Keep evidence separate from inference**: Report verified observations clearly and separate them from speculative assumptions.
3. **Record verification state**: Clearly mark claims as verified, pending, or assumed.
4. **Preserve contradictions**: Document any conflicting evidence or review feedback for later resolution.
5. **Update ARTIFACT_INDEX.md**: Ensure any new or updated artifact is appended to the central `00_workspace/working_files/ARTIFACT_INDEX.md`.
6. **MBO Planned Gaps**: Declare any MBO gaps under the "Planned gaps" table to ensure they are tracked for Phase 7 retrospectives rather than halting the workflow unnecessarily.
