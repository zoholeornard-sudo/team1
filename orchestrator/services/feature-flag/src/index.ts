/**
 * feature-flag — bounded context service
 * Port: :3113
 *
 * Manages feature flags for rollout control:
 * - Percentage gates (0-100% traffic)
 * - Cohort gates (internal, beta, public)
 * - Kill switches (boolean, default-on for safety)
 *
 * Subscribes to:
 * - intents:deploy-completed → sets initial flag state
 * - intents:rollback-triggered → activates kill switch
 * - intents:phase-gate-passed → advances percentage gate
 *
 * Publishes:
 * - intents:feature-flag-updated
 */
import { createBusClient } from "@orchestrator/bus-client";
import type {
  DeployCompletedPayload,
  RollbackTriggeredPayload,
  PhaseGatePassedPayload,
  FeatureFlagUpdatedPayload,
} from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3113;
const SERVICE_NAME = "feature-flag";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// --- Flag store ---

interface FeatureFlag {
  featureSlug: string;
  flagName: string;
  flagType: "percentage" | "cohort" | "kill_switch";
  value: string | number | boolean;
  updatedAt: string;
}

const flags: Map<string, FeatureFlag[]> = new Map();

async function emitFlagUpdate(flag: FeatureFlag) {
  const payload: FeatureFlagUpdatedPayload = {
    featureSlug: flag.featureSlug,
    flagName: flag.flagName,
    flagType: flag.flagType,
    value: flag.value,
  };

  await bus.publish("intents:feature-flag-updated", {
    type: "FeatureFlagUpdated",
    idempotencyKey: `flag-${flag.flagName}-${flag.featureSlug}-${Date.now()}`,
    featureSlug: flag.featureSlug,
    branch: `feature/${flag.featureSlug}`,
    timestamp: new Date().toISOString(),
    payload,
  });
}

// --- Intent handlers ---

async function handleDeployCompleted(payload: DeployCompletedPayload) {
  console.log(`[${SERVICE_NAME}] Deploy completed for ${payload.featureSlug}, mode: ${payload.rolloutMode}`);

  const initialFlags: FeatureFlag[] = [];

  // Percentage gate
  const pctValue = payload.rolloutMode === "full" ? 100 : payload.trafficPercentage;
  initialFlags.push({
    featureSlug: payload.featureSlug,
    flagName: "traffic-percentage",
    flagType: "percentage",
    value: pctValue,
    updatedAt: new Date().toISOString(),
  });

  // Kill switch (default-on for safety)
  initialFlags.push({
    featureSlug: payload.featureSlug,
    flagName: "kill-switch",
    flagType: "kill_switch",
    value: true,
    updatedAt: new Date().toISOString(),
  });

  // Cohort gate for beta mode
  if (payload.rolloutMode === "beta") {
    initialFlags.push({
      featureSlug: payload.featureSlug,
      flagName: "cohort-gate",
      flagType: "cohort",
      value: "internal",
      updatedAt: new Date().toISOString(),
    });
  }

  flags.set(payload.featureSlug, initialFlags);

  for (const flag of initialFlags) {
    await emitFlagUpdate(flag);
  }
}

async function handleRollbackTriggered(payload: RollbackTriggeredPayload) {
  console.log(`[${SERVICE_NAME}] Rollback triggered for ${payload.featureSlug}: ${payload.reason}`);

  const instanceFlags = flags.get(payload.featureSlug) || [];

  // Kill switch off = rollback to baseline
  const killSwitch = instanceFlags.find(f => f.flagName === "kill-switch");
  if (killSwitch) {
    killSwitch.value = false;
    killSwitch.updatedAt = new Date().toISOString();
    await emitFlagUpdate(killSwitch);
  }

  // Zero out traffic
  const trafficGate = instanceFlags.find(f => f.flagName === "traffic-percentage");
  if (trafficGate) {
    trafficGate.value = 0;
    trafficGate.updatedAt = new Date().toISOString();
    await emitFlagUpdate(trafficGate);
  }
}

async function handlePhaseGatePassed(payload: PhaseGatePassedPayload) {
  // Advance percentage gate on phased rollout
  const instanceFlags = flags.get(payload.featureSlug) || [];
  const trafficGate = instanceFlags.find(f => f.flagName === "traffic-percentage");

  if (trafficGate && typeof trafficGate.value === "number" && trafficGate.value < 100) {
    // Advance: 1 → 5 → 25 → 50 → 100
    const current = trafficGate.value;
    let next = 100;
    if (current === 1) next = 5;
    else if (current === 5) next = 25;
    else if (current === 25) next = 50;

    trafficGate.value = next;
    trafficGate.updatedAt = new Date().toISOString();
    await emitFlagUpdate(trafficGate);

    console.log(`[${SERVICE_NAME}] Traffic advanced: ${current}% → ${next}% for ${payload.featureSlug}`);
  }
}

// --- Start bus subscription ---

async function startBus() {
  await bus.connect();
  console.log(`[${SERVICE_NAME}] Connected to Redis`);

  await Promise.all([
    bus.subscribe("intents:deploy-completed", SERVICE_NAME, `${SERVICE_NAME}-1`, async (envelope) => {
      await handleDeployCompleted(envelope.payload as DeployCompletedPayload);
    }),
    bus.subscribe("intents:rollback-triggered", SERVICE_NAME, `${SERVICE_NAME}-2`, async (envelope) => {
      await handleRollbackTriggered(envelope.payload as RollbackTriggeredPayload);
    }),
    bus.subscribe("intents:phase-gate-passed", SERVICE_NAME, `${SERVICE_NAME}-3`, async (envelope) => {
      await handlePhaseGatePassed(envelope.payload as PhaseGatePassedPayload);
    }),
  ]);
}

// --- HTTP API ---

async function getFlags(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const featureSlug = url.searchParams.get("featureSlug");

  if (featureSlug) {
    return Response.json({ featureSlug, flags: flags.get(featureSlug) || [] });
  }

  const allFlags: FeatureFlag[] = [];
  for (const f of flags.values()) allFlags.push(...f);
  return Response.json({ flags: allFlags, count: allFlags.length });
}

async function updateFlag(req: Request): Promise<Response> {
  const body = await req.json() as FeatureFlag;
  const existing = flags.get(body.featureSlug) || [];
  const idx = existing.findIndex(f => f.flagName === body.flagName);

  const updated: FeatureFlag = { ...body, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    existing[idx] = updated;
  } else {
    existing.push(updated);
  }
  flags.set(body.featureSlug, existing);

  await emitFlagUpdate(updated);
  return Response.json({ success: true, flag: updated });
}

// Start bus in background
startBus().catch(console.error);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/health") {
        const totalFlags = Array.from(flags.values()).reduce((sum, f) => sum + f.length, 0);
        return Response.json({
          service: SERVICE_NAME,
          status: "ok",
          port: PORT,
          featuresTracked: flags.size,
          totalFlags,
        });
      }

      if (url.pathname === "/flags" && req.method === "GET") return getFlags(req);
      if (url.pathname === "/flags" && req.method === "POST") return updateFlag(req);

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
