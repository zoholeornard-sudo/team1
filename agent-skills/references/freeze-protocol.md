# Freeze Protocol — Per-Directory Edit Scoping

**Source:** Extracted from gstack `/freeze` skill (v1.58.4.0)
**Binding on:** `edit-coordinator` service + `AcquireCheckout` intent handler
**Binding rule:** **An agent's edit batch is validated against a frozen-path allowlist before it is applied.** Out-of-scope edits are rejected, not warned.

---

## How it works

When a task is created (`TaskCreated` intent), `task-management` derives a **frozen-paths allowlist** from the task's scope:

```
frozenPaths = [
  "orchestrator/services/task-management/",
  "orchestrator/packages/contracts/src/",
  "agent-skills/architect-agent-skills.md"  # if the task touches skill files
]
```

This allowlist is attached to the `TaskCreated` payload and propagated to `AcquireCheckout` via the agent's seed context. When the agent emits `AcquireCheckout{batch}`, the `edit-coordinator` validates every edit in the batch:

```
for each edit in batch:
  if edit.path is not under any frozenPaths entry:
    reject with CheckoutDenied{reason: "out-of-scope: <path>"}
```

**Out-of-scope edits never reach the filesystem.** The agent's entire batch is rejected atomically — no partial application.

---

## Allowlist derivation rules

| Task type | Frozen paths |
|-----------|-------------|
| Feature implementation (Phase 3) | The service/package directories named in the task's acceptance criteria |
| Architecture doc (Phase 2) | `orchestrator/docs/adr/`, `.main.lifecycle.md`, the specific design doc |
| Test authoring (Phase 4) | `orchestrator/test/`, the service's `tests/` dir |
| Skill file update (any phase) | The specific `agent-skills/*.md` file(s) named in the task |
| Progress report (any phase) | `00_workspace/working_files/progress/<handle>-*.md` — always allowed, never frozen out |
| Artifact index update | `00_workspace/working_files/ARTIFACT_INDEX.md` — always allowed |

**Progress reports and artifact-index updates are never frozen.** An agent can always log its activity, even if its code edits are scoped to a narrow directory.

---

## Manager override

A unit Manager can expand the frozen-paths allowlist for a task by emitting a `SpawnAgents` or `TaskCreated` with an expanded `scope` field. This is the only way to widen scope mid-task — agents cannot self-expand.

## Escalation trigger

An agent that receives `CheckoutDenied{reason: "out-of-scope"}` three times for the same path should escalate to the unit Manager — the task scope may be incorrectly defined, not the agent's behavior.
