# Capacity Planning

> **Phase:** 1 — Planning & Requirements (quarterly); 6 — Monitoring (continuous)
> **Owner:** Cloud Operations Manager | **Cadence:** Quarterly + ad-hoc
> **Last Updated:** 2025-06-03

---

## Purpose

Right-size infrastructure to meet MBO performance targets while controlling cost. Targets the platform's [See Assignment] and [See Assignment] provisioning time.

> Canonical MBO values: `metrics/mbo-targets.yaml`

---

## Cadence

| Type | Frequency | Participants |
|------|-----------|--------------|
| Quarterly Review | Every 3 months | Cloud Operations Manager, DevOps Agent, Architect Agent, Product Manager |
| Ad-hoc Trigger | Growth events, perf degradation | Cloud Operations Manager + DevOps Agent |
| Continuous Monitoring | Real-time | Provisioning Agent, Cost Analyst Agent |

---

## Inputs to Gather

- [ ] **Current usage** — CPU, memory, storage, network, request volume
- [ ] **Growth projections** — From Product Manager (feature roadmap)
- [ ] **Performance targets** — From MBO objectives (sub-200ms API, 100k concurrent)
- [ ] **Cost targets** — Budget, MBO cost utilization goal
- [ ] **Upcoming events** — Launches, marketing, seasonal spikes

---

## Analysis Steps

### 1. Current State

- [ ] Pull last 90 days utilization from monitoring
- [ ] Identify peak vs average load
- [ ] Flag underutilized resources (<20% avg CPU)
- [ ] Flag overutilized resources (>80% avg CPU)

### 2. Forecast

- [ ] Project growth 3, 6, 12 months out
- [ ] Model new feature impact
- [ ] Account for MBO target scale (e.g., 100k concurrent)

### 3. Gap Analysis

- [ ] Compare current capacity to forecast
- [ ] Identify scaling gaps
- [ ] Estimate cost delta

### 4. Recommendation

- [ ] Propose scaling actions
- [ ] Propose cost optimization
- [ ] Define rollout timeline

---

## Output: Capacity Plan

```markdown
## Capacity Plan — [Period]

### Forecast Summary
- Expected load: X req/s (Y% growth)
- Peak: X req/s
- New tenants: N

### Recommended Actions
| Action | Resource | Timeline | Cost Impact |
|--------|----------|----------|-------------|
| Scale up API tier | ECS service A | 2 weeks | +$X/mo |
| Right-size DB | RDS instance | 1 week | -$Y/mo |

### Cost Projection
- Current: $X/mo
- Projected: $Y/mo
- MBO target: 95% utilization (currently: Z%)
```

---

## Common Patterns

| Scenario | Response |
|----------|----------|
| Steady growth | Horizontal scaling + IaC templates |
| Bursty load | Auto-scaling groups, serverless for peaks |
| Cost pressure | Reserved instances, spot for non-critical |
| New tenant onboarding | Multi-tenant capacity pools |

---

## Escalation

Escalate to team1 Platform executive when:
- Capacity needs exceed quarterly budget
- MBO targets conflict (cost vs performance)
- Provisioning SLA slipping (see Assignment target)

---

## Related Documents

- Deployment Checklist
- Incident Response Playbook
- Cloud Operations Manager skills
- Provisioning Agent skills
