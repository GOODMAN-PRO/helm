#!/usr/bin/env bash
# SecondMe — one-shot Mac/Linux setup. Run from inside the secondme folder:
#   chmod +x setup-mac.sh && ./setup-mac.sh
set -e
echo "== SecondMe setup =="

# 1. prerequisites
if ! command -v node >/dev/null; then
  echo "✋ Node not found. Install it first:  brew install node"
  exit 1
fi
if ! command -v claude >/dev/null; then
  echo "✋ Claude Code (claude) not found. Install it, then run 'claude' once and log in to your Max subscription."
  exit 1
fi
echo "✔ node $(node -v)   ✔ claude $(claude --version)"

# 2. dependencies
echo "Installing dependencies..."
npm install

# 3. .env (created from template; CLAUDE_BIN auto-filled to the real path)
if [ ! -f .env ]; then
  cp .env.example .env
  CLAUDE_PATH="$(command -v claude)"
  sed -i '' "s#^CLAUDE_BIN=.*#CLAUDE_BIN=${CLAUDE_PATH}#" .env 2>/dev/null || \
    sed -i "s#^CLAUDE_BIN=.*#CLAUDE_BIN=${CLAUDE_PATH}#" .env
  echo ""
  echo "📝 Created .env (CLAUDE_BIN set to ${CLAUDE_PATH})."
  echo "   Now paste your Discord bot token into it:   nano .env"
else
  echo "ℹ️  .env already exists — leaving it as-is."
fi

# 4. confirm claude is logged in to the subscription
echo ""
echo "🔑 Make sure 'claude' is logged into your Max subscription on this Mac:"
echo "     run:  claude        (then log in if prompted)"
echo ""
echo "▶  When .env has your DISCORD_TOKEN, start the agent with:   npm start"
echo "   (And remember: stop it on Windows first — one token, one instance.)"
