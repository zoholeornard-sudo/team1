# team1 Web UI

Real-time dashboard for the team1 multi-agent orchestrator platform.

Built by the **SaaS Development Unit** (TeamElite).

## Tech Stack

- **Next.js 14** (App Router, React Server Components)
- **TypeScript** (strict mode)
- **Tailwind CSS** (dark mode, responsive)
- **WCAG 2.1 AA** accessible

## Routes

| Route | Description |
|-------|-------------|
| `/` | Dashboard — features, agents, service health, MBO overview |
| `/features` | Feature list with status and unit tags |
| `/features/new` | Submit a new feature (mints slug, spawns agents) |
| `/features/[slug]` | Feature detail with agent instances |
| `/agents` | Agent registry ledger grouped by persona |
| `/workflows` | Workflow task state from workflow service |
| `/metrics` | MBO metrics for all 9 units |
| `/services` | Health checks for all 13 orchestrator services |

## Orchestrator Services

The UI connects to these bounded-context services via Next.js rewrites:

| Service | Port | Rewrite |
|---------|------|---------|
| orchestrator-api | :3099 | `/api/orchestrator/*` |
| agent-registry | :3107 | `/api/registry/*` |
| workflow | :3108 | `/api/workflow/*` |
| metric-alert | :3112 | `/api/metrics/*` |

Health checks for all 13 services are fetched directly from `http://localhost:{port}/health`.

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

The orchestrator services must be running for live data:

```bash
cd ../../orchestrator
bun --filter './services/*' dev
```

## MBO Alignment

All metrics shown in the UI derive from `metrics/mbo-targets.yaml`.
The monitoring thresholds in the feature rollout playbook
(`playbooks/product-management/feature-rollout.md`) are the canonical source.
