/**
 * workflow — bounded context service (ADR-0001, P2 of refinement plan)
 * Port: :3108
 *
 * First-class Plan/Workflow entity for task decomposition and state management.
 * Persists workflows in DuckDB (workflow.duckdb).
 */
import { IntentType } from "@orchestrator/contracts";
import * as duckdb from "duckdb";

const PORT = Number(process.env.PORT) || 3108;
const SERVICE_NAME = "workflow";
const DB_PATH = process.env.WORKFLOW_DB_PATH || "data/workflow.duckdb";

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

// Initialize DuckDB
const db = new duckdb.Database(DB_PATH);
const conn = db.connect();

// Create schema
conn.run(`
  CREATE TABLE IF NOT EXISTS workflows (
    workflow_id TEXT PRIMARY KEY,
    feature_slug TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- draft | active | completed | failed
    definition JSON NOT NULL
  );
`);

conn.run(`
  CREATE TABLE IF NOT EXISTS workflow_tasks (
    task_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(workflow_id),
    task_order INTEGER NOT NULL,
    phase TEXT NOT NULL,
    description TEXT NOT NULL,
    acceptance_criteria JSON NOT NULL,
    mbo_metrics JSON NOT NULL,
    assigned_instance TEXT,
    state TEXT NOT NULL DEFAULT 'pending', -- pending | ready | in_progress | done | blocked | needs_review
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );
`);

conn.run(`
  CREATE INDEX IF NOT EXISTS idx_workflow_tasks_workflow ON workflow_tasks(workflow_id);
`);
conn.run(`
  CREATE INDEX IF NOT EXISTS idx_workflow_tasks_state ON workflow_tasks(state);
`);

console.log(`[${SERVICE_NAME}] DuckDB initialized at ${DB_PATH}`);

// Helper: current ISO timestamp
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
      phase: t.phase,
      description: t.description,
      acceptanceCriteria: t.acceptanceCriteria,
      mboMetrics: t.mboMetrics,
    })),
  };

  conn.run(`
    INSERT INTO workflows (workflow_id, feature_slug, created_at, updated_at, status, definition)
    VALUES (?, ?, ?, ?, 'active', ?)
  `, [workflowId, body.featureSlug, timestamp, timestamp, JSON.stringify(definition)]);

  for (const task of definition.tasks) {
    conn.run(`
      INSERT INTO workflow_tasks (task_id, workflow_id, task_order, phase, description, acceptance_criteria, mbo_metrics, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `, [
      task.taskId, workflowId, task.taskOrder, task.phase, task.description,
      JSON.stringify(task.acceptanceCriteria), JSON.stringify(task.mboMetrics),
      timestamp, timestamp
    ]);
  }

  return Response.json({ workflowId, featureSlug: body.featureSlug, status: "active", tasks: definition.tasks });
}

async function getWorkflow(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const workflowId = url.pathname.split("/").pop()!;

  const workflow = conn.query(`
    SELECT * FROM workflows WHERE workflow_id = ?
  `, [workflowId]).toArray()[0];

  if (!workflow) {
    return new Response("Workflow not found", { status: 404 });
  }

  const tasks = conn.query(`
    SELECT * FROM workflow_tasks WHERE workflow_id = ? ORDER BY task_order
  `, [workflowId]).toArray();

  return Response.json({
    ...workflow,
    definition: JSON.parse((workflow as any).definition),
    tasks: tasks.map(t => ({
      ...t,
      acceptance_criteria: JSON.parse(t.acceptance_criteria),
      mbo_metrics: JSON.parse(t.mbo_metrics),
    })),
  });
}

async function updateTaskState(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const workflowId = parts[parts.length - 3];
  const taskId = parts[parts.length - 1];

  const body = await req.json() as { state: string; assignedInstance?: string };
  const validStates = ["pending", "ready", "in_progress", "done", "blocked", "needs_review"];
  if (!validStates.includes(body.state)) {
    return new Response("Invalid state", { status: 400 });
  }

  const timestamp = now();
  const updates: string[] = ["state = ?", "updated_at = ?"];
  const params: any[] = [body.state, timestamp];

  if (body.assignedInstance) {
    updates.push("assigned_instance = ?");
    params.push(body.assignedInstance);
  }
  if (body.state === "done") {
    updates.push("completed_at = ?");
    params.push(timestamp);
  }

  params.push(workflowId, taskId);

  const result = conn.run(`
    UPDATE workflow_tasks SET ${updates.join(", ")} WHERE workflow_id = ? AND task_id = ?
  `, params);

  if (result.changes === 0) {
    return new Response("Task not found", { status: 404 });
  }

  // Check if all tasks in workflow are done
  const remaining = conn.query(`
    SELECT COUNT(*) as cnt FROM workflow_tasks WHERE workflow_id = ? AND state != 'done'
  `, [workflowId]).toArray()[0] as any;

  if (remaining.cnt === 0) {
    conn.run(`UPDATE workflows SET status = 'completed', updated_at = ? WHERE workflow_id = ?`, [timestamp, workflowId]);
  }

  return Response.json({ success: true, workflowId, taskId, state: body.state });
}

async function listWorkflows(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const featureSlug = url.searchParams.get("featureSlug");

  let query = "SELECT * FROM workflows";
  const params: any[] = [];
  if (featureSlug) {
    query += " WHERE feature_slug = ?";
    params.push(featureSlug);
  }
  query += " ORDER BY created_at DESC";

  const workflows = conn.query(query, params).toArray();
  return Response.json(workflows.map(w => ({ ...w, definition: JSON.parse((w as any).definition) })));
}

// --- HTTP Server ---

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/health") {
        return Response.json({ service: SERVICE_NAME, status: "ok", port: PORT });
      }

      if (url.pathname === "/workflow" && req.method === "POST") {
        return createWorkflow(req);
      }

      if (url.pathname === "/workflow" && req.method === "GET") {
        return listWorkflows(req);
      }

      if (url.pathname.startsWith("/workflow/") && req.method === "GET") {
        return getWorkflow(req);
      }

      if (url.pathname.match(/^\/workflow\/[^/]+\/task\/[^/]+$/) && req.method === "PATCH") {
        return updateTaskState(req);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);