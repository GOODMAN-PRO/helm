#!/bin/sh
# Helm installer (POSIX sh — runs under sh, bash, zsh, dash). Sets up the Helm AI agent.
#
# Remote (after publish):
#   curl -fsSL https://raw.githubusercontent.com/GOODMAN-PRO/helm/main/install.sh | bash
#
# Local test (install from a local source dir into a throwaway target, no clone):
#   HELM_SRC=/path/to/helm-source HELM_DIR=/tmp/helm-test bash install.sh
#
# Env overrides:
#   HELM_REPO  git URL to clone from           (default: the published GitHub repo)
#   HELM_DIR   install target                  (default: $HOME/helm)
#   HELM_SRC   install from this local dir instead of cloning (for testing)
#   HELM_NONINTERACTIVE=1  skip prompts; write .env from template for manual editing
set -eu

REPO_URL="${HELM_REPO:-https://github.com/GOODMAN-PRO/helm.git}"
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

# Ensure Node 22.5+ is available — install it (Homebrew, or the official binary, no sudo) if missing.
# 22.5 is the floor because Helm uses the built-in node:sqlite module, which only exists from 22.5.
ensure_node() {
  if command -v node >/dev/null 2>&1; then
    maj="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    min="$(node -p 'process.versions.node.split(".")[1]' 2>/dev/null || echo 0)"
    if [ "${maj:-0}" -gt 22 ] 2>/dev/null || { [ "${maj:-0}" -eq 22 ] && [ "${min:-0}" -ge 5 ]; } 2>/dev/null; then return 0; fi
    say "Node $(node -v) is too old (need 22.5+) — installing a current version..."
  else
    say "Node not found — installing it for you..."
  fi
  if command -v brew >/dev/null 2>&1; then brew install node >/dev/null 2>&1 && command -v node >/dev/null 2>&1 && { ok "Node installed via Homebrew"; return 0; }; fi
  command -v curl >/dev/null 2>&1 || die "Need curl to download Node. Install Node 18+ from https://nodejs.org then re-run."
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$(uname -m)" in arm64|aarch64) arch=arm64;; x86_64|amd64) arch=x64;; *) die "Unsupported CPU $(uname -m) — install Node 18+ from https://nodejs.org";; esac
  ver="$(curl -fsSL https://nodejs.org/dist/index.tab 2>/dev/null | awk -F '\t' 'NR>1 && $10!="-" {print $1; exit}')"
  [ -n "$ver" ] || ver="v22.14.0"
  pkg="node-${ver}-${os}-${arch}"
  say "Downloading Node ${ver} (${os}-${arch})..."
  mkdir -p "$HOME/.local"
  curl -fsSL "https://nodejs.org/dist/${ver}/${pkg}.tar.gz" | tar -xz -C "$HOME/.local" || die "Node download failed — install from https://nodejs.org"
  export PATH="$HOME/.local/${pkg}/bin:$PATH"
  command -v node >/dev/null 2>&1 || die "Node still not found after install."
  ok "Node ${ver} installed to ~/.local/${pkg} (add that bin to your PATH to keep it)"
}

say "${c_b}== Helm installer ==${c_0}"

# 1) prerequisites ----------------------------------------------------------
ensure_node
command -v git >/dev/null || command -v curl >/dev/null || die "Need either git or curl to fetch Helm."
# Claude Code is the engine Helm runs on — auto-install it if missing.
if ! command -v claude >/dev/null; then
  say "Claude Code (Helm's engine) not found — installing it with npm..."
  npm install -g @anthropic-ai/claude-code || warn "couldn't auto-install Claude Code — run: npm install -g @anthropic-ai/claude-code"
fi
ok "node $(node -v)   claude $(command -v claude >/dev/null && claude --version 2>/dev/null | head -n1 || echo 'installed')   $(command -v git >/dev/null && echo git || echo 'curl (no git)')"

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
else
  TARBALL="${HELM_TARBALL:-https://codeload.github.com/GOODMAN-PRO/helm/tar.gz/refs/heads/main}"
  fetch_tarball() {  # overwrites tracked files but keeps .env and other untracked state
    command -v curl >/dev/null || die "Need curl to download Helm."
    mkdir -p "$TARGET"
    curl -fsSL "$TARBALL" | tar -xz -C "$TARGET" --strip-components=1 || die "download failed - check your connection/proxy and re-run."
  }
  if [ -d "$TARGET/.git" ]; then
    say "Updating existing install at $TARGET"
    # Normal path is a fast-forward. If upstream history was rewritten (e.g. a force-push to scrub
    # data), --ff-only fails; recover by resetting to the remote. Safe: .env/memory/vault/state are
    # all gitignored, so a hard reset leaves them untouched.
    if git -C "$TARGET" pull --ff-only; then ok "updated"; else
      say "fast-forward not possible (upstream history changed) - re-syncing to the remote..."
      _br="$(git -C "$TARGET" remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')"; : "${_br:=main}"
      git -C "$TARGET" fetch origin && git -C "$TARGET" reset --hard "origin/$_br" && ok "re-synced to the latest published version" \
        || warn "couldn't auto-resync - your .env is safe; run: git -C \"$TARGET\" fetch origin && git -C \"$TARGET\" reset --hard origin/$_br"
    fi
  elif [ -f "$TARGET/index.js" ]; then
    say "Updating existing install at $TARGET (download)"
    fetch_tarball; ok "updated"
  elif command -v git >/dev/null; then
    say "Cloning $REPO_URL -> $TARGET"
    if git clone --depth 1 "$REPO_URL" "$TARGET" 2>/dev/null; then ok "cloned"; else
      warn "git clone failed (proxy/firewall?) - downloading the tarball instead"
      rm -rf "$TARGET"; fetch_tarball; ok "downloaded"
    fi
  else
    fetch_tarball; ok "downloaded"
  fi
fi
[ -f "$TARGET/index.js" ] || die "Could not fetch Helm (network blocked?). Check your connection/proxy and re-run."
cd "$TARGET"

# 3) dependencies -----------------------------------------------------------
say "Installing dependencies (npm install)..."
# Skip Playwright's heavy browser download (~hundreds of MB) — it's used lazily by the reverse tool
# and installs browsers on first use. Massively speeds up install.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Don't hide npm's output — if it fails the user needs to see why. Native deps (sharp, onnxruntime via
# transformers) occasionally can't fetch a prebuilt binary; retry leaner before giving up.
if npm install --no-audit --no-fund; then ok "dependencies installed"
elif npm install --no-audit --no-fund --omit=optional; then ok "dependencies installed (without optional extras)"
elif npm ci --no-audit --no-fund --omit=optional; then ok "dependencies installed (clean lockfile)"
else die "npm install failed — scroll up for the error. Common causes: network/proxy blocking the npm registry, or out-of-date Node."
fi

# 4) sanity check -----------------------------------------------------------
# Real RUNTIME probe (node --check is parse-only and FALSE-passes a missing node:sqlite on old Node).
node --input-type=module -e 'await import("node:sqlite")' 2>/dev/null || die "This Node can't load node:sqlite — Helm needs Node 22.5+ (have $(node -v)). Update Node and re-run."
node --check index.js && ok "runtime + syntax valid"
# register the `helm` command on PATH so users type `helm`, not `node index.js`
if npm link >/dev/null 2>&1; then ok "linked the 'helm' command"; else warn "couldn't link 'helm' — start with: node \"$TARGET/index.js\""; fi

# 5) configure --------------------------------------------------------------
CLAUDE_PATH="$(command -v claude || echo claude)"
if [ -f .env ]; then
  warn ".env already exists — leaving it untouched. (delete it and re-run to reconfigure)"
elif [ "$NONINTERACTIVE" = "1" ] || [ ! -r /dev/tty ]; then
  cp .env.example .env
  sed -i.bak "s#^CLAUDE_BIN=.*#CLAUDE_BIN=${CLAUDE_PATH}#" .env && rm -f .env.bak
  warn "Non-interactive: wrote .env from template. Set DISCORD_TOKEN + OWNER_ID, then run: helm"
else
  # hand off to the cool setup wizard (gateways, model incl. FREE, permissions, service)
  node scripts/wizard.mjs < /dev/tty || {
    warn "wizard unavailable — wrote .env from template; edit it then run: helm"
    [ -f .env ] || { cp .env.example .env; sed -i.bak "s#^CLAUDE_BIN=.*#CLAUDE_BIN=${CLAUDE_PATH}#" .env && rm -f .env.bak; }
  }
fi

say ""
say "${c_b}Done.${c_0} Installed at: $TARGET"
say "Start it:   helm            (if not found, reopen your terminal — or: node \"$TARGET/index.js\")"
say "Check it:   helm doctor     (diagnoses Node / engine / model / config problems)"
say "Reminder: one Discord token = one running instance. Stop any other copy first."
