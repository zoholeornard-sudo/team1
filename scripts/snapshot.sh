#!/usr/bin/env bash
# Sprint 0 — Baseline audit script
# Exports current orchestrator state to a snapshot file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ORCHESTRATOR_DIR="$PROJECT_ROOT/orchestrator"
SNAPSHOT_DIR="$PROJECT_ROOT/projects/team1"
SNAPSHOT_FILE="$SNAPSHOT_DIR/orchestrator-snapshot-v0.json"

echo "=== Orchestrator Baseline Audit (Sprint 0) ==="
echo "Project root: $PROJECT_ROOT"
echo "Snapshot file: $SNAPSHOT_FILE"

# Ensure output directory exists
mkdir -p "$SNAPSHOT_DIR"

# Build snapshot
echo "[" > "$SNAPSHOT_FILE"
echo "  {" >> "$SNAPSHOT_FILE"
echo "    \"snapshotVersion\": \"v0\"," >> "$SNAPSHOT_FILE"
echo "    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> "$SNAPSHOT_FILE"
echo "    \"orchestrator\": {" >> "$SNAPSHOT_FILE"

# 1. Services
echo "      \"services\": [" >> "$SNAPSHOT_FILE"
first=true
for service_dir in "$ORCHESTRATOR_DIR"/services/*/; do
  service_name=$(basename "$service_dir")
  if [ "$first" = true ]; then
    first=false
  else
    echo "," >> "$SNAPSHOT_FILE"
  fi
  echo -n "        {\"name\": \"$service_name\", \"path\": \"${service_dir#$SCRIPT_DIR/}\"}" >> "$SNAPSHOT_FILE"
done
echo "" >> "$SNAPSHOT_FILE"
echo "      ]," >> "$SNAPSHOT_FILE"

# 2. Contracts (intent types)
echo "      \"intentTypes\": [" >> "$SNAPSHOT_FILE"
# Extract intent types from contracts src
CONTRACTS_FILE="$ORCHESTRATOR_DIR/packages/contracts/src/intents.ts"
first=true
while IFS= read -r line; do
  intent=$(echo "$line" | sed 's/.*"\([^"]*\)".*/\1/' | tr -d ' ')
  if [ -n "$intent" ]; then
    if [ "$first" = true ]; then
      first=false
    else
      echo "," >> "$SNAPSHOT_FILE"
    fi
    echo -n "        \"$intent\"" >> "$SNAPSHOT_FILE"
  fi
done < <(grep -E '^\s+\|"[A-Z][a-zA-Z]+"' "$CONTRACTS_FILE" 2>/dev/null | head -50)
echo "" >> "$SNAPSHOT_FILE"
echo "      ]," >> "$SNAPSHOT_FILE"

# 3. ADRs
echo "      \"adrs\": [" >> "$SNAPSHOT_FILE"
first=true
for adr in "$ORCHESTRATOR_DIR"/docs/adr/*.md; do
  if [ -f "$adr" ]; then
    if [ "$first" = true ]; then
      first=false
    else
      echo "," >> "$SNAPSHOT_FILE"
    fi
    adr_name=$(basename "$adr")
    echo -n "        {\"file\": \"docs/adr/$adr_name\"}" >> "$SNAPSHOT_FILE"
  fi
done
echo "" >> "$SNAPSHOT_FILE"
echo "      ]," >> "$SNAPSHOT_FILE"

# 4. Redis keyspaces
echo "      \"redisKeyspaces\": [" >> "$SNAPSHOT_FILE"
REDIS_KEYSPACES_FILE="$ORCHESTRATOR_DIR/infra/redis-keyspaces.md"
if [ -f "$REDIS_KEYSPACES_FILE" ]; then
  first=true
  while IFS= read -r line; do
    keyspace=$(echo "$line" | sed 's/.*`\([^`]*\)`.*/\1/' | tr -d ' ')
    if [ -n "$keyspace" ] && echo "$keyspace" | grep -qvE '^\|.*\|$'; then
      if [ "$first" = true ]; then
        first=false
      else
        echo "," >> "$SNAPSHOT_FILE"
      fi
      echo -n "        \"$keyspace\"" >> "$SNAPSHOT_FILE"
    fi
  done < <(grep -oP '`\K[a-z][a-z0-9:_-]+' "$REDIS_KEYSPACES_FILE" 2>/dev/null | sort -u | head -20)
fi
echo "" >> "$SNAPSHOT_FILE"
echo "      ]" >> "$SNAPSHOT_FILE"

echo "    }" >> "$SNAPSHOT_FILE"
echo "  }" >> "$SNAPSHOT_FILE"
echo "]" >> "$SNAPSHOT_FILE"

echo ""
echo "=== Snapshot complete ==="
echo "Output: $SNAPSHOT_FILE"
echo ""
echo "Service count: $(find "$ORCHESTRATOR_DIR/services" -maxdepth 1 -type d ! -path "$ORCHESTRATOR_DIR/services" 2>/dev/null | wc -l)"
echo "Intent types: $(grep -cE '^\s+\|"[A-Z]' "$CONTRACTS_FILE" 2>/dev/null || echo 0)"
echo "ADRs: $(find "$ORCHESTRATOR_DIR/docs/adr" -name "*.md" 2>/dev/null | wc -l)"