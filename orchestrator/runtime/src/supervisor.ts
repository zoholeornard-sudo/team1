/**
 * runtime — RuntimeSupervisor (ADR-0004: polling-agent execution model)
 *
 * The stateful bridge between the intent bus and /zo/ask agent turns.
 *
 * Responsibilities:
 *  1. Subscribe to the bus (AgentAssigned, TaskCreated, CheckoutDenied, EditApplied,
 *     ReapInstance, InstanceStalled, PhaseGateFailed).
 *  2. For each AgentAssigned: assemble seed context (skill file + MBO + phase + task +
 *     prior checkpoint), emit SessionStarted, call /zo/ask, emit Heartbeat every 30s.
 *  3. On agent return: parse the return-value contract, publish emitted intents
 *     (including lifecycle-loop intents: PhaseReviewScore, DeployVerified, etc.),
 *     save a context checkpoint, emit TaskCompleted when the task is done.
 *  4. Handle inbound feedback: CheckoutDenied → retry, ReapInstance → final turn,
 *     EditApplied → acknowledge, InstanceStalled → log.
 *
 * Agents never touch Redis. The supervisor owns the turn boundary and all bus I/O.
 */
import { v4 as uuid } from "uuid";
import type {
  AgentAssigned,
  TaskCreated,
  TaskCompleted,
  SessionStarted,
  Heartbeat,
  AcquireCheckout,
  IntentEnvelope,
  IntentType,
  TaskCreatedPayload,
  ContextCheckpoint,
  ReapInstance,
  CheckoutDenied as CheckoutDeniedIntent,
  EditApplied as EditAppliedIntent,
  InstanceStalled as InstanceStalledIntent,
} from "@team1/contracts";
import { BusClient } from "@team1/bus-client";

import { buildSeedContext } from "./seed-context.js";
import { parseReturnValue, wrapIntent } from "./return-value.js";
import {
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
  initCheckpointStore,
} from "./context-checkpoint.js";
import {
  CONSUMER_GROUP,
  HEARTBEAT_INTERVAL_MS,
  ZO_ASK_MODEL,
} from "./config.js";

/** Injectable /zo/ask function — the real one calls the API; tests pass a mock. */
export type ZoAskFn = (input: string, opts?: {
  conversationId?: string;
  signal?: AbortSignal;
}) => Promise<string>;

interface InFlightTurn {
  instanceId: string;
  featureSlug: string;
  branch: string;
  personaHandle: string;
  taskPayload: TaskCreatedPayload;
  turnId: string;
  conversationId?: string;
  abort: AbortController;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  startedAt: number;
}

/** Streams the runtime consumes from (per bus-client STREAM_MAP). */
const CONSUME_STREAMS = [
  "feature-lifecycle", // AgentAssigned, ReapInstance
  "task-lifecycle", // TaskCreated
  "edit-coordination", // CheckoutDenied, EditApplied
  "lifecycle-gating", // PhaseGateFailed
  "health-monitoring", // InstanceStalled
] as const;

export class RuntimeSupervisor {
  private bus: BusClient;
  private zoAsk: ZoAskFn;
  private inFlight = new Map<string, InFlightTurn>();
  private running = false;
  private consumeAbort = new AbortController();

  constructor(bus: BusClient, zoAsk: ZoAskFn) {
    this.bus = bus;
    this.zoAsk = zoAsk;
  }

  /** Boot: connect bus, ensure consumer groups, init checkpoint store, start consuming. */
  async start(): Promise<void> {
    initCheckpointStore();
    await this.bus.connect();

    for (const stream of CONSUME_STREAMS) {
      await this.bus.ensureConsumerGroup(stream, CONSUMER_GROUP);
    }

    this.running = true;
    this.consumeAbort = new AbortController();

    // Spawn a consume loop per stream
    for (const stream of CONSUME_STREAMS) {
      this.consumeLoop(stream).catch((err) =>
        console.error(`[runtime] consume loop for ${stream} crashed:`, err)
      );
    }

    console.log("[runtime] supervisor started — consuming 5 streams");
  }

  /** Graceful shutdown: stop consuming, abort in-flight turns, disconnect. */
  async stop(): Promise<void> {
    this.running = false;
    this.consumeAbort.abort();

    for (const turn of this.inFlight.values()) {
      turn.abort.abort();
      if (turn.heartbeatTimer) clearInterval(turn.heartbeatTimer);
    }
    this.inFlight.clear();
    await this.bus.disconnect();
    console.log("[runtime] supervisor stopped");
  }

  // --- Consume loop ---

  private async consumeLoop(stream: string): Promise<void> {
    while (this.running) {
      try {
        for await (const [intentId, intent] of this.bus.consume(stream, CONSUMER_GROUP)) {
          if (!this.running) break;
          await this.routeIntent(intent as IntentEnvelope<any>).catch((err) =>
            console.error(`[runtime] error handling ${intent.type} on ${stream}:`, err)
          );
          await this.bus.ack(stream, CONSUMER_GROUP, intentId);
        }
      } catch (err) {
        if (!this.running) break;
        console.error(`[runtime] consume loop ${stream} error:`, err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  // --- Intent routing ---

  private async routeIntent(intent: IntentEnvelope<any>): Promise<void> {
    switch (intent.type) {
      case "AgentAssigned":
        await this.handleAgentAssigned(intent as AgentAssigned);
        break;
      case "TaskCreated":
        await this.handleTaskCreated(intent as TaskCreated);
        break;
      case "CheckoutDenied":
        await this.handleCheckoutDenied(intent as CheckoutDeniedIntent);
        break;
      case "EditApplied":
        await this.handleEditApplied(intent as EditAppliedIntent);
        break;
      case "ReapInstance":
        await this.handleReapInstance(intent as ReapInstance);
        break;
      case "InstanceStalled":
        await this.handleInstanceStalled(intent as InstanceStalledIntent);
        break;
      case "PhaseGateFailed":
        console.log(`[runtime] PhaseGateFailed for ${intent.featureSlug} phase ${intent.payload.phase} — agent will be re-entered by task-management`);
        break;
      default:
        // Not an intent the runtime acts on (e.g. our own published intents echoing back)
        break;
    }
  }

  // --- Turn execution ---

  /** Start a new turn for an agent assignment. */
  private async handleAgentAssigned(assignment: AgentAssigned): Promise<void> {
    const { instanceId, personaHandle, branch, taskPayload } = assignment.payload;
    const featureSlug = assignment.featureSlug;

    if (this.inFlight.has(instanceId)) {
      console.warn(`[runtime] AgentAssigned for ${instanceId} but a turn is already in flight — ignoring duplicate`);
      return;
    }

    const priorCheckpoint = loadCheckpoint(instanceId);
    const seed = buildSeedContext({ assignment, task: null, priorCheckpoint });

    await this.executeTurn(assignment, taskPayload, seed, priorCheckpoint);
  }

  /** A new task for an existing instance (subsequent turn). */
  private async handleTaskCreated(task: TaskCreated): Promise<void> {
    const { assignedInstance: instanceId } = task.payload;
    const featureSlug = task.featureSlug;
    const branch = task.branch;

    if (this.inFlight.has(instanceId)) {
      console.log(`[runtime] TaskCreated for ${instanceId} while in flight — queueing not yet implemented; will pick up after current turn`);
      return;
    }

    // Synthesize a minimal assignment envelope for seed-context building
    const syntheticAssignment: AgentAssigned = {
      ...task,
      type: "AgentAssigned",
      payload: {
        instanceId,
        personaHandle: (task.payload as any).personaHandle ?? "unknown",
        featureSlug,
        branch,
        taskPayload: task.payload,
      },
    } as AgentAssigned;

    const priorCheckpoint = loadCheckpoint(instanceId);
    const seed = buildSeedContext({ assignment: syntheticAssignment, task, priorCheckpoint });
    await this.executeTurn(syntheticAssignment, task.payload, seed, priorCheckpoint);
  }

  /** Core turn execution: SessionStarted → heartbeat → /zo/ask → parse → emit → checkpoint → TaskCompleted. */
  private async executeTurn(
    assignment: AgentAssigned,
    taskPayload: TaskCreatedPayload,
    seed: ReturnType<typeof buildSeedContext>,
    priorCheckpoint: ContextCheckpoint | null
  ): Promise<void> {
    const { instanceId, branch, featureSlug, personaHandle } = seed;
    const turnId = `turn-${instanceId}-${uuid().slice(0, 8)}`;
    const abort = new AbortController();

    const turn: InFlightTurn = {
      instanceId,
      featureSlug,
      branch,
      personaHandle,
      taskPayload,
      turnId,
      abort,
      heartbeatTimer: null,
      startedAt: Date.now(),
    };
    this.inFlight.set(instanceId, turn);

    // 1. Emit SessionStarted
    await this.publishIntent("SessionStarted", {
      instanceId,
      branch,
      seedContext: { taskPayload, phase: taskPayload.phase, priorCheckpoint: priorCheckpoint ?? undefined },
      priorCheckpoint: priorCheckpoint ?? undefined,
    }, featureSlug, branch, instanceId);

    // 2. Start heartbeat
    turn.heartbeatTimer = setInterval(() => this.emitHeartbeat(turn), HEARTBEAT_INTERVAL_MS);
    this.emitHeartbeat(turn); // immediate first beat

    // 3. Call /zo/ask
    let rawResponse: string;
    try {
      rawResponse = await this.zoAsk(seed.prompt, {
        conversationId: seed.conversationId,
        signal: abort.signal,
      });
    } catch (err: any) {
      if (abort.signal.aborted) {
        console.log(`[runtime] turn ${turnId} aborted for ${instanceId}`);
      } else {
        console.error(`[runtime] /zo/ask failed for ${instanceId}:`, err);
      }
      this.endTurn(instanceId);
      return;
    }

    // 4. Parse return value
    const parsed = parseReturnValue(rawResponse);
    if (parsed.progressNote) {
      console.log(`[runtime] ${personaHandle} (${instanceId}) turn ${turnId}: ${parsed.progressNote}`);
    }

    // 5. Publish emitted intents (the lifecycle-loop intents flow through here)
    for (const directive of parsed.emit) {
      const envelope = wrapIntent(directive, featureSlug, branch, instanceId);
      await this.bus.publish(envelope).catch((err) =>
        console.error(`[runtime] failed to publish ${directive.type} for ${instanceId}:`, err)
      );
      console.log(`[runtime] published ${directive.type} for ${instanceId} (phase: ${taskPayload.phase})`);
    }

    // 6. Save checkpoint
    if (parsed.checkpoint) {
      saveCheckpoint(instanceId, { ...parsed.checkpoint, lastTurnId: turnId });
    }

    // 7. Emit TaskCompleted if the agent declared a result
    if (parsed.result) {
      await this.publishIntent("TaskCompleted", {
        taskId: taskPayload.taskId,
        instanceId,
        result: parsed.result,
        artifacts: parsed.emit
          .filter((e) => e.type === "EditIntent" || e.type === "AcquireCheckout")
          .flatMap((e) => (Array.isArray((e.payload as any).batch) ? (e.payload as any).batch : [e.payload]))
          .map((p: any) => ({ id: uuid(), path: p.path ?? "", type: p.op ?? "update" })),
      }, featureSlug, branch, instanceId);
    }

    this.endTurn(instanceId);
  }

  private endTurn(instanceId: string): void {
    const turn = this.inFlight.get(instanceId);
    if (turn?.heartbeatTimer) clearInterval(turn.heartbeatTimer);
    this.inFlight.delete(instanceId);
  }

  // --- Heartbeat ---

  private async emitHeartbeat(turn: InFlightTurn): Promise<void> {
    await this.publishIntent("Heartbeat", {
      instanceId: turn.instanceId,
      turnId: turn.turnId,
      load: {
        activeTurns: this.inFlight.size,
        pendingIntents: 0,
        lastHeartbeatAgeMs: Date.now() - turn.startedAt,
      },
    }, turn.featureSlug, turn.branch, turn.instanceId).catch(() => {});
  }

  // --- Inbound feedback handlers ---

  /** Checkout denied (lock busy or out-of-scope) → re-enter the agent after retryAfterMs. */
  private async handleCheckoutDenied(intent: CheckoutDeniedIntent): Promise<void> {
    const { instanceId, retryAfterMs } = intent.payload;
    const turn = this.inFlight.get(instanceId);
    if (!turn) {
      console.log(`[runtime] CheckoutDenied for ${instanceId} but no in-flight turn — stale, ignoring`);
      return;
    }
    console.log(`[runtime] CheckoutDenied for ${instanceId} — retrying in ${retryAfterMs}ms`);
    // The current turn is done (the agent already returned its AcquireCheckout which was denied).
    // Re-enter with a new turn that tells the agent the checkout was denied.
    this.endTurn(instanceId);
    setTimeout(() => {
      this.reenterTurn(instanceId, "Your AcquireCheckout was denied. The edit-coordinator said: retry shortly. Re-issue your batch when ready.").catch((err) =>
        console.error(`[runtime] reenter after CheckoutDenied failed for ${instanceId}:`, err)
      );
    }, Math.min(retryAfterMs || 5000, 30000));
  }

  /** Edit applied — the batch landed. Log it; task-management will issue the next TaskCreated. */
  private async handleEditApplied(intent: EditAppliedIntent): Promise<void> {
    console.log(`[runtime] EditApplied for ${intent.payload.instanceId}: ${intent.payload.appliedCount} edits committed at ${intent.payload.commitSha}`);
  }

  /** Reap — give the agent a final turn to commit its retro, then clear checkpoint. */
  private async handleReapInstance(intent: ReapInstance): Promise<void> {
    const { instanceId, reason } = intent.payload;
    console.log(`[runtime] ReapInstance for ${instanceId} (reason: ${reason})`);

    if (reason === "stalled") {
      // No final turn for stalled agents — just clean up
      this.endTurn(instanceId);
      clearCheckpoint(instanceId);
      return;
    }

    // phase-complete or manager-cancel: give a final retro turn
    await this.reenterTurn(
      instanceId,
      "You are being reaped — this is your FINAL turn. Commit your retrospective EditIntent{op=progress} now. Summarize what you accomplished, what's incomplete, and learnings for the next instance."
    ).catch((err) => console.error(`[runtime] final retro turn failed for ${instanceId}:`, err));

    clearCheckpoint(instanceId);
  }

  /** Instance stalled — health-monitoring detected 3 missed heartbeats. Abort the turn. */
  private async handleInstanceStalled(intent: InstanceStalledIntent): Promise<void> {
    const { instanceId } = intent.payload;
    console.warn(`[runtime] InstanceStalled for ${instanceId} — aborting in-flight turn`);
    const turn = this.inFlight.get(instanceId);
    if (turn) turn.abort.abort();
  }

  // --- Helpers ---

  /** Re-enter an agent with a follow-up message (uses the last-known assignment state). */
  private async reenterTurn(instanceId: string, followUp: string): Promise<void> {
    // In a full implementation, we'd reconstruct the assignment from the registry.
    // For now, this is a placeholder for the re-enter path — the prior checkpoint
    // is the primary resume mechanism (ADR-0004 + Initiative 4).
    console.log(`[runtime] reenter requested for ${instanceId}: ${followUp.slice(0, 80)}...`);
    // TODO(M2+): reconstruct assignment from agent-registry and call executeTurn.
  }

  /** Publish a typed intent envelope. */
  private async publishIntent<T extends IntentType>(
    type: T,
    payload: any,
    featureSlug: string,
    branch: string,
    instanceId: string
  ): Promise<void> {
    const envelope: IntentEnvelope<T> = {
      type,
      idempotencyKey: `${type}-${featureSlug}-${instanceId}-${uuid()}`,
      featureSlug,
      branch,
      instanceId,
      timestamp: new Date().toISOString(),
      payload,
    };
    await this.bus.publish(envelope);
  }

  /** Get the number of currently in-flight turns (for /health). */
  getInFlightCount(): number {
    return this.inFlight.size;
  }
}
