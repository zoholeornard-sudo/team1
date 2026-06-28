# Deployment Checklist

> **Phase:** 5 — Deployment & Release
> **Owner:** DevOps Agent | **Trigger:** Pre-production deployment
> **Last Updated:** 2025-06-27
> **Rollback thresholds:** See [Feature Rollout Playbook](../product-management/feature-rollout.md) Rollback Decision Matrix

---

> **Note:** This checklist covers *code-readiness* gates only. Cross-unit coordination gates (security, analytics, MBO) live in the Feature Rollout Playbook. Execute both checklists in parallel where applicable.

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

> Thresholds are MBO-derived. See the [Rollback Decision Matrix](../product-management/feature-rollout.md) in the Feature Rollout Playbook for unit-specific values.

- Error rate > 2x baseline (or unit-specific threshold from `metrics/mbo-targets.yaml`)
- Latency p95 > 1.5x baseline (SaaS: >300ms)
- Critical user-facing bug
- Security incident
- Data corruption detected

**How to roll back:**

1. Activate kill switch flag (instant traffic halt to new version)
2. If flag insufficient: revert to previous stable deployment
3. Verify rollback successful
4. Emit `intents:rollback-triggered` to `workflow` service
5. Post-mortem scheduled within 24h via `review-scheduler`

---

## Related

- [Incident Response](`incident-response.md`) — severity classification and IR workflow
- [Feature Rollout](../product-management/feature-rollout.md`) — full lifecycle rollback thresholds and intent events
