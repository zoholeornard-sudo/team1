/**
 * orchestrator-api — control plane (ADR-0001)
 * Port: :3098
 *
 * Milestone 2: POST /agents/spawn — creates distinct-handle instances,
 * git branches, progress files, and registry entries.
 */
import { BusClient } from "@team1/bus-client";
import { scrapeProgress } from "./history-scraper.js";


const PORT = Number(process.env.PORT) || 3098;
const SERVICE_NAME = "orchestrator-api";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REPO_ROOT = process.env.REPO_ROOT || "/home/workspace/projects/team1";
const REGISTRY_URL = process.env.REGISTRY_URL || "http://localhost:3106";
const PROGRESS_DIR = process.env.PROGRESS_DIR || "00_workspace/working_files/progress";

// --- Bus connection ---
let busConnected = false;
const bus = new BusClient({ redisUrl: REDIS_URL, serviceName: SERVICE_NAME });
bus.connect().then(() => {
  busConnected = true;
  console.log(`[${SERVICE_NAME}] connected to Redis bus`);
}).catch((err) => {
  console.warn(`[${SERVICE_NAME}] Redis bus connection failed (non-fatal):`, err?.message);
});

// --- Manager authority check ---
// Per §11.7 + designer3: Manager = agent whose skill file's "Reports To" field names a Manager role.
// For M2, we accept any x-manager-token header (M3 will validate against skill files).
function validateManagerAuth(req: Request): boolean {
  const token = req.headers.get("x-manager-token");
  if (!token) return false;
  return token.length > 0; // M2: any non-empty token accepted; M3 will validate properly
}

// --- Git helpers (shell out) ---
async function git(args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errText = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(" ")} failed: ${errText.trim()}`);
  }
  return output.trim();
}

// --- Progress file template ---
function generateProgressTemplate(handle: string, unit: string, featureSlug: string): string {
  const date = new Date().toISOString().split("T")[0];
  return `# Progress Report — ${handle}

| Field | Value |
|-------|-------|
| **Agent** | ${handle} |
| **Unit** | ${unit} |
| **Report Date** | ${date} |
| **Feature** | ${featureSlug} |
| **Lifecycle Phase** | Planning |
| **Manager** | _pending_ |

## Summary

_Instance spawned by orchestrator-api. Awaiting first task assignment._

## Planned gaps

_None declared yet._

## Activity log

| Time (UTC) | Action | Phase | Artifact(s) | Status |
|------------|--------|-------|-------------|--------|
| ${new Date().toISOString()} | Spawned by orchestrator | Planning | — | done |
`;
}

// --- Spawn flow ---
interface SpawnRequest {
  unit: string;
  personaHandle: string;
  capability: string;
  count: number;
  featureSlug: string;
  managerToken?: string;
}

interface SpawnedInstance {
  agentId: string;
  branch: string;
  progressPath: string;
  status: string;
}

async function spawnAgents(req: SpawnRequest): Promise<{ status: string; instances: SpawnedInstance[]; errors?: string[] }> {
  const errors: string[] = [];
  const instances: SpawnedInstance[] = [];

  for (let i = 2; i <= req.count + 1; i++) {
    const handle = `${req.personaHandle}-${i}`;
    const handleNoAt = handle.replace("@", "");
    const branch = `feature/${req.featureSlug}-${handleNoAt}`;
    const dateStr = new Date().toISOString().split("T")[0];
    const progressPath = `${PROGRESS_DIR}/${handleNoAt}-${dateStr}.md`;
    const fullProgressPath = `${REPO_ROOT}/${progressPath}`;

    try {
      // 1. Create git branch
      await git(["checkout", "-b", branch]);
      console.log(`[orchestrator-api] created branch: ${branch}`);

      // 2. Write progress file
      const content = generateProgressTemplate(handle, req.unit, req.featureSlug);
      await Bun.write(fullProgressPath, content);
      await git(["add", progressPath]);
      await git(["commit", "-m", `chore(orchestrator): initialize progress log for ${handle}`]);
      await git(["push", "origin", branch]);
      console.log(`[orchestrator-api] progress file committed: ${progressPath}`);

      // 3. Register in agent-registry
      const regResp = await fetch(`${REGISTRY_URL}/agents/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: handle,
          parentHandle: req.personaHandle,
          featureSlug: req.featureSlug,
          branch,
          progressPath,
          capability: req.capability,
        }),
      });
      if (!regResp.ok) {
        const errBody = await regResp.text();
        throw new Error(`Registry registration failed: ${errBody}`);
      }

      // 4. Emit SpawnAgents intent on bus
      if (busConnected) {
        await bus.publish("feature-lifecycle", {
          type: "SpawnAgents",
          idempotencyKey: crypto.randomUUID(),
          featureSlug: req.featureSlug,
          branch,
          timestamp: new Date().toISOString(),
          source: SERVICE_NAME,
          payload: {
            handle,
            parentHandle: req.personaHandle,
            branch,
            progressPath,
            capability: req.capability,
            unit: req.unit,
          },
        });
      }

      // 5. Switch back to main for next branch
      await git(["checkout", "main"]);

      instances.push({ agentId: handle, branch, progressPath, status: "launching" });
      console.log(`[orchestrator-api] spawned: ${handle} on ${branch}`);
    } catch (err: any) {
      errors.push(`${handle}: ${err.message}`);
      console.error(`[orchestrator-api] spawn failed for ${handle}:`, err.message);
      // Try to recover by switching back to main
      try { await git(["checkout", "main"]); } catch {}
    }
  }

  return {
    status: instances.length === req.count ? "spawned" : instances.length > 0 ? "partial" : "failed",
    instances,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// --- HTTP server ---
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Health
    if (path === "/healthz") {
      return Response.json({ status: "ok", service: SERVICE_NAME, port: PORT, busConnected });
    }
    if (path === "/readyz") {
      return Response.json({ ready: busConnected, service: SERVICE_NAME });
    }

    // POST /agents/spawn
    if (path === "/agents/spawn" && req.method === "POST") {
      if (!validateManagerAuth(req)) {
        return Response.json({ error: "Unauthorized: Spawning requires x-manager-token header" }, { status: 403 });
      }
      try {
        const body: SpawnRequest = await req.json();
        if (!body.personaHandle || !body.featureSlug || !body.count || !body.unit) {
          return Response.json({ error: "Missing required fields: unit, personaHandle, featureSlug, count" }, { status: 400 });
        }
        const result = await spawnAgents(body);
        const httpStatus = result.status === "spawned" ? 201 : result.status === "partial" ? 207 : 500;
        return Response.json(result, { status: httpStatus });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // GET /agents — proxy to agent-registry
    if (path === "/agents" && req.method === "GET") {
      const resp = await fetch(`${REGISTRY_URL}/agents`);
      return Response.json(await resp.json());
    }

    // POST /features/spec — Phase 1 spec-to-issue pipeline (Initiative 6, gstack /spec extraction)
    // Accepts a vague feature description; returns a structured scope doc.
    // The 5-phase process (understand → scope → interrogate code → quality-gate → file)
    // is executed by the PM Agent at runtime; this endpoint provides the structure.
    if (path === "/features/spec" && req.method === "POST") {
      if (!validateManagerAuth(req)) {
        return Response.json({ error: "Unauthorized: Spec requires x-manager-token header" }, { status: 403 });
      }
      try {
        const body = await req.json() as { description: string; unit: string; managerId: string };
        if (!body.description || !body.unit || !body.managerId) {
          return Response.json({ error: "Missing required fields: description, unit, managerId" }, { status: 400 });
        }

        // Mint a globally-unique featureSlug (designer3 §4)
        const featureSlug = body.description
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40) + "-" + crypto.randomUUID().slice(0, 8);

        const scopeDoc = {
          featureSlug,
          problemStatement: body.description,
          boundaries: { inScope: [], outOfScope: [] },
          acceptanceCriteria: [] as string[],
          nfrs: [] as string[],
          mboTargets: [] as { name: string; target: string }[],
          requestingManager: body.managerId,
          units: [body.unit],
          status: "spec-draft",
          createdAt: new Date().toISOString(),
        };

        // Emit FeatureSubmitted intent if bus is connected
        if (busConnected) {
          await bus.publish("feature-lifecycle", {
            type: "FeatureSubmitted",
            idempotencyKey: crypto.randomUUID(),
            featureSlug,
            branch: `feature/${featureSlug}`,
            timestamp: new Date().toISOString(),
            source: SERVICE_NAME,
            payload: {
              featureSlug,
              description: body.description,
              requestingManager: body.managerId,
              units: [body.unit],
              scopeDoc,
            },
          });
        }

        return Response.json({ status: "spec-created", featureSlug, scopeDoc }, { status: 201 });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // POST /features/:slug/dependsOn/:otherSlug (M5 — stub)
    const dependsMatch = path.match(/^\/features\/([^/]+)\/dependsOn\/([^/]+)$/);
    if (dependsMatch && req.method === "POST") {
      if (!validateManagerAuth(req)) {
        return Response.json({ error: "Unauthorized" }, { status: 403 });
      }
      return Response.json({
        status: "stub",
        message: "Multi-feature dependency declaration (M5) — not yet implemented",
        feature: dependsMatch[1],
        dependsOn: dependsMatch[2],
      });
    }


    // GET /history/:featureSlug — M6: history scraper
    const historyMatch = path.match(/^\/history\/([^/]+)$/);
    if (historyMatch && req.method === "GET") {
      const featureSlug = historyMatch[1];
      try {
        const result = await scrapeProgress(featureSlug, REPO_ROOT);
        return Response.json(result);
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // GET /history — all features (debug)
    if (path === "/history" && req.method === "GET") {
      return Response.json({ message: "Use /history/:featureSlug" }, { status: 400 });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);

process.on("SIGTERM", () => {
  console.log(`[${SERVICE_NAME}] shutting down`);
  server.stop();
  process.exit(0);
});
