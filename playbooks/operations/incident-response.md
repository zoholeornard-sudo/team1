# Incident Response Playbook

**Owner:** DevOps Agent + Security Agent | **Severity Levels:** P0/P1/P2/P3  
**Last Updated:** 2025-06-03

---

## Severity Classification

| Severity | Impact | Response Time | Example |
|----------|--------|---------------|---------|
| **P0 - Critical** | Complete service outage, data loss risk | Immediate (< 5 min) | Database down, security breach |
| **P1 - High** | Major feature degraded, significant user impact | < 15 min | API errors > 10%, payment failures |
| **P2 - Medium** | Partial degradation, isolated impact | < 1 hour | Slow performance, single feature down |
| **P3 - Low** | Minor issue, workaround available | < 4 hours | UI glitch, non-critical bug |

---

## Incident Response Workflow

### Phase 1: Detect & Triage (0-5 min)

```
1. Alert received → Acknowledge immediately
2. Assess severity using classification above
3. Page on-call if P0/P1
4. Create incident channel: #incident-YYYY-MM-DD-brief-name
5. Post initial status to channel
```

**Initial Status Template:**
```
🚨 INCIDENT: [Brief Description]
Severity: P[0-3]
Status: Investigating
Impact: [User-facing impact]
Incident Lead: @[agent/person]
Next Update: [time, typically 15 min]
```

### Phase 2: Investigate (5-30 min)

```
1. Gather facts (what, when, where)
2. Check recent changes (deployments, config)
3. Review metrics dashboards
4. Check error logs
5. Form hypothesis
```

**Investigation Checklist:**

- [ ] When did it start? (Check graphs for inflection point)
- [ ] What changed? (deployments, config, traffic)
- [ ] Who is affected? (user segments, regions)
- [ ] Is it getting better or worse?

**Hypothesis Tracking:**
| # | Hypothesis | Status | Investigator |
|---|------------|--------|--------------|
| 1 | [Theory] | Testing | @[agent] |
| 2 | [Theory] | Ruled out | @[agent] |

### Phase 3: Mitigate (30-60 min)

**Goal:** Restore service, not fix root cause

```
1. Identify mitigation options
2. Choose fastest/safest option
3. Execute mitigation
4. Verify service restored
5. Update status
```

**Mitigation Options (ordered by speed):**

1. **Rollback** — Revert last deployment
2. **Feature flag off** — Disable problematic feature
3. **Scale up** — Add capacity
4. **Failover** — Switch to backup
5. **Traffic reroute** — Isolate affected region

**Mitigation Decision Matrix:**

| Option | Time to Execute | Risk | Data Loss Risk |
|--------|-----------------|------|----------------|
| Rollback | 5-10 min | Low | None |
| Feature flag | 1-2 min | Low | None |
| Scale up | 5-15 min | Medium | None |
| Failover | 5-10 min | Medium | Possible |
| Traffic reroute | 2-5 min | Medium | None |

### Phase 4: Communicate

**Stakeholder Updates** (every 30 min during active incident):

- Status (Investigating / Mitigating / Resolved)
- Current impact
- Next steps
- ETA for resolution

**External Communication** (if user-facing):

```
Template:
We're currently experiencing issues with [feature/service].
Impact: [what users are experiencing]
Status: [Investigating/Mitigating]
Next update: [time]

[Feature restored]
Status: Resolved
Duration: [X hours Y minutes]
[Optional: Brief explanation]
```

### Phase 5: Resolve & Document

```
1. Confirm service fully restored
2. Close incident channel
3. Schedule postmortem (for P0/P1)
4. Write incident report
```

---

## Incident Report Template

```markdown
## Incident Report: [Title]

**Date:** [Date]  
**Duration:** [Start time] - [End time] ([X hours Y minutes])  
**Severity:** P[0-3]  
**Incident Lead:** [Agent/Person]

### Impact
- [User-facing impact]
- [Number of users affected]
- [Revenue/business impact]

### Timeline
| Time | Event |
|------|-------|
| [HH:MM] | Alert triggered |
| [HH:MM] | Investigation started |
| [HH:MM] | Root cause identified |
| [HH:MM] | Mitigation deployed |
| [HH:MM] | Service restored |

### Root Cause
[Technical explanation]

### Trigger
[What caused the incident - deployment, config change, etc.]

### Contributing Factors
- [Factor 1]
- [Factor 2]

### Resolution
[How it was fixed]

### Action Items
| Action | Owner | Due |
|--------|-------|-----|
| [Prevent recurrence] | [Agent] | [Date] |
| [Improve detection] | [Agent] | [Date] |

### Lessons Learned
- What went well
- What could be improved
```

---

## Agent Responsibilities

| Agent | Responsibilities |
|-------|------------------|
| **DevOps Agent** | Lead incident response, execute mitigations, write runbooks |
| **Security Agent** | Security incidents, access control, forensics |
| **Architect Agent** | Architecture-related incidents, design review |
| **QA Agent** | Verify fixes, regression testing |
| **Delivery Manager** | Stakeholder communication, escalation decisions |

---

## Escalation

| Situation | Escalate To |
|-----------|-------------|
| P0 unresolved in 30 min | Delivery Manager + Executive |
| Security incident | Security & Compliance Manager |
| Data breach suspected | Security Agent + Legal |
| Vendor issue | Partner contact |
