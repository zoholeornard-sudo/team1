/**
 * instance-manager — multi-instance orchestrator control plane
 * Port: :3098
 *
 * Manages multiple orchestrator instances on a single host.
 * Each instance gets: isolated port range, Redis DB, data directory, repo root.
 *
 * API:
 *   POST   /instances              — create instance
 *   GET    /instances              — list instances
 *   GET    /instances/:id          — get instance details
 *   POST   /instances/:id/start    — start all services
 *   POST   /instances/:id/stop     — stop all services
 *   DELETE /instances/:id          — destroy instance
 *   GET    /instances/:id/health   — aggregate health
 *   ALL    /i/:id/*                — proxy to instance orchestrator-api
 */
import { Database } from "bun:sqlite";

const PORT = Number(process.env.PORT) || 3098;
const SERVICE_NAME = "instance-manager";
const DB_PATH = process.env.INSTANCE_DB_PATH || "data/instances.db";
const BASE_PORT = 3100;
const PORT_STRIDE = 100; // Each instance gets 100 ports

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

// --- SQLite instance registry ---
const db = new Database(DB_PATH, { create: true });
db.run("PRAGMA journal_mode = WAL");

db.run(`
  CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repo_root TEXT NOT NULL,
    redis_db INTEGER NOT NULL DEFAULT 0,
    base_port INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'created',
    units TEXT NOT NULL DEFAULT '[]',
    mbo_target_path TEXT NOT NULL DEFAULT 'metrics/mbo-targets.yaml',
    heartbeat_interval_ms INTEGER NOT NULL DEFAULT 30000,
    stall_threshold_ms INTEGER NOT NULL DEFAULT 90000,
    process_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

console.log(`[${SERVICE_NAME}] SQLite initialized at ${DB_PATH}`);

// --- Types ---

interface Instance {
  id: string;
  name: string;
  repo_root: string;
  redis_db: number;
  base_port: number;
  status: "created" | "running" | "stopped" | "error";
  units: string[];
  mbo_target_path: string;
  heartbeat_interval_ms: number;
  stall_threshold_ms: number;
  process_ids: number[];
  created_at: string;
  updated_at: string;
}

interface ServiceDef {
  name: string;
  portOffset: number;
  path: string;
}

// Service definitions (must match port mapping table)
const SERVICES: ServiceDef[] = [
  { name: "orchestrator-api", portOffset: -1, path: "orchestrator-api/src/index.ts" },
  { name: "runtime", portOffset: 0, path: "runtime/src/index.ts" },
  { name: "task-management", portOffset: 1, path: "services/task-management/src/index.ts" },
  { name: "session-management", portOffset: 2, path: "services/session-management/src/index.ts" },
  { name: "health-monitoring", portOffset: 3, path: "services/health-monitoring/src/index.ts" },
  { name: "lifecycle-management", portOffset: 4, path: "services/lifecycle-management/src/index.ts" },
  { name: "event-coordination", portOffset: 5, path: "services/event-coordination/src/index.ts" },
  { name: "edit-coordinator", portOffset: 6, path: "services/edit-coordinator/src/index.ts" },
  { name: "agent-registry", portOffset: 7, path: "agent-registry/src/index.ts" },
  { name: "workflow", portOffset: 8, path: "services/workflow/src/index.ts" },
  { name: "manager-loop", portOffset: 9, path: "services/manager-loop/src/index.ts" },
  { name: "review-scheduler", portOffset: 10, path: "services/review-scheduler/src/index.ts" },
  { name: "conflict-detector", portOffset: 11, path: "services/conflict-detector/src/index.ts" },
  { name: "metric-alert", portOffset: 12, path: "services/metric-alert/src/index.ts" },
  { name: "feature-flag", portOffset: 13, path: "services/feature-flag/src/index.ts" },
];

// --- Port allocation ---

function allocatePorts(instanceIndex: number): { basePort: number; ports: Record<string, number> } {
  const basePort = BASE_PORT + (instanceIndex * PORT_STRIDE);
  const ports: Record<string, number> = {};
  for (const svc of SERVICES) {
    ports[svc.name] = basePort + svc.portOffset;
  }
  return { basePort, ports };
}

function getNextInstanceIndex(): number {
  const rows = db.query("SELECT COUNT(*) as cnt FROM instances").all() as any[];
  return rows[0]?.cnt || 0;
}

// --- Process management ---

const runningProcesses: Map<string, Map<string, any>> = new Map(); // instanceId -> {serviceName -> proc}

async function startInstance(instance: Instance): Promise<boolean> {
  console.log(`[${SERVICE_NAME}] Starting instance ${instance.id}...`);

  const serviceProcesses = new Map<string, any>();
  const processIds: number[] = [];

  for (const svc of SERVICES) {
    const port = instance.base_port + svc.portOffset;
    const env = {
      ...process.env,
      PORT: String(port),
      REDIS_URL: `redis://localhost:6379/${instance.redis_db}`,
      REPO_ROOT: instance.repo_root,
      INSTANCE_ID: instance.id,
      HEARTBEAT_INTERVAL_MS: String(instance.heartbeat_interval_ms),
      STALL_THRESHOLD_MS: String(instance.stall_threshold_ms),
      LIFECYCLE_DB_PATH: `data/instance-${instance.id}/lifecycle.db`,
      REGISTRY_DB_PATH: `data/instance-${instance.id}/registry.db`,
      WORKFLOW_DB_PATH: `data/instance-${instance.id}/workflow.duckdb`,
    };

    try {
      const proc = Bun.spawn(["bun", "run", svc.path], {
        env,
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      });

      serviceProcesses.set(svc.name, proc);
      processIds.push(proc.pid);
      console.log(`[${SERVICE_NAME}] Started ${svc.name} on :${port} (pid ${proc.pid})`);
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Failed to start ${svc.name}:`, err);
      // Kill already-started services
      for (const [, p] of serviceProcesses) {
        try { p.kill(); } catch {}
      }
      return false;
    }
  }

  runningProcesses.set(instance.id, serviceProcesses);

  // Update DB
  db.run(
    "UPDATE instances SET status = 'running', process_ids = ?, updated_at = ? WHERE id = ?",
    [JSON.stringify(processIds), new Date().toISOString(), instance.id]
  );

  console.log(`[${SERVICE_NAME}] Instance ${instance.id} started with ${processIds.length} services`);
  return true;
}

async function stopInstance(instanceId: string): Promise<boolean> {
  console.log(`[${SERVICE_NAME}] Stopping instance ${instanceId}...`);

  const procs = runningProcesses.get(instanceId);
  if (!procs) {
    console.warn(`[${SERVICE_NAME}] No running processes for ${instanceId}`);
    return false;
  }

  for (const [name, proc] of procs) {
    try {
      proc.kill();
      console.log(`[${SERVICE_NAME}] Stopped ${name} (pid ${proc.pid})`);
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Failed to stop ${name}:`, err);
    }
  }

  runningProcesses.delete(instanceId);

  db.run(
    "UPDATE instances SET status = 'stopped', process_ids = '[]', updated_at = ? WHERE id = ?",
    [new Date().toISOString(), instanceId]
  );

  return true;
}

// --- HTTP API ---

async function createInstance(req: Request): Promise<Response> {
  const body = await req.json() as {
    id?: string;
    name: string;
    repoRoot: string;
    units?: string[];
    mboTargetPath?: string;
    heartbeatIntervalMs?: number;
    stallThresholdMs?: number;
  };

  const id = body.id || `inst-${Date.now().toString(36)}`;
  const existing = db.query("SELECT id FROM instances WHERE id = ?").get(id);
  if (existing) {
    return Response.json({ error: `Instance ${id} already exists` }, { status: 409 });
  }

  const instanceIndex = getNextInstanceIndex();
  const { basePort } = allocatePorts(instanceIndex);
  const now = new Date().toISOString();

  db.run(`
    INSERT INTO instances (id, name, repo_root, redis_db, base_port, status, units, mbo_target_path, heartbeat_interval_ms, stall_threshold_ms, process_ids, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, '[]', ?, ?)
  `, [
    id,
    body.name,
    body.repoRoot,
    instanceIndex, // redis_db = index
    basePort,
    JSON.stringify(body.units || []),
    body.mboTargetPath || "metrics/mbo-targets.yaml",
    body.heartbeatIntervalMs || 30000,
    body.stallThresholdMs || 90000,
    now,
    now,
  ]);

  return Response.json({
    id,
    name: body.name,
    status: "created",
    basePort,
    redisDb: instanceIndex,
    ports: allocatePorts(instanceIndex).ports,
  }, { status: 201 });
}

async function listInstances(req: Request): Promise<Response> {
  const rows = db.query("SELECT * FROM instances ORDER BY created_at DESC").all();
  const instances = rows.map((r: any) => ({
    ...r,
    units: JSON.parse(r.units),
    process_ids: JSON.parse(r.process_ids),
  }));
  return Response.json({ instances, count: instances.length });
}

async function getInstance(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.pathname.split("/")[2];
  const row = db.query("SELECT * FROM instances WHERE id = ?").get(id) as any;
  if (!row) return new Response("Instance not found", { status: 404 });

  return Response.json({
    ...row,
    units: JSON.parse(row.units),
    process_ids: JSON.parse(row.process_ids),
  });
}

async function deleteInstance(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.pathname.split("/")[2];

  // Stop if running
  await stopInstance(id);

  db.run("DELETE FROM instances WHERE id = ?", [id]);
  return Response.json({ success: true, id, status: "deleted" });
}

async function getHealth(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.pathname.split("/")[2];
  const row = db.query("SELECT * FROM instances WHERE id = ?").get(id) as any;
  if (!row) return new Response("Instance not found", { status: 404 });

  // Check each service health
  const health: Record<string, any> = {};
  let allHealthy = true;

  for (const svc of SERVICES) {
    const port = row.base_port + svc.portOffset;
    try {
      const resp = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(2000) });
      const data = await resp.json();
      health[svc.name] = { status: "ok", ...data };
    } catch {
      health[svc.name] = { status: "unreachable" };
      allHealthy = false;
    }
  }

  return Response.json({ instanceId: id, allHealthy, services: health });
}

// --- API Gateway: proxy /i/:id/* to instance orchestrator-api ---

async function proxyToInstance(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const instanceId = parts[2];
  const targetPath = "/" + parts.slice(3).join("/");

  const row = db.query("SELECT base_port FROM instances WHERE id = ?").get(instanceId) as any;
  if (!row) return new Response("Instance not found", { status: 404 });

  const targetPort = row.base_port - 1; // orchestrator-api is at basePort - 1
  const targetUrl = `http://localhost:${targetPort}${targetPath}${url.search}`;

  try {
    const proxyResp = await fetch(targetUrl, {
      method: req.method,
      headers: req.headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? await req.blob() : undefined,
    });

    return new Response(proxyResp.body, {
      status: proxyResp.status,
      headers: proxyResp.headers,
    });
  } catch (err) {
    return Response.json({ error: `Instance ${instanceId} unreachable` }, { status: 502 });
  }
}

// --- HTTP Server ---

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/health") {
        return Response.json({
          service: SERVICE_NAME,
          status: "ok",
          port: PORT,
          instancesTracked: (db.query("SELECT COUNT(*) as cnt FROM instances").get() as any)?.cnt || 0,
          runningInstances: runningProcesses.size,
        });
      }

      if (url.pathname === "/instances" && req.method === "POST") return createInstance(req);
      if (url.pathname === "/instances" && req.method === "GET") return listInstances(req);

      if (url.pathname.match(/^\/instances\/[^/]+\/start$/) && req.method === "POST") {
        const id = url.pathname.split("/")[2];
        const row = db.query("SELECT * FROM instances WHERE id = ?").get(id) as any;
        if (!row) return new Response("Instance not found", { status: 404 });
        const success = await startInstance({
          ...row,
          units: JSON.parse(row.units),
          process_ids: JSON.parse(row.process_ids),
        });
        return Response.json({ success, id, status: success ? "running" : "error" });
      }

      if (url.pathname.match(/^\/instances\/[^/]+\/stop$/) && req.method === "POST") {
        const id = url.pathname.split("/")[2];
        const success = await stopInstance(id);
        return Response.json({ success, id, status: "stopped" });
      }

      if (url.pathname.match(/^\/instances\/[^/]+\/health$/) && req.method === "GET") {
        return getHealth(req);
      }

      if (url.pathname.match(/^\/instances\/[^/]+$/) && req.method === "GET") {
        return getInstance(req);
      }

      if (url.pathname.match(/^\/instances\/[^/]+$/) && req.method === "DELETE") {
        return deleteInstance(req);
      }

      // API Gateway: /i/:id/* → proxy to instance
      if (url.pathname.match(/^\/i\/[^/]+/)) {
        return proxyToInstance(req);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
