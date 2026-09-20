#!/usr/bin/env bash
# Install and enable go2rtc systemd unit on Raspberry Pi.
# Usage: sudo ./install-go2rtc-systemd-linux.sh [service-user]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=edge-home.sh
. "$SCRIPT_DIR/edge-home.sh"
get_somnet_edge_paths

service_user="${1:-somnet}"
unit_src="$SCRIPT_DIR/../systemd/go2rtc.service"
unit_dest="/etc/systemd/system/go2rtc.service"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0 [$service_user]" >&2
  exit 1
fi

if [[ ! -x "$SOMNET_EDGE_BIN/go2rtc" ]]; then
  echo "go2rtc binary not found at $SOMNET_EDGE_BIN/go2rtc — run install-go2rtc-linux.sh first." >&2
  exit 1
fi

if [[ ! -f "$SOMNET_EDGE_CONFIG" ]]; then
  echo "Config not found at $SOMNET_EDGE_CONFIG — create go2rtc.yaml first." >&2
  exit 1
fi

if ! id "$service_user" &>/dev/null; then
  echo "User $service_user does not exist." >&2
  exit 1
fi

usermod -aG video,plugdev "$service_user" 2>/dev/null || usermod -aG video "$service_user"

sed "s/^User=.*/User=$service_user/" "$unit_src" \
  | sed "s/^Group=.*/Group=video/" \
  > "$unit_dest"

systemctl daemon-reload
systemctl enable go2rtc.service
systemctl restart go2rtc.service

echo "go2rtc systemd unit installed."
systemctl --no-pager status go2rtc.service
echo ""
echo "Commands:"
echo "  sudo systemctl status go2rtc"
echo "  sudo journalctl -u go2rtc -f"
echo "  sudo systemctl restart go2rtc"
