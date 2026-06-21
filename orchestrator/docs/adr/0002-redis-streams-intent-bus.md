# ADR-0002: Redis Streams as the intent bus

## Status
Accepted — 2026-06-21

## Context
The 6 bounded-context services (ADR-0001) need to communicate. Requirements:
- At-least-once delivery (agents must not lose work intents).
- Consumer groups (multiple instances of a service can share a stream).
- Idempotency support (retries must be safe).
- Replay on boot (crash recovery without a shared transaction).

Options: Redis Streams, Kafka, NATS JetStream, in-process event emitter.

## Decision
**Redis Streams with consumer groups.** One stream per intent type
(`intents:task-created`, `intents:edit-applied`, etc.).

- **Transport:** `packages/bus-client` wraps Redis Streams for intra-service pub/sub.
- **Policy layer:** `event-coordination` (:3105) validates + routes cross-service intents.
  Services do not bypass it for cross-context intents.
- **Idempotency:** Every intent carries a mandatory `idempotencyKey` (24h TTL dedupe map per
  service). `DeadLetter` stream captures poisons.
- **Crash recovery:** Each service records its last-acked stream position in its SQLite DB.
  On boot, it replays from that position to rebuild in-memory state. This makes at-least-once +
  per-service SQLite consistent without a shared transaction.
- **Keyspace prefixes:** Documented in `infra/redis-keyspaces.md`.

## Consequences
- **Benefits:** Already running (Loki stack uses Redis infra), consumer groups for free, replay
  semantics are clean, single-process deploy for milestones 0–4.
- **Trade-offs:** Redis is the bus SPOF (mitigated: it's already a platform dependency). Single-host
  only (no cross-host agent fan-out until Kafka swap). No exactly-once (mitigated by idempotency keys).
- **Upgrade path:** When cross-host agents or >1 orchestrator process are needed, swap Redis Streams
  for Kafka. The `bus-client` interface is transport-agnostic by design — only the implementation
  changes. Documented as ADR-0005 (deferred).

## Alternatives considered
| Option | Pros | Cons | Why not |
|--------|------|------|--------|
| Kafka | Cross-host, exactly-once, mature | Heavyweight for milestones 0–4, extra process, overkill for single-host | Premature; bus-client is swap-ready |
| NATS JetStream | Lighter than Kafka, at-least-once | Less familiar, no existing infra | No existing deployment |
| In-process emitter | Zero infra | No persistence, no replay, no consumer groups | Fails crash recovery requirement |

## MBO alignment
- Uptime impact: Redis SPOF — mitigated by existing platform dependency + AOF persistence.
- Performance impact: Sub-ms in-process stream reads. Negligible vs. agent turn latency (seconds).
