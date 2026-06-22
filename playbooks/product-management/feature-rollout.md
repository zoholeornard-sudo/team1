# Feature Rollout Playbook

**Owner:** Product Manager + DevOps Agent  
**Last Updated:** 2025-06-03

---

## Purpose

Ship features safely using the platform's standard workflow: Spec → Security → Provision → Build → Integrate → Analyze → Monitor.

Mirrors the `workflowExample: "New Feature Rollout"` from the team1 Platform spec.

---

## Workflow Steps

| Step | Owner Unit | Output |
|------|------------|--------|
| 1. Spec Draft | SaaS Unit (Product Manager) | Approved spec |
| 2. Security Scan | Security & Compliance Unit | Pass / hold |
| 3. Provisioning | Cloud Infra Unit | Ready infra |
| 4. Build & Deploy | Dev Units | Deployed to prod |
| 5. Model Integration | ML/Ops & AI Research | Models wired |
| 6. Analytics Setup | Data Science Unit | Tracking live |
| 7. Monitoring & Self-Heal | Cross-unit | Alerts + auto-recovery |
| 8. Feedback & Reporting | MBO Engine | Metrics flowing |

---

## Rollout Modes

### A. Full Launch (default for small features)

- [ ] Spec approved
- [ ] All tests pass
- [ ] Feature flag: on for 100%
- [ ] Monitor for 24h

### B. Phased Rollout (default for risky or large features)

- [ ] 1% → 5% → 25% → 50% → 100%
- [ ] Dwell 1-7 days at each stage
- [ ] Auto-promote or auto-rollback on metrics

### C. Dark Launch

- [ ] Code deployed, flag off
- [ ] Run load tests in prod
- [ ] Compare to baseline

### D. Beta Cohort

- [ ] Internal users first
- [ ] Invited customers
- [ ] Public GA later

---

## Pre-Rollout Checklist

- [ ] Spec written and approved (see spec template)
- [ ] Architecture sign-off (Architect Agent)
- [ ] Security scan passed (Vulnerability Scanner)
- [ ] Load test plan executed
- [ ] Feature flag configured
- [ ] Analytics events instrumented
- [ ] Dashboards built
- [ ] Alerts configured
- [ ] Rollback plan documented
- [ ] Stakeholders notified

---

## Rollout Day

1. [ ] Pre-deploy: verify green build, capacity available
2. [ ] Deploy to staging first
3. [ ] Smoke test staging
4. [ ] Deploy to prod (canary → full or phased)
5. [ ] Monitor dashboards for 2 hours
6. [ ] Announce in `#feature-launch`
7. [ ] Update rollout status doc

---

## Monitoring During Rollout

Watch for:
- [ ] Error rate change (>0.1% increase = investigate)
- [ ] Latency change (>10% p95 = investigate)
- [ ] New exceptions in error tracking
- [ ] Customer support tickets spike
- [ ] Conversion / engagement drop

---

## Rollback Decision Matrix

| Signal | Action |
|--------|--------|
| Error rate > 2x baseline | Immediate rollback |
| Latency p95 > 1.5x baseline | Investigate, rollback if 30 min |
| Critical bug reported | Rollback within 1 hour |
| Negative customer feedback trending | Investigate, optional rollback |
| No signals after 24h | Promote to next phase |

---

## Post-Rollout

- [ ] Mark feature as "Rolled out" in tracker
- [ ] Update MBO progress notes
- [ ] Schedule post-launch review (1 week, 1 month)
- [ ] Capture learnings
- [ ] Clean up feature flag if permanent

---

## Related

- Deployment Checklist
- Incident Response
- Spec Template
- Sprint Planning
