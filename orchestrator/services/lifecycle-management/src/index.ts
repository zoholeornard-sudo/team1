/**
 * lifecycle-management — bounded context service (ADR-0001)
 * Port: :3104
 *
 * M4: Dual-Gate Lifecycle Gating with MBO
 * - SQLite-backed phase gate records (survives restarts)
 * - Backtrack counter per (featureSlug, phase) — max 3 before PhaseEscalation
 * - Phase 7 does NOT backtrack (Manager must intervene)
 * - Planned-gap declarations stored and reviewable at Phase 7
 * - Escalation response endpoint for Manager decisions
 *
 * Subscribes to:
 * - intents:phase-gate-check → evaluates dual gates (artifact + MBO)
 *
 * Publishes:
 * - intents:phase-gate-passed
 * - intents:phase-gate-failed
 * - intents:phase-escalation (after 3 backtracks on same phase)
 */
import { createBusClient } from "@orchestrator/bus-client";
import { PhaseGateCheckPayload, PhaseGateResultPayload } from "@orchestrator/contracts";
import { Database } from "bun:sqlite";

const PORT = Number(process.env.PORT) || 3104;
const SERVICE_NAME = "lifecycle-management";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const DB_PATH = process.env.LIFECYCLE_DB_PATH || "data/lifecycle.db";
const MAX_BACKTRACKS = 3;

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// --- SQLite persistence ---
const db = new Database(DB_PATH, { create: true });
db.run("PRAGMA journal_mode = WAL");

db.run(`
  CREATE TABLE IF NOT EXISTS phase_gates (
    id TEXT PRIMARY KEY,
    feature_slug TEXT NOT NULL,
    instance_id TEXT,
    phase INTEGER NOT NULL,
    artifact_passed BOOLEAN DEFAULT 0,
    mbo_passed BOOLEAN DEFAULT 0,
    gap_declared BOOLEAN DEFAULT 0,
    backtrack_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    result_reason TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS planned_gaps (
    id TEXT PRIMARY KEY,
    feature_slug TEXT NOT NULL,
    phase INTEGER NOT NULL,
    metric TEXT NOT NULL,
    declared_gap TEXT NOT NULL,
    declared_by TEXT NOT NULL,
    status TEXT DEFAULT 'declared',
    manager_reviewed BOOLEAN DEFAULT 0,
    created_at TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS escalation_log (
    id TEXT PRIMARY KEY,
    feature_slug TEXT NOT NULL,
    phase INTEGER NOT NULL,
    backtrack_count INTEGER NOT NULL,
    manager_action TEXT,
    resolved_at TEXT
  )
`);

// --- Backtrack phase map (where to go back to) ---
const BACKTRACK_MAP: Record<number, number> = {
  1: 1,  // Planning — can't go further back
  2: 1,  // Architecture → Planning
  3: 2,  // Implementation → Architecture
  4: 3,  // Testing → Implementation
  5: 3,  // Deployment → Implementation
  6: 3,  // Monitoring → Implementation
  // 7 is terminal — no backtrack
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

// --- Intent handler ---

async function handlePhaseGateCheck(payload: PhaseGateCheckPayload) {
  console.log(`[${SERVICE_NAME}] Phase gate check: ${payload.featureSlug} phase ${payload.phase}`);

  const id = `${payload.featureSlug}-${payload.phase}`;
  const now = new Date().toISOString();

  // Load or create record
  const existing = db.query("SELECT * FROM phase_gates WHERE id = ?").get(id) as any;
  const backtrackCount = existing?.backtrack_count || 0;

  // Evaluate gates
  const artifactOk = payload.artifactsProduced.length > 0;
  const mboOk = payload.mboMetrics.length > 0 && payload.mboMetrics.every(m => m.onTarget);
  const gapOk = payload.plannedGaps.length > 0;

  const bothPassed = artifactOk && (mboOk || gapOk);

  // Upsert record
  if (existing) {
    db.run(`
      UPDATE phase_gates SET
        artifact_passed = ?, mbo_passed = ?, gap_declared = ?,
        backtrack_count = ?, status = 'evaluated', result_reason = ?, resolved_at = ?
      WHERE id = ?
    `, [artifactOk, mboOk, gapOk, backtrackCount, bothPassed ? "Both gates passed" : `Artifact:${artifactOk} MBO:${mboOk} Gap:${gapOk}`, now, id]);
  } else {
    db.run(`
      INSERT INTO phase_gates (id, feature_slug, instance_id, phase, artifact_passed, mbo_passed, gap_declared, backtrack_count, status, result_reason, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'evaluated', ?, ?, ?)
    `, [id, payload.featureSlug, payload.instanceId, payload.phase, artifactOk, mboOk, gapOk, backtrackCount, bothPassed ? "Both gates passed" : `Artifact:${artifactOk} MBO:${mboOk} Gap:${gapOk}`, now, now]);
  }

  // Store planned gaps
  for (const gap of payload.plannedGaps) {
    const gapId = `${id}-${gap.metric}`;
    db.run(`
      INSERT OR REPLACE INTO planned_gaps (id, feature_slug, phase, metric, declared_gap, declared_by, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'declared', ?)
    `, [gapId, payload.featureSlug, payload.phase, gap.metric, gap.declaredGap, payload.instanceId || "unknown", now]);
  }

  const resultPayload: PhaseGateResultPayload = {
    featureSlug: payload.featureSlug,
    phase: payload.phase,
    passed: bothPassed,
    reason: bothPassed ? "Both gates passed" : `Artifact:${artifactOk} MBO:${mboOk} Gap:${gapOk}`,
  };

  if (bothPassed) {
    db.run("UPDATE phase_gates SET status = 'passed' WHERE id = ?", [id]);
    await bus.publish("intents:phase-gate-passed", {
      type: "PhaseGatePassed",
      idempotencyKey: `gate-passed-${id}-${Date.now()}`,
      featureSlug: payload.featureSlug,
      branch: `feature/${payload.featureSlug}`,
      timestamp: now,
      payload: resultPayload,
    });
  } else {
    if (backtrackCount >= MAX_BACKTRACKS) {
      // Escalate to Manager
      db.run("UPDATE phase_gates SET status = 'escalated' WHERE id = ?", [id]);
      await bus.publish("intents:phase-escalation", {
        type: "PhaseEscalation",
        idempotencyKey: `escalation-${id}-${Date.now()}`,
        featureSlug: payload.featureSlug,
        branch: `feature/${payload.featureSlug}`,
        timestamp: now,
        payload: {
          featureSlug: payload.featureSlug,
          phase: payload.phase,
          backtrackCount,
          reason: `Backtrack limit exceeded (${MAX_BACKTRACKS} attempts)`,
          managerOptions: ["accept_planned_gap", "extend_deadline", "kill_feature"],
        },
      });
    } else {
      // Backtrack
      const targetPhase = resolveBackwardPhase(payload.phase, backtrackCount);
      const newBacktrackCount = backtrackCount + 1;
      db.run("UPDATE phase_gates SET status = 'failed', backtrack_count = ? WHERE id = ?", [newBacktrackCount, id]);
      await bus.publish("intents:phase-gate-failed", {
        type: "PhaseGateFailed",
        idempotencyKey: `gate-failed-${id}-${Date.now()}`,
        featureSlug: payload.featureSlug,
        branch: `feature/${payload.featureSlug}`,
        timestamp: now,
        payload: { ...resultPayload, backtrackPhase: targetPhase, backtrackCount: newBacktrackCount },
      });
    }
  }
}

// --- Escalation response handler ---

async function handleEscalationResponse(instanceId: string, featureSlug: string, action: string) {
  const now = new Date().toISOString();
  db.run(`
    INSERT INTO escalation_log (id, feature_slug, phase, backtrack_count, manager_action, resolved_at)
    VALUES (?, ?, (SELECT phase FROM phase_gates WHERE feature_slug = ? ORDER BY created_at DESC LIMIT 1), (SELECT backtrack_count FROM phase_gates WHERE feature_slug = ? ORDER BY created_at DESC LIMIT 1), ?, ?)
  `, [`esc-${featureSlug}-${Date.now()}`, featureSlug, featureSlug, featureSlug, action, now]);

  if (action === "accept_planned_gap") {
    // Mark all gates for this feature as passed
    db.run("UPDATE phase_gates SET status = 'passed', result_reason = 'Manager accepted planned gap' WHERE feature_slug = ? AND status = 'escalated'", [featureSlug]);
  } else if (action === "kill_feature") {
    db.run("UPDATE phase_gates SET status = 'cancelled', result_reason = 'Manager killed feature' WHERE feature_slug = ?", [featureSlug]);
  }
  // extend_deadline: gates remain in current state for re-attempt
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

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/health") {
        const redisOk = await bus.ping();
        const gateCount = (db.query("SELECT COUNT(*) as cnt FROM phase_gates").get() as any)?.cnt || 0;
        return Response.json({ service: SERVICE_NAME, status: redisOk ? "ok" : "degraded", port: PORT, gatesTracked: gateCount, redis: redisOk ? "connected" : "disconnected" });
      }
      if (url.pathname === "/gates" && req.method === "GET") {
        const featureSlug = url.searchParams.get("featureSlug");
        const rows = featureSlug
          ? db.query("SELECT * FROM phase_gates WHERE feature_slug = ? ORDER BY created_at DESC").all(featureSlug)
          : db.query("SELECT * FROM phase_gates ORDER BY created_at DESC").all();
        return Response.json({ phaseGates: rows, count: rows.length });
      }
      if (url.pathname === "/gate/check" && req.method === "POST") {
        const body = await req.json() as PhaseGateCheckPayload;
        await handlePhaseGateCheck(body);
        return Response.json({ success: true, featureSlug: body.featureSlug, phase: body.phase });
      }
      if (url.pathname === "/gaps" && req.method === "GET") {
        const featureSlug = url.searchParams.get("featureSlug");
        const rows = featureSlug
          ? db.query("SELECT * FROM planned_gaps WHERE feature_slug = ?").all(featureSlug)
          : db.query("SELECT * FROM planned_gaps").all();
        return Response.json({ gaps: rows, count: rows.length });
      }
      if (url.pathname === "/escalation/respond" && req.method === "POST") {
        const body = await req.json() as { instanceId: string; featureSlug: string; action: string };
        await handleEscalationResponse(body.instanceId, body.featureSlug, body.action);
        return Response.json({ success: true, action: body.action });
      }
      if (url.pathname === "/escalations" && req.method === "GET") {
        const rows = db.query("SELECT * FROM escalation_log ORDER BY resolved_at DESC").all();
        return Response.json({ escalations: rows, count: rows.length });
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
startBus().catch(console.error);
