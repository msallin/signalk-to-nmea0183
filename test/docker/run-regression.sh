#!/bin/bash
# Run the full regression test: start SK server, inject fixtures, capture NMEA, validate.
# Usage: cd test/docker && bash run-regression.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$REPO_DIR/test/output"
mkdir -p "$OUTPUT_DIR"

echo "=== Step 1: Start Signal K server ==="
cd "$SCRIPT_DIR"
docker compose down -v 2>/dev/null || true
docker compose up -d

echo "Waiting for server to become healthy..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:3000/signalk > /dev/null 2>&1; then
    echo "Server ready after ${i}s"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: Server did not start within 60s"
    docker compose logs
    docker compose down -v
    exit 1
  fi
  sleep 1
done

# Give the plugin time to initialize
sleep 3

echo ""
echo "=== Step 2: Inject fixture data ==="
cd "$REPO_DIR"
# Install ws dependency for the inject script (if not present)
npm ls ws 2>/dev/null || npm install --no-save ws 2>/dev/null
node test/docker/inject-fixtures.js

echo ""
echo "=== Step 3: Capture NMEA output ==="
# Connect to NMEA TCP port and capture for 5 seconds
timeout 5 bash -c 'cat < /dev/tcp/localhost/10110' > "$OUTPUT_DIR/nmea-raw.txt" 2>/dev/null || true

LINECOUNT=$(wc -l < "$OUTPUT_DIR/nmea-raw.txt" || echo 0)
echo "Captured $LINECOUNT NMEA sentences"

if [ "$LINECOUNT" -eq 0 ]; then
  echo "WARNING: No NMEA output captured. Trying nc fallback..."
  timeout 5 nc localhost 10110 > "$OUTPUT_DIR/nmea-raw.txt" 2>/dev/null || true
  LINECOUNT=$(wc -l < "$OUTPUT_DIR/nmea-raw.txt" || echo 0)
  echo "Captured $LINECOUNT NMEA sentences (nc)"
fi

echo ""
echo "=== Step 4: Validate ==="
node test/docker/validate-nmea.js "$OUTPUT_DIR/nmea-raw.txt" | tee "$OUTPUT_DIR/validation-report.txt"

echo ""
echo "=== Step 5: Cleanup ==="
cd "$SCRIPT_DIR"
docker compose down -v

echo ""
echo "Results saved to: $OUTPUT_DIR/"
echo "  nmea-raw.txt          - raw NMEA capture"
echo "  validation-report.txt - validation results"
