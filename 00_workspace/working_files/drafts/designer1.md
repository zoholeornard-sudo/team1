# Refined System Architecture

## Executive Summary

This is the **binding architecture** for a multi-agent orchestration platform where autonomous AI agents execute structured work across a feature lifecycle — coordinated by a centralized Orchestrator that is the sole filesystem writer, with agents communicating exclusively through intents over Redis Streams.

Five locked decisions shape every aspect of this design. They are not tradeoffs to revisit; they are the foundation.

---

## 1. Foundational Decisions (Locked)

| \# | Decision | Architectural Consequence |
| --- | --- | --- |
| 1 | **Branch-only** — no worktrees | Orchestrator is the sole filesystem writer. Agents emit edit intents; Orchestrator applies them to the agent's branch. One working directory, serialized commits. |
| 2 | **Distinct handles** — spawned instances get `@architect-agent-2`, `-3`, … | Inheritance model: base persona's skill file is the template; instance gets own ID, own progress file, own branch. AGENTS.md gains an instances sub-table. |
| 3 | **Revise & align gating/exit** — MBO metrics are co-equal exit conditions alongside artifacts | A phase exits only when *both* artifact and MBO gates pass, or an accepted remediation feeds the next Planning. |
| 4 | **New** `orchestrator/` **directory** | `projects/team1/orchestrator/` — monorepo, sits alongside `agent-skills/`, `assignments/`, `working_files/`. |
| 5 | **Decompose from start** — bounded contexts are separate service processes from day one | Real transport (Redis Streams) from day one. Not in-process modules. |

Two decomposition axes, kept distinct:

- **Infra axis** (decision 5): bounded contexts = separate processes.
- **Work axis** (decision 1): agent work = branches in one repo.

---

## 2. Monorepo Structure

```markdown
projects/team1/orchestrator/
?
?? services/                         ? one process per bounded context
?  ?? task-management/               ? :3101
?  ?  ?? src/
?  ?  ?  ?? domain/                  # Task, TaskQueue, Priority entities + domain logic
?  ?  ?  ?? application/             # Use cases: CreateTask, AssignTask, CompleteTask
?  ?  ?  ?? infrastructure/          # PostgreSQL repo, Redis bus publisher
?  ?  ?  ?? api/                     # Intent handlers (subscribe) + gRPC server
?  ?  ?? Dockerfile
?  ?  ?? package.json
?  ?
?  ?? session-management/            ? :3102
?  ?  ?? src/
?  ?  ?  ?? domain/                  # Session, SessionState
?  ?  ?  ?? application/             # StartSession, EndSession, TrackProgress
?  ?  ?  ?? infrastructure/          # Redis (ephemeral) + PostgreSQL (audit)
?  ?  ?  ?? api/
?  ?  ?? Dockerfile
?  ?  ?? package.json
?  ?
?  ?? health-monitoring/             ? :3103
?  ?  ?? src/
?  ?  ?  ?? domain/                  # HealthCheck, Metric, Threshold
?  ?  ?  ?? application/             # EvaluateHealth, EmitAlert, DetectStall
?  ?  ?  ?? infrastructure/          # TimescaleDB (time-series)
?  ?  ?  ?? api/
?  ?  ?? Dockerfile
?  ?  ?? package.json
?  ?
?  ?? lifecycle-management/          ? :3104
?  ?  ?? src/
?  ?  ?  ?? domain/                  # Phase, Gate, Lifecycle, Remediation
?  ?  ?  ?? application/             # TransitionPhase, EvaluateGates, EnforceMbo
?  ?  ?  ?? infrastructure/          # PostgreSQL + Terraform state backend
?  ?  ?  ?? api/
?  ?  ?? Dockerfile
?  ?  ?? package.json
?  ?
?  ?? event-coordination/            ? :3105  (the intent bus gateway)
?  ?  ?? src/
?  ?  ?  ?? routing/                 # Intent type ? consumer stream mapping
?  ?  ?  ?? validation/              # Schema validation, dead-letter
?  ?  ?  ?? replay/                  # Event replay for recovery
?  ?  ?  ?? gateway/                 # HTTP ingest ? bus publish
?  ?  ?? Dockerfile
?  ?  ?? package.json
?  ?
?  ?? agent-registry/                ? :3106
?     ?? src/
?     ?  ?? domain/                  # Agent, Capability, Instance
?     ?  ?? application/             # RegisterAgent, MatchCapability, ReserveInstance
?     ?  ?? infrastructure/          # PostgreSQL (registry) + Redis (heartbeat TTL)
?     ?  ?? api/
?     ?? Dockerfile
?     ?? package.json
?
?? packages/
?  ?? contracts/                     ? intent DTO types, event schemas (shared)
?  ?  ?? src/
?  ?  ?  ?? intents/                 # All 11 intent type definitions
?  ?  ?  ?? events/                  # Domain event schemas
?  ?  ?  ?? models/                  # Shared value objects (AgentId, FeatureSlug, Phase)
?  ?  ?  ?? lifecycle/               # Gate definitions, MBO schemas
?  ?  ?? package.json
?  ?
?  ?? bus-client/                    ? Redis Streams wrapper (shared)
?     ?? src/
?     ?  ?? publisher.ts             # Publish intent to stream
?     ?  ?? subscriber.ts            # Subscribe with consumer group
?     ?  ?? dead-letter.ts           # Failed message routing
?     ?  ?? types.ts                 # Stream name enum, envelope types
?     ?? package.json
?
?? kernel/                           ? boots services, wires DI, starts bus
?  ?? src/
?  ?  ?? di/                        # Dependency injection container
?  ?  ?? config/                    # Env, feature flags, service discovery
?  ?  ?? bootstrap.ts               # Start all services in order
?  ?? package.json
?
?? runtime/                          ? agent-session launcher (the spawner)
?  ?? src/
?  ?  ?? launcher.ts                # Spawn AI session with seed context
?  ?  ?? seed-context.ts            # Build skill file + MBO + branch + filter
?  ?  ?? capability-filter.ts       # Subscribe to matching intents
?  ?  ?? reap.ts                    # Reap completed/stalled instances
?  ?? package.json
?
?? work-coordinator/                 ? branch lock + edit-intent applier (decision 1)
?  ?? src/
?  ?  ?? lock.ts                    # Mutex on repo working directory
?  ?  ?? checkout.ts                # git checkout <agent-branch>
?  ?  ?? applier.ts                # Apply EditIntent batch to filesystem
?  ?  ?? validator.ts               # Lint/test for touched paths
?  ?  ?? commit.ts                  # git commit + push
?  ?  ?? types.ts                   # EditIntent, EditApplied
?  ?? package.json
?
?? apps/
?  ?? orchestrator-api/              ? :3099  (control plane)
?  ?  ?? src/
?  ?  ?  ?? graphql/                # Schema: spawn, status, workflow queries
?  ?  ?  ?  ?? schema.ts
?  ?  ?  ?  ?? resolvers.ts
?  ?  ?  ?  ?? subscriptions.ts     # Real-time workflow status
?  ?  ?  ?? grpc/                   # Streaming status + intent submission
?  ?  ?  ?? auth/                   # Manager authority validation
?  ?  ?  ?? routes/
?  ?  ?     ?? POST /agents/spawn
?  ?  ?     ?? GET  /agents/:id/status
?  ?  ?     ?? GET  /workflows/:id
?  ?  ?     ?? POST /workflows/:id/override
?  ?  ?? Dockerfile
?  ?  ?? package.json
?  ?
?  ?? orchestrator-cli/              ? `orchestrator` command
?     ?? src/
?     ?  ?? commands/
?     ?  ?  ?? spawn.ts
?     ?  ?  ?? status.ts
?     ?  ?  ?? logs.ts
?     ?  ?  ?? reap.ts
?     ?  ?? main.ts
?     ?? package.json
?
?? infra/
?  ?? docker-compose.yml             ? redis + 6 services + api + cli
?
?? docs/
   ?? adr/                           ? ADRs per the architect agent's template
```

---

## 3. Two Decomposition Axes

```markdown
???????????????????????????????????????????????????????????????????????
?                        DECOMPOSITION AXES                           ?
?                                                                     ?
?  INFRA AXIS (Decision 5)          WORK AXIS (Decision 1)            ?
?  ?????????????????????????        ??????????????????????            ?
?                                                                     ?
?  Bounded contexts are             Agent work lives in               ?
?  separate OS processes            branches in ONE repo              ?
?  communicating via                with serialized                   ?
?  Redis Streams                    commits through                   ?
?                                   work-coordinator                  ?
?                                                                     ?
?  ???????????  stream   ??????????  ????????????  lock  ?????????? ?
?  ?task-mgmt?????????????event-  ?  ?  agent   ??????????  work  ? ?
?  ? :3101   ?           ?coord   ?  ? session  ?  edit  ? coord  ? ?
?  ???????????           ? :3105  ?  ?          ?  intent?        ? ?
?  ???????????           ??????????  ????????????        ?  mutex ? ?
?  ?agent-reg?                                          ?  on    ? ?
?  ? :3106   ?  Each service:                           ?  repo  ? ?
?  ???????????  — own process                           ?????????? ?
?  ???????????  — own schema                           One writer. ?
?  ?lifecycle?  — no cross-DB joins                    Agents emit. ?
?  ? :3104   ?  — communicates only                    Coord applies.?
?  ???????????    via intents                                      ?
???????????????????????????????????????????????????????????????????????
```

---

## 4. Intent Catalog (Binding on All Services)

Every inter-service communication flows through these 11 intents. No exceptions.

| \# | Intent | Emitted By | Consumed By | Payload |
| --- | --- | --- | --- | --- |
| 1 | `FeatureSubmitted` | orchestrator-api | lifecycle-management | `{featureSlug, unit, managerId, timestamp}` |
| 2 | `TaskCreated` | task-management | agent-registry, session-management | `{taskId, featureSlug, capability, priority, branch}` |
| 3 | `AgentAssigned` | agent-registry | runtime, session-management | `{agentId, taskId, featureSlug, branch}` |
| 4 | `SpawnAgents` | unit Manager (via API) | agent-registry, runtime | `{unit, personaHandle, capability, count, featureSlug}` |
| 5 | `EditIntent` | agent session | work-coordinator | `{agentId, branch, path, op, content, traceId}` |
| 6 | `EditApplied` | work-coordinator | task-management | `{agentId, commitSha, paths[], timestamp}` |
| 7 | `TaskCompleted` | agent session | task-management, event-coordination | `{taskId, agentId, artifactPaths, summary}` |
| 8 | `PhaseGateCheck` | task-management | lifecycle-management | `{featureSlug, phase, artifactComplete, tasksCompleted}` |
| 9 | `MboMetricReport` | health-monitoring | lifecycle-management | `{featureSlug, phase, metricName, value, target}` |
| 10 | `MergeConflictDetected` | work-coordinator | owning unit's lead agent | `{branch, conflictPaths, baseBranch}` |
| 11 | `AgentStalled` | health-monitoring | agent-registry | `{agentId, lastHeartbeat, taskId}` |

### Intent Envelope (shared by all)

```typescript
// packages/contracts/src/intents/envelope.ts

interface IntentEnvelope<T> {
  type: IntentType;           // enum of the 11 intents
  payload: T;
  ts: number;                 // unix ms
  traceId: string;            // uuid, propagated across all hops
  featureSlug: string;        // which feature this intent belongs to
  branch: string;             // which branch this intent targets
  source: string;             // service name that emitted this
}
```

### Transport: Redis Streams

```markdown
Stream: "intents:{type}"
  ? Consumer group per consuming service
  ? At-least-once delivery
  ? Dead-letter after 3 retries
  ? bus-client package abstracts the transport

Stream layout:
  intents:feature-submitted    ? lifecycle-mgmt reads
  intents:task-created         ? agent-registry, session-mgmt read
  intents:agent-assigned       ? runtime, session-mgmt read
  intents:spawn-agents         ? agent-registry, runtime read
  intents:edit-intent          ? work-coordinator reads
  intents:edit-applied         ? task-mgmt reads
  intents:task-completed       ? task-mgmt, event-coord read
  intents:phase-gate-check     ? lifecycle-mgmt reads
  intents:mbo-metric-report    ? lifecycle-mgmt reads
  intents:merge-conflict       ? owning unit's lead agent reads
  intents:agent-stalled        ? agent-registry reads
```

---

## 5. Branch-Only Coordination (Decision 1)

### Core Principle

**Agents never touch the filesystem directly.** The work-coordinator is the sole writer to the repository working directory.

### Component Diagram

```markdown
????????????????????????????????????????????????????????????????
?                    WORK COORDINATOR                           ?
?                                                              ?
?  ????????????     ????????????     ???????????????????????? ?
?  ?  Lock    ?     ? Checkout ?     ?   Applier            ? ?
?  ?  Manager ??????? Manager  ???????                      ? ?
?  ?          ?     ?          ?     ?  — Apply file edits  ? ?
?  ?  mutex   ?     ?  git     ?     ?  — Run lint/test     ? ?
?  ?  on repo ?     ?  checkout?     ?  — git add           ? ?
?  ?  dir     ?     ?  <branch>?     ?  — git commit        ? ?
?  ????????????     ????????????     ?  — git push          ? ?
?       ?                            ???????????????????????? ?
?       ?                                       ?              ?
?       ?                                       ?              ?
?  ????????????                          ????????????????     ?
?  ?  Agent   ?                          ?  Emit        ?     ?
?  ? Sessions ?                          ?  EditApplied ?     ?
?  ? (emit    ?                          ?  intent      ?     ?
?  ?  Edit    ?                          ????????????????     ?
?  ?  Intents)?                                               ?
?  ????????????                                               ?
????????????????????????????????????????????????????????????????
```

### Sequence: Agent Edit Flow

```markdown
Agent Session              Work Coordinator              Git Repo
     ?                          ?                           ?
     ?  EditIntent batch        ?                           ?
     ????????????????????????????                           ?
     ?                          ?  acquire lock             ?
     ?                          ?????????????????????????????
     ?                          ?  (mutex on repo dir)      ?
     ?                          ?                           ?
     ?                          ?  git checkout <branch>    ?
     ?                          ?????????????????????????????
     ?                          ?                           ?
     ?                          ?  apply edits to files    ?
     ?                          ?????????????????????????????
     ?                          ?                           ?
     ?                          ?  lint + test touched paths?
     ?                          ?????????????????????????????
     ?                          ?                           ?
     ?                          ?  git add + commit + push  ?
     ?                          ?????????????????????????????
     ?                          ?                           ?
     ?  EditApplied{sha}       ?  release lock             ?
     ????????????????????????????????????????????????????????
     ?                          ?                           ?
```

### Lock Manager Implementation

```typescript
// work-coordinator/src/lock.ts

class CheckoutLock {
  private mutex: Mutex;           // async-mutex or Redis Redlock
  private currentBranch: string | null = null;
  private currentAgent: string | null = null;

  async acquire(agentId: string, branch: string): Promise<CheckoutToken> {
    await this.mutex.acquire();
    this.currentBranch = branch;
    this.currentAgent = agentId;
    return {
      agentId,
      branch,
      acquiredAt: Date.now(),
      release: () => this.release()
    };
  }

  async release(): Promise<void> {
    this.currentBranch = null;
    this.currentAgent = null;
    this.mutex.release();
  }

  isLocked(): boolean {
    return this.currentAgent !== null;
  }
}
```

### EditIntent Applier

```typescript
// work-coordinator/src/applier.ts

interface EditIntent {
  agentId: string;
  branch: string;
  path: string;
  op: 'create' | 'modify' | 'delete';
  content?: string;
  traceId: string;
}

class EditIntentApplier {
  constructor(
    private repoPath: string,
    private lock: CheckoutLock,
    private validator: Validator,
    private eventBus: BusPublisher
  ) {}

  async applyBatch(intents: EditIntent[]): Promise<EditApplied> {
    const { agentId, branch } = intents[0];
    const token = await this.lock.acquire(agentId, branch);

    try {
      await gitCheckout(this.repoPath, branch);

      for (const intent of intents) {
        await this.applyFileEdit(intent);
      }

      const validation = await this.validator.run(intents);
      if (!validation.passed) {
        await gitReset(this.repoPath);
        throw new ValidationError(validation.errors);
      }

      const commitSha = await gitCommitAndPush(
        this.repoPath,
        `feat(${branch}): edit by ${agentId} [${intents[0].traceId}]`
      );

      const applied: EditApplied = {
        type: 'EditApplied',
        payload: {
          agentId,
          commitSha,
          paths: intents.map(i => i.path),
          timestamp: Date.now()
        },
        traceId: intents[0].traceId,
        featureSlug: '', // resolved from branch
        branch,
        source: 'work-coordinator',
        ts: Date.now()
      };

      await this.eventBus.publish('intents:edit-applied', applied);
      return applied;

    } finally {
      await token.release();
    }
  }
}
```

### Concurrency Model

```markdown
Time ???????????????????????????????????????????????????????

Agent A:  ??[EditIntent batch 1]??????[EditIntent batch 2]??????
                ?                            ?
                ?                            ?
Coord:   ???????[lock:A]????????????????????[lock:A]???????
              checkout feat/A               checkout feat/A
              apply + commit                apply + commit

Agent B:  ?????????[EditIntent batch 1]??????????[EditIntent batch 2]
                      ?                              ?
                      ?                              ?
Coord:   ?????????????[lock:B]??????????????????????[lock:B]??
                   checkout feat/B                  checkout feat/B
                   apply + commit                   apply + commit

Serialized. No collisions. Each agent always on its own branch.
```

---

## 6. Distinct-Handle Identity (Decision 2)

### Inheritance Model

```markdown
???????????????????????????????????????????????????????????????
?                    @architect-agent                          ?
?                    (base persona)                            ?
?                                                             ?
?  agent-skills/architect-agent/skills.md                     ?
?  ???????????????????????????????????????????????????????    ?
?  ? Role: System Architect                               ?    ?
?  ? Skills: architecture, design-review, adr-writing    ?    ?
?  ? Collaboration: [dev-agent, qa-agent]                 ?    ?
?  ? Escalation: scope-ambiguity ? manager               ?    ?
?  ???????????????????????????????????????????????????????    ?
?                          ?                                   ?
?                    inherits                                   ?
?                          ?                                   ?
?         ???????????????????????????????????                  ?
?         ?                ?                ?                  ?
?  @architect-agent-2  @architect-agent-3  @architect-agent-4  ?
?  (instance)          (instance)          (instance)          ?
?                                                             ?
?  ID: arch-2          ID: arch-3          ID: arch-4         ?
?  Branch:             Branch:             Branch:             ?
?    feat/auth-arch-2    feat/auth-arch-3    feat/pay-arch-4   ?
?  Progress:           Progress:           Progress:           ?
?    arch-2-2025-01-15  arch-3-2025-01-15  arch-4-2025-01-15  ?
?  Status: active      Status: active      Status: reaped     ?
???????????????????????????????????????????????????????????????
```

### Instance Lifecycle

```markdown
Registered ? Reserved ? Active ? Draining ? Reaped
    ?            ?         ?         ?          ?
    ?  Spawn     ? Launch  ? Working ? No more  ? Progress
    ?  request   ? session ? on      ? tasks    ? retained
    ?  creates   ? with    ? tasks   ? assigned ? Registry
    ?  registry  ? seed    ?         ?          ? marked
    ?  entry     ? context ?         ?          ? reaped
    ?            ?         ?         ?          ?
    ?            ?         ?         ?          ?
```

### Seed Context (What Each Instance Receives)

```typescript
// runtime/src/seed-context.ts

interface SeedContext {
  // Identity (distinct per instance)
  agentId: string;                  // "@architect-agent-2"
  parentHandle: string;             // "@architect-agent"
  instanceN: number;                // 2
  featureSlug: string;              // "auth-feature"
  branch: string;                   // "feat/auth-arch-2"

  // Inherited from base persona (read from skill file)
  role: string;
  skills: string[];
  collaborationMatrix: CollaborationEntry[];
  escalationTriggers: EscalationRule[];

  // Unit context
  unit: string;
  mboTargets: MboTarget[];          // from assignments/<project>.json

  // Runtime
  capabilityFilter: string[];       // which intents to subscribe to
  busConnection: BusConfig;         // Redis Streams connection
  progressPath: string;             // working_files/progress/arch-2-<date>.md
}
```

### AGENTS.md Instance Sub-Table

```markdown
## Agent Instances

| Instance ID | Parent | Feature | Branch | Status | Session | Progress |
|-------------|--------|---------|--------|--------|---------|----------|
| @architect-agent-2 | @architect-agent | auth | feat/auth-arch-2 | active | sess-abc123 | progress/arch-2-2025-01-15.md |
| @architect-agent-3 | @architect-agent | auth | feat/auth-arch-3 | active | sess-def456 | progress/arch-3-2025-01-15.md |
| @dev-agent-1 | @dev-agent | auth | feat/auth-dev-1 | reaped | — | progress/dev-1-2025-01-14.md |
```

---

## 7. Lifecycle Gating with MBO (Decision 3)

### The Aligned Rule

A phase exits **only when both** artifact and MBO gates pass, **or** an accepted remediation feeds the next Planning. The lifecycle-management service enforces this. No exceptions.

### Phase Gate State Machine

```markdown
???????????????????????????????????????????????????????????????????
?                                                                 ?
?   ????????????    artifact +     ????????????                  ?
?   ?          ?    mbo both pass   ?          ?                  ?
?   ?  Active  ?????????????????????  Passed  ???? Next Phase    ?
?   ?  Phase   ?                   ?          ?                  ?
?   ?          ?????????????????????          ?                  ?
?   ????????????    remediation    ?  Remedy  ???? Next Phase    ?
?        ?          accepted       ?  Accepted?   (remediation  ?
?        ?                         ????????????    backlogged)   ?
?        ?                                                        ?
?        ? mbo miss, no remedy          ????????????             ?
?        ????????????????????????????????  Blocked ?             ?
?                                       ?          ?             ?
?                                       ????????????             ?
?                                            ?                    ?
?                                            ? backward intent    ?
?                                            ?                    ?
?                                    ????????????????            ?
?                                    ?  Prior Phase  ?            ?
?                                    ?  (re-entry)   ?            ?
?                                    ????????????????            ?
?                                                                 ?
???????????????????????????????????????????????????????????????????
```

### Revised Exit Criteria Table

| \# | Phase | Artifact Gate | MBO Gate | Remediation Path |
| --- | --- | --- | --- | --- |
| 1 | **Planning** | Scope doc approved | Metric targets loaded from `file assignments/<project>.json` with baselines recorded | Cannot proceed without baselines — Manager must provide |
| 2 | **Architecture** | ARB sign-off, NFRs shown achievable | Architecture-review-coverage MBO on target (100% of major changes) | Missing reviews ? schedule review intents |
| 3 | **Implementation** | Code merged via PR, unit/integration tests green | Technical-debt-ratio MBO on target (&lt;15%) or remediation backlog accepted by Manager | Debt backlog ? Manager accepts ? backlogged to next Phase 1 |
| 4 | **Testing** | QA gate passed | Bug-escape-rate MBO on target (&lt;5%) or accepted remediation | Escape analysis ? remediation tasks ? re-enter Phase 4 |
| 5 | **Deployment** | Deployment success, release notes published | Deployment-success-rate MBO on target (&gt;99%) | Failed deployment ? backward intent to Phase 3 |
| 6 | **Monitoring** | SLOs observed | Uptime/performance MBO within target (99.9% / sub-200ms) | Off-target ? backward intent to Phase 3 (not silent pass) |
| 7 | **Analysis** | Retrospective complete, improvements backlogged | MBO gaps from phases 3–6 are mandatory inputs to next cycle's Phase 1 | Incomplete gap analysis ? cannot close feature |

### Gate Enforcement Logic

```typescript
// lifecycle-management/src/application/evaluate-gate.ts

interface GateEvaluation {
  phase: Phase;
  featureSlug: string;
  artifactGate: GateResult;
  mboGate: GateResult;
  verdict: 'proceed' | 'remedy' | 'blocked' | 'backward';
  remediation?: RemediationIntent;
}

class GateEvaluator {
  async evaluate(
    phase: Phase,
    featureSlug: string,
    artifactResult: ArtifactGateResult,
    mboResult: MboGateResult
  ): Promise<GateEvaluation> {

    const artifactPassed = artifactResult.status === 'passed';
    const mboPassed = mboResult.status === 'passed';

    // Both gates pass ? proceed
    if (artifactPassed && mboPassed) {
      return { phase, featureSlug, artifactGate: artifactResult,
               mboGate: mboResult, verdict: 'proceed' };
    }

    // MBO miss with accepted remedy ? proceed with backlog
    if (!mboPassed && mboResult.remediationAccepted) {
      return {
        phase, featureSlug,
        artifactGate: artifactResult, mboGate: mboResult,
        verdict: 'remedy',
        remediation: {
          type: 'RemedyAccepted',
          backlogToNextPhase1: mboResult.gaps,
          acceptedBy: mboResult.acceptedBy
        }
      };
    }

    // MBO miss, no remedy ? backward intent to relevant phase
    if (!mboPassed && !mboResult.remediationAccepted) {
      const backwardPhase = this.resolveBackwardPhase(phase);
      return {
        phase, featureSlug,
        artifactGate: artifactResult, mboGate: mboResult,
        verdict: 'backward',
        remediation: {
          type: 'BackwardIntent',
          targetPhase: backwardPhase,
          reason: mboResult.failureReason
        }
      };
    }

    // Artifact miss ? blocked in current phase
    return { phase, featureSlug, artifactGate: artifactResult,
             mboGate: mboResult, verdict: 'blocked' };
  }

  private resolveBackwardPhase(phase: Phase): Phase {
    const map: Record<Phase, Phase> = {
      Planning: Planning,           // can't go further back
      Architecture: Planning,
      Implementation: Architecture,
      Testing: Implementation,
      Deployment: Implementation,
      Monitoring: Implementation,   // back to Implementation
      Analysis: Monitoring
    };
    return map[phase];
  }
}
```

### Intent Flow Through Lifecycle

```markdown
FeatureSubmitted
       ?
       ?
  ???????????  PhaseGateCheck{phase:1, artifact:done}  ????????????????
  ?Phase 1  ????????????????????????????????????????????? GateEvaluator ?
  ?Planning ?                                           ?              ?
  ???????????  MboMetricReport{phase:1, baselines:set}  ?  BOTH PASS?  ?
       ?         ????????????????????????????????????????              ?
       ?                                               ????????????????
       ?                                                      ?
       ?  PhaseGateCheck{phase:2, arb:approved}               ? proceed
       ?  MboMetricReport{phase:2, coverage:100%}             ?
       ?         ???????????????????????????????????????      ?
       ?                                                      ?
  ???????????                                           ????????????
  ?Phase 2  ?                                           ?Phase 3   ?
  ?Arch     ?                                           ?Implement ?
  ???????????                                           ????????????
       ?                                                      ?
       ?  ... continues through all 7 phases ...              ?
       ?                                                      ?
       ?  PhaseGateCheck{phase:7, retro:complete}             ?
       ?  MboMetricReport{phase:7, gaps:backlogged}           ?
       ?         ???????????????????????????????????????      ?
       ?                                                      ?
  ???????????                                           ????????????
  ?Phase 7  ?                                           ? Feature  ?
  ?Analysis ?                                           ? Complete ?
  ???????????                                           ????????????
```

---

## 8. Spawning Flow (Distinct Handles + Decomposed)

### End-to-End Sequence

```markdown
Manager                Orchestrator-API         Agent-Registry         Runtime
  ?                         ?                       ?                    ?
  ? POST /agents/spawn      ?                       ?                    ?
  ? {unit, persona, count}  ?                       ?                    ?
  ???????????????????????????                       ?                    ?
  ?                         ?                       ?                    ?
  ?                         ? validate Manager auth ?                    ?
  ?                         ?                       ?                    ?
  ?                         ? SpawnAgents intent    ?                    ?
  ?                         ?????????????????????????                    ?
  ?                         ?                       ?                    ?
  ?                         ?                       ? reserve IDs:       ?
  ?                         ?                       ? @arch-agent-2..-N  ?
  ?                         ?                       ?                    ?
  ?                         ?                       ? SpawnAgents intent ?
  ?                         ?                       ??????????????????????
  ?                         ?                       ?                    ?
  ?                         ?                       ?  for each instance:?
  ?                         ?                       ?  — read base skill ?
  ?                         ?                       ?  — build seed ctx  ?
  ?                         ?                       ?  — launch session  ?
  ?                         ?                       ?                    ?
  ?                         ?   AgentAssigned → N   ?                    ?
  ?                         ?????????????????????????                    ?
  ?                         ?                       ?                    ?
  ?                         ?  open sessions        ?                    ?
  ?                         ?????????????????????????????????????????????
  ?                         ?                       ?                    ?
  ?  {status: spawned,      ?                       ?                    ?
  ?   instances: [...]}     ?                       ?                    ?
  ???????????????????????????                       ?                    ?
  ?                         ?                       ?                    ?
  ?                         ?                       ?  AgentHeartbeat    ?
  ?                         ?                       ??????????????????????
  ?                         ?                       ?  (every 30s)       ?
  ?                         ?                       ?                    ?
  ?                         ?                       ?  subscribe to      ?
  ?                         ?                       ?  TaskCreated for   ?
  ?                         ?                       ?  matching capability?
```

### Spawn Request/Response

```typescript
// apps/orchestrator-api/src/routes/spawn.ts

interface SpawnRequest {
  unit: string;
  personaHandle: string;        // "@architect-agent"
  capability: string;           // "architecture"
  count: number;                // 3
  featureSlug: string;          // "auth-feature"
}

interface SpawnResponse {
  status: 'spawned' | 'partial' | 'failed';
  instances: {
    agentId: string;            // "@architect-agent-2"
    branch: string;             // "feat/auth-arch-2"
    sessionUrl: string;         // "sess-abc123"
    status: 'launching' | 'active' | 'failed';
  }[];
  errors?: string[];
}
```

### Runtime Launcher

```typescript
// runtime/src/launcher.ts

class AgentSessionLauncher {
  constructor(
    private skillLoader: SkillLoader,
    private mboLoader: MboLoader,
    private busClient: BusClient,
    private sessionManager: SessionManagerClient
  ) {}

  async launch(context: SeedContext): Promise<Session> {
    // 1. Load base persona skill file
    const skill = await this.skillLoader.load(context.parentHandle);

    // 2. Load MBO targets for this unit
    const mboTargets = await this.mboLoader.load(context.unit);

    // 3. Build the full seed context
    const fullContext: SeedContext = {
      ...context,
      role: skill.role,
      skills: skill.skills,
      collaborationMatrix: skill.collaborationMatrix,
      escalationTriggers: skill.escalationTriggers,
      mboTargets
    };

    // 4. Launch AI session with seed context
    const session = await this.createSession(fullContext);

    // 5. Subscribe to matching intents on the bus
    await this.busClient.subscribe(
      `intents:task-created`,
      (intent: IntentEnvelope<TaskCreated>) => {
        if (this.matchesCapability(intent, context)) {
          session.handleTask(intent.payload);
        }
      },
      { consumerGroup: context.agentId }
    );

    // 6. Start heartbeat
    this.startHeartbeat(context.agentId);

    return session;
  }

  private matchesCapability(
    intent: IntentEnvelope<TaskCreated>,
    context: SeedContext
  ): boolean {
    return context.capabilityFilter.includes(intent.payload.capability);
  }
}
```

---

## 9. Service Interaction: End-to-End Feature Lifecycle

```markdown
???????????????????????????????????????????????????????????????????????????????
?                     FEATURE LIFECYCLE: FULL INTENT FLOW                      ?
?                                                                             ?
?  Manager     Orchestrator    Lifecycle     Task      Agent     Work         ?
?  ???????     ????????????    ?????????     ????      ?????     ????         ?
?                                                                             ?
?  POST /spawn                                                              ?
?  ??????????????SpawnAgents???????????????????????????????????????????????  ?
?                                                                             ?
?               FeatureSubmitted???????????????????????????????????           ?
?                                                  ?                          ?
?                                    Phase 1: Planning ????????????????????  ?
?                                    (artifact + MBO gates)                   ?
?                                                  ?                          ?
?                                    PhaseGateCheck{phase:1}???????           ?
?                                    MboMetricReport{phase:1}???????          ?
?                                                  ?                          ?
?               TaskCreated???????????????????????????????????????           ?
?                                    Phase 2..7 ???????????????????????????  ?
?                                                  ?                          ?
?                              AgentAssigned???????????????????????           ?
?                                                  ?                          ?
?               AgentHeartbeat????????????????????????????????               ?
?               AgentHeartbeat????????????????????????????????               ?
?                                                  ?                          ?
?               EditIntent batch???????????????????????????????              ?
?                                                  ?                          ?
?               EditApplied???????????????????????????????????????           ?
?                                                  ?                          ?
?               TaskCompleted????????????????????????????????               ?
?                                                  ?                          ?
?                                    PhaseGateCheck{phase:N}???????           ?
?                                    MboMetricReport{phase:N}???????          ?
?                                                  ?                          ?
?                                    All phases complete ???????????????????  ?
?                                                  ?                          ?
?               WorkflowFinished???????????????????????????????              ?
?  ?????????????{status: complete}                                             ?
?                                                                             ?
???????????????????????????????????????????????????????????????????????????????
```

---

## 10. Deployment Topology

```yaml
# infra/docker-compose.yml

version: "3.9"

services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data

  task-management:
    build: ../services/task-management
    ports: ["3101:3101"]
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://postgres:5432/task_mgmt
    depends_on: [redis, postgres]

  session-management:
    build: ../services/session-management
    ports: ["3102:3102"]
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://postgres:5432/sessions
    depends_on: [redis, postgres]

  health-monitoring:
    build: ../services/health-monitoring
    ports: ["3103:3103"]
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://postgres:5432/health
    depends_on: [redis, postgres]

  lifecycle-management:
    build: ../services/lifecycle-management
    ports: ["3104:3104"]
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://postgres:5432/lifecycle
    depends_on: [redis, postgres]

  event-coordination:
    build: ../services/event-coordination
    ports: ["3105:3105"]
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on: [redis]

  agent-registry:
    build: ../services/agent-registry
    ports: ["3106:3106"]
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://postgres:5432/agents
    depends_on: [redis, postgres]

  orchestrator-api:
    build: ../apps/orchestrator-api
    ports: ["3099:3099"]
    environment:
      - REDIS_URL=redis://redis:6379
      - TASK_MGMT_URL=http://task-management:3101
      - AGENT_REGISTRY_URL=http://agent-registry:3106
      - LIFECYCLE_URL=http://lifecycle-management:3104
    depends_on: [redis, task-management, agent-registry, lifecycle-management]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: postgres
    volumes:
      - pg-data:/var/lib/postgresql/data

volumes:
  redis-data:
  pg-data:
```

---

## 11. Service Internal Architecture (Clean Architecture)

Every service follows the same layered structure:

```markdown
services/task-management/
?? src/
?  ?? domain/                    # Innermost layer: zero dependencies
?  ?  ?? entities/
?  ?  ?  ?? task.ts             # Task entity with business rules
?  ?  ?  ?? task-queue.ts       # Queue with priority logic
?  ?  ?  ?? priority.ts          # Priority value object
?  ?  ?? events/
?  ?  ?  ?? task-created.ts     # Domain event
?  ?  ?  ?? task-assigned.ts
?  ?  ?  ?? task-completed.ts
?  ?  ?? errors/
?  ?     ?? task-errors.ts
?  ?
?  ?? application/               # Use cases: orchestrates domain
?  ?  ?? create-task.ts
?  ?  ?? assign-task.ts
?  ?  ?? complete-task.ts
?  ?  ?? ports/                  # Interfaces for infrastructure
?  ?     ?? task-repository.ts
?  ?     ?? event-publisher.ts
?  ?
?  ?? infrastructure/            # Outermost: implements ports
?  ?  ?? persistence/
?  ?  ?  ?? postgres-task-repo.ts
?  ?  ?  ?? redis-cache.ts
?  ?  ?? messaging/
?  ?  ?  ?.ts intent-subscriber.ts   # Subscribe to bus intents
?  ?  ?  ?.ts intent-publisher.ts    # Publish intents to bus
?  ?  ?? config/
?  ?     ?? service-config.ts
?  ?
?  ?? api/                       # Entry point
?     ?? grpc-server.ts
?     ?? intent-handlers/        # Maps intents to use cases
?        ?? handle-task-created.ts
?        ?? handle-edit-applied.ts
?        ?? handle-agent-stalled.ts
?
?? tests/
?  ?? unit/domain/
?  ?? unit/application/
?  ?? integration/infrastructure/
?  ?? e2e/
?
?? Dockerfile
?? package.json
?? tsconfig.json
```

### Dependency Rule

```markdown
API ? Application ? Domain ? Infrastructure
         ?                        ?
      ports                  implements ports

Domain has ZERO external dependencies.
Infrastructure depends on Application ports (inversion).
```

---

## 12. Observability

### Tracing

Every intent carries a `traceId`. All services propagate it through:

```markdown
IntentEnvelope.traceId
  ? OpenTelemetry span context
  ? Logs correlated by traceId
  ? Jaeger/Tempo visualization
```

### Health Monitoring

```markdown
Agent-Registry ??Heartbeat??? Health-Monitoring
                                    ?
                          ?????????????????????
                          ?         ?         ?
                     Heartbeat   Metric    Stall
                     Tracker     Evaluator Detector
                          ?         ?         ?
                          ?         ?         ?
                     AgentStalled  MboMetric  AgentStalled
                     (if lost)     Report     (if timeout)
```

### Metrics (per service)

| Metric | Type | Description |
| --- | --- | --- |
| `intent_latency_seconds` | Histogram | Time from intent publish to handler completion |
| `intent_errors_total` | Counter | Failed intent processing by type |
| `checkout_lock_wait_seconds` | Histogram | Time waiting for work-coordinator lock |
| `agent_heartbeat_age_seconds` | Gauge | Time since last heartbeat per agent |
| `phase_gate_duration_seconds` | Histogram | Time spent in each lifecycle phase |
| `gate_evaluations_total` | Counter | Gate evaluations by verdict (proceed/remedy/blocked/backward) |

---

## 13. Revised Milestones

| \# | Milestone | Done When |
| --- | --- | --- |
| 0 | **Contracts extension** — feature-manifest schema; instance-aware progress filename; AGENTS.md instances sub-table; **revised lifecycle exit criteria applied** (decision 3) | `file .main.lifecycle.md` updated; AGENTS.md extended |
| 1 | **Bus + 6 services boot** — Redis Streams up; 6 services start, ping each other via intents | `docker compose up` ? all 6 report healthy via `HealthCheck` intents |
| 2 | **Spawn + assign** — Manager spawns 3 instances of one persona; intents route to matched instances | 3 distinct-handle agents complete a trivial task each, progress files written |
| 3 | **Branch-only work coordination** — agents emit EditIntents; work-coordinator serializes to correct branches | 2 agents edit different files concurrently on different branches, no collision |
| 4 | **Lifecycle gating with MBO** — a feature runs end-to-end through 7 phases; both gates enforced per decision 3 | A feature completes Phase 7 with MBO gaps backlogged to next Phase 1 |
| 5 | **Multi-feature, single repo** — two units ship two features; merge coordination prevents rebase thrash | Two PRs merge in dependency order with no manual rebase |
| 6 | **Reap + history** — instances reaped on completion; progress reports retained; registry entries marked `reaped` | A completed feature's agent instances are gone but their progress logs persist |

**Milestone 0 is the only one that touches existing contracts — and it's the one that makes decisions 2 and 3 real.**

---

## 14. Key Design Decisions (Summary)

| Decision | Rationale |
| --- | --- |
| **Branch-only** (no worktrees) | Eliminates merge conflicts at the filesystem level; one writer guarantees correctness |
| **Distinct handles** | Clean identity model; instances are first-class citizens, not anonymous workers |
| **MBO co-equal gating** | Prevents "artifact-complete but metrics-blind" phase exits; aligned incentives |
| **Separate** `orchestrator/` **dir** | Clean boundary between orchestration and agent work; monorepo coherence |
| **Decomposed from start** | Real transport, real processes from day one; no "we'll extract later" risk |
| **Redis Streams** | Simplest reliable at-least-once transport; bus-client abstraction enables Kafka swap |
| **Clean Architecture per service** | Domain isolation; testability; infrastructure swappability |
| **Intent catalog (11 types)** | Explicit, auditable contract; no hidden channels; no direct service-to-service calls |
| **Serialized checkout lock** | Acceptable tradeoff — agent edits are bursty, not continuous; batching amortizes lock cost |
| **Backward intent on MBO miss** | Prevents silent passes; creates accountability loop back to the responsible phase |

---

*Architecture designed for extensibility — new services contribute intents and lifecycle phases without modifying the engine or other services. The intent catalog is the single extension point.*