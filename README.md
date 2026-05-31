# Helm

Your own tiny AI agent. **Discord** (and later **iMessage** on a Mac) → **Claude on your subscription** → action. One file (`index.js`), no framework, no plugins, no gateway service.

## What it does
You DM your Discord bot; the message goes to `claude -p` running on your machine (your Max subscription, full tools — shell, files, web); the reply comes back in Discord. Only **you** (the owner) can talk to it. Conversations persist per channel. Long-term memory lives in `workspace/CLAUDE.md`, which the agent reads and updates.

## Install
One command. It checks prerequisites, fetches the code, installs deps, and walks you through the `.env`.

**macOS / Linux:**
```
curl -fsSL https://raw.githubusercontent.com/GOODMAN-PRO/helm/main/install.sh | bash
```
**Windows (PowerShell):**
```
irm https://raw.githubusercontent.com/GOODMAN-PRO/helm/main/install.ps1 | iex
```
Prerequisites: **Node 18+**, **git**, and **Claude Code** (`claude`). Power it with your Claude
Pro/Max subscription, a pay-as-you-go Anthropic API key, **or a free / local model** (Ollama, Groq,
OpenRouter free tiers, or any Anthropic-compatible endpoint) — pick at install time.

The installer asks for your **Discord bot token** (Developer Portal → your app → Bot → Reset Token) and your **Discord user ID** (right-click your name → Copy User ID), writes a locked-down `.env`, and prints the start command.

Run it once in the foreground:
```
cd ~/helm && npm start
```
Keep it running 24/7 (launchd on macOS, systemd --user on Linux):
```
bash ~/helm/scripts/install-service.sh
```

### Manual install
```
git clone https://github.com/GOODMAN-PRO/helm.git helm && cd helm
npm install
cp .env.example .env   # then set DISCORD_TOKEN + OWNER_ID
npm start
```

## Knobs (`.env`)
| var | meaning |
|---|---|
| `MODEL` | `opus` (best, heavier on Max limits) or `sonnet` (fast, sustainable) |
| `PERMISSION_MODE` | `bypassPermissions` (autonomous tools) or `default` (asks first) |
| `CLAUDE_BIN` | path to the `claude` CLI |
| `WORKSPACE` | the agent's working dir + memory location |

## Add the Mac / iMessage node later
The same code runs on macOS (set `CLAUDE_BIN=claude`). Add an iMessage adapter that reads the Messages DB and feeds the same brain. Discord works on both machines; iMessage only on the Mac.

## Security
Owner-locked to a single Discord ID. `bypassPermissions` gives the agent full tool access on your machine — fine for a personal assistant you own, which is exactly why only you can talk to it.
