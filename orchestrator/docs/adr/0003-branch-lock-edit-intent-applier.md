# ADR-0003: Branch lock + edit-intent applier (single-writer)

## Status
Accepted — 2026-06-21

## Context
Decision 1 (branch-only, no worktrees) means one working directory. Multiple agents editing
concurrently would corrupt the repo. We need a serialization point.

The hard part: agents invoked via `/zo/ask` are request/response — they cannot hold a lock across
turns. The lock model must be turn-bounded.

## Decision
**`edit-coordinator` holds a single global `WriteLock`. Agents emit `AcquireCheckout{batch}` with
the full edit batch attached; the coordinator applies atomically and releases.**

Protocol (turn-bounded):
1. Agent emits `AcquireCheckout{batch}` with all edits in the batch.
2. `edit-coordinator` either:
   - Acquires lock → `git checkout <branch>` → applies edits → commits → releases lock →
     returns `EditApplied{commitSha}`, **or**
   - Returns `CheckoutDenied{retryAfterMs}` (lock busy).
3. Agent's turn ends either way. `runtime` re-enters the agent later if denied.
4. **The agent never holds a lock.** The lock lives in the coordinator for the duration of one
   apply. This kills the "agent holds lock, does more work, releases" pattern (unimplementable over
   `/zo/ask` anyway).

## Consequences
- **Benefits:** Turn-bounded (fits `/zo/ask`), no agent-side retry logic (coordinator decides
  retry timing), single serialization point is simple to reason about, commits are atomic per batch.
- **Trade-offs:** Global lock serializes all writes across all agents/units. At bursty concurrency
  this is a ceiling. Test execution under the lock is a known issue (designer1 M2) — deferred to
  milestone 3: tests run after release on a throwaway `git worktree add` clone, or split
  `WriteLock` (short) + async tests with a `TestFailed` revert intent.
- **Upgrade path:** Per-path-prefix locks or sharded coordinators (milestone 6) when the global
  lock becomes the bottleneck. The `AcquireCheckout` contract is prefix-extendable.

## Alternatives considered
| Option | Pros | Cons | Why not |
|--------|------|------|--------|
| Per-agent worktree (decision 1 rejected this) | True parallelism | Violates branch-only decision; 39 worktrees unmanageable | Decision 1 locked |
| Optimistic concurrency (no lock, merge on conflict) | No serialization | Merge conflicts mid-feature are expensive to resolve at the agent level | Conflict resolution is milestone 5, not milestone 0 |
| Per-file locks | Finer granularity | Deadlock risk, complex to acquire multi-file batches atomically | Premature; global lock is simpler and sufficient for milestones 0–4 |

## MBO alignment
- Uptime impact: None (write path, not read path).
- Performance impact: Serializes commits. Acceptable while agent count < ~10 concurrent writers.
  Milestone 6 upgrade path documented.
