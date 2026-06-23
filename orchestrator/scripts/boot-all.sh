#!/usr/bin/env bash
# Boot all orchestrator services as background processes.
# Requires: Redis running on localhost:6379
# Usage: bash scripts/boot-all.sh

set -euo pipefail
cd "$(dirname "$0")/.."

LOG_DIR="/dev/shm"
PIDS=()

# Services with HTTP ports
declare -A SERVICES=(
  ["task-management"]="3101"
  ["session-management"]="3102"
  ["health-monitoring"]="3103"
  ["lifecycle-management"]="3104"
  ["event-coordination"]="3105"
  ["agent-registry"]="3106"
  ["orchestrator-api"]="3098"
)

echo "=== Booting orchestrator services ==="

# Start each HTTP service
for name in task-management session-management health-monitoring lifecycle-management event-coordination agent-registry orchestrator-api; do
  port="${SERVICES[$name]}"
  dir=""
  case "$name" in
    agent-registry|orchestrator-api) dir="$name" ;;
    *) dir="services/$name" ;;
  esac
  echo "  Starting $name on :$port..."
  PORT="$port" bun "$dir/src/index.ts" > "$LOG_DIR/orch-$name.log" 2>&1 &
  PIDS+=($!)
  echo "    PID: $!"
done

# Start edit-coordinator (process-only, no port)
echo "  Starting edit-coordinator (no port)..."
bun services/edit-coordinator/src/index.ts > "$LOG_DIR/orch-edit-coordinator.log" 2>&1 &
PIDS+=($!)
echo "    PID: $!"

# Save PIDs for shutdown
echo "${PIDS[@]}" > "$LOG_DIR/orch-pids.txt"

# Wait for services to be healthy
echo ""
echo "=== Waiting for health checks ==="
sleep 2

ALL_HEALTHY=true
for name in task-management session-management health-monitoring lifecycle-management event-coordination agent-registry orchestrator-api; do
  port="${SERVICES[$name]}"
  if curl -s "http://localhost:$port/healthz" | grep -q '"ok"' 2>/dev/null; then
    echo "  ✓ $name (:$port) healthy"
  else
    echo "  ✗ $name (:$port) NOT healthy"
    ALL_HEALTHY=false
  fi
done

if [ "$ALL_HEALTHY" = true ]; then
  echo ""
  echo "=== All services healthy ==="
  echo "Run 'bash scripts/shutdown-all.sh' to stop."
else
  echo ""
  echo "=== Some services failed to boot — check logs in /dev/shm/orch-*.log ==="
fi
