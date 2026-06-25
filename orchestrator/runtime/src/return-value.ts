/**
 * runtime — Return-value parser (ADR-0004)
 *
 * Parses the agent's /zo/ask response for the structured return-value contract:
 * { emit: [...], checkpoint: {...}, result: "...", progressNote: "..." }
 *
 * Defensive: agents may wrap JSON in fenced code blocks or add prose around it.
 * We extract the first valid JSON object that looks like the contract.
 */
import { v4 as uuid } from "uuid";
import type {
  IntentEnvelope,
  IntentType,
  ContextCheckpoint,
} from "@team1/contracts";

export interface EmitDirective {
  type: IntentType;
  payload: Record<string, unknown>;
}

export interface ParsedReturnValue {
  emit: EmitDirective[];
  checkpoint?: ContextCheckpoint;
  result?: "done" | "blocked" | "needs-review" | null;
  progressNote?: string;
  raw: string;
}

/**
 * Extract the first JSON object from text that contains the expected keys.
 * Handles fenced code blocks and surrounding prose.
 */
function extractJson(text: string): any | null {
  // Try fenced code block first: ```json ... ``` or ``` ... ```
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through to brute-force
    }
  }

  // Brute-force: find the first { ... } that parses, matching braces
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          start = -1;
        }
      }
    }
  }
  return null;
}

export function parseReturnValue(raw: string): ParsedReturnValue {
  const parsed = extractJson(raw);

  if (!parsed || typeof parsed !== "object") {
    return { emit: [], raw };
  }

  const emit: EmitDirective[] = Array.isArray(parsed.emit)
    ? parsed.emit
        .filter((e: any) => e && typeof e.type === "string")
        .map((e: any) => ({
          type: e.type as IntentType,
          payload: (e.payload && typeof e.payload === "object" ? e.payload : {}) as Record<
            string,
            unknown
          >,
        }))
    : [];

  let checkpoint: ContextCheckpoint | undefined;
  if (parsed.checkpoint && typeof parsed.checkpoint === "object") {
    const cp = parsed.checkpoint;
    checkpoint = {
      taskId: String(cp.taskId ?? ""),
      decisions: Array.isArray(cp.decisions)
        ? cp.decisions.map((d: any) => ({
            description: String(d?.description ?? ""),
            rationale: String(d?.rationale ?? ""),
            timestamp: String(d?.timestamp ?? new Date().toISOString()),
          }))
        : [],
      filesTouched: Array.isArray(cp.filesTouched) ? cp.filesTouched.map(String) : [],
      remainingSteps: Array.isArray(cp.remainingSteps)
        ? cp.remainingSteps.map(String)
        : [],
      lastTurnId: String(cp.lastTurnId ?? ""),
      savedAt: String(cp.savedAt ?? new Date().toISOString()),
    };
  }

  const result =
    parsed.result === "done" || parsed.result === "blocked" || parsed.result === "needs-review"
      ? parsed.result
      : null;

  return {
    emit,
    checkpoint,
    result,
    progressNote: typeof parsed.progressNote === "string" ? parsed.progressNote : undefined,
    raw,
  };
}

/**
 * Wrap an emit directive into a full IntentEnvelope with the mandatory fields
 * the runtime is responsible for (idempotencyKey, featureSlug, branch, timestamp).
 */
export function wrapIntent(
  directive: EmitDirective,
  featureSlug: string,
  branch: string,
  instanceId: string
): IntentEnvelope<any> {
  return {
    type: directive.type,
    idempotencyKey: `${directive.type}-${featureSlug}-${instanceId}-${uuid()}`,
    featureSlug,
    branch,
    instanceId,
    timestamp: new Date().toISOString(),
    payload: directive.payload as any,
  };
}
