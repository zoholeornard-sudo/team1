# Feature Rollout Playbook

> **Phase:** 1 → 7 — Full lifecycle (Planning through Monitoring)
> **Owner:** Product Manager + DevOps Agent
> **Last Updated:** 2025-06-27
> **Thresholds:** MBO-derived — see `metrics/mbo-targets.yaml` for canonical values

---

## Purpose

Ship features safely using the platform's standard workflow: Spec → Security → Provision → Build → Integrate → Analyze → Monitor.

Mirrors the `workflowExample: "New Feature Rollout"` from the team1 Platform spec.

---

## Platform Integration

This playbook is executed by the orchestrator's bounded-context services. Every step transition emits an intent envelope on the Redis bus (ADR-0002). Agents subscribe to intent topics; managers consume via `manager-loop`.

### Service Port Map

| Service | Port | Role in Rollout |
|---------|------|-----------------|
| `workflow` | `:3108` | Persists workflow/task records in DuckDB |
| `lifecycle-management` | `:3104` | Dual-gate phase gating (artifact + MBO) |
| `task-management` | `:3101` | Tracks task state per agent instance |
| `metric-alert` | `:3112` | Monitors MBO metrics, emits alerts on threshold breach |
| `review-scheduler` | `:3110` | Emits `ReviewRequested` every N turns for manager review |
| `conflict-detector` | `:3111` | Detects contradictory proposals, spawns backup agents |
| `manager-loop` | `:3109` | Monitors stalled agents, issues reassign/escalate intents |

### Intent Envelope Schema

Every transition emits an envelope of this shape:

```json
{
  "type": "IntentType",
  "idempotencyKey": "<type>-<featureSlug>-<timestamp>",
  "featureSlug": "<kebab-case-slug>",
  "branch": "feature/<slug>-<handle>-<N>",
  "timestamp": "<ISO8601>",
  "payload": { ... }
}
```

### Branch Naming Convention

Each agent instance works on a branch following the pattern:

```
feature/<featureSlug>-<agentHandle>-<instanceNumber>
```

Example: `feature/user-auth-architect-agent-2`

The feature slug is globally unique, minted by `orchestrator-api` at `FeatureSubmitted` time. No two features share a slug.

### Feature Flag Framework

All rollout modes use feature flags for traffic control and rollback. The platform uses a unified flag service:

| Flag Type | Purpose | Tool |
|----------|---------|------|
| **Percentage gate** | Controls traffic % in phased rollout | Flag service (percentage rule) |
| **Cohort gate** | Targets internal users, beta cohort | Flag service (cohort rule) |
| **Kill switch** | Instant rollback to baseline | Flag service (boolean, default-on for safety) |

Flag lifecycle:
1. Flag created at spec approval (Step 1)
2. Flag configured per rollout mode (Step 4)
3. Flag adjusted during phased rollout (Mode B)
4. Flag removed or set to 100% in post-rollout (Step 8)

---

## Workflow Steps

Each step boundary is a **phase gate**. Transition requires emitting `intents:phase-gate-check` and receiving `intents:phase-gate-passed` from `lifecycle-management` (port `:3104`).

| Step | Owner Unit | Output | Intent Event Emitted |
|------|------------|--------|---------------------|
| 1. Spec Draft | SaaS Unit (Product Manager) | Approved spec | `intents:spec-committed` |
| 2. Security Scan | Security & Compliance Unit | Pass / hold | `intents:scan-completed` |
| 3. Provisioning | Cloud Infra Unit | Ready infra | `intents:infra-provisioned` |
| 4. Build & Deploy | Dev Units | Deployed to prod | `intents:deploy-completed` |
| 5. Model Integration | ML/Ops & AI Research | Models wired | `intents:models-integrated` |
| 6. Analytics Setup | Data Science Unit | Tracking live | `intents:analytics-live` |
| 7. Monitoring & Self-Heal | Cross-unit | Alerts + auto-recovery | `intents:monitoring-active` |
| 8. Feedback & Reporting | metric-alert + review-scheduler | Metrics flowing | `intents:review-requested` |

---

## Rollout Modes

### Mode Selection Criteria

| Mode | When to Use | Decision Owner |
|------|-------------|----------------|
| **A. Full Launch** | Low risk, small blast radius, no data model changes | Product Manager |
| **B. Phased Rollout** | Risky, large feature, data model changes, affects p95 latency | Product Manager + Architect Agent |
| **C. Dark Launch** | Performance-sensitive, needs production load comparison | DevOps Agent + Architect Agent |
| **D. Beta Cohort** | UX changes needing user feedback, customer-facing | Product Manager + UI/UX Agent |

### A. Full Launch (default for small features)

- [ ] Spec approved
- [ ] All tests pass
- [ ] Feature flag: percentage gate set to 100%
- [ ] Kill switch flag: enabled (instant rollback)
- [ ] Monitor for 24h
- [ ] `metric-alert` thresholds active (port `:3112`)

### B. Phased Rollout (default for risky or large features)

- [ ] 1% → 5% → 25% → 50% → 100%
- [ ] Dwell 1-7 days at each stage
- [ ] Auto-promote: emit `intents:phase-gate-passed` when MBO metrics on-target
- [ ] Auto-rollback: emit `intents:rollback-triggered` when threshold breached
- [ ] `metric-alert` monitors at each gate transition

**State Machine:**

```
[1%] --MBO pass--> [5%] --MBO pass--> [25%] --MBO pass--> [50%] --MBO pass--> [100%]
   |                    |                      |                      |                      |
   +---rollback--------++---rollback---------++---rollback---------++---rollback---------+
                        (emits intents:rollback-triggered, halts traffic via kill switch)
```

### C. Dark Launch

- [ ] Code deployed, flag off (percentage gate = 0%)
- [ ] Run load tests in prod
- [ ] Compare to baseline:
  - [ ] Latency p95 must be ≤ baseline + 10% (MBO: sub-200ms for SaaS)
  - [ ] Error rate must be ≤ baseline
  - [ ] Resource utilization (CPU/memory) must be ≤ baseline + 15%
- [ ] If all criteria pass: proceed to Mode A or B
- [ ] If any criterion fails: investigate, fix, re-test

### D. Beta Cohort

- [ ] Internal users first (cohort gate: `internal` segment)
- [ ] Invited customers (cohort gate: `beta` segment)
- [ ] Public GA later (percentage gate: 100%)
- [ ] Each cohort transition requires `intents:phase-gate-passed`

---

## Pre-Rollout Checklist

> This checklist is a **superset** of `playbooks/operations/deployment-checklist.md`. The deployment checklist covers code-readiness gates; this checklist adds cross-unit coordination gates.

- [ ] Spec written and approved (see `playbooks/templates/spec.md`)
- [ ] Architecture sign-off (Architect Agent) — emits `intents:architecture-approved`
- [ ] Security scan passed (Vulnerability Scanner) — emits `intents:scan-completed` with `critical_vulns = 0`
- [ ] Load test plan executed against MBO targets (see `metrics/mbo-targets.yaml`)
- [ ] Feature flag created in flag service (percentage gate + kill switch)
- [ ] Analytics events instrumented (Data Science Unit)
- [ ] Dashboards built in monitoring stack
- [ ] Alerts configured in `metric-alert` (port `:3112`) with MBO-derived thresholds
- [ ] Rollback plan documented (see Rollback Decision Matrix below)
- [ ] Stakeholders notified via `#feature-launch` channel
- [ ] Branch created: `feature/<slug>-<handle>-<N>`
- [ ] Workflow tasks created in `workflow` service (port `:3108`)

---

## Rollout Day

1. [ ] Pre-deploy: verify green build, capacity available
2. [ ] Emit `intents:deploy-started` to workflow service
3. [ ] Deploy to staging first
4. [ ] Smoke test staging
5. [ ] Deploy to prod per selected rollout mode (canary → full or phased)
6. [ ] At each ramp stage: `lifecycle-management` evaluates MBO gate
7. [ ] Monitor dashboards for 2 hours (or per phased dwell time)
8. [ ] Announce in `#feature-launch`
9. [ ] Update rollout status doc
10. [ ] Emit `intents:deploy-completed` to workflow service

---

## Monitoring During Rollout

> All thresholds are MBO-derived from `metrics/mbo-targets.yaml`. The `metric-alert` service (port `:3112`) evaluates every metric. Warnings emit `intents:metric-warning`; criticals emit `intents:metric-critical`.

### Universal Rollout Signals

| Metric | Warning | Critical | Applies To |
|--------|---------|----------|------------|
| Error rate | >0.1% increase | >0.5% increase | All units |
| New exceptions | Any unhandled | >5 in 5 min | All units |
| Support tickets | >2x baseline | >5x baseline | All units |
| Conversion / engagement | >5% drop | >15% drop | Customer-facing units |

### Unit-Specific MBO Thresholds

| Unit | Metric | Warning | Critical | MBO Target |
|------|--------|---------|----------|------------|
| SaaS | Latency p95 | >10% above baseline | >25% above baseline (>300ms) | sub-200ms |
| SaaS | Uptime | <99.95% | <99.9% | 99.9% |
| SaaS | Bug escape rate | >3% | >5% | <5% |
| SaaS | Deployment success | <99.5% | <99% | >99% |
| SaaS | MTTR | >10 min | >15 min | <15 min |
| SaaS | Feature adoption | <50% at 7d | <30% at 14d | >60% |
| Mobile | Cold launch | >800ms | >1000ms | <1s |
| Mobile | Crash-free rate | <99.7% | <99.5% | >99.5% |
| Mobile | CI cycle time | >90 min | >120 min | <2 hours |
| Web | TTFB | >800ms | >1000ms | <1s |
| Web | Lighthouse score | <85 | <80 | >90 |
| Desktop | Installer success | <99.5% | <99% | Zero failures |
| Desktop | Crash MTTR | >3 min | >5 min | <5 min |
| Cloud | Provisioning time | >20s | >30s | <30s |
| Cloud | Cost utilization | <90% | <85% | 95% |
| Cloud | Drift detection coverage | <95% | <90% | 100% |
| ML/Ops | Drift false positives | >0.3% | >0.5% | <0.5% |
| ML/Ops | Deployment time | >10 min | >15 min | <15 min |
| ML/Ops | Model freshness | >45 min | >60 min | <1 hour |
| Data Science | Pipeline reliability | <99% | <95% | >99% |
| Data Science | A/B test lift | <5% | <0% | >10% |
| Security | Critical vulns | >0 | >0 | Zero |
| Security | IR response time | >30 min | >60 min | <1 hour |
| Security | Alert latency | >3 min | >5 min | <5 min |

### Auto-Actions

| metric-alert Signal | Auto-Action Intent Emitted |
|--------------------|-------------|----------------|
| Warning | `manager-loop` notified; increase monitoring frequency | `intents:metric-warning` |
| Critical | Kill switch activated; traffic halted to new version | `intents:metric-critical` |
| 3 consecutive criticals | Automatic rollback | `intents:rollback-triggered` |

---

## Rollback Decision Matrix

> Thresholds are MBO-derived. Values below are for SaaS Unit; other units adjust per `metrics/mbo-targets.yaml`.

| Signal | Threshold | Action | Intent Emitted |
|--------|-----------|--------|----------------|
| Error rate | >2x baseline | Immediate rollback via kill switch | `intents:rollback-triggered` |
| Latency p95 | >1.5x baseline (SaaS: >300ms) | Investigate; rollback if persists 30 min | `intents:rollback-triggered` |
| Critical bug reported | Any | Rollback within 1 hour | `intents:rollback-triggered` |
| Negative customer feedback | Trending | Investigate; optional rollback | `intents:rollback-warning` |
| No signals after dwell time | Per rollout mode | Promote to next phase | `intents:phase-gate-passed` |

**Rollback execution:**
1. `metric-alert` (port `:3112`) emits `intents:rollback-triggered`
2. `manager-loop` (port `:3109`) confirms or overrides
3. Kill switch flag activated → traffic routed to baseline
4. `workflow` service (port `:3108`) marks current task as `blocked`
5. Post-mortem scheduled within 24h via `review-scheduler` (port `:3110`)

---

## Post-Rollout

- [ ] Mark feature as "Rolled out" in `workflow` service (port `:3108`)
- [ ] Update MBO progress notes in `review-scheduler` (port `:3110`)
- [ ] Schedule post-launch review (1 week, 1 month) via `review-scheduler`
- [ ] Capture learnings in workflow task retrospective
- [ ] Clean up feature flag if permanent (or retain kill switch for future use)
- [ ] Archive branch `feature/<slug>-<handle>-<N>` per retention policy

---

## Related

- [Deployment Checklist](`playbooks/operations/deployment-checklist.md`) — code-readiness gates
- [Incident Response](`playbooks/operations/incident-response.md`) — severity classification and IR workflow
- [Spec Template](`playbooks/templates/spec.md`) — PRD format for Step 1
- [Sprint Planning](`playbooks/product-management/sprint-planning.md`) — Phase 1 cadence
- [Stakeholder Review](`playbooks/product-management/stakeholder-review.md`) — Phase 7 feedback loops
- [`metrics/mbo-targets.yaml`](`metrics/mbo-targets.yaml`) — canonical MBO targets per unit
