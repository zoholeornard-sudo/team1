#!/usr/bin/env bash
# Shutdown all orchestrator services.
# Usage: bash scripts/shutdown-all.sh

set -euo pipefail
PIDS_FILE="/dev/shm/orch-pids.txt"

if [ ! -f "$PIDS_FILE" ]; then
  echo "No PID file found at $PIDS_FILE — nothing to shut down."
  exit 0
fi

read -ra PIDS < "$PIDS_FILE"
for pid in "${PIDS[@]}"; do
  if kill -0 "$pid" 2>/dev/null; then
    echo "  Killing PID $pid..."
    kill "$pid" 2>/dev/null || true
  fi
done

# Also kill any lingering bun processes serving on orchestrator ports
for port in 3101 3102 3103 3104 3105 3106 3099; do
  pid=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "  Killing process on :$port (PID $pid)..."
    kill "$pid" 2>/dev/null || true
  fi
done

rm -f "$PIDS_FILE"
echo "All orchestrator services stopped."
