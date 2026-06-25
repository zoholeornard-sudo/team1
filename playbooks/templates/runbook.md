# Runbook Template

Use this template to document any repeatable operational procedure.

---

## Runbook: [Task Name]

> **Phase:** [Lifecycle phase(s) — e.g., Monitoring, Deployment]
> **Owner:** [Team/Agent] | **Frequency:** [Daily/Weekly/As Needed]
> **Last Updated:** [Date] | **Last Run:** [Date]

### Purpose

[What this runbook accomplishes and when to use it]

### Prerequisites

- [ ] [Access or permission needed]
- [ ] [Tool or system required]
- [ ] [Data or input needed]

### Procedure

#### Step 1: [Name]

```
[Exact command, action, or instruction]
```

**Expected result:** [What should happen]
**If it fails:** [What to do]

#### Step 2: [Name]

```
[Exact command, action, or instruction]
```

**Expected result:** [What should happen]
**If it fails:** [What to do]

#### Step 3: [Name]

```
[Exact command, action, or instruction]
```

**Expected result:** [What should happen]
**If it fails:** [What to do]

### Verification

- [ ] [How to confirm task completed successfully]
- [ ] [What to check]

### Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| [What you see] | [Why] | [What to do] |
| [What you see] | [Why] | [What to do] |

### Rollback

[How to undo this if something goes wrong]

```
[Rollback commands]
```

### Escalation

| Situation | Contact | Method |
|-----------|---------|--------|
| [When to escalate] | [Who] | [How to reach them] |
| [When to escalate] | [Who] | [How to reach them] |

### History

| Date | Run By | Notes |
|------|--------|-------|
| [Date] | [Agent/Person] | [Any issues or observations] |

---

## Runbook Writing Guidelines

### Be Painfully Specific

❌ Bad: "Run the script"
✅ Good: "Run `python sync.py --prod --dry-run` from the ops server"

❌ Bad: "Check if it worked"
✅ Good: "Verify `curl -s https://api.example.com/health` returns `{"status": "ok"}`"

### Include Failure Modes

For every step, document:
1. What can go wrong
2. How to detect it failed
3. What to do about it

### Test the Runbook

Have someone unfamiliar with the process follow it. Fix where they get stuck.

### Keep It Updated

Update after:
- Process changes
- New failure modes discovered
- Tools or systems change
- Incident postmortems

---

## Common Runbook Types

| Type | Example | Owner |
|------|---------|----|
| Deployment | Production release | DevOps Agent |
| Incident Response | Database failover | DevOps + Security |
| Maintenance | Index rebuild | DBA/DevOps |
| Backup/Restore | Data recovery | DevOps Agent |
| Monitoring | Alert investigation | DevOps Agent |
| On-call | Rotation handoff | All agents |
