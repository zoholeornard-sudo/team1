/**
 * lifecycle-management — bounded context service (ADR-0001)
 * Port: :3104
 *
 * Milestone 4: phase gate enforcement via gate-evaluator.
 * Consumes PhaseGateCheck, runs evaluateGate, emits PhaseGatePassed/Failed.
 */
import { BusClient } from "@team1/bus-client";
import { evaluateGate, type GateEvaluation } from "./gate-evaluator.js";
import { MergeCoordinator } from "./merge-coordinator.js";

const PORT = Number(process.env.PORT) || 3104;
const SERVICE_NAME = "lifecycle-management";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let busConnected = false;
let bootTime = Date.now();

const bus = new BusClient({ redisUrl: REDIS_URL, serviceName: SERVICE_NAME });
bus.connect().then(() => {
  busConnected = true;
  console.log(`[${SERVICE_NAME}] connected to Redis bus`);
}).catch((err) => {
  console.warn(`[${SERVICE_NAME}] Redis bus connection failed (non-fatal):`, err?.message);
});

// --- In-memory phase state (M4; SQLite in M5) ---
interface PhaseState {
  featureSlug: string;
  currentPhase: string;
  history: { phase: string; verdict: string; timestamp: string }[];
}

const phaseStates = new Map<string, PhaseState>();
const mergeCoordinator = new MergeCoordinator(phaseStates);

const PHASE_ORDER = ["1", "2", "3", "4", "5", "6", "7"];

function nextPhase(current: string): string | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

// --- HTTP server ---
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/healthz") {
      return Response.json({
        status: "ok",
        service: SERVICE_NAME,
        port: PORT,
        busConnected,
        uptime: Date.now() - bootTime,
      });
    }

    if (path === "/readyz") {
      return Response.json({ ready: busConnected, service: SERVICE_NAME });
    }

    // GET /phase/:featureSlug — current phase state
    const stateMatch = path.match(/^\/phase\/([^/]+)$/);
    if (stateMatch && req.method === "GET") {
      const slug = stateMatch[1];
      const state = phaseStates.get(slug);
      if (!state) {
        return Response.json({ error: "Feature not found", featureSlug: slug }, { status: 404 });
      }
      return Response.json(state);
    }

    // POST /phase/gate-check — evaluate a phase gate
    if (path === "/phase/gate-check" && req.method === "POST") {
      try {
        const body = await req.json();
        const { check, lensScores } = body;

        if (!check || !check.featureSlug || !check.phase) {
          return Response.json({ error: "Missing required fields: check.featureSlug, check.phase" }, { status: 400 });
        }

        const result = evaluateGate(check, lensScores || []);

        // Update phase state
        let state = phaseStates.get(check.featureSlug);
        if (!state) {
          state = { featureSlug: check.featureSlug, currentPhase: check.phase, history: [] };
          phaseStates.set(check.featureSlug, state);
        }
        state.history.push({
          phase: check.phase,
          verdict: result.verdict,
          timestamp: new Date().toISOString(),
        });

        // Advance phase on proceed
        if (result.verdict === "proceed") {
          const np = nextPhase(check.phase);
          state.currentPhase = np || "complete";
        }

        // Emit bus intent
        if (busConnected) {
          const intentType = result.verdict === "proceed" ? "PhaseGatePassed" : "PhaseGateFailed";
          await bus.publish("lifecycle", {
            type: intentType,
            idempotencyKey: crypto.randomUUID(),
            featureSlug: check.featureSlug,
            branch: "",
            timestamp: new Date().toISOString(),
            source: SERVICE_NAME,
            payload: {
              featureSlug: check.featureSlug,
              phase: check.phase,
              passed: result.verdict === "proceed",
              reason: result.reason,
            },
          });
        }

        return Response.json({
          featureSlug: check.featureSlug,
          phase: check.phase,
          verdict: result.verdict,
          reason: result.reason,
          artifactGate: result.artifactGate,
          mboGate: result.mboGate,
          lensGate: result.lensGate,
          nextPhase: result.verdict === "proceed" ? nextPhase(check.phase) : null,
        });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // --- M5: Multi-feature merge coordination ---

    // POST /features/:slug/dependsOn/:otherSlug — declare dependency (Manager-authority)
    const depMatch = path.match(/^\/features\/([^/]+)\/dependsOn\/([^/]+)$/);
    if (depMatch && req.method === "POST") {
      const [, feature, dependsOn] = depMatch;
      const managerToken = req.headers.get("x-manager-token");
      if (!managerToken) {
        return Response.json({ error: "Manager token required" }, { status: 403 });
      }
      const result = mergeCoordinator.declareDependency(feature, dependsOn, managerToken);
      if (!result.ok) {
        return Response.json({ error: result.reason }, { status: 400 });
      }
      return Response.json({ ok: true, feature, dependsOn });
    }

    // GET /features/:slug/dependencies — list dependencies
    const listDepMatch = path.match(/^\/features\/([^/]+)\/dependencies$/);
    if (listDepMatch && req.method === "GET") {
      const [, feature] = listDepMatch;
      return Response.json({ feature, dependencies: mergeCoordinator.getDependencies(feature) });
    }

    // GET /features/:slug/can-deploy — Phase 5 entry gate check
    const canDeployMatch = path.match(/^\/features\/([^/]+)\/can-deploy$/);
    if (canDeployMatch && req.method === "GET") {
      const [, feature] = canDeployMatch;
      const result = mergeCoordinator.canEnterPhase5(feature);
      return Response.json({ feature, canDeploy: result.ok, blockedBy: result.blockedBy });
    }

    // GET /features/dependencies — all dependencies (debug)
    if (path === "/features/dependencies" && req.method === "GET") {
      return Response.json({ dependencies: mergeCoordinator.exportAll() });
    }    return new Response("Not found", { status: 404 });
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);

process.on("SIGTERM", () => {
  console.log(`[${SERVICE_NAME}] shutting down`);
  server.stop();
  process.exit(0);
});
