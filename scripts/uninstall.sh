#!/bin/sh
# Helm uninstaller (macOS / Linux). One-liner:
#   curl -fsSL https://raw.githubusercontent.com/GOODMAN-PRO/helm/main/scripts/uninstall.sh | sh
# Stops + unregisters Helm's background services, kills its processes, and removes the install dir.
# Leaves your ~/HelmBrain vault and any backups alone. Override the dir with HELM_DIR; skip the
# confirm with HELM_YES=1.
set -eu
DIR="${HELM_DIR:-$HOME/helm}"
uid="$(id -u 2>/dev/null || echo 0)"

# macOS: stop + remove all com.helm.* launchd agents.
if [ "$(uname -s)" = "Darwin" ]; then
  for plist in "$HOME"/Library/LaunchAgents/com.helm.*.plist; do
    [ -e "$plist" ] || continue
    label="$(basename "$plist" .plist)"
    launchctl bootout "gui/$uid/$label" 2>/dev/null || true
    rm -f "$plist"
  done
  launchctl list 2>/dev/null | awk '/com\.helm\./{print $3}' | while read -r l; do
    launchctl bootout "gui/$uid/$l" 2>/dev/null || true
  done
fi
# Linux: stop + remove systemd --user units, if any.
if command -v systemctl >/dev/null 2>&1; then
  for u in $(systemctl --user list-unit-files 2>/dev/null | awk '/helm/{print $1}'); do
    systemctl --user disable --now "$u" 2>/dev/null || true
  done
fi

# Kill any stray Helm processes from this install.
pkill -f "$DIR/index.js" 2>/dev/null || true
pkill -f "$DIR/imessage.js" 2>/dev/null || true
pkill -f "$DIR/workspace/" 2>/dev/null || true
# Remove the global `helm` command if it was linked.
npm rm -g helm >/dev/null 2>&1 || true

echo "Helm services stopped and unregistered."
if [ ! -d "$DIR" ]; then echo "No install at $DIR — nothing to delete."; exit 0; fi

if [ "${HELM_YES:-0}" != "1" ] && [ -r /dev/tty ]; then
  printf "Delete the install at %s ? [y/N] " "$DIR" > /dev/tty
  read -r ans < /dev/tty || ans=n
  case "$ans" in y|Y|yes|YES) ;; *) echo "Kept $DIR (services are stopped). Aborted."; exit 0 ;; esac
fi
rm -rf "$DIR"
echo "Helm uninstalled from $DIR. Your ~/HelmBrain vault and any backups were left untouched."
