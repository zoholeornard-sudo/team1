# Sprint Planning

> **Phase:** 1 — Planning & Requirements
> **Owner:** Product Manager | **Cadence:** Bi-weekly
> **Last Updated:** 2025-06-03

---

## Purpose

Align agent work to MBO objectives and ship a predictable cadence of customer value.

---

## Inputs

- [ ] Product roadmap and prioritized backlog
- [ ] Velocity data (last 3 sprints)
- [ ] MBO objectives per department
- [ ] Agent capacity (1 Product Manager, 3 Full-Stack Dev, 1 QA, 1 DevOps, 1 Architect, 1 UI/UX)
- [ ] Cross-team dependencies

---

## Cadence

| Event | Duration | Participants |
|-------|----------|--------------|
| Pre-planning | 1 day before | Product Manager preps |
| Sprint Planning | 2-4 hours | All SaaS Unit agents |
| Daily standup | 15 min | All agents |
| Sprint Review | 1 hour | Stakeholders + agents |
| Retro | 1 hour | All agents |

---

## Process

### 1. Define Sprint Goal

- [ ] Pick 1-2 MBO-aligned outcomes
- [ ] Frame as user value, not output
- [ ] Example: "Reduce API p95 latency from 250ms to 180ms"

### 2. Select Backlog Items

- [ ] Top items from prioritized backlog
- [ ] Fit within capacity (velocity ± 20%)
- [ ] No blocking dependencies unaddressed
- [ ] Each item has clear acceptance criteria

### 3. Break Down Work

- [ ] For each item:
  - [ ] Technical approach (Architect Agent input)
  - [ ] Design (UI/UX Agent input)
  - [ ] Implementation tasks (Dev Agents)
  - [ ] QA test plan (QA Agent)
  - [ ] Deployment plan (DevOps Agent)

### 4. Assign Owners

- [ ] Primary owner per item
- [ ] Reviewer per item
- [ ] Cross-agent collaboration points identified

### 5. Commit

- [ ] Each agent confirms capacity
- [ ] Identify risks and assumptions
- [ ] Set check-in cadence

---

## Output: Sprint Board

```markdown
## Sprint [N] — Goal: [One-line]

| Item | Owner | Reviewer | Status | MBO Tie |
|------|-------|----------|--------|---------|
| API caching | Full-Stack Dev A | Architect | In Progress | [See Assignment] target |
| New tenant onboarding | Full-Stack Dev B | PM | To Do | Multi-tenant |
| Login redesign | UI/UX | Full-Stack Dev C | In Design | UX score |

### Risks
- DevOps agent pulled into incident
- External API dependency unclear

### Capacity Used
- 28/30 points committed (93%)
```

---

## Anti-Patterns

| Avoid | Why |
|-------|-----|
| Over-committing | Hides problems, erodes trust |
| Vague items | Can't be sized or tested |
| No MBO tie | Activity, not outcome |
| Skipping break-down | Surprises mid-sprint |

---

## Related

- Product Manager skills
- Spec template
- Task management
- Capacity planning
