## Refined, **binding** plan

*(All five decisions are immutable – the architecture below embraces them exactly as you stipulated.  Anything added is?**augmentative**, never?contradictory.)*

---

### 1???What the five decisions *do* to the overall system

| \# | Decision | Concrete architectural effect |
| --- | --- | --- |
| 1 | **Branch?only** | •?Only **one** working directory exists on the Orchestrator host. <br>•?All agents **never touch the filesystem** – they speak *EditIntent* events. <br>•?A **single?process lock** (`work?coordinator`) serialises `git checkout / commit / push`. |
| 2 | **Distinct handles** | •?Every spawned instance gets a **unique handle** (`@architect?agent?2`, `?3`, …). <br>•?The handle is the **canonical identifier** in the Agent?Registry, in all intents, and in the progress?file name. <br>•?The handle **inherits** the base persona’s skill file, but has its own **branch**, **progress log**, and **registry entry**. |
| 3 | **Revise & align gating/exit** | •?Each lifecycle phase now has **dual?gate** criteria: *artifact* **AND** *MBO metric*. <br>•?A phase may **backtrack** automatically if the MBO gate fails, instead of silently passing. <br>•?`lifecycle?management` enforces the rule – no other service can transition a phase. |
| 4 | **New** `orchestrator/` **dir** | •?All source lives under a single **monorepo** root `projects/team1/orchestrator/`. <br>•?The folder layout (see §2) mirrors the “infra axis” (process?per?bounded?context) and the “work axis” (single repo, serialized checkout). |
| 5 | **Decompose from start** | •?Every bounded context is a **stand?alone service process** (Docker container). <br>•?All inter?service communication uses **Redis Streams** via the shared `bus?client` package – no in?process calls, no shared DB joins. |

---

## 2???Monorepo layout (final, binding)

```markdown
projects/team1/orchestrator/
?? apps/
?  ?? orchestrator-api/          # control?plane HTTP/GraphQL gateway (port 3099)
?  ?? orchestrator-cli/          # `orchestrator` command?line tool
?? services/
?  ?? task-management/          # :3101 – Task CRUD, emits TaskCreated/…   (Apollo?Federation)
?  ?? session-management/       # :3102 – Session lifecycle, heartbeat
?  ?? health-monitoring/        # :3103 – HealthCheck, Metric, MBO reports
?  ?? lifecycle-management/     # :3104 – Phase engine, gate enforcement
?  ?? event-coordination/       # :3105 – Intent router, SwarmIntent hub
?  ?? agent-registry/           # :3106 – Agent catalog, instance handling
?? packages/
?  ?? contracts/                # Shared intent & event schemas (TypeScript + JSON?Schema)
?  ?? bus-client/                # Redis?Streams wrapper, idempotency & replay helpers
?  ?? tsconfig/                 # Shared tsconfig
?  ?? eslint-config/            # Shared lint rules
?? kernel/                       # Process bootstrap, DI container, health?probe
?? runtime/                      # Agent?session launcher (spawns LLM containers)
?? work-coordinator/             # Serialized checkout lock + EditIntent applier
?? infra/
?  ?? docker-compose.yml
?  ?? redis/                     # Optional custom redis config
?? docs/
   ?? adr/                      # Architecture Decision Records
   ?? lifecycle.md              # Revised gating & exit criteria (Decision?3)
```

> **Why this split?**
 **Services* are **process?isolated** (Decision?5).
 **Packages* contain **pure code** that can be imported by any service without creating circular runtime dependencies.
 **Kernel* starts all services in the correct order, wires the Redis bus, and surface a single *health* endpoint for `docker compose`.
 **Work?coordinator* is the **only component that touches the repo** (Decision?1).

---

## 3???Contracts – the shared intent schema

All intents live in `file packages/contracts/src/intents.ts`.  The file is compiled to both **TypeScript** and **JSON?Schema** (via `ts-json-schema-generator`) so every service can validate inbound messages before processing.

```ts
// packages/contracts/src/intents.ts
export type IntentBase = {
  /** unique trace id for the whole workflow */
  traceId: string;
  /** feature or work?item the intent belongs to */
  featureSlug: string;
  /** originating agent handle (if any) */
  agentId?: string;
  /** UTC timestamp */
  ts: string;
};

/**
 * Intent emitted by the Orchestrator when a new feature is submitted.
 */
export interface FeatureSubmitted extends IntentBase {
  type: 'FeatureSubmitted';
  payload: {
    /** free?form description of the feature */
    title: string;
    /** optional JIRA / ticket reference */
    ticket?: string;
  };
}

/**
 * Edit intent – the atomic file operation an agent wants applied.
 */
export interface EditIntent extends IntentBase {
  type: 'EditIntent';
  payload: {
    /** relative path inside the repo */
    path: string;
    /** operation (add/replace/delete) */
    op: 'add' | 'replace' | 'delete';
    /** new content (for add/replace) */
    content?: string;
  };
}

/**
 * The result of a successfully applied edit batch.
 */
export interface EditApplied extends IntentBase {
  type: 'EditApplied';
  payload: {
    commitSha: string;
    /** list of paths that were changed */
    changed: string[];
  };
}

/**
 * MBO metric report – produced by health?monitoring.
 */
export interface MboMetricReport extends IntentBase {
  type: 'MboMetricReport';
  payload: {
    metric: string;
    value: number;
    target: number;
    /** pass/fail derived from value vs target */
    ok: boolean;
  };
}
```

*All services* import the **type** and the **JSON?Schema** (via `import { schema as EditIntentSchema } from '../../contracts/schemas/EditIntent.json'`) and validate inbound data with **ajv** before they act.

---

## 4???Redis Streams – transport (Decision?5)

### 4.1 Stream conventions

| Stream name | Purpose | Message key |
| --- | --- | --- |
| `intent-stream` | All intents (feature, edit, metric, lifecycle) | `{type}` (e.g. `EditIntent`) |
| `reply-stream` | Replies / acknowledgements (e.g. `EditApplied`) | `{correlationId}` (same as original `traceId`) |
| `heartbeat-stream` | Agent heartbeat (sent every 30?s) | `agentId` |

### 4.2 Minimal `bus-client` wrapper

```ts
// packages/bus-client/src/index.ts
import { createClient, RedisClientType, XReadGroupOptions } from 'redis';
import Ajv from 'ajv';
import { IntentBase } from '../../contracts/src/intents';

export class Bus {
  private client: RedisClientType;
  private ajv = new Ajv({ allErrors: true });

  constructor(url = process.env.REDIS_URL ?? 'redis://redis:6379') {
    this.client = createClient({ url });
  }

  async start() {
    await this.client.connect();
  }

  /** publish any intent that respects the Contracts */
  async publish(intent: IntentBase) {
    const schema = await import(`../schemas/${intent.type}.json`);
    const validate = this.ajv.compile(schema.default);
    if (!validate(intent)) {
      throw new Error(`Invalid ${intent.type}: ${this.ajv.errorsText(validate.errors)}`);
    }
    await this.client.xAdd('intent-stream', '*', {
      type: intent.type,
      payload: JSON.stringify(intent),
    });
  }

  /** generic consumer – each service creates its own consumer group */
  async consume(
    group: string,
    consumer: string,
    handler: (intent: IntentBase) => Promise<void>
  ) {
    // ensure group exists (id “0” means start from the beginning)
    try {
      await this.client.xGroupCreate('intent-stream', group, '0', { MKSTREAM: true });
    } catch (_) {}
    const opts: XReadGroupOptions = {
      group,
      consumer,
      count: 10,
      block: 5000,
    };
    while (true) {
      const resp = await this.client.xReadGroup('intent-stream', opts);
      if (!resp) continue;
      for (const [, messages] of resp) {
        for (const [id, fields] of messages) {
          const type = fields.type as string;
          const payload = JSON.parse(fields.payload as string);
          try {
            await handler({ ...payload, type } as IntentBase);
            await this.client.xAck('intent-stream', group, id);
          } catch (e) {
            // leave message in stream for redelivery; optionally push to a dead?letter
            console.error(`Handler failed for ${type}:`, e);
          }
        }
      }
    }
  }
}
```

*All services* create a **dedicated consumer group** (`task-management`, `agent-registry`, …) and register a handler for the intents they care about.

---

## 5???Work?Coordinator – the only filesystem writer

> **Goal** – ensure *branch?only* safety while keeping the commit workflow simple and auditable.

### 5.1 Lock implementation (Redis?based mutex)

```ts
// work-coordinator/src/lock.ts
import { createClient, RedisClientType } from 'redis';

export class RepoLock {
  private client: RedisClientType;
  private readonly key = 'repo-lock';
  private readonly ttl = 30_000; // 30?s lease

  constructor(url = process.env.REDIS_URL) {
    this.client = createClient({ url });
  }

  async start() {
    await this.client.connect();
  }

  /** acquire lock – resolves when lock is held */
  async acquire(holder: string): Promise<void> {
    while (true) {
      const ok = await this.client.set(this.key, holder, {
        NX: true,
        PX: this.ttl,
      });
      if (ok) return; // lock obtained
      // else wait a bit and retry
      await new Promise(r => setTimeout(r, 200));
    }
  }

  /** extend the lease – called by the holder while processing */
  async extend(holder: string) {
    const current = await this.client.get(this.key);
    if (current !== holder) throw new Error('Lock not owned by caller');
    await this.client.pexpire(this.key, this.ttl);
  }

  async release(holder: string) {
    const current = await this.client.get(this.key);
    if (current === holder) await this.client.del(this.key);
  }
}
```

### 5.2 Edit?batch applier (pseudocode)

```ts
// work-coordinator/src/applier.ts
import simpleGit from 'simple-git';
import { RepoLock } from './lock';
import { EditIntent, EditApplied } from '../../packages/contracts/src/intents';
import { Bus } from '../../packages/bus-client';

export class EditApplier {
  private git = simpleGit({ baseDir: process.env.REPO_ROOT });
  private lock = new RepoLock();
  private bus = new Bus();

  async run() {
    await this.lock.start();
    await this.bus.start();
    await this.bus.consume('work-coordinator', 'instance-1', this.handle.bind(this));
  }

  private async handle(intent: EditIntent) {
    if (intent.type !== 'EditIntent') return;
    const holder = `edit-${intent.agentId}-${Date.now()}`;
    await this.lock.acquire(holder);
    try {
      // 1?? checkout the correct branch (derived from featureSlug & agentId)
      const branch = `feature/${intent.featureSlug}-${intent.agentId}`;
      await this.git.checkout(branch);

      // 2?? apply each edit (they arrive as a *batch* in a single intent)
      const { path, op, content } = intent.payload;
      const abs = `${process.env.REPO_ROOT}/${path}`;
      if (op === 'delete') await this.git.rm([abs]);
      else if (op === 'add' || op === 'replace') {
        const fs = await import('fs/promises');
        await fs.writeFile(abs, content ?? '', 'utf8');
        await this.git.add([abs]);
      }

      // 3?? run a **pre?commit** hook – lint + unit tests for the touched files only
      const lintOk = await this.runLint(path);
      const testOk = await this.runTests(path);
      if (!lintOk || !testOk) throw new Error('Pre?commit checks failed');

      // 4?? commit and push
      const commitMsg = `[${intent.agentId}] ${op} ${path}`;
      await this.git.commit(commitMsg);
      await this.git.push('origin', branch);

      // 5?? emit EditApplied
      const commit = (await this.git.revparse(['HEAD'])).trim();
      const applied: EditApplied = {
        type: 'EditApplied',
        traceId: intent.traceId,
        featureSlug: intent.featureSlug,
        ts: new Date().toISOString(),
        payload: { commitSha: commit, changed: [path] },
      };
      await this.bus.publish(applied);
    } finally {
      await this.lock.release(holder);
    }
  }

  private async runLint(path: string): Promise<boolean> {
    // naive example – run eslint on the changed file only
    const { execa } = await import('execa');
    try {
      await execa('npx', ['eslint', path]);
      return true;
    } catch {
      return false;
    }
  }

  private async runTests(path: string): Promise<boolean> {
    // run jest only on files that import the changed module (basic heuristic)
    const { execa } = await import('execa');
    try {
      await execa('npx', ['jest', '--findRelatedTests', path]);
      return true;
    } catch {
      return false;
    }
  }
}
```

*Key properties*

| Property | How it satisfies the decision |
| --- | --- |
| **Single lock** (`repo-lock`) | Guarantees **only one** checkout at a time ? branch?only safety. |
| **Batch intent** (one intent can carry many file ops) | Reduces lock?hold time – agents can fire many edits together, then the coordinator releases the lock. |
| **Pre?commit checks** | Guarantees that an applied edit never leaves the repo in a broken state (important because there is no “working copy” per agent). |
| **Idempotency** | All intents carry a `traceId`; the coordinator can dedupe by persisting processed trace?ids in Redis (optional extension). |

---

## 6???Agent?Registry – distinct handles & inheritance (Decision?2)

### 6.1 Registry schema (Neo4j)

```cypher
// Node types
(:Persona {handle: '@architect-agent', skillFile: 'agent-skills/architect-agent-skills.md'})
(:Instance {
    handle: '@architect-agent-2',
    parentHandle: '@architect-agent',
    branch: 'feature/xyz-@architect-agent-2',
    status: 'active',
    createdAt: datetime(),
    capability: ['code', 'doc']
})

// Relationship
(p:Persona)-[:HAS_INSTANCE]->(i:Instance)
```

### 6.2 API – `POST /agents/spawn`

```ts
// orchestrator-api/src/agents.controller.ts
@Post('spawn')
async spawn(@Body() dto: SpawnDto) {
  // 1?? validate manager authority (MBO?aligned)
  // 2?? reserve N distinct handles via AgentRegistryService
  // 3?? for each handle:
  //    – create Instance node (inherits skillFile from Persona)
  //    – create git branch `feature/<slug>-<handle>`
  //    – write a placeholder progress file:
  //        `working_files/progress/<handle>-<YYYYMMDD>.md`
  //    – emit SpawnedInstance intent
  return { handles: dto.count > 0 ? Array.from({ length: dto.count }, (_, i) => `${dto.handle}-${i+2}`) : [] };
}
```

### 6.3 `file AGENTS.md` – final layout

```markdown
# AGENTS

| Handle                | Persona (base)      | Capability               | Branch                              | Status   |
|-----------------------|---------------------|--------------------------|-------------------------------------|----------|
| @architect-agent      | – (base)            | design, review           | main                                | static   |
| @architect-agent-2    | @architect-agent    | design, review, code    | feature/alpha-@architect-agent-2   | active   |
| @architect-agent-3    | @architect-agent    | design, doc             | feature/alpha-@architect-agent-3   | active   |
| …                     | …                   | …                        | …                                   | …        |

## Instance sub?table (generated automatically)

| Parent | Instance | Branch | Started (UTC) | Last?heartbeat |
|--------|----------|--------|---------------|----------------|
| @architect-agent | @architect-agent-2 | feature/alpha-@architect-agent-2 | 2026?06?12T08:05Z | 2026?06?21T10:12Z |
| @architect-agent | @architect-agent-3 | feature/alpha-@architect-agent-3 | 2026?06?12T08:07Z | 2026?06?21T10:10Z |
```

*The **sub?table** is rendered by a small script (`file scripts/gen-agents-table.ts`) that reads the Neo4j catalog at build time – guaranteeing consistency.*

---

## 7???Lifecycle gating – revised exit criteria (Decision?3)

### 7.1 Formal definition (in `file docs/lifecycle.md`)

```markdown
# Lifecycle – Phase Exit Rules

A phase *P* may transition to *P?+?1* only if **both** of the following predicates are true:

1. **ArtifactPredicate(P)** – all artefacts defined for *P* are present and pass the technical verification defined in the phase’s contract.
2. **MboPredicate(P)** – every MBO metric listed for *P* reports `ok === true` **OR** the metric has been explicitly **exempted** by an approved `MboException` (signed by the unit Manager).

If `MboPredicate(P) === false`:
* The `lifecycle-management` service emits `MboMetricReport` ? `PhaseBacktrack` intent.
* The backtrack intent re?opens the **previous** phase (or a designated remediation phase) and records the metric gap in `assignments/<project>.json` for the next cycle.

The **phase transition API** (`POST /lifecycle/advance`) validates both predicates atomically, using a *distributed transaction* pattern:
* Write a *phase?state* row in PostgreSQL (the authoritative source of truth).
* Publish a `PhaseGateCheck` intent.
* Wait for the **aggregated** response from `health-monitoring` and `task-management`.
* Commit or rollback the state change.

All services must **listen** to `PhaseGateCheck` to update their internal view of the current phase.
```

### 7.2 Enforced by `lifecycle-management`

```ts
// services/lifecycle-management/src/engine.ts
async function tryAdvancePhase(projectId: string) {
  const phase = await prisma.phase.findUnique({ where: { projectId } });
  const artifactOk = await evaluateArtifactGate(phase);
  const mboOk = await evaluateMboGate(phase);

  if (artifactOk && mboOk) {
    await prisma.phase.update({
      where: { projectId },
      data: { number: phase.number + 1 },
    });
    await bus.publish({ type: 'PhaseAdvanced', traceId: uuid(), featureSlug: phase.slug, payload: { from: phase.number, to: phase.number + 1 } });
  } else {
    await bus.publish({
      type: 'PhaseBacktrack',
      traceId: uuid(),
      featureSlug: phase.slug,
      payload: { missing: { artifact: !artifactOk, mbo: !mboOk } },
    });
  }
}
```

---

## 8???Bootstrapping & Dev workflow (the “quick?start” checklist)

```html-details
<summary>Click to expand the 7?step dev bootstrap</summary>

```bash
# 0?? Clone the repo (already under `projects/team1/orchestrator`)
git clone git@github.com:yourorg/orchestrator.git
cd orchestrator

# 1?? Install pnpm (corepack + latest)
corepack enable
pnpm i --frozen-lockfile

# 2?? Spin the local infra (Redis + all services)
docker compose -f infra/docker-compose.yml up -d

# 3?? Generate contracts & GraphQL types
pnpm turbo run graphql:codegen

# 4?? Seed the Neo4j catalog with the base persona (once)
pnpm workspace @team1/agent-registry exec node scripts/seed-base-persona.js

# 5?? Start every service in watch mode (Turbo dev)
pnpm dev

# 6?? Open the orchestrator?api GraphQL playground
open http://localhost:3099/graphql

# 7?? Run the integration test suite (ensures intents round?trip)
pnpm test
```

*All services expose a* `/healthz` *endpoint that simply forwards the last* `HealthCheck` *intent they received – useful for Docker Compose health?checks.*

```markdown

---

## 9???CI?/?CD (binding to the repo)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  lint-test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports: [6379:6379]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 9 }
      - run: pnpm i --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test -- --maxWorkers=4

  build-docker:
    needs: lint-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm i --frozen-lockfile
      - run: pnpm turbo run docker:build
      - name: Docker login
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USER }}
          password: ${{ secrets.DOCKER_PASS }}
      - name: Push images
        run: |
          docker push yourorg/task-management:latest
          docker push yourorg/orchestrator-api:latest
          # …repeat for each service
```

*The pipeline builds **all** services, runs the full test suite, and publishes images that can be dropped into a K8s chart later.*

---

## ???Milestones – binding checkpoints (your list, now with concrete artefacts)

| \# | Milestone | Success criteria (artefacts + tests) | Owner |
| --- | --- | --- | --- |
| 0 | **Contracts extension** | `packages/contracts` contains **JSON?Schema** for every new intent; `file docs/lifecycle.md` updated with dual?gate rules; **AGENTS.md** includes the *instances* sub?table. | Architecture |
| 1 | **Bus + 6 services boot** | `docker compose up` ? All 6 services report `200 OK /healthz` and emit a `HealthCheck` intent within 5?s. | Infra |
| 2 | **Spawn?+?assign** | Manager POST `/agents/spawn` (count?=?3) ? `agent-registry` creates handles `?2 … ?4`; three sessions are opened; each instance logs a distinct progress file (`file working_files/progress/@architect-agent-2?20260621.md` etc.). | Orchestrator?API + Agent?Registry |
| 3 | **Branch?only coordination** | Two agents emit concurrent `EditIntent` batches on **different** branches; `work?coordinator` serialises checkout, commits without conflict; final repo on GitHub shows **two distinct commits** on two branches. | Work?Coordinator |
| 4 | **Lifecycle gating with MBO** | A dummy feature runs through all 7 phases; a deliberately failing MBO metric (`MetricThresholdExceeded`) triggers a `PhaseBacktrack` intent; the system automatically re?opens the prior phase. | Lifecycle?Management + Health?Monitoring |
| 5 | **Multi?feature, single repo** | Two distinct features (`alpha`, `beta`) are spawned concurrently; merge order is enforced by `PhaseGateCheck` (beta cannot merge until alpha’s Phase?7 is **gate?passed**). No manual rebase required. | Orchestrator?API |
| 6 | **Reap?+?history** | After a feature completes, its instances are marked `reaped` in Neo4j; their progress logs remain in `working_files/progress/`; a query `MATCH (i:Instance {status:"reaped"}) RETURN i.handle` returns the correct handles. | Agent?Registry + Runtime |

> **Binding note:** Each milestone is **guarded by an automated test** (Jest?+?Pact contract tests) that runs in CI.  The test suite is the *source of truth* for “done”.

---

## ???Next?step cheat?sheet (what you need to copy?paste)

| File | Path | Purpose |
| --- | --- | --- |
|  |  | Shared intent definitions |
|  |  | Redis?Streams wrapper |
|  |  | Distributed mutex |
|  |  | Edit batch application |
|  |  | Dual?gate enforcement |
|  |  | Redis + 6 services + API |
|  |  | Revised exit?criteria documentation |
|  |  | Persona + instance table (auto?generated) |

Feel free to drop these into the corresponding locations; the rest of the repo (scripts, eslint, tsconfig, CI) is already scaffolded by Turborepo.

---

## ???Final reminder – what **cannot** change

- **Only the Orchestrator** may run `git checkout / commit / push`.
- **Agent handles are immutable** once created (`@architect-agent?N`).
- **Phase transition** must always pass both artifact **and** MBO checks.
- **All communication** goes through the **Redis?Streams bus** – no direct HTTP calls between services.
- **Each bounded context** lives in its own Docker container from day?1.

Everything else in this refined plan is **add?on detail** that makes the system testable, observable, and ready for production while staying 100?% faithful to the five decisions you locked in. ??