#!/usr/bin/env bash
# boot-services.sh — start all 14 orchestrator services in the background.
# Logs go to /tmp/orchestrator-<service>.log.
# Usage: bash scripts/boot-services.sh [--force]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

FORCE="${1:-}"

declare -A SERVICES=(
  [orchestrator-api]="orchestrator-api/src/index.ts"
  [runtime]="runtime/src/index.ts"
  [agent-registry]="agent-registry/src/index.ts"
  # NOTE: agent-registry, orchestrator-api, runtime are top-level packages.
  # bun resolves them via the workspace, not via services/ prefix.
  [task-management]="services/task-management/src/index.ts"
  [session-management]="services/session-management/src/index.ts"
  [health-monitoring]="services/health-monitoring/src/index.ts"
  [lifecycle-management]="services/lifecycle-management/src/index.ts"
  [event-coordination]="services/event-coordination/src/index.ts"
  [edit-coordinator]="services/edit-coordinator/src/index.ts"
  [workflow]="services/workflow/src/index.ts"
  [manager-loop]="services/manager-loop/src/index.ts"
  [review-scheduler]="services/review-scheduler/src/index.ts"
  [conflict-detector]="services/conflict-detector/src/index.ts"
  [metric-alert]="services/metric-alert/src/index.ts"
  [instance-manager]="services/instance-manager/src/index.ts"
)

for name in "${!SERVICES[@]}"; do
  script="${SERVICES[$name]}"
  if [[ -n "$FORCE" ]]; then
    pkill -f "bun.*${script}" 2>/dev/null || true
  fi
  echo "[boot] starting $name → bun $script"
  bun "$script" > "/tmp/orchestrator-${name}.log" 2>&1 &
done

echo "[boot] waiting for services to bind..."
sleep 8

echo "[boot] health sweep (with retries):"
FAIL=0
for port in 3098 3099 3100 3101 3102 3103 3104 3105 3106 3107 3108 3109 3110 3111 3112; do
  resp=""
  for attempt in 1 2 3; do
    resp=$(curl -s --max-time 2 "http://localhost:$port/health" 2>/dev/null || true)
    [[ -n "$resp" ]] && break
    sleep 1
  done
  if [[ -n "$resp" ]]; then
    svc=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('service','?'))" 2>/dev/null || echo "?")
    st=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "?")
    printf "  :%s → %s (%s)\n" "$port" "$svc" "$st"
  else
    printf "  :%s → DOWN\n" "$port"
    FAIL=1
  fi
done

if [[ "$FAIL" -eq 0 ]]; then
  echo "[boot] all 14 services healthy"
else
  echo "[boot] some services are down — check /tmp/orchestrator-<name>.log"
fi
