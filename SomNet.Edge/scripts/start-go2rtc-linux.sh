#!/usr/bin/env bash
# Start go2rtc for SomNet Phase 7 Pi bench.
# Docs: Documents/20-Video-Phase-7-Pi-Production-Checklist.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=edge-home.sh
. "$SCRIPT_DIR/edge-home.sh"
get_somnet_edge_paths

example="$SCRIPT_DIR/../config/go2rtc.yaml.pi.example"
exe="$SOMNET_EDGE_BIN/go2rtc"

if [[ ! -x "$exe" ]]; then
  echo "go2rtc not found at $exe"
  echo "Run: sudo ./install-go2rtc-linux.sh"
  exit 1
fi

if [[ ! -f "$SOMNET_EDGE_CONFIG" ]]; then
  mkdir -p "$SOMNET_EDGE_BASE"
  cp "$example" "$SOMNET_EDGE_CONFIG"
  echo "Created $SOMNET_EDGE_CONFIG from Pi example — edit camera devices before use."
fi

echo "Edge home: $SOMNET_EDGE_BASE"
echo "Config:    $SOMNET_EDGE_CONFIG"
echo "Web UI:    http://localhost:1984"
echo "Front:     http://localhost:1984/stream.html?src=front"
echo "Rear:      http://localhost:1984/stream.html?src=rear"
echo ""
echo "Tip: v4l2-ctl --list-devices  then  ls -l /dev/v4l/by-id/"

cd "$SOMNET_EDGE_BIN"
exec ./go2rtc -config "$SOMNET_EDGE_CONFIG"
