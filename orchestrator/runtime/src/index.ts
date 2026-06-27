/**
 * runtime — agent session supervisor (ADR-0004: polling-agent model)
 * Port: :3100
 *
 * The real agent runtime. Subscribes to the bus, dequeues intents per instance,
 * feeds each into a /zo/ask turn as seed context.
 * Agents are stateless across turns; runtime holds all state.
 *
 * M2: subscribe to AgentAssigned + TaskCreated, emit Heartbeat,
 *      manage in-flight turns, seed context injection.
 */
import { createBusClient } from "@orchestrator/bus-client";
import type {
  AgentAssignedPayload,
  TaskCreatedPayload,
  TaskCompletedPayload,
  HeartbeatPayload,
} from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3100;
const SERVICE_NAME = "runtime";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS) || 30000;

console.log(`[${SERVICE_NAME}] booting on :${PORT} — polling-agent execution model (ADR-0004)`);

const bus = createBusClient({ url: REDIS_URL });

// In-flight turn tracking
interface InFlightTurn {
  instanceId: string;
  featureSlug: string;
  branch: string;
  taskId: string;
  startedAt: string;
  turnId: string;
  status: "running" | "completed" | "failed";
}

const inFlightTurns: Map<string, InFlightTurn> = new Map();

// Agent state tracking
interface AgentState {
  instanceId: string;
  personaHandle: string;
  featureSlug: string;
  branch: string;
  status: "idle" | "working" | "stalled";
  lastHeartbeatAt: string;
  activeTurns: number;
  pendingIntents: number;
}

const agentStates: Map<string, AgentState> = new Map();

// --- Intent handlers ---

async function handleAgentAssigned(payload: AgentAssignedPayload) {
  console.log(`[${SERVICE_NAME}] AgentAssigned: ${payload.instanceId} (${payload.personaHandle})`);

  // Register agent state
  agentStates.set(payload.instanceId, {
    instanceId: payload.instanceId,
    personaHandle: payload.personaHandle,
    featureSlug: payload.featureSlug,
    branch: payload.branch,
    status: "idle",
    lastHeartbeatAt: new Date().toISOString(),
    activeTurns: 0,
    pendingIntents: 0,
  });

  // Inject task payload as seed context (ADR-0004)
  console.log(`[${SERVICE_NAME}] Seed context prepared for ${payload.instanceId}:`, {
    taskId: payload.taskPayload.taskId,
    phase: payload.taskPayload.phase,
    description: payload.taskPayload.description,
  });

  // In production: invoke /zo/ask with seed context
  // For M2: log the seed context and mark agent as ready
}

async function handleTaskCreated(payload: TaskCreatedPayload) {
  console.log(`[${SERVICE_NAME}] TaskCreated: ${payload.taskId} → ${payload.assignedInstance}`);

  // Create in-flight turn
  const turnId = `turn-${payload.taskId}-${Date.now()}`;
  inFlightTurns.set(payload.taskId, {
    instanceId: payload.assignedInstance,
    featureSlug: payload.featureSlug,
    branch: `feature/${payload.featureSlug}`,
    taskId: payload.taskId,
    startedAt: new Date().toISOString(),
    turnId,
    status: "running",
  });

  // Update agent state
  const agent = agentStates.get(payload.assignedInstance);
  if (agent) {
    agent.status = "working";
    agent.activeTurns++;
  }

  // In production: invoke agent turn with task payload
  // For M2: simulate task completion after a delay
  setTimeout(async () => {
    await completeTask(payload.taskId, payload.assignedInstance);
  }, 2000);
}

async function completeTask(taskId: string, instanceId: string) {
  const turn = inFlightTurns.get(taskId);
  if (!turn) return;

  turn.status = "completed";

  // Update agent state
  const agent = agentStates.get(instanceId);
  if (agent) {
    agent.activeTurns = Math.max(0, agent.activeTurns - 1);
    if (agent.activeTurns === 0) agent.status = "idle";
  }

  // Emit TaskCompleted
  const completedPayload: TaskCompletedPayload = {
    taskId,
    instanceId,
    result: "done",
    artifacts: [],
  };

  await bus.publish("intents:task-completed", {
    type: "TaskCompleted",
    idempotencyKey: `task-completed-${taskId}`,
    featureSlug: turn.featureSlug,
    instanceId,
    branch: turn.branch,
    timestamp: new Date().toISOString(),
    payload: completedPayload,
  });

  console.log(`[${SERVICE_NAME}] TaskCompleted: ${taskId} by ${instanceId}`);
}

// --- Heartbeat loop ---

async function emitHeartbeats() {
  for (const [instanceId, agent] of agentStates) {
    const heartbeatPayload: HeartbeatPayload = {
      instanceId,
      turnId: `heartbeat-${Date.now()}`,
      load: {
        activeTurns: agent.activeTurns,
        pendingIntents: agent.pendingIntents,
        lastHeartbeatAgeMs: Date.now() - new Date(agent.lastHeartbeatAt).getTime(),
      },
    };

    agent.lastHeartbeatAt = new Date().toISOString();

    await bus.publish("intents:heartbeat", {
      type: "Heartbeat",
      idempotencyKey: `heartbeat-${instanceId}-${Date.now()}`,
      featureSlug: agent.featureSlug,
      instanceId,
      branch: agent.branch,
      timestamp: new Date().toISOString(),
      payload: heartbeatPayload,
    });
  }
}

setInterval(emitHeartbeats, HEARTBEAT_INTERVAL_MS);
console.log(`[${SERVICE_NAME}] Heartbeat loop running every ${HEARTBEAT_INTERVAL_MS}ms`);

// --- Start bus subscription ---

async function startBus() {
  await bus.connect();
  console.log(`[${SERVICE_NAME}] Connected to Redis`);

  await Promise.all([
    bus.subscribe("intents:agent-assigned", SERVICE_NAME, `${SERVICE_NAME}-1`, async (envelope) => {
      await handleAgentAssigned(envelope.payload as AgentAssignedPayload);
    }),
    bus.subscribe("intents:task-created", SERVICE_NAME, `${SERVICE_NAME}-2`, async (envelope) => {
      await handleTaskCreated(envelope.payload as TaskCreatedPayload);
    }),
  ]);
}

// --- HTTP API ---

async function getAgents(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let agents = Array.from(agentStates.values());
  if (status) agents = agents.filter(a => a.status === status);

  return Response.json({ agents, count: agents.length });
}

async function getTurns(req: Request): Promise<Response> {
  const turns = Array.from(inFlightTurns.values());
  return Response.json({ turns, count: turns.length });
}

// Start bus in background
startBus().catch(console.error);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/health") {
        const redisOk = await bus.ping();
        return Response.json({
          service: SERVICE_NAME,
          status: redisOk ? "ok" : "degraded",
          port: PORT,
          model: "polling-agent",
          agentsTracked: agentStates.size,
          inFlightTurns: inFlightTurns.size,
          redis: redisOk ? "connected" : "disconnected",
        });
      }

      if (url.pathname === "/agents" && req.method === "GET") {
        return getAgents(req);
      }

      if (url.pathname === "/turns" && req.method === "GET") {
        return getTurns(req);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
