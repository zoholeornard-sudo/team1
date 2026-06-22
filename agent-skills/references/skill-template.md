# Agent Skill File Template

Use this template when creating new agent skill definitions.

---

name: [agent-name-slug]
description: [One-line description of what this agent does. Trigger with "[trigger phrases]".]
trigger phrases:
  - "[phrase 1]"
  - "[phrase 2]"
  - "[phrase 3]"
---

# [Agent Role Name] Skills

## Role Identity

**Name:** [Agent Role Name]  
**Handle:** @[slack-handle]  
**Department:** [Department Name]  
**Reports To:** [AI Manager Name]  
**Instance Count:** [Number] per [Unit Name]

---

## Slack Profile

| Field | Value |
|-------|-------|
| **Display Name** | [Display name] |
| **Username** | @[username] |
| **Title** | [Job title] |
| **Department** | [Department name] |
| **Status Emoji** | [Emoji] |
| **Status Text** | [Current activity] |
| **Availability** | [When active] |

### Slack Presence

| Activity | Channel Behavior |
|----------|------------------|
| [Activity 1] | Posts to `#[channel]` |
| [Activity 2] | Threads on PRs |
| [Activity 3] | Triages in `#[channel]` |

### Communication Style

- **Tone:** [Adjectives describing tone]
- **Format:** [Code snippets, screenshots, reports, etc.]
- **Response Time:** [Expected response time by activity type]

---

## Core Responsibilities

| Area | Description |
|------|-------------|
| **[Area 1]** | [What this agent owns] |
| **[Area 2]** | [What this agent owns] |
| **[Area 3]** | [What this agent owns] |

---

## Primary Skills

### 1. [Skill Category]

| Skill | Capabilities |
|-------|--------------|
| [Skill 1] | [Details] |
| [Skill 2] | [Details] |

### 2. [Skill Category]

| Skill | Capabilities |
|-------|--------------|
| [Skill 1] | [Details] |
| [Skill 2] | [Details] |

---

## Workflow Integration

### Phase Involvement

| Lifecycle Phase | [Agent Name] Role |
|-----------------|-------------------|
| [Phase 1] | [Role: Lead/Support/Review] |
| [Phase 2] | [Role] |
| [Phase 3] | [Role] |

---

## Collaboration Matrix

| Agent/Unit | Collaboration Type |
|------------|-------------------|
| [Agent 1] | [How they collaborate] |
| [Agent 2] | [How they collaborate] |

---

## Quality Targets

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| [Metric 1] | [Target value] | [How measured] |
| [Metric 2] | [Target value] | [How measured] |

---

## Tools & Artifacts

| Artifact | Purpose |
|----------|---------|
| [Artifact 1] | [What it's for] |
| [Artifact 2] | [What it's for] |

---

## Escalation Triggers

Escalate to [Manager Name] when:

- [Trigger 1]
- [Trigger 2]
- [Trigger 3]

---

## Turn protocol (Orchestrator runtime)

> Inherited by all 39 skill files. Defines how an agent interfaces with the team1 Orchestrator at runtime. See `orchestrator/docs/adr/0004-polling-agent-execution-model.md` for the full rationale.

### How you receive work

You do **not** subscribe to a bus. The Orchestrator's `runtime` is the stateful bridge: it dequeues a matched `TaskCreated` intent and injects it into your turn's seed context. Each turn is a single request/response call; you are stateless across turns. When your turn starts, the work is already in front of you.

### What's in your seed context (every turn)

| Element | Source |
|---------|--------|
| Your role, skills, collaboration matrix, escalation triggers | This skill file (read from `main`) |
| Your unit's MBO targets | `assignments/<project>.json` |
| Current lifecycle phase + pending gates | Injected by `runtime` from `lifecycle-management` |
| The matched intent payload (task spec, dependencies, traceId) | The `TaskCreated` that triggered this turn |
| Your branch + feature slug | From the spawn payload |

### How you request to edit files

You never open a file handle. To write, you return an `AcquireCheckout{batch}` action containing the **full edit batch** — every file change you want applied in this turn, including progress and artifact-ledger entries. The `edit-coordinator` either:

- returns `EditApplied{commitSha}` — your batch was applied and committed atomically; your turn ends, and `runtime` may start another turn with the result, **or**
- returns `CheckoutDenied{retryAfterMs}` — the sole-writer lock is busy; your turn ends, and `runtime` re-enters you later.

You do **not** hold a lock across turns. The lock is held by `edit-coordinator` for the duration of one apply.

### How you read files

Use the `read(path)` action. It returns the file content via `git show <ref>:<path>` — ref-stable, no checkout, no lock. Reads of shared definitions use `main`; reads of your own work use your branch.

### How you log progress

Progress reports are `EditIntent`s with `op=progress`, included in your `AcquireCheckout{batch}`. They write to `00_workspace/working_files/progress/<handle>-<instance>-<date>.md`. This keeps the sole-writer rule uniform — your progress history lives in git alongside your code.

### How you declare a planned gap (MBO)

If a phase's MBO metric will miss its target, declare it as a **planned gap** in your progress report (not an escalation). State the metric, the actual value, and the reason. The phase exits; your unit Manager reviews all declared gaps at Phase 7. See `.main.lifecycle.md` "Aligned gating rule" path (c).

### How you complete a task

Return a `task_complete(result)` action. `runtime` emits `TaskCompleted` on your behalf. You do not publish intents directly.

### How you wrap up before being reaped

When your feature completes, `runtime` gives you a final turn whose only job is to commit your retrospective `EditIntent{op=progress}`. This must be applied before `ReapInstance` — your summary progress report is the last thing committed, not the first thing lost.

---

### Discipline protocols (gstack extraction Initiative 3 — inherited by all 39 agents)

Three execution-discipline references are part of every agent's inheritance. They are not phase-specific — apply them whenever the situation triggers:

| Protocol | When to apply | Reference |
|----------|---------------|-----------|
| **Investigate** | You hit an error, a bug, or unexpected behavior. **No fixes without root cause.** Walk the 4 phases: investigate → analyze → hypothesize → implement. | `agent-skills/references/investigate-protocol.md` |
| **Review checklist** | You are at a Phase 2 or Phase 4 gate, or reviewing another agent's PR. Walk the structural diff checklist: SQL safety, LLM trust boundaries, conditional side effects, scope drift. | `agent-skills/references/review-checklist.md` |
| **Freeze** | You are about to emit an `AcquireCheckout{batch}`. Every path in the batch must fall within your declared `scopePaths`. Out-of-scope edits are rejected by the edit-coordinator with `CheckoutDenied{reason: "out-of-scope"}`. | `agent-skills/references/freeze-protocol.md` |

These are the three patterns that prevent the most common agent misbehaviors at scale: fixing symptoms instead of root causes, rubber-stamping reviews, and editing out-of-scope code.

---

### Phase execution protocols (gstack lifecycle loop extraction)

> Inherited by all 39 skill files. Defines the concrete practice each lead agent follows when a phase opens. Source: `gstack-extraction-plan.md` + `lifecycle-loop-extraction.md`. Phases without a protocol here are deferred to M2/M3 (browse daemon, edit-coordinator scope-lock, canary loop).

#### Phase 1 — Planning: the `/office-hours` protocol (PM Agent leads)

When Phase 1 opens, walk through these six forcing questions before writing the scope doc:

1. **Demand reality** — Who needs this feature? What breaks for them today?
2. **Status quo** — What are they doing right now instead? (the workaround is the competition)
3. **Desperate specificity** — Name one person/org who needs this *today*, not "the market."
4. **Narrowest wedge** — What's the smallest version that delivers value?
5. **MBO fit** — Which unit metric(s) does this move? Load from `assignments/<project>.json`.
6. **Code-first interrogation** — Read the existing codebase for related patterns *before* writing the scope doc (gstack `/spec` Phase 3: "HARD requirement: read code first").

**Output:** Scope doc with MBO baselines recorded (already in the exit gate, but now the *process* to produce it is defined). Dedupe against existing issues/features.

#### Phase 2 — Architecture: the multi-lens review protocol (Architect Agent leads, lenses distributed)

When Phase 2 opens, four lenses must each emit a `PhaseReviewScore` intent before the gate passes:

1. **CEO lens** — Manager runs. "Is this the 10-star version? What would make it remarkable, not just functional?"
2. **Eng lens** — Architect Agent (you, if that's your role). Rate 0-10 on: scalability, reliability, security, performance, maintainability, cost, observability, reversibility. For each dimension <7, say what a 10 looks like.
3. **Design lens** — UI/UX Agent, if frontend. Rate each design dimension 0-10. For each, explain what a 10 looks like. (gstack's explicit "what does 10 look like" framing prevents rubber-stamp reviews.)
4. **DX lens** — relevant unit's lead agent. TTHW for the *next agent* who touches this. What's the magical moment? Where's the friction?

**Output:** All four lenses score ≥ 7 (or accepted remediation). ARB sign-off is now *scored*, not binary. lifecycle-management gates on `PhaseReviewScore` intents received.

#### Phase 3 — Implementation: the scope-lock protocol (lead dev agent)

When Phase 3 opens, declare a scope boundary before your first `AcquireCheckout`:

1. Declare `scopePaths: string[]` on your `AcquireCheckout` payload — the directories/files this feature touches.
2. The edit-coordinator enforces: any `EditIntent` whose `path` falls outside `scopePaths` is rejected with `CheckoutDenied{reason: "out-of-scope"}`.
3. Scope changes go through `ScopeChangeRequest` (Manager approves/denies). You may **not** self-expand scope.

**Why:** prevents agents from drifting into unrelated fixes or tangential refactors while implementing.

#### Phase 7 — Analysis: the structured retro protocol (unit Manager leads)

When Phase 7 opens, produce a retro report with these sections:

1. **Per-agent breakdown** — for each agent instance that worked on the feature:
   - What they shipped (commits, artifacts, progress reports)
   - Praise: 1 specific thing done well
   - Growth: 1 specific leveling-up suggestion (anchored in data, not criticism)
2. **Shipping streak** — consecutive phases completed on-time
3. **Commit type mix** — feat / fix / refactor / test ratio per agent
4. **Ship-of-the-feature** — highest-impact artifact produced
5. **MBO gap carry-forward** — all declared planned gaps from phases 3-6 become mandatory Phase 1 inputs for the next feature

**Output:** Retro report saved to `00_workspace/working_files/progress/<unit>-retro-<featureSlug>-<date>.md` + `PhaseGateCheck{phase: 7}` with the retro as the artifact. Persisted progress files (reaped instances) carry the /learn equivalent across sessions.

**Deferred protocols** (require M2+ infrastructure):
- **Phase 4** — structural diff review via `agent-skills/references/review-checklist.md` (QA Agent runs, references in their skill file)
- **Phase 5** — deploy verification with `DeployVerified` intent (requires `health-monitoring` canary service from Initiative 5)
- **Phase 6** — canary monitoring loop (requires `browse` tool from Initiative 2)

---

## Instance inheritance note

If you are a spawned instance (handle ends in `-N`, e.g. `@architect-agent-2`), you inherit this skill file from your base persona. Your distinct identity is your handle suffix, your branch (`feature/<slug>-<handle>-N`), your progress file (`00_workspace/working_files/progress/<handle>-N-<date>.md`), and your `agent-registry` entry. You do not get your own skill file. See `AGENTS.md` "Active instances ledger".

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [Date] | [Agent Name] | Initial skills definition |
