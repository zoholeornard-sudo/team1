# ML/Ops Unit — Lifecycle


## Phases

| # | Phase | Owner | Gate |
|---|-------|-------|------|
| 1 | **Data Collection & Prep** | Data Prep Agent | Data sources identified, pipeline validated, quality checks pass |
| 2 | **Model Development** | Trainer Agent + @mlops-manager | Model trained, accuracy baseline met |
| 3 | **Evaluation** | Validation Agent | Bias/fairness checks pass, performance benchmarks met |
| 4 | **Deployment** | Deployment Agent | Canary → staged rollout, rollback plan ready |
| 5 | **Monitoring & Maintenance** | Monitor Agent + Retrain Scheduler Agent | Drift detection active, retraining pipeline scheduled |
| 6 | **Iteration** | @mlops-manager | Model performance reviewed, improvement backlog refined |

## Phase Details

### 1. Data Collection & Prep
- **Input:** Reqs analysis, legacy algorithm audit
- **Artifacts:** Algorithm classification (deterministic vs ML-candidate), data source inventory, feature candidates
- **Cross-unit:** Data Science (feature engineering), AI Research (model input requirements)

### 2. Model Development
- **Input:** Prepared data, ML feature proposal
- **Artifacts:** Model registry entry, training pipeline, experiment tracking
- **Cross-unit:** AI Research (model architecture handoff)

### 3. Evaluation
- **Input:** Trained model
- **Artifacts:** Validation report, bias/fairness audit, performance benchmark

### 4. Deployment
- **Input:** Validated model
- **Artifacts:** Deployment pipeline, canary analysis, rollback procedure
- **MBOs:** <15min model deployment

### 5. Monitoring & Maintenance
- **Input:** Live model
- **Artifacts:** Drift dashboard, retraining trigger logs, accuracy tracker
- **MBOs:** <0.5% drift false positives

### 6. Iteration
- **Input:** Monitoring data, accuracy trends
- **Artifacts:** Model version history, retraining schedule, improvement backlog

## MBO Mapping

| MBO | Primary Phase |
|-----|---------------|
| <0.5% drift false positives | Monitoring & Maintenance |
| <15min model deployment | Deployment |
| Maintain accuracy baseline | Evaluation → Monitoring |
| Weekly model updates | Deployment → Iteration |
