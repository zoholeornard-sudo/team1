# Orchestrator Refinement Plan

**Goal** – Turn the high‑level observations about “only the O got recognition in MBO” into a concrete, actionable plan that re‑balances **M** (Management) and **B** (By) while keeping the existing **O**‑centric assets intact.

## 1. Core problem recap (from the deep‑dive & swarm example)

| Symptom | What we have | What’s missing |
|---|---|---|
| **Idle agents** | `SpawnAgents` creates agents, then they sit on “Awaiting first task assignment.” | Ongoing **management** turns that monitor, re‑assign, resolve conflicts. |
| **Missing pipeline** | No decomposition + assignment service; the `??? THE GAP` in the flow diagram. | A *by*‑artifact (workflow/plan) that moves work from scope → tasks → execution, with handoff events. |
| **Metrics‑only focus** | Unit‑standing MBO JSON, gate‑evaluator, SMART goals. | Real‑time **feedback loops**, periodic reviews, and dynamic scope changes. |

The swarm example (A1) *does* the full M‑B‑O cycle, so the delta between that vision and the current orchestrator is exactly the management & mechanism pieces we need to rebuild.

## 2. High‑level redesign pillars

| Pillar | Desired capability | Rough implementation sketch |
|---|---|---|
| **P1 – Management turns** | Managers run a recurring *coordination* loop (heartbeat, status check, conflict resolution). | Add a `ManagerLoop` endpoint (POST `/manager/heartbeat`). It reads the live `agent‑registry`, flags agents with `load.pendingIntents>0` or `lastHeartbeatAgeMs>threshold`, and issues `Reassign`, `Escalate`, or `ScopeChange` intents. **Owner:** SaaS Delivery Manager (Unit 1) will lead implementation. |
| **P2 – By‑pipeline (Workflow objects)** | A first‑class `Plan` entity that stores the ordered list of task contracts, their dependencies, and current state. | Create a `Workflow` service (Bun/TS) exposing `POST /workflow/create`, `GET /workflow/:id`, `PATCH /workflow/:id/task/:tid` for state transitions (e.g., `Ready → InProgress → Done`). Agents subscribe to events via a simple in‑process pub/sub (already used by the gate evaluator). **Datastore:** DuckDB (embedded, zero‑config, fits existing Bun/TS stack; see footnote¹). |
| **P3 – Feedback & Review loops** | Regular “MBO review” turns (not just end‑phase gates). | Add a `ReviewScheduler` that emits a `ReviewRequested` intent every *N* turns (configurable per unit). Managers consume it, fetch metrics from the gate evaluator, and write a `ReviewReport` that updates the corresponding MBO entry. **ReviewReport schema (placeholder):**<br>```json<br>{<br>  "reviewId": "uuid",<br>  "unitId": "string",<br>  "period": { "start": "timestamp", "end": "timestamp" },<br>  "metricsSummary": { "<metricName>": { "value": number, "trend": "up|down|stable" } },<br>  "decisions": [ { "action": "scopeChange|reassign|escalate", "target": "string", "reason": "string" } ],<br>  "createdAt": "timestamp"<br>}``` |
| **P4 – Conflict & Redundancy handling** | Detect contradictory proposals, spin up backups, de‑escalate stalled agents. | Extend the existing `IntentRouter` to support a `conflictScore`. When two agents propose incompatible outputs for the same contract, the manager creates a `BackupAgent` (spawned via `SpawnAgents` with a special “fallback” flag) and merges results after a timeout. **Risk note:** Conflict detection logic can be complex; we will allocate a **spike** in Sprint 0 to prototype a simple rule‑based conflict detector before full implementation in Sprint 4. |
| **P5 – Metrics‑driven but *actionable*** | Keep the rich O‑layer, but tie every metric to a concrete *action* (e.g., if a metric falls below threshold, trigger a manager‑initiated scope change). | Modify the `gate‑evaluator` to emit `MetricAlert` intents; the manager loop listens and translates them into `ScopeChangeRequest` or `ReprioritizeTask` intents. **Threshold configuration:** Per‑unit alert thresholds will be stored in the MBO JSON under a new top‑level `alerts` object (e.g., `"alerts": { "latencyMs": { "warn": 1500, "crit": 3000 } }`). The gate‑evaluator reads this at runtime. |

>¹ **Why DuckDB?** It is an embedded, column‑oriented OLAP database that runs as a single library, requires no separate server, and integrates smoothly with Bun/TS via a simple JS binding. It gives us SQL‑based querying for workflow state without adding operational overhead, aligning with the team’s preference for lightweight, self‑contained services.

## 3. Incremental rollout roadmap (3‑month sprints)

| Sprint | Deliverable | Success criteria |
|---|---|---|
| **Sprint 0 – Baseline audit & Spike** | • Export current agent‑registry, contract schema, and MBO JSON to a snapshot file.<br>• Run a **conflict‑detection spike** (throw‑away prototype) to validate a simple rule‑based approach for P4. | Snapshot stored at `file projects/team1/orchestrator-snapshot‑v0.json`.<br>Spike conclusions documented in `projects/team1/00_workspace/working_files/progress/sprint0-conflict-spike.md`. |
| **Sprint 1 – Workflow service (P2)** | Deploy `/workflow/*` API, persist workflows in a lightweight DuckDB table (`workflow.duckdb`). | New workflow can be created, tasks listed, and state transitions observed via the API. |
| **Sprint 2 – Manager loop (P1)** | Implement `ManagerLoop` endpoint, hook into `agent‑registry` and `Workflow`. | Managers emit at least one `Reassign` or `ScopeChange` intent per 30 s interval in a test environment. |
| **Sprint 3 – Feedback & Review (P3)** | Add `ReviewScheduler` and `ReviewReport` persistence. | A ReviewReport appears in the MBO JSON after each 5‑turn cycle, with updated metric summaries. |
| **Sprint 4 – Conflict handling (P4)** | Extend `IntentRouter` with conflict detection (based on Spike findings), backup‑agent spawning. | In a deliberately conflicting test case, a backup agent is spawned and the final merged result is logged. |
| **Sprint 5 – Metric‑alert actions (P5)** | Wire `gate‑evaluator` → `MetricAlert` → manager‑loop actions. | When a metric (e.g., `latency > 2 s`) crosses a threshold, a `ScopeChangeRequest` intent is automatically generated. |
| **Sprint 6 – End‑to‑end validation** | Run the full swarm scenario (A1 style) against the refined orchestrator. | No agents idle after spawn; all tasks progress through the workflow; at least two review cycles complete with updated MBOs. |

Each sprint ends with a **demo‑ready** API endpoint and a short **post‑mortem** note in `projects/team1/00_workspace/working_files/progress/` to keep the knowledge graph fresh.

### Testing Strategy (applies across sprints)

* **Unit tests** for each new service (Workflow, ManagerLoop, ReviewScheduler, IntentRouter extensions) using Vitest/Bun test runner.
* **Contract tests** via Pact‑style JSON schema validation for all new API endpoints.
* **Integration test harness:** a lightweight script that spins up the orchestrator in‑process, seeds a minimal agent registry (2‑3 agents), injects a known workflow, and asserts:
  * Agents receive tasks via the Workflow service.
  * ManagerLoop emits expected intents based on simulated load/heartbeat metrics.
  * ReviewScheduler triggers ReviewReports at the configured interval.
  * Conflict detection spawns a backup agent when contradictory intents are detected.
  * MetricAlert generation triggers a ScopeChangeRequest when a threshold is breached.
* The harness will be committed to `projects/team1/tests/orchestrator-harness.ts` and run on CI.

## 4. Migration strategy (keep existing O assets)

1. **Version the contracts** – add a `version` field to each MBO JSON; the new workflow service consumes `version ≥ 1`. Old contracts remain readable by the gate evaluator, so legacy dashboards keep working.
2. **Feature flag** – gate the manager loop behind `ENABLE_MANAGER_LOOP=true` in the environment. Flip it on gradually for one unit (e.g., SaaS Development) before rolling out globally.
3. **Data back‑fill** – run a one‑off script that converts existing `scopeDoc` ➜ `Workflow` tasks, preserving dependency edges already listed in the deep‑dive tables.
4. **Rollback plan** – if any new endpoint returns an error, the orchestrator automatically falls back to the original “spawn‑only” path (the old `SpawnAgents` flow) because the manager loop is optional.

## 5. Acceptance checklist (what success looks like)

- [ ] No agent remains in “Awaiting first task assignment” for > 30 s after spawn.
- [ ] Every task contract appears as a row in `workflow.duckdb` with a clear `state` column.
- [ ] At least one manager‑initiated `Reassign` or `ScopeChange` intent occurs per sprint demo.
- [ ] Review reports are auto‑generated every 5 turns and written back into the unit’s MBO JSON.
- [ ] Metric alerts trigger concrete actions (e.g., a `ScopeChangeRequest`).
- [ ] All existing unit‑standing MBOs continue to be consumable by the gate evaluator without modification.

## 6. Next steps for you

1. **Approve the roadmap** (or pick a subset to start with).
2. **Allocate a manager‑unit** to own the `ManagerLoop` implementation (SaaS Delivery Manager, Unit 1, as noted in P1).
3. **Create a repo** under `projects/team1` (e.g., `orchestrator-refinement`) and add a `README.md` that references this plan.
4. **Kick off Sprint 0**: run the snapshot script (`bash scripts/snapshot.sh > orchestrator-snapshot‑v0.json`) and store the file as `projects/team1/orchestrator-snapshot‑v0.json`. Then proceed with the conflict‑detection spike as outlined.