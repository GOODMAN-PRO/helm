// Helm — your own tiny AI agent.
//
//   Discord DM (you only)  ->  claude -p  (your Max subscription, full tools)  ->  reply
//
// No framework, no plugins, no gateway service. Read it top to bottom.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from 'node:fs';
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
import { renderProjects, addProject, cancelProject, deleteProject, doneProject } from './workspace/projects/projects.mjs';
import { publicIdentity, setHandle as netSetHandle } from './workspace/network/identity.mjs';
import { register as netRegister, addFriend, acceptFriend, listFriends, sendMessage as netSend, poll as netPoll, HUB_URL } from './workspace/network/friends.mjs';

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
// An npm `.cmd` shim just wraps the real claude.exe (it literally calls
// node_modules\@anthropic-ai\claude-code\bin\claude.exe). Spawning that .cmd THROUGH A SHELL ENOENTs on
// some Windows setups ("The system cannot find the file specified"), so prefer the wrapped .exe — it
// runs directly (shell:false), which is more reliable and also avoids the shell-escaping deprecation.
function preferExe(p) {
  if (/\.exe$/i.test(p)) return { cmd: p, shell: false };
  if (/\.cmd$/i.test(p)) {
    const exe = path.join(path.dirname(p), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
    if (existsSync(exe)) return { cmd: exe, shell: false };
    return { cmd: p, shell: true };
  }
  return { cmd: p, shell: true };
}
function resolveClaude() {
  const bin = CLAUDE_BIN || 'claude';
  if (process.platform !== 'win32') return { cmd: bin, shell: false };
  if (/\.(exe)$/i.test(bin) && existsSync(bin)) return { cmd: bin, shell: false };
  if (/\.(cmd|bat|ps1)$/i.test(bin) && existsSync(bin)) return preferExe(bin);
  // CLAUDE_BIN points at the extension-less npm shim (...\npm\claude) — use the sibling .cmd/.exe.
  if (existsSync(bin + '.exe')) return { cmd: bin + '.exe', shell: false };
  if (existsSync(bin + '.cmd')) return preferExe(bin + '.cmd');
  // Stale/wrong CLAUDE_BIN with no runnable sibling: ask Windows where claude actually is.
  try {
    const r = spawnSync('where', ['claude'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout) {
      const hits = r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const exe = hits.find(h => /\.exe$/i.test(h));
      const cmd = hits.find(h => /\.cmd$/i.test(h));
      if (exe) return { cmd: exe, shell: false };
      if (cmd) return preferExe(cmd);
    }
  } catch {}
  // `where` failed — the engine may be installed but just not on THIS process's PATH (common when the
  // brain runs detached / from a scheduled task). Probe the usual Windows install locations directly.
  const guesses = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'claude.exe'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'claude.cmd'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'Claude', 'claude.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'claude', 'claude.exe'),
    // ~/.local/bin toolchain (no-admin installs) — claude.exe or the native-installer shim
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.local', 'bin', 'claude.exe'),
    // prefer the package's claude.exe over the npm shims
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
  ].filter(Boolean);
  for (const g of guesses) if (existsSync(g)) return preferExe(g);
  return { cmd: bin, shell: true };   // last resort: let the shell resolve via PATHEXT
}

// When a spawn fails because the engine binary can't be found, say so usefully instead of leaking the
// raw OS error ("The system cannot find the file specified." / "is not recognized").
const ENGINE_HELP = "Helm's engine (Claude Code) isn't installed or isn't on this machine's PATH, so I can't run. Fix it with:  npm install -g @anthropic-ai/claude-code   then `restart`. (A free/local model like Qwen still needs Claude Code as the engine — it runs your model behind a local proxy.) If it IS installed somewhere unusual, set CLAUDE_BIN in .env to its full path.";
function looksLikeMissingEngine(e) {
  const s = typeof e === 'string' ? e : `${e?.code || ''} ${e?.message || e}`;
  return /ENOENT|EINVAL|cannot find the file|is not recognized|no such file/i.test(s);
}
const engineOr = msg => (looksLikeMissingEngine(msg) ? ENGINE_HELP : msg);
// A free ONLINE model (Groq/OpenRouter/Together/Cerebras/...) is configured when these are set.
// We run a tiny local proxy (workspace/proxy/llm-proxy.mjs) that translates Claude Code's
// Anthropic API to the provider's OpenAI-compatible API, and point Claude Code at the proxy.
const PROXY_PORT = parseInt(process.env.PROXY_PORT || '8787', 10);
function proxyConfigured() {
  return AUTH_MODE === 'custom' && !!process.env.OPENAI_BASE_URL && !!process.env.OPENAI_MODEL;
}
// Fast TCP probe so a dead local model endpoint (e.g. Ollama not running) fails with a clear message
// instead of hanging the whole turn on a connection that never answers.
function endpointUp(url, timeout = 2500) {
  return new Promise(res => {
    try {
      const u = new URL(url);
      const port = u.port ? +u.port : (u.protocol === 'https:' ? 443 : 80);
      const sock = net.connect({ host: u.hostname, port });
      const done = ok => { try { sock.destroy(); } catch {} res(ok); };
      sock.once('connect', () => done(true));
      sock.once('error', () => done(false));
      sock.setTimeout(timeout, () => done(false));
    } catch { res(false); }
  });
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

// Discord is OPTIONAL — Helm can run terminal-only (the `helm` CLI talks to the brain over the local
// bridge). Only connect to Discord when it's actually configured; otherwise start without it.
const DISCORD_ON = !!DISCORD_TOKEN && !!OWNER_ID && !/paste-your-discord-bot-token|^your-/.test(DISCORD_TOKEN);
if (!DISCORD_ON) console.error('Discord not configured - running terminal-only. Use `helm` in a terminal; add DISCORD_TOKEN + OWNER_ID to .env and restart to enable Discord.');
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

// ---- single machine ----
// Helm runs on ONE machine. It detects which OS it's on (see OS_NAME below) but there is no fleet,
// no peer, no cross-machine sync — every task runs locally, right here.

// Process inline directives the brain can emit in a reply:
//   [STUCK: <what blocked me>]  -> queued for the nightly self-upgrade
// Returns the reply text with directives stripped.
function handleDirectives(replyText, userText = '') {
  // Strip + record any [STUCK: ...] markers (shared capture logic).
  const { text: stripped, recorded } = processStuckMarkers(replyText, userText);
  // Auto-upgrade safety net: if Helm says/implies it can't do something but didn't emit [STUCK],
  // detect it and queue it anyway so the nightly self-upgrade builds the missing capability.
  if (!recorded) { try { autoCaptureCant(stripped, userText); } catch {} }
  return stripped.trim();
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
  'SCREENSHOTS ALWAYS WORK on macOS AND Windows AND Linux, from this exact `claude -p` process — even though it is a "non-interactive" CLI run. ' +
  'On Windows the capture tool falls back through a scheduled task to reach the user\'s desktop, so SSH/Session-0 is NOT a blocker. ' +
  'NEVER refuse a screenshot with "non-interactive session", "no display", "no GUI access", or "SSH limitation" — instead just run `node workspace/tools/impl/screencap.mjs --out /tmp/sm.png` (Windows: use `%TEMP%\\sm.png`) and end your reply with `ATTACH: <that path>`. If the screen is genuinely locked the tool returns a clear error — only then explain that. ' +
  'When asked to build or create something, actually BUILD it (make the files, write the code, run the commands, finish the task) — a screenshot or a description is NEVER a substitute for doing the work. "Show me" means produce the real artifact first, THEN optionally screenshot it to display the result. ' +
  'AUTO-UPGRADE RULE — whenever you say or imply you CAN\'T do something (can\'t, cannot, unable, ' +
  'don\'t have the ability/tool/access/permission, not supported, not currently possible, beyond what you ' +
  'can do), you MUST add `[STUCK: <the exact capability you lacked>]` anywhere in that same reply (it is ' +
  'stripped before the owner sees it). It is queued for your nightly self-upgrade to BUILD that capability ' +
  'and fix the root cause. Never say "I can\'t" without queuing it. (Also use it for any limitation worth fixing later.) ' +
  'You run on ONE machine — there is no other machine to defer to; do every task right here, locally. ' +
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

function buildPersona(mode = 'copilot') {
  const guidance = MODE_GUIDANCE[mode] ?? MODE_GUIDANCE.copilot;
  return `${PERSONA_BASE}${ownerPersonaOverride()}\n${guidance}`;
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
    child.on('error', e => { clearTimeout(kill); running.delete(child); reject(looksLikeMissingEngine(e) ? new Error(ENGINE_HELP) : e); });
    child.on('close', code => {
      clearTimeout(kill); running.delete(child);
      if (child._stopped) return reject(Object.assign(new Error('stopped by owner'), { stopped: true }));
      if (child._timedOut) return reject(Object.assign(new Error(CAP_MSG), { timedOut: true }));
      if (code === 0) resolve(out);
      else reject(new Error(engineOr(err.trim() || `claude exited ${code}`)));
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
    child.on('error', e => { clearTimeout(kill); running.delete(child); reject(looksLikeMissingEngine(e) ? new Error(ENGINE_HELP) : e); });
    child.on('close', code => {
      clearTimeout(kill); running.delete(child);
      if (child._stopped) return reject(Object.assign(new Error('stopped by owner'), { stopped: true }));
      if (child._timedOut) return reject(Object.assign(new Error(CAP_MSG), { timedOut: true }));
      if (code === 0 || result != null) return resolve({ result: (result != null ? result : lastText) || '', session_id: sid });
      reject(new Error(engineOr(err.trim() || `claude exited ${code}`)));
    });
    child.stdin.on('error', () => {});
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function ask(prompt, onProgress, mode = 'copilot') {
  // Single machine: every task runs locally on this box. (No fleet / peer SSH / cross-machine sync.)
  // Free/local backend preflight: if the model endpoint isn't reachable, say so clearly and fast —
  // otherwise the engine hangs forever trying to reach a dead Ollama/proxy upstream.
  if (proxyConfigured() && !(await endpointUp(process.env.OPENAI_BASE_URL))) {
    return `⚠️ I can't reach your model endpoint (${process.env.OPENAI_BASE_URL}), so I can't think yet. ` +
      `If it's a free local model: install Ollama from https://ollama.com, run \`ollama pull ${process.env.OPENAI_MODEL}\`, ` +
      `then say \`restart\`. Or run \`helm setup\` and pick a different backend (e.g. your Claude login).`;
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
  // Verify the engine actually launches; if not, tell the owner UP FRONT (don't make them discover it
  // by sending a message and getting "The system cannot find the file specified").
  try {
    const probe = spawnSync(cb.cmd, ['--version'], { encoding: 'utf8', shell: cb.shell, timeout: 8000, windowsHide: true });
    if (probe.error && looksLikeMissingEngine(probe.error)) {
      console.error('✋ Engine not launchable: ' + (probe.error.message || probe.error));
      c.users.fetch(OWNER_ID).then(u => u.send('⚠️ ' + ENGINE_HELP)).catch(() => {});
    }
  } catch {}
  // Liveness marker the nightly self-upgrade health-check reads (cross-platform — doesn't depend on
  // launchd redirecting stdout to agent.log, so it works when Helm runs locally on Windows too).
  try { writeFileSync(path.join(WORKSPACE, '.online'), new Date().toISOString()); } catch {}
  // Probe MCP servers only AFTER we're connected — running it before login meant a failed login
  // (bad token) raced spawning/killing probe children, which trips a libuv assertion on Windows.
  runHealthChecks().catch(() => {});
  // Helm network inbox: poll the hub for friend requests + messages and relay them to the owner. A
  // friend's message is UNTRUSTED — Helm shows it but never acts on it without the owner. Only runs when
  // a hub is configured (HELM_HUB_URL), so single-machine installs with no network do nothing.
  if (process.env.HELM_HUB_URL) {
    const dmOwner = txt => c.users.fetch(OWNER_ID).then(u => u.send(txt)).catch(() => {});
    netRegister().catch(() => {});
    setInterval(async () => {
      try {
        const r = await netPoll();
        if (!r.ok) return;
        for (const h of r.requests)  dmOwner(`🤝 **Helm friend request** from **@${h}** — reply \`accept ${h}\` to connect.`);
        for (const h of r.accepted)  dmOwner(`✅ **@${h}** accepted your Helm friend request. Message them: \`tell @${h} <message>\`.`);
        for (const m of r.messages)  dmOwner(`📨 **@${m.from}** (Helm friend) — _untrusted; I won't act on this without you_:\n> ${String(m.text).replace(/\n/g, '\n> ').slice(0, 1500)}\n\nReply with \`tell @${m.from} <message>\`.`);
      } catch {}
    }, 20_000).unref();
  }
  // If we just came back from a Discord `restart`, post "back online" to the channel that asked, then
  // clear the marker so a normal (non-restart) startup never announces itself.
  try {
    const marker = path.join(WORKSPACE, '.restarting');
    if (existsSync(marker)) {
      const chId = readFileSync(marker, 'utf8').trim();
      try { unlinkSync(marker); } catch {}
      if (chId) c.channels.fetch(chId).then(ch => ch?.send('✅ Back online.')).catch(() => {});
    }
  } catch {}
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

  // ---- restart/reboot: relaunch the brain from Discord (loads new code/env — what you'd otherwise do
  // with `helm stop; helm`). A detached relauncher waits for THIS process to exit (freeing the
  // single-instance lock), then starts a fresh brain, which DMs "back online" here once it's ready.
  if (/^\s*\/?(restart|reboot)\s*$/i.test(text)) {
    try { writeFileSync(path.join(WORKSPACE, '.restarting'), String(msg.channel.id)); } catch {}
    await msg.reply('♻️ Restarting — back in ~10s. (If I don\'t check back in, run `helm` in a terminal.)');
    try {
      spawn(process.execPath, [path.join(__dirname, 'scripts', 'relaunch.mjs')],
        { cwd: __dirname, detached: true, stdio: 'ignore', windowsHide: true, env: process.env }).unref();
    } catch (e) { try { unlinkSync(path.join(WORKSPACE, '.restarting')); } catch {} await msg.reply('Restart failed (couldn\'t spawn relauncher): ' + String(e.message || e).slice(0, 200)); return; }
    setTimeout(() => process.exit(0), 1500);   // let Discord flush the reply, then exit so the lock frees
    return;
  }

  // ---- doctor: run the setup self-check (Node, engine, model, config) and report ----
  if (/^\s*\/?doctor\s*$/i.test(text)) {
    const r = spawnSync(process.execPath, [path.join(WORKSPACE, 'doctor.mjs')], { cwd: __dirname, encoding: 'utf8', timeout: 60_000 });
    const out = ((r.stdout || '') + (r.stderr || '')).trim() || 'doctor produced no output';
    await msg.reply('```\n' + out.slice(0, 1900) + '\n```');
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

  const low = text.toLowerCase();

  // ---- project tracker: owner can list / add / cancel / finish / delete projects ----
  if (/^\/?projects?\s*$/i.test(low)) { await msg.reply('**Projects**\n' + renderProjects()); return; }
  let pm;
  if ((pm = text.match(/^\/?(?:new|add)\s+project\s+(.+)/i))) {
    const r = addProject(pm[1].trim());
    await msg.reply((r.already ? `Already tracking **${r.project.name}**.` : `Added **${r.project.name}**.`) + '\n\n' + renderProjects());
    return;
  }
  if ((pm = text.match(/^\/?(cancel|delete|remove|finish|done|complete)\s+project\s+(.+)/i))) {
    const verb = pm[1].toLowerCase(); const name = pm[2].trim();
    const r = /delete|remove/.test(verb) ? deleteProject(name) : /finish|done|complete/.test(verb) ? doneProject(name) : cancelProject(name);
    if (!r.ok) { await msg.reply(`${r.error}.${r.names && r.names.length ? ' Tracked: ' + r.names.join(', ') + '.' : ''}`); return; }
    await msg.reply((r.deleted ? `Deleted **${r.deleted}**.` : `**${r.project.name}** → **${r.project.status}**.`) + '\n\n' + renderProjects());
    return;
  }

  // ---- self-review: scan today's messages for tasks I declined/failed, queue them for self-upgrade ----
  if (/^\/?(self-?review|review (the )?(day|today|messages|chat))\b/i.test(low)) {
    await msg.reply("Reviewing today's messages for anything I declined or failed…");
    try {
      const r = spawnSync(process.execPath, [path.join(WORKSPACE, 'upgrades', 'review-day.mjs')], { cwd: __dirname, encoding: 'utf8', timeout: 30_000 });
      let j = {}; try { j = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch {}
      if (j.queued > 0) await msg.reply(`Queued **${j.queued}** task(s) I couldn't do for tonight's self-upgrade:\n${(j.items || []).map(x => `• ${x}`).join('\n')}`);
      else await msg.reply(`Scanned ${j.scanned || 0} exchange(s) — nothing I declined or failed today. Queue's clean.`);
    } catch (e) { await msg.reply('Review failed: ' + String(e.message || e).slice(0, 200)); }
    return;
  }

  // ---- Helm network: add other Helm agents as friends and message them over a hub ----
  if (/^\/?(myhandle|my handle|whoami)\s*$/i.test(low)) {
    const me = publicIdentity();
    await msg.reply(`I'm **@${me.handle}** (id \`${me.id}\`) on the Helm network. Hub: \`${HUB_URL}\`.\nFriends add me with: \`add friend @${me.handle}\` (once we share a hub).`);
    return;
  }
  let nm;
  if ((nm = text.match(/^\/?(?:set\s*handle|handle)\s+@?(\S+)/i))) {
    const h = netSetHandle(nm[1]); try { await netRegister(); } catch {}
    await msg.reply(`Your Helm's handle is now **@${h}**${process.env.HELM_HUB_URL ? ' (registered on the hub).' : '. Set HELM_HUB_URL in .env to a hub to go online.'}`);
    return;
  }
  if (/^\/?friends\s*$/i.test(low)) {
    const f = listFriends(); const names = Object.entries(f);
    await msg.reply(names.length ? '**Helm friends**\n' + names.map(([h, v]) => `• @${h} — ${v.status}`).join('\n') : 'No Helm friends yet. Add one: `add friend @handle` (you both need the same hub set in HELM_HUB_URL).');
    return;
  }
  if ((nm = text.match(/^\/?(?:add\s+friend|friend\s+add|befriend)\s+@?(\S+)/i))) {
    try { await netRegister(); } catch {}
    const r = await addFriend(nm[1]);
    await msg.reply(r.ok ? `Friend request sent to **@${nm[1].replace(/^@/, '')}**. They accept on their side, then you can message.` : `Couldn't send: ${r.error}`);
    return;
  }
  if ((nm = text.match(/^\/?accept\s+@?(\S+)/i))) {
    const r = await acceptFriend(nm[1]);
    await msg.reply(r.ok ? `Accepted **@${r.handle}** — you're friends now. Message them: \`tell @${r.handle} <message>\`.` : `Couldn't accept: ${r.error}`);
    return;
  }
  if ((nm = text.match(/^\/?(?:tell|dm|msg)\s+@?(\S+)\s+([\s\S]+)/i))) {
    const r = await netSend(nm[1], nm[2].trim());
    await msg.reply(r.ok ? `Sent to **@${nm[1].replace(/^@/, '')}**.` : `Couldn't send: ${r.error}`);
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
    const refs = saved;
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
  console.log(`📩 [${mode}] ${text || '(attachment)'}${msg.attachments.size ? ' +' + msg.attachments.size + 'file' : ''}`);
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
    const reply = await ask(prompt, onProgress, mode);
    clearInterval(typing);
    clearStatus();
    let { text: rawBody, files } = splitAttachments(reply);
    rawBody = handleDirectives(rawBody, text);   // [STUCK: ...] -> queue for the nightly self-upgrade

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
          const execReply = await ask('go ahead with the plan', null, mode);
          const { text: execBody, files: execFiles } = splitAttachments(execReply);
          for (const part of chunks(execBody || '(done)')) await channelRef.send(part);
          for (const f of execFiles) {
            try { await channelRef.send({ files: [f] }); }
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
        try { await msg.reply({ files: [f] }); }
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
        `\n**[${new Date().toISOString().slice(11, 16)}] owner (discord):** ${text || '(attachment)'}\n**helm:** ${body}\n`);
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
    windowsHide: true,   // don't pop a console window on Windows
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
    const raw = await ask(text, s => { try { mirrorStatus(s); } catch {} }, mode);
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
if (!DISCORD_ON) {
  console.error('Discord login skipped (not configured) - terminal-only. Run `helm`, or add a real DISCORD_TOKEN + OWNER_ID and restart.');
} else client.login(DISCORD_TOKEN).catch(async e => {
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
