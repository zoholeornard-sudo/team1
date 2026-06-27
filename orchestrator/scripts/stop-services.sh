#!/usr/bin/env bash
# stop-services.sh — kill all orchestrator service processes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

for name in orchestrator-api runtime agent-registry task-management session-management \
  health-monitoring lifecycle-management event-coordination edit-coordinator \
  workflow manager-loop review-scheduler conflict-detector metric-alert; do
  pkill -f "bun run .*/src/index.ts" 2>/dev/null && echo "[stop] killed $name" || true
done

echo "[stop] done"
