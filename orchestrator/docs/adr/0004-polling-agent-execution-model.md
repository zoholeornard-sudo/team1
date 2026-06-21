# ADR-0004: Polling-agent execution model

## Status
Accepted — 2026-06-21

## Context
designer1 (M1) and designer2 (A1) independently identified the same root defect: an agent invoked
via `/zo/ask` is request/response — it cannot hold a Redis subscriber loop to receive `TaskCreated`,
`CheckoutGranted`, or `MergeConflictDetected`. The original sketch described agents that both emit
and subscribe, but only the emit half had a viable mechanism.

This is the binding point between the orchestrator and the existing repo. It determines the shape
of `runtime/` and `packages/contracts/`.

## Decision
**Option (a) — polling agent model. `runtime/` is the stateful bridge; agents are stateless across
turns.**

| Aspect | Decision |
|--------|----------|
| `runtime/` role | The real agent runtime, not just a launcher. Subscribes to the bus, dequeues intents per instance, feeds each into a `/zo/ask` turn as seed context |
| Agent across turns | Stateless. Each turn is a fresh `/zo/ask` call; `runtime` holds all state between turns |
| Agent sees Redis? | **No.** Agents never import `bus-client`. All bus interaction is mediated by `runtime` |
| How agent receives work | `runtime` injects the matched `TaskCreated` payload into the turn's seed context |
| Heartbeat | Emitted by `runtime` on behalf of the child (every 30s while a turn is in flight; stall at 90s = 3 missed beats) |
| Phase introspection | `runtime` injects current phase + pending gates into every turn's seed context (no query API) |
| Agent emits intents | Via return-value contract from the turn (e.g. `{emit: [{type: "EditIntent", ...}]}`), not via a Redis client |

## Consequences
- **Benefits:** Fits `/zo/ask` cleanly, statelessness is honest, `runtime` as the bridge is fine,
  no agent-side bus code to get wrong, heartbeats are reliable (runtime owns the turn boundary).
- **Trade-offs:** `runtime/` is the agent-runtime SPOF (mitigated: it's supervised, restarts
  replay in-flight turns from the bus). Agent state across turns lives in `runtime`'s SQLite, not
  in the agent — agents must be designed turn-idempotent.
- **Milestone ordering impact (designer3):** This was the milestone-2 blocker, not milestone-1.
  The bus boot (milestone 1) is M1-independent. Ordering: 0 → 1 (bus boot) → 2 (spawn). M1 is now
  resolved, so both are unblocked.

## Alternatives considered
| Option | Pros | Cons | Why not |
|--------|------|------|--------|
| (b) Long-lived subprocess with own subscriber loop | Closer to "agent as persistent actor", agent holds its own state | More moving parts, agent-side bus code, harder to fit `/zo/ask`, state management in two places | More infra for milestones 0–4 with no clear benefit |
| Hybrid (subprocess that calls `/zo/ask` per turn) | Best of both | Still requires agent-side subscriber code | Same objection as (b) |

## MBO alignment
- Uptime impact: `runtime/` SPOF — mitigated by supervision + replay-on-boot.
- Performance impact: One `/zo/ask` call per turn. Turn latency dominates; bus hop is negligible.
