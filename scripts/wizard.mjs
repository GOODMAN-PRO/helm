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

function which(bin) { try { return execSync(`command -v ${bin}`, { encoding: 'utf8' }).trim(); } catch { return bin; } }

async function main() {
  if (!isTTY) { console.error('wizard: no interactive terminal; skipping (installer will use the template).'); process.exit(2); }

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
    { label: 'OpenAI', hint: 'not yet — Helm runs on Claude Code (Anthropic). On the roadmap.', disabled: true },
  ];
  const backendIdx = await select('How do you want to power Helm?', backendItems);
  const authMode = backendIdx === 1 ? 'apikey' : 'subscription';
  let apiKey = '';
  if (authMode === 'apikey') {
    apiKey = await text('Anthropic API key', { mask: true, hint: 'console.anthropic.com -> API Keys (starts with sk-ant-)' });
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

  // 6) summary + confirm
  const claudeBin = which('claude');
  header();
  out.write(`  ${C.b}Review${C.reset}\n\n`);
  const row = (k, v) => out.write(`  ${C.gray}${k.padEnd(14)}${C.reset}${v}\n`);
  row('Gateways', `${C.teal}${gateways.join(', ')}${C.reset}`);
  row('Discord token', token ? `${C.grn}set${C.reset} ${C.dim}(hidden)${C.reset}` : `${C.yel}none${C.reset}`);
  row('Owner ID', ownerId || `${C.yel}(none)${C.reset}`);
  row('Backend', authMode === 'apikey' ? `Anthropic API key ${apiKey ? `${C.grn}(set)${C.reset}` : `${C.yel}(none)${C.reset}`}` : 'Claude subscription (OAuth)');
  row('Model', model);
  row('Permissions', perm);
  row('Service', svc ? 'yes' : 'no');
  row('Install dir', ROOT);
  out.write('\n');
  if (!(await confirm('Write this config?', true))) { cleanup(); console.log('\nCancelled. Nothing written.'); process.exit(1); }

  // 7) write .env (owner-only perms)
  const env = [
    `# Helm config — generated by the setup wizard ${new Date().toISOString()}`,
    `DISCORD_TOKEN=${token || 'paste-your-discord-bot-token-here'}`,
    `OWNER_ID=${ownerId || 'your-discord-user-id'}`,
    `GATEWAYS=${gateways.join(',')}`,
    `AUTH_MODE=${authMode}`,
    ...(authMode === 'apikey' ? [`ANTHROPIC_API_KEY=${apiKey}`] : []),
    `MODEL=${model}`,
    `PERMISSION_MODE=${perm}`,
    `CLAUDE_BIN=${claudeBin}`,
    `WORKSPACE=./workspace`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, '.env'), env, { mode: 0o600 });

  cleanup();
  console.log(`\n${C.grn}ok${C.reset}  wrote ${path.join(ROOT, '.env')} (chmod 600)`);

  // 8) optional service
  if (svc) {
    const r = spawnSync('bash', [path.join(ROOT, 'scripts', 'install-service.sh')], { stdio: 'inherit' });
    if (r.status !== 0) console.log(`${C.yel}!!${C.reset}  service install reported an issue — you can start manually with: cd "${ROOT}" && npm start`);
  }

  // 9) final
  console.log('');
  console.log(`${C.cyan}${C.b}Helm is set up.${C.reset}`);
  if (!svc) {
    console.log(`Start it:   ${C.b}cd "${ROOT}" && npm start${C.reset}`);
  } else {
    console.log(`It's running in the background. Logs: ${ROOT}/agent.log`);
  }
  if (authMode === 'subscription') console.log(`${C.dim}Backend: Claude subscription — make sure you've run ${C.reset}claude${C.dim} once and logged in.${C.reset}`);
  else console.log(`${C.dim}Backend: Anthropic API key (billed pay-as-you-go).${C.reset}`);
  console.log(`Then DM your bot on Discord.${gateways.includes('imessage') ? '  (iMessage: grant the node process Full Disk Access in System Settings.)' : ''}`);
  console.log(`${C.dim}Reminder: one Discord token = one running instance.${C.reset}`);
  process.exit(0);
}

main().catch(e => { cleanup(); console.error('wizard error:', e?.message || e); process.exit(1); });
