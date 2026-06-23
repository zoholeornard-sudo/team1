# Data Science Unit — Lifecycle

## Phases

| # | Phase | Owner | Gate |
|---|-------|-------|------|
| 1 | **Requirement Gathering** | @data-science-manager + Insight Delivery Agent | Business question clarified, success criteria defined |
| 2 | **Data Pipeline Setup** | Data Ingestion Agent + Feature Engineering Agent | **Multi-lens review: CEO + Eng + Design + DX lenses all ≥7/10** *(or accepted remediation; see `lifecycle-loop-extraction.md`)* |
| 3 | **Experimentation** | Statistical Analysis Agent | A/B test designed, statistical significance reached, **DeployVerified: experiment pipeline healthy in prod (no missing data, no schema drift, dashboard query returns expected cohort sizes)** |
| 4 | **Interpretation** | Reporting Agent + @data-science-manager | Findings translated to business impact, recommendations documented |
| 5 | **Feedback Loop** | Insight Delivery Agent + @data-science-manager | Findings presented, stakeholder feedback gathered, iteration logged |

## Phase Details

### 1. Requirement Gathering
- **Input:** Reqs analysis, legacy algorithm data, stakeholder questions
- **Artifacts:** Business question doc, success criteria, insight backlog
- **Cross-unit:** SaaS (analytics requirements), All units (experiment requests)

### 2. Data Pipeline Setup
- **Input:** Approved requirements
- **Artifacts:** Data pipeline architecture, analytics data model, data quality report
- **Cross-unit:** Cloud Infra (analytics DB/environment), SaaS (data contracts)

### 3. Experimentation
- **Input:** Clean data, approved experiment design
- **Artifacts:** A/B test plan, statistical analysis report, experiment results
- **Cross-unit:** Web (A/B test implementation), Mobile (test variants)

### 4. Interpretation
- **Input:** Experiment results
- **Artifacts:** Insight report, recommendation deck, impact estimate
- **MBOs:** 5 actionable insights/month, >10% A/B test lift

### 5. Feedback Loop
- **Input:** Interpreted findings
- **Artifacts:** Stakeholder presentation, feedback log, iteration backlog
- **MBOs:** >4.5/5 stakeholder satisfaction, >99% pipeline reliability

## MBO Mapping

| MBO | Primary Phase |
|-----|---------------|
| 5 actionable insights/month | Interpretation → Feedback Loop |
| >10% average A/B test lift | Experimentation → Interpretation |
| >99% pipeline reliability | Data Pipeline Setup |
| >4.5/5 stakeholder satisfaction | Feedback Loop |
