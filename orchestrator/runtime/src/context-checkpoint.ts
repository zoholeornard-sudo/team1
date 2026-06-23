/**
 * runtime — Context Checkpoint Module (gstack extraction Initiative 4)
 *
 * Extracted from gstack /context-save + /context-restore pattern.
 * Serializes agent working state to disk on every TurnEnd; loads it on
 * SessionStarted to support stall/reassign without total context loss.
 *
 * Checkpoints live in orchestrator/data/checkpoints/<instanceId>.json
 * and follow the ContextCheckpoint contract from @team1/contracts.
 */
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ContextCheckpoint } from "@team1/contracts";

const CHECKPOINT_DIR =
  process.env.CHECKPOINT_DIR || join(process.cwd(), "data", "checkpoints");

/** Ensure the checkpoint directory exists. Called once at boot. */
export function initCheckpointStore(): void {
  mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

/** Persist a checkpoint for an agent instance. Called on every TurnEnd. */
export function saveCheckpoint(instanceId: string, checkpoint: ContextCheckpoint): void {
  const path = join(CHECKPOINT_DIR, `${instanceId}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(checkpoint, null, 2), "utf8");
}

/** Load a checkpoint for an agent instance. Called on SessionStarted or reassign. */
export function loadCheckpoint(instanceId: string): ContextCheckpoint | null {
  const path = join(CHECKPOINT_DIR, `${instanceId}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ContextCheckpoint;
  } catch {
    console.error(`[context-checkpoint] corrupt checkpoint for ${instanceId}`);
    return null;
  }
}

/** Remove a checkpoint after a successful reap. Called by the supervisor. */
export function clearCheckpoint(instanceId: string): void {
  const path = join(CHECKPOINT_DIR, `${instanceId}.json`);
  if (existsSync(path)) unlinkSync(path);
}

/** List all active checkpoints (for debugging / admin dashboard). */
export function listCheckpoints(): { instanceId: string; savedAt: string }[] {
  if (!existsSync(CHECKPOINT_DIR)) return [];
  return readdirSync(CHECKPOINT_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const instanceId = f.replace(/\.json$/, "");
      const cp = loadCheckpoint(instanceId);
      return { instanceId, savedAt: cp?.savedAt ?? "unknown" };
    })
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
