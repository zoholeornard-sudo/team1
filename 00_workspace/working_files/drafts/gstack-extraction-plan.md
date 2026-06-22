# Value Extraction Plan — gstack → team1

**Date:** 2026-06-22
**Author:** `@architect-agent` (via Zo)
**Source:** evaluation of `gstack` v1.58.4.0 (Garry Tan, MIT, 1,165 files, 70 skills, 432 tests) against `team1` orchestrator-design-spec.md gaps.

**One-line thesis:** gstack is a single-agent workflow toolkit with a mature browser daemon, eval framework, and discipline skills. team1 is a multi-agent orchestration platform with no tests, no browser tooling, and no execution discipline patterns. The extraction is not "copy gstack" — it's "identify what gstack solved that team1 hasn't encountered yet, and fold the solutions into team1's architecture before they become problems."

---

## Gap matrix: what team1 lacks that gstack has

| team1 gap | gstack asset | Severity if unaddressed |
|-----------|-------------|------------------------|
| **Zero tests** — orchestrator has 0 test files; spec has no test strategy | 432 tests across 3 tiers (gate / periodic / all); 66 E2E LLM evals with CI gating | **Critical** — milestone 1 (bus boot) is untestable without a test harness |
| **No browser/visual tooling** — 5 agent skill files mention "browser" but the runtime has zero browser capabilities | Persistent Chromium daemon (`browse/src/server.ts`, 3,170 LOC), ~100ms commands, cookie import, stealth mode | **High** — QA Agent, UI/UX Agent, Web Architect, SEO Agent, Vulnerability Scanner all need a real browser to do their jobs |
| **No execution discipline patterns** — skill files describe *what* agents do but not *how* to investigate, review, or scope work | `/investigate` (4-phase root-cause), `/review` (structural diff checklist), `/freeze` (directory-scoped hard block) | **High** — without discipline patterns, agents will "fix" symptoms, review superficially, and edit out-of-scope code |
| **No context persistence across turns** — runtime holds state in-memory (polling-agent model) but has no save/restore mechanism | `/context-save` + `/context-restore` — captures git state, decisions, remaining work to a JSON checkpoint; resumable across sessions | **Medium** — a stalled agent loses all context; resume requires a full re-seed |
| **No post-deploy verification** — Deployment Agent "ships" but there's no canary/health-check loop | `/canary` (10-min post-deploy watch with screenshots + console error diff), `/health` (weighted composite 0-10 code quality score) | **Medium** — Phase 6 (Monitoring) has no concrete tooling; MBO gates reference "SLOs observed" but nothing observes them |
| **No spec-to-issue pipeline** — Planning phase produces a "scope doc" but there's no structured path from vague intent to executable spec | `/spec` (5-phase: understand → scope → interrogate code → quality-gate → file issue + optionally spawn worktree agent) | **Medium** — Phase 1 (Planning) is the weakest-defined phase in the lifecycle |
| **No cross-session learning** — agents start fresh each turn; no accumulation of patterns/pitfalls | `/learn` (project learnings JSONL, search/prune/export), gbrain (cross-machine memory sync) | **Low** — nice-to-have, not blocking |
| **No safety scoping** — work-coordinator has a global lock but no per-directory freeze or destructive-command guard | `/careful` (warn before `rm -rf`, `DROP TABLE`, force-push), `/freeze` (hard block outside allowed dir), `/guard` (both at once) | **Medium** — an agent editing `agent-skills/` when scoped to `orchestrator/services/` is a real risk with 39 agents |

---

## Extraction plan — 6 initiatives, ordered by criticality

### Initiative 1: Test harness (unblocks milestone 1)
**Extract from:** gstack's 3-tier eval framework (`.github/workflows/evals.yml` gate tier, `evals-periodic.yml` periodic tier, free-test subset)
**Into:** `orchestrator/` — new `test/` directory + CI workflow

| Deliverable | What it does | Milestone dependency |
|-------------|-------------|---------------------|
| `orchestrator/test/contracts.test.ts` | Validates every intent type against its JSON Schema; catches envelope drift before runtime | M0 — can write now |
| `orchestrator/test/bus-roundtrip.test.ts` | Publishes an intent to Redis Streams, consumes it via `bus-client`, asserts payload integrity | M1 — needs Redis |
| `orchestrator/test/service-health.test.ts` | Boots each service, hits `/healthz`, asserts 200 | M1 |
| `.github/workflows/orchestrator-ci.yml` | Gate tier: runs free tests on every PR; periodic tier: runs LLM evals nightly | M0 — CI scaffold |

**Why gstack's pattern specifically:** gstack separates "free tests" (no API spend, structural) from "eval tests" (LLM-judged, costs money). team1 needs the same separation — the intent catalog and bus topology are fully testable without an LLM, and those tests should gate every PR. The LLM-judged evals (does an agent actually complete a task?) belong in a nightly periodic tier.

**Effort:** 1-2 days. The contracts are already written (`packages/contracts/src/intents.ts`); the tests are assertions against those types.

---

### Initiative 2: Browser daemon integration (unblocks QA, UI/UX, Web, SEO, Security agents)
**Extract from:** gstack's `browse/` package — the persistent Chromium daemon, command protocol, and cookie import
**Into:** `orchestrator/runtime/tools/` — new `browse.ts` tool available to agent turns

| Deliverable | What it does | Milestone dependency |
|-------------|-------------|---------------------|
| `orchestrator/runtime/tools/browse.ts` | Wraps a headless Chromium daemon; exposes `navigate`, `screenshot`, `click`, `fill`, `evaluate`, `waitFor` as agent-turn return values | M2 — needs runtime |
| `orchestrator/services/browse-daemon/` (or `packages/browse-client/`) | Long-lived browser process; runtime connects to it per-turn; agent sessions get a browser handle in seed context | M2 |
| Skill-file updates for QA, UI/UX, Web Architect, SEO, Vulnerability Scanner | Add "Browser tool" to their Tools & Artifacts tables with the command surface | M0 — contract edit |

**Why not copy gstack's `server.ts` wholesale:** it's 3,170 LOC with gstack-specific concerns (stealth mode, extension loading, Conductor workspace integration). team1 needs the *protocol* (navigate → screenshot → click → evaluate → wait), not the gstack-specific daemon internals. A thin Bun + Playwright wrapper (~200 LOC) gives team1 the same command surface without the gstack baggage.

**Effort:** 2-3 days for the wrapper; the skill-file updates are M0 contract edits (30 min).

---

### Initiative 3: Execution discipline skills (prevents agent misbehavior at scale)
**Extract from:** gstack's `/investigate`, `/review`, `/freeze` skill structures
**Into:** `agent-skills/references/` — new discipline templates inherited by all 39 agents

| Deliverable | What it does | Source pattern |
|-------------|-------------|---------------|
| `agent-skills/references/investigate-protocol.md` | 4-phase root-cause discipline: investigate → analyze → hypothesize → implement. "No fixes without root cause." Injected into Incident Response, Debugger, and any agent hitting an error | gstack `/investigate` |
| `agent-skills/references/review-checklist.md` | Structural diff checklist: SQL safety, LLM trust boundaries, conditional side effects, scope drift. Used by QA Agent and Architect Agent at Phase 4 / Phase 2 gates | gstack `/review` + `review/checklist.md` |
| `orchestrator/runtime/tools/freeze.ts` | Per-directory edit scoping: agent's `AcquireCheckout{batch}` is validated against a `frozenPaths` allowlist before the edit-coordinator applies it. Out-of-scope edits are rejected with `CheckoutDenied{reason: "out-of-scope"}` | gstack `/freeze` |

**Why this matters for team1 specifically:** with 39 agents editing one repo via serialized commits, an agent that "helpfully" edits a file outside its task scope creates noise at best and breakage at worst. gstack's `/freeze` pattern maps cleanly onto team1's `AcquireCheckout{batch}` — the batch is already a discrete unit, so scope-checking it is a one-line validation in the edit-coordinator.

**Effort:** 1 day for the templates + freeze validation; the investigate/review protocols are markdown, not code.

---

### Initiative 4: Context persistence (prevents total loss on stall)
**Extract from:** gstack's `/context-save` + `/context-restore` — JSON checkpoint with git state, decisions, remaining work
**Into:** `orchestrator/runtime/` — new `context-checkpoint.ts` module

| Deliverable | What it does | Milestone dependency |
|-------------|-------------|---------------------|
| `orchestrator/runtime/context-checkpoint.ts` | On every `TurnEnd`, runtime serializes the agent's working context (current task, decisions made, files touched, remaining steps) to `orchestrator/data/checkpoints/<instanceId>.json` | M2 |
| `ReapInstance` enhancement | Before reaping a stalled agent, runtime saves a final checkpoint. On reassignment, the replacement agent's seed context includes the checkpoint as "prior context" | M3 |
| `SessionStarted` payload enhancement | `seedContext` gains an optional `priorCheckpoint` field | M0 — contract edit |

**Why gstack's pattern maps:** gstack saves context as a structured JSON file (git state + decisions + remaining work). team1's runtime already holds this state in-memory between turns — the extraction is just persisting it to disk on each `TurnEnd` and loading it on the next `SessionStarted`. The format is nearly identical to gstack's.

**Effort:** 0.5 days. It's a serialize/deserialize pair + one intent payload field.

---

### Initiative 5: Post-deploy verification loop (makes Phase 6 concrete)
**Extract from:** gstack's `/canary` (post-deploy screenshot + console-error monitoring) and `/health` (weighted composite quality score)
**Into:** `orchestrator/services/health-monitoring/` — concrete monitoring tooling for Phase 6

| Deliverable | What it does | Source pattern |
|-------------|-------------|---------------|
| `health-monitoring/src/canary.ts` | Post-deploy loop: navigate to deployed URL every 30s for 10 min, screenshot, diff console errors against pre-deploy baseline, emit `MboMetricReport` with uptime/performance values | gstack `/canary` |
| `health-monitoring/src/quality-score.ts` | Weighted composite: type-check (25%), lint (20%), test pass-rate (30%), dead-code ratio (15%), shell-lint (10%). Emits as `MboMetricReport` for the technical-debt-ratio gate | gstack `/health` |
| Phase 6 exit criteria update | `.main.lifecycle.md` Phase 6 row references the canary + quality-score outputs as the concrete measurement method for "SLOs observed" | M0 — contract edit |

**Why this closes a real gap:** the spec's Phase 6 says "SLOs observed AND uptime/performance MBO within target" but defines no mechanism for *observing*. gstack's canary is exactly that mechanism — and it already produces structured output (screenshot diff, error count) that maps onto `MboMetricReport`.

**Effort:** 2 days. The canary needs the browse daemon (Initiative 2); the quality score is pure shell-tool orchestration.

---

### Initiative 6: Spec-to-issue pipeline (tightens Phase 1)
**Extract from:** gstack's `/spec` — 5-phase process: understand the "why" → scope & boundaries → interrogate existing code → quality-gate → file issue + optionally spawn worktree agent
**Into:** `orchestrator/apps/orchestrator-api/` — new `POST /features/spec` endpoint + Product Manager Agent skill enhancement

| Deliverable | What it does | Source pattern |
|-------------|-------------|---------------|
| `POST /features/spec` endpoint | Accepts a vague feature description; runs the 5-phase spec process; emits `FeatureSubmitted` with a structured scope doc attached | gstack `/spec` |
| Product Manager Agent skill update | Add "Spec process" subsection referencing the 5 phases; PM Agent leads Phase 1 using this protocol | M0 — contract edit |
| `FeatureSubmitted` payload enhancement | Gains `scopeDoc` field (structured: problem statement, boundaries, acceptance criteria, NFRs) | M0 — contract edit |

**Why gstack's 5-phase is better than team1's current Phase 1:** team1's Phase 1 says "validate feasibility, define scope, set MBO-aligned targets" but gives no process. gstack's `/spec` is a *battle-tested process* — it forces the agent to read existing code before asking questions (Phase 3 "HARD requirement: read code first"), deduplicates against existing issues (Phase 1 `--dedupe`), and quality-gates the output before filing. This is directly portable.

**Effort:** 1-2 days. The 5-phase process is mostly prompt engineering; the endpoint is a thin wrapper.

---

## Dependency graph

```
Initiative 1 (tests) ──────────────────────► unblocks M1 (bus boot)
                                                │
Initiative 2 (browser) ───────────────────► unblocks M2 (spawn + assign)
                                                │
Initiative 3 (discipline) ────────────────► prevents M3 breakage
                                                │
Initiative 4 (context) ───────────────────► prevents M3 data loss
                                                │
Initiative 5 (canary+health) ─────────────► makes M4 (lifecycle gating) real
          │
          └── depends on Initiative 2 (browser)
                                                │
Initiative 6 (spec pipeline) ─────────────► tightens M4 Phase 1
```

**Milestone-0 contract edits across all initiatives:**

| Initiative | Contract edit | File |
|------------|--------------|------|
| 2 | Browser tool in skill files (QA, UI/UX, Web, SEO, Security) | 5 × `agent-skills/*.md` |
| 3 | Investigate + review protocol references | `agent-skills/references/` (2 new files) |
| 3 | Freeze validation in edit-coordinator | `orchestrator-design-spec.md` §10 (intent catalog) |
| 4 | `priorCheckpoint` in `SessionStarted` payload | `packages/contracts/src/intents.ts` |
| 5 | Phase 6 measurement method | `.main.lifecycle.md` |
| 6 | `scopeDoc` in `FeatureSubmitted` payload | `packages/contracts/src/intents.ts` |
| 6 | Spec process in PM Agent skill | `agent-skills/product-manager-agent-skills.md` |

**Total M0 contract edits:** 11 (5 skill files + 2 new reference files + 2 intent payload fields + 1 lifecycle row + 1 spec doc update). All are additive — no existing contract is broken.

---

## What NOT to extract

| gstack asset | Why not |
|-------------|---------|
| gstack's `server.ts` (3,170 LOC browser daemon) | Too much gstack-specific complexity (stealth, extensions, Conductor). Use Playwright directly — same command surface, 1/15th the code |
| gstack's iOS QA suite | team1 has no iOS agents yet; the Mobile Development Unit is scoped to CI cycle time and app store rating, not device QA |
| gstack's gbrain cross-machine memory sync | Premature for team1; cross-session learning is a post-M6 concern |
| gstack's `/design-shotgun` (multi-variant generation) | team1's UI/UX Agent is a single instance per unit; multi-variant design is a future capability |
| gstack's Turborepo + pnpm monorepo tooling | team1's orchestrator is a Bun monorepo; the build tooling choice is already made |
| gstack's model-overlay system | team1's runtime uses `/zo/ask` with a fixed model; multi-model routing is a future concern |

---

## Sequencing recommendation

1. **Now (M0):** Initiatives 1 + 3 + contract edits for 2/4/5/6
   - Write the test harness (Initiative 1) — it's the highest-leverage, lowest-risk work
   - Write the discipline templates (Initiative 3) — pure markdown, no code
   - Apply all 11 M0 contract edits — additive, non-breaking

2. **M1→M2:** Initiative 2 (browser daemon) + Initiative 4 (context persistence)
   - Browser is needed before any agent can do real QA/visual work
   - Context persistence is needed before stall/reassign can work without total loss

3. **M3→M4:** Initiative 5 (canary + health score) + Initiative 6 (spec pipeline)
   - Canary needs the browser (Initiative 2 dependency)
   - Spec pipeline tightens Phase 1, which is the entry point for M4's end-to-end lifecycle test

---

## Revision history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-22 | `@architect-agent` (via Zo) | Initial plan from gstack v1.58.4.0 evaluation |
