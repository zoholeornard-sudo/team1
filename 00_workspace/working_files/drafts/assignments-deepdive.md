# Deep Dive — Assignments & MBO Flow

> **Thesis:** The assignments file is the MBO soul of the platform — it defines *what success means* for each of the 9 units. The contracts, lifecycle gates, and skill files all reference it. But no code actually reads it. The entire MBO framework is contractually defined but not wired at runtime. The gate evaluator is correct but receives empty input.

---

## 1. The source of truth

`file 'assignments/teamelite-2025.json'` — assigned 2025-06-10, 9 units, 23 metrics total.

| Unit | Metrics | Example targets |
|------|---------|-----------------|
| SaaS Development | 4 | 99.9% uptime, sub-200ms API, <5% bug escape |
| Mobile Development | 4 | <2h CI cycle, <1s cold launch, 4.5+ store rating |
| Web Development | 3 | <1s TTFB @ 100k users, WCAG 2.1 AA, SEO >90 |
| Desktop Development | 2 | Zero installer failures, crash MTTR <5min |
| Cloud Infrastructure | 2 | 95% cost utilization, <30s provisioning |
| ML/Ops | 2 | <0.5% drift false positives, deployment <15min |
| AI Research | 2 | 4 prototypes/quarter, 2 publications/year |
| Data Science | 2 | 5 insights/month, A/B lift >10% |
| Security & Compliance | 2 | Zero critical vulns, IR <1hr |

**Structure:** Each unit has an `mboObjective` (human-readable string) and a `metrics` array of `{name, target, measurement}`. The `measurement` field describes *how* the metric is observed — but no code parses it.

**Static snapshot:** The file is a one-time seed. There's no mechanism for reassignment, metric updates, or multi-project support. The `project` field is hardcoded to `teamelite-2025`.

---

## 2. Where assignments are referenced (the contract surface)

### 2.1 Lifecycle exit criteria (`.main.lifecycle.md`)

Every phase exit gate references MBO metrics "loaded from `assignments/<project>.json`":

| Phase | MBO gate |
|-------|----------|
| 1 | Metric targets loaded with baselines recorded |
| 2 | Architecture-review-coverage on target (100%) |
| 3 | Technical-debt-ratio <15% or planned-gap declared |
| 4 | Bug-escape-rate <5% or accepted remediation |
| 5 | Deployment-success-rate >99% |
| 6 | Unit's MBO metrics within target (canary measurement) |
| 7 | MBO gaps from phases 3–6 → mandatory Phase 1 inputs |

### 2.2 Skill files

- `architect-agent-skills.md` — "Ensure architectural decisions support assigned MBO targets — see `assignments/teamelite-2025.json`"
- `product-manager-agent-skills.md` — "Load targets from `assignments/<project>.json`. If no metric moves, the feature probably isn't a unit-level priority."
- `experiment-runner-agent-skills.md` — "Target metric in `assignments/teamelite-2025.json` is at risk of breach"

### 2.3 Intent contracts (`packages/contracts/src/intents.ts`)

```typescript
// TaskCreatedPayload
mboMetrics: { name: string; target: string }[];  // "pulled from assignments/<project>.json"

// PhaseGateCheckPayload
mboMetrics: { name: string; value: string; target: string; onTarget: boolean }[];
plannedGaps: { metric: string; declaredGap: string }[];  // path (c)
```

### 2.4 Seed context (`runtime/src/seed-context.ts`)

The agent's prompt includes:
```
### MBO metrics for this task
- Uptime: target 99.9%
- API Response: target sub-200ms under load
```
...but only if `taskPayload.mboMetrics` is populated. Which it never is.

---

## 3. The flow that should exist (designed)

```text
FeatureSubmitted { unit: "SaaS Development Unit" }
  │
  ├─ orchestrator-api loads assignments/teamelite-2025.json
  │   → extracts SaaS Development Unit.metrics
  │   → attaches to scopeDoc.mboTargets
  │
  ├─ task-management creates tasks
  │   → each task carries mboMetrics from the assignment
  │
  ├─ seed-context injects mboMetrics into agent prompt
  │   → agent knows its targets before working
  │
  ├─ agent works, declares planned gaps in progress reports
  │
  ├─ health-monitoring measures actual values
  │   → emits MboMetricReport { name, value, target, onTarget }
  │
  ├─ task-management includes mboMetrics in PhaseGateCheck
  │   → real values + targets, not empty arrays
  │
  └─ gate-evaluator evaluates both gates
      → MBO gate has real data to evaluate
      → verdict reflects actual metric status
```

## 4. The flow that actually exists (reality)

```text
FeatureSubmitted { unit: "SaaS Development Unit" }
  │
  ├─ orchestrator-api creates scopeDoc with mboTargets: []  ← EMPTY
  │   (no code reads the assignments file)
  │
  ├─ task-management creates tasks with mboMetrics: []  ← EMPTY
  │   (echoes what it was given)
  │
  ├─ seed-context injects "(none specified)" into prompt
  │   (agent works blind — no targets)
  │
  ├─ health-monitoring has quality-score but doesn't emit MboMetricReport
  │   (no measurement → no reporting)
  │
  ├─ PhaseGateCheck has mboMetrics: []  ← EMPTY
  │   (task-management line 63: `mboMetrics: []`)
  │
  └─ gate-evaluator: MBO gate passes trivially
      (no metrics to evaluate → missing.length === 0 → passed)
      (the gate is correct; it just has nothing to gate on)
```

---

## 5. The seven gaps

| # | Gap | Where | Severity |
|---|-----|-------|----------|
| **G1** | **No assignments loader** — no code reads `assignments/teamelite-2025.json` | orchestrator-api `/features/spec` endpoint | **Critical** — the entire MBO framework is inert without this |
| **G2** | **No unit→metric mapping at runtime** — the JSON has unit keys, but no code extracts metrics for a specific unit | orchestrator-api | **Critical** — depends on G1 |
| **G3** | **No baseline recording** — Phase 1 exit says "baselines recorded" but there's no baseline storage | lifecycle-management | **High** — without baselines, "on target" is meaningless |
| **G4** | **No MboMetricReport emission** — health-monitoring has `quality-score.ts` but doesn't emit `MboMetricReport` intents | health-monitoring | **High** — the canary loop (Initiative 5) is defined but not wired to emit reports |
| **G5** | **Task-management hardcodes empty mboMetrics** — line 63: `mboMetrics: []` | task-management `emitPhaseGateCheck` | **Critical** — even if metrics were loaded upstream, they're dropped here |
| **G6** | **No planned-gap collection** — the aligned rule path (c) depends on agents declaring gaps in progress reports, but nothing aggregates them into `PhaseGateCheck.plannedGaps` | task-management / lifecycle-management | **High** — path (c) is inert |
| **G7** | **No multi-project support** — the file is a single static snapshot; `FeatureSubmitted` carries a `units[]` array but no project selector | assignments file structure | **Medium** — blocks future expansion |

---

## 6. The fix — one module, three wiring points

### 6.1 New module: `packages/contracts/src/assignments-loader.ts`

```typescript
// Reads assignments/<project>.json, extracts metrics for a unit.
// Pure function — no I/O side effects beyond file read.

export interface UnitAssignment {
  unit: string;
  mboObjective: string;
  metrics: { name: string; target: string; measurement: string }[];
}

export function loadUnitAssignment(
  project: string,
  unit: string,
  assignmentsRoot: string
): UnitAssignment | null {
  const path = `${assignmentsRoot}/${project}.json`;
  const data = JSON.parse(readFileSync(path, "utf8"));
  const unitData = data.units[unit];
  if (!unitData) return null;
  return { unit, ...unitData };
}
```

### 6.2 Wiring point 1: orchestrator-api `/features/spec`

When `FeatureSubmitted` is emitted, load the unit's metrics and attach:

```typescript
const assignment = loadUnitAssignment("teamelite-2025", body.unit, ASSIGNMENTS_ROOT);
scopeDoc.mboTargets = assignment?.metrics.map(m => ({ name: m.name, target: m.target })) ?? [];
```

### 6.3 Wiring point 2: task-management `emitPhaseGateCheck`

When emitting `PhaseGateCheck`, include the real MBO metrics (received from the task, not hardcoded):

```typescript
// Replace line 63: mboMetrics: [],
mboMetrics: phaseTasks[0]?.mboMetrics ?? [],
plannedGaps: collectPlannedGaps(phaseTasks),  // G6 fix
```

### 6.4 Wiring point 3: health-monitoring → `MboMetricReport`

The canary loop (Initiative 5) and quality-score already produce values. Wire them to emit:

```typescript
bus.publish("health", {
  type: "MboMetricReport",
  payload: { featureSlug, phase: "6", metricName: "Uptime", value: "99.95%", target: "99.9%", onTarget: true }
});
```

---

## 7. What the gate evaluator does right (and why it doesn't matter yet)

The gate evaluator (`gate-evaluator.ts`, 197 LOC, 17 tests) is **correct**:

- ✅ Evaluates artifact gate + MBO gate as co-equal
- ✅ Handles planned-gap declarations (path c)
- ✅ Handles lens reviews (Phase 2)
- ✅ Produces the right verdict: proceed / remedy / blocked / backward
- ✅ Pure function — fully testable without Redis

But it's **fed empty input**. Every `PhaseGateCheck` in the real system has `mboMetrics: []` and `plannedGaps: []`. The evaluator correctly returns `proceed` because there are no missing metrics — but that's a *vacuous pass*, not a *real pass*. The gate is doing its job; the pipeline just isn't giving it data.

**This is the single highest-leverage fix in the system.** One assignments loader + three wiring points turns the MBO framework from inert to live.

---

## 8. Metric types — a hidden design issue

The assignments file mixes three kinds of metrics, and the gate evaluator treats them all the same way:

| Type | Example | Problem |
|------|---------|---------|
| **Continuous** | 99.9% uptime, sub-200ms API | `onTarget` is a boolean — no notion of "close but not quite" |
| **Categorical** | WCAG 2.1 AA, Zero critical vulns | "Zero" is a count, not a threshold — the gate can't distinguish "0 found" from "not checked" |
| **Rate-based** | 4 prototypes/quarter, 5 insights/month | These are *output* metrics, not *quality* metrics — they measure throughput, not phase exit |

The gate evaluator's `onTarget: boolean` is too coarse for continuous metrics. A 99.8% uptime (miss by 0.1%) gets the same `backward` verdict as a 50% uptime. The planned-gap path (c) handles this gracefully — the agent declares the gap — but the *measurement* side has no concept of severity.

**Recommendation:** add a `severity` field to `MboMetricReport` (`"minor" | "major" | "critical"`) so the gate can distinguish "slightly off, declared as planned gap" from "catastrophically off, backward intent required."

---

## 9. The assignment → agent → gate → carry-forward loop

This is the full lifecycle of an MBO metric, traced end-to-end:

```text
                        assignments/teamelite-2025.json
                                    │
                         loadUnitAssignment()
                                    │
                        ┌───────────▼───────────┐
                        │  FeatureSubmitted      │
                        │  scopeDoc.mboTargets   │
                        └───────────┬───────────┘
                                    │
                        ┌───────────▼───────────┐
                        │  TaskCreated           │
                        │  mboMetrics: [...]     │  ← currently empty (G1/G2)
                        └───────────┬───────────┘
                                    │
                        ┌───────────▼───────────┐
                        │  seed-context.ts       │
                        │  injects into prompt   │  ← currently "(none specified)"
                        └───────────┬───────────┘
                                    │
                              agent works
                              declares gaps
                                    │
                        ┌───────────▼───────────┐
                        │  PhaseGateCheck        │
                        │  mboMetrics: [...]     │  ← currently empty (G5)
                        │  plannedGaps: [...]    │  ← currently empty (G6)
                        └───────────┬───────────┘
                                    │
                        ┌───────────▼───────────┐
                        │  gate-evaluator.ts     │
                        │  evaluates both gates  │  ← correct, but vacuous pass
                        └───────────┬───────────┘
                                    │
                         verdict: proceed
                         (because nothing to fail)
                                    │
                        ┌───────────▼───────────┐
                        │  Phase 7: Analysis     │
                        │  MBO gaps → Phase 1    │  ← no gaps to carry (G3)
                        └───────────────────────┘
```

The loop is structurally complete — every arrow exists in the design. But the data flow is broken at three points (G1, G5, G6), making the entire loop inert.

---

## 10. Summary

| Dimension | Status |
|-----------|--------|
| **Contract definition** | ✅ Complete — 23 metrics, 9 units, lifecycle gates, intent payloads |
| **Gate evaluator logic** | ✅ Correct — 17 tests, pure function, handles all 3 paths |
| **Assignments file** | ✅ Present — well-structured, 23 metrics |
| **Runtime loading** | ❌ Missing — no code reads the file (G1) |
| **Metric injection into tasks** | ❌ Missing — hardcoded empty arrays (G5) |
| **Planned-gap aggregation** | ❌ Missing — no collection mechanism (G6) |
| **Measurement & reporting** | ❌ Missing — no MboMetricReport emission (G4) |
| **Baseline recording** | ❌ Missing — no storage (G3) |
| **Metric type sophistication** | ⚠️ Insufficient — boolean onTarget, no severity |
| **Multi-project support** | ⚠️ Not designed — single static snapshot (G7) |

**One-line verdict:** The MBO framework is the platform's defining feature, and it's contractually complete but runtime-inert. Three wiring fixes (one loader module + three insertion points) turn it live. That's the highest-leverage work remaining.
