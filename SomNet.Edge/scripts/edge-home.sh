#!/usr/bin/env bash
# SomNet Edge install root — default /opt/somnet-edge (override: SOMNET_EDGE_HOME)
# Source from other scripts: . "$(dirname "$0")/edge-home.sh"

get_somnet_edge_home() {
  if [[ -n "${SOMNET_EDGE_HOME:-}" ]]; then
    echo "$SOMNET_EDGE_HOME"
  else
    echo "/opt/somnet-edge"
  fi
}

get_somnet_edge_paths() {
  local base
  base="$(get_somnet_edge_home)"
  SOMNET_EDGE_BASE="$base"
  SOMNET_EDGE_BIN="$base/bin"
  SOMNET_EDGE_CONFIG="$base/go2rtc.yaml"
  SOMNET_EDGE_LOGS="$base/logs"
}
