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

// Sprint planning schema
conn.run(`
  CREATE TABLE IF NOT EXISTS sprints (
    sprint_id TEXT PRIMARY KEY,
    goal TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planning', -- planning | active | completed
    capacity_points INTEGER NOT NULL DEFAULT 30,
    committed_points INTEGER NOT NULL DEFAULT 0,
    completed_points INTEGER NOT NULL DEFAULT 0,
    velocity REAL,
    started_at TEXT,
    ended_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

conn.run(`
  CREATE TABLE IF NOT EXISTS sprint_items (
    item_id TEXT PRIMARY KEY,
    sprint_id TEXT NOT NULL REFERENCES sprints(sprint_id),
    title TEXT NOT NULL,
    description TEXT,
    owner TEXT NOT NULL,
    reviewer TEXT,
    status TEXT NOT NULL DEFAULT 'todo', -- todo | in_progress | done | blocked
    points INTEGER NOT NULL DEFAULT 1,
    mbo_tie TEXT,
    feature_slug TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

conn.run(`
  CREATE INDEX IF NOT EXISTS idx_sprint_items_sprint ON sprint_items(sprint_id);
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

// --- Sprint Planning API ---

async function createSprint(req: Request): Promise<Response> {
  const body = await req.json() as {
    goal: string;
    capacityPoints?: number;
  };

  const sprintId = `sprint-${Date.now().toString(36)}`;
  const timestamp = now();

  conn.run(`
    INSERT INTO sprints (sprint_id, goal, status, capacity_points, created_at, updated_at)
    VALUES (?, ?, 'planning', ?, ?, ?)
  `, [sprintId, body.goal, body.capacityPoints || 30, timestamp, timestamp]);

  return Response.json({ sprintId, goal: body.goal, status: "planning" }, { status: 201 });
}

async function getSprint(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sprintId = url.pathname.split("/").pop()!;

  const sprint = conn.query("SELECT * FROM sprints WHERE sprint_id = ?", [sprintId]).toArray()[0];
  if (!sprint) return new Response("Sprint not found", { status: 404 });

  const items = conn.query("SELECT * FROM sprint_items WHERE sprint_id = ? ORDER BY created_at", [sprintId]).toArray();

  return Response.json({
    ...sprint,
    items,
    capacityUsed: items.reduce((sum: number, i: any) => sum + i.points, 0),
  });
}

async function listSprints(req: Request): Promise<Response> {
  const sprints = conn.query("SELECT * FROM sprints ORDER BY created_at DESC").toArray();
  return Response.json({ sprints, count: sprints.length });
}

async function addSprintItem(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sprintId = url.pathname.split("/")[2];

  const body = await req.json() as {
    title: string;
    description?: string;
    owner: string;
    reviewer?: string;
    points?: number;
    mboTie?: string;
    featureSlug?: string;
  };

  const itemId = `item-${Date.now().toString(36)}`;
  const timestamp = now();

  conn.run(`
    INSERT INTO sprint_items (item_id, sprint_id, title, description, owner, reviewer, status, points, mbo_tie, feature_slug, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?)
  `, [itemId, sprintId, body.title, body.description || "", body.owner, body.reviewer || "", body.points || 1, body.mboTie || "", body.featureSlug || "", timestamp, timestamp]);

  // Update committed points
  conn.run("UPDATE sprints SET committed_points = committed_points + ?, updated_at = ? WHERE sprint_id = ?", [body.points || 1, timestamp, sprintId]);

  return Response.json({ itemId, sprintId, status: "todo" }, { status: 201 });
}

async function updateSprintItem(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const sprintId = parts[2];
  const itemId = parts[4];

  const body = await req.json() as { status: string };
  const validStatuses = ["todo", "in_progress", "done", "blocked"];
  if (!validStatuses.includes(body.status)) {
    return new Response("Invalid status", { status: 400 });
  }

  const timestamp = now();
  conn.run("UPDATE sprint_items SET status = ?, updated_at = ? WHERE item_id = ? AND sprint_id = ?", [body.status, timestamp, itemId, sprintId]);

  // Update completed points if done
  if (body.status === "done") {
    const item = conn.query("SELECT points FROM sprint_items WHERE item_id = ?", [itemId]).toArray()[0] as any;
    if (item) {
      conn.run("UPDATE sprints SET completed_points = completed_points + ?, updated_at = ? WHERE sprint_id = ?", [item.points, timestamp, sprintId]);
    }
  }

  return Response.json({ success: true, itemId, status: body.status });
}

async function startSprint(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sprintId = url.pathname.split("/")[2];
  const timestamp = now();

  conn.run("UPDATE sprints SET status = 'active', started_at = ?, updated_at = ? WHERE sprint_id = ?", [timestamp, timestamp, sprintId]);
  return Response.json({ sprintId, status: "active" });
}

async function completeSprint(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sprintId = url.pathname.split("/")[2];
  const timestamp = now();

  // Calculate velocity
  const sprint = conn.query("SELECT capacity_points, completed_points FROM sprints WHERE sprint_id = ?", [sprintId]).toArray()[0] as any;
  const velocity = sprint ? (sprint.completed_points / sprint.capacity_points) * 100 : 0;

  conn.run("UPDATE sprints SET status = 'completed', ended_at = ?, velocity = ?, updated_at = ? WHERE sprint_id = ?", [timestamp, velocity, timestamp, sprintId]);
  return Response.json({ sprintId, status: "completed", velocity: `${velocity.toFixed(1)}%` });
}

async function getVelocity(req: Request): Promise<Response> {
  const sprints = conn.query("SELECT sprint_id, velocity, capacity_points, completed_points, status FROM sprints WHERE status = 'completed' ORDER BY ended_at DESC LIMIT 5").toArray();
  const avgVelocity = sprints.length > 0
    ? sprints.reduce((sum: number, s: any) => sum + (s.velocity || 0), 0) / sprints.length
    : 0;

  return Response.json({
    sprints: sprints.map((s: any) => ({
      sprintId: s.sprint_id,
      velocity: s.velocity ? `${s.velocity.toFixed(1)}%` : null,
      capacity: s.capacity_points,
      completed: s.completed_points,
    })),
    averageVelocity: `${avgVelocity.toFixed(1)}%`,
    sprintCount: sprints.length,
  });
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

      // Sprint planning routes
      if (url.pathname === "/sprints" && req.method === "POST") return createSprint(req);
      if (url.pathname === "/sprints" && req.method === "GET") return listSprints(req);
      if (url.pathname === "/sprints/velocity" && req.method === "GET") return getVelocity(req);
      if (url.pathname.match(/^\/sprints\/[^/]+$/) && req.method === "GET") return getSprint(req);
      if (url.pathname.match(/^\/sprints\/[^/]+\/start$/) && req.method === "POST") return startSprint(req);
      if (url.pathname.match(/^\/sprints\/[^/]+\/complete$/) && req.method === "POST") return completeSprint(req);
      if (url.pathname.match(/^\/sprints\/[^/]+\/items$/) && req.method === "POST") return addSprintItem(req);
      if (url.pathname.match(/^\/sprints\/[^/]+\/items\/[^/]+$/) && req.method === "PATCH") return updateSprintItem(req);

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);