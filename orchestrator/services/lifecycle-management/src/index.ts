/**
 * lifecycle-management — bounded context service (ADR-0001)
 * Port: :3104
 *
 * Subscribes to:
 * - intents:phase-gate-check → evaluates gate criteria
 * - intents:phase-gate-passed → advances phase
 * - intents:phase-gate-failed → triggers backtrack
 *
 * Publishes:
 * - intents:phase-gate-passed
 * - intents:phase-gate-failed
 * - intents:phase-escalation (after 3 backtracks)
 *
 * Implements dual-gate lifecycle gating with MBO.
 */
import { createBusClient } from "@orchestrator/bus-client";
import { PhaseGateCheckPayload, PhaseGateResultPayload } from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3104;
const SERVICE_NAME = "lifecycle-management";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// In-memory lifecycle state
interface PhaseGateRecord {
  featureSlug: string;
  phase: number;
  artifactPassed: boolean;
  mboPassed: boolean;
  gapDeclared: boolean;
  backtrackCount: number;
  lastCheckedAt: string;
}

const phaseGates: Map<string, PhaseGateRecord> = new Map();

// --- Intent handlers ---

async function handlePhaseGateCheck(payload: PhaseGateCheckPayload) {
  console.log(`[${SERVICE_NAME}] Phase gate check: ${payload.featureSlug} phase ${payload.phase}`);

  const key = `${payload.featureSlug}-${payload.phase}`;
  const existing = phaseGates.get(key) || {
    featureSlug: payload.featureSlug,
    phase: payload.phase,
    artifactPassed: false,
    mboPassed: false,
    gapDeclared: false,
    backtrackCount: 0,
    lastCheckedAt: new Date().toISOString(),
  };

  // Evaluate gates
  const artifactOk = payload.artifactsProduced.length > 0;
  const mboOk = payload.mboMetrics.every(m => m.onTarget);
  const gapOk = payload.plannedGaps.length > 0;

  existing.artifactPassed = artifactOk;
  existing.mboPassed = mboOk;
  existing.gapDeclared = gapOk;
  existing.lastCheckedAt = new Date().toISOString();

  const bothPassed = artifactOk && (mboOk || gapOk);

  phaseGates.set(key, existing);

  const resultPayload: PhaseGateResultPayload = {
    featureSlug: payload.featureSlug,
    phase: payload.phase,
    passed: bothPassed,
    reason: bothPassed
      ? "Both gates passed"
      : `Artifact: ${artifactOk}, MBO: ${mboOk}, Gap: ${gapOk}`,
  };

  if (bothPassed) {
    // Advance phase
    await bus.publish("intents:phase-gate-passed", {
      type: "PhaseGatePassed",
      idempotencyKey: `gate-passed-${key}-${Date.now()}`,
      featureSlug: payload.featureSlug,
      branch: `feature/${payload.featureSlug}`,
      timestamp: new Date().toISOString(),
      payload: resultPayload,
    });
  } else {
    // Check backtrack limit
    if (existing.backtrackCount >= 3) {
      // Emit escalation instead of backtrack
      await bus.publish("intents:phase-escalation", {
        type: "PhaseEscalation",
        idempotencyKey: `escalation-${key}-${Date.now()}`,
        featureSlug: payload.featureSlug,
        branch: `feature/${payload.featureSlug}`,
        timestamp: new Date().toISOString(),
        payload: {
          featureSlug: payload.featureSlug,
          phase: payload.phase,
          backtrackCount: existing.backtrackCount,
          reason: "Backtrack limit exceeded (3 attempts)",
          managerOptions: ["accept_planned_gap", "extend_deadline", "kill_feature"],
        },
      });
    } else {
      // Increment backtrack and emit failure
      existing.backtrackCount++;
      phaseGates.set(key, existing);

      await bus.publish("intents:phase-gate-failed", {
        type: "PhaseGateFailed",
        idempotencyKey: `gate-failed-${key}-${Date.now()}`,
        featureSlug: payload.featureSlug,
        branch: `feature/${payload.featureSlug}`,
        timestamp: new Date().toISOString(),
        payload: resultPayload,
      });
    }
  }
}

// --- Start bus subscription ---

async function startBus() {
  await bus.connect();
  console.log(`[${SERVICE_NAME}] Connected to Redis`);

  await bus.subscribe("intents:phase-gate-check", SERVICE_NAME, `${SERVICE_NAME}-1`, async (envelope) => {
    await handlePhaseGateCheck(envelope.payload as PhaseGateCheckPayload);
  });
}

// --- HTTP API ---

async function getPhaseGates(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const featureSlug = url.searchParams.get("featureSlug");

  let gates = Array.from(phaseGates.values());
  if (featureSlug) gates = gates.filter(g => g.featureSlug === featureSlug);

  return Response.json({ phaseGates: gates, count: gates.length });
}

async function submitGateCheck(req: Request): Promise<Response> {
  const body = await req.json() as PhaseGateCheckPayload;
  await handlePhaseGateCheck(body);
  return Response.json({ success: true, featureSlug: body.featureSlug, phase: body.phase });
}

// Start HTTP server first so /health responds before the blocking subscribe loop starts.
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
          gatesTracked: phaseGates.size,
          redis: redisOk ? "connected" : "disconnected",
        });
      }

      if (url.pathname === "/gates" && req.method === "GET") {
        return getPhaseGates(req);
      }

      if (url.pathname === "/gate/check" && req.method === "POST") {
        return submitGateCheck(req);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);

// Start bus subscriptions after the HTTP server is listening.
startBus().catch(console.error);
