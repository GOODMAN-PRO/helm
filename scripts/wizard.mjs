#!/usr/bin/env node
// Helm setup wizard — the "cool screen" the installer hands off to.
// Arrow-key menus to choose gateways + options, then writes .env and (optionally) the service.
// Reads /dev/tty directly so it works even when launched from `curl ... | bash` (piped stdin).
import tty from 'node:tty';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';

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
  try { return execSync(`${IS_WIN ? 'where' : 'command -v'} ${bin}`, { encoding: 'utf8' }).trim().split(/\r?\n/)[0]; }
  catch { return bin; }
}
// the fancy full-screen UI needs a raw-mode TTY; otherwise we use a plain Q&A that works anywhere.
// Set HELM_PLAIN=1 to force the plain flow (handy if a terminal mangles the full-screen UI).
const rawOk = !process.env.HELM_PLAIN && isTTY && typeof input.setRawMode === 'function';

// ---- shared: write .env + optional service + final report (used by both flows) ----
// Keys the wizard owns; everything else in an existing .env (e.g. HELM_WIN_HOST for the Mac<->Windows
// fleet/sync, custom vars) is PRESERVED so re-running setup never resets your fleet or sync config.
const MANAGED = new Set(['DISCORD_TOKEN', 'OWNER_ID', 'GATEWAYS', 'AUTH_MODE', 'MODEL', 'PERMISSION_MODE',
  'CLAUDE_BIN', 'WORKSPACE', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL', 'ANTHROPIC_AUTH_TOKEN']);
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
    ...(cfg.authMode === 'custom' ? [`ANTHROPIC_BASE_URL=${cfg.baseUrl}`, `ANTHROPIC_MODEL=${cfg.modelId}`, ...(cfg.apiKey ? [`ANTHROPIC_API_KEY=${cfg.apiKey}`] : [])] : []),
    `MODEL=${cfg.model}`,
    `PERMISSION_MODE=${cfg.perm}`,
    `CLAUDE_BIN=${cfg.claudeBin}`,
    `WORKSPACE=./workspace`,
  ];
  if (preserved.length) { lines.push('', '# preserved from your previous config (fleet, sync, custom vars)'); for (const [k, v] of preserved) lines.push(`${k}=${v}`); }
  lines.push('');
  return lines.join('\n');
}
function applyConfig(cfg) {
  fs.writeFileSync(path.join(ROOT, '.env'), buildEnv(cfg), { mode: 0o600 });
  cleanup();
  console.log(`\nok  wrote ${path.join(ROOT, '.env')}`);
  if (cfg.svc) {
    const r = (IS_MAC || IS_LINUX)
      ? spawnSync('bash', [path.join(ROOT, 'scripts', 'install-service.sh')], { stdio: 'inherit' })
      : spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', 'install-service.ps1')], { stdio: 'inherit' });
    if (r.status !== 0) console.log('!!  service install reported an issue — start manually with: npm start');
  }
  console.log('\nHelm is set up.');
  console.log(cfg.svc ? `It's running in the background. Logs: ${ROOT}/agent.log` : `Start it:  cd "${ROOT}" && npm start`);
  if (cfg.authMode === 'subscription') console.log("Backend: Claude subscription — make sure you've run 'claude' once and logged in.");
  else if (cfg.authMode === 'apikey') console.log('Backend: Anthropic API key (billed pay-as-you-go).');
  else console.log(`Backend: free / local model (${cfg.modelId} @ ${cfg.baseUrl}) — make sure that endpoint is running.`);
  console.log(`Then DM your bot on Discord.${cfg.gateways.includes('imessage') ? '  (iMessage: grant node Full Disk Access in System Settings.)' : ''}`);
  console.log('Reminder: one Discord token = one running instance.');
  process.exit(0);
}

// plain question-by-question fallback (no raw-mode UI) — robust on every shell, including Windows
async function runPlain() {
  const rl = (await import('node:readline/promises')).createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, d = '') => { const a = (await rl.question(d ? `${q} [${d}]: ` : `${q}: `)).trim(); return a || d; };
  console.log('\n== Helm setup ==');
  const gw = (await ask('Gateways — discord, imessage, or both', 'discord')).toLowerCase();
  const gateways = gw.includes('both') ? ['discord', 'imessage'] : gw.includes('imessage') ? (gw.includes('discord') ? ['discord', 'imessage'] : ['imessage']) : ['discord'];
  let token = ''; if (gateways.includes('discord')) token = await ask('Discord bot token');
  const ownerId = await ask('Your Discord user ID');
  const b = await ask('Power Helm with — 1) Claude subscription  2) Anthropic API key  3) Any other model (local/hosted)', '1');
  const authMode = b === '2' ? 'apikey' : b === '3' ? 'custom' : 'subscription';
  let apiKey = '', baseUrl = '', modelId = '';
  if (authMode === 'apikey') apiKey = await ask('Anthropic API key');
  else if (authMode === 'custom') { baseUrl = await ask('Model endpoint URL', 'http://localhost:11434'); modelId = await ask('Model name', 'llama3.1'); apiKey = await ask('API key for that endpoint (blank if none)', ''); }
  const model = (await ask('Model — 1) opus  2) sonnet', '1')) === '2' ? 'sonnet' : 'opus';
  const perm = (await ask('Tool permissions — 1) bypassPermissions  2) default', '1')) === '2' ? 'default' : 'bypassPermissions';
  const svc = (await ask('Run 24/7 in the background? (y/n)', 'y')).toLowerCase().startsWith('y');
  rl.close();
  applyConfig({ gateways, token, ownerId, authMode, apiKey, baseUrl, modelId, model, perm, svc, claudeBin: which('claude') });
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
    token = await text('Discord bot token', { mask: true, hint: 'Developer Portal -> your app -> Bot -> Reset Token' });
  }
  ownerId = await text('Your Discord user ID (owner lock)', { hint: 'Discord -> right-click your name -> Copy User ID' });

  // 2.5) backend — how Helm is powered
  const backendItems = [
    { label: 'Claude subscription (Pro / Max)', hint: 'log in with claude — no per-message cost' },
    { label: 'Anthropic API key', hint: 'pay-as-you-go — no subscription needed' },
    { label: 'Any other model — local or hosted', hint: 'free or paid: Ollama, OpenAI, Gemini, Groq, OpenRouter, DeepSeek… point Helm at any model' },
  ];
  const backendIdx = await select('How do you want to power Helm?', backendItems);
  const authMode = backendIdx === 1 ? 'apikey' : backendIdx === 2 ? 'custom' : 'subscription';
  let apiKey = '', baseUrl = '', modelId = '';
  if (authMode === 'apikey') {
    apiKey = await text('Anthropic API key', { mask: true, hint: 'console.anthropic.com -> API Keys (starts with sk-ant-)' });
  } else if (authMode === 'custom') {
    baseUrl = await text('Model endpoint URL', { def: 'http://localhost:11434', hint: 'Ollama (local) -> http://localhost:11434. OpenAI/Gemini/Groq/OpenRouter -> a router URL (LiteLLM / claude-code-router)' });
    modelId = await text('Model name', { def: 'llama3.1', hint: 'e.g. llama3.1, qwen3-coder (Ollama) · gpt-4o, gemini-2.0, llama-3.1-70b (via router)' });
    apiKey = await text('API key for that endpoint', { mask: true, hint: 'leave blank for a local model that needs none (e.g. Ollama)' });
  }

  // 3) model
  const model = ['opus', 'sonnet'][await select('Model', [
    { label: 'opus', hint: 'best reasoning — heavier on Max limits' },
    { label: 'sonnet', hint: 'fast + sustainable' },
  ])];

  // 4) permissions
  const perm = ['bypassPermissions', 'default'][await select('Tool permissions', [
    { label: 'bypassPermissions', hint: 'autonomous — runs tools without asking (recommended)' },
    { label: 'default', hint: 'asks before each tool action' },
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
    : authMode === 'custom' ? `Free / local — ${C.teal}${modelId}${C.reset} @ ${baseUrl}`
    : 'Claude subscription (OAuth)');
  row('Model', model);
  row('Permissions', perm);
  row('Service', svc ? 'yes' : 'no');
  out.write('\n');
  if (!(await confirm('Write this config?', true))) { cleanup(); console.log('\nCancelled. Nothing written.'); process.exit(1); }
  applyConfig({ gateways, token, ownerId, authMode, apiKey, baseUrl, modelId, model, perm, svc, claudeBin });
}

// If the fancy UI is unavailable or errors out, fall back to the plain Q&A rather than show nothing.
main().catch(e => {
  try { cleanup(); } catch {}
  console.error('\n(full-screen UI unavailable — switching to plain setup:', (e?.message || e) + ')');
  runPlain().catch(err => { console.error('setup failed:', err?.message || err); process.exit(1); });
});
