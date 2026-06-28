#!/usr/bin/env bash
# Boot the instance manager and create + start instances
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT/orchestrator"

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

echo "=== Booting Instance Manager on :3098 ==="
bun run services/instance-manager/src/index.ts &
INSTANCE_MANAGER_PID=$!
sleep 2

echo "=== Creating Instance: team1 ==="
curl -s -X POST http://localhost:3098/instances \
  -H "Content-Type: application/json" \
  -d '{
    "id": "team1",
    "name": "Team1 Primary",
    "repoRoot": "/workspaces/team1",
    "units": ["SaaS Development Unit", "Cloud Infrastructure Unit"]
  }' | python3 -m json.tool

echo ""
echo "=== Starting Instance: team1 ==="
curl -s -X POST http://localhost:3098/instances/team1/start | python3 -m json.tool

echo ""
echo "=== Instance Status ==="
curl -s http://localhost:3098/instances | python3 -m json.tool

echo ""
echo "=== Health Check ==="
sleep 3
curl -s http://localhost:3098/instances/team1/health | python3 -m json.tool

echo ""
echo "Instance manager PID: $INSTANCE_MANAGER_PID"
echo "To stop: kill $INSTANCE_MANAGER_PID"
