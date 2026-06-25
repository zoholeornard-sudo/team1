/**
 * runtime — Seed context assembly (ADR-0004)
 *
 * Builds the prompt fed into each /zo/ask turn. This is where the lifecycle-loop
 * extraction becomes live: the current lifecycle phase is injected here, and the
 * agent's skill file (whose Turn protocol block now carries the Phase 1/2/3/7
 * execution protocols) tells the agent what to do for that phase.
 *
 * The return-value contract instructs the agent to emit intents as structured JSON
 * (ADR-0004: "Agent emits intents via return-value contract, not via a Redis client").
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  AgentAssigned,
  TaskCreated,
  ContextCheckpoint,
} from "@team1/contracts";

const SKILL_FILES_DIR =
  process.env.SKILL_FILES_DIR || resolve(process.cwd(), "..", "agent-skills");

/** Map a persona handle (e.g. "@architect-agent") to its skill file path. */
function skillFilePath(personaHandle: string): string {
  const slug = personaHandle.replace(/^@/, "");
  return join(SKILL_FILES_DIR, `${slug}-skills.md`);
}

function loadSkillFile(personaHandle: string): string {
  const path = skillFilePath(personaHandle);
  if (!existsSync(path)) {
    return `(Skill file not found at ${path}. Proceeding with the task below.)`;
  }
  return readFileSync(path, "utf8");
}

export interface SeedContextInput {
  assignment: AgentAssigned;
  task: TaskCreated;
  priorCheckpoint?: ContextCheckpoint | null;
}

export interface SeedContext {
  prompt: string;
  instanceId: string;
  branch: string;
  featureSlug: string;
  personaHandle: string;
  phase: string;
  conversationId?: string;
}

const RETURN_VALUE_CONTRACT = `
## Return-value contract (how you communicate with the Orchestrator)

You do NOT have a Redis client. You communicate by returning a JSON object. The runtime
parses it and publishes your intents on your behalf.

Return EXACTLY this shape (as a fenced JSON block or raw JSON):

\`\`\`json
{
  "emit": [
    { "type": "<IntentType>", "payload": { ...matches the intent's payload interface... } }
  ],
  "checkpoint": {
    "taskId": "<the task id>",
    "decisions": [{ "description": "...", "rationale": "...", "timestamp": "<ISO-8601>" }],
    "filesTouched": ["path/a.ts"],
    "remainingSteps": ["next step", "..."],
    "lastTurnId": "<turn id>",
    "savedAt": "<ISO-8601>"
  },
  "result": "done" | "blocked" | "needs-review" | null,
  "progressNote": "one-line human-readable summary of this turn"
}
\`\`\`

Rules:
- "emit" is an array of intents you want published. Common types by phase:
  - Phase 2 (Architecture): emit "PhaseReviewScore" with your lens score (0-10) + rationale.
  - Phase 3 (Implementation): emit "AcquireCheckout" with your full edit batch + scopePaths.
    Emit "ScopeChangeRequest" if you need to edit outside your declared scope.
  - Phase 4 (Testing): emit "TestFailed" for structural-review findings, or "PhaseGateCheck".
  - Phase 5 (Deployment): emit "DeployVerified" with status (HEALTHY/DEGRADED/REVERTED) + url.
  - Any phase: emit "EditIntent" with op=progress to log your progress report.
- "checkpoint" is mandatory on every turn — it's how you survive a stall/reassign.
- "result": set to "done" when the task is complete, "blocked" when you need help,
  "needs-review" when work is complete but needs Manager review. Omit/null to continue.
- The runtime wraps each emit in an IntentEnvelope (idempotencyKey, featureSlug, branch,
  timestamp) — you only provide type + payload.
`;

export function buildSeedContext(input: SeedContextInput): SeedContext {
  const { assignment, task, priorCheckpoint } = input;
  const payload = assignment.payload;
  const taskPayload = task?.payload ?? payload.taskPayload;
  const skillContent = loadSkillFile(payload.personaHandle);

  const checkpointBlock = priorCheckpoint
    ? `## Prior context (resuming after stall/reassign)

You are NOT starting fresh. A previous instance of you was working on this and saved state:

- Task: ${priorCheckpoint.taskId}
- Decisions made: ${priorCheckpoint.decisions.map((d) => `- ${d.description} (${d.rationale})`).join("\n") || "(none)"}
- Files touched: ${priorCheckpoint.filesTouched.join(", ") || "(none)"}
- Remaining steps: ${priorCheckpoint.remainingSteps.map((s) => `- ${s}`).join("\n") || "(none)"}
- Saved at: ${priorCheckpoint.savedAt}

Pick up where the prior instance left off. Do not redo completed work unless you find it wrong.`
    : `## Prior context

None — this is your first turn on this task.`;

  const mboBlock =
    taskPayload.mboMetrics.length > 0
      ? taskPayload.mboMetrics.map((m) => `- ${m.name}: target ${m.target}`).join("\n")
      : "(none specified)";

  const prompt = `You are ${payload.personaHandle}, an agent in the team1 Orchestrator (polling-agent model, ADR-0004). You are stateless across turns — the runtime holds your state. Execute the current turn, then return structured output per the contract below.

--- YOUR SKILL FILE (role, skills, collaboration matrix, escalation triggers, turn protocol, phase execution protocols) ---
${skillContent}
--- END SKILL FILE ---

## Current assignment

- Feature slug: ${assignment.featureSlug}
- Instance ID: ${payload.instanceId}
- Branch: ${payload.branch}
- Persona: ${payload.personaHandle}

## Lifecycle phase

You are in: **${taskPayload.phase}**

Follow the Phase execution protocol for this phase in your skill file's Turn protocol section. That protocol tells you what to do when this phase opens.

## Task

${taskPayload.description}

### Acceptance criteria
${taskPayload.acceptanceCriteria.map((c) => `- ${c}`).join("\n") || "(none)"}

### MBO metrics for this task
${mboBlock}

${checkpointBlock}

${RETURN_VALUE_CONTRACT}

Now execute this turn. Return the JSON object per the contract above.`;

  return {
    prompt,
    instanceId: payload.instanceId,
    branch: payload.branch,
    featureSlug: assignment.featureSlug,
    personaHandle: payload.personaHandle,
    phase: taskPayload.phase,
  };
}
