/**
 * workflow — bounded context service (ADR-0001, R2 of refinement plan)
 * Port: :3108
 *
 * First-class Plan/Workflow entity for task decomposition and state management.
 * Persists workflows in SQLite (via bun:sqlite) for Bun compatibility.
 *
 * States:
 *   Workflow: draft | active | completed | failed
 *   Task: pending | ready | in_progress | done | blocked | needs_review
 *
 * API:
 *   POST   /workflows              — create workflow from feature definition
 *   GET    /workflows              — list workflows
 *   GET    /workflows/:id          — get workflow with tasks
 *   PATCH  /workflows/:id/tasks/:id — update task state
 *   GET    /tasks?featureSlug=     — query tasks by feature
 *   GET    /tasks?instance=        — query tasks by assigned instance
 */
import { createBusClient } from "@orchestrator/bus-client";
import { Database } from "bun:sqlite";

const PORT = Number(process.env.PORT) || 3108;
const SERVICE_NAME = "workflow";
const DB_PATH = process.env.WORKFLOW_DB_PATH || "data/workflow.db";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

// --- SQLite persistence (DuckDB replaced for Bun compatibility) ---
const db = new Database(DB_PATH, { create: true });
db.run("PRAGMA journal_mode = WAL");

db.run(`
  CREATE TABLE IF NOT EXISTS workflows (
    workflow_id TEXT PRIMARY KEY,
    feature_slug TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    definition TEXT NOT NULL DEFAULT '{}'
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS workflow_tasks (
    task_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    task_order INTEGER NOT NULL,
    phase TEXT NOT NULL,
    description TEXT NOT NULL,
    acceptance_criteria TEXT NOT NULL DEFAULT '[]',
    mbo_metrics TEXT NOT NULL DEFAULT '[]',
    assigned_instance TEXT,
    state TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_wf_tasks_workflow ON workflow_tasks(workflow_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_wf_tasks_state ON workflow_tasks(state)`);

console.log(`[${SERVICE_NAME}] SQLite initialized at ${DB_PATH}`);

// --- Bus integration ---
const bus = createBusClient({ url: REDIS_URL });

async function startBus() {
  await bus.connect();
  console.log(`[${SERVICE_NAME}] Connected to Redis`);
}

function now() { return new Date().toISOString(); }

// --- API Handlers ---

async function createWorkflow(req: Request): Promise<Response> {
  const body = await req.json() as {
    featureSlug: string;
    tasks: Array<{
      phase: string;
      description: string;
      acceptanceCriteria: string[];
      mboMetrics: { name: string; target: string }[];
    }>;
  };

  const workflowId = `wf-${body.featureSlug}-${Date.now()}`;
  const timestamp = now();

  const definition = {
    featureSlug: body.featureSlug,
    tasks: body.tasks.map((t, i) => ({
      taskId: `task-${body.featureSlug}-${i + 1}`,
      taskOrder: i + 1,
      ...t,
    })),
  };

  db.run(
    "INSERT INTO workflows (workflow_id, feature_slug, created_at, updated_at, status, definition) VALUES (?, ?, ?, ?, 'active', ?)",
    [workflowId, body.featureSlug, timestamp, timestamp, JSON.stringify(definition)]
  );

  for (const task of definition.tasks) {
    db.run(
      "INSERT INTO workflow_tasks (task_id, workflow_id, task_order, phase, description, acceptance_criteria, mbo_metrics, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
      [task.taskId, workflowId, task.taskOrder, task.phase, task.description, JSON.stringify(task.acceptanceCriteria), JSON.stringify(task.mboMetrics), timestamp, timestamp]
    );
  }

  return Response.json({ workflowId, featureSlug: body.featureSlug, status: "active", tasks: definition.tasks }, { status: 201 });
}

async function getWorkflow(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const workflowId = url.pathname.split("/").pop()!;
  const workflow = db.query("SELECT * FROM workflows WHERE workflow_id = ?").get(workflowId) as any;
  if (!workflow) return new Response("Workflow not found", { status: 404 });

  const tasks = db.query("SELECT * FROM workflow_tasks WHERE workflow_id = ? ORDER BY task_order").all(workflowId);
  return Response.json({
    ...workflow,
    definition: JSON.parse(workflow.definition),
    tasks: tasks.map((t: any) => ({
      ...t,
      acceptance_criteria: JSON.parse(t.acceptance_criteria),
      mbo_metrics: JSON.parse(t.mbo_metrics),
    })),
  });
}

async function listWorkflows(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const featureSlug = url.searchParams.get("featureSlug");
  const rows = featureSlug
    ? db.query("SELECT * FROM workflows WHERE feature_slug = ? ORDER BY created_at DESC").all(featureSlug)
    : db.query("SELECT * FROM workflows ORDER BY created_at DESC").all();
  return Response.json({ workflows: rows.map((w: any) => ({ ...w, definition: JSON.parse(w.definition) })), count: rows.length });
}

async function updateTaskState(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const taskId = parts.pop()!;
  const workflowId = parts.pop()!;

  const body = await req.json() as { state: string; assignedInstance?: string };
  const validStates = ["pending", "ready", "in_progress", "done", "blocked", "needs_review"];
  if (!validStates.includes(body.state)) return new Response("Invalid state", { status: 400 });

  const timestamp = now();
  const updates: string[] = ["state = ?", "updated_at = ?"];
  const params: any[] = [body.state, timestamp];

  if (body.assignedInstance) { updates.push("assigned_instance = ?"); params.push(body.assignedInstance); }
  if (body.state === "done") { updates.push("completed_at = ?"); params.push(timestamp); }
  params.push(workflowId, taskId);

  const result = db.run(`UPDATE workflow_tasks SET ${updates.join(", ")} WHERE workflow_id = ? AND task_id = ?`, params);
  if (result.changes === 0) return new Response("Task not found", { status: 404 });

  // Auto-complete workflow when all tasks done
  const remaining = db.query("SELECT COUNT(*) as cnt FROM workflow_tasks WHERE workflow_id = ? AND state != 'done'", [workflowId]).get() as any;
  if (remaining.cnt === 0) {
    db.run("UPDATE workflows SET status = 'completed', updated_at = ? WHERE workflow_id = ?", [timestamp, workflowId]);
  }

  return Response.json({ success: true, workflowId, taskId, state: body.state });
}

async function queryTasks(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const featureSlug = url.searchParams.get("featureSlug");
  const instance = url.searchParams.get("instance");
  const state = url.searchParams.get("state");

  let query = "SELECT * FROM workflow_tasks WHERE 1=1";
  const params: any[] = [];
  if (featureSlug) { query += " AND workflow_id IN (SELECT workflow_id FROM workflows WHERE feature_slug = ?)"; params.push(featureSlug); }
  if (instance) { query += " AND assigned_instance = ?"; params.push(instance); }
  if (state) { query += " AND state = ?"; params.push(state); }
  query += " ORDER BY created_at DESC";

  const rows = db.query(query, params).all();
  return Response.json({
    tasks: rows.map((t: any) => ({
      ...t,
      acceptance_criteria: JSON.parse(t.acceptance_criteria),
      mbo_metrics: JSON.parse(t.mbo_metrics),
    })),
    count: rows.length,
  });
}

// --- HTTP Server ---

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/health") {
        const redisOk = await bus.ping();
        const wfCount = (db.query("SELECT COUNT(*) as cnt FROM workflows").get() as any)?.cnt || 0;
        return Response.json({ service: SERVICE_NAME, status: redisOk ? "ok" : "degraded", port: PORT, workflowsTracked: wfCount, redis: redisOk ? "connected" : "disconnected" });
      }
      if (url.pathname === "/workflows" && req.method === "POST") return createWorkflow(req);
      if (url.pathname === "/workflows" && req.method === "GET") return listWorkflows(req);
      if (url.pathname.match(/^\/workflows\/[^/]+$/) && req.method === "GET") return getWorkflow(req);
      if (url.pathname.match(/^\/workflows\/[^/]+\/tasks\/[^/]+$/) && req.method === "PATCH") return updateTaskState(req);
      if (url.pathname === "/tasks" && req.method === "GET") return queryTasks(req);
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
startBus().catch(console.error);
