# SaaS Unit — Lifecycle


## Phases

| # | Phase | Owner | Gate |
|---|-------|-------|------|
| 1 | **Planning & Requirements** | Product Manager Agent + @saas-delivery-manager | Spec approved, API contracts scoped |
| 2 | **Architecture & Design** | Architect Agent | **Multi-lens review: CEO + Eng + Design + DX lenses all ≥7/10** *(or accepted remediation; see `lifecycle-loop-extraction.md`)* |
| 3 | **Implementation & Build** | Full-Stack Dev Agents | Feature complete, unit tests pass |
| 4 | **Testing & QA** | QA Agent | Integration + E2E tests pass, <5% bug escape |
| 5 | **Deployment & Release** | DevOps Agent + @saas-delivery-manager | Canary → full rollout, rollback plan ready, **production health verified (`DeployVerified` intent: HTTP 200 + console error diff + screenshot saved)** |
| 6 | **Monitoring & Incident Response** | DevOps Agent | Dashboards live, alerts configured, MBO tracking |
| 7 | **Analysis & Feedback** | Product Manager Agent + @saas-delivery-manager | Retro captured, MBO progress reviewed |

## Phase Details

### 1. Planning & Requirements
- **Input:** Reqs analysis, endpoint inventory, user stories
- **Artifacts:** Spec docs, API contract map, sprint backlog
- **Cross-unit:** Security (auth requirements), Cloud Infra (deployment env)

### 2. Architecture & Design
- **Input:** Approved specs, data pipeline requirements
- **Artifacts:** Architecture decision record, API design docs, data model
- **Cross-unit:** Cloud Infra (infra design), Security (auth framework)

### 3. Implementation & Build
- **Input:** Architecture docs, API contracts
- **Artifacts:** Feature branches, unit tests, PRs
- **Cross-unit:** SaaS (internal), Web (API integration testing)

### 4. Testing & QA
- **Input:** Feature-complete code
- **Artifacts:** Test reports, load test results, bug log
- **Gate:** All tests passing, bug escape <5%

### 5. Deployment & Release
- **Input:** QA-approved build
- **Artifacts:** Deployment log, release notes, rollback procedure
- **Cross-unit:** Cloud Infra (provisioning), All dev units (coordinated release)

### 6. Monitoring & Incident Response
- **Input:** Live deployment
- **Artifacts:** Dashboards, alert config, incident reports
- **MBOs:** 99.9% uptime, <200ms API response

### 7. Analysis & Feedback
- **Input:** Monitoring data, stakeholder input
- **Artifacts:** Retro notes, MBO progress report, improvement backlog
- **Cross-unit:** All units (cross-retro)

## MBO Mapping

| MBO | Primary Phase |
|-----|---------------|
| 99.9% uptime | Monitoring & Incident Response |
| <200ms API response | Architecture & Design → Monitoring |
| On-time delivery | All phases (cadence) |
| <5% bug escape | Testing & QA |
