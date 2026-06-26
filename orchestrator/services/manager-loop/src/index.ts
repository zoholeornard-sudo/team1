/**
 * manager-loop — bounded context service (ADR-0001, P1 of refinement plan)
 * Port: :3109
 *
 * Management turns: recurring coordination loop for managers.
 * - Reads agent-registry for stalled agents
 * - Monitors workflow task states
 * - Issues Reassign, ScopeChange, Escalate intents
 */
import {
  IntentType,
  ManagerHeartbeatPayload,
  ReassignTaskPayload,
  ScopeChangeRequestPayload,
} from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3109;
const SERVICE_NAME = "manager-loop";

// Configuration
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS) || 30000;
const STALL_THRESHOLD_MS = Number(process.env.STALL_THRESHOLD_MS) || 90000;
const MAX_PENDING_INTENTS = Number(process.env.MAX_PENDING_INTENTS) || 3;

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

// In-memory state (will be replaced with Redis in production)
interface AgentState {
  instanceId: string;
  featureSlug: string;
  lastHeartbeatAt: string;
  pendingIntents: number;
  activeTurns: number;
}

interface ManagerState {
  handle: string;
  units: string[];
  lastHeartbeatAt: string;
}

const agents: Map<string, AgentState> = new Map();
const managers: Map<string, ManagerState> = new Map();

// --- Intent emission (stub — will use Redis in production) ---

function emitIntent<T extends IntentType>(type: T, payload: any) {
  const envelope = {
    type,
    idempotencyKey: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    featureSlug: payload.featureSlug || "unknown",
    instanceId: payload.instanceId,
    branch: payload.branch || "main",
    timestamp: new Date().toISOString(),
    payload,
  };
  console.log(`[${SERVICE_NAME}] Emitting intent: ${type}`, JSON.stringify(envelope, null, 2));
  // TODO: Publish to Redis stream (intents:<type>)
  return envelope;
}

// --- Manager coordination loop ---

function runManagerLoop() {
  const now = Date.now();

  // Check for stalled agents
  const stalledAgents: Array<{ instanceId: string; lastHeartbeatAgeMs: number }> = [];

  for (const [instanceId, agent] of agents) {
    const lastHeartbeat = new Date(agent.lastHeartbeatAt).getTime();
    const age = now - lastHeartbeat;

    if (age > STALL_THRESHOLD_MS) {
      stalledAgents.push({ instanceId, lastHeartbeatAgeMs: age });

      // Auto-reassign if agent has pending intents
      if (agent.pendingIntents > 0) {
        console.log(`[${SERVICE_NAME}] Agent ${instanceId} stalled with ${agent.pendingIntents} pending intents`);

        // Find a task to reassign
        const reassignPayload: ReassignTaskPayload = {
          workflowId: `wf-${agent.featureSlug}`,
          taskId: `task-${agent.featureSlug}-pending`,
          fromInstance: instanceId,
          toInstance: `reassigned-${Date.now()}`,
          reason: `Agent stalled: no heartbeat for ${age}ms`,
        };

        emitIntent("ReassignTask", reassignPayload);
      }
    }

    // Check for excessive pending intent queue
    if (agent.pendingIntents > MAX_PENDING_INTENTS) {
      console.log(`[${SERVICE_NAME}] Agent ${instanceId} has ${agent.pendingIntents} pending intents (threshold: ${MAX_PENDING_INTENTS})`);

      const scopeChangePayload: ScopeChangeRequestPayload = {
        workflowId: `wf-${agent.featureSlug}`,
        requestedBy: "manager-loop",
        changeType: "remove_task",
        details: { instanceId, pendingCount: agent.pendingIntents },
      };

      emitIntent("ScopeChangeRequest", scopeChangePayload);
    }
  }

  // Emit manager heartbeat for each registered manager
  for (const [handle, manager] of managers) {
    const heartbeatPayload: ManagerHeartbeatPayload = {
      managerHandle: handle,
      timestamp: new Date().toISOString(),
      activeWorkflows: 0, // TODO: Query workflow service
      stalledAgents,
    };

    emitIntent("ManagerHeartbeat", heartbeatPayload);
  }

  if (stalledAgents.length > 0) {
    console.log(`[${SERVICE_NAME}] Manager loop complete: ${stalledAgents.length} stalled agents detected`);
  }
}

// --- HTTP API ---

async function registerManager(req: Request): Promise<Response> {
  const body = await req.json() as { handle: string; units: string[] };
  managers.set(body.handle, {
    handle: body.handle,
    units: body.units,
    lastHeartbeatAt: new Date().toISOString(),
  });
  return Response.json({ success: true, handle: body.handle, action: "registered" });
}

async function heartbeatAgent(req: Request): Promise<Response> {
  const body = await req.json() as {
    instanceId: string;
    featureSlug: string;
    pendingIntents: number;
    activeTurns: number;
  };

  agents.set(body.instanceId, {
    instanceId: body.instanceId,
    featureSlug: body.featureSlug,
    lastHeartbeatAt: new Date().toISOString(),
    pendingIntents: body.pendingIntents,
    activeTurns: body.activeTurns,
  });

  return Response.json({ success: true, instanceId: body.instanceId, action: "heartbeat_recorded" });
}

async function getAgents(req: Request): Promise<Response> {
  const agentList = Array.from(agents.values());
  return Response.json({ agents: agentList, count: agentList.length });
}

async function getManagers(req: Request): Promise<Response> {
  const managerList = Array.from(managers.values());
  return Response.json({ managers: managerList, count: managerList.length });
}

// Start coordination loop
setInterval(runManagerLoop, HEARTBEAT_INTERVAL_MS);
console.log(`[${SERVICE_NAME}] Manager loop running every ${HEARTBEAT_INTERVAL_MS}ms`);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/health") {
        return Response.json({
          service: SERVICE_NAME,
          status: "ok",
          port: PORT,
          agentsTracked: agents.size,
          managersRegistered: managers.size,
          heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
          stallThresholdMs: STALL_THRESHOLD_MS,
        });
      }

      if (url.pathname === "/manager" && req.method === "POST") {
        return registerManager(req);
      }

      if (url.pathname === "/manager" && req.method === "GET") {
        return getManagers(req);
      }

      if (url.pathname === "/agent/heartbeat" && req.method === "POST") {
        return heartbeatAgent(req);
      }

      if (url.pathname === "/agents" && req.method === "GET") {
        return getAgents(req);
      }

      if (url.pathname === "/loop/trigger" && req.method === "POST") {
        runManagerLoop();
        return Response.json({ success: true, message: "Loop triggered manually" });
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);