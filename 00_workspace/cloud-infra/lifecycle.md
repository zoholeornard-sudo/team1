# Cloud Infra Unit — Lifecycle


## Phases

| # | Phase | Owner | Gate |
|---|-------|-------|------|
| 1 | **Planning** | @cloud-ops-manager + Infra Architect Agent | Architecture decision documented, requirements gathered |
| 2 | **Design & IaC Generation** | IaC Agent + Infra Architect Agent | **Multi-lens review: CEO + Eng + Design + DX lenses all ≥7/10** *(or accepted remediation; see `lifecycle-loop-extraction.md`)* |
| 3 | **Provisioning & Validation** | Provisioning Agent | Environments provisioned, validation tests pass, **DeployVerified: provisioned envs health-checked (compute reachable, DB up, networking open, IaC plan/apply diff clean)** |
| 4 | **Monitoring** | Drift Detector Agent + Cost Analyst Agent | Dashboards live, drift detection active, cost baseline set |
| 5 | **Optimization** | Cost Analyst Agent + @cloud-ops-manager | Rightsizing executed, reserved instances purchased |
| 6 | **Incident Response** | @cloud-ops-manager + Security Agent | P0/P1 runbooks tested, DR plan documented |

## Phase Details

### 1. Planning
- **Input:** Reqs analysis, legacy deployment architecture, unit resource requirements
- **Artifacts:** Target architecture doc, DB migration plan, cloud provider decision
- **Cross-unit:** SaaS (API resource requirements), Security (compliance infra reqs)

### 2. Design & IaC Generation
- **Input:** Approved architecture plan
- **Artifacts:** Terraform/CloudFormation templates, network topology, security group design

### 3. Provisioning & Validation
- **Input:** IaC templates
- **Artifacts:** Provisioned dev/staging/prod environments, validation test results
- **Cross-unit:** All dev units (environment access)

### 4. Monitoring
- **Input:** Provisioned infrastructure
- **Artifacts:** Cost dashboard, utilization reports, drift detection alerts
- **MBOs:** 95% cost efficiency, 100% drift detection coverage

### 5. Optimization
- **Input:** Monitoring data
- **Artifacts:** Rightsizing recommendations, reserved instance plan, storage lifecycle policy

### 6. Incident Response
- **Input:** Live infrastructure
- **Artifacts:** Incident reports, runbook updates, DR test results
- **MBOs:** <30s provisioning, 99.99% infra uptime

## MBO Mapping

| MBO | Primary Phase |
|-----|---------------|
| 95% cost efficiency | Monitoring → Optimization |
| <30s provisioning | Design & IaC Generation → Provisioning |
| 99.99% uptime | Provisioning → Incident Response |
| 100% IaC drift detection | Monitoring |
