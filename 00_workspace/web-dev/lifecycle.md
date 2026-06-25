# Web Unit — Lifecycle


## Phases

| # | Phase | Owner | Gate |
|---|-------|-------|------|
| 1 | **Planning & Requirements** | @web-delivery-manager + Web Architect Agent | Scope approved, browser support matrix defined |
| 2 | **Architecture & Design** | Web Architect Agent | Tech stack decided, design system aligned with SaaS/Mobile |
| 3 | **Implementation & Build** | Web Architect Agent | Feature complete, unit tests pass, Core Web Vitals green |
| 4 | **Testing & QA** | Web Architect Agent | Cross-browser testing passed, WCAG 2.1 AA validated, Lighthouse >90 |
| 5 | **Deployment & Release** | Web Architect Agent + @web-delivery-manager | CDN deployment complete, rollback plan ready |
| 6 | **Monitoring & Incident Response** | Web Architect Agent | RUM dashboards live, TTFB alerts configured |
| 7 | **Analysis & Feedback** | @web-delivery-manager | Retro captured, Core Web Vitals trends reviewed, MBO progress assessed |

## Phase Details

### 1. Planning & Requirements
- **Input:** Product requirements, browser support needs, accessibility standards
- **Artifacts:** Scope doc, browser support matrix, performance budget
- **Cross-unit:** SaaS (shared APIs), Mobile (responsive design alignment)

### 2. Architecture & Design
- **Input:** Approved scope, design system tokens
- **Artifacts:** Architecture decision record, component hierarchy, routing plan
- **Cross-unit:** SaaS (API contract alignment), Cloud Infra (CDN/hosting)

### 3. Implementation & Build
- **Input:** Architecture docs, design system components
- **Artifacts:** Feature branches, unit tests, Storybook stories
- **Cross-unit:** SaaS (API integration), Mobile (shared component library)

### 4. Testing & QA
- **Input:** Feature-complete code
- **Artifacts:** Lighthouse reports, axe accessibility audit, cross-browser test matrix
- **Gate:** WCAG 2.1 AA pass, Core Web Vitals green, SEO >90

### 5. Deployment & Release
- **Input:** QA-approved build
- **Artifacts:** CDN deployment log, release notes, rollback procedure
- **Cross-unit:** Cloud Infra (CDN provisioning)

### 6. Monitoring & Incident Response
- **Input:** Live deployment
- **Artifacts:** RUM dashboards, TTFB/CLS/LCP alert config, incident reports
- **MBOs:** <1s TTFB @ 100k users, WCAG 2.1 AA, SEO >90, Core Web Vitals green

### 7. Analysis & Feedback
- **Input:** RUM data, user feedback, accessibility audit results
- **Artifacts:** Retro notes, MBO progress report, improvement backlog
- **Cross-unit:** All units (cross-retro)

## MBO Mapping

| MBO | Primary Phase |
|-----|---------------|
| <1s TTFB @ 100k users | Architecture & Design → Monitoring |
| WCAG 2.1 AA | Testing & QA → Monitoring |
| SEO >90 | Implementation → Testing |
| Core Web Vitals green | All phases (progressive) |
