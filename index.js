// Helm — your own tiny AI agent.
//
//   Discord DM (you only)  ->  claude -p  (your Max subscription, full tools)  ->  reply
//
// No framework, no plugins, no gateway service. Read it top to bottom.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { DatabaseSync } from 'node:sqlite';
import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import { getSession, setSession, deleteSession } from './workspace/sessions.mjs';
import { appendCost, getCostSummary } from './workspace/costs/cost-tracker.mjs';
import { classifyComplexity, getModelPref, setModelPref } from './workspace/model-routing.mjs';
import { recordStuck, processStuckMarkers, autoCaptureCant } from './workspace/upgrades/stuck.mjs';
import { exportTemplate, importTemplate, listTemplates } from './workspace/templates/templates.mjs';
import { runHealthChecks } from './workspace/mcp/check.mjs';
import { startCliBridge, mirrorReply, mirrorEcho, mirrorStatus } from './workspace/cli-bridge.mjs';
import { listSkills, runSkillCommand } from './workspace/skills/loader.mjs';

// Resolve .env and workspace relative to THIS file, so the agent runs from any cwd.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, '.env') });

// ---- config (.env) ----
const {
  DISCORD_TOKEN,
  OWNER_ID,
  CLAUDE_BIN = 'claude',
  MODEL = 'sonnet',
  PERMISSION_MODE = 'bypassPermissions',
  AUTH_MODE = 'subscription',   // 'subscription' (Claude Pro/Max OAuth) | 'apikey' (ANTHROPIC_API_KEY)
} = process.env;
const WORKSPACE = path.resolve(__dirname, process.env.WORKSPACE || './workspace');

// Env handed to the `claude` engine. In subscription mode we strip ANTHROPIC_API_KEY so a stray
// shell var can't override the OAuth login; in apikey mode we keep it (Claude Code auto-uses it).
// Resolve a runnable `claude` on this OS. On Windows, CLAUDE_BIN is often the extension-less npm
// shim (e.g. ...\npm\claude) which Node can't spawn — prefer claude.exe, else claude.cmd (needs a shell).
function resolveClaude() {
  const bin = CLAUDE_BIN || 'claude';
  if (process.platform !== 'win32') return { cmd: bin, shell: false };
  if (/\.(exe)$/i.test(bin) && existsSync(bin)) return { cmd: bin, shell: false };
  if (/\.(cmd|bat|ps1)$/i.test(bin) && existsSync(bin)) return { cmd: bin, shell: true };
  // CLAUDE_BIN points at the extension-less npm shim (...\npm\claude) — use the sibling .cmd/.exe.
  if (existsSync(bin + '.exe')) return { cmd: bin + '.exe', shell: false };
  if (existsSync(bin + '.cmd')) return { cmd: bin + '.cmd', shell: true };
  // Stale/wrong CLAUDE_BIN with no runnable sibling: ask Windows where claude actually is.
  try {
    const r = spawnSync('where', ['claude'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout) {
      const hits = r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const exe = hits.find(h => /\.exe$/i.test(h));
      const cmd = hits.find(h => /\.cmd$/i.test(h));
      if (exe) return { cmd: exe, shell: false };
      if (cmd) return { cmd: cmd, shell: true };
    }
  } catch {}
  return { cmd: bin, shell: true };   // last resort: let the shell resolve via PATHEXT
}
// A free ONLINE model (Groq/OpenRouter/Together/Cerebras/...) is configured when these are set.
// We run a tiny local proxy (workspace/proxy/llm-proxy.mjs) that translates Claude Code's
// Anthropic API to the provider's OpenAI-compatible API, and point Claude Code at the proxy.
const PROXY_PORT = parseInt(process.env.PROXY_PORT || '8787', 10);
function proxyConfigured() {
  return AUTH_MODE === 'custom' && !!process.env.OPENAI_BASE_URL && !!process.env.OPENAI_MODEL;
}
function claudeEnv() {
  const e = { ...process.env };
  if (AUTH_MODE === 'apikey') {
    delete e.ANTHROPIC_BASE_URL;                 // hosted Anthropic API — just the key
  } else if (AUTH_MODE === 'custom') {
    // free / local / custom endpoint: Claude Code needs an auth token even for a local server
    // (e.g. Ollama requires ANTHROPIC_AUTH_TOKEN set). Use the provided key, else a local placeholder.
    if (!e.ANTHROPIC_AUTH_TOKEN) e.ANTHROPIC_AUTH_TOKEN = e.ANTHROPIC_API_KEY || 'ollama';
    // Free online model: route Claude Code through the local translation proxy.
    if (proxyConfigured()) {
      e.ANTHROPIC_BASE_URL = `http://127.0.0.1:${PROXY_PORT}`;
      e.ANTHROPIC_AUTH_TOKEN = 'helm-proxy';     // proxy ignores it; just satisfy Claude Code
    }
  } else {
    // subscription (OAuth) — strip anything that would override the login
    delete e.ANTHROPIC_API_KEY; delete e.ANTHROPIC_AUTH_TOKEN; delete e.ANTHROPIC_BASE_URL;
  }
  return e;
}

if (!DISCORD_TOKEN || !OWNER_ID) {
  console.error('✋ Missing DISCORD_TOKEN or OWNER_ID in .env');
  process.exit(1);
}
mkdirSync(WORKSPACE, { recursive: true });

// First-run onboarding: ensure a private owner.md exists (CLAUDE.md imports @owner.md). On a fresh
// install there's none (it's gitignored), so seed it from the committed template — its "NOT STARTED"
// status tells Helm to interview the owner on their first message. Never overwrites an existing one.
(() => {
  try {
    const ownerFile = path.join(WORKSPACE, 'owner.md');
    const tmpl = path.join(WORKSPACE, 'owner.example.md');
    if (!existsSync(ownerFile) && existsSync(tmpl)) {
      writeFileSync(ownerFile, readFileSync(tmpl, 'utf8'));
      console.log('🆕 First run: created workspace/owner.md — Helm will onboard you on your first message.');
    }
  } catch {}
})();

// First-run FLEET setup: if the owner said "more than one device" in the wizard (HELM_FLEET=1) but
// the second peer isn't connected yet, seed a private fleet.md "NOT STARTED" marker. The persona
// then tells Helm to get the second machine connected (verify SSH/Tailscale, test the link) BEFORE
// the owner interview. Single-device installs (HELM_FLEET=0/unset) skip this entirely.
(() => {
  try {
    if (process.env.HELM_FLEET !== '1') return;
    const fleetFile = path.join(WORKSPACE, 'fleet.md');
    const tmpl = path.join(WORKSPACE, 'fleet.example.md');
    if (!existsSync(fleetFile) && existsSync(tmpl)) {
      writeFileSync(fleetFile, readFileSync(tmpl, 'utf8'));
      console.log('🛰  Fleet mode: created workspace/fleet.md — Helm will connect your second device on first message.');
    }
  } catch {}
})();

// ---- autonomy mode (suggest / copilot / autopilot) ----
// Stored as preference 'helm.autonomy_mode' in memory.db.
const MEMORY_DB = path.join(WORKSPACE, 'memory/memory.db');
const VALID_MODES = ['suggest', 'copilot', 'autopilot'];

function getAutonomyMode() {
  try {
    const db = new DatabaseSync(MEMORY_DB);
    const row = db.prepare(`SELECT value FROM facts WHERE kind = 'preference' AND key = 'helm.autonomy_mode'`).get();
    db.close();
    return VALID_MODES.includes(row?.value) ? row.value : 'copilot';
  } catch { return 'copilot'; }
}

function setAutonomyMode(mode) {
  const r = spawnSync(process.execPath, [
    path.join(WORKSPACE, 'memory/memory.mjs'),
    'remember', 'preference', 'helm.autonomy_mode', mode,
  ], { cwd: __dirname, encoding: 'utf8' });
  return r.status === 0;
}

// Map of pending autopilot auto-proceed timers keyed by channel id.
const autopilotTimers = new Map();

// Pick --model for this turn: fixed pref overrides the complexity classifier.
function pickModel(prompt) {
  // free online model behind the proxy: the proxy forces OPENAI_MODEL upstream, so --model is
  // cosmetic — pass the provider model id so logs/UX read sensibly.
  if (proxyConfigured()) return process.env.OPENAI_MODEL;
  // custom/local endpoints expect their own model id (e.g. an Ollama model name)
  if (AUTH_MODE === 'custom' && process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL;
  return getModelPref() ?? classifyComplexity(prompt);
}
// Returns an inline MCP config JSON string built from workspace/mcp/servers.json.
// Only includes servers with enabled !== false. Strips Helm-only schema fields
// (healthCheck, enabled) before passing to Claude Code. Falls back to empty config
// if the file is missing or malformed — bot starts regardless.
function mcpConfigArg() {
  const p = path.join(__dirname, 'workspace/mcp/servers.json');
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    const filtered = {};
    for (const [name, entry] of Object.entries(raw.mcpServers || {})) {
      if (entry.enabled === false) continue;
      const { healthCheck: _h, enabled: _e, comment: _c, ...mcpEntry } = entry;
      // Expand the install-root token so server paths are correct on any machine (Mac/Windows).
      if (Array.isArray(mcpEntry.args)) mcpEntry.args = mcpEntry.args.map(a => typeof a === 'string' ? a.split('__HELM_ROOT__').join(__dirname) : a);
      // On Windows, `npx` is npx.cmd and can't be spawned directly — wrap it as `cmd /c npx ...`
      // so the MCP server actually launches (parity with macOS/Linux).
      if (process.platform === 'win32' && mcpEntry.command === 'npx') {
        mcpEntry.args = ['/c', 'npx', ...(mcpEntry.args || [])];
        mcpEntry.command = 'cmd';
      }
      filtered[name] = mcpEntry;
    }
    return JSON.stringify({ mcpServers: filtered });
  } catch { return '{"mcpServers":{}}'; }
}

// ---- fleet: EQUAL PEERS that share one knowledge vault ("use mac" / "use windows") ----
// The Mac and the Windows box are equal peers — neither is "home" or in charge. Each runs a FULL,
// independent Helm with full local powers; they share exactly one thing: the HelmBrain vault, synced
// both ways by workspace/tools/brain-sync.mjs. "use <machine>" just picks which peer is active; the
// active peer does all the work LOCALLY and never reaches back to the other to get its job done.
// This bot process runs on ONE machine (the local peer); the other is reached over SSH on demand.
// Configure the OTHER peer in .env:
//   HELM_WIN_HOST=you@windows-host   (LAN IP or Tailscale name; key-based SSH)
//   HELM_WIN_CLAUDE=claude           (path to claude on the other peer, optional)
//   HELM_WIN_DIR=helm                (the OTHER peer's Helm install dir — full code+tools, for parity)
const HELM_WIN_HOST = process.env.HELM_WIN_HOST || '';
const HELM_WIN_CLAUDE = process.env.HELM_WIN_CLAUDE || 'claude';
// Run the remote peer inside its OWN full Helm install (default ~/helm) so it has the same code,
// tools and powers as the local peer — not a stripped, mac-fed brain dir.
const HELM_WIN_DIR = process.env.HELM_WIN_DIR || 'helm';
// Did the owner say they run multiple devices? (wizard sets HELM_FLEET=1.) This only drives the
// first-boot "connect your second device" onboarding — NOT routing.
const FLEET_INTENT = process.env.HELM_FLEET === '1';
// Can we ACTUALLY reach another peer right now? Routing to the other machine requires a real host.
// Until one is configured we run everything locally — so neither a single-device box nor a
// fleet-in-setup (intent on, peer not connected yet) can strand the bot SSHing to nowhere.
const PEER_REACHABLE = !!HELM_WIN_HOST;
// The machine THIS bot runs on. Whatever it is, it's a first-class peer — the default active target.
const LOCAL_MACHINE = process.platform === 'win32' ? 'windows' : 'mac';
const TARGET_FILE = path.join(WORKSPACE, 'active-target');
const VALID_TARGETS = ['mac', 'windows'];
const getTarget = () => { try { const t = readFileSync(TARGET_FILE, 'utf8').trim(); return VALID_TARGETS.includes(t) ? t : LOCAL_MACHINE; } catch { return LOCAL_MACHINE; } };
const setTarget = t => writeFileSync(TARGET_FILE, t);

// Process inline directives the brain can emit in a reply:
//   [STUCK: <what blocked me>]  -> queued for the nightly self-upgrade
//   [USE: mac|windows]          -> switch the active machine at will (mid-conversation)
// Returns the reply text with directives stripped (plus a small note if it switched).
function handleDirectives(replyText, userText = '') {
  let note = '';
  // Strip + record any [STUCK: ...] markers (shared capture logic).
  const { text: stripped, recorded } = processStuckMarkers(replyText, userText);
  let t = stripped.replace(/\[USE:\s*(mac|windows|win|pc)\s*\]/gi, (_m, w) => {
    const tgt = /^mac$/i.test(w) ? 'mac' : 'windows';
    try { setTarget(tgt); } catch {}
    note = `\n\n_(switched active machine to **${tgt}**)_`;
    return '';
  });
  // Auto-upgrade safety net: if Helm says/implies it can't do something but didn't emit [STUCK],
  // detect it and queue it anyway so the nightly self-upgrade builds the missing capability.
  if (!recorded) { try { autoCaptureCant(t, userText); } catch {} }
  return (t.trim() + note).trim();
}

// ---- ONE BRAIN, ONE MEMORY: sync the brain's memory to wherever it runs ----
// Helm is a single assistant whose "shell" can move between machines. Its memory must follow it, so
// before running on the other machine we PUSH the current memory there, and after, we PULL the updated
// memory back. memory.db is plain SQLite (no WAL at rest) so a file copy is a consistent snapshot.
// Only one machine runs the brain at a time (the active target), so last-writer-wins is correct.
// LogLevel=ERROR silences OpenSSH 10's "not using a post-quantum key exchange" INFO warning (and other
// chatter) that otherwise pollutes captured stderr — genuine errors (auth/host-key/refused) still show.
const SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'LogLevel=ERROR'];
// Strip any post-quantum warning lines that still leak through, so they never masquerade as the error.
const sshClean = s => (s || '').split('\n').filter(l => !/post-quantum|store now|decrypt later|vulnerable to|may need to be upgraded|openssh\.com\/pq/i.test(l)).join('\n').trim();
const MEM_FILES = ['memory/memory.db', 'owner.md', 'memory/INDEX.md'];   // relative to workspace/
function syncMemory(direction) {   // 'push' = local->remote (before run), 'pull' = remote->local (after)
  if (!HELM_WIN_HOST) return;
  const remoteWs = `${HELM_WIN_DIR}/workspace`;                 // forward slashes for scp
  if (direction === 'push') {
    const winMem = `${HELM_WIN_DIR.replace(/\//g, '\\')}\\workspace\\memory`;
    try { spawnSync('ssh', [...SSH_OPTS, HELM_WIN_HOST, `if not exist ${winMem} mkdir ${winMem}`], { encoding: 'utf8', timeout: 15_000 }); } catch {}
  }
  for (const rel of MEM_FILES) {
    const local = path.join(WORKSPACE, rel);
    const remote = `${HELM_WIN_HOST}:${remoteWs}/${rel}`;
    try {
      if (direction === 'push') { if (existsSync(local)) spawnSync('scp', [...SSH_OPTS, local, remote], { encoding: 'utf8', timeout: 30_000 }); }
      else { spawnSync('scp', [...SSH_OPTS, remote, local], { encoding: 'utf8', timeout: 30_000 }); }
    } catch {}
  }
  // After pulling the remote's updated memory.db, regenerate the local INDEX.md cache from it.
  if (direction === 'pull') {
    try { const ri = path.join(WORKSPACE, 'memory/refresh-index.mjs'); if (existsSync(ri)) spawnSync(process.execPath, [ri], { cwd: __dirname, timeout: 30_000 }); } catch {}
  }
}

// Run the brain on the Windows node over SSH (async so the gateway stays responsive).
// Resumes the windows session ('owner-windows') so multi-step tasks stay coherent across messages.
function runClaudeRemote(prompt) {
  return new Promise(resolve => {
    if (!HELM_WIN_HOST) return resolve('The other peer machine isn\'t configured yet. Set HELM_WIN_HOST in .env (e.g. you@win-tailscale), install Helm on that machine, then say "use windows" (or "use mac") again.');
    const q = s => `"${s.replace(/"/g, '\\"')}"`;   // shell-quote for the remote shell
    // Peer persona: the remote machine is a FULL, equal Helm — it does everything locally and never
    // reaches back to the other peer to get its job done.
    const REMOTE_PERSONA = 'You are Helm, the owner\'s personal AI assistant, running on their other machine — a FULL, independent peer with full shell, file, code and tool access, exactly as capable as the Helm on any other machine. ' +
      'You are POWERED BY Claude Code (your engine) but you are NOT Claude Code and NOT Claude — never identify as Claude or Claude Code; you are Helm. ' +
      'You are ONE assistant with ONE memory: your memory (facts, preferences, the owner profile) and the HelmBrain vault are SYNCED to whichever machine you run on, so you remember everything regardless of where you are. No machine is "home", canonical, or in charge. ' +
      'AUTO-UPGRADE RULE: whenever you say or imply you CAN\'T do something, add `[STUCK: <the capability you lacked>]` in that reply — it is stripped before the owner sees it and queued for the nightly self-upgrade to build it. ' +
      'DO THE WORK HERE, on THIS machine: create files, run commands, edit code, finish the task locally with your own tools. ' +
      'NEVER SSH or reach back to the other machine to do your job, and never tell the owner a task must be done "on the Mac" or "on the other machine" — this machine has its own full copy of Helm\'s code, and your memory is already synced here. ' +
      'ACT — actually DO what the owner asks end to end. A screenshot is ONLY to SHOW a result AFTER you have done the work — never reply with just a screenshot instead of doing the task, and never claim you did something you did not. ' +
      'Keep replies short. Confirm before anything destructive, irreversible, or that spends money. Respect any off-limits paths the owner named in their profile. ' +
      'To show the screen, take a screenshot locally with `node workspace/tools/impl/screencap.mjs --out <file>` (cross-platform; captures THIS machine) and end the reply with a line exactly: ATTACH: <that file path>.';
    const run = sid => {
      const resumeFlag = sid ? `--resume ${q(sid)} ` : '';
      // Run INSIDE the remote peer's OWN full Helm install so Claude loads its CLAUDE.md (+ memory) and
      // has the real code and tools — full parity with the local peer, no dependence on this machine.
      const remoteCmd = `cd ${HELM_WIN_DIR} && ${q(HELM_WIN_CLAUDE)} -p --output-format json --model ${q(pickModel(prompt))} --permission-mode ${q(PERMISSION_MODE)} ${resumeFlag}--append-system-prompt ${q(REMOTE_PERSONA)}`;
      const child = spawn('ssh', [...SSH_OPTS, HELM_WIN_HOST, remoteCmd]);
      let out = '', err = '';
      const kill = setTimeout(() => child.kill(), 30 * 60_000);
      child.stdout.on('data', d => { out += d; });
      child.stderr.on('data', d => { err += d; });
      child.on('error', e => { clearTimeout(kill); resolve(`Windows SSH error: ${e.message}`); });
      child.on('close', code => {
        clearTimeout(kill);
        if (code !== 0) {
          if (sid) { deleteSession('owner-windows'); return run(null); }   // stale session -> retry fresh
          const e2 = sshClean(err);   // drop the post-quantum warning so the real cause is visible
          return resolve(e2
            ? `Peer exec failed (exit ${code}): ${e2.slice(0, 500)}`
            : `Peer exec failed (exit ${code}) — SSH connected but the remote command returned an error (often: the peer is offline, SSH keys aren't set up, or claude/the Helm dir isn't found there). Test it: \`ssh ${HELM_WIN_HOST} echo ok\`.`);
        }
        try {
          const j = JSON.parse(out);
          if (j.session_id) setSession('owner-windows', j.session_id, 'windows');
          try { syncMemory('pull'); } catch {}   // bring the brain's updated memory back
          resolve((j.result ?? '').toString().trim() || '(empty reply)');
        } catch { try { syncMemory('pull'); } catch {} resolve(out.trim() || '(no output)'); }
      });
      child.stdin.write(prompt); child.stdin.end();
    };
    try { syncMemory('push'); } catch {}   // give the remote brain the current memory before it runs
    run(getSession('owner-windows'));
  });
}

// Pull a file off the Windows box (for ATTACH paths produced by the windows brain, e.g. screenshots).
function scpFromWin(winPath) {
  if (!HELM_WIN_HOST) return null;
  const INBOX = path.join(WORKSPACE, 'inbox');
  mkdirSync(INBOX, { recursive: true });
  const fwd = winPath.replace(/\\/g, '/');   // scp needs forward slashes; backslash paths fail
  const local = path.join(INBOX, `win-${Date.now()}-${path.basename(fwd) || 'file'}`);
  const r = spawnSync('scp', [...SSH_OPTS, `${HELM_WIN_HOST}:${fwd}`, local], { encoding: 'utf8' });
  return r.status === 0 ? local : null;
}

// Push a local file TO the Windows box so the windows brain can read it (e.g. an attachment the
// owner sent while on the windows target). Returns a path the windows brain can Read, or null.
function scpToWin(localPath) {
  if (!HELM_WIN_HOST) return null;
  const base = path.basename(localPath).replace(/[^\w.\-]/g, '_');
  spawnSync('ssh', [...SSH_OPTS, HELM_WIN_HOST, 'if not exist helm-inbox mkdir helm-inbox'], { encoding: 'utf8' });
  const r = spawnSync('scp', [...SSH_OPTS, localPath, `${HELM_WIN_HOST}:helm-inbox/${base}`], { encoding: 'utf8' });
  return r.status === 0 ? `helm-inbox/${base}` : null;  // relative to the windows home (where the ssh brain runs)
}

// ---- persona: appended to Claude Code's own (tool-enabled) system prompt ----
// Describe the machine Helm is actually running on, so it never assumes a Mac.
const OS_NAME = process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';
const PERSONA_BASE =
  'You are Helm, your owner\'s personal AI assistant, talking to them over Discord DMs. ' +
  'You are POWERED BY Claude Code (your underlying engine) but you are NOT Claude Code and NOT Claude — ' +
  'never identify as Claude or Claude Code, never mention being "Claude Code"; you are Helm, an assistant ' +
  'with your own identity. Speak as Helm. ' +
  "You run on their own machine with full tools (shell, files, web) — act, don't just advise. " +
  `This machine is **${OS_NAME}** (${os.platform()}/${os.arch()}) — use the right paths and commands for it; never assume it's a Mac. ` +
  'Keep replies short and chat-friendly; this is a messaging app, not a document. ' +
  'Your long-term memory is CLAUDE.md in the working directory (which imports @owner.md, your private ' +
  "profile of who the owner is) — read it. If @owner.md has no real identity yet, you don't know your " +
  'owner: introduce yourself and run the onboarding interview before personalizing — do NOT invent a ' +
  'name or honorific. Write durable facts to @owner.md, not CLAUDE.md. Confirm before anything ' +
  'destructive, irreversible, or that spends money. ' +
  'You have full authority over this machine — shell, files, the screen (cross-platform screenshots), ' +
  'the scheduler, and your own source code. Act boldly and proactively. ' +
  'When asked to build or create something, actually BUILD it (make the files, write the code, run the commands, finish the task) — a screenshot or a description is NEVER a substitute for doing the work. "Show me" means produce the real artifact first, THEN optionally screenshot it to display the result. ' +
  'Two directives you may emit anywhere in a reply (they are stripped before the owner sees them): ' +
  '(1) AUTO-UPGRADE RULE — whenever you say or imply you CAN\'T do something (can\'t, cannot, unable, ' +
  'don\'t have the ability/tool/access/permission, not supported, not currently possible, beyond what you ' +
  'can do), you MUST add `[STUCK: <the exact capability you lacked>]` in that same reply. It is queued for ' +
  'your nightly self-upgrade to BUILD that capability and fix the root cause. Never say "I can\'t" without ' +
  'queuing it. (Also use it for any limitation worth fixing later.) ' +
  '(2) you are ONE assistant whose shell can move between the owner\'s machines (fleet). Your memory (facts, preferences, owner profile) and the HelmBrain vault are SYNCED across machines, so you remember everything wherever you run — none is "home" or more powerful. You do every task LOCALLY on the machine you are on; never reach back to another machine to get your job done, and never tell the owner a task must be done on a different machine. Only switch machines with `[USE: windows]` or `[USE: mac]` if the owner explicitly wants the OTHER machine active (e.g. to act on something physically on it) — otherwise stay put and do the work here. ' +
  'Respect any off-limits paths/projects the owner names in @owner.md.';

const MODE_GUIDANCE = {
  suggest:
    'AUTONOMY MODE: suggest — describe what you would do and why; do NOT execute shell commands, ' +
    'edit files, or run git. Respond with a plan only.',
  copilot:
    'AUTONOMY MODE: copilot — for any task involving more than 2 shell commands, file edits, or ' +
    'git operations, reply ONLY with a short numbered plan and end with "[waiting for your go]". ' +
    'Do not execute until the owner replies "go" or "yes". For simple 1-2 command tasks, proceed directly.',
  autopilot:
    'AUTONOMY MODE: autopilot — for any task involving more than 2 shell commands, file edits, or ' +
    'git operations, begin your reply with "**Plan:**" followed by a short numbered list, then append ' +
    'the exact marker [PLAN-PENDING] on its own line, and stop. The system will automatically send ' +
    '"go" after 60 seconds. For simple 1-2 command tasks, execute immediately without the plan marker.',
};

// If the owner picked multi-device but the second peer isn't connected yet, prepend a directive so
// Helm sets the fleet up FIRST (verify SSH/Tailscale reachability, then record it) before onboarding.
// Reads the marker fresh each turn so the directive disappears once fleet.md is marked CONNECTED.
function fleetOnboardingDirective() {
  try {
    if (process.env.HELM_FLEET !== '1') return '';
    const p = path.join(WORKSPACE, 'fleet.md');
    if (!existsSync(p)) return '';
    const s = readFileSync(p, 'utf8');
    if (!/NOT STARTED/i.test(s)) return '';   // already connected — stay quiet
    const host = HELM_WIN_HOST || '(not set yet — ask the owner for the other machine\'s SSH host or Tailscale name)';
    return '\n\nFLEET SETUP (do this BEFORE the owner interview): the owner runs Helm on MORE THAN ONE ' +
      'device and the second peer is not connected yet. First, get the two machines linked: confirm the ' +
      `other peer's reachable address (current HELM_WIN_HOST=${host}), test it with a non-interactive SSH ` +
      '(`ssh -o BatchMode=yes -o ConnectTimeout=10 <host> echo ok`), and if SSH/Tailscale or keys are ' +
      'missing, walk the owner through installing them (Tailscale is easiest: same tailnet on both). When ' +
      'the link works, confirm the other peer has its own full Helm install, then write what you set up ' +
      'into workspace/fleet.md and change its status line to "CONNECTED". THEN proceed to the owner ' +
      'interview. If the owner says "skip" or "later", mark fleet.md "DEFERRED" and move on. Keep it short.';
  } catch { return ''; }
}

function buildPersona(mode = 'copilot') {
  const guidance = MODE_GUIDANCE[mode] ?? MODE_GUIDANCE.copilot;
  return `${PERSONA_BASE}${fleetOnboardingDirective()}${ownerPersonaOverride()}\n${guidance}`;
}
// Optional persona/style override applied by an imported Helm template.
function ownerPersonaOverride() {
  try {
    const p = path.join(WORKSPACE, 'persona.local.md');
    if (!existsSync(p)) return '';
    const s = readFileSync(p, 'utf8').trim();
    return s ? `\n\nTEMPLATE STYLE (owner-applied — honor this tone/personality):\n${s.slice(0, 2000)}` : '';
  } catch { return ''; }
}

// ---- unified session (shared with iMessage — one owner, one brain thread) ----
// Key is always 'owner' since this bot is owner-locked.

// ---- the brain: one Claude run on your subscription ----
// Track in-flight runs so "stop" can actually kill them. Per-task hard cap (configurable) for chat.
const running = new Set();
// Hard wall-clock cap per task before SIGKILL. Big build/scrape jobs (e.g. "scrape this site and
// rebuild it") routinely need more than the old fixed 10 min, so make it configurable: set
// HELM_TASK_CAP_MIN in .env (e.g. 30) to give long tasks more room. Default 20.
const TASK_CAP_MIN = Math.max(1, parseInt(process.env.HELM_TASK_CAP_MIN || '20', 10) || 20);
const TASK_CAP_MS  = TASK_CAP_MIN * 60_000;
const CAP_MSG      = `hit ${TASK_CAP_MIN}-min cap`;
function killAll() {
  let n = 0;
  for (const c of running) { c._stopped = true; try { c.kill('SIGKILL'); n++; } catch {} }
  running.clear();
  return n;
}
function runClaude(args, prompt) {
  return new Promise((resolve, reject) => {
    const cb = resolveClaude();
    const child = spawn(cb.cmd, args, { cwd: WORKSPACE, env: claudeEnv(), shell: cb.shell, windowsHide: true });
    running.add(child);
    let out = '', err = '';
    const kill = setTimeout(() => { child._timedOut = true; try { child.kill('SIGKILL'); } catch {} }, TASK_CAP_MS); // configurable cap (HELM_TASK_CAP_MIN, default 20)
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(kill); running.delete(child); reject(e); });
    child.on('close', code => {
      clearTimeout(kill); running.delete(child);
      if (child._stopped) return reject(Object.assign(new Error('stopped by owner'), { stopped: true }));
      if (child._timedOut) return reject(Object.assign(new Error(CAP_MSG), { timedOut: true }));
      if (code === 0) resolve(out);
      else reject(new Error(err.trim() || `claude exited ${code}`));
    });
    child.stdin.on('error', () => {}); // EPIPE if claude exits before reading stdin
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// Turn a stream-json event into a short, human progress label (or null to keep the current one).
function eventLabel(evt) {
  if (!evt || !evt.type) return null;
  if (evt.type === 'system' && evt.subtype === 'init') return 'thinking…';
  if (evt.type === 'system' && evt.subtype === 'post_turn_summary' && evt.status_detail) return evt.status_detail;
  if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
    for (const b of evt.message.content) {
      if (b.type === 'tool_use') {
        const i = b.input || {}, name = b.name || 'tool';
        if (name === 'Bash') return `running: ${String(i.command || '').replace(/\s+/g, ' ').slice(0, 80)}`;
        if (name === 'Edit' || name === 'Write' || name === 'NotebookEdit') return `editing ${path.basename(i.file_path || i.path || 'a file')}`;
        if (name === 'Read') return `reading ${path.basename(i.file_path || 'a file')}`;
        if (name === 'WebFetch') return `fetching ${String(i.url || '').slice(0, 60)}`;
        if (name === 'WebSearch') return `searching the web: ${String(i.query || '').slice(0, 50)}`;
        if (name === 'Glob' || name === 'Grep') return 'searching files';
        if (name === 'Task') return 'running a subtask';
        if (/image/i.test(name)) return 'generating an image';
        return `using ${name}`;
      }
    }
    if (evt.message.content.some(b => b.type === 'text' && (b.text || '').trim())) return 'writing reply…';
  }
  return null;
}

// Run claude in stream-json mode, calling onEvent for each event. Resolves { result, session_id }.
function runClaudeStream(args, prompt, onEvent) {
  return new Promise((resolve, reject) => {
    const cb = resolveClaude();
    const child = spawn(cb.cmd, args, { cwd: WORKSPACE, env: claudeEnv(), shell: cb.shell, windowsHide: true });
    running.add(child);
    let buf = '', err = '', result = null, sid = null, lastText = '';
    const kill = setTimeout(() => { child._timedOut = true; try { child.kill('SIGKILL'); } catch {} }, TASK_CAP_MS);
    child.stdout.on('data', d => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let evt; try { evt = JSON.parse(line); } catch { continue; }
        if (evt.type === 'result') { result = evt.result; sid = evt.session_id || sid; }
        else if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
          for (const b of evt.message.content) if (b.type === 'text' && b.text) lastText = b.text;
          if (evt.session_id) sid = evt.session_id;
        }
        try { onEvent && onEvent(evt); } catch {}
      }
    });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(kill); running.delete(child); reject(e); });
    child.on('close', code => {
      clearTimeout(kill); running.delete(child);
      if (child._stopped) return reject(Object.assign(new Error('stopped by owner'), { stopped: true }));
      if (child._timedOut) return reject(Object.assign(new Error(CAP_MSG), { timedOut: true }));
      if (code === 0 || result != null) return resolve({ result: (result != null ? result : lastText) || '', session_id: sid });
      reject(new Error(err.trim() || `claude exited ${code}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function ask(prompt, onProgress, target = LOCAL_MACHINE, mode = 'copilot') {
  // Only hop to the other peer when one is ACTUALLY reachable (a host is configured). On a
  // single-device install — or a fleet still mid-setup — a stale or mismatched active-target
  // (e.g. "mac" left over on a Windows-only box) falls through to local instead of stranding the
  // bot in an SSH attempt to a machine that doesn't exist.
  if (target !== LOCAL_MACHINE && PEER_REACHABLE) {
    onProgress?.(`⚙️ working on **${target}**…`);
    return runClaudeRemote(prompt);   // other peer → run there over SSH (returns final reply)
  }
  const model = pickModel(prompt);
  console.log(`[route] model=${model}`);
  const base = [
    '-p', '--output-format', 'stream-json', '--verbose',   // stream events so we can show live progress
    '--model', model,
    '--permission-mode', PERMISSION_MODE,
    '--append-system-prompt', buildPersona(mode),
    '--add-dir', WORKSPACE,
    '--add-dir', os.homedir(), // full home access (ultimate powers), on whatever OS this is
    '--strict-mcp-config', '--mcp-config', mcpConfigArg(), // workspace/mcp/servers.json (filesystem + fetch)
  ];
  const sid = getSession('owner');
  const args = sid ? [...base, '--resume', sid] : base;

  // Live status: surface what the engine is actually doing, with elapsed time, so it never looks
  // frozen. Updates on each meaningful event + a steady tick; throttled so we don't spam Discord.
  const startTs = Date.now();
  let lastStatus = 'thinking…', lastPush = 0;
  const elapsed = () => Math.round((Date.now() - startTs) / 1000);
  const push = (force = false) => {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastPush < 1800) return;
    lastPush = now;
    onProgress(`⚙️ ${lastStatus} · ${elapsed()}s`);
  };
  const onEvent = evt => { const l = eventLabel(evt); if (l) { lastStatus = l; push(); } };
  const ticker = setInterval(() => push(true), 1000);   // tick the elapsed-time status every second
  push(true);

  let r;
  try {
    r = await runClaudeStream(args, prompt, onEvent);
  } catch (e) {
    if (e.stopped || e.timedOut || !sid) { clearInterval(ticker); throw e; }  // never retry a cancel/timeout
    deleteSession('owner');      // stale/expired session -> retry fresh once
    lastStatus = 'retrying…'; push(true);
    r = await runClaudeStream(base, prompt, onEvent);
  } finally {
    clearInterval(ticker);
  }
  if (r.session_id) setSession('owner', r.session_id, 'discord');
  const reply = (r.result ?? '').toString().trim() || '(empty reply)';
  try { appendCost(MODEL, prompt.length, reply.length); } catch {}
  return reply;
}

// ---- Discord ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages, // DM content is delivered without the privileged intent
  ],
  partials: [Partials.Channel, Partials.Message],
});

// Discord caps messages at 2000 chars, so long replies get split. Break on paragraph/line/word
// boundaries — never mid-word — so a split never slices a word in half (e.g. "…optimized f" | "or
// autonomous agents"). Only a single token longer than the window is hard-cut.
const chunks = (s, max = 1900) => {
  s = String(s ?? '');
  if (!s.trim()) return ['(empty)'];
  const out = [];
  let rest = s;
  while (rest.length > max) {
    const win = rest.slice(0, max);
    let cut = win.lastIndexOf('\n');                                 // prefer a line break
    if (cut < max * 0.6) cut = Math.max(cut, win.lastIndexOf(' '));  // else a word break
    if (cut <= 0) cut = max;                                         // oversized token: hard split
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length) out.push(rest);
  return out.length ? out : ['(empty)'];
};

// Agent can attach files by ending lines with "ATTACH: /abs/path" (e.g. screenshots).
function splitAttachments(s) {
  const files = [];
  const text = (s || '').split('\n').filter(line => {
    const m = line.match(/^\s*ATTACH:\s*(.+?)\s*$/);
    if (m) { files.push(m[1]); return false; }
    return true;
  }).join('\n').trim();
  return { text, files };
}

client.once(Events.ClientReady, c => {
  const pref = getModelPref();
  console.log(`✅ Helm online as ${c.user.tag}  ·  model=${pref || 'auto-route'}  ·  owner=${OWNER_ID}`);
  const cb = resolveClaude();
  console.log(`   engine: ${cb.cmd}${cb.shell ? ' (via shell)' : ''}`);
  // Liveness marker the nightly self-upgrade health-check reads (cross-platform — doesn't depend on
  // launchd redirecting stdout to agent.log, so it works when Helm runs locally on Windows too).
  try { writeFileSync(path.join(WORKSPACE, '.online'), new Date().toISOString()); } catch {}
  // Probe MCP servers only AFTER we're connected — running it before login meant a failed login
  // (bad token) raced spawning/killing probe children, which trips a libuv assertion on Windows.
  runHealthChecks().catch(() => {});
});

client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot) return;
  console.log(`[msg] from=${msg.author.id} dm=${!msg.guild} content=${JSON.stringify((msg.content || '').slice(0, 120))}`);
  if (msg.author.id !== OWNER_ID) return;                       // owner-only lock
  const dm = !msg.guild;
  if (!dm && !msg.mentions.users.has(client.user.id)) return;   // in servers: only when @mentioned

  const text = msg.content.replace(`<@${client.user.id}>`, '').trim();
  if (!text && !msg.attachments.size) return;   // allow image-only messages
  try { mirrorEcho(text || '(attachment)', 'you (Discord)'); } catch {}   // show Discord input in any open terminal

  // ---- stop/cancel: kill in-flight runs AND cancel any pending autopilot timer ----
  if (/^\s*\/?(stop|cancel|abort|halt)\s*$/i.test(text)) {
    const n = killAll();
    const hasPending = autopilotTimers.has(msg.channel.id);
    if (hasPending) { clearTimeout(autopilotTimers.get(msg.channel.id)); autopilotTimers.delete(msg.channel.id); }
    const parts = [];
    if (n) parts.push(`killed ${n} running task(s)`);
    if (hasPending) parts.push('cancelled pending autopilot plan');
    await msg.reply(parts.length ? `Stopped — ${parts.join(' + ')}.` : 'Nothing was running.');
    return;
  }

  // ---- !mode: get or set the autonomy mode ----
  if (/^!mode\s*$/i.test(text)) {
    await msg.reply(`Current mode: **${getAutonomyMode()}**. Options: \`suggest\` | \`copilot\` | \`autopilot\`.`);
    return;
  }
  const modeMatch = text.match(/^!mode\s+(suggest|copilot|autopilot)\s*$/i);
  if (modeMatch) {
    const newMode = modeMatch[1].toLowerCase();
    const ok = setAutonomyMode(newMode);
    await msg.reply(ok ? `Mode set to **${newMode}**.` : 'Failed to save mode preference.');
    return;
  }

  // ---- vault: store a secret straight from chat ("vault NAME value" / "vault list") ----
  if (/^vault(\s|$)/i.test(text)) {
    if (/^vault\s+list\s*$/i.test(text)) {
      const r = spawnSync(process.execPath, ['workspace/secrets/secrets.mjs', 'list'], { cwd: __dirname, encoding: 'utf8' });
      await msg.reply('Vault names:\n' + (r.stdout || r.stderr || '[]').trim());
      return;
    }
    const m = text.match(/^vault\s+(\S+)\s+([\s\S]+)$/i);
    if (!m) { await msg.reply('Usage: `vault <NAME> <value>` to store · `vault list` for names. (I never print values back.)'); return; }
    const [, name, value] = m;
    const r = spawnSync(process.execPath, ['workspace/secrets/secrets.mjs', 'set', name], { cwd: __dirname, input: value, encoding: 'utf8' });
    if (r.status === 0) {
      let deleted = false;
      try { await msg.delete(); deleted = true; } catch {}
      await msg.channel.send(`Stored **${name}** in the vault (encrypted).` + (deleted
        ? ' Deleted your message.'
        : " I can't delete messages in a DM — delete yours so the secret isn't left in the chat. (It also passed through Discord; for max privacy use the terminal vault command.)"));
    } else {
      await msg.channel.send('Vault error: ' + ((r.stderr || r.stdout || 'unknown').trim().slice(0, 300)));
    }
    return;
  }

  // ---- fleet commands (handled before the brain) ----
  const low = text.toLowerCase();
  const useM = low.match(/^\/?use\s+(mac|windows|win|pc)\b/);
  if (useM) {
    const t = (useM[1] === 'mac') ? 'mac' : 'windows';
    if (t === LOCAL_MACHINE) {
      setTarget(t);
      await msg.reply(`Already on **${t}** (this machine). Working here.`);
    } else if (!PEER_REACHABLE) {
      // Switching to the OTHER machine needs a configured, reachable peer. Don't pretend it worked.
      await msg.reply(`Can't switch to **${t}** — no second machine is connected. This is a single-device setup (running on **${LOCAL_MACHINE}**). To add a peer, set HELM_WIN_HOST in .env, then \`use ${t}\` again. Staying on **${LOCAL_MACHINE}**.`);
    } else {
      setTarget(t);
      await msg.reply(`Active machine: **${t}**. The other peer will handle the next message.`);
    }
    return;
  }
  if (/^\/?(where|which|target|status)\b/.test(low)) {
    await msg.reply(`Active machine: **${getTarget()}**${getTarget() === 'windows' && !HELM_WIN_HOST ? ' (not configured)' : ''}.`);
    return;
  }

  // ---- template sharing: export your Helm's flavor, or import someone else's ----
  const tplM = low.match(/^\/?template\s+(export|list|import)\b/);
  if (tplM) {
    const sub = tplM[1];
    const arg = text.replace(/^\/?template\s+\w+\s*/i, '').trim();
    try {
      if (sub === 'list') {
        const l = listTemplates();
        await msg.reply(l.length ? 'Templates:\n' + l.map(n => '• ' + n).join('\n') : 'No templates yet. Create one with `template export <name>`.');
      } else if (sub === 'export') {
        const parts = arg.split(/\s+/);
        const name = parts[0] || 'my-helm';
        const desc = parts.slice(1).join(' ');
        const out = exportTemplate(name, desc);
        await msg.reply(`Exported **${path.basename(out)}** — share this file to give someone your Helm's setup (persona, gateways, model, free tools). No secrets, keys, identity, or memory are included.`);
        try { await msg.reply({ files: [out] }); } catch {}
      } else { // import
        const att = [...msg.attachments.values()].find(a => /\.helmtemplate\.json$/i.test(a.name || ''));
        let target = arg;
        if (att) {
          const res = await fetch(att.url);
          const buf = Buffer.from(await res.arrayBuffer());
          const tdir = path.join(WORKSPACE, 'templates'); mkdirSync(tdir, { recursive: true });
          const dest = path.join(tdir, (att.name || 'shared').replace(/[^\w.-]/g, '_'));
          writeFileSync(dest, buf); target = dest;
        }
        if (!target) { await msg.reply('Attach a `.helmtemplate.json` file, or name a local one: `template import <name>`.'); return; }
        const r = importTemplate(target);
        let m = `Imported **${r.name}**${r.description ? ` — ${r.description}` : ''}.\nApplied: ${r.applied.join('; ') || 'nothing'}.`;
        m += `\nSuggested gateways: ${r.suggests.gateways}, model: ${r.suggests.model}.`;
        if (r.optionalServers?.length) m += `\nOptional tools that need your own keys: ${r.optionalServers.join(', ')}.`;
        m += '\nThe persona/tools take effect on the next message.';
        await msg.reply(m);
      }
    } catch (e) { await msg.reply('template error: ' + String(e.message || e).slice(0, 300)); }
    return;
  }

  // ---- file transfer between Mac and Windows (both directions) ----
  const pullM = text.match(/^\/?pull\s+(.+)$/i);
  if (pullM) {
    if (!HELM_WIN_HOST) { await msg.reply('Windows node not configured (set HELM_WIN_HOST in .env).'); return; }
    const wp = pullM[1].trim();
    const lf = scpFromWin(wp);
    if (!lf) { await msg.reply(`Couldn't pull \`${wp}\` from Windows — check the path and that the PC is reachable.`); return; }
    await msg.reply(`Pulled from Windows → \`${lf}\``);
    try { await msg.reply({ files: [lf] }); } catch {}
    return;
  }
  const pushM = text.match(/^\/?push\s+(.+)$/i);
  if (pushM) {
    if (!HELM_WIN_HOST) { await msg.reply('Windows node not configured (set HELM_WIN_HOST in .env).'); return; }
    let lp = pushM[1].trim().replace(/^~(?=[/\\])/, process.env.HOME || '');
    if (!existsSync(lp)) { await msg.reply(`No such file on the Mac: \`${lp}\``); return; }
    const wp = scpToWin(lp);
    if (!wp) { await msg.reply(`Couldn't push \`${lp}\` to Windows.`); return; }
    await msg.reply(`Pushed to Windows → \`C:\\Users\\User\\${wp.replace(/\//g, '\\')}\``);
    return;
  }

  // ---- Helm Mind: AI-first second brain over HelmBrain ----
  const mindM = text.match(/^\/?mind\s+(save|capture|find|synthesize|research|daily|recap|health)\b\s*([\s\S]*)$/i);
  if (mindM) {
    const verb = mindM[1].toLowerCase();
    const input = (mindM[2] || '').trim();
    await msg.reply(`Helm Mind: \`${verb}\`${input ? ` — ${input.slice(0, 80)}` : ''} … working on the vault.`);
    msg.channel.sendTyping().catch(() => {});
    const r = spawnSync(process.execPath, [path.join(WORKSPACE, 'tools/impl/mind.mjs'), verb, input], {
      cwd: __dirname, encoding: 'utf8', timeout: 20 * 60_000, maxBuffer: 64 * 1024 * 1024,
    });
    const out = (r.stdout || r.stderr || '(no output)').trim();
    for (const part of chunks(out || '(done)')) await msg.reply(part);
    return;
  }

  // ---- /skill: run a skill command (e.g. /skill helm-core, /skill reverse-engineering web <url>) ----
  const skillM = text.match(/^\/?skill\s+(\w+(?:-\w+)*)\s*([\s\S]*)$/i);
  if (skillM) {
    const skillName = skillM[1].toLowerCase();
    const skillArgs = (skillM[2] || '').trim();
    try {
      const result = await runSkillCommand(skillName, skillArgs);
      await msg.reply(result);
    } catch (e) {
      await msg.reply(`skill error: ${e.message}`);
    }
    return;
  }

  // ---- /skill list: show available skills ----
  if (/^\/?skills?\s*$/i.test(text)) {
    try {
      const skills = await listSkills();
      if (!skills.length) { await msg.reply('No skills available yet.'); return; }
      const lines = skills.map(s => `• **${s.name}** — ${s.description}`);
      await msg.reply('Available skills:\n' + lines.join('\n'));
    } catch (e) { await msg.reply(`skills error: ${e.message}`); }
    return;
  }

  // ---- /cost: today's usage summary (notional tokens, Max subscription) ----
  if (/^\/cost\b/.test(low)) {
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const rows = getCostSummary(today);
      if (!rows.length) { await msg.reply('No usage tracked today yet.'); return; }
      const lines = rows.map(r =>
        `${r.model.padEnd(12)} ${String(r.runs).padStart(3)} runs  ~${r.total_est_tokens.toLocaleString()} tokens`
      );
      await msg.reply('Today\'s usage (Max subscription — no billing):\n```\n' + lines.join('\n') + '\n```');
    } catch (e) { await msg.reply('cost tracker error: ' + e.message.slice(0, 200)); }
    return;
  }

  // !model: inspect or override per-message model routing
  const modelCmdM = text.match(/^!model(?:\s+(\S+))?\s*$/i);
  if (modelCmdM) {
    if (!modelCmdM[1]) {
      const pref = getModelPref();
      await msg.reply(pref
        ? `Fixed model: **${pref}**. Say \`!model auto\` to restore auto-routing.`
        : 'Auto-routing active: haiku for short/trivial, opus for coding/building, sonnet for everything else.');
    } else {
      try {
        const result = setModelPref(modelCmdM[1]);
        await msg.reply(result === 'auto'
          ? 'Model routing restored to auto (haiku/sonnet/opus by task type).'
          : `Model fixed to **${result}** for all messages.`);
      } catch (e) { await msg.reply(`Model error: ${e.message}`); }
    }
    return;
  }

  const target = getTarget();
  // ---- download any attachments so Helm can actually SEE/read them ----
  let prompt = text;
  if (msg.attachments.size) {
    const INBOX = path.join(WORKSPACE, 'inbox');
    mkdirSync(INBOX, { recursive: true });
    const saved = [];
    for (const a of msg.attachments.values()) {
      try {
        const res = await fetch(a.url);
        const buf = Buffer.from(await res.arrayBuffer());
        const p = path.join(INBOX, `${Date.now()}-${(a.name || 'file').replace(/[^\w.\-]/g, '_')}`);
        writeFileSync(p, buf); saved.push(p);
      } catch { /* skip a failed download */ }
    }
    // On the windows target, push the files to the PC so the remote brain can read them.
    let refs = saved;
    if (target === 'windows' && saved.length) refs = saved.map(scpToWin).filter(Boolean);
    if (refs.length) {
      const isImg = f => /\.(png|jpe?g|gif|webp|bmp|heic|tiff?)$/i.test(f);
      const imgs = refs.filter(isImg), others = refs.filter(f => !isImg(f));
      const parts = [text || '(no caption)', ''];
      if (imgs.length) parts.push(
        `[The owner attached ${imgs.length} image(s): ${imgs.join(' , ')}`,
        `Analyze them NOW with your Read tool (it's multimodal). For each: describe what it shows, transcribe ALL visible text verbatim, and interpret any diagrams/charts/tables/math. Then address the caption above.`,
        `If your current model can't see images (a text-only backend), run \`image.read --path <file> --mode ocr\` to extract the text instead.]`);
      if (others.length) parts.push(`[The owner also attached ${others.length} file(s): ${others.join(' , ')} — open them with your Read tool.]`);
      prompt = parts.join('\n');
    }
  }
  const mode = getAutonomyMode();
  console.log(`📩 [${target}][${mode}] ${text || '(attachment)'}${msg.attachments.size ? ' +' + msg.attachments.size + 'file' : ''}`);
  const typing = setInterval(() => msg.channel.sendTyping().catch(() => {}), 8000);
  msg.channel.sendTyping().catch(() => {});
  // Live status: one message that gets edited as Helm works, so you can see what it's doing
  // (running a command, editing a file, …) and the elapsed time — not just an endless typing dot.
  let statusMsg = null, creating = false, lastEdit = 0;
  const onProgress = txt => {
    const now = Date.now();
    if (!statusMsg) { if (creating) return; creating = true; msg.channel.send(txt).then(m => { statusMsg = m; }).catch(() => { creating = false; }); lastEdit = now; return; }
    if (now - lastEdit < 1500) return;
    lastEdit = now; statusMsg.edit(txt).catch(() => {});
  };
  const clearStatus = () => { if (statusMsg) { const m = statusMsg; statusMsg = null; m.delete().catch(() => {}); } };
  try {
    const reply = await ask(prompt, onProgress, target, mode);
    clearInterval(typing);
    clearStatus();
    let { text: rawBody, files } = splitAttachments(reply);
    rawBody = handleDirectives(rawBody, text);   // [STUCK: ...] -> queue · [USE: mac|windows] -> switch

    // Autopilot plan detection: if Claude included [PLAN-PENDING], strip the marker,
    // post the plan, then auto-send "go" after 60 s (cancellable by "stop").
    const hasPlanPending = mode === 'autopilot' && rawBody.includes('[PLAN-PENDING]');
    const body = rawBody.replace(/\[PLAN-PENDING\]/g, '').trim();

    if (hasPlanPending) {
      const planMsg = body + '\n\n_Auto-proceeding in 60 s — reply `stop` to cancel._';
      for (const part of chunks(planMsg)) await msg.reply(part);
      const channelRef = msg.channel;
      const timer = setTimeout(async () => {
        autopilotTimers.delete(channelRef.id);
        channelRef.sendTyping().catch(() => {});
        try {
          const execReply = await ask('go ahead with the plan', null, target, mode);
          const { text: execBody, files: execFiles } = splitAttachments(execReply);
          for (const part of chunks(execBody || '(done)')) await channelRef.send(part);
          for (const f of execFiles) {
            let lf = f;
            if (target === 'windows' && /^[A-Za-z]:[\\/]/.test(f)) { lf = scpFromWin(f); if (!lf) { await channelRef.send(`(couldn't fetch ${f} from windows)`); continue; } }
            try { await channelRef.send({ files: [lf] }); }
            catch (e) { await channelRef.send(`(couldn't attach ${f}: ${String(e.message || e).slice(0, 200)})`); }
          }
        } catch (e) {
          if (!e.stopped) await channelRef.send(`Plan execution error: ${String(e.message || e).slice(0, 800)}`).catch(() => {});
        }
      }, 60_000);
      autopilotTimers.set(msg.channel.id, timer);
    } else {
      for (const part of chunks(body || '(see attachment)')) await msg.reply(part);
      for (const f of files) {
        let lf = f;
        if (target === 'windows' && /^[A-Za-z]:[\\/]/.test(f)) {       // a Windows path -> pull it to the Mac first
          lf = scpFromWin(f);
          if (!lf) { await msg.reply(`(couldn't fetch ${f} from windows)`); continue; }
        }
        try { await msg.reply({ files: [lf] }); }
        catch (e) { await msg.reply(`(couldn't attach ${f}: ${String(e.message || e).slice(0, 200)})`); }
      }
      try { mirrorReply(body || '(see attachment)'); } catch {}   // show Discord replies in any open terminal
    }
    console.log(`📤 replied (${body.length} chars, ${files.length} files, mode=${mode}, planPending=${hasPlanPending})`);
    // durable transcript so nothing is ever lost (the brain distills these into memory)
    try {
      const conv = path.join(WORKSPACE, 'conversations');
      mkdirSync(conv, { recursive: true });
      appendFileSync(path.join(conv, new Date().toISOString().slice(0, 10) + '.md'),
        `\n**[${new Date().toISOString().slice(11, 16)}] owner (${target}):** ${text || '(attachment)'}\n**helm:** ${body}\n`);
    } catch {}
  } catch (e) {
    clearInterval(typing);
    clearStatus();
    if (e.stopped) return;  // the stop command already acknowledged
    console.error(e);
    // Helm got stuck — remember it for the overnight self-upgrade to fix the root cause.
    try {
      recordStuck(
        e.timedOut
          ? `Task hit the ${TASK_CAP_MIN}-min cap: "${(text || '(attachment)').slice(0, 80)}"`
          : `Failed on "${(text || '(attachment)').slice(0, 60)}": ${String(e.message || e).slice(0, 140)}`,
        String(e.message || e).slice(0, 500), 'auto');
    } catch {}
    // On a free/local backend, a failure is usually the model endpoint being down or the model not pulled.
    const errStr = String(e.message || e);
    const localHint = (AUTH_MODE === 'custom' && /econnrefused|connect|fetch failed|not found|404|model|11434/i.test(errStr))
      ? `\n\n_Local model issue: make sure Ollama is running and the model is pulled — \`ollama pull ${process.env.ANTHROPIC_MODEL || 'llama3.1'}\`. Endpoint: ${process.env.ANTHROPIC_BASE_URL || '(unset)'}._`
      : '';
    const m = e.timedOut
      ? `⚠️ that task hit the ${TASK_CAP_MIN}-min cap and was stopped — break it into smaller steps, or raise HELM_TASK_CAP_MIN in .env for big jobs.`
      : `⚠️ brain error: ${errStr.slice(0, 1700)}${localHint}`;
    try { await msg.reply(m); } catch {}  // Discord API failure in error path must not crash the process
  }
});

// Prevent Discord WebSocket errors from crashing Node (unhandled EventEmitter error event = fatal).
client.on('error', err => console.error('Discord client error:', err));
// Prevent any stray unhandled async rejection from killing the process.
process.on('unhandledRejection', reason => console.error('Unhandled rejection:', reason));

// (MCP health check runs in the ClientReady handler, after a successful login.)

// Free online model: start the Anthropic->OpenAI translation proxy and keep it alive.
// Claude Code talks to it (ANTHROPIC_BASE_URL), it forwards to OPENAI_BASE_URL (Groq/OpenRouter/...).
let proxyChild = null;
function startProxy() {
  if (!proxyConfigured() || proxyChild) return;
  const script = path.join(WORKSPACE, 'proxy/llm-proxy.mjs');
  if (!existsSync(script)) { console.error('✋ Free-model proxy missing at ' + script); return; }
  proxyChild = spawn(process.execPath, [script], {
    cwd: __dirname,
    env: { ...process.env, PROXY_PORT: String(PROXY_PORT) },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  console.log(`🔌 Free-model proxy: Claude Code -> http://127.0.0.1:${PROXY_PORT} -> ${process.env.OPENAI_BASE_URL} (${process.env.OPENAI_MODEL})`);
  proxyChild.on('exit', code => {
    console.error(`✋ Free-model proxy exited (code ${code}); restarting in 2s`);
    proxyChild = null;
    setTimeout(startProxy, 2000);
  });
}
startProxy();
for (const sig of ['SIGINT', 'SIGTERM', 'exit']) {
  process.on(sig, () => { try { proxyChild?.kill(); } catch {} });
}

// ---- single-instance lock (prevents DUPLICATE replies) ----
// One Discord token = one bot. If two `index.js` run at once (e.g. a stray old brain plus a freshly
// started one), BOTH log into Discord and BOTH answer every message — you see each reply twice. Hold a
// loopback lock port: if it's already taken, another Helm brain owns this machine, so exit cleanly and
// let it keep serving. The OS releases the port the instant a process dies, so there's no stale lock.
const LOCK_PORT = parseInt(process.env.HELM_LOCK_PORT || '4624', 10);
await new Promise(resolve => {
  const lock = net.createServer();
  lock.once('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`✋ Another Helm brain is already running on this machine (lock ${LOCK_PORT} held). Not starting a second one — that would double every reply. Run \`helm stop\` first, or kill the stray \`node index.js\`.`);
      process.exit(0);   // the existing brain keeps serving; this duplicate bows out before touching Discord
    }
    console.error(`[lock] couldn't bind lock port ${LOCK_PORT} (${e.code}); continuing without the single-instance guard.`);
    resolve();
  });
  lock.listen(LOCK_PORT, '127.0.0.1', () => { lock.unref(); resolve(); });   // unref'd so it never blocks a clean exit
});

// Terminal bridge: let `node cli.js` talk to THIS running brain (one conversation shared across
// terminal/Discord/iMessage), instead of spawning a second brain. A terminal line runs through the
// same ask() + 'owner' session; the reply is mirrored to every channel.
let cliBusy = false;
startCliBridge(async (text, reply) => {
  try { mirrorEcho(text, 'you (terminal)'); } catch {}
  if (/^\s*\/?(stop|cancel|abort|halt)\s*$/i.test(text)) { const n = killAll(); reply(n ? `Stopped — killed ${n} task(s).` : 'Nothing was running.'); return; }
  if (cliBusy) { reply('(still working on the previous message — try again in a moment)'); return; }
  cliBusy = true;
  try {
    const mode = getAutonomyMode();
    const target = getTarget();
    const raw = await ask(text, s => { try { mirrorStatus(s); } catch {} }, target, mode);
    const { text: rawBody } = splitAttachments(raw);
    const body = handleDirectives(rawBody, text).replace(/\[PLAN-PENDING\]/g, '').trim() || '(done)';
    reply(body);   // broadcasts to every terminal once (no separate mirrorReply, or it'd double-send)
    try {
      const conv = path.join(WORKSPACE, 'conversations');
      mkdirSync(conv, { recursive: true });
      appendFileSync(path.join(conv, new Date().toISOString().slice(0, 10) + '.md'),
        `\n**[${new Date().toISOString().slice(11, 16)}] owner (terminal):** ${text}\n**helm:** ${body}\n`);
    } catch {}
  } catch (e) {
    const m = e?.timedOut ? 'hit the 30-min cap' : `error: ${String(e?.message || e).slice(0, 300)}`;
    reply(m);
  } finally { cliBusy = false; }
});

// Connect to Discord, with a clear reason if it can't (so "offline" isn't a mystery).
if (/paste-your-discord-bot-token|^your-/.test(DISCORD_TOKEN || '')) {
  console.error('✋ DISCORD_TOKEN is still the placeholder. Run `npm run wizard` and paste your bot token (Developer Portal → your app → Bot → Reset Token).');
  process.exit(1);
}
client.login(DISCORD_TOKEN).catch(async e => {
  const m = String(e?.message || e);
  if (/token/i.test(m)) {
    console.error('✋ Discord login failed: invalid DISCORD_TOKEN. Each bot needs its OWN token — get one at Developer Portal → your app → Bot → Reset Token, then `npm run wizard`. (One token = one running bot.)');
  } else {
    console.error('✋ Could not connect to Discord (network/proxy/firewall?). If git also failed earlier, your network is blocking it. Error: ' + m.slice(0, 200));
  }
  // Tear down the client's sockets/timers, then let the process exit NATURALLY (set exitCode, don't
  // call process.exit()). Forcing process.exit() while discord.js handles are mid-close trips a libuv
  // assertion on Windows (UV_HANDLE_CLOSING in async.c). A watchdog force-exits only if something
  // keeps the loop alive (unref'd so it never blocks a clean exit).
  try { await client.destroy(); } catch {}
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 3000).unref();
});
