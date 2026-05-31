#!/usr/bin/env bash
# Helm installer — set up the Helm AI agent (Discord DM -> Claude on your subscription -> action).
#
# Remote (after publish):
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | bash
#
# Local test (install from a local source dir into a throwaway target, no clone):
#   HELM_SRC=/Users/owner/secondme HELM_DIR=/tmp/helm-test bash install.sh
#
# Env overrides:
#   HELM_REPO  git URL to clone from           (default: the published GitHub repo)
#   HELM_DIR   install target                  (default: $HOME/helm)
#   HELM_SRC   install from this local dir instead of cloning (for testing)
#   HELM_NONINTERACTIVE=1  skip prompts; write .env from template for manual editing
set -euo pipefail

REPO_URL="${HELM_REPO:-https://github.com/OWNER/REPO.git}"
TARGET="${HELM_DIR:-$HOME/helm}"
SRC="${HELM_SRC:-}"
NONINTERACTIVE="${HELM_NONINTERACTIVE:-0}"

c_b="\033[1m"; c_g="\033[32m"; c_y="\033[33m"; c_r="\033[31m"; c_0="\033[0m"
say()  { printf "%b\n" "$1"; }
ok()   { printf "%b\n" "  ${c_g}ok${c_0}  $1"; }
warn() { printf "%b\n" "  ${c_y}!!${c_0}  $1"; }
die()  { printf "%b\n" "  ${c_r}xx${c_0}  $1" >&2; exit 1; }
# read from the terminal even when the script itself arrived on stdin (curl | bash)
ask()  { local p="$1" d="${2:-}" v=""; if [ -r /dev/tty ]; then printf "%b" "$p" > /dev/tty; read -r v < /dev/tty || true; fi; echo "${v:-$d}"; }

say "${c_b}== Helm installer ==${c_0}"

# 1) prerequisites ----------------------------------------------------------
command -v node  >/dev/null || die "Node not found. Install Node 18+ first (https://nodejs.org), then re-run."
command -v claude>/dev/null || die "Claude Code (claude) not found. Install it, run 'claude' once and log into your Max subscription, then re-run."
command -v git   >/dev/null || die "git not found. Install git, then re-run."
NODE_MAJ="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJ" -ge 18 ] || die "Node $(node -v 2>/dev/null) is too old; need 18+."
ok "node $(node -v)   claude $(claude --version 2>/dev/null | head -n1)   git present"

# 2) fetch source -----------------------------------------------------------
if [ -n "$SRC" ]; then
  [ -d "$SRC" ] || die "HELM_SRC=$SRC is not a directory."
  say "Copying source from $SRC -> $TARGET"
  mkdir -p "$TARGET"
  # copy the project but never the source machine's secrets/state/deps
  if command -v rsync >/dev/null; then
    rsync -a --delete \
      --exclude '.git' --exclude 'node_modules' --exclude '.env' \
      --exclude '*.log' --exclude '*.db' --exclude '*.db-*' \
      --exclude 'workspace/secrets/vault.json' \
      --exclude 'workspace/.sessions.json' --exclude 'workspace/inbox' \
      --exclude 'workspace/conversations' --exclude 'workspace/reverse' \
      --exclude '.swarm' --exclude 'workspace/browser-profile' \
      "$SRC"/ "$TARGET"/
  else
    cp -R "$SRC"/. "$TARGET"/ ; rm -rf "$TARGET/.git" "$TARGET/node_modules" "$TARGET/.env"
  fi
  ok "source copied"
elif [ -d "$TARGET/.git" ]; then
  say "Updating existing install at $TARGET"
  git -C "$TARGET" pull --ff-only && ok "updated"
else
  say "Cloning $REPO_URL -> $TARGET"
  git clone --depth 1 "$REPO_URL" "$TARGET" && ok "cloned"
fi
cd "$TARGET"

# 3) dependencies -----------------------------------------------------------
say "Installing dependencies (npm install)..."
npm install --no-audit --no-fund >/dev/null 2>&1 && ok "dependencies installed" || die "npm install failed — run 'npm install' in $TARGET to see why."

# 4) sanity check -----------------------------------------------------------
node --check index.js && ok "index.js syntax valid"

# 5) configure --------------------------------------------------------------
CLAUDE_PATH="$(command -v claude)"
if [ -f .env ]; then
  warn ".env already exists — leaving it untouched. (delete it and re-run to reconfigure)"
  say ""
  say "${c_b}Done.${c_0} Start it:  cd \"$TARGET\" && npm start"
elif [ "$NONINTERACTIVE" = "1" ] || [ ! -r /dev/tty ]; then
  cp .env.example .env
  sed -i.bak "s#^CLAUDE_BIN=.*#CLAUDE_BIN=${CLAUDE_PATH}#" .env && rm -f .env.bak
  warn "Non-interactive: wrote .env from template. Set DISCORD_TOKEN + OWNER_ID, then: npm start"
else
  # hand off to the cool setup wizard (gateways, model, permissions, service)
  node scripts/wizard.mjs < /dev/tty || {
    warn "wizard unavailable — wrote .env from template; edit it then run: npm start"
    [ -f .env ] || { cp .env.example .env; sed -i.bak "s#^CLAUDE_BIN=.*#CLAUDE_BIN=${CLAUDE_PATH}#" .env && rm -f .env.bak; }
  }
fi
