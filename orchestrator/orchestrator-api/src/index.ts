/**
 * orchestrator-api — REST entry point
 * Port: :3099
 *
 * Mints featureSlug (globally-unique kebab-case) at FeatureSubmitted time.
 * Emits FeatureSubmitted + SpawnAgents intents.
 *
 * M2: POST /features, POST /features/:slug/spawn
 */
import { createBusClient } from "@orchestrator/bus-client";
import type {
  FeatureSubmittedPayload,
  SpawnAgentsPayload,
  AgentAssignedPayload,
} from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3099;
const SERVICE_NAME = "orchestrator-api";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REPO_ROOT = process.env.REPO_ROOT || "/workspaces/team1";

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// In-memory feature registry
interface FeatureRecord {
  featureSlug: string;
  description: string;
  requestingManager: string;
  units: string[];
  status: "submitted" | "spawning" | "active" | "completed";
  instances: Array<{
    instanceId: string;
    personaHandle: string;
    branch: string;
    progressPath: string;
    status: string;
  }>;
  createdAt: string;
}

const features: Map<string, FeatureRecord> = new Map();

// Instance counter per persona
const instanceCounters: Map<string, number> = new Map();

// --- SQLite for feature dependencies (R3) ---
import { Database } from "bun:sqlite";
const DEP_DB_PATH = process.env.DEP_DB_PATH || "data/dependencies.db";
const depDb = new Database(DEP_DB_PATH, { create: true });
depDb.run("PRAGMA journal_mode = WAL");
depDb.run(`
  CREATE TABLE IF NOT EXISTS feature_dependencies (
    feature TEXT NOT NULL,
    depends_on_feature TEXT NOT NULL,
    declared_at TEXT NOT NULL,
    PRIMARY KEY (feature, depends_on_feature)
  )
`);

function getNextInstanceNumber(personaHandle: string): number {
  const current = instanceCounters.get(personaHandle) || 1;
  instanceCounters.set(personaHandle, current + 1);
  return current;
}

// --- API Handlers ---

async function submitFeature(req: Request): Promise<Response> {
  const body = await req.json() as {
    description: string;
    requestingManager: string;
    units: string[];
  };

  const featureSlug = `feature-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const feature: FeatureRecord = {
    featureSlug,
    description: body.description,
    requestingManager: body.requestingManager,
    units: body.units,
    status: "submitted",
    instances: [],
    createdAt: new Date().toISOString(),
  };

  features.set(featureSlug, feature);

  // Emit FeatureSubmitted intent
  const payload: FeatureSubmittedPayload = {
    featureSlug,
    description: body.description,
    requestingManager: body.requestingManager,
    units: body.units,
  };

  await bus.publish("intents:feature-submitted", {
    type: "FeatureSubmitted",
    idempotencyKey: `feature-submitted-${featureSlug}`,
    featureSlug,
    branch: "main",
    timestamp: new Date().toISOString(),
    payload,
  });

  return Response.json({
    featureSlug,
    status: "submitted",
    units: body.units,
  }, { status: 201 });
}

async function spawnAgents(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const featureSlug = parts[2];

  const feature = features.get(featureSlug);
  if (!feature) {
    return new Response("Feature not found", { status: 404 });
  }

  const body = await req.json() as {
    personaHandle: string;
    count: number;
    managerToken?: string;
  };

  // Manager authority check (M2 stub — in production, validate against agent-registry)
  if (!body.managerToken) {
    return Response.json({ error: "Unauthorized: Spawning requires Manager token" }, { status: 403 });
  }

  feature.status = "spawning";
  const spawned = [];

  for (let i = 0; i < body.count; i++) {
    const instanceNum = getNextInstanceNumber(body.personaHandle);
    const instanceId = `${body.personaHandle}-${instanceNum}`;
    const branch = `feature/${featureSlug}-${body.personaHandle.replace("@", "")}-${instanceNum}`;
    const progressPath = `00_workspace/working_files/progress/${body.personaHandle.replace("@", "")}-${instanceNum}-${new Date().toISOString().split("T")[0]}.md`;

    // Create instance record
    const instance = {
      instanceId,
      personaHandle: body.personaHandle,
      branch,
      progressPath,
      status: "launching",
    };

    feature.instances.push(instance);
    spawned.push(instance);

    // Emit SpawnAgents intent
    const spawnPayload: SpawnAgentsPayload = {
      featureSlug,
      personaHandle: body.personaHandle,
      count: 1,
      branchPrefix: `feature/${featureSlug}`,
    };

    await bus.publish("intents:spawn-agents", {
      type: "SpawnAgents",
      idempotencyKey: `spawn-${instanceId}-${Date.now()}`,
      featureSlug,
      instanceId,
      branch,
      timestamp: new Date().toISOString(),
      payload: spawnPayload,
    });

    // Emit AgentAssigned intent
    const assignedPayload: AgentAssignedPayload = {
      instanceId,
      personaHandle: body.personaHandle,
      featureSlug,
      branch,
      taskPayload: {
        taskId: `task-${featureSlug}-${instanceId}`,
        featureSlug,
        assignedInstance: instanceId,
        phase: "1",
        description: `Initial task for ${instanceId} on ${featureSlug}`,
        acceptanceCriteria: ["Complete initial setup"],
        mboMetrics: [],
      },
    };

    await bus.publish("intents:agent-assigned", {
      type: "AgentAssigned",
      idempotencyKey: `assigned-${instanceId}-${Date.now()}`,
      featureSlug,
      instanceId,
      branch,
      timestamp: new Date().toISOString(),
      payload: assignedPayload,
    });
  }

  feature.status = "active";

  return Response.json({
    featureSlug,
    status: "active",
    spawned,
    count: spawned.length,
  }, { status: 201 });
}

async function getFeatures(req: Request): Promise<Response> {
  const featureList = Array.from(features.values());
  return Response.json({ features: featureList, count: featureList.length });
}

async function getFeature(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const featureSlug = url.pathname.split("/")[2];

  const feature = features.get(featureSlug);
  if (!feature) {
    return new Response("Feature not found", { status: 404 });
  }

  return Response.json(feature);
}

// --- Start bus ---

async function startBus() {
  await bus.connect();
  console.log(`[${SERVICE_NAME}] Connected to Redis`);
}

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
          featuresTracked: features.size,
          redis: redisOk ? "connected" : "disconnected",
        });
      }

      // POST /features — submit a new feature
      if (url.pathname === "/features" && req.method === "POST") {
        return submitFeature(req);
      }

      // GET /features — list all features
      if (url.pathname === "/features" && req.method === "GET") {
        return getFeatures(req);
      }

      // POST /features/:slug/spawn — spawn agents for a feature
      if (url.pathname.match(/^\/features\/[^/]+\/spawn$/) && req.method === "POST") {
        return spawnAgents(req);
      }

      // GET /features/:slug — get feature details
      if (url.pathname.match(/^\/features\/[^/]+$/) && req.method === "GET") {
        return getFeature(req);
      }

      // POST /features/:slug/dependsOn/:otherSlug — declare dependency (R3)
      if (url.pathname.match(/^\/features\/[^/]+\/dependsOn\/[^/]+$/) && req.method === "POST") {
        const parts = url.pathname.split("/");
        const slug = parts[2];
        const otherSlug = parts[4];
        const body = await req.json() as { managerToken?: string };
        if (!body.managerToken) return Response.json({ error: "Manager token required" }, { status: 403 });
        const now = new Date().toISOString();
        depDb.run("INSERT OR REPLACE INTO feature_dependencies (feature, depends_on_feature, declared_at) VALUES (?, ?, ?)", [slug, otherSlug, now]);
        return Response.json({ success: true, feature: slug, dependsOn: otherSlug }, { status: 201 });
      }

      // GET /features/:slug/dependencies — list dependencies (R3)
      if (url.pathname.match(/^\/features\/[^/]+\/dependencies$/) && req.method === "GET") {
        const slug = url.pathname.split("/")[2];
        const deps = depDb.query("SELECT depends_on_feature, declared_at FROM feature_dependencies WHERE feature = ?").all(slug);
        return Response.json({ feature: slug, dependencies: deps, count: deps.length });
      }

      // GET /features/:slug/can-deploy — check if all deps passed Phase 7 (R3)
      if (url.pathname.match(/^\/features\/[^/]+\/can-deploy$/) && req.method === "GET") {
        const slug = url.pathname.split("/")[2];
        const deps = depDb.query("SELECT depends_on_feature FROM feature_dependencies WHERE feature = ?").all(slug) as any[];
        // In production: check lifecycle-management for each dep's Phase 7 status
        // For now: return true if no dependencies
        const canDeploy = deps.length === 0;
        return Response.json({ feature: slug, canDeploy, dependencies: deps.length });
      }

      // DELETE /features/:slug/dependsOn/:otherSlug — remove dependency (R3)
      if (url.pathname.match(/^\/features\/[^/]+\/dependsOn\/[^/]+$/) && req.method === "DELETE") {
        const parts = url.pathname.split("/");
        const slug = parts[2];
        const otherSlug = parts[4];
        depDb.run("DELETE FROM feature_dependencies WHERE feature = ? AND depends_on_feature = ?", [slug, otherSlug]);
        return Response.json({ success: true, feature: slug, removed: otherSlug });
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
