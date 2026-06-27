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

    // Create git branch and progress log file
    try {
      const proc = Bun.spawn(["git", "checkout", "-b", branch], {
        cwd: REPO_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;

      // Write initial progress log
      const progressContent = `# Progress Log: ${instanceId}\n\nFeature: ${featureSlug}\nBranch: ${branch}\nStatus: launching\nCreated: ${new Date().toISOString()}\n`;
      await Bun.write(`${REPO_ROOT}/${progressPath}`, progressContent);

      // Commit and push
      const addProc = Bun.spawn(["git", "add", progressPath], { cwd: REPO_ROOT });
      await addProc.exited;
      const commitProc = Bun.spawn(["git", "commit", "-m", `chore(orchestrator): initialize progress log for ${instanceId}`], { cwd: REPO_ROOT });
      await commitProc.exited;
      const pushProc = Bun.spawn(["git", "push", "origin", branch], { cwd: REPO_ROOT });
      await pushProc.exited;
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Git setup failed for ${instanceId}:`, err);
    }

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

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
