# Progress Report — <Agent Name>

> Copy this file to `working_files/progress/<handle>-<YYYY-MM-DD>.md` and fill it in.
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

Pull your unit's metrics from `assignments/teamelite-2025.json`. Report each metric you touched this period.

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

For each deliverable, also append a row to `working_files/artifact_index.md`.

| Artifact | Path | Type | Purpose |
|----------|------|------|---------|
| <name> | `working_files/...` | dataset / model / report / diagram / code | <why it exists> |

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
