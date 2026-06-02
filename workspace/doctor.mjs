#!/usr/bin/env node
// helm doctor — one command that checks every common Helm setup failure and tells you how to fix it.
//
//   helm doctor            human-readable report (ok / warnings / problems), exit 1 if any problem
//   helm doctor --json     machine-readable JSON for scripts
//
// Deliberately dependency-free and node:sqlite-free at import time, so it runs on ANY Node (and can
// therefore REPORT a too-old Node instead of crashing the way the real brain would).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MIN_NODE, nodeOk } from './preflight/node-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WIN = process.platform === 'win32';
const JSON_OUT = process.argv.includes('--json');

// Keep the report clean: silence Node's benign ExperimentalWarning (node:sqlite) and DEP0190
// (shell:true) notices this diagnostic itself triggers. Node routes both through process.emitWarning,
// so overriding it is the only reliable in-process suppressor (a 'warning' listener does NOT stop the
// default stderr print).
process.emitWarning = () => {};

const results = [];
const add = (level, name, msg, fix) => results.push({ level, name, msg, fix: fix || null });
const ok = (n, m) => add('ok', n, m);
const warn = (n, m, fix) => add('warn', n, m, fix);
const fail = (n, m, fix) => add('fail', n, m, fix);

// ---- small helpers (no external deps) ----
function parseEnv(raw) {
  const o = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    o[k] = v;
  }
  return o;
}
function portOpen(port, host = '127.0.0.1', timeout = 400) {
  return new Promise(res => {
    const s = net.connect({ host, port });
    const done = v => { try { s.destroy(); } catch {} res(v); };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    setTimeout(() => done(false), timeout);
  });
}
async function httpGet(url, headers = {}, timeoutMs = 6000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ac.signal });
    const body = await res.text();
    return { status: res.status, body };
  } finally { clearTimeout(t); }
}

// Mirror of index.js resolveClaude(), trimmed to "find a runnable claude" for diagnosis only.
function resolveClaudeLite(CLAUDE_BIN) {
  const bin = CLAUDE_BIN || 'claude';
  if (!IS_WIN) {
    const w = spawnSync('which', [bin], { encoding: 'utf8' });
    if (w.status === 0 && (w.stdout || '').trim()) return { found: true, cmd: w.stdout.trim().split('\n')[0], shell: false };
    const local = process.env.HOME && path.join(process.env.HOME, '.local', 'bin', 'claude');
    if (local && existsSync(local)) return { found: true, cmd: local, shell: false };
    return { found: false, cmd: bin, shell: false };
  }
  if (/\.exe$/i.test(bin) && existsSync(bin)) return { found: true, cmd: bin, shell: false };
  if (existsSync(bin + '.exe')) return { found: true, cmd: bin + '.exe', shell: false };
  try {
    const r = spawnSync('where', ['claude'], { encoding: 'utf8' });
    if (r.status === 0) {
      const hits = (r.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const exe = hits.find(h => /\.exe$/i.test(h));
      const cmd = hits.find(h => /\.cmd$/i.test(h));
      if (exe) return { found: true, cmd: exe, shell: false };
      if (cmd) return { found: true, cmd, shell: true };
    }
  } catch {}
  const A = process.env.APPDATA, U = process.env.USERPROFILE, L = process.env.LOCALAPPDATA;
  const guesses = [
    A && path.join(A, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    A && path.join(A, 'npm', 'claude.exe'),
    A && path.join(A, 'npm', 'claude.cmd'),
    U && path.join(U, '.local', 'bin', 'claude.exe'),
    L && path.join(L, 'Programs', 'claude', 'claude.exe'),
  ].filter(Boolean);
  for (const g of guesses) if (existsSync(g)) return { found: true, cmd: g, shell: /\.cmd$/i.test(g) };
  return { found: false, cmd: bin, shell: true };
}

async function checkOpenAIEndpoint(base, key, model) {
  const url = base.replace(/\/+$/, '') + '/models';
  const local = /localhost|127\.0\.0\.1|11434/.test(base);
  try {
    const r = await httpGet(url, key ? { authorization: `Bearer ${key}` } : {}, 6000);
    if (r.status === 401 || r.status === 403) {
      fail('model-endpoint', `the provider rejected the API key (HTTP ${r.status})`, 'Recheck OPENAI_API_KEY from the provider console, then re-run helm setup.');
      return;
    }
    if (r.status >= 200 && r.status < 300) {
      let ids = [];
      try { const j = JSON.parse(r.body); ids = (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean); } catch {}
      if (ids.length && !ids.includes(model)) {
        warn('model', `model "${model}" isn't in the provider's model list`, `Available e.g.: ${ids.slice(0, 6).join(', ')}. Set OPENAI_MODEL to one of these.`);
      } else {
        ok('model-endpoint', `reachable, model "${model}" ok (${base})`);
      }
    } else {
      warn('model-endpoint', `endpoint returned HTTP ${r.status}`, `Check OPENAI_BASE_URL=${base} (OpenAI-compatible base should end in /v1).`);
    }
  } catch (e) {
    fail('model-endpoint', `can't reach ${base} (${e.message || e})`,
      local ? `Start your local model server and pull the model:  ollama serve   then   ollama pull ${model}`
            : 'Check OPENAI_BASE_URL and your network/proxy. For Ollama use http://localhost:11434/v1.');
  }
}

async function main() {
  // ---- Node ----
  if (nodeOk()) ok('node', `Node ${process.versions.node} (need >= ${MIN_NODE.join('.')})`);
  else fail('node', `Node ${process.versions.node} is too old`, `Helm needs Node ${MIN_NODE.join('.')}+. winget install OpenJS.NodeJS.LTS (Windows) / nvm install --lts, then reopen the terminal.`);

  // ---- node:sqlite (the real reason old Node fails) ----
  try { await import('node:sqlite'); ok('sqlite', 'node:sqlite is available'); }
  catch { fail('sqlite', 'node:sqlite is missing on this Node', `This is why memory/sessions crash. Update Node to ${MIN_NODE.join('.')}+.`); }

  // ---- dependencies ----
  const nm = path.join(ROOT, 'node_modules');
  if (!existsSync(nm)) fail('deps', 'node_modules is missing (dependencies not installed)', `Run:  npm install   (in ${ROOT})`);
  else {
    const need = ['discord.js', 'dotenv'];
    const missing = need.filter(d => !existsSync(path.join(nm, d)));
    if (missing.length) fail('deps', `missing packages: ${missing.join(', ')}`, 'Run:  npm install');
    else ok('deps', 'core dependencies installed');
  }

  // ---- .env ----
  const envPath = path.join(ROOT, '.env');
  let env = {};
  if (!existsSync(envPath)) {
    fail('.env', 'no .env file', 'Run:  helm setup   (or copy .env.example to .env and fill it in).');
  } else {
    let raw = readFileSync(envPath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) { warn('.env', '.env starts with a UTF-8 BOM (can corrupt the first line)', 'Re-save .env as UTF-8 without BOM, or re-run helm setup.'); raw = raw.slice(1); }
    env = parseEnv(raw);
    ok('.env', '.env present');
  }
  const get = k => (env[k] !== undefined ? env[k] : process.env[k]);

  // ---- Discord token + owner id ----
  const tok = get('DISCORD_TOKEN');
  if (!tok || /paste-your|here$/i.test(tok)) fail('discord-token', 'DISCORD_TOKEN not set', 'Create a bot at discord.com/developers > Bot > Reset Token, copy it, run helm setup.');
  else if (!/^[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}$/.test(tok)) warn('discord-token', "DISCORD_TOKEN doesn't look like a bot token (expect 3 dot-separated parts)", 'Make sure you copied the BOT token (not the client secret or application id).');
  else ok('discord-token', 'DISCORD_TOKEN looks valid');

  const owner = get('OWNER_ID');
  if (!owner || /your-discord/i.test(owner)) fail('owner-id', 'OWNER_ID not set', 'Discord > Settings > Advanced > Developer Mode on, then right-click your name > Copy User ID.');
  else if (!/^\d{17,20}$/.test(owner)) warn('owner-id', `OWNER_ID="${owner}" isn't a numeric Discord ID (17-20 digits)`, 'Copy your numeric user ID, not your username.');
  else ok('owner-id', 'OWNER_ID looks valid');

  // ---- engine (Claude Code) — required in ALL modes; free models run THROUGH it ----
  const claude = resolveClaudeLite(get('CLAUDE_BIN'));
  if (!claude.found) {
    fail('engine', "Claude Code (Helm's engine) not found", 'npm install -g @anthropic-ai/claude-code  — a free/local model still needs it as the engine. Or set CLAUDE_BIN to its full path in .env.');
  } else {
    const v = spawnSync(claude.cmd, ['--version'], { encoding: 'utf8', shell: claude.shell, timeout: 20000 });
    if (v.status === 0) ok('engine', `Claude Code ${(v.stdout || '').trim().split('\n')[0]} (${claude.cmd})`);
    else fail('engine', `Claude Code at ${claude.cmd} won't run`, `${(v.stderr || v.error?.message || ('exit ' + v.status)).toString().trim().slice(0, 140)} — reinstall: npm install -g @anthropic-ai/claude-code`);
  }

  // ---- auth / model mode ----
  const mode = (get('AUTH_MODE') || 'subscription').toLowerCase();
  if (mode === 'apikey') {
    const k = get('ANTHROPIC_API_KEY');
    if (!k) fail('auth', 'AUTH_MODE=apikey but ANTHROPIC_API_KEY is unset', 'Add your sk-ant-... key, or switch to a free model with helm setup.');
    else if (!/^sk-ant-/.test(k)) warn('auth', "ANTHROPIC_API_KEY doesn't start with sk-ant-", 'Double-check the key from console.anthropic.com.');
    else ok('auth', 'apikey mode: key present');
  } else if (mode === 'custom') {
    const base = get('OPENAI_BASE_URL'), model = get('OPENAI_MODEL'), key = get('OPENAI_API_KEY');
    if (base && model) {
      await checkOpenAIEndpoint(base, key, model);
      const pp = parseInt(get('PROXY_PORT') || '8787', 10);
      if (await portOpen(pp)) {
        // If Helm's brain is up, that port is its OWN proxy — expected, not a conflict.
        const brainUp = await portOpen(parseInt(get('HELM_CLI_PORT') || '4625', 10));
        if (brainUp) ok('proxy-port', `proxy port ${pp} in use by the running Helm (its own proxy) — fine`);
        else warn('proxy-port', `proxy port ${pp} is held by another process (Helm isn't running)`, `Stop whatever holds port ${pp}, or set PROXY_PORT to a free port in .env.`);
      } else ok('proxy-port', `free-model proxy port ${pp} is free`);
    } else {
      const ab = get('ANTHROPIC_BASE_URL');
      if (!ab) fail('auth', 'AUTH_MODE=custom but neither OPENAI_* nor ANTHROPIC_BASE_URL is set', 'Run helm setup and pick a free model (local Ollama or a free online provider).');
      else {
        try { const r = await httpGet(ab.replace(/\/+$/, ''), {}, 5000); ok('auth', `custom endpoint reachable (HTTP ${r.status}) ${ab}`); }
        catch (e) { fail('auth', `custom endpoint unreachable: ${ab} (${e.message || e})`, 'Start the model server (e.g. ollama serve) or fix ANTHROPIC_BASE_URL.'); }
      }
    }
  } else {
    ok('auth', 'subscription mode (Claude Pro/Max). If you hit auth errors, run `claude` once to log in.');
  }

  // ---- npm available (needed for self-upgrade + installing the engine) ----
  const nr = spawnSync(IS_WIN ? 'npm.cmd' : 'npm', ['-v'], { encoding: 'utf8', shell: IS_WIN, timeout: 15000 });
  if (nr.status === 0) ok('npm', `npm ${(nr.stdout || '').trim()}`);
  else warn('npm', 'npm not found on PATH', 'Reinstall Node (it bundles npm) and reopen your terminal.');

  // ---- already running? ----
  const bridge = parseInt(get('HELM_CLI_PORT') || '4625', 10);
  if (await portOpen(bridge)) warn('running', 'a Helm brain is already running (bridge port is up)', "Fine if intended — but one Discord token = one running brain. Don't start a second copy.");
  else ok('running', 'no brain currently running (it will start on demand)');

  // ---- output ----
  const fails = results.filter(r => r.level === 'fail');
  const warns = results.filter(r => r.level === 'warn');
  const oks = results.filter(r => r.level === 'ok');

  if (JSON_OUT) {
    console.log(JSON.stringify({ ok: fails.length === 0, counts: { ok: oks.length, warn: warns.length, fail: fails.length }, results }, null, 2));
    process.exit(fails.length ? 1 : 0);
  }

  const icon = { ok: '  ok  ', warn: '  !!  ', fail: '  XX  ' };
  console.log('\nHelm doctor\n-----------');
  for (const r of results) {
    console.log(`${icon[r.level]}${r.name.padEnd(15)} ${r.msg}`);
    if (r.fix && r.level !== 'ok') console.log(`        -> ${r.fix}`);
  }
  console.log('-----------');
  console.log(`${oks.length} ok, ${warns.length} warning(s), ${fails.length} problem(s)`);
  if (fails.length) console.log('Fix the XX problem(s) above, then run `helm doctor` again.');
  else if (warns.length) console.log('No blockers. Review the !! warnings if something misbehaves.');
  else console.log('All good. Start Helm with:  helm');
  process.exit(fails.length ? 1 : 0);
}

main().catch(e => { console.error('doctor crashed:', e?.message || e); process.exit(2); });
