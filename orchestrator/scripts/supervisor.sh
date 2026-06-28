#!/usr/bin/env bash
# supervisor.sh — process supervisor for orchestrator services
# Auto-restarts crashed services, monitors health, structured logging
# Usage: bash scripts/supervisor.sh [--interval 30] [--max-restarts 5]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export LOG_LEVEL="${LOG_LEVEL:-info}"

# Configuration
INTERVAL="${1:-30}"
MAX_RESTARTS="${2:-5}"
RESTART_WINDOW=300  # 5 minutes
LOG_DIR="${LOG_DIR:-/tmp/orchestrator}"
mkdir -p "$LOG_DIR"

# Service definitions: name|script|port|health_path
SERVICES=(
  "orchestrator-api|orchestrator-api/src/index.ts|3099|/health"
  "runtime|runtime/src/index.ts|3100|/health"
  "agent-registry|agent-registry/src/index.ts|3107|/health"
  "task-management|services/task-management/src/index.ts|3101|/health"
  "session-management|services/session-management/src/index.ts|3102|/health"
  "health-monitoring|services/health-monitoring/src/index.ts|3103|/health"
  "lifecycle-management|services/lifecycle-management/src/index.ts|3104|/health"
  "event-coordination|services/event-coordination/src/index.ts|3105|/health"
  "edit-coordinator|services/edit-coordinator/src/index.ts|3106|/health"
  "workflow|services/workflow/src/index.ts|3108|/health"
  "manager-loop|services/manager-loop/src/index.ts|3109|/health"
  "review-scheduler|services/review-scheduler/src/index.ts|3110|/health"
  "conflict-detector|services/conflict-detector/src/index.ts|3111|/health"
  "metric-alert|services/metric-alert/src/index.ts|3112|/health"
  "instance-manager|services/instance-manager/src/index.ts|3098|/health"
)

# State tracking
declare -A PID_MAP
declare -A RESTART_COUNT
declare -A RESTART_FIRST_TS

log() {
  local level="$1"; shift
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "{\"ts\":\"$ts\",\"level\":\"$level\",\"component\":\"supervisor\",\"$*\"}" | tee -a "$LOG_DIR/supervisor.log" >&2
}

start_service() {
  local name="$1" script="$2"
  local logfile="$LOG_DIR/${name}.log"

  # Kill existing if running
  if [[ -n "${PID_MAP[$name]:-}" ]] && kill -0 "${PID_MAP[$name]}" 2>/dev/null; then
    return 0
  fi

  log "info" "msg" "starting $name" "script" "$script"
  bun "$script" >> "$logfile" 2>&1 &
  PID_MAP[$name]=$!
  log "info" "msg" "started $name" "pid" "${PID_MAP[$name]}"
}

check_service() {
  local name="$1" port="$2" health_path="$3"
  local url="http://localhost:${port}${health_path}"

  local resp
  resp=$(curl -s --max-time 3 "$url" 2>/dev/null || echo "")
  if [[ -n "$resp" ]]; then
    return 0
  fi
  return 1
}

restart_service() {
  local name="$1" script="$2"
  local now
  now=$(date +%s)

  # Rate limiting
  if [[ -z "${RESTART_FIRST_TS[$name]:-}" ]]; then
    RESTART_FIRST_TS[$name]=$now
    RESTART_COUNT[$name]=0
  fi

  local window_age=$((now - RESTART_FIRST_TS[$name]))
  if (( window_age > RESTART_WINDOW )); then
    RESTART_FIRST_TS[$name]=$now
    RESTART_COUNT[$name]=0
  fi

  RESTART_COUNT[$name]=$((${RESTART_COUNT[$name]:-0} + 1))

  if (( RESTART_COUNT[$name] > MAX_RESTARTS )); then
    log "error" "msg" "max restarts exceeded for $name" "count" "${RESTART_COUNT[$name]}"
    return 1
  fi

  # Kill old process
  if [[ -n "${PID_MAP[$name]:-}" ]]; then
    kill -9 "${PID_MAP[$name]}" 2>/dev/null || true
    wait "${PID_MAP[$name]}" 2>/dev/null || true
  fi

  log "warn" "msg" "restarting $name" "attempt" "${RESTART_COUNT[$name]}"
  start_service "$name" "$script"
  return 0
}

cleanup() {
  log "info" "msg" "shutting down supervisor"
  for name in "${!PID_MAP[@]}"; do
    if [[ -n "${PID_MAP[$name]:-}" ]]; then
      kill -9 "${PID_MAP[$name]}" 2>/dev/null || true
    fi
  done
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# --- Main loop ---
log "info" "msg" "supervisor starting" "interval" "$INTERVAL" "max_restarts" "$MAX_RESTARTS"

# Initial start
for svc in "${SERVICES[@]}"; do
  IFS='|' read -r name script port health_path <<< "$svc"
  start_service "$name" "$script"
done

log "info" "msg" "all services started" "count" "${#SERVICES[@]}"

# Monitor loop
while true; do
  sleep "$INTERVAL"
  for svc in "${SERVICES[@]}"; do
    IFS='|' read -r name script port health_path <<< "$svc"

    # Check if process is alive
    if [[ -n "${PID_MAP[$name]:-}" ]] && ! kill -0 "${PID_MAP[$name]}" 2>/dev/null; then
      log "error" "msg" "process died" "service" "$name" "pid" "${PID_MAP[$name]}"
      restart_service "$name" "$script"
      continue
    fi

    # Check health endpoint
    if ! check_service "$name" "$port" "$health_path"; then
      log "warn" "msg" "health check failed" "service" "$name" "port" "$port"
      restart_service "$name" "$script"
    fi
  done
done
