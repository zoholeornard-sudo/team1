#!/usr/bin/env bash
# team1 — Workspace ↔ Remote Sync Script
# Usage: ./scripts/sync-with-remote.sh [--push-only | --pull-only]
# Default: pull → commit local changes → push

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

MODE="${1:---full}"
DRY_RUN="${DRY_RUN:-false}"

echo "=== team1 sync: $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="

# --- Pull phase ---
if [[ "$MODE" != "--push-only" ]]; then
  echo "[1/3] Fetching remote..."
  git fetch origin 2>&1

  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main)

  if [[ "$LOCAL" != "$REMOTE" ]]; then
    # Check if we have local changes to stash
    if ! git diff --quiet || ! git diff --cached --quiet; then
      echo "[1/3] Stashing local changes before pull..."
      git stash push -m "sync-auto-stash-$(date +%s)" 2>&1
      STASHED=true
    else
      STASHED=false
    fi

    echo "[1/3] Pulling (fast-forward)..."
    git pull --ff-only origin main 2>&1

    if [[ "$STASHED" == "true" ]]; then
      echo "[1/3] Re-applying stashed changes..."
      if git stash pop 2>&1; then
        echo "[1/3] Stash applied cleanly."
      else
        echo "[WARN] Stash conflict — manual resolution needed. Stash retained."
        exit 1
      fi
    fi
  else
    echo "[1/3] Already up to date."
  fi
fi

# --- Commit phase ---
if [[ "$MODE" != "--pull-only" ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "[2/3] Committing local changes..."
    git add -A
    COMMIT_MSG="sync: auto-commit from Zo workspace ($(date -u '+%Y-%m-%dT%H:%M:%SZ'))"
    git commit -m "$COMMIT_MSG" 2>&1
  else
    echo "[2/3] No local changes to commit."
  fi

  # --- Push phase ---
  LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "")
  REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "")

  if [[ -n "$LOCAL" && "$LOCAL" != "$REMOTE" ]]; then
    echo "[3/3] Pushing to origin/main..."
    if [[ "$DRY_RUN" == "true" ]]; then
      echo "[3/3] DRY RUN — skipping push."
    else
      git push origin main 2>&1
    fi
  else
    echo "[3/3] Already in sync with remote."
  fi
fi

echo "=== Sync complete ==="
