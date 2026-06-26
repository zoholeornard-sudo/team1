/**
 * conflict-detector — bounded context service (ADR-0001, P4 of refinement plan)
 * Port: :3111
 *
 * Conflict & redundancy handling:
 * - Detects contradictory proposals from multiple agents on same task
 * - Detects duplicate work (two agents producing same output)
 * - Detects resource contention (concurrent checkout requests)
 * - Spawns BackupAgent when conflict score exceeds threshold
 * - Merges results after timeout
 */
import {
  IntentType,
  ConflictDetectedPayload,
  BackupAgentSpawnedPayload,
} from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3111;
const SERVICE_NAME = "conflict-detector";

// Configuration
const CONFLICT_THRESHOLD = Number(process.env.CONFLICT_THRESHOLD) || 0.7;
const BACKUP_TIMEOUT_MS = Number(process.env.BACKUP_TIMEOUT_MS) || 60000;

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

// In-memory state: track active proposals per task
interface Proposal {
  instanceId: string;
  workflowId: string;
  taskId: string;
  outputHash: string;
  content: string;
  timestamp: string;
}

interface ConflictRecord {
  workflowId: string;
  taskId: string;
  proposals: Proposal[];
  conflictScore: number;
  conflictType: "contradictory_output" | "duplicate_work" | "resource_contention";
  resolved: boolean;
  backupSpawned: boolean;
  backupInstance?: string;
}

const proposals: Map<string, Proposal[]> = new Map(); // taskId → proposals
const conflicts: Map<string, ConflictRecord> = new Map(); // taskId → conflict

// --- Intent emission (stub — will use Redis in production) ---

function emitIntent<T extends IntentType>(type: T, payload: any) {
  const envelope = {
    type,
    idempotencyKey: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    featureSlug: payload.featureSlug || "unknown",
    timestamp: new Date().toISOString(),
    payload,
  };
  console.log(`[${SERVICE_NAME}] Emitting intent: ${type}`, JSON.stringify(envelope, null, 2));
  return envelope;
}

// --- Conflict detection logic ---

function computeConflictScore(proposals: Proposal[]): number {
  if (proposals.length < 2) return 0;

  // Simple heuristic: count unique outputs
  const uniqueOutputs = new Set(proposals.map(p => p.outputHash));
  const duplicateCount = proposals.length - uniqueOutputs.size;

  // Score = ratio of conflicting proposals
  return (proposals.length - uniqueOutputs.size) / (proposals.length - 1);
}

function classifyConflict(proposals: Proposal[]): "contradictory_output" | "duplicate_work" | "resource_contention" {
  const uniqueOutputs = new Set(proposals.map(p => p.outputHash));

  if (uniqueOutputs.size === 1) {
    return "duplicate_work"; // All proposals are identical
  }

  if (proposals.length > 2 && uniqueOutputs.size === proposals.length) {
    return "resource_contention"; // All different, likely competing for same resource
  }

  return "contradictory_output"; // Some agree, some disagree
}

function detectConflict(workflowId: string, taskId: string): ConflictRecord | null {
  const taskProposals = proposals.get(taskId) || [];
  if (taskProposals.length < 2) return null;

  const score = computeConflictScore(taskProposals);
  const type = classifyConflict(taskProposals);

  if (score >= CONFLICT_THRESHOLD) {
    const conflict: ConflictRecord = {
      workflowId,
      taskId,
      proposals: taskProposals,
      conflictScore: score,
      conflictType: type,
      resolved: false,
      backupSpawned: false,
    };

    conflicts.set(taskId, conflict);

    // Emit conflict detected
    const conflictPayload: ConflictDetectedPayload = {
      workflowId,
      taskId,
      conflictingInstances: taskProposals.map(p => p.instanceId),
      conflictType: type,
      details: `Conflict score ${score.toFixed(2)} exceeds threshold ${CONFLICT_THRESHOLD}`,
    };

    emitIntent("ConflictDetected", conflictPayload);

    // Spawn backup agent for resolution
    const backupInstance = `backup-${taskId}-${Date.now()}`;
    conflict.backupSpawned = true;
    conflict.backupInstance = backupInstance;

    const backupPayload: BackupAgentSpawnedPayload = {
      workflowId,
      taskId,
      primaryInstance: taskProposals[0].instanceId,
      backupInstance,
      reason: `Conflict detected: ${type} (score: ${score.toFixed(2)})`,
    };

    emitIntent("BackupAgentSpawned", backupPayload);

    // Set timeout for merge
    setTimeout(() => {
      resolveConflict(taskId);
    }, BACKUP_TIMEOUT_MS);

    return conflict;
  }

  return null;
}

function resolveConflict(taskId: string) {
  const conflict = conflicts.get(taskId);
  if (!conflict || conflict.resolved) return;

  console.log(`[${SERVICE_NAME}] Resolving conflict for task ${taskId}`);
  conflict.resolved = true;

  // In production: merge outputs from backup agent
  // For now, mark as resolved with primary instance winning
  proposals.delete(taskId);
}

// --- HTTP API ---

async function submitProposal(req: Request): Promise<Response> {
  const body = await req.json() as {
    instanceId: string;
    workflowId: string;
    taskId: string;
    outputHash: string;
    content: string;
  };

  const proposal: Proposal = {
    instanceId: body.instanceId,
    workflowId: body.workflowId,
    taskId: body.taskId,
    outputHash: body.outputHash,
    content: body.content,
    timestamp: new Date().toISOString(),
  };

  // Store proposal
  const existing = proposals.get(body.taskId) || [];
  existing.push(proposal);
  proposals.set(body.taskId, existing);

  // Check for conflicts
  const conflict = detectConflict(body.workflowId, body.taskId);

  return Response.json({
    success: true,
    taskId: body.taskId,
    proposalCount: existing.length,
    conflictDetected: !!conflict,
    conflictScore: conflict?.conflictScore,
    conflictType: conflict?.conflictType,
    backupSpawned: conflict?.backupSpawned,
    backupInstance: conflict?.backupInstance,
  });
}

async function getConflicts(req: Request): Promise<Response> {
  const conflictList = Array.from(conflicts.values());
  return Response.json({
    conflicts: conflictList,
    count: conflictList.length,
    unresolved: conflictList.filter(c => !c.resolved).length,
  });
}

async function getProposals(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId");

  if (taskId) {
    const taskProposals = proposals.get(taskId) || [];
    return Response.json({ taskId, proposals: taskProposals, count: taskProposals.length });
  }

  const allProposals: Proposal[] = [];
  for (const taskProposals of proposals.values()) {
    allProposals.push(...taskProposals);
  }
  return Response.json({ proposals: allProposals, count: allProposals.length });
}

async function manualResolve(req: Request): Promise<Response> {
  const body = await req.json() as { taskId: string; winningInstance: string };

  const conflict = conflicts.get(body.taskId);
  if (!conflict) {
    return new Response("No conflict found for task", { status: 404 });
  }

  conflict.resolved = true;
  proposals.delete(body.taskId);

  return Response.json({
    success: true,
    taskId: body.taskId,
    winningInstance: body.winningInstance,
    resolved: true,
  });
}

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
          conflictThreshold: CONFLICT_THRESHOLD,
          backupTimeoutMs: BACKUP_TIMEOUT_MS,
          activeConflicts: Array.from(conflicts.values()).filter(c => !c.resolved).length,
          totalProposals: Array.from(proposals.values()).reduce((sum, p) => sum + p.length, 0),
        });
      }

      if (url.pathname === "/proposal" && req.method === "POST") {
        return submitProposal(req);
      }

      if (url.pathname === "/conflicts" && req.method === "GET") {
        return getConflicts(req);
      }

      if (url.pathname === "/proposals" && req.method === "GET") {
        return getProposals(req);
      }

      if (url.pathname === "/resolve" && req.method === "POST") {
        return manualResolve(req);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(`[${SERVICE_NAME}] Error:`, err);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);