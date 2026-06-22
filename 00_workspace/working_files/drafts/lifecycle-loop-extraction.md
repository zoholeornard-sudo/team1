# Lifecycle Loop Extraction — gstack `/office-hours` → `/canary` → team1 lifecycle

**Date:** 2026-06-22
**Status:** Design proposal (awaiting go-ahead to apply)
**Depends on:** `gstack-extraction-plan.md` (Initiatives 2, 5, 6)
**Affects:** `.main.lifecycle.md`, `agent-skills/references/skill-template.md`, all 39 skill files' "Turn protocol" subsections, orchestrator intent catalog

---

## The core insight

team1's lifecycle defines **what** happens at each phase (Planning → Architecture → Implementation → Testing → Deployment → Monitoring → Analysis) but not **how**. Each phase has a lead agent, a support agent, and an exit gate — but no execution protocol that tells the agent *what to actually do* when the phase starts.

gstack's `/office-hours` → `/canary` loop is a battle-tested execution pipeline where each stage has a **concrete practice**: a forcing-question set, a scoring rubric, a structural diff checklist, a deploy verification sequence, a monitoring loop, a retro format. The stages chain — each feeds the next with structured output.

The proposal: extract gstack's per-stage practices and graft them onto team1's lifecycle phases as **execution protocols** — concrete, step-by-step procedures that the lead agent follows when the phase opens. This doesn't change the lifecycle's structure (7 phases, dual gates, MBO alignment); it fills the execution void.

---

## Full mapping: gstack loop → team1 lifecycle

| team1 Phase | gstack skill(s) | What gstack concretely does | What team1 currently has | Gap |
|-------------|-----------------|---------------------------|-------------------------|-----|
| **1. Planning** | `/office-hours` + `/spec` (phases 1-2) | 6 forcing questions (demand reality, status quo, desperate specificity, narrowest wedge, observation, future-fit). Read existing code *before* asking questions. Dedupe against existing issues. | "Validate feasibility, define scope, set MBO-aligned targets" — no process | **No idea-reframaming step. No code-first interrogation.** |
| **2. Architecture** | `/plan-ceo-review` + `/plan-eng-review` + `/plan-design-review` + `/plan-devex-review` + `/spec` (phases 3-5) | Multi-lens review: CEO (find the 10-star product), eng (lock architecture, data flow, edge cases, tests), design (rate each dimension 0-10, explain what 10 looks like), DX (TTHW, magical moments, friction). Quality-gate before implementation. | "Produce design docs, ADRs, diagrams, data models" + ARB sign-off — no multi-lens structure | **Single ARB review vs. 4-lens review. No scoring rubric. No DX lens at all.** |
| **3. Implementation** | `/freeze` + `/careful` | Lock edits to one directory (hard block). Warn before destructive commands. | "Build features/services per design" — no scope discipline | **No scope-locking during implementation. Agents can drift beyond their task.** |
| **4. Testing** | `/review` | Structural diff checklist: SQL safety, LLM trust boundaries, conditional side effects, scope drift, enum completeness. Finds "bugs that pass CI but break in prod." | "Functional, performance, security, accessibility validation" + QA gate — no structural review | **No pre-landing structural review. QA gate = "tests pass" but no human-equivalent diff analysis.** |
| **5. Deployment** | `/ship` + `/land-and-deploy` | Ship: workspace-aware version queue, test→review→push→PR. Land: merge→wait for CI→deploy→**verify production health** (HTTP checks, screenshot, console error diff). First-run dry-run validation. Staging-first option. | "Ship to production via CI/CD" — no verification step | **No deploy verification. No dry-run. No staging-first path. Deployment "succeeds" when CI passes, not when prod is healthy.** |
| **6. Monitoring** | `/canary` + `/health` | Post-deploy monitoring loop: navigate to deployed URL every 30s for 10 min, screenshot, diff console errors against pre-deploy baseline. Health: weighted composite 0-10 quality score (types, linter, tests, dead code). | "Observe SLOs; respond to incidents" — no monitoring tooling | **No concrete observation mechanism. "SLOs observed" with nothing observing them.** |
| **7. Analysis** | `/retro` + `/learn` | Weekly retro: per-person breakdowns (praise + growth areas), shipping streaks, commit type mix, test ratio, ship-of-the-week. Persist learnings across sessions. | "Postmortems, metric review, learnings" — no retro format | **No structured retro. No per-agent breakdown. No learning persistence.** |

---

## Per-phase execution protocols (what to extract and how it integrates)

### Phase 1 — Planning: the `/office-hours` protocol

**Extract:** gstack's 6 forcing questions, adapted for an MBO context.

**Protocol (Product Manager Agent leads):**
1. **Demand reality** — Who needs this feature? What breaks for them today?
2. **Status quo** — What are they doing right now instead? (the workaround is the competition)
3. **Desperate specificity** — Name one person/org who needs this *today*, not "the market."
4. **Narrowest wedge** — What's the smallest version that delivers value?
5. **MBO fit** — Which unit metric(s) does this move? (loads from `assignments/<project>.json`)
6. **Code-first interrogation** — Read the existing codebase for related patterns *before* writing the scope doc (gstack `/spec` Phase 3: "HARD requirement: read code first")

**Output:** Scope doc with MBO baselines recorded (already in the exit gate, but now the *process* to produce it is defined).

**Integration:** Add to `skill-template.md` Turn protocol as "Phase 1 execution protocol." Product Manager Agent's skill file gets the forcing-question set.

**New intent:** none — this is a within-turn execution guide, not a new bus message.

### Phase 2 — Architecture: the multi-lens review protocol

**Extract:** gstack's 4-lens review structure, adapted for team1's unit model.

**Protocol (Architect Agent leads, but lenses are distributed):**
1. **CEO lens** (Manager runs) — Is this the 10-star version? What would make it remarkable, not just functional?
2. **Eng lens** (Architect Agent) — Lock architecture, data flow, edge cases, test strategy. Rate 0-10 on: scalability, reliability, security, performance, maintainability, cost, observability, reversibility.
3. **Design lens** (UI/UX Agent, if frontend) — Rate each design dimension 0-10. For each, explain what a 10 looks like. (gstack's explicit "what does 10 look like" framing prevents rubber-stamp reviews.)
4. **DX lens** (relevant unit's lead agent) — TTHW for the *next agent* who touches this. What's the magical moment? Where's the friction?

**Output:** ARB sign-off now requires all 4 lens scores ≥ 7 (or accepted remediation). The 0-10 scoring replaces the current binary "ARB sign-off."

**Integration:** Modify `.main.lifecycle.md` Phase 2 exit criteria: "ARB sign-off" → "Multi-lens review: all 4 lenses scored ≥ 7/10 (or accepted remediation). Scores recorded in artifact index." Architect Agent's skill file gets the eng-lens rubric.

**New intent:** `PhaseReviewScore{featureSlug, phase, lens, score, rationale}` — emitted by each lens reviewer, consumed by lifecycle-management. This makes the multi-lens review machine-enforceable, not just a document convention.

### Phase 3 — Implementation: the scope-lock protocol

**Extract:** gstack's `/freeze` concept — lock edits to one directory.

**Protocol (lead dev agent):**
1. When Phase 3 opens, the lead agent declares a **scope boundary**: which paths/files this feature touches.
2. `edit-coordinator` enforces the boundary: any `EditIntent` whose `path` falls outside the declared scope is rejected with `CheckoutDenied{reason: "out-of-scope"}`.
3. Scope changes require a `ScopeChangeRequest` intent to the Manager (not the agent self-expanding).

**Why this matters:** Without scope locking, an agent in Phase 3 can drift — fixing a bug it noticed in an unrelated file, refactoring something tangential. gstack's `/freeze` prevents this at the tool level. team1 can prevent it at the intent level (the edit-coordinator already gates all writes).

**Integration:** Add `scope` field to `AcquireCheckout` payload (already has `batch` — add `scopePaths: string[]`). edit-coordinator validates each edit's path against `scopePaths` before applying. Add `ScopeChangeRequest` intent.

### Phase 4 — Testing: the structural review protocol

**Extract:** gstack's `/review` checklist — the specific categories of bugs that pass CI but break in prod.

**Protocol (QA Agent leads):**
1. Before the QA gate, the QA Agent (or Architect Agent for architecture-sensitive changes) runs a **structural diff review** against the merged branch:
   - **SQL & data safety** — migrations reversible? Indexes added before queries depend on them?
   - **LLM trust boundaries** — is agent-generated content sanitized before reaching a sink?
   - **Conditional side effects** — does the new code path trigger notifications/webhooks/state changes under conditions the tests don't cover?
   - **Scope drift** — did the implementation touch files outside the Phase 3 scope declaration?
   - **Enum & value completeness** — new enum values handled in all switch/if branches?
2. Findings are logged as `TestFailed` intents (already in the catalog) or accepted as remediation.

**Why this matters:** team1's QA gate is "tests pass." gstack's `/review` finds the class of bugs that tests *can't* catch — the structural issues that only a diff-reading agent spots. This is the difference between "CI is green" and "this won't break in prod."

**Integration:** Add `agent-skills/references/review-checklist.md` (already in extraction plan Initiative 3). QA Agent's skill file references it in the Phase 4 execution protocol.

### Phase 5 — Deployment: the verify-after-deploy protocol

**Extract:** gstack's `/land-and-deploy` — merge is not done; deploy + verify is done.

**Protocol (DevOps Agent / Release Agent leads):**
1. **Pre-deploy dry-run** (first run only): detect deploy infrastructure, test commands, confirm with Manager.
2. **Merge** → wait for CI.
3. **Deploy** → wait for deploy to complete (poll with backoff, 30s intervals).
4. **Verify** — the step team1 is missing:
   - HTTP health check on production URL (200 response)
   - Screenshot the deployed page (via browse daemon — Initiative 2)
   - Diff console errors against pre-deploy baseline
   - If staging exists: deploy to staging first, verify, then production
5. **If verification fails**: offer revert (creates revert commit, triggers re-deploy of previous version)

**Output:** Deploy report saved to `00_workspace/working_files/` — merge SHA, deploy duration, verification status (HEALTHY / DEGRADED / REVERTED), screenshot path.

**Integration:** Modify `.main.lifecycle.md` Phase 5 exit criteria: "Deployment success, release notes published" → "Deployment success, release notes published, **production health verified** (HTTP 200 + console error diff + screenshot saved to artifact index)."

**New intent:** `DeployVerified{featureSlug, status, url, screenshotPath, consoleErrors}` — emitted by the deploy agent, consumed by lifecycle-management as part of the Phase 5 artifact gate.

### Phase 6 — Monitoring: the canary loop protocol

**Extract:** gstack's `/canary` — a concrete post-deploy monitoring loop.

**Protocol (DevOps Agent / Monitor Agent leads):**
1. After Phase 5 verification, the monitoring agent starts a **canary loop**:
   - Navigate to deployed URL every 30s for 10 minutes (via browse daemon)
   - Screenshot each visit
   - Diff console errors against the Phase 5 baseline
   - Diff page content for unexpected changes
2. Each canary check emits `MboMetricReport{metric: "uptime", value: ...}` and `MboMetricReport{metric: "responseTime", value: ...}`.
3. If any check degrades beyond threshold → `RemediationIntent` back to Phase 3 (already in the aligned rule).

**Why this matters:** Phase 6's exit gate says "SLOs observed AND uptime/performance MBO within target." The canary loop is *how* you observe. Without it, the gate is a claim, not a measurement.

**Integration:** Already covered by Initiative 5 in the extraction plan. This doc adds the lifecycle integration: canary loop is the Phase 6 execution protocol, not a standalone tool.

### Phase 7 — Analysis: the structured retro protocol

**Extract:** gstack's `/retro` — per-person breakdowns, shipping streaks, commit type mix, ship-of-the-week.

**Protocol (unit Manager leads):**
1. **Per-agent breakdown** — for each agent instance that worked on the feature:
   - What they shipped (commits, artifacts, progress reports)
   - Praise: 1 specific thing done well
   - Growth: 1 specific leveling-up suggestion (anchored in data, not criticism)
2. **Shipping streak** — consecutive phases completed on-time (gstack tracks consecutive days; team1 tracks consecutive on-time phase exits)
3. **Commit type mix** — feat/fix/refactor/test ratio per agent (identifies agents who skip tests or over-refactor)
4. **Ship-of-the-feature** — highest-impact artifact produced during this feature cycle
5. **MBO gap carry-forward** — all declared planned gaps from phases 3-6 become mandatory Phase 1 inputs (already in the aligned rule, but now the retro is *where* they're collected)

**Output:** Retro report saved to `00_workspace/working_files/progress/` + `PhaseGateCheck{phase: 7}` with the retro as the artifact.

**Integration:** Add to `skill-template.md` Turn protocol as "Phase 7 execution protocol." Each Manager's skill file gets the retro format. The `/learn` equivalent — persisting learnings — maps to the existing progress-file-as-history pattern (reaped instances' progress files persist).

---

## What changes in the orchestrator

| Change | Where | New? |
|--------|-------|------|
| `PhaseReviewScore` intent | Intent catalog | **New** — makes multi-lens review machine-enforceable |
| `scopePaths` field on `AcquireCheckout` | contracts/intents.ts | **New** — Phase 3 scope locking |
| `ScopeChangeRequest` intent | Intent catalog | **New** — scope drift escalation |
| `DeployVerified` intent | Intent catalog | **New** — Phase 5 verification gate |
| Phase 2 exit criteria: multi-lens scoring | `.main.lifecycle.md` | **Modified** |
| Phase 3 execution: scope-lock protocol | `skill-template.md` | **New** |
| Phase 4 execution: structural review checklist | `agent-skills/references/review-checklist.md` | **New** (already in Initiative 3) |
| Phase 5 exit criteria: production health verified | `.main.lifecycle.md` | **Modified** |
| Phase 6 execution: canary loop | `health-monitoring/src/canary.ts` | **New** (already in Initiative 5) |
| Phase 7 execution: retro format | `skill-template.md` | **New** |
| Phase 1 execution: forcing questions | `skill-template.md` + PM Agent skill file | **New** (partially in Initiative 6) |

**3 new intents, 2 lifecycle exit-criteria modifications, 4 skill-template execution protocols, 1 new reference file.**

---

## Relationship to existing extraction plan

| Existing initiative | This doc adds |
|---------------------|---------------|
| Initiative 3 (execution discipline: `/review` + `/freeze`) | Phase 3 scope-lock protocol + Phase 4 structural review protocol — *when* in the lifecycle these practices fire |
| Initiative 5 (canary + health) | Phase 6 canary loop as the *execution protocol* for monitoring, not just a tool |
| Initiative 6 (spec pipeline) | Phase 1 forcing questions as the *execution protocol* for planning, not just a spec tool |

**What's genuinely new here:** the multi-lens review (Phase 2), the verify-after-deploy protocol (Phase 5), and the structured retro (Phase 7) — these aren't in the existing extraction plan at all. Plus the framing: gstack's loop as a *lifecycle execution pattern*, not a bag of individual tools.

---

## Milestone impact

| Milestone | Effect |
|-----------|--------|
| **M0** | Add 3 new intents to contracts, 2 lifecycle exit-criteria modifications, 4 execution protocols to skill-template. **Expands M0 from 11 to 17 contract edits.** |
| **M2** (spawn + assign) | No change — execution protocols are skill-file content, not spawn logic |
| **M3** (branch-only coordination) | Scope-lock enforcement in edit-coordinator (`scopePaths` validation) — additive to the existing checkout flow |
| **M4** (lifecycle gating with MBO) | Multi-lens scoring (Phase 2) + deploy verification (Phase 5) make M4's end-to-end test *meaningful* — without them, the gates are binary pass/fail with no scoring depth |
| **M5** (multi-feature) | Scope locking prevents cross-feature file collisions at the intent level, complementing the merge coordination |

---

## The one-sentence version

gstack's `/office-hours` → `/canary` loop is a lifecycle execution pattern: each stage has a concrete practice (forcing questions, multi-lens review, scope locking, structural diff, deploy verification, canary monitoring, structured retro) that tells the agent *what to do* when the phase opens — and team1's lifecycle currently defines phases without defining practices, so grafting gstack's practices onto team1's phases turns named phases into an executable pipeline.
