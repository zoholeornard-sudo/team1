# Security & Compliance Unit — Lifecycle


## Phases

| # | Phase | Owner | Gate |
|---|-------|-------|------|
| 1 | **Policy Definition** | @security-compliance-manager + Policy Auditor Agent | Policies documented, standards defined, baseline assessment complete |
| 2 | **Integration** | Vulnerability Scanner Agent + @security-compliance-manager | **Multi-lens review: CEO + Eng + Design + DX lenses all ≥7/10** *(or accepted remediation; see `lifecycle-loop-extraction.md`)* |
| 3 | **Monitoring** | Threat Intelligence Agent + Vulnerability Scanner Agent | Continuous scan active, threat feed connected, dashboards live, **DeployVerified: first scheduled scan completed cleanly, synthetic-injection alert fires within SLA** |
| 4 | **Response** | Incident Response Agent | Incident runbooks tested, response time <1hr |
| 5 | **Audit & Reporting** | Reporting Agent + @security-compliance-manager | Compliance report generated, audit trail complete |

## Phase Details

### 1. Policy Definition
- **Input:** Reqs analysis, legacy auth audit, threat model
- **Artifacts:** Auth architecture doc (current vs target), security requirements spec, vulnerability baseline
- **Cross-unit:** All units (security standards), Cloud Infra (infra security reqs)

### 2. Integration
- **Input:** Approved policies, security requirements
- **Artifacts:** Security controls config, scanner deployment, auth framework implementation plan
- **Cross-unit:** SaaS (auth framework integration), Web (WCAG + security alignment)

### 3. Monitoring
- **Input:** Deployed controls
- **Artifacts:** Vulnerability dashboard, threat intelligence feed, compliance monitoring reports
- **MBOs:** Zero critical vulnerabilities, continuous compliance

### 4. Response
- **Input:** Security alerts, vulnerability reports
- **Artifacts:** Incident reports, runbook updates, post-mortems
- **MBOs:** <1hr incident response

### 5. Audit & Reporting
- **Input:** Monitoring data, incident history
- **Artifacts:** Compliance report (SOC2/GDPR/CCPA), security training records, audit trail
- **MBOs:** 100% compliance score, 100% security training completion

## MBO Mapping

| MBO | Primary Phase |
|-----|---------------|
| Zero critical vulnerabilities | Monitoring → Response |
| <1hr incident response | Response |
| 100% compliance score | Audit & Reporting |
| 100% security training completion | Policy Definition → Audit |
