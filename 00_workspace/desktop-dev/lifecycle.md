# Desktop Unit — Lifecycle


## Phases

| # | Phase | Owner | Gate |
|---|-------|-------|------|
| 1 | **Requirements & Design** | @desktop-solutions-manager + Desktop Architect Agent | Scope decided, requirements documented |
| 2 | **Prototype & Review** | UI/UX Agent + Desktop Architect Agent | **Multi-lens review: CEO + Eng + Design + DX lenses all ≥7/10** *(or accepted remediation; see `lifecycle-loop-extraction.md`)* |
| 3 | **Implementation** | Dev Agents | Feature complete, installer tested |
| 4 | **Testing** | QA Agent | Platform coverage (Win/Mac/Linux) passed, crash rate baseline |
| 5 | **Packaging & Release** | Release Agent | Auto-update pipeline ready, installer signed, **DeployVerified: signed-installer smoke test pass on Win/Mac/Linux, auto-update check fires from prior version** |
| 6 | **Monitoring** | Crash Report Agent + @desktop-solutions-manager | Crash MTTR <5min, update adoption >90% |
| 7 | **Iteration** | @desktop-solutions-manager | User feedback integrated, crash trends reviewed |

## Phase Details

### 1. Requirements & Design
- **Input:** Reqs analysis, platform executive scope decision
- **Artifacts:** Scope decision doc, requirements spec, platform support matrix
- **Cross-unit:** Web (SPA wrapper requirements), Platform Executive (scope)

### 2. Prototype & Review
- **Input:** Approved requirements
- **Artifacts:** Tech feasibility report (Tauri/Electron), prototype build, review notes
- **Cross-unit:** Web (framework alignment for wrapper)

### 3. Implementation
- **Input:** Approved prototype
- **Artifacts:** Feature branches, installer build, auto-update pipeline

### 4. Testing
- **Input:** Feature-complete build
- **Artifacts:** Platform test report (Win/Mac/Linux), crash baseline, installer success report

### 5. Packaging & Release
- **Input:** QA-approved build
- **Artifacts:** Signed installer, release notes, auto-update manifest

### 6. Monitoring
- **Input:** Live release
- **Artifacts:** Crash dashboard, update adoption tracker, incident log
- **MBOs:** Zero installer failures, <5min crash MTTR, >90% update adoption

### 7. Iteration
- **Input:** Monitoring data, user feedback
- **Artifacts:** Iteration backlog, crash trend analysis

## MBO Mapping

| MBO | Primary Phase |
|-----|---------------|
| Zero installer failures | Packaging & Release → Monitoring |
| <5min crash MTTR | Monitoring |
| >90% update adoption in 7 days | Packaging & Release → Monitoring |
| Win/Mac/Linux coverage | Testing |
