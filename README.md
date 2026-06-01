<p align="center">
  <img src="https://raw.githubusercontent.com/GOODMAN-PRO/helm/main/assets/logo/helm-banner.png" alt="Helm" width="440">
</p>

<p align="center"><strong>Your own AI agent, on your own machine.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-22d3ee?style=for-the-badge" alt="MIT license">
  <img src="https://img.shields.io/badge/macOS%20·%20Windows%20·%20Linux-101a27?style=for-the-badge" alt="platforms">
  <img src="https://img.shields.io/badge/node-18%2B-38bdf8?style=for-the-badge" alt="node 18+">
  <img src="https://img.shields.io/badge/engine-Claude%20Code-5eead4?style=for-the-badge" alt="engine: Claude Code">
</p>

<p align="center">
  <a href="https://goodman-pro.github.io/helm/"><strong>Website</strong></a> ·
  <a href="#install">Install</a> ·
  <a href="#what-it-does">What it does</a> ·
  <a href="#power-it-your-way">Backends</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#compared-to-other-agents">Compare</a>
</p>

## Install

One command — checks prerequisites, fetches the code, installs deps, and walks you through setup.

**Recommended — any OS, no shell script** (just Node, which Helm needs anyway):
```bash
npx github:GOODMAN-PRO/helm
```
**macOS / Linux** (works with `bash` *or* `sh` — the script is POSIX):
```bash
curl -fsSL https://raw.githubusercontent.com/GOODMAN-PRO/helm/main/install.sh | sh
```
**Windows (PowerShell)**
```powershell
irm https://raw.githubusercontent.com/GOODMAN-PRO/helm/main/install.ps1 | iex
```
> Windows tip: this installer works even when PowerShell's script policy is "Restricted". If a bare
> `npx` command fails with *"running scripts is disabled"*, use this PowerShell line instead, or run
> `npx.cmd github:GOODMAN-PRO/helm`, or once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

The `curl` / PowerShell installers set up **everything they need** — Node, Claude Code (Helm's engine),
and dependencies (git is optional; a tarball is used otherwise). The **npx** method needs Node already
(it runs on Node). The setup wizard then lets you choose your gateways (Discord / iMessage), your
backend (subscription / API key / **free local model**), and whether to run 24/7 as a background service.

<details>
<summary>More ways</summary>

```bash
# Manual (git)
git clone https://github.com/GOODMAN-PRO/helm.git helm && cd helm && npm install
cp .env.example .env        # set DISCORD_TOKEN + OWNER_ID, then: npm start

# No git — download the tarball
mkdir helm && curl -fsSL https://codeload.github.com/GOODMAN-PRO/helm/tar.gz/refs/heads/main \
  | tar -xz -C helm --strip-components=1 && cd helm && npm install && npm run wizard

# From a clone, re-run the cross-platform installer any time
node bin/helm-install.mjs
```
</details>

Run it once in the foreground:
```bash
cd ~/helm && npm start
```
Keep it running 24/7 — `bash ~/helm/scripts/install-service.sh` (launchd / systemd) or, on Windows,
`powershell -File scripts\install-service.ps1` (Task Scheduler).

### Setup, step by step

The install command above does steps 1–2 for you, then the wizard walks you through 3–5. Same on
macOS, Windows and Linux.

1. **Get prerequisites** — the installer auto-installs Node 18+ and Claude Code (the engine) if missing.
2. **Fetch + install** — downloads Helm and runs `npm install`.
3. **Make a Discord bot** — open the [Developer Portal](https://discord.com/developers/applications) →
   **New Application** → **Bot** → **Reset Token** and copy the token. Invite it to a server, or just DM it.
4. **Run the wizard** — paste the **bot token** and your **Discord user ID** (turn on Developer Mode,
   right-click your name → *Copy User ID*), then pick:
   - **Gateway** — Discord (any OS) and/or iMessage (Mac).
   - **Brain** — Claude subscription · Anthropic API key · or a **free model** (a local one that
     auto-downloads, or a free online provider like Groq/OpenRouter — Helm wires it up for you).
   - **Run 24/7?** — installs a background service if you say yes.
5. **Message it** — DM your bot on Discord (or text the Mac on iMessage). It runs on your machine and
   reports back.

Reconfigure anytime with `npm run wizard`. Switch the brain between your Mac and Windows box from chat
with `use windows` / `use mac`.

### Create your Discord bot (~2 minutes)

This is the one part nobody can do for you — Discord requires a bot that's yours. Exact steps:

1. Go to the **[Developer Portal](https://discord.com/developers/applications)** → **New Application** → name it (e.g. "Helm") → **Create**.
2. Left sidebar → **Bot** → **Reset Token** → **Yes, do it!** → **Copy**. That long string is your `DISCORD_TOKEN` (treat it like a password). *(No other Bot toggles are required — Helm uses non-privileged intents.)*
3. Get **your own** user ID: Discord app → **Settings (gear)** → **Advanced** → turn on **Developer Mode**. Then right-click your name anywhere → **Copy User ID**. That number is your `OWNER_ID` (it locks the bot to only you).
4. Let the bot DM you: easiest is **OAuth2 → URL Generator** → tick **bot** scope → open the generated URL → add it to any server you're in. Now DM the bot (or @mention it in that server).
5. Paste the **token** and **user ID** into `npm run wizard` when prompted.

> One token = one running bot. Don't run two copies on the same token.

Helm is a personal AI agent that lives on **your** hardware. You message it from **Discord** (or
**iMessage** on a Mac); it runs Claude with full tools right on your machine — shell, files, web,
screen, memory — and actually does the work, then reports back. Owner-locked and private: only you can
command it, and nothing leaves hardware you own. Power it with your Claude subscription, an API key, or
a **free / local model**.

## What it does

- **Lives on your machine** — full shell, files and web. Not a locked cloud sandbox.
- **Message it anywhere** — Discord, or iMessage on a Mac. Owner-locked to your ID.
- **Real long-term memory** — structured recall plus **Helm Mind**, an AI-first second brain over a
  synced Markdown knowledge base that rewrites itself as you talk.
- **Your whole fleet** — switch between Mac and Windows at will over SSH/Tailscale; move files both ways.
- **Sees and drives your screen** — screenshots, clicks and types; operates apps that have no API.
  Cross-platform: it captures **whichever machine the brain is running on** — the Mac, or your Windows
  box when you've switched with `use windows`.
- **Thinks 24/7 & upgrades itself** — background cognition; nightly self-improvement gated by tests
  that auto-revert on failure. When it gets stuck, it queues the problem to fix overnight.
- **Encrypted secrets vault** — hand it credentials safely; never echoed into chat, logs or git.
- **Shareable templates** — export your Helm's flavor (`template export`) and import someone else's.

## Power it your way

Pick at install (or set `AUTH_MODE` in `.env`):

| Backend | `AUTH_MODE` | Notes |
|---|---|---|
| Claude Pro / Max subscription | `subscription` | OAuth via `claude`; no per-message cost |
| Anthropic API key | `apikey` | pay-as-you-go; no subscription needed |
| **Free / local model** | `custom` | Ollama (local, $0), Groq / OpenRouter free tiers, or any Anthropic-compatible endpoint |

## How it works

1. **You message** — a DM from Discord or iMessage.
2. **Helm acts on your machine** — runs Claude with full tools: shell, files, web, screen, memory.
3. **It reports back** — files built, problems fixed, a screenshot — straight into the chat.

## Compared to other agents

OpenClaw is the closest peer — also local, open, and multi-channel. Helm's edge is what it does on top:
one synced brain across your fleet, 24/7 self-improvement, and a parallel build swarm.

| Capability | Helm | OpenClaw |
|---|:--:|:--:|
| Runs on your own machine | ✓ | ✓ |
| Open / self-hosted | ✓ | ✓ |
| Chat from Discord / iMessage | ✓ | ✓ |
| Free / local models | ✓ | ✓ |
| Persistent memory + synced brain | ✓ | ~ |
| Multi-machine fleet (Mac + Windows) | ✓ | ~ |
| Clicks & types in any app | ✓ | ~ |
| Thinks 24/7 &amp; self-upgrades | ✓ | — |
| Parallel build swarm | ✓ | — |

✓ yes · ~ partial · — no. Full matrix (vs Hermes, Cursor, Manus, Vellum, and more) on the
[live site](https://goodman-pro.github.io/helm/#compare).

## Configuration (`.env`)

| var | meaning |
|---|---|
| `GATEWAYS` | `discord`, `imessage`, or both |
| `AUTH_MODE` | `subscription` · `apikey` · `custom` (free/local) |
| `MODEL` | `opus` (best) or `sonnet` (fast, sustainable) |
| `PERMISSION_MODE` | `bypassPermissions` (autonomous) or `default` (asks first) |
| `CLAUDE_BIN` | path to the `claude` CLI |
| `WORKSPACE` | the agent's working dir + memory location |

## Safety & permissions — read this

Helm is a **real agent on your real machine**, not a sandboxed chatbot. Be clear-eyed about what that means:

**What it can do:** run shell commands, read/write/delete files anywhere in your home directory, browse
the web, see your screen and move your mouse/keyboard, run on a schedule unprompted, and **edit and
re-deploy its own code** (a nightly self-upgrade, gated by tests). In `bypassPermissions` mode it does
all of this **without asking**.

**How to run it safely:**
- **Owner-locked.** Only your Discord ID can command it (set at install). Treat your bot **token** like
  a password — anyone with it can talk to your agent.
- **Permission mode.** Start in **`default`** (Helm asks before each tool action) — the wizard now
  recommends this. Switch to **`bypassPermissions`** (full autonomy) only once you trust it on that
  machine. Set via `PERMISSION_MODE` in `.env`.
- **It's still an LLM.** It can be wrong or be talked into things via content it reads (prompt
  injection). Don't point it at untrusted data and walk away in autonomous mode. It confirms before
  destructive/irreversible/money-spending actions, but that's a guardrail, not a guarantee.
- **Secrets** live in an encrypted vault (macOS Keychain-backed), never in chat, logs, or git. Hand it
  credentials with the vault command, not by pasting them in chat.
- **Cost.** It runs on **your** Claude account; background cognition + nightly upgrades use quota.
- **Run it on hardware you own and are comfortable giving an assistant full control of.**

## License

[MIT](LICENSE) © 2026 Nice (GOODMAN-PRO). Your code is free to use, modify and distribute. Helm runs on
Claude Code — you bring your own Anthropic account; no Anthropic software is redistributed here.
