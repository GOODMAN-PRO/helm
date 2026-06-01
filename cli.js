// Helm — terminal gateway (a third way to talk to Helm, besides Discord and iMessage).
//
//   you type in the terminal  ->  claude -p  (your backend, full tools)  ->  reply
//
// Runs the SAME brain as the Discord/iMessage gateways and shares the SAME session key ('owner'),
// so a conversation continues seamlessly across all three. No bot token needed — this is local.
//
// Usage:
//   node cli.js                 interactive REPL (type messages, Ctrl-C or /exit to quit)
//   node cli.js "do the thing"  one-shot: run a single message and print the reply
//   echo "..." | node cli.js    one-shot from stdin (pipe-friendly)
//
// Slash commands in the REPL: /new (fresh session) · /model [name|auto] · /help · /exit
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { getSession, setSession, deleteSession } from './workspace/sessions.mjs';
import { classifyComplexity, getModelPref, setModelPref } from './workspace/model-routing.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, '.env') });

const {
  CLAUDE_BIN = 'claude',
  PERMISSION_MODE = 'bypassPermissions',
  AUTH_MODE = 'subscription',
} = process.env;
const WORKSPACE = path.resolve(__dirname, process.env.WORKSPACE || './workspace');
mkdirSync(WORKSPACE, { recursive: true });

// First-run onboarding: seed the private owner.md from the template if absent (CLAUDE.md imports it).
try {
  const ownerFile = path.join(WORKSPACE, 'owner.md');
  const tmpl = path.join(WORKSPACE, 'owner.example.md');
  if (!existsSync(ownerFile) && existsSync(tmpl)) copyFileSync(tmpl, ownerFile);
} catch {}

const OS_NAME = process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';

// Resolve a runnable `claude` on this OS (mirrors index.js). On Windows the npm shim is extension-less
// and Node can't spawn it directly — prefer claude.exe, else claude.cmd via a shell.
function resolveClaude() {
  const bin = CLAUDE_BIN || 'claude';
  if (process.platform !== 'win32') return { cmd: bin, shell: false };
  if (/\.(exe)$/i.test(bin) && existsSync(bin)) return { cmd: bin, shell: false };
  if (/\.(cmd|bat|ps1)$/i.test(bin) && existsSync(bin)) return { cmd: bin, shell: true };
  if (existsSync(bin + '.exe')) return { cmd: bin + '.exe', shell: false };
  if (existsSync(bin + '.cmd')) return { cmd: bin + '.cmd', shell: true };
  return { cmd: bin, shell: true };   // let the shell resolve via PATHEXT
}

// Env handed to the engine (mirrors the other gateways' auth handling).
function claudeEnv() {
  const e = { ...process.env };
  if (AUTH_MODE === 'apikey') { delete e.ANTHROPIC_BASE_URL; }
  else if (AUTH_MODE === 'custom') { if (!e.ANTHROPIC_AUTH_TOKEN) e.ANTHROPIC_AUTH_TOKEN = e.ANTHROPIC_API_KEY || 'ollama'; }
  else { delete e.ANTHROPIC_API_KEY; delete e.ANTHROPIC_AUTH_TOKEN; delete e.ANTHROPIC_BASE_URL; }
  return e;
}

function pickModel(prompt) {
  if (AUTH_MODE === 'custom' && process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL;
  return getModelPref() ?? classifyComplexity(prompt);
}

// Inline MCP config from workspace/mcp/servers.json (mirrors the other gateways, incl. Windows npx fix).
function mcpConfigArg() {
  const p = path.join(__dirname, 'workspace/mcp/servers.json');
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    const filtered = {};
    for (const [name, entry] of Object.entries(raw.mcpServers || {})) {
      if (entry.enabled === false) continue;
      const { healthCheck: _h, enabled: _e, comment: _c, ...mcpEntry } = entry;
      if (Array.isArray(mcpEntry.args)) mcpEntry.args = mcpEntry.args.map(a => typeof a === 'string' ? a.split('__HELM_ROOT__').join(__dirname) : a);
      if (process.platform === 'win32' && mcpEntry.command === 'npx') { mcpEntry.args = ['/c', 'npx', ...(mcpEntry.args || [])]; mcpEntry.command = 'cmd'; }
      filtered[name] = mcpEntry;
    }
    return JSON.stringify({ mcpServers: filtered });
  } catch { return '{"mcpServers":{}}'; }
}

const PERSONA =
  'You are Helm, your owner\'s personal AI assistant, talking to them in their terminal. ' +
  'You are POWERED BY Claude Code (your engine) but you are NOT Claude Code and NOT Claude — never ' +
  'identify as Claude or Claude Code; you are Helm, with your own identity. Speak as Helm. ' +
  "You run on their own machine with full tools (shell, files, web) — act, don't just advise. " +
  `This machine is **${OS_NAME}** (${os.platform()}/${os.arch()}) — use the right paths and commands for it. ` +
  'This is a terminal, so plain text is fine and slightly longer answers are OK, but stay concise. ' +
  'Your long-term memory is CLAUDE.md in the working directory (which imports @owner.md, your private ' +
  "profile of who the owner is) — read it. If @owner.md has no real identity yet, you don't know your " +
  'owner: introduce yourself and run the onboarding interview before personalizing — do not invent a ' +
  'name or honorific. Write durable facts to @owner.md, not CLAUDE.md. Confirm before anything ' +
  'destructive, irreversible, or that spends money. When asked to build or create something, actually ' +
  'BUILD it (make the files, write the code, run the commands, finish the task). ' +
  'Respect any off-limits paths/projects the owner names in @owner.md.';

// ---- the brain: one Claude run, same flow as the other gateways ----
function runClaude(args, prompt) {
  return new Promise((resolve, reject) => {
    const { cmd, shell } = resolveClaude();
    const child = spawn(cmd, args, { cwd: WORKSPACE, env: claudeEnv(), shell });
    let out = '', err = '';
    const kill = setTimeout(() => { child._timedOut = true; try { child.kill(); } catch {} }, 30 * 60_000);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(kill); reject(e); });
    child.on('close', code => {
      clearTimeout(kill);
      if (child._timedOut) return reject(Object.assign(new Error('hit 30-min cap'), { timedOut: true }));
      if (code === 0) resolve(out);
      else reject(new Error(err.trim() || `claude exited ${code}`));
    });
    child.stdin.on('error', () => {});   // EPIPE if claude exits before reading stdin
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function ask(prompt, { onHeartbeat } = {}) {
  const model = pickModel(prompt);
  const base = [
    '-p', '--output-format', 'json',
    '--model', model,
    '--permission-mode', PERMISSION_MODE,
    '--append-system-prompt', PERSONA,
    '--add-dir', WORKSPACE,
    '--add-dir', os.homedir(),
    '--strict-mcp-config', '--mcp-config', mcpConfigArg(),
  ];
  const sid = getSession('owner');
  const args = sid ? [...base, '--resume', sid] : base;

  let hb;
  if (onHeartbeat) { let n = 0; hb = setInterval(() => { if (++n <= 10) onHeartbeat(n); }, 15_000); }
  let out;
  try {
    out = await runClaude(args, prompt);
  } catch (e) {
    if (e.timedOut || !sid) { if (hb) clearInterval(hb); throw e; }
    deleteSession('owner');                 // stale session -> retry fresh once
    out = await runClaude(base, prompt);
  } finally { if (hb) clearInterval(hb); }

  try {
    const j = JSON.parse(out);
    if (j.session_id) setSession('owner', j.session_id, 'cli');
    return (j.result ?? '').toString().trim() || '(empty reply)';
  } catch { return out.trim() || '(no output)'; }
}

// ---- colours (skipped when not a TTY or NO_COLOR is set) ----
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const C = useColor
  ? { dim: '\x1b[2m', cyan: '\x1b[36m', teal: '\x1b[38;5;49m', grn: '\x1b[32m', red: '\x1b[31m', b: '\x1b[1m', x: '\x1b[0m' }
  : { dim: '', cyan: '', teal: '', grn: '', red: '', b: '', x: '' };

// ---- one-shot mode: `node cli.js "msg"` or piped stdin ----
async function oneShot(prompt) {
  try { process.stdout.write(await ask(prompt) + '\n'); process.exit(0); }
  catch (e) { console.error(`helm: ${e.message || e}`); process.exit(1); }
}

// ---- interactive REPL ----
function repl() {
  const backend = AUTH_MODE === 'custom' ? (process.env.ANTHROPIC_MODEL || 'local/custom')
    : AUTH_MODE === 'apikey' ? 'Anthropic API key' : 'Claude subscription';
  console.log(`${C.teal}${C.b}Helm${C.x} ${C.dim}— terminal${C.x}  ${C.dim}(${OS_NAME} · ${backend} · session shared with Discord/iMessage)${C.x}`);
  console.log(`${C.dim}Type a message. Commands: /new  /model [name|auto]  /help  /exit${C.x}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: `${C.cyan}you ›${C.x} ` });
  let busy = false;
  rl.prompt();

  rl.on('line', async line => {
    const text = line.trim();
    if (!text) { rl.prompt(); return; }

    // slash commands
    if (text === '/exit' || text === '/quit') { rl.close(); return; }
    if (text === '/help') {
      console.log(`${C.dim}/new            start a fresh conversation (drops the shared session)\n/model <name>   pin a model (e.g. opus, sonnet, haiku); /model auto to unpin\n/model          show the current model preference\n/help           this help\n/exit           quit${C.x}`);
      rl.prompt(); return;
    }
    if (text === '/new') { deleteSession('owner'); console.log(`${C.dim}started a fresh conversation.${C.x}`); rl.prompt(); return; }
    if (text === '/model' || text.startsWith('/model ')) {
      const arg = text.slice(6).trim();
      try {
        if (!arg) console.log(`${C.dim}model: ${getModelPref() || 'auto (haiku/sonnet/opus by task)'}${C.x}`);
        else { const r = setModelPref(arg); console.log(`${C.dim}model: ${r === 'auto' ? 'auto-routing restored' : 'pinned to ' + r}${C.x}`); }
      } catch (e) { console.log(`${C.red}model error: ${e.message}${C.x}`); }
      rl.prompt(); return;
    }
    if (text.startsWith('/')) { console.log(`${C.dim}unknown command. /help for options.${C.x}`); rl.prompt(); return; }

    if (busy) { console.log(`${C.dim}(still working on the last one…)${C.x}`); return; }
    busy = true;
    let dots;
    if (process.stdout.isTTY) { let n = 0; process.stdout.write(`${C.dim}helm is thinking${C.x}`); dots = setInterval(() => process.stdout.write(`${C.dim}.${C.x}`), 600); }
    try {
      const reply = await ask(text);
      if (dots) { clearInterval(dots); process.stdout.write('\r\x1b[2K'); }   // clear the "thinking..." line
      console.log(`${C.teal}helm ›${C.x} ${reply}\n`);
    } catch (e) {
      if (dots) { clearInterval(dots); process.stdout.write('\r\x1b[2K'); }
      console.log(`${C.red}helm › error: ${e.timedOut ? 'hit the 30-min cap' : (e.message || e)}${C.x}\n`);
    } finally { busy = false; rl.prompt(); }
  });

  rl.on('close', () => { console.log(`\n${C.dim}bye.${C.x}`); process.exit(0); });
}

// ---- entry: arg or piped stdin = one-shot; otherwise interactive ----
const argMsg = process.argv.slice(2).join(' ').trim();
if (argMsg) {
  oneShot(argMsg);
} else if (!process.stdin.isTTY) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { buf += d; });
  process.stdin.on('end', () => { const m = buf.trim(); m ? oneShot(m) : process.exit(0); });
} else {
  repl();
}
