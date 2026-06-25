# Deep Dive — Assignments: Who Assigns, When, and How Metrics Actually Work

**Date:** 2026-06-25
**Author:** `@architect-agent` (via Zo)
**Trigger:** "who assigns a task? is it reasonable to have metrics before knowing what to measure? if the web dev unit is requested to build a stock price prediction dashboard, could we use hardcoded MBOs and pre-assigned agents? how does a project get decomposed to granular tasks? who assigns?"

**Answer up front:** No, hardcoded unit MBOs are not sufficient for feature-level work, and the current design has **no decomposition or assignment step at all**. Agents are spawned and then sit idle waiting for tasks that nothing ever creates. This is the largest functional gap in the orchestrator.

---

## 1. The three-level metric problem

The current design treats MBOs as one flat thing. They're actually three distinct levels, and conflating them is the root of the question's concern.

| Level | What it is | Where it lives today | When it's known | Example (stock dashboard) |
|--------|-----------|---------------------|-----------------|---------------------------|
| **Unit standing MBO** | Always-on quality bar for everything a unit ships | `assignments/teamelite-2025.json` | At assignment time, before any feature | Web Dev: <1s TTFB, WCAG 2.1 AA, SEO >90 |
| **Feature MBO** | What *this specific feature* must achieve | **Nowhere — not modeled** | Phase 1 (Planning), derived from the feature's nature | Prediction accuracy >80%, dashboard loads <2s, updates every 30s |
| **Task acceptance criteria** | Concrete, per-task, binary pass/fail | `TaskCreatedPayload.acceptanceCriteria: string[]` | At decomposition time, after scope is defined | "API endpoint returns 200 with valid JSON", "model outputs prediction + confidence interval" |

**The problem:** the gate-evaluator's `mboMetrics` field is fed unit standing MBOs, but those don't apply to every feature. SEO >90 is meaningless for an internal stock prediction dashboard. A/B Test Lift >10% is irrelevant when there's no experiment to run. The gate either passes vacuously (no applicable metrics) or blocks irreversibly (a standing MBO that doesn't apply to this feature and has no planned-gap declaration mechanism that fits).

**What's needed:** feature MBOs are a distinct concept that must be modeled, derived in Phase 1, and used as the gate's metric input — not the unit standing MBOs. The standing MBOs are a *checklist the Manager reviews at Phase 7*, not a per-gate enforcement.

---

## 2. The decomposition gap — the missing pipeline

Here's the full flow as designed vs. as built:

```
Feature submitted
    │
    ▼
Phase 1 (Planning) — PM Agent produces scope doc
    │
    ▼
???  ←── THE GAP: who breaks the scope doc into tasks?
    │
    ▼
Task created (POST /tasks) — but WHO calls this?
    │
    ▼
Task assigned to agent (capability match) — but WHO does this?
    │
    ▼
AgentAssigned emitted — runtime launches turn
    │
    ▼
Agent does work, emits TaskCompleted
    │
    ▼
Phase gate check — gate-evaluator
```

**What actually exists:**

| Step | Implemented? | Evidence |
|------|-------------|---------|
| Feature submitted | ✅ | `orchestrator-api` `/features/spec` endpoint |
| Phase 1 scope doc | ✅ (structure) | `FeatureSubmittedPayload.scopeDoc` — but it's a scaffold, not populated by a real PM Agent turn |
| **Decompose scope → tasks** | ❌ **MISSING** | No code path. No service. No intent. No agent is told to do this. |
| **Create tasks** | ✅ (endpoint) | `task-management` `POST /tasks` — but nobody calls it |
| **Assign task → agent** | ❌ **MISSING** | `agent-registry` stores `capability` but has no matching endpoint. No service matches task capability to available instances. |
| **Emit TaskCreated** | ❌ **MISSING** | Defined in contracts, consumed by runtime, but never emitted by anything |
| Agent does work | ✅ (structure) | Runtime `handleTaskCreated` → `executeTurn` → `/zo/ask` |
| Phase gate check | ✅ | `lifecycle-management` `/phase/gate-check` + `gate-evaluator.ts` |

**The spawn flow creates agents and writes "Awaiting first task assignment" in their progress file. Then nothing assigns.** This is the core finding.

---

## 3. Tracing the stock prediction dashboard example

**Feature:** "Build a stock price prediction dashboard using a stock market API"

### What should happen

| Step | Actor | Action | Output |
|------|-------|--------|--------|
| 1 | Manager | `POST /features/spec` with description | `featureSlug: stock-price-prediction-dashboard` |
| 2 | PM Agent (Phase 1) | Runs /office-hours protocol: who needs this, what's the narrowest wedge, read existing code | Scope doc: dashboard UI + prediction API + data pipeline |
| 3 | PM Agent (Phase 1) | **Derives feature MBOs** from the feature's nature, not from unit standing MBOs | Prediction accuracy >80%, dashboard load <2s, real-time updates <30s lag |
| 4 | PM Agent (Phase 1) | **Identifies required capabilities** from scope | `frontend`, `data-science`, `backend-api`, `devops` |
| 5 | **Decomposer** (PM Agent or Manager) | **Breaks scope into tasks** with acceptance criteria + capability + phase + dependencies | See task table below |
| 6 | **Assigner** (task-management or agent-registry) | **Matches each task's capability to available agents**; spawns if none available | Task→agent mapping |
| 7 | task-management | Emits `TaskCreated` per task | Runtime picks up, launches turns |
| 8 | Agents | Execute turns, emit `TaskCompleted` | Artifacts produced |
| 9 | lifecycle-management | Phase gate check with **feature MBOs** (not unit standing MBOs) | Gate verdict |

### The task decomposition (step 5)

| Task ID | Capability | Phase | Description | Acceptance criteria | Depends on |
|---------|-----------|-------|-------------|---------------------|------------|
| T-001 | data-science | 3 | Build prediction model from stock API historical data | Model outputs price prediction + confidence interval; backtest accuracy >80% | — |
| T-002 | backend-api | 3 | Build prediction API endpoint | `GET /api/predict/:symbol` returns 200 with `{prediction, confidence, updatedAt}`; handles rate limits | T-001 |
| T-003 | frontend | 3 | Build dashboard UI | Displays predictions, auto-refreshes every 30s, WCAG 2.1 AA | T-002 |
| T-004 | devops | 5 | Deploy dashboard to production | Accessible at URL, autoscaling configured, <30s provisioning | T-003 |

### What's wrong with hardcoded MBOs here

| Unit standing MBO | Applies to this feature? | Why |
|-------------------|------------------------|-----|
| Web Dev: TTFB <1s at 100k users | **Partially** — dashboard should be fast, but 100k concurrent users is unlikely for an internal tool | Standing MBO is over-specified for this feature |
| Web Dev: WCAG 2.1 AA | **Yes** — always applies to any web UI | Directly usable |
| Web Dev: SEO >90 | **No** — internal dashboard, not indexed | Would block the gate if enforced literally |
| Data Science: A/B Test Lift >10% | **No** — no experiment to run | Would block the gate |
| Data Science: 5 actionable insights/month | **No** — this is a unit-level throughput metric, not a feature metric | Wrong granularity entirely |
| Cloud: Cost utilization 95% | **Partially** — applies to the deployment, but is measured at the unit level, not per-feature | Can't be evaluated per-task |

**Conclusion:** unit standing MBOs are a **Phase 7 review checklist**, not a per-gate enforcement. The per-gate enforcement must use **feature MBOs** derived in Phase 1.

---

## 4. Who assigns? — the role analysis

Three candidates for the decomposer/assigner role:

| Candidate | Role in current design | Fit | Why |
|-----------|----------------------|-----|-----|
| **PM Agent** | Phase 1 lead; writes scope docs | **Good for decomposition** — PM owns the feature scope, knows what needs building | But PM doesn't know agent capabilities or availability — shouldn't assign |
| **Unit Manager** | Spawns agents; validates manager authority | **Good for assignment** — Manager knows their unit's agents and their capabilities | But Manager is unit-scoped — a cross-unit feature (stock dashboard spans Web + Data Science + Cloud) needs coordination above any single Manager |
| **task-management service** | Stores tasks; emits PhaseGateCheck | **Good as the mechanical assigner** — it's the system of record for tasks, and it can match task.capability against agent-registry entries | But it needs a decomposition input — it can't invent tasks from a scope doc |

**Recommended split:**

```
PM Agent (Phase 1)          → decomposes scope doc into task specs (description, capability, phase, acceptance criteria, dependencies)
                              Output: a task-spec list, submitted to task-management

task-management             → for each task spec:
                                1. Creates the task (POST /tasks — internal call)
                                2. Queries agent-registry for instances matching task.capability + task.featureSlug
                                3. If no instance exists → requests spawn from orchestrator-api
                                4. Emits TaskCreated intent → runtime launches the turn

agent-registry              → gains a new endpoint: GET /agents/match?capability=frontend&featureSlug=stock-dashboard
                              Returns available instances or empty (triggering a spawn request)
```

This gives us:
- **Decomposition** = PM Agent (human-in-the-loop intelligence, uses /office-hours protocol)
- **Assignment** = task-management (mechanical capability matching against registry)
- **Spawning** = orchestrator-api (on-demand when no agent exists for a capability)

---

## 5. What needs to change in the code

### 5.1 Model feature MBOs (contract change)

```typescript
// In FeatureSubmittedPayload — already has scopeDoc, but scopeDoc doesn't carry feature MBOs
export interface ScopeDoc {
  problemStatement: string;
  boundaries: string[];
  acceptanceCriteria: string[];
  nfrs: { name: string; target: string }[];
  featureMbos: { name: string; target: string; measurement: string; appliesToPhase: string }[];  // NEW
  existingCodeRead: boolean;
  dedupedAgainst: string[];
}
```

### 5.2 Add a decomposition endpoint (new)

```
POST /features/:slug/decompose
  Body: { taskSpecs: [{ description, capability, phase, acceptanceCriteria[], dependencies[] }] }
  → task-management creates tasks
  → task-management matches each to agents via agent-registry
  → task-management emits TaskCreated per matched task
  → orchestrator-api spawns agents for unmatched capabilities
```

### 5.3 Add capability matching to agent-registry (new endpoint)

```
GET /agents/match?capability=frontend&featureSlug=stock-dashboard
  → Returns: { matched: [{ id, branch }], unmatched: true } 
  → If unmatched, caller requests spawn
```

### 5.4 Change gate-evaluator to use feature MBOs, not unit standing MBOs

The gate's `mboMetrics` input should come from the feature's `scopeDoc.featureMbos`, not from `assignments/<project>.json`. Unit standing MBOs move to a Phase 7 review checklist that the Manager signs off on, not a per-gate enforcement.

### 5.5 Add a task-dependency model

Tasks have dependencies (T-002 depends on T-001). task-management must not emit `TaskCreated` for a task whose dependencies aren't complete. This is a simple topological sort + status check.

---

## 6. The pre-assigned agents question

"Could we use pre-assigned agents?"

**No, and the design already rejected this.** Decision 2 (distinct handles) means agents are spawned on-demand per feature, not pre-assigned. The Web Dev Unit has 1 base persona (`@web-architect-agent`). For the stock dashboard, you'd spawn `@web-architect-agent-2` for the frontend task. You don't pre-assign because:

1. You don't know which features are coming.
2. Different features need different numbers of instances.
3. An idle pre-assigned agent is wasted capacity.

**But:** the *capability catalog* is pre-defined. Each skill file declares what an agent can do. The assigner matches task capability to skill-file-declared capability, then spawns if needed. This is the right model — pre-define *capabilities*, spawn *instances* on demand.

---

## 7. Summary of the gap

| Question | Answer |
|----------|--------|
| Is it reasonable to have metrics before knowing what to measure? | **No.** Unit standing MBOs are known upfront but are the wrong granularity. Feature MBOs must be derived in Phase 1. |
| Could we use hardcoded MBOs? | **For unit standing targets, yes** (they're a Phase 7 review checklist). **For feature gates, no** — they'd block on irrelevant metrics (SEO for an internal dashboard). |
| Could we use pre-assigned agents? | **No.** Capabilities are pre-defined; instances are spawned on demand. |
| How does a project get decomposed to granular tasks? | **PM Agent in Phase 1**, using the /office-hours protocol, produces a task-spec list from the scope doc. |
| Who assigns? | **task-management** mechanically matches task specs to agent instances by capability, spawning when no match exists. |
| What's the biggest gap? | **The decomposition + assignment pipeline doesn't exist.** Agents are spawned and sit idle. No service emits `TaskCreated`. No service matches capabilities. This is the M4 blocker. |

---

## Revision history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-25 | `@architect-agent` (via Zo) | Initial deepdive from the assignment/decomposition question |
