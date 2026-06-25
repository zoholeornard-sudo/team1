---
version: 1.1
---

# team1 Operational Playbooks

Operational workflows and runbooks for the team1 Platform

---

## Structure

```
playbooks/
├── operations/          # Operational workflows
│   ├── incident-response.md
│   ├── deployment-checklist.md
│   └── capacity-planning.md
├── product-management/   # Product workflows
│   ├── sprint-planning.md
│   ├── feature-rollout.md
│   └── stakeholder-review.md
├── templates/           # Templates (use to create new playbooks)
│   ├── runbook.md
│   └── spec.md
└── README.md            # This file
```

---

## Quick Reference

| Playbook | Purpose | Trigger | Phase |
|----------|---------|---------|-------|
| `/runbook <task>` | Document repeatable procedure | New recurring task, on-call handoff | Any |
| `/write-spec <feature>` | Create PRD/feature spec | New feature, user request | Planning |
| `/incident` | Incident response workflow | Production issue | Monitoring |
| `/sprint-plan` | Sprint planning workflow | Start of sprint | Planning |

---

## Integration with team1 Agents

Each playbook can be invoked by corresponding agents:

| Agent Type | Primary Playbooks |
|------------|------------------|
| **DevOps Agent** | incident-response, deployment-checklist |
| **Product Manager Agent** | spec, sprint-planning, feature-rollout |
| **SaaS Delivery Manager** | stakeholder-review, capacity-planning |

---

## Usage Patterns

### For Managers

```
1. Planning: Use spec template for new initiatives
2. Review: Follow stakeholder-review playbook
3. Incident: Execute incident-response workflow
```

### For Agents

```
1. Receive task → Check runbook existence
2. No runbook → Create using template
3. Execute → Document results in History
4. Improve → Update runbook with learnings
```

---

## Playbook Quality Standards

Every playbook must include:

- [ ] **Phase badge** — Which lifecycle phase(s) this playbook applies to
- [ ] **Purpose** — What and when
- [ ] **Prerequisites** — Access, tools, data needed
- [ ] **Procedure** — Step-by-step with exact commands
- [ ] **Verification** — How to confirm success
- [ ] **Troubleshooting** — Common failures and fixes
- [ ] **Rollback** — How to undo
- [ ] **Escalation** — When and who to contact
- [ ] **History** — Run log with notes

---

## Maintenance

Playbooks are living documents. Update when:

- Process changes
- New failure modes discovered
- Tools or systems change
- After incident postmortems
- Quarterly review cycle

---

## MBO Data Source

When playbooks reference `[See Assignment]` or "MBO objectives", agents should look up the canonical values in:

- **`metrics/mbo-targets.yaml`** — Source of truth for all unit MBO objectives and metrics

The `[See Assignment]` placeholder pattern is used throughout playbooks to indicate where an agent must pull the relevant MBO target for the unit they are operating in.

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-06-03 | team1 Platform | Initial playbook structure |
| 1.1 | 2026-06-25 | team1 | Moved templates to `templates/` folder, renamed to `runbook.md` and `spec.md`. Added Phase column to Quick Reference. Added front-matter version. |
| 1.2 | 2026-06-25 | team1 | Updated MBO data source reference to `metrics/mbo-targets.yaml`. Added MBO Data Source section. |
