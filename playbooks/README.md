# team1 Operational Playbooks

Operational workflows and runbooks for the team1 Platform — extracted and adapted from Anthropic's knowledge-work-plugins (operations, product-management).

---

## Structure

```
playbooks/
├── operations/          # Operational workflows
│   ├── runbook-template.md
│   ├── incident-response.md
│   ├── deployment-checklist.md
│   └── capacity-planning.md
├── product-management/   # Product workflows
│   ├── spec-template.md
│   ├── sprint-planning.md
│   ├── feature-rollout.md
│   └── stakeholder-review.md
└── README.md            # This file
```

---

## Quick Reference

| Playbook | Purpose | Trigger |
|----------|---------|---------|
| `/runbook <task>` | Document repeatable procedure | New recurring task, on-call handoff |
| `/write-spec <feature>` | Create PRD/feature spec | New feature, user request |
| `/incident` | Incident response workflow | Production issue |
| `/sprint-plan` | Sprint planning workflow | Start of sprint |

---

## Integration with team1 Agents

Each playbook can be invoked by corresponding agents:

| Agent Type | Primary Playbooks |
|------------|------------------|
| **DevOps Agent** | runbook, incident-response, deployment-checklist |
| **Product Manager Agent** | write-spec, sprint-planning, feature-rollout |
| **SaaS Delivery Manager** | stakeholder-review, capacity-planning |

---

## Usage Patterns

### For Managers

```
1. Planning: Use /write-spec for new initiatives
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

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-06-03 | team1 Platform | Initial playbook structure |
