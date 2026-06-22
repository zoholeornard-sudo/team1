# Deployment Checklist

**Owner:** DevOps Agent | **Trigger:** Pre-production deployment  
**Last Updated:** 2025-06-03

---

## Pre-Deployment

### Code Readiness

- [ ] All tests pass (unit, integration, E2E)
- [ ] Code review approved by 2+ engineers
- [ ] No P0/P1 bugs open against the change set
- [ ] Feature flags configured for gradual rollout
- [ ] Database migrations tested in staging
- [ ] Rollback procedure documented and rehearsed

### Security & Compliance

- [ ] Security scan passed (no critical/high vulnerabilities)
- [ ] Dependency audit clean
- [ ] Secrets rotated if needed
- [ ] Compliance check (SOC2, GDPR) signed off
- [ ] Penetration test complete (for major releases)

### Performance & Observability

- [ ] Load test completed against MBO targets
- [ ] Monitoring dashboards updated for new metrics
- [ ] Alerts configured for SLO breaches
- [ ] Logging verified at all layers
- [ ] Tracing instrumented for new code paths

### Communication

- [ ] Stakeholders notified of deployment window
- [ ] Status page entry prepared
- [ ] On-call rotation aware
- [ ] Customer-facing changelog drafted

---

## Deployment Window

### Pre-Deploy (T-30min)

- [ ] Freeze window confirmed (no concurrent deploys)
- [ ] Backup completed and verified
- [ ] Database snapshot taken
- [ ] Configuration validated in target environment

### Deploy Steps

- [ ] Deploy to canary (5% traffic)
- [ ] Monitor for 15 minutes — check error rates, latency
- [ ] If green: ramp to 25% → 50% → 100%
- [ ] If red: halt, execute rollback procedure
- [ ] Verify health checks pass at each stage

### Post-Deploy (T+0 to T+24h)

- [ ] Smoke tests in production
- [ ] Monitor error budget consumption
- [ ] Track SLO compliance
- [ ] Watch for new issues in `#deploy-watch`
- [ ] Confirm with feature owner

---

## Rollback Procedure

**When to roll back immediately:**

- Error rate > 1% above baseline
- Latency p99 > 2x baseline
- Critical user-facing bug
- Security incident
- Data corruption detected

**How to roll back:**

1. Halt traffic to new version via feature flag
2. Revert to previous stable deployment
3. Verify rollback successful
4. Post-mortem within 24 hours
5. Fix forward or keep reverted per decision

---

## MBO Targets

- **SaaS:** [See Assignment]
- **Web:** [See Assignment]
- **Mobile:** <1s cold app launch
- **Cloud:** [See Assignment], [See Assignment] provisioning
- **ML:** [See Assignment]

---

## Related

- Incident Response (`incident-response.md`)
- Feature Rollout (`../product-management/feature-rollout.md`)
