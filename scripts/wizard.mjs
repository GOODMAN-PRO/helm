#!/usr/bin/env node
// Helm setup wizard — the "cool screen" the installer hands off to.
// Arrow-key menus to choose gateways + options, then writes .env and (optionally) the service.
// Reads /dev/tty directly so it works even when launched from `curl ... | bash` (piped stdin).
import tty from 'node:tty';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync, spawn } from 'node:child_process';
import { assertNode } from '../workspace/preflight/node-guard.mjs';

// Refuse to configure on a Node too old to run Helm (clear message instead of a later node:sqlite crash).
assertNode();

// Open a URL in the user's default browser (best-effort; never blocks or breaks setup).
function openUrl(url) {
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', windowsHide: true, detached: true }).unref();
    else if (process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    else spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  } catch {}
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

// ---- terminal I/O (input from the real tty even under curl|bash) ----
let input, ownTty = false;
try { input = new tty.ReadStream(fs.openSync('/dev/tty', 'r')); ownTty = true; }
catch { input = process.stdin; }
const out = process.stdout;
const isTTY = !!input.isTTY;

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', b: '\x1b[1m',
  cyan: '\x1b[38;5;44m', teal: '\x1b[38;5;49m', sky: '\x1b[38;5;39m',
  gray: '\x1b[38;5;245m', grn: '\x1b[38;5;42m', red: '\x1b[38;5;203m', yel: '\x1b[38;5;221m',
};
const clear = () => out.write('\x1b[2J\x1b[3J\x1b[H');
const showCur = () => out.write('\x1b[?25h');
const hideCur = () => out.write('\x1b[?25l');
const raw = on => { if (isTTY) input.setRawMode(on); };
function cleanup() { try { raw(false); showCur(); if (ownTty) input.pause(); } catch {} }
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

const BANNER = [
  '',
  `  ${C.cyan}${C.b} ██╗  ██╗███████╗██╗     ███╗   ███╗${C.reset}`,
  `  ${C.cyan}${C.b} ██║  ██║██╔════╝██║     ████╗ ████║${C.reset}`,
  `  ${C.cyan}${C.b} ███████║█████╗  ██║     ██╔████╔██║${C.reset}`,
  `  ${C.sky}${C.b} ██╔══██║██╔══╝  ██║     ██║╚██╔╝██║${C.reset}`,
  `  ${C.sky}${C.b} ██║  ██║███████╗███████╗██║ ╚═╝ ██║${C.reset}`,
  `  ${C.sky}${C.b} ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝     ╚═╝${C.reset}`,
  `       ${C.gray}personal AI agent · setup${C.reset}`,
  `  ${C.dim}────────────────────────────────────────${C.reset}`,
  `  ${C.gray}Discord bot:${C.reset} ${C.cyan}https://discord.com/developers/applications${C.reset}`,
  `  ${C.gray}API keys:   ${C.reset} ${C.cyan}https://console.anthropic.com/settings/keys${C.reset}   ${C.gray}Local models:${C.reset} ${C.cyan}https://ollama.com${C.reset}`,
  '',
].join('\n');

function header() { clear(); out.write(BANNER); }

function parseKey(buf) {
  const s = buf.toString('utf8');
  if (s === '\x03') return { ctrlc: true };
  if (s === '\r' || s === '\n') return { enter: true };
  if (s === ' ') return { space: true };
  if (s === '\x1b[A' || s === 'k') return { up: true };
  if (s === '\x1b[B' || s === 'j') return { down: true };
  return { str: s };
}

function select(title, items, idx = 0) {
  return new Promise(resolve => {
    raw(true); hideCur();
    const render = () => {
      header();
      out.write(`  ${C.b}${title}${C.reset}\n  ${C.dim}up/down move · enter select${C.reset}\n\n`);
      items.forEach((it, i) => {
        const sel = i === idx;
        const ptr = sel ? `${C.cyan}>${C.reset} ` : '  ';
        const lab = sel ? `${C.cyan}${C.b}${it.label}${C.reset}` : it.label;
        out.write(`  ${ptr}${lab}`);
        if (it.hint) out.write(`  ${C.dim}${it.hint}${C.reset}`);
        out.write('\n');
      });
    };
    const onData = buf => {
      const k = parseKey(buf);
      if (k.ctrlc) { cleanup(); process.exit(130); }
      if (k.up) { idx = (idx - 1 + items.length) % items.length; render(); }
      else if (k.down) { idx = (idx + 1) % items.length; render(); }
      else if (k.enter) { input.off('data', onData); resolve(idx); }
    };
    render(); input.resume(); input.on('data', onData);
  });
}

function multiselect(title, items) {
  let idx = 0;
  // start cursor on first enabled item
  while (idx < items.length && items[idx].disabled) idx++;
  return new Promise(resolve => {
    raw(true); hideCur();
    const render = () => {
      header();
      out.write(`  ${C.b}${title}${C.reset}\n  ${C.dim}up/down move · space toggle · enter confirm${C.reset}\n\n`);
      items.forEach((it, i) => {
        const sel = i === idx;
        const box = it.checked ? `${C.grn}[x]${C.reset}` : (it.disabled ? `${C.dim}[ ]${C.reset}` : `${C.gray}[ ]${C.reset}`);
        const ptr = sel ? `${C.cyan}>${C.reset} ` : '  ';
        const lab = it.disabled ? `${C.dim}${it.label}${C.reset}` : (sel ? `${C.cyan}${C.b}${it.label}${C.reset}` : it.label);
        out.write(`  ${ptr}${box} ${lab}`);
        if (it.hint) out.write(`  ${C.dim}${it.hint}${C.reset}`);
        out.write('\n');
      });
    };
    const onData = buf => {
      const k = parseKey(buf);
      if (k.ctrlc) { cleanup(); process.exit(130); }
      if (k.up) { do { idx = (idx - 1 + items.length) % items.length; } while (items[idx].disabled); render(); }
      else if (k.down) { do { idx = (idx + 1) % items.length; } while (items[idx].disabled); render(); }
      else if (k.space) { if (!items[idx].disabled) { items[idx].checked = !items[idx].checked; render(); } }
      else if (k.enter) { input.off('data', onData); resolve(items.map((it, i) => (it.checked && !it.disabled) ? i : -1).filter(i => i >= 0)); }
    };
    render(); input.resume(); input.on('data', onData);
  });
}

function text(label, { def = '', mask = false, hint = '' } = {}) {
  let val = '';
  return new Promise(resolve => {
    raw(true); showCur();
    const render = () => {
      header();
      out.write(`  ${C.b}${label}${C.reset}\n`);
      if (hint) out.write(`  ${C.dim}${hint}${C.reset}\n`);
      if (def) out.write(`  ${C.dim}(enter for default: ${def})${C.reset}\n`);
      out.write('\n');
      const shown = mask ? '*'.repeat(val.length) : val;
      out.write(`  ${C.cyan}>${C.reset} ${shown}`);
    };
    const onData = buf => {
      const s = buf.toString('utf8');
      for (const ch of s) {
        if (ch === '\x03') { cleanup(); process.exit(130); }
        if (ch === '\r' || ch === '\n') { input.off('data', onData); out.write('\n'); return resolve((val || def).trim()); }
        if (ch === '\x7f' || ch === '\b') { val = val.slice(0, -1); continue; }
        if (ch === '\x1b') continue;
        if (ch >= ' ') val += ch;
      }
      render();
    };
    render(); input.resume(); input.on('data', onData);
  });
}

const confirm = async (label, def = true) => (await select(label, [{ label: 'Yes' }, { label: 'No' }], def ? 0 : 1)) === 0;

const IS_WIN = process.platform === 'win32';
function which(bin) {
  try {
    const hits = execSync(`${IS_WIN ? 'where' : 'command -v'} ${bin}`, { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
    // On Windows `where` lists the extension-less npm shim first — Node can't spawn that
    // (causes `spawn ...\npm\claude ENOENT`). Prefer a runnable .exe/.cmd/.bat.
    if (IS_WIN) return hits.find(p => /\.(exe|cmd|bat)$/i.test(p)) || hits[0] || bin;
    return hits[0] || bin;
  } catch { return bin; }
}
const sleep = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} };

// Curated local models the wizard can auto-download via Ollama (free, private, no account).
// Only models strong enough to follow Claude Code's agent prompt are listed — small ones (3B-8B)
// just summarize the prompt instead of acting. These are BIG: a strong GPU (24GB+ VRAM) or a
// high-memory Mac, and slower than the online options. On modest hardware pick Groq below instead.
const LOCAL_MODELS = [
  { label: 'Qwen2.5-Coder 32B — strong, coding-tuned (~20 GB VRAM)', id: 'qwen2.5-coder:32b' },
  { label: 'Llama 3.3 70B — most capable, general (~40 GB+ VRAM/RAM)', id: 'llama3.3:70b' },
  { label: 'Qwen2.5 72B — most capable (~40 GB+ VRAM/RAM)', id: 'qwen2.5:72b' },
];
// Free ONLINE providers (OpenAI-compatible). Helm routes through its local translation proxy
// (workspace/proxy/llm-proxy.mjs) so Claude Code can use them. Each has a free tier — paste a key.
const FREE_ONLINE = [
  { label: 'Groq — Llama 3.3 70B (fast, 128k ctx)', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys' },
  { label: 'OpenRouter — free models', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys' },
  { label: 'Cerebras — Llama 3.3 70B (very fast)', baseUrl: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b', keyUrl: 'https://cloud.cerebras.ai' },
  { label: 'Together AI — free tier', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', keyUrl: 'https://api.together.xyz/settings/api-keys' },
];
// Detect machine specs to recommend a local model size.
function detectSpecs() {
  const ramGB = Math.max(1, Math.round(os.totalmem() / 1073741824));
  const cpus = (os.cpus() || []).length;
  const apple = process.platform === 'darwin' && os.arch() === 'arm64';
  let vramGB = 0, gpu = '';
  try {
    const r = spawnSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 4000 });
    if (r.status === 0 && r.stdout && r.stdout.trim()) {
      const [name, mb] = r.stdout.trim().split('\n')[0].split(',').map(s => s.trim());
      gpu = name; const m = parseInt(mb, 10); if (m > 0) vramGB = Math.round(m / 1024);
    }
  } catch {}
  return { ramGB, cpus, apple, vramGB, gpu };
}
// Memory budget for local inference: Apple Silicon shares RAM; else max(VRAM, half of RAM).
function recommendIdx(s) {
  // The capable local models are all 32B+ (need a strong GPU / lots of RAM), so don't auto-recommend
  // one — the safe default stays the online provider (Groq). -1 = nothing tagged "recommended".
  return -1;
}
function specLine(s) {
  const parts = [`${s.ramGB} GB RAM`];
  if (s.cpus) parts.push(`${s.cpus} cores`);
  if (s.apple) parts.push('Apple Silicon');
  if (s.vramGB) parts.push(`${s.gpu || 'GPU'} ${s.vramGB} GB`);
  return parts.join(' · ');
}
function ollamaBin() {
  const r = spawnSync(IS_WIN ? 'where' : 'which', ['ollama'], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  const cands = IS_WIN ? [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')]
    : process.platform === 'darwin' ? ['/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', '/Applications/Ollama.app/Contents/Resources/ollama']
    : ['/usr/local/bin/ollama', '/usr/bin/ollama'];
  for (const c of cands) { if (c && fs.existsSync(c)) return c; }
  return null;
}
// macOS without Homebrew: install Ollama from the official app download (no admin, no brew).
function macInstallOllama() {
  try {
    const zip = path.join(os.tmpdir(), 'Ollama-darwin.zip');
    console.log('Downloading Ollama for macOS (official — no Homebrew needed, ~?GB)...');
    if (spawnSync('curl', ['-fsSL', '-o', zip, 'https://ollama.com/download/Ollama-darwin.zip'], { stdio: 'inherit', timeout: 600_000 }).status !== 0) return false;
    // ditto extracts the .zip and preserves the .app bundle; unzip is the fallback.
    if (spawnSync('ditto', ['-xk', zip, '/Applications'], { stdio: 'inherit' }).status !== 0)
      spawnSync('unzip', ['-oq', zip, '-d', '/Applications'], { stdio: 'inherit' });
    try { fs.unlinkSync(zip); } catch {}
    return fs.existsSync('/Applications/Ollama.app/Contents/Resources/ollama');
  } catch { return false; }
}
// Install Ollama if needed, make sure it's serving, and pull the chosen model — "does the rest".
// Returns true only if the model is pulled and the server answers, so the caller can warn (and not
// leave a silently-broken local backend) when it isn't ready.
function ensureOllama(model) {
  if (process.env.HELM_SKIP_MODEL_DOWNLOAD) { console.log(`(skipping model download — run later:  ollama pull ${model})`); return false; }
  let bin = ollamaBin();
  if (!bin) {
    console.log('\nInstalling Ollama (free local model runtime)...');
    if (IS_WIN) spawnSync('winget', ['install', '-e', '--id', 'Ollama.Ollama', '--accept-source-agreements', '--accept-package-agreements'], { stdio: 'inherit' });
    else if (process.platform === 'darwin') {
      if (spawnSync('which', ['brew']).status === 0) spawnSync('brew', ['install', 'ollama'], { stdio: 'inherit' });
      if (!ollamaBin()) macInstallOllama();   // no Homebrew (or brew failed) → official app download
    }
    else spawnSync('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'], { stdio: 'inherit' });
    bin = ollamaBin();
  }
  if (!bin) { console.log(`⚠  Could not auto-install Ollama. Install it from https://ollama.com, run:  ollama pull ${model}  then restart Helm.`); return false; }
  // ensure the local server is up
  if (spawnSync(bin, ['list'], { encoding: 'utf8', timeout: 8000 }).status !== 0) {
    try { const s = spawn(bin, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true }); s.unref(); } catch {}
    for (let i = 0; i < 15; i++) { sleep(1000); if (spawnSync(bin, ['list'], { encoding: 'utf8', timeout: 8000 }).status === 0) break; }
  }
  console.log(`\nDownloading the model "${model}" (a few GB, one-time)...`);
  const r = spawnSync(bin, ['pull', model], { stdio: 'inherit' });
  if (r.status === 0) { console.log(`Model "${model}" is ready — Helm runs on it for free.`); return true; }
  console.log(`⚠  Couldn't pull "${model}". Open the Ollama app (or run 'ollama serve'), then: ollama pull ${model}`);
  return false;
}
// the fancy full-screen UI needs a raw-mode TTY; otherwise we use a plain Q&A that works anywhere.
// Set HELM_PLAIN=1 to force the plain flow (handy if a terminal mangles the full-screen UI).
const rawOk = !process.env.HELM_PLAIN && isTTY && typeof input.setRawMode === 'function';

// ---- shared: write .env + optional service + final report (used by both flows) ----
// Keys the wizard owns; everything else in an existing .env (custom vars) is PRESERVED so re-running
// setup never resets them. (Helm is single-machine — the old fleet keys are listed so a re-run STRIPS
// any leftover HELM_FLEET/HELM_WIN_* from a previous multi-device config.)
const MANAGED = new Set(['DISCORD_TOKEN', 'OWNER_ID', 'GATEWAYS', 'AUTH_MODE', 'MODEL', 'PERMISSION_MODE',
  'CLAUDE_BIN', 'WORKSPACE', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL', 'ANTHROPIC_AUTH_TOKEN',
  'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'PROXY_PORT',
  'HELM_FLEET', 'HELM_WIN_HOST', 'HELM_WIN_CLAUDE', 'HELM_WIN_DIR', 'HELM_PEER_ONLY']);
function readEnvMap(p) {
  const m = {};
  try { for (const line of fs.readFileSync(p, 'utf8').split('\n')) { const s = line.trim(); if (!s || s.startsWith('#')) continue; const i = s.indexOf('='); if (i < 0) continue; m[s.slice(0, i).trim()] = s.slice(i + 1); } } catch {}
  return m;
}
function buildEnv(cfg) {
  const preserved = Object.entries(readEnvMap(path.join(ROOT, '.env'))).filter(([k]) => !MANAGED.has(k));
  const lines = [
    `# Helm config — generated by the setup wizard ${new Date().toISOString()}`,
    `DISCORD_TOKEN=${cfg.token || 'paste-your-discord-bot-token-here'}`,
    `OWNER_ID=${cfg.ownerId || 'your-discord-user-id'}`,
    `GATEWAYS=${cfg.gateways.join(',')}`,
    `AUTH_MODE=${cfg.authMode}`,
    ...(cfg.authMode === 'apikey' ? [`ANTHROPIC_API_KEY=${cfg.apiKey}`] : []),
    // FREE model — ONLINE provider: route Claude Code through the local proxy (index.js auto-starts it
    // and points Claude Code's ANTHROPIC_BASE_URL at it). The proxy translates Anthropic -> the
    // provider's OpenAI-compatible /v1/chat/completions.
    ...(cfg.authMode === 'custom' && cfg.online
      ? [`OPENAI_BASE_URL=${cfg.openaiBase}`, `OPENAI_MODEL=${cfg.openaiModel}`, `OPENAI_API_KEY=${cfg.openaiKey || ''}`, 'PROXY_PORT=8787']
      : []),
    // FREE model — LOCAL Ollama: ALSO go through the proxy. Ollama serves /api/* and /v1/chat/completions
    // but has NO /v1/messages, so pointing Claude Code straight at it (ANTHROPIC_BASE_URL) 404s every
    // message. The proxy bridges Anthropic -> OpenAI -> Ollama's /v1/chat/completions.
    ...(cfg.authMode === 'custom' && !cfg.online
      ? [`OPENAI_BASE_URL=${String(cfg.baseUrl || 'http://localhost:11434').replace(/\/+$/, '').replace(/\/v1$/, '')}/v1`, `OPENAI_MODEL=${cfg.modelId}`, 'OPENAI_API_KEY=ollama', 'PROXY_PORT=8787']
      : []),
    `MODEL=${cfg.model}`,
    `PERMISSION_MODE=${cfg.perm}`,
    `CLAUDE_BIN=${cfg.claudeBin}`,
    `WORKSPACE=./workspace`,
    // Helm runs on ONE machine (it detects this OS automatically). No fleet / peer / cross-machine sync.
  ];
  if (preserved.length) { lines.push('', '# preserved from your previous config (custom vars)'); for (const [k, v] of preserved) lines.push(`${k}=${v}`); }
  lines.push('');
  return lines.join('\n');
}
function applyConfig(cfg) {
  fs.writeFileSync(path.join(ROOT, '.env'), buildEnv(cfg), { mode: 0o600 });
  cleanup();
  console.log(`\nok  wrote ${path.join(ROOT, '.env')}`);
  const localReady = cfg.ollamaModel ? ensureOllama(cfg.ollamaModel) : true;
  if (cfg.svc) {
    const r = (IS_MAC || IS_LINUX)
      ? spawnSync('bash', [path.join(ROOT, 'scripts', 'install-service.sh')], { stdio: 'inherit' })
      : spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', 'install-service.ps1')], { stdio: 'inherit' });
    if (r.status !== 0) console.log('!!  service install reported an issue — start manually with: npm start');
  }
  console.log('\nHelm is set up.');
  console.log('Verify it:  helm doctor      (checks Node, engine, model + key, config — fix hints included)');
  console.log(cfg.svc ? `It's running in the background. Logs: ${ROOT}/agent.log` : `Start it:   helm            (or: node "${ROOT}${path.sep}index.js")`);
  if (cfg.authMode === 'subscription') console.log("Backend: Claude subscription — make sure you've run 'claude' once and logged in.");
  else if (cfg.authMode === 'apikey') console.log('Backend: Anthropic API key (billed pay-as-you-go).');
  else if (cfg.online) console.log(`Backend: free online model ${cfg.openaiModel} (${cfg.openaiBase}) — Helm auto-starts a local proxy to translate to it.${cfg.openaiKey ? '' : '\n!!  No API key entered — add OPENAI_API_KEY to .env before starting.'}`);
  else console.log(`Backend: free / local model (${cfg.modelId}) via Ollama.`);
  if (cfg.ollamaModel && !localReady) {
    console.log('\n' + '─'.repeat(60));
    console.log('⚠  HEADS UP: the free local model is NOT ready, so Helm can\'t think yet.');
    console.log('   Ollama didn\'t install or the model didn\'t download. To finish:');
    console.log('     1) install Ollama from https://ollama.com');
    console.log(`     2) run:  ollama pull ${cfg.ollamaModel}`);
    console.log('     3) restart Helm  (helm)');
    console.log('   Or run `helm setup` again and pick a different backend (e.g. your Claude login).');
    console.log('─'.repeat(60));
  }
  if (cfg.token) {
    console.log(`Then DM your bot on Discord.${cfg.gateways.includes('imessage') ? '  (iMessage: grant node Full Disk Access in System Settings.)' : ''}`);
    console.log('Reminder: one Discord token = one running instance.');
  } else {
    console.log('Discord skipped — Helm runs terminal-only. Use `helm` in a terminal.');
    console.log('Add DISCORD_TOKEN to .env (or re-run setup) and restart to turn Discord on.');
  }
  process.exit(0);
}

// plain question-by-question fallback (no raw-mode UI) — robust on every shell, including Windows
async function runPlain() {
  const rl = (await import('node:readline/promises')).createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, d = '') => { const a = (await rl.question(d ? `${q} [${d}]: ` : `${q}: `)).trim(); return a || d; };
  console.log('\n== Helm setup ==');
  console.log('  Discord bot: https://discord.com/developers/applications');
  console.log('  API keys:    https://console.anthropic.com/settings/keys   Local models: https://ollama.com\n');
  const gw = (await ask('Gateways — discord, imessage, or both', 'discord')).toLowerCase();
  const gateways = gw.includes('both') ? ['discord', 'imessage'] : gw.includes('imessage') ? (gw.includes('discord') ? ['discord', 'imessage'] : ['imessage']) : ['discord'];
  let token = '';
  if (gateways.includes('discord')) {
    console.log('  Opening the Discord Developer Portal in your browser — create your bot, then Bot -> Reset Token.');
    console.log('  (Or press Enter to skip Discord for now — Helm runs terminal-only; add the token later.)');
    openUrl('https://discord.com/developers/applications');
    token = await ask('Discord bot token (Enter to skip)');
  }
  const ownerId = await ask('Your Discord user ID (enable Developer Mode, right-click your name -> Copy User ID)');
  const b = await ask('Power Helm with — 1) Claude subscription  2) Anthropic API key  3) Any other model (local/hosted)', '1');
  const authMode = b === '2' ? 'apikey' : b === '3' ? 'custom' : 'subscription';
  let apiKey = '', baseUrl = '', modelId = '', ollamaModel = '';
  let online = false, openaiBase = '', openaiModel = '', openaiKey = '';
  if (authMode === 'apikey') { openUrl('https://console.anthropic.com/settings/keys'); apiKey = await ask('Anthropic API key (https://console.anthropic.com/settings/keys)'); }
  else if (authMode === 'custom') {
    const specs = detectSpecs(); const rec = recommendIdx(specs);
    console.log(`  Your machine: ${specLine(specs)}`);
    console.log('  Pick a model:');
    FREE_ONLINE.forEach((p, i) => console.log(`    ${i + 1}) ${p.label}  [free online — needs a free key]`));
    LOCAL_MODELS.forEach((m, i) => console.log(`    ${FREE_ONLINE.length + i + 1}) ${m.label}${i === rec ? '  (recommended)' : ''}  [free local]`));
    console.log(`    ${FREE_ONLINE.length + LOCAL_MODELS.length + 1}) Custom endpoint (your own Anthropic-compatible URL / router)`);
    const def = 1;   // default to the first free online provider (Groq)
    const pick = parseInt(await ask('Choice', String(def)), 10) || def;
    if (pick >= 1 && pick <= FREE_ONLINE.length) {
      const p = FREE_ONLINE[pick - 1];
      online = true; openaiBase = p.baseUrl; openaiModel = p.model;
      console.log(`  Get a free API key: ${p.keyUrl}`);
      openUrl(p.keyUrl);
      openaiKey = await ask(`${p.label.split(' —')[0]} API key`);
      const custom = await ask('Model id (Enter for default)', p.model);
      if (custom) openaiModel = custom;
    } else if (pick <= FREE_ONLINE.length + LOCAL_MODELS.length) {
      ollamaModel = LOCAL_MODELS[pick - FREE_ONLINE.length - 1].id; modelId = ollamaModel; baseUrl = 'http://localhost:11434';
    } else {
      baseUrl = await ask('Model endpoint URL', 'http://localhost:11434');
      modelId = await ask('Model name', 'llama3.1');
      apiKey = await ask('API key for that endpoint (blank if none)', '');
    }
  }
  let model = 'sonnet';
  if (authMode !== 'custom') model = (await ask('Claude model — 1) opus  2) sonnet', '1')) === '2' ? 'sonnet' : 'opus';
  // Safer "ask first" mode is the default; full autonomy is an explicit opt-in.
  const perm = (await ask('Tool permissions — 1) default: ask before each action (safer)  2) bypassPermissions: full autonomy', '1')) === '2' ? 'bypassPermissions' : 'default';
  const svc = (await ask('Run 24/7 in the background? (y/n)', 'y')).toLowerCase().startsWith('y');
  rl.close();
  applyConfig({ gateways, token, ownerId, authMode, apiKey, baseUrl, modelId, model, perm, svc, claudeBin: which('claude'), ollamaModel, online, openaiBase, openaiModel, openaiKey });
}

async function main() {
  if (!rawOk) { await runPlain(); return; }

  // 1) gateways
  const gwItems = [
    { label: 'Discord', hint: 'DM a bot — works on every OS', checked: true },
    { label: 'iMessage', hint: IS_MAC ? 'macOS — reads Messages, needs Full Disk Access' : 'macOS only (this machine is not a Mac)', checked: false, disabled: !IS_MAC },
  ];
  let picks = await multiselect('Choose your gateways', gwItems);
  if (picks.length === 0) picks = [0]; // default to Discord if nothing chosen
  const gateways = [];
  if (picks.includes(0)) gateways.push('discord');
  if (picks.includes(1)) gateways.push('imessage');

  // 2) credentials
  let token = '';
  const owner = '';
  let ownerId = '';
  if (gateways.includes('discord')) {
    openUrl('https://discord.com/developers/applications');
    token = await text('Discord bot token (Enter to skip)', { mask: true, hint: 'opened in your browser — Bot -> Reset Token. Or press Enter to skip Discord; Helm runs terminal-only.' });
  }
  ownerId = await text('Your Discord user ID (owner lock)', { hint: 'Discord -> Settings -> Advanced -> Developer Mode on, then right-click your name -> Copy User ID' });

  // 2.5) backend — how Helm is powered
  const backendItems = [
    { label: 'Claude subscription (Pro / Max)', hint: 'log in with claude — no per-message cost' },
    { label: 'Anthropic API key', hint: 'pay-as-you-go — no subscription needed' },
    { label: 'Any other model — local or hosted', hint: 'free or paid: Ollama, OpenAI, Gemini, Groq, OpenRouter, DeepSeek… point Helm at any model' },
  ];
  const backendIdx = await select('How do you want to power Helm?', backendItems);
  const authMode = backendIdx === 1 ? 'apikey' : backendIdx === 2 ? 'custom' : 'subscription';
  let apiKey = '', baseUrl = '', modelId = '', ollamaModel = '';
  let online = false, openaiBase = '', openaiModel = '', openaiKey = '';
  if (authMode === 'apikey') {
    openUrl('https://console.anthropic.com/settings/keys');
    apiKey = await text('Anthropic API key', { mask: true, hint: 'opened in your browser (starts with sk-ant-)' });
  } else if (authMode === 'custom') {
    // Pick a free ONLINE provider (runs via Helm's proxy), a free LOCAL model (auto-downloaded),
    // or a fully custom endpoint.
    const specs = detectSpecs();
    const rec = recommendIdx(specs);
    const choices = [
      ...FREE_ONLINE.map(p => ({ label: p.label, hint: 'free online · needs a free API key · fast' })),
      ...LOCAL_MODELS.map((m, i) => ({ label: m.label + (i === rec ? '   ← recommended for your machine' : ''), hint: 'free · local · private · auto-downloads' })),
      { label: 'Custom endpoint (your own Anthropic-compatible URL / router)', hint: 'advanced — LiteLLM / claude-code-router / self-hosted' },
    ];
    const localRecIdx = 0;   // default-highlight the first free online provider (Groq)
    const mi = await select(`Pick a model   (detected: ${specLine(specs)})`, choices, localRecIdx);
    if (mi < FREE_ONLINE.length) {
      const p = FREE_ONLINE[mi];
      online = true; openaiBase = p.baseUrl; openaiModel = p.model;
      console.log(`\n  Get a free API key: ${p.keyUrl}`);
      openUrl(p.keyUrl);
      openaiKey = await text(`${p.label.split(' —')[0]} API key`, { mask: true, hint: `free tier — create one at ${p.keyUrl}` });
      const custom = await text('Model id (Enter to use the default)', { def: p.model, hint: 'override only if you want a different model on this provider' });
      if (custom) openaiModel = custom;
    } else if (mi < FREE_ONLINE.length + LOCAL_MODELS.length) {
      ollamaModel = LOCAL_MODELS[mi - FREE_ONLINE.length].id; modelId = ollamaModel; baseUrl = 'http://localhost:11434';
    } else {
      baseUrl = await text('Model endpoint URL', { def: 'http://localhost:11434', hint: 'Anthropic-compatible endpoint, or a router (LiteLLM / claude-code-router)' });
      modelId = await text('Model name', { def: 'llama3.1', hint: 'e.g. gpt-4o, gemini-2.0, llama-3.1-70b' });
      apiKey = await text('API key for that endpoint', { mask: true, hint: 'leave blank if none' });
    }
  }

  // 3) Claude model — only relevant for the Claude backends; a custom/local model is already chosen.
  let model = 'sonnet';
  if (authMode !== 'custom') {
    model = ['opus', 'sonnet'][await select('Claude model', [
      { label: 'opus', hint: 'best reasoning — heavier on Max limits' },
      { label: 'sonnet', hint: 'fast + sustainable' },
    ])];
  }

  // 4) permissions — default to the SAFER "ask first" mode for newcomers; autonomy is an opt-in.
  const perm = ['default', 'bypassPermissions'][await select('Tool permissions — how much can Helm do on its own?', [
    { label: 'default — ask before each action', hint: 'safer; recommended when starting out. Helm asks before running tools.' },
    { label: 'bypassPermissions — full autonomy', hint: 'Helm acts without asking (shell, files, screen). Powerful; only if you trust it on this machine.' },
  ])];

  // 5) service
  const svc = await confirm(`Run 24/7 in the background? (${IS_MAC ? 'launchd' : IS_LINUX ? 'systemd --user' : 'service'})`, true);

  // 6) review + confirm
  const claudeBin = which('claude');
  header();
  out.write(`  ${C.b}Review${C.reset}\n\n`);
  const row = (k, v) => out.write(`  ${C.gray}${k.padEnd(14)}${C.reset}${v}\n`);
  row('Gateways', `${C.teal}${gateways.join(', ')}${C.reset}`);
  row('Discord token', token ? `${C.grn}set${C.reset} ${C.dim}(hidden)${C.reset}` : `${C.yel}none${C.reset}`);
  row('Owner ID', ownerId || `${C.yel}(none)${C.reset}`);
  row('Backend',
    authMode === 'apikey' ? `Anthropic API key ${apiKey ? `${C.grn}(set)${C.reset}` : `${C.yel}(none)${C.reset}`}`
    : authMode === 'custom' ? (online ? `Free online ${C.teal}${openaiModel}${C.reset} ${C.dim}(${openaiBase})${C.reset} ${openaiKey ? `${C.grn}key set${C.reset}` : `${C.yel}no key${C.reset}`}` : ollamaModel ? `Local model ${C.teal}${ollamaModel}${C.reset} (auto-download)` : `Custom — ${C.teal}${modelId}${C.reset} @ ${baseUrl}`)
    : 'Claude subscription (OAuth)');
  if (authMode !== 'custom') row('Model', model);
  row('Permissions', perm);
  row('Service', svc ? 'yes' : 'no');
  row('Machine', `${C.teal}${IS_MAC ? 'macOS' : IS_WIN ? 'Windows' : 'Linux'}${C.reset} ${C.dim}(single machine)${C.reset}`);
  out.write('\n');
  if (!(await confirm('Write this config?', true))) { cleanup(); console.log('\nCancelled. Nothing written.'); process.exit(1); }
  applyConfig({ gateways, token, ownerId, authMode, apiKey, baseUrl, modelId, model, perm, svc, claudeBin, ollamaModel, online, openaiBase, openaiModel, openaiKey });
}

// If the fancy UI is unavailable or errors out, fall back to the plain Q&A rather than show nothing.
main().catch(e => {
  try { cleanup(); } catch {}
  console.error('\n(full-screen UI unavailable — switching to plain setup:', (e?.message || e) + ')');
  runPlain().catch(err => { console.error('setup failed:', err?.message || err); process.exit(1); });
});
