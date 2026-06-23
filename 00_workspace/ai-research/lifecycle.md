# AI Research Unit — Lifecycle


## Phases

| # | Phase | Owner | Gate |
|---|-------|-------|------|
| 1 | **Ideation** | @research-innovation-manager + Literature Review Agent | Research question defined, literature reviewed |
| 2 | **Planning** | Experiment Runner Agent + @research-innovation-manager | **Multi-lens review: CEO + Eng + Design + DX lenses all ≥7/10** *(or accepted remediation; see `lifecycle-loop-extraction.md`)* |
| 3 | **Execution** | Experiment Runner Agent + Metric Analyzer Agent | Experiments run, metrics collected, **experiment health verified** (results reproducible + seed-controlled + run logs saved to `00_workspace/working_files/`) |
| 4 | **Documentation** | Publication Agent + Metric Analyzer Agent | Findings documented, reproducibility verified, **DeployVerified: notebook re-runs from clean clone in <target time, artifact hashes match publication claims** |
| 5 | **Integration** | Collaboration Agent + @research-innovation-manager | Knowledge transferred to ML/Ops or Data Science |

## Phase Details

### 1. Ideation
- **Input:** Reqs analysis, report dissections, gap analysis
- **Artifacts:** Literature review, research questions, hypothesis register
- **Cross-unit:** ML/Ops (production feasibility input), Data Science (research collaboration)

### 2. Planning
- **Input:** Approved research question
- **Artifacts:** Experiment design doc, resource estimate (GPU/compute), success criteria
- **Cross-unit:** Cloud Infra (compute resources)

### 3. Execution
- **Input:** Experiment plan
- **Artifacts:** Experiment logs, metric results, iteration notes

### 4. Documentation
- **Input:** Experiment results
- **Artifacts:** Research paper draft, prototype documentation, reproducibility notes
- **MBOs:** 4 prototypes/quarter, 2 publications/year

### 5. Integration
- **Input:** Documented findings
- **Artifacts:** Knowledge transfer deck, handoff to ML/Ops or Data Science, production feasibility report
- **MBOs:** 100% knowledge transfer to production units

## MBO Mapping

| MBO | Primary Phase |
|-----|---------------|
| 4 prototypes/quarter | Execution → Documentation |
| 2 publications/year | Documentation |
| Continuous innovation pipeline | Ideation → Integration |
| 100% knowledge transfer | Integration |
