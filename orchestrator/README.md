---
version: 0.1.0
---

# team1 Orchestrator

The **runtime layer** that ties together the three document layers already in this repo:
`agent-skills/` (definitions the registry reads), `metrics/` (MBO targets sessions pull from `mbo-targets.yaml`),
`00_workspace/working_files/` (where spawned agents log progress + artifacts).

It is not a new folder of skills — it is the **engine for the docs already written**.

---

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) ≥ 1.2 (runtime + package manager)
- [Docker](https://docker.com/) (for Redis bus)
- Redis ≥ 7 (provided via `infra/docker-compose.yml`)

### Boot the bus

```bash
cd orchestrator
bun install
bun run boot:bus          # starts Redis on :6379
```

### Boot all 6 services + runtime + API

```bash
bun run boot:services    # starts :3101–:3109
```

### Verify health

```bash
curl -s http://localhost:3101/health | jq   # task-management
curl -s http://localhost:3102/health | jq   # session-management
curl -s http://localhost:3103/health | jq   # health-monitoring
curl -s http://localhost:3104/health | jq   # lifecycle-management
curl -s http://localhost:3105/health | jq   # event-coordination
curl -s http://localhost:3106/health | jq   # edit-coordinator
curl -s http://localhost:3107/health | jq   # agent-registry
curl -s http://localhost:3108/health | jq   # orchestrator-api
curl -s http://localhost:3109/health | jq   # runtime
```

---

## Health-check endpoints

| Service | Port | URL | Returns |
|---------|------|-----|---------|
| task-management | 3101 | `http://localhost:3101/health` | `{ service, status, port }` |
| session-management | 3102 | `http://localhost:3102/health` | `{ service, status, port }` |
| health-monitoring | 3103 | `http://localhost:3103/health` | `{ service, status, port }` |
| lifecycle-management | 3104 | `http://localhost:3104/health` | `{ service, status, port }` |
| event-coordination | 3105 | `http://localhost:3105/health` | `{ service, status, port }` |
| edit-coordinator | 3106 | `http://localhost:3106/health` | `{ service, status, port }` |
| agent-registry | 3107 | `http://localhost:3107/health` | `{ service, status }` |
| orchestrator-api | 3108 | `http://localhost:3108/health` | `{ service, status }` |
| runtime | 3109 | `http://localhost:3109/health` | `{ service, status, model }` |

---

## Intent contracts

All services share a single intent catalog defined in [`packages/contracts/src/intents.ts`](packages/contracts/src/intents.ts). Every intent carries a mandatory `idempotencyKey` (24h TTL dedupe per service). See ADR-0002 for bus topology, ADR-0004 for the polling-agent execution model.

## What it does

Lets each unit Manager spawn multiple sub-agent instances that collaborate inside a single repo
and across microservice-like modules representing the DDD core bounded contexts. Agents work in
isolation on different features; the orchestrator guarantees intent propagation, eventual
consistency, and autoscaling of the agent swarm.

## Architecture (two-axis decomposition)

| Axis | Unit | Authority |
|------|------|-----------|
| **Infra** (processes) | 6 bounded-context services + runtime + registry + API | One process per context, own SQLite, own port |
| **Work** (branches) | One branch per agent instance: `feature/<slug>-<handle>` | Single-writer lock in `edit-coordinator` |

```
orchestrator/
├── packages/contracts/     # Shared intent catalog + types (imported by all services)
├── services/
│   ├── task-management/        # :3101 — task lifecycle, assignment
│   ├── session-management/     # :3102 — agent session state, heartbeats
│   ├── health-monitoring/      # :3103 — staleness, reap decisions
│   ├── lifecycle-management/   # :3104 — phase gates, MBO gating, planned-gap tracking
│   ├── event-coordination/     # :3105 — cross-service intent routing + validation
│   └── edit-coordinator/       # :3106 — branch lock, edit-intent apply, commit
├── runtime/                # Agent session supervisor (polling-agent model, §2.1)
├── agent-registry/         # :3107 — persona metadata, instance ledger, Manager authority
├── orchestrator-api/       # :3108 — REST entry point (FeatureSubmitted, SpawnAgents)
├── infra/                  # docker-compose, Redis config, keyspace prefixes
└── docs/adr/               # Architecture Decision Records (0001–0004 seeded)
```

## Two paths to the bus

| Path | Used by | Purpose |
|------|---------|---------|
| `packages/bus-client` (direct Redis) | Services internally | Intra-service pub/sub, stream reads |
| `event-coordination` (:3105) | Cross-service intents | Intent routing + validation + ordering choke point |

Services do **not** bypass `event-coordination` for cross-context intents — that's the validation
choke point. `bus-client` is the transport; `event-coordination` is the policy layer.

## Persistence

SQLite per service (own schema, no cross-service joins). Redis for the intent bus only.
Postgres is a documented ADR upgrade path (ADR-0005, deferred). Keyspace prefixes documented in
`infra/redis-keyspaces.md`. Each service replays its stream from last-acked position on boot.

## Observability

Hooks into the existing Loki pipeline at `:3100`. No new collector. Services log to
`/dev/shm/<service-name>.log` per the platform convention.

## Milestone status

| # | Milestone | Status | Done when |
|---|-----------|--------|-----------|
| 0 | Contract edits + scaffold | **In progress** | 4 contract edits applied + ADRs 0001–0004 + tree skeleton |
| 1 | Bus boot | Not started | 6 services boot, ping each other via event-coordination |
| 2 | Spawn 3 instances | Not started | 3 agent instances spawned, assigned, heartbeating |
| 3 | Multi-feature work | Not started | 2 features in parallel, edit-coordinator serializes correctly |
| 4 | MBO gating live | Not started | lifecycle-management enforces both gates |
| 5 | Cross-feature merge | Not started | MergeConflictDetected + resolution path |
| 6 | Scale-out | Not started | Sharded coordinators or Postgres swap |

See [`docs/adr/`](docs/adr/) for the decisions this scaffold is built on. See [`00_workspace/working_files/drafts/orchestrator-design-spec.md`](../00_workspace/working_files/drafts/orchestrator-design-spec.md) for the full design specification.
