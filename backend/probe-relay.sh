#!/usr/bin/env bash
# Simple relay probe script.
# Usage:
#   RELAY_HOST=http://localhost:8001 ./probe-relay.sh

set -euo pipefail

RELAY_HOST="${RELAY_HOST:-http://localhost:8001}"
API_EXECUTE="${RELAY_HOST%/}/api/execute_method"

echo "Probing relay at: $RELAY_HOST"
echo
echo "GET /"
curl -i --max-time 5 "$RELAY_HOST" || echo "GET failed"
echo
echo "OPTIONS /api/execute_method"
curl -i -X OPTIONS --max-time 5 "$API_EXECUTE" || echo "OPTIONS failed"
echo
echo "POST /api/execute_method (simple payload)"
curl -i -X POST -H "Content-Type: application/json" --data '{"model":"res.partner","method":"search_read","args":[],"kwargs":{}}' --max-time 10 "$API_EXECUTE" || echo "POST failed"
echo
echo "Done."