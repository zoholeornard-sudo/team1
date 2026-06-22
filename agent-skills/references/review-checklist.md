# Review Checklist — Structural Diff Review (Phase 4)

**Source:** gstack `/review` + `review/checklist.md`. Folded into team1 as the **Phase 4 execution protocol** — the QA Agent (or Architect Agent for architecture-sensitive changes) runs this against the merged branch before the QA gate.

**Why this is its own phase step:** the QA gate ("tests pass") catches *functional* bugs. This checklist catches *structural* bugs — the ones that pass CI but break in production, that only a diff-reading agent spots.

---

## When to run

- After Phase 3 commits land on the feature branch
- Before the QA gate's `PhaseGateCheck{phase: "Testing"}`
- After any merge of `feature/<slug>-*` into the integration branch

## How to run

1. Get the diff: `git diff main...feature/<slug>-<handle>-N -- <scopePaths>`
2. Read every changed file end-to-end (not just the diff hunks)
3. For each category below, scan the diff and the surrounding context
4. Findings → `TestFailed{paths, error: <checklist-category>}` intent, OR accepted remediation with rationale in progress report

---

## Categories

### 1. SQL & data safety

- **Migrations reversible?** — every `up` migration has a working `down`; no `DROP COLUMN` without a backup window
- **Indexes added before queries depend on them** — index migrations land in the same deploy as the query that uses them, not after
- **Foreign keys have explicit `ON DELETE` / `ON UPDATE`** — no default RESTRICT surprises in production
- **N+1 queries introduced** — any new loop that hits the DB needs a JOIN or batch fetch
- **Transactions bounded** — no long-running transactions holding locks across awaits
- **`SELECT *` in new code paths** — schema-coupling risk; reject unless justified

### 2. LLM trust boundaries

- **Agent-generated content sanitized before sinks** — anything that ends up in SQL, shell, HTML, or `eval()` from an LLM output goes through a sanitizer
- **Prompt injection vectors closed** — user input never concatenated into system prompts; tool outputs marked as `untrusted`
- **Tool-result fields narrowed** — agent sees only the fields it needs, not raw LLM outputs
- **Rate limits on LLM-touching endpoints** — no unbounded agent-call loops
- **PII redacted before LLM call** — name/email/phone/etc. scrubbed at the boundary

### 3. Conditional side effects

- **Notifications triggered under untested conditions** — `if (X) sendEmail(...)` where X is new and uncovered by tests
- **Webhooks fired with partial data** — error path that still emits an event
- **State machine transitions on async results** — callback/webhook that mutates state without re-checking preconditions
- **Idempotency keys missing on side-effect endpoints** — retry storms duplicate notifications
- **Cache invalidation on writes** — write path doesn't invalidate the cached read

### 4. Scope drift

- **Files changed outside `scopePaths`** — the Phase 3 scope declaration is the contract; anything outside is a `ScopeChangeRequest` candidate
- **Tangential refactors** — "while I was here" commits that touch unrelated code
- **New dependencies added without ADR** — `package.json` / `requirements.txt` / `Cargo.toml` additions need justification
- **Config changes in code, not config files** — env vars hardcoded, secrets in source, feature flags as constants

### 5. Enum & value completeness

- **New enum values handled in all `switch` / `if` branches** — TS exhaustiveness check; Python `match` with `assert_never`; no silent fall-through
- **API consumers updated** — frontend / mobile / downstream services handle the new value
- **Database column constraints match** — CHECK constraints or app-level validators cover the new values
- **i18n / l10n keys added** — new user-facing strings have translation entries
- **Telemetry / events emitted for new state** — observability gap if a new branch is silent

### 6. Reversibility & operability (eng lens spillover)

- **Feature flag in place** — new behavior behind a flag, not a hard cutover
- **Rollback path tested** — `git revert` of the merge commit produces a clean deploy
- **Runbook updated** — new failure modes documented for on-call
- **Alert thresholds set** — not just dashboards; PagerDuty/Opsgenie routes wired

---

## Output format

Findings are recorded in the QA Agent's progress report:

```markdown
## Structural review — <featureSlug> — <date>

### Findings

| Category | Severity | File | Line | Description | Action |
|----------|----------|------|------|-------------|--------|
| SQL & data safety | High | migrations/0042_add_idx.ts | 12 | Index added in same migration as query — OK | accept |
| LLM trust boundaries | High | services/agent/route.ts | 88 | User prompt concatenated into system prompt | **fix** — emit TestFailed |
| Scope drift | Medium | utils/date.ts | 1 | Refactored while in scope for unrelated feature | **fix** — revert + ScopeChangeRequest |
| Enum completeness | Low | services/billing/types.ts | 4 | New `currency: "USDC"` not in i18n catalog | **fix** — add key |

### Decision
- Findings marked **fix** → `TestFailed` intent + backtrack to Phase 3
- Findings marked **accept** → rationale recorded; Phase 4 exits
```

## Relationship to other phases

- **Phase 3 scope declaration** feeds the scope-drift check (category 4)
- **Phase 2 eng-lens scores** may pre-emptively flag categories 1 and 6
- **Phase 5 verification** re-checks categories 3 and 5 against production

---

## Version history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-22 | `@architect-agent` (via Zo) | Initial extraction from gstack `/review` |