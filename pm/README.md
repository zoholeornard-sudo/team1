---
version: 1.1
---

# team1 Platform Managers

AI Manager skill definitions for the team1 Platform — leadership roles responsible for department MBO objectives, team coordination, and cross-unit collaboration.

---

## Manager Roster

| Manager | Department | MBO Focus (default)* | File |
| --- | --- | --- | --- |
| SaaS Delivery Manager | SaaS Development Unit | [See Assignment] |  |
| Mobile Platform Manager | Mobile Development Unit | [See Assignment] |  |
| Web Delivery Manager | Web Development Unit | [See Assignment] |  |
| Desktop Solutions Manager | Desktop Development Unit | [See Assignment] |  |
| Cloud Operations Manager | Cloud Infrastructure Unit | [See Assignment] |  |
| MLOps Manager | ML/Ops Unit | [See Assignment] |  |
| Research & Innovation Manager | AI Research Unit | [See Assignment] |  |
| Data Science Manager | Data Science Unit | [See Assignment] |  |
| Security & Compliance Manager | Security & Compliance Unit | [See Assignment] |  |


*MBO Focus values shown are template defaults. Actual objectives are set per-assignment. See `assignments/README.md`.

---

## Patterns

### Operations Plugin → Cloud Operations Manager, Security & Compliance Manager

| Pattern | Application |
| --- | --- |
| Runbook Structure | Incident response, deployment procedures |
| Pre-Mortem Analysis | Risk identification before deployments |
| Status Communication | Stakeholder updates template |
| Post-Incident Review | Root cause analysis format |

### Product-Management Plugin → All Managers

| Pattern | Application |
| --- | --- |
| Spec Writing | Feature specifications, requirements |
| Success Metrics | MBO tracking, KPI definitions |
| Stakeholder Alignment | Cross-unit coordination |
| Preview/Review Cycle | Iteration feedback loops |

---

## Directory Structure

```markdown
pm/
├── saas-delivery-manager.md
├── mobile-platform-manager.md
├── web-delivery-manager.md
├── desktop-solutions-manager.md
├── cloud-operations-manager.md
├── mlops-manager.md
├── research-innovation-manager.md
├── data-science-manager.md
├── security-compliance-manager.md
└── README.md (this file)
```

---

## Related

- Agent Skills: `../agent-skills/`
- Skill Templates: `../agent-skills/references/`

---

*Version 1.0 — 2025-06-03*