/**
 * task-management — bounded context service (ADR-0001)
 * Port: :3101
 *
 * Subscribes to:
 * - intents:task-created → creates task records
 * - intents:task-completed → updates task status
 *
 * Publishes:
 * - intents:task-created (on spawn)
 * - intents:task-completed (on agent return)
 */
import { BusClient, createBusClient } from "@orchestrator/bus-client";
import { TaskCreatedPayload, TaskCompletedPayload } from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3101;
const SERVICE_NAME = "task-management";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

const bus = createBusClient({ url: REDIS_URL });

// In-memory task store (SQLite in production)
interface TaskRecord {
  taskId: string;
  featureSlug: string;
  assignedInstance: string;
  phase: string;
  description: string;
  acceptanceCriteria: string[];
  mboMetrics: { name: string; target: string }[];
  state: "pending" | "in_progress" | "done" | "blocked";
  createdAt: string;
  updatedAt: string;
}

const tasks: Map<string, TaskRecord> = new Map();

// --- Intent handlers ---

async function handleTaskCreated(payload: TaskCreatedPayload) {
  console.log(`[${SERVICE_NAME}] Task created: ${payload.taskId} for ${payload.featureSlug}`);

  tasks.set(payload.taskId, {
    taskId: payload.taskId,
    featureSlug: payload.featureSlug,
    assignedInstance: payload.assignedInstance,
    phase: payload.phase,
    description: payload.description,
    acceptanceCriteria: payload.acceptanceCriteria,
    mboMetrics: payload.mboMetrics,
    state: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function handleTaskCompleted(payload: TaskCompletedPayload) {
  console.log(`[${SERVICE_NAME}] Task completed: ${payload.taskId} by ${payload.instanceId}`);

  const task = tasks.get(payload.taskId);
  if (task) {
    task.state = payload.result === "done" ? "done" : "blocked";
    task.updatedAt = new Date().toISOString();
  }
}

// --- Start bus subscription ---

async function startBus() {
  await bus.connect();
  console.log(`[${SERVICE_NAME}] Connected to Redis`);

  await Promise.all([
    bus.subscribe("intents:task-created", SERVICE_NAME, `${SERVICE_NAME}-1`, async (envelope) => {
      await handleTaskCreated(envelope.payload as TaskCreatedPayload);
    }),
    bus.subscribe("intents:task-completed", SERVICE_NAME, `${SERVICE_NAME}-2`, async (envelope) => {
      await handleTaskCompleted(envelope.payload as TaskCompletedPayload);
    }),
  ]);
}

// --- HTTP API ---

async function getTasks(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const featureSlug = url.searchParams.get("featureSlug");
  const state = url.searchParams.get("state");

  let taskList = Array.from(tasks.values());
  if (featureSlug) taskList = taskList.filter(t => t.featureSlug === featureSlug);
  if (state) taskList = taskList.filter(t => t.state === state);

  return Response.json({ tasks: taskList, count: taskList.length });
}

async function getTask(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const taskId = url.pathname.split("/").pop()!;

  const task = tasks.get(taskId);
  if (!task) {
    return new Response("Task not found", { status: 404 });
  }

  return Response.json(task);
}

async function createTask(req: Request): Promise<Response> {
  const body = await req.json() as TaskCreatedPayload;

  tasks.set(body.taskId, {
    taskId: body.taskId,
    featureSlug: body.featureSlug,
    assignedInstance: body.assignedInstance,
    phase: body.phase,
    description: body.description,
    acceptanceCriteria: body.acceptanceCriteria,
    mboMetrics: body.mboMetrics,
    state: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await bus.publish("intents:task-created", {
    type: "TaskCreated",
    idempotencyKey: `task-created-${body.taskId}`,
    featureSlug: body.featureSlug,
    instanceId: body.assignedInstance,
    branch: `feature/${body.featureSlug}`,
    timestamp: new Date().toISOString(),
    payload: body,
  });

  return Response.json({ success: true, taskId: body.taskId });
}

// Start HTTP server first so /health responds before the blocking subscribe loop starts.
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
          tasksTracked: tasks.size,
          redis: redisOk ? "connected" : "disconnected",
        });
      }

      if (url.pathname === "/tasks" && req.method === "GET") {
        return getTasks(req);
      }

      if (url.pathname === "/task" && req.method === "POST") {
        return createTask(req);
      }

      if (url.pathname.startsWith("/task/") && req.method === "GET") {
        return getTask(req);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);

// Start bus subscriptions after the HTTP server is listening.
// subscribe() enters an infinite xreadgroup loop and would block Bun.serve() if called first.
startBus().catch(console.error);
