# ADR-0001: Bounded contexts as processes

## Status
Accepted — 2026-06-21

## Context
The team1 platform has 9 units and 39 agents organized by MBO. The DDD skill (reconciled from
[v3-ddd-architecture](../../agent-skills/references/v3-ddd-architecture-reference.md)) defines
core bounded contexts: task-management, session-management, health-monitoring,
lifecycle-management, event-coordination. The orchestrator needs to decompose work across these
contexts while keeping each independently deployable and testable.

The question: are bounded contexts in-process modules, or separate processes?

## Decision
**Each core bounded context is a separate process (microservice), one per DDD domain.**

- 6 services: task-management, session-management, health-monitoring,
  lifecycle-management, event-coordination, edit-coordinator.
- Each owns its SQLite database (no cross-service joins).
- Each binds its own port (:3101–:3106).
- Each imports `packages/contracts` for shared intent types.
- Communication is via the Redis Streams intent bus, not direct calls.

## Consequences
- **Benefits:** Independent restart, independent scaling, clear ownership, failure isolation,
  matches the unit/agent model 1:1 (each unit's work routes to its owning context).
- **Trade-offs:** 6 processes to supervise, no cross-DB transactions (mitigated by replay-on-boot,
  see ADR-0002), operational complexity vs. a monolith.
- **Compliance impact:** None — internal architecture.

## Alternatives considered
| Option | Pros | Cons | Why not |
|--------|------|------|--------|
| In-process modules (monolith) | Simpler ops, shared transactions | God-object risk, no failure isolation, contradicts the DDD skill's decomposition goal | Re-introduces the 1,440-line orchestrator problem the DDD skill exists to solve |
| Serverless functions | Auto-scaling, no process management | Cold starts, hard to hold bus subscriptions, vendor lock-in | Doesn't fit the always-on bus-consumer model |

## MBO alignment
- Uptime impact: Neutral (failure isolation is a wash vs. monolith restart).
- Performance impact: ~1ms cross-service bus hop vs. in-process call. Acceptable for the intent bus (async by design).
