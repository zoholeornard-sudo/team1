---
name: write-spec
description: Write a feature spec or PRD from a problem statement or feature idea.
trigger phrases:
  - "write a spec for"
  - "create a PRD"
  - "new feature proposal"
---

# [Feature Name] - Product Requirements Document

> **Phase:** Planning & Requirements
> **Author:** [Product Manager Agent]
> **Status:** [Draft / Review / Approved]
> **Target Release:** [Version/Date]

---

## Problem Statement

[2-3 sentences describing the user problem. Who experiences it? How often? What is the cost of not solving it?]

**Evidence:**
- [User research finding]
- [Support data or metrics]
- [Customer feedback quote]

---

## Goals

**Primary Goal:**
[One measurable outcome - "How will we know this succeeded?"]

**Secondary Goals:**
1. [Outcome 1]
2. [Outcome 2]
3. [Outcome 3]

---

## Non-Goals

**Explicitly out of scope:**

1. [What we're NOT building] — [Why: complexity, separate initiative, premature]
2. [What we're NOT building] — [Why]
3. [What we're NOT building] — [Why]

---

## User Stories

### Primary Persona: [Persona Name]

```
As a [user type],
I want [capability],
So that [benefit].
```

### Additional Stories

| Priority | Story |
|----------|-------|
| P0 | As a [user], I want [capability], so that [benefit] |
| P0 | As a [user], I want [capability], so that [benefit] |
| P1 | As a [user], I want [capability], so that [benefit] |
| P2 | As a [user], I want [capability], so that [benefit] |

### Edge Cases

- [Edge case 1]: [Expected behavior]
- [Edge case 2]: [Expected behavior]

---

## Requirements

### Must-Have (P0)

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| R1 | [Requirement] | [Given/When/Then format] |
| R2 | [Requirement] | [Given/When/Then format] |
| R3 | [Requirement] | [Given/When/Then format] |

### Nice-to-Have (P1)

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| R4 | [Requirement] | [Given/When/Then format] |

### Future Considerations (P2)

| ID | Requirement | Notes |
|----|-------------|-------|
| R5 | [Requirement] | [Architecture consideration] |

---

## Success Metrics

### Leading Indicators (Days to Weeks)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Adoption rate | X% within 30 days | [Analytics tool] |
| Task completion | Y% success rate | [Analytics tool] |
| Error rate | < Z% | [Error tracking] |

### Lagging Indicators (Weeks to Months)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Retention impact | +X% | Cohort analysis |
| Revenue impact | $Y | Subscription metrics |

---

## Open Questions

| Question | Owner | Blocking? | Status |
|----------|-------|-----------|--------|
| [Question] | Engineering | Yes | Open |
| [Question] | Design | No | Open |
| [Question] | Legal | Yes | Needs review |

---

## Timeline Considerations

**Dependencies:**
- [Team/system dependency]
- [External dependency]

**Suggested Phasing:**
- Phase 1 (v1.0): [Core capability]
- Phase 2 (v1.1): [Enhancement]
- Phase 3 (v2.0): [Advanced feature]

---

## Appendix

**Technical Constraints:**
- [Constraint 1]
- [Constraint 2]

**Related Documents:**
- Design: [Link to mockups]
- Research: [Link to research doc]
- Technical spec: [Link to architecture doc]

---

## Spec Writing Guidelines

### Good User Stories Are:
- **Independent** — Can be developed standalone
- **Valuable** — Delivers value to users
- **Estimable** — Team can estimate effort
- **Small** — Completes in one sprint
- **Testable** — Clear verification method

### Common Mistakes

❌ "As a user, I want the product to be faster"
✅ "As a data analyst, I want query results within 5 seconds so I can iterate quickly"

❌ "As a user, I want a dropdown menu"
✅ "As a user, I want to select my country so forms pre-fill correctly"

### Scope Management

If everything is P0, nothing is P0. Ask: "Would we really not ship without this?"

P2s are architectural insurance — design for them but don't build them yet.
