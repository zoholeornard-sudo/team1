/**
 * event-coordination — bounded context service (ADR-0001)
 * Port: :3105
 *
 * Cross-service intent routing and validation.
 * Acts as the central event bus coordinator.
 *
 * Subscribes to: all intents (validation + routing)
 * Publishes: validated intents to appropriate streams
 */
import { createBusClient } from "@orchestrator/bus-client";
import { IntentEnvelope, IntentType } from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3105;
const SERVICE_NAME = "event-coordination";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// Intent routing table: intent type → target stream
const ROUTING_TABLE: Record<string, string> = {
  "FeatureSubmitted": "intents:feature-submitted",
  "SpawnAgents": "intents:spawn-agents",
  "AgentAssigned": "intents:agent-assigned",
  "SessionStarted": "intents:session-started",
  "ReapInstance": "intents:reap-instance",
  "TaskCreated": "intents:task-created",
  "TaskCompleted": "intents:task-completed",
  "EditIntent": "intents:edit-intent",
  "AcquireCheckout": "intents:acquire-checkout",
  "EditApplied": "intents:edit-applied",
  "CheckoutDenied": "intents:checkout-denied",
  "PhaseGateCheck": "intents:phase-gate-check",
  "PhaseGatePassed": "intents:phase-gate-passed",
  "PhaseGateFailed": "intents:phase-gate-failed",
  "Heartbeat": "intents:heartbeat",
  "InstanceStalled": "intents:instance-stalled",
  "MergeConflictDetected": "intents:merge-conflict-detected",
  "WorkflowCreated": "intents:workflow-created",
  "WorkflowTaskStateChanged": "intents:workflow-task-state-changed",
  "ManagerHeartbeat": "intents:manager-heartbeat",
  "ReassignTask": "intents:reassign-task",
  "ScopeChangeRequest": "intents:scope-change-request",
  "ReviewRequested": "intents:review-requested",
  "ReviewReport": "intents:review-report",
  "ConflictDetected": "intents:conflict-detected",
  "BackupAgentSpawned": "intents:backup-agent-spawned",
  "MetricAlert": "intents:metric-alert",
  "DeadLetter": "intents:dead-letter",
};

// Metrics
let messagesProcessed = 0;
let messagesRejected = 0;

// --- Intent validation and routing ---

async function validateAndRoute<T extends IntentType>(envelope: IntentEnvelope<T, any>) {
  messagesProcessed++;

  // Validate envelope
  if (!envelope.type || !envelope.idempotencyKey || !envelope.featureSlug) {
    console.warn(`[${SERVICE_NAME}] Invalid envelope: missing required fields`);
    messagesRejected++;

    // Route to dead letter
    await bus.publish("intents:dead-letter", {
      type: "DeadLetter",
      idempotencyKey: `dead-letter-${Date.now()}`,
      featureSlug: envelope.featureSlug || "unknown",
      timestamp: new Date().toISOString(),
      payload: {
        originalIntentType: envelope.type,
        originalIdempotencyKey: envelope.idempotencyKey,
        error: "Invalid envelope: missing required fields",
        failedAt: new Date().toISOString(),
      },
    });
    return;
  }

  // Route to appropriate stream
  const targetStream = ROUTING_TABLE[envelope.type];
  if (!targetStream) {
    console.warn(`[${SERVICE_NAME}] No route for intent type: ${envelope.type}`);
    messagesRejected++;
    return;
  }

  await bus.publish(targetStream, envelope);
}

// --- Start bus subscription (subscribe to all intent streams) ---

async function startBus() {
  await bus.connect();
  console.log(`[${SERVICE_NAME}] Connected to Redis`);

  // Subscribe to orchestration intents for routing
  const streams = Object.values(ROUTING_TABLE);

  // Subscribe to a wildcard pattern for all intents
  for (const stream of streams) {
    bus.subscribe(stream, SERVICE_NAME, `${SERVICE_NAME}-1`, async (envelope) => {
      await validateAndRoute(envelope);
    }).catch(err => {
      console.error(`[${SERVICE_NAME}] Failed to subscribe to ${stream}:`, err);
    });
  }

  console.log(`[${SERVICE_NAME}] Subscribed to ${streams.length} intent streams`);
}

// --- HTTP API ---

async function getMetrics(req: Request): Promise<Response> {
  return Response.json({
    service: SERVICE_NAME,
    messagesProcessed,
    messagesRejected,
    rejectionRate: messagesProcessed > 0 ? (messagesRejected / messagesProcessed * 100).toFixed(2) + "%" : "0%",
    routingTableSize: Object.keys(ROUTING_TABLE).length,
  });
}

async function getRoutingTable(req: Request): Promise<Response> {
  return Response.json({ routingTable: ROUTING_TABLE });
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
          messagesProcessed,
          messagesRejected,
          redis: redisOk ? "connected" : "disconnected",
        });
      }

      if (url.pathname === "/metrics" && req.method === "GET") {
        return getMetrics(req);
      }

      if (url.pathname === "/routing" && req.method === "GET") {
        return getRoutingTable(req);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
