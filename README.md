# Helm

Your own tiny AI agent. **Discord** (and later **iMessage** on a Mac) → **Claude on your subscription** → action. One file (`index.js`), no framework, no plugins, no gateway service.

## What it does
You DM your Discord bot; the message goes to `claude -p` running on your machine (your Max subscription, full tools — shell, files, web); the reply comes back in Discord. Only **you** (the owner) can talk to it. Conversations persist per channel. Long-term memory lives in `workspace/CLAUDE.md`, which the agent reads and updates.

## Run (Windows)
```
npm install
npm start
```
Then DM your bot. (`.env` is pre-filled: `DISCORD_TOKEN`, `OWNER_ID`, `CLAUDE_BIN`.)

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
