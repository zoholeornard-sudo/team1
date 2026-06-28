/**
 * lifecycle-management — bounded context service (ADR-0001)
 * Port: :3104
 *
 * M4: Dual-Gate Lifecycle Gating with MBO
 * - SQLite-backed phase gate records (phase_gates, planned_gaps tables)
 * - Backtrack counter per (featureSlug, phase) — max 3 before PhaseEscalation
 * - Phase 7 does NOT backtrack (§11.2 Fix A) — Manager must intervene
 * - Planned-gap declarations stored in planned_gaps table
 *
 * M5: Multi-Feature Merge Coordination
 * - Feature dependency API: POST /dependencies, GET /dependencies, GET /can-deploy
 * - feature_dependencies SQLite table
 * - can-deploy check: all dependencies must have Phase 7 = passed
 *
 * Subscribes to:
 * - intents:phase-gate-check → evaluates dual-gate criteria
 *
 * Publishes:
 * - intents:phase-gate-passed
 * - intents:phase-gate-failed
 * - intents:phase-escalation (after 3 backtracks)
 */
import { createBusClient } from "@orchestrator/bus-client";
import type {
  PhaseGateCheckPayload,
  PhaseGateResultPayload,
  PhaseEscalationPayload,
} from "@orchestrator/contracts";
import { Database } from "bun:sqlite";

const PORT = Number(process.env.PORT) || 3104;
const SERVICE_NAME = "lifecycle-management";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const DB_PATH = process.env.LIFECYCLE_DB_PATH || "data/lifecycle.db";
const MAX_BACKTRACKS = 3;

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// Initialize SQLite
const db = new Database(DB_PATH, { create: true });
db.run("PRAGMA journal_mode = WAL");

db.run(`
  CREATE TABLE IF NOT EXISTS phase_gates (
    feature_slug TEXT NOT NULL,
    phase INTEGER NOT NULL,
    artifact_passed INTEGER DEFAULT 0,
    mbo_passed INTEGER DEFAULT 0,
    gap_declared INTEGER DEFAULT 0,
    backtrack_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    last_checked_at TEXT NOT NULL,
    PRIMARY KEY (feature_slug, phase)
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS planned_gaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feature_slug TEXT NOT NULL,
    phase INTEGER NOT NULL,
    metric_name TEXT NOT NULL,
    declared_gap TEXT NOT NULL,
    declared_by TEXT NOT NULL,
    rejected_by TEXT,
    created_at TEXT NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS feature_dependencies (
    feature TEXT NOT NULL,
    depends_on_feature TEXT NOT NULL,
    declared_at TEXT NOT NULL,
    PRIMARY KEY (feature, depends_on_feature)
  );
`);

console.log(`[${SERVICE_NAME}] SQLite initialized at ${DB_PATH}`);

// --- Backward phase map (§11.2 Fix A + Fix B) ---

const BACKTRACK_MAP: Record<number, number> = {
  1: 1, // Planning — can't go further back
  2: 1, // Architecture → Planning
  3: 2, // Implementation → Architecture
  4: 3, // Testing → Implementation
  5: 3, // Deployment → Implementation
  6: 3, // Monitoring → Implementation
  // 7 omitted — Phase 7 does NOT backtrack
};

function resolveBackwardPhase(currentPhase: number, backtrackCount: number): number {
  if (currentPhase === 7) {
    throw new Error("PHASE_7_NO_BACKTRACK — Manager must extend deadline or accept gaps");
  }
  if (backtrackCount >= MAX_BACKTRACKS) {
    throw new Error("BACKTRACK_LIMIT_EXCEEDED — emit PhaseEscalation to Manager");
  }
  return BACKTRACK_MAP[currentPhase] ?? 1;
}

// --- Gate evaluation ---

async function handlePhaseGateCheck(payload: PhaseGateCheckPayload) {
  const now = new Date().toISOString();
  console.log(`[${SERVICE_NAME}] Phase gate check: ${payload.featureSlug} phase ${payload.phase}`);

  // Evaluate gates
  const artifactOk = payload.artifactsProduced.length > 0;
  const mboOk = payload.mboMetrics.every(m => m.onTarget);
  const gapOk = payload.plannedGaps.length > 0;
  const bothPassed = artifactOk && (mboOk || gapOk);

  // Get existing record
  const existing = db.query(
    "SELECT * FROM phase_gates WHERE feature_slug = ? AND phase = ?"
  ).get(payload.featureSlug, payload.phase) as any;

  const backtrackCount = existing?.backtrack_count ?? 0;

  // Upsert phase gate record
  db.run(`
    INSERT OR REPLACE INTO phase_gates
      (feature_slug, phase, artifact_passed, mbo_passed, gap_declared, backtrack_count, status, last_checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [payload.featureSlug, payload.phase, artifactOk ? 1 : 0, mboOk ? 1 : 0, gapOk ? 1 : 0, backtrackCount, bothPassed ? "passed" : "failed", now]);

  // Store planned gaps
  for (const gap of payload.plannedGaps) {
    db.run(
      "INSERT INTO planned_gaps (feature_slug, phase, metric_name, declared_gap, declared_by, created_at) VALUES (?, ?, ?, ?, 'agent', ?)",
      [payload.featureSlug, payload.phase, gap.metric, gap.declaredGap, now]
    );
  }

  const resultPayload: PhaseGateResultPayload = {
    featureSlug: payload.featureSlug,
    phase: payload.phase,
    passed: bothPassed,
    reason: bothPassed ? "Both gates passed" : `Artifact: ${artifactOk}, MBO: ${mboOk}, Gap: ${gapOk}`,
  };

  if (bothPassed) {
    await bus.publish("intents:phase-gate-passed", {
      type: "PhaseGatePassed",
      idempotencyKey: `gate-passed-${payload.featureSlug}-${payload.phase}-${Date.now()}`,
      featureSlug: payload.featureSlug,
      branch: `feature/${payload.featureSlug}`,
      timestamp: now,
      payload: resultPayload,
    });
  } else {
    try {
      const targetPhase = resolveBackwardPhase(payload.phase, backtrackCount);

      // Increment backtrack counter
      db.run("UPDATE phase_gates SET backtrack_count = backtrack_count + 1 WHERE feature_slug = ? AND phase = ?", [payload.featureSlug, payload.phase]);

      await bus.publish("intents:phase-gate-failed", {
        type: "PhaseGateFailed",
        idempotencyKey: `gate-failed-${payload.featureSlug}-${payload.phase}-${Date.now()}`,
        featureSlug: payload.featureSlug,
        branch: `feature/${payload.featureSlug}`,
        timestamp: now,
        payload: { ...resultPayload, reason: `Backtracking to phase ${targetPhase}: ${resultPayload.reason}` },
      });

      console.log(`[${SERVICE_NAME}] Backtracking ${payload.featureSlug}: phase ${payload.phase} → ${targetPhase} (attempt ${backtrackCount + 1}/${MAX_BACKTRACKS})`);
    } catch (err: any) {
      if (err.message.includes("PHASE_7_NO_BACKTRACK")) {
        console.log(`[${SERVICE_NAME}] Phase 7 blocked for ${payload.featureSlug} — Manager intervention required`);
      }

      // Escalate to Manager
      const escalationPayload: PhaseEscalationPayload = {
        featureSlug: payload.featureSlug,
        phase: payload.phase,
        backtrackCount,
        reason: err.message.includes("PHASE_7_NO_BACKTRACK")
          ? "Phase 7 cannot backtrack — Manager must extend deadline or accept gaps"
          : `Backtrack limit (${MAX_BACKTRACKS}) exceeded at phase ${payload.phase}`,
        managerOptions: ["accept_planned_gap", "extend_deadline", "kill_feature"],
      };

      await bus.publish("intents:phase-escalation", {
        type: "PhaseEscalation",
        idempotencyKey: `escalation-${payload.featureSlug}-${payload.phase}-${Date.now()}`,
        featureSlug: payload.featureSlug,
        branch: `feature/${payload.featureSlug}`,
        timestamp: now,
        payload: escalationPayload,
      });
    }
  }
}

// --- M5: Feature dependency management ---

function addDependency(feature: string, dependsOn: string) {
  db.run(
    "INSERT OR REPLACE INTO feature_dependencies (feature, depends_on_feature, declared_at) VALUES (?, ?, ?)",
    [feature, dependsOn, new Date().toISOString()]
  );
  console.log(`[${SERVICE_NAME}] Dependency: ${feature} depends on ${dependsOn}`);
}

function canDeploy(feature: string): boolean {
  const deps = db.query("SELECT depends_on_feature FROM feature_dependencies WHERE feature = ?").all(feature) as any[];
  for (const dep of deps) {
    const phase7 = db.query("SELECT status FROM phase_gates WHERE feature_slug = ? AND phase = 7").get(dep.depends_on_feature) as any;
    if (!phase7 || phase7.status !== "passed") return false;
  }
  return true;
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
  let query = "SELECT * FROM phase_gates";
  const params: string[] = [];
  if (featureSlug) { query += " WHERE feature_slug = ?"; params.push(featureSlug); }
  query += " ORDER BY feature_slug, phase";
  const gates = db.query(query).all(...params);
  return Response.json({ phaseGates: gates, count: gates.length });
}

async function submitGateCheck(req: Request): Promise<Response> {
  const body = await req.json() as PhaseGateCheckPayload;
  await handlePhaseGateCheck(body);
  return Response.json({ success: true, featureSlug: body.featureSlug, phase: body.phase });
}

async function getPlannedGaps(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const featureSlug = url.searchParams.get("featureSlug");
  let query = "SELECT * FROM planned_gaps";
  const params: string[] = [];
  if (featureSlug) { query += " WHERE feature_slug = ?"; params.push(featureSlug); }
  const gaps = db.query(query).all(...params);
  return Response.json({ plannedGaps: gaps, count: gaps.length });
}

async function addDependencyEndpoint(req: Request): Promise<Response> {
  const body = await req.json() as { feature: string; dependsOn: string };
  addDependency(body.feature, body.dependsOn);
  return Response.json({ success: true, feature: body.feature, dependsOn: body.dependsOn });
}

async function getDependencies(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const feature = url.searchParams.get("feature");
  let query = "SELECT * FROM feature_dependencies";
  const params: string[] = [];
  if (feature) { query += " WHERE feature = ?"; params.push(feature); }
  const deps = db.query(query).all(...params);
  return Response.json({ dependencies: deps, count: deps.length });
}

async function checkCanDeploy(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const feature = url.searchParams.get("feature") || "";
  return Response.json({ feature, canDeploy: canDeploy(feature) });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/health") {
        const redisOk = await bus.ping();
        const gateCount = (db.query("SELECT COUNT(*) as cnt FROM phase_gates").get() as any)?.cnt || 0;
        return Response.json({
          service: SERVICE_NAME,
          status: redisOk ? "ok" : "degraded",
          port: PORT,
          gatesTracked: gateCount,
          maxBacktracks: MAX_BACKTRACKS,
          redis: redisOk ? "connected" : "disconnected",
        });
      }
      if (url.pathname === "/gates" && req.method === "GET") return getPhaseGates(req);
      if (url.pathname === "/gate/check" && req.method === "POST") return submitGateCheck(req);
      if (url.pathname === "/gaps" && req.method === "GET") return getPlannedGaps(req);
      if (url.pathname === "/dependencies" && req.method === "POST") return addDependencyEndpoint(req);
      if (url.pathname === "/dependencies" && req.method === "GET") return getDependencies(req);
      if (url.pathname === "/can-deploy" && req.method === "GET") return checkCanDeploy(req);
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
startBus().catch(console.error);
