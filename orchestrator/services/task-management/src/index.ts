/**
 * task-management — bounded context service (ADR-0001)
 * Port: :3101
 *
 * Milestone 4: real task lifecycle logic.
 * - Accepts TaskCompleted via POST /tasks/:id/complete
 * - Tracks tasks per feature+phase
 * - When all phase tasks complete, emits PhaseGateCheck to lifecycle-management
 * - In-memory state (M5: SQLite)
 */
import { BusClient } from "@team1/bus-client";

const PORT = Number(process.env.PORT) || 3101;
const SERVICE_NAME = "task-management";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const LIFECYCLE_URL = process.env.LIFECYCLE_URL || "http://localhost:3104";

let busConnected = false;
let bootTime = Date.now();

const bus = new BusClient({ redisUrl: REDIS_URL, serviceName: SERVICE_NAME });
bus.connect().then(() => {
  busConnected = true;
  console.log(`[${SERVICE_NAME}] connected to Redis bus`);
}).catch((err) => {
  console.warn(`[${SERVICE_NAME}] Redis bus connection failed (non-fatal):`, err?.message);
});

// --- In-memory task state ---
interface Task {
  taskId: string;
  featureSlug: string;
  phase: string;
  assignedInstance: string;
  description: string;
  status: "pending" | "completed" | "blocked";
  artifacts: { id: string; path: string; type: string }[];
  completedAt?: string;
}

const tasks = new Map<string, Task>();

function phaseTasksComplete(featureSlug: string, phase: string): boolean {
  const phaseTasks = [...tasks.values()].filter(
    (t) => t.featureSlug === featureSlug && t.phase === phase
  );
  if (phaseTasks.length === 0) return false;
  return phaseTasks.every((t) => t.status === "completed");
}

async function emitPhaseGateCheck(featureSlug: string, phase: string, tasks: Task[]) {
  const phaseTasks = tasks.filter(
    (t) => t.featureSlug === featureSlug && t.phase === phase
  );
  const artifactsProduced = phaseTasks.flatMap((t) =>
    t.artifacts.map((a) => a.path)
  );
  const check = {
    featureSlug,
    instanceId: phaseTasks[0]?.assignedInstance || "",
    phase,
    artifactsProduced,
    mboMetrics: [],
    plannedGaps: [],
  };
  console.log(`[${SERVICE_NAME}] all phase ${phase} tasks complete for ${featureSlug} — emitting PhaseGateCheck`);
  try {
    const resp = await fetch(`${LIFECYCLE_URL}/phase/gate-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check, lensScores: [] }),
    });
    const result = await resp.json();
    console.log(`[${SERVICE_NAME}] gate verdict: ${result.verdict} — ${result.reason}`);
    return result;
  } catch (err: any) {
    console.error(`[${SERVICE_NAME}] failed to emit PhaseGateCheck: ${err.message}`);
    return null;
  }
}

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

    // POST /tasks — create a task
    if (path === "/tasks" && req.method === "POST") {
      try {
        const body = await req.json();
        if (!body.taskId || !body.featureSlug || !body.phase) {
          return Response.json({ error: "Missing: taskId, featureSlug, phase" }, { status: 400 });
        }
        const task: Task = {
          taskId: body.taskId,
          featureSlug: body.featureSlug,
          phase: body.phase,
          assignedInstance: body.assignedInstance || "",
          description: body.description || "",
          status: "pending",
          artifacts: [],
        };
        tasks.set(task.taskId, task);
        console.log(`[${SERVICE_NAME}] task created: ${task.taskId} (phase ${task.phase})`);
        return Response.json({ status: "created", taskId: task.taskId }, { status: 201 });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // POST /tasks/:id/complete — mark task complete, check phase gate
    const completeMatch = path.match(/^\/tasks\/([^/]+)\/complete$/);
    if (completeMatch && req.method === "POST") {
      try {
        const taskId = completeMatch[1];
        const task = tasks.get(taskId);
        if (!task) {
          return Response.json({ error: "Task not found" }, { status: 404 });
        }
        const body = await req.json().catch(() => ({}));
        task.status = "completed";
        task.artifacts = body.artifacts || [];
        task.completedAt = new Date().toISOString();
        console.log(`[${SERVICE_NAME}] task completed: ${taskId}`);

        // Check if all phase tasks complete
        if (phaseTasksComplete(task.featureSlug, task.phase)) {
          const gateResult = await emitPhaseGateCheck(task.featureSlug, task.phase, [...tasks.values()]);
          return Response.json({
            status: "completed",
            taskId,
            phaseGateTriggered: true,
            gateResult,
          });
        }
        return Response.json({ status: "completed", taskId, phaseGateTriggered: false });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // GET /tasks — list tasks (optional filter: ?featureSlug=...&phase=...)
    if (path === "/tasks" && req.method === "GET") {
      const featureSlug = url.searchParams.get("featureSlug");
      const phase = url.searchParams.get("phase");
      let result = [...tasks.values()];
      if (featureSlug) result = result.filter((t) => t.featureSlug === featureSlug);
      if (phase) result = result.filter((t) => t.phase === phase);
      return Response.json({ tasks: result });
    }

    // GET /tasks/:id — get a single task
    const getMatch = path.match(/^\/tasks\/([^/]+)$/);
    if (getMatch && req.method === "GET") {
      const task = tasks.get(getMatch[1]);
      if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
      return Response.json(task);
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
