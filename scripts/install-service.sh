#!/usr/bin/env bash
# Install Helm as a background service (starts at login, restarts on crash).
# Reads GATEWAYS from .env and installs one service per gateway:
#   discord  -> index.js
#   imessage -> imessage.js   (macOS only)
#   macOS    -> launchd user agents (com.helm.<gw>)
#   Linux    -> systemd --user units (helm-<gw>.service)   [discord only]
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="$(command -v node)"
[ -n "$NODE" ] || { echo "node not found on PATH"; exit 1; }
[ -f "$DIR/.env" ] || { echo "No .env in $DIR — run the installer first."; exit 1; }

# parse GATEWAYS (default discord)
GATEWAYS="$(grep -E '^GATEWAYS=' "$DIR/.env" | head -n1 | cut -d= -f2- | tr -d '[:space:]')"
[ -n "$GATEWAYS" ] || GATEWAYS="discord"

script_for() { case "$1" in discord) echo "index.js";; imessage) echo "imessage.js";; *) echo "";; esac; }

install_mac() {
  local gw="$1" script="$2" label="com.helm.$gw"
  local plist="$HOME/Library/LaunchAgents/$label.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$label</string>
<key>ProgramArguments</key><array>
<string>$NODE</string>
<string>$DIR/$script</string></array>
<key>WorkingDirectory</key><string>$DIR</string>
<key>EnvironmentVariables</key><dict>
<key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string>
<key>HOME</key><string>$HOME</string></dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$DIR/agent.log</string>
<key>StandardErrorPath</key><string>$DIR/agent.log</string>
</dict></plist>
EOF
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  echo "  installed launchd service '$label' ($script)"
}

install_linux() {
  local gw="$1" script="$2" unit="helm-$gw"
  local dir="$HOME/.config/systemd/user"; mkdir -p "$dir"
  cat > "$dir/$unit.service" <<EOF
[Unit]
Description=Helm AI agent ($gw)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$DIR
ExecStart=$NODE $DIR/$script
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now "$unit.service"
  echo "  installed systemd --user service '$unit' ($script)"
}

OS="$(uname -s)"
echo "Installing services for gateways: $GATEWAYS"
IFS=',' read -ra LIST <<< "$GATEWAYS"
for gw in "${LIST[@]}"; do
  script="$(script_for "$gw")"
  [ -n "$script" ] || { echo "  skip unknown gateway '$gw'"; continue; }
  case "$OS" in
    Darwin) install_mac "$gw" "$script";;
    Linux)
      if [ "$gw" = "imessage" ]; then echo "  skip imessage (macOS only)"; continue; fi
      install_linux "$gw" "$script";;
    *) echo "  unsupported OS; start manually: cd $DIR && npm start"; exit 1;;
  esac
done

echo "Done. Logs: $DIR/agent.log"
case "$OS" in
  Darwin) echo "Stop a gateway:  launchctl bootout gui/$(id -u)/com.helm.<gateway>";;
  Linux)  echo "Stop a gateway:  systemctl --user stop helm-<gateway>";;
esac
