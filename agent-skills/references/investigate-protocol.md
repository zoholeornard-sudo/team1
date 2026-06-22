# Investigate Protocol — Root-Cause Discipline for All Agents

**Source:** Extracted from gstack `/investigate` skill (v1.58.4.0)
**Inherited by:** All 39 agents via `agent-skills/references/skill-template.md`
**Binding rule:** **No fixes without root cause.** An agent that patches a symptom without understanding why it occurred has not completed its task.

---

## The 4-Phase Protocol

Every agent that encounters an error, failure, or unexpected behavior MUST follow this sequence before proposing a fix:

### Phase 1: Investigate — Gather the facts

- Reproduce the failure. If it cannot be reproduced, document the exact conditions that triggered it.
- Read the error message, stack trace, and logs in full. Do not skim.
- Identify the *component* that failed, not just the *symptom*. "The test failed" is a symptom; "the mock returned undefined because the import path changed" is a component.
- Read the code path that led to the failure. Follow the call chain from entry point to failure site.
- **Output:** A factual statement of what happened, where, and under what conditions.

### Phase 2: Analyze — Find the mechanism

- Why did the component fail? What assumption was violated?
- Is this a logic error, a data error, a timing error, or an integration error?
- Could this failure have been caught earlier? Where is the earliest point it was detectable?
- **Do not propose a fix yet.** The goal is understanding, not action.
- **Output:** A root-cause statement: "X failed because Y assumed Z, which was no longer true after W."

### Phase 3: Hypothesize — Design the fix

- Propose the minimal fix that addresses the root cause, not the symptom.
- List 2-3 alternative approaches and why the chosen one is minimal.
- Identify what the fix does *not* address (known limitations).
- Consider whether the fix could introduce new failure modes.
- **Output:** A fix proposal with rationale, alternatives, and risk assessment.

### Phase 4: Implement — Apply and verify

- Apply the fix.
- Add or update a test that would have caught the original failure.
- Verify the fix resolves the failure and does not break existing tests.
- Document the root cause in the commit message: `[root-cause: <one-line>] <fix description>`.
- **Output:** A committed fix with a regression test and a traceable root-cause annotation.

---

## Anti-patterns (explicitly prohibited)

| Anti-pattern | Why it's wrong | What to do instead |
|-------------|---------------|-------------------|
| **Symptom patching** — wrapping the failing call in a try/catch that swallows the error | Hides the root cause; the failure will recur in a different form | Find why the call fails and fix that |
| **Shotgun fix** — changing multiple things at once to "see what works" | Obscures which change actually fixed it; makes regression impossible to bisect | Change one thing, test, repeat |
| **Adjacent refactor** — "while I'm in here, let me clean up this other code" | Mixes the fix with unrelated changes; review and revert become impossible | Fix the root cause. Leave adjacent code alone. File a separate task for cleanup |
| **Fix without test** — applying the fix but not adding a regression test | The failure will recur undetected | Every fix gets a test that fails before the fix and passes after |

---

## Integration with team1 lifecycle

| Lifecycle phase | When this protocol activates |
|----------------|------------------------------|
| Phase 3 (Implementation) | Agent hits a test failure or build error → investigate before patching |
| Phase 4 (Testing) | QA Agent finds a bug → investigate the root cause, not just "it fails on input X" |
| Phase 6 (Monitoring) | Incident Response Agent gets an alert → 4-phase protocol is the entire incident response process |
| Phase 7 (Analysis) | Retrospective must include root-cause statements for every remediation, not just "we fixed it" |

## Escalation trigger

An agent that proposes a fix without completing Phases 1-3 MUST be blocked by the edit-coordinator's scope validation (see `freeze-protocol.md`) or by the QA Agent at the Phase 4 gate. Escalate to the unit Manager with the incomplete investigation as evidence.
