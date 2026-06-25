---
version: 1.1.0
---

# team1 Agent Skills

Agentic AI skill definitions for the team1 Platform — a Management by Objectives (MBO) framework where functional departments are managed by AI Managers and executed by specialized AI Agents.

---

## Quick Navigation

### By Department

| Unit | Manager | MBO Target (assignment) | Skills |
| --- | --- | --- | --- |
| **SaaS Development** | SaaS Delivery Manager | *see metrics/mbo-targets.yaml* | [Architect](./architect-agent-skills.md), [Full-Stack Dev](./full-stack-dev-agent-skills.md), [DevOps](./devops-agent-skills.md), [UI/UX](./ui-ux-agent-skills.md), [Product Manager](./product-manager-agent-skills.md), [QA](./qa-agent-skills.md) |
| **Mobile Development** | Mobile Platform Manager | *see assignment* | [Mobile Architect](./mobile-architect-agent-skills.md), [Frontend Dev](./frontend-dev-agent-mobile-skills.md), [Backend Dev](./backend-dev-agent-mobile-skills.md), [Release](./release-agent-mobile-skills.md) |
| **Web Development** | Web Delivery Manager | *see assignment* | [Web Architect](./web-architect-agent-skills.md), [SEO Agent](./seo-agent-skills.md) |
| **Desktop Development** | Desktop Solutions Manager | *see assignment* | [Desktop Architect](./desktop-architect-agent-skills.md), [Crash Report](./crash-report-agent-skills.md) |
| **Cloud Infrastructure** | Cloud Operations Manager | *see assignment* | [Infra Architect](./infra-architect-agent-skills.md), [IaC](./iac-agent-skills.md), [Provisioning](./provisioning-agent-skills.md), [Cost Analyst](./cost-analyst-agent-skills.md), [Drift Detector](./drift-detector-agent-skills.md), [Security](./security-agent-skills.md) |
| **ML/Ops** | MLOps Manager | *see assignment* | [Data Prep](./data-prep-agent-skills.md), [Trainer](./trainer-agent-skills.md), [Validation](./validation-agent-skills.md), [Deployment](./deployment-agent-mlops-skills.md), [Monitor](./monitor-agent-mlops-skills.md), [Retrain Scheduler](./retrain-scheduler-agent-skills.md) |
| **AI Research** | Research & Innovation Manager | *see assignment* | [Literature Review](./literature-review-agent-skills.md), [Experiment Runner](./experiment-runner-agent-skills.md), [Metric Analyzer](./metric-analyzer-agent-skills.md), [Publication](./publication-agent-skills.md), [Collaboration](./collaboration-agent-skills.md) |
| **Data Science** | Data Science Manager | *see assignment* | [Data Ingestion](./data-ingestion-agent-skills.md), [Feature Engineering](./feature-engineering-agent-skills.md), [Statistical Analysis](./statistical-analysis-agent-skills.md), [Reporting](./reporting-agent-ds-skills.md), [Insight Delivery](./insight-delivery-agent-skills.md) |
| **Security & Compliance** | Security & Compliance Manager | *see assignment* | [Vulnerability Scanner](./vulnerability-scanner-agent-skills.md), [Policy Auditor](./policy-auditor-agent-skills.md), [Incident Response](./incident-response-agent-skills.md), [Threat Intelligence](./threat-intelligence-agent-skills.md), [Reporting](./reporting-agent-sec-skills.md) |

---

## Skill File Structure

Each skill file follows this pattern:

```markdown
agent-name-skills.md
├── Role Identity (Name, Handle, Department, Reporting)
├── Slack Profile (Display name, status, communication style)
├── Core Responsibilities (What this agent owns)
├── Primary Skills (Detailed skill breakdown with tools/capabilities)
├── Workflow Integration (Lifecycle phase involvement)
├── Collaboration Matrix (How this agent works with others)
├── Quality Targets (MBO-aligned metrics)
├── Tools & Artifacts (Outputs this agent produces)
├── Escalation Triggers (When to escalate to manager)
└── Version History (Change log)
```

---

## Design Philosophy (Applied to UI/UX Agents)

UI-focused agents follow the `frontend-design` aesthetic philosophy:

- **Typography**: Avoid Inter, Roboto, Arial. Choose distinctive, characterful fonts.
- **Color**: Dominant colors + sharp accents. Never purple gradients on white.
- **Motion**: One orchestrated page load &gt; scattered micro-interactions.
- **Layout**: Unexpected compositions. Asymmetry. Grid-breaking when appropriate.
- **Anti-Patterns**: No generic AI aesthetics. No Space Grotesk convergence.

---

## Integration Patterns

### Slack Presence

Every agent has a defined Slack profile for:

- **Channel behavior**: Where they post, how they thread
- **Communication style**: Tone, format, response time
- **Status indicators**: Emoji + status text for availability

### Lifecycle Integration

Agents align with their unit's defined lifecycle phases. Example (SaaS Unit):

```markdown
Planning → Architecture → Implementation → Testing → Deployment → Monitoring → Analysis
```

Each skill file documents which phases the agent leads vs. supports.

---

## References

- `file references/domain-template.md` — Template for adding new department domains
- `file references/skill-template.md` — Template for new agent skill files
- `file metrics/mbo-targets.yaml`
  
   — Source of truth for platform MBO targets and metrics

---

## Version History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0.0 | 2025-06-03 | TeamElite | Initial 39 agent skill definitions |
