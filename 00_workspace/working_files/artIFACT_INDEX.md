# Artifact Index

> Last rebuilt: 2025-06-27

## Working Files

### MBO Alignment Audit

| File | Status | Notes |
|------|--------|-------|
| `metrics/mbo-targets.yaml` | **Needs update** | 15 gaps vs agent skills — see alignment audit below |
| `playbooks/product-management/feature-rollout.md` | Updated | Added intent events, MBO-derived thresholds, feature flag framework |
| `playbooks/operations/deployment-checklist.md` | Updated | Removed hardcoded thresholds, references rollout playbook |

---

## MBO Targets ↔ Agent Skills Alignment Audit

### SaaS Development Unit

| MBO Metric | Target | Agent Skill Quality Target | Gap? |
|------------|--------|---------------------------|------|
| Uptime | 99.9% | Architect: "99.99% uptime SLA" | ⚠️ Conflict — MBO says 99.9%, Architect skill says 99.99% |
| API Response | sub-200ms | Fullstack: "see assignment" (vague) | ⚠️ Fullstack has no explicit target |
| Delivery Velocity | On-time feature delivery | PM: "Sprint velocity maintained" | ✅ Aligned (qualitative) |
| Quality | <5% bug escape | QA: "<5% to production", Fullstack: "<5% to production" | ✅ Aligned |

### Mobile Development Unit

| MBO Metric | Target | Agent Skill Quality Target | Gap? |
|------------|--------|---------------------------|------|
| CI Cycle Time | <2 hours | Mobile Architect: "<2 hours" | ✅ Aligned |
| Cold Launch | <1 second | Mobile Architect: "<1s launch time" | ✅ Aligned |
| App Store Rating | 4.5+ stars | Mobile Architect: ">4.5" | ✅ Aligned |
| Release Velocity | Weekly releases | Release Agent: "<24h from code freeze" | ✅ Aligned (different cadence metric) |

### Web Development Unit

| MBO Metric | Target | Agent Skill Quality Target | Gap? |
|------------|--------|---------------------------|------|
| TTFB | <1s at 100k concurrent | Web Architect: "<1s at 100k users" | ✅ Aligned |
| Accessibility | WCAG 2.1 AA | Web Architect: "Level AA" | ✅ Aligned |
| SEO Score | >90 | Web Architect: ">90" (Lighthouse) | ✅ Aligned |

### Desktop Development Unit

| MBO Metric | Target | Agent Skill Quality Target | Gap? |
|------------|--------|---------------------------|------|
| Installer Success | Zero failures | Desktop Architect: "0% failure rate" | ✅ Aligned |
| Crash MTTR | <5 minutes | Desktop Architect: "<5 minutes" | ✅ Aligned |

### Cloud Infrastructure Unit

| MBO Metric | Target | Agent Skill Quality Target | Gap? |
|------------|--------|---------------------------|------|
| Cost Utilization | 95% efficiency | Infra Architect: "95%", Cost Analyst: "95%" | ✅ Aligned |
| Provisioning Time | <30s average | Provisioning Agent: "<30s", IaC Agent: (no target) | ✅ Aligned |

### ML/Ops Unit

| MBO Metric | Target | Agent Skill Quality Target | Gap? |
|------------|--------|---------------------------|------|
| Drift False Positives | <0.5% | Monitor Agent: "<0.5%", Validation Agent: "<0.5%" | ✅ Aligned |
| Deployment Time | <15 minutes | Deployment Agent: "<15 minutes", Trainer: "<15 minutes" | ✅ Aligned |

### AI Research Unit

| MBO Metric | Target | Agent Skill Quality Target | Gap? |
|------------|--------|---------------------------|------|
| Prototypes | 4 per quarter | Experiment Runner: "4 prototypes" | ✅ Aligned |
| Publications | 2 per year | Publication Agent: "2 peer-reviewed/year", Metric Analyzer: "2 peer-reviewed/year" | ✅ Aligned |

### Data Science Unit

| MBO Metric | Target | Agent Skill Quality Target | Gap? |
|------------|--------|---------------------------|------|
| Actionable Insights | 5 per month | Stats Agent: "5/month", Insight Delivery: "5/month" | ✅ Aligned |
| A/B Test Lift | >10% | Stats Agent: ">10% average" | ✅ Aligned |

### Security & Compliance Unit

| MBO Metric | Target | Agent Skill Quality Target | Gap? |
|------------|--------|---------------------------|------|
| Critical Vulnerabilities | Zero | Vuln Scanner: "0 in production", Security Agent: "Zero" | ✅ Aligned |
| Incident Response | <1 hour | Incident Response Agent: "<1 hour" | ✅ Aligned |

---

## Critical Gaps Found

### 1. SaaS Uptime: MBO 99.9% vs Architect 99.99%

The MBO target says 99.9% but the Architect Agent skill says "99.99% uptime SLA". These differ by an order of magnitude.

**Resolution:** MBO 99.9% is the *business objective*; Architect 99.99% is the *design target* (higher to provide buffer). Both are valid — add a note to MBO targets.

### 2. SaaS API Response: No explicit target in Fullstack skill

The Fullstack Dev Agent says "see assignment" — no explicit target. The MBO says "sub-200ms".

**Resolution:** Add "sub-200ms p95" to Fullstack quality targets.

### 3. Desktop Unit: Missing "Auto-Update Success" metric

Desktop Architect has ">99% auto-update success" but MBO has no auto-update metric.

**Resolution:** Add "Auto-Update Success: >99%" to Desktop MBO targets.

### 4. Cloud Unit: Missing "IaC Coverage" metric

IaC Agent has "100% IaC coverage" but MBO has no IaC metric.

**Resolution:** Add "IaC Coverage: 100%" to Cloud MBO targets.

### 5. ML/Ops: Missing "Model Freshness" metric

Retrain Scheduler has "Within defined SLA" but MBO has no freshness metric.

**Resolution:** Add "Model Freshness: <1 hour lag" to ML/Ops MBO targets.

### 6. Data Science: Missing "Pipeline Reliability" metric

Data Ingestion has ">99% successful runs" but MBO has no pipeline reliability metric.

**Resolution:** Add "Pipeline Reliability: >99%" to Data Science MBO targets.

### 7. Security: Missing "Alert Latency" metric

Drift Detector has "<5 minutes" but MBO has no alert latency metric for Security.

**Resolution:** Add "Alert Latency: <5 minutes" to Security MBO targets.

### 8. AI Research: Missing "Papers Reviewed" metric

Lit Review Agent has "50/quarter" but MBO has no papers reviewed metric.

**Resolution:** Add "Papers Reviewed: 50/quarter" to AI Research MBO targets.

### 9. Cross-cutting: No "Feature Adoption" metric at MBO level

PM Agent has ">60% of target users" but no MBO unit has this.

**Resolution:** Add "Feature Adoption: >60%" to SaaS MBO targets.

### 10. Cross-cutting: No "Test Coverage" metric at MBO level

QA Agent has ">80% code, 100% critical paths" but MBO has no test coverage.

**Resolution:** Add "Test Coverage: >80% code" to SaaS MBO targets.

### 11. Cross-cutting: No "MTTR" in SaaS MBO

DevOps Agent has "<15 minutes" MTTR but SaaS MBO has no MTTR metric.

**Resolution:** Add "MTTR: <15 minutes" to SaaS MBO targets.

### 12. Cross-cutting: No "Deployment Success Rate" in SaaS MBO

DevOps Agent has ">99%" but SaaS MBO doesn't track it.

**Resolution:** Add "Deployment Success Rate: >99%" to SaaS MBO targets.

### 13. Mobile: Missing "Crash-Free Rate" in MBO

Mobile Architect and Frontend Dev both have ">99.5%" but Mobile MBO doesn't track it.

**Resolution:** Add "Crash-Free Rate: >99.5%" to Mobile MBO targets.

### 14. Web: Missing "Lighthouse Score" in MBO

Web Architect has ">90 across all categories" but Web MBO only has SEO Score >90.

**Resolution:** Add "Lighthouse Score: >90" to Web MBO targets.

### 15. Cloud: Missing "Drift Detection Coverage" in MBO

Drift Detector has "100% IaC-managed resources" but Cloud MBO doesn't track it.

**Resolution:** Add "Drift Detection Coverage: 100%" to Cloud MBO targets.
