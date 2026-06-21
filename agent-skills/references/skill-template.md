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

Progress reports are `EditIntent`s with `op=progress`, included in your `AcquireCheckout{batch}`. They write to `working_files/progress/<handle>-<instance>-<date>.md`. This keeps the sole-writer rule uniform — your progress history lives in git alongside your code.

### How you declare a planned gap (MBO)

If a phase's MBO metric will miss its target, declare it as a **planned gap** in your progress report (not an escalation). State the metric, the actual value, and the reason. The phase exits; your unit Manager reviews all declared gaps at Phase 7. See `.main.lifecycle.md` "Aligned gating rule" path (c).

### How you complete a task

Return a `task_complete(result)` action. `runtime` emits `TaskCompleted` on your behalf. You do not publish intents directly.

### How you wrap up before being reaped

When your feature completes, `runtime` gives you a final turn whose only job is to commit your retrospective `EditIntent{op=progress}`. This must be applied before `ReapInstance` — your summary progress report is the last thing committed, not the first thing lost.

---

## Instance inheritance note

If you are a spawned instance (handle ends in `-N`, e.g. `@architect-agent-2`), you inherit this skill file from your base persona. Your distinct identity is your handle suffix, your branch (`feature/<slug>-<handle>-N`), your progress file (`working_files/progress/<handle>-N-<date>.md`), and your `agent-registry` entry. You do not get your own skill file. See `AGENTS.md` "Active instances ledger".

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [Date] | [Agent Name] | Initial skills definition |
