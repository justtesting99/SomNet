#!/usr/bin/env bash
# Download go2rtc linux arm64 into /opt/somnet-edge/bin (or SOMNET_EDGE_HOME)
# Usage: sudo ./install-go2rtc-linux.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=edge-home.sh
. "$SCRIPT_DIR/edge-home.sh"
get_somnet_edge_paths

arch="$(uname -m)"
case "$arch" in
  aarch64|arm64) asset_name='go2rtc_linux_arm64' ;;
  armv7l|armhf) asset_name='go2rtc_linux_arm' ;;
  *)
    echo "Unsupported architecture: $arch" >&2
    exit 1
    ;;
esac

mkdir -p "$SOMNET_EDGE_BIN" "$SOMNET_EDGE_LOGS"

release_json="$(curl -fsSL -H 'User-Agent: SomNet-Setup' \
  'https://api.github.com/repos/AlexxIT/go2rtc/releases/latest')"
tag="$(echo "$release_json" | grep -o '"tag_name": "[^"]*"' | head -1 | cut -d'"' -f4)"
download_url="https://github.com/AlexxIT/go2rtc/releases/download/${tag}/${asset_name}"

if [[ -z "$tag" ]]; then
  echo "Unable to resolve latest go2rtc release tag." >&2
  exit 1
fi

echo "Installing ${tag} (${asset_name}) to ${SOMNET_EDGE_BIN} ..."
curl -fsSL "$download_url" -o "$SOMNET_EDGE_BIN/go2rtc"
chmod +x "$SOMNET_EDGE_BIN/go2rtc"

example="$SCRIPT_DIR/../config/go2rtc.yaml.pi.example"
if [[ ! -f "$SOMNET_EDGE_CONFIG" ]]; then
  cp "$example" "$SOMNET_EDGE_CONFIG"
  echo "Created config: $SOMNET_EDGE_CONFIG"
else
  echo "Config already exists: $SOMNET_EDGE_CONFIG (not overwritten)"
fi

echo "Installed: $SOMNET_EDGE_BIN/go2rtc"
echo "Edge home: $SOMNET_EDGE_BASE"
echo "Next: edit $SOMNET_EDGE_CONFIG for your /dev/video* paths, then start-go2rtc-linux.sh"
