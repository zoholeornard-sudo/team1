# ADR-0005: Merge-to-main pipeline (single-writer MergeLock)

## Status
Accepted — 2026-06-28

## Context
Spawned agents commit to `feature/<slug>-<handle>-N` branches (ADR-0003). The full lifecycle — Planning through Analysis (Phase 7) — is gated by `lifecycle-management`. But nothing moves code from a completed feature branch into `main`. There is no `MergeIntent`, no merge-gate service, and no Manager-approval step for merges.

Consequences:
- Feature branches accumulate indefinitely.
- No integration testing between concurrent features on a shared `main`.
- No single-writer serialization for merges — two features completing simultaneously could race on `main`.

## Decision
**New `merge-coordinator` service holds a single global `MergeLock`. Features enqueue on `MergeReady`; the coordinator runs a pre-merge dry-run, requests Manager approval, executes the merge under lock, then runs post-merge async tests on a worktree clone (Tier 2, no lock held).**

### Pipeline

```
Phase 7 gate passes
    │
    ▼
MergeReady (lifecycle-management → merge-coordinator)
    │
    ▼
MergeQueued (SQLite-backed FIFO)
    │
    ▼
MergeLock acquired (single writer, 60s TTL)
    │
    ▼
Pre-merge dry-run (git merge --no-commit --no-ff)
    │
    ├── conflict → MergeConflictDetected → queue entry failed
    │
    ▼
MergePendingApproval (→ manager-loop → Manager agent)
    │
    ├── reject → queue entry rejected
    ├── requeue → back to queued
    │
    ▼
MergeApproved
    │
    ▼
git merge --no-ff + git push origin main
    │
    ▼
MergeApplied
    │
    ▼
Post-merge async test (worktree clone, no lock)
    │
    ├── test failed → git revert -m 1 → MergeReverted
    │
    ▼
Done
```

### Single-writer precedent
ADR-0003 established a global `WriteLock` in `edit-coordinator` for agent-branch edits. This is the same pattern one level up: a `MergeLock` for `main`. The lock is held only for the `git merge + push` operation (Tier 1); post-merge tests run asynchronously on a worktree clone (Tier 2) with no lock held.

### Manager authority
Consistent with AGENTS.md's "Manager authority" principle: agents propose (`MergeReady`), managers dispose (`MergeApproved` with `approve | reject | requeue`). The `manager-loop` service subscribes to `MergePendingApproval` and emits `MergeApproved`. In milestone 6+ this will route through the Manager agent via `/zo/ask`; for M1 the auto-approves after logging.

### SQLite persistence
The merge queue is backed by SQLite (`data/merge.db`), surviving restarts — consistent with every other service's persistence choice.

## Consequences
- **Benefits:** Serializes merges to `main` (no race conditions), integrates with the existing intent-bus pattern, Manager approval gate, post-merge test with automatic revert on failure.
- **Trade-offs:** Global lock serializes merges (one at a time). Acceptable while <10 concurrent features complete per cycle. Upgrade path: per-path-prefix merge locks or parallel merge trains (milestone 6+).
- **Pre-merge dry-run cost:** Adds ~2-5s per merge for the `git merge --no-commit` + abort. Acceptable.

## Alternatives considered
| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| PR-based merge via GitHub | Familiar workflow, GitHub review UI | Agents don't have GitHub identity; requires GitHub App integration; breaks the intent-bus model | Too much infra for M1 |
| Optimistic merge with conflict rejection | No serialization | Merge conflicts on `main` are expensive to resolve mid-feature; same reason ADR-0003 rejected optimistic concurrency for edits | ADR-0003 rejected this pattern |
| Agent self-merge | No new service needed | Violates Manager authority principle; no single-writer gate | AGENTS.md requires Manager authority for state-changing operations |

## MBO alignment
- Uptime impact: None (merge path, not runtime).
- Performance impact: Serializes merges. Acceptable while <10 concurrent features.
- Quality impact: Positive — post-merge test gate prevents regressions on `main`.

## Upgrade path (milestone 6+)
1. Per-path-prefix merge locks for parallel merges of disjoint file sets.
2. Merge trains (batch multiple features into a single merge commit).
3. Integration test optimization: run tests on the main branch directly (not worktree) with a rollback capability.
