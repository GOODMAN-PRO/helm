#!/usr/bin/env node
// Cross-platform Helm installer. Powers `npx github:GOODMAN-PRO/helm` and
// `node bin/helm-install.mjs`. Works on macOS, Windows and Linux (no bash/PowerShell needed).
//
// What it does: checks Node/git/Claude, places the project at $HELM_DIR (default ~/helm),
// runs `npm install`, then hands off to the setup wizard (gateways, backend incl. free models,
// model, service). Env: HELM_DIR, HELM_REPO, HELM_NONINTERACTIVE=1.
import { existsSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.env.HELM_DIR || path.join(os.homedir(), 'helm');
const REPO = process.env.HELM_REPO || 'https://github.com/GOODMAN-PRO/helm.git';
const NONINTERACTIVE = process.env.HELM_NONINTERACTIVE === '1';
const c = { b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', cy: '\x1b[36m', x: '\x1b[0m' };
const say = m => console.log(m);
const ok = m => console.log(`  ${c.g}ok${c.x}  ${m}`);
const die = m => { console.error(`  ${c.r}xx${c.x}  ${m}`); process.exit(1); };
const has = cmd => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }).status === 0;

say(`${c.b}== Helm installer ==${c.x}`);

// 1) prerequisites — Helm needs Node 22.5+ (built-in node:sqlite). Check major AND minor.
if (!has('node')) die('Node 22.5+ not found (https://nodejs.org).');
const [nMaj, nMin] = process.versions.node.split('.').map(n => parseInt(n, 10));
if (nMaj < 22 || (nMaj === 22 && nMin < 5)) die(`Node ${process.version} is too old; Helm needs 22.5+. Install the latest LTS from https://nodejs.org (or: winget install OpenJS.NodeJS.LTS / nvm install --lts), reopen your terminal, and re-run.`);
// Claude Code is the engine Helm runs on — auto-install it if missing (don't dead-end).
if (!has('claude')) {
  say("Claude Code (Helm's engine) not found — installing it with npm...");
  spawnSync('npm install -g @anthropic-ai/claude-code', { stdio: 'inherit', shell: true });
}
const claudeOk = has('claude');
ok(`node ${process.version}${claudeOk ? '   claude present' : '   claude installed (restart shell if not found)'}${has('git') ? '   git present' : ''}`);

// 2) place the project at TARGET
if (path.resolve(PKG_ROOT) === path.resolve(TARGET)) {
  ok(`installing in place at ${TARGET}`);
} else if (existsSync(path.join(TARGET, '.git')) && has('git')) {
  say(`Updating existing install at ${TARGET}`);
  // Normal case: fast-forward. But if upstream history was rewritten (e.g. a force-push to scrub
  // data), --ff-only fails because the local clone has diverged. Recover by hard-resetting to the
  // remote — safe because .env, memory, vault and all owner state are gitignored (untouched).
  if (spawnSync('git', ['-C', TARGET, 'pull', '--ff-only'], { stdio: 'inherit' }).status !== 0) {
    say('  fast-forward not possible (upstream history changed) — re-syncing to the remote...');
    const branch = (spawnSync('git', ['-C', TARGET, 'remote', 'show', 'origin'], { encoding: 'utf8' }).stdout || '')
      .match(/HEAD branch:\s*(\S+)/)?.[1] || 'main';
    spawnSync('git', ['-C', TARGET, 'fetch', 'origin'], { stdio: 'inherit' });
    if (spawnSync('git', ['-C', TARGET, 'reset', '--hard', `origin/${branch}`], { stdio: 'inherit' }).status === 0) ok('re-synced to the latest published version');
    else say(`  ${c.y}!!${c.x}  couldn't auto-resync — your .env is safe; run:  git -C "${TARGET}" fetch origin && git -C "${TARGET}" reset --hard origin/${branch}`);
  }
} else if (existsSync(path.join(PKG_ROOT, 'index.js'))) {
  // we already have the source (npx cache / a clone) — copy it, skipping secrets/state/deps
  say(`Copying Helm -> ${TARGET}`);
  // never copy secrets, owner state, captured media, or deps — only shareable source
  const denyPrefix = [
    '.git', 'node_modules', '.swarm',
    'workspace/secrets', 'workspace/inbox', 'workspace/conversations', 'workspace/reverse',
    'workspace/browser-profile', 'workspace/research/reports', 'workspace/costs', 'workspace/swarm/diffs',
  ];
  const denyExact = new Set([
    '.env', '.upgrade.lock',
    'workspace/.sessions.json', 'workspace/.imessage-sessions.json', 'workspace/active-target',
    'workspace/memory/INDEX.md', 'workspace/persona.local.md',
    'workspace/upgrades/stuck-queue.jsonl', 'workspace/upgrades/stuck-archive.jsonl', 'workspace/mind/mind.log',
  ]);
  cpSync(PKG_ROOT, TARGET, {
    recursive: true,
    filter: src => {
      const rel = path.relative(PKG_ROOT, src).split(path.sep).join('/');
      if (rel === '') return true;
      if (denyExact.has(rel)) return false;
      if (denyPrefix.some(p => rel === p || rel.startsWith(p + '/'))) return false;
      if (/\.(log|db|db-wal|db-shm)$/.test(rel)) return false;
      if (rel.endsWith('.helmtemplate.json')) return false;
      return true;
    },
  });
  ok('source copied');
} else if (has('git')) {
  say(`Cloning ${REPO} -> ${TARGET}`);
  if (spawnSync('git', ['clone', '--depth', '1', REPO, TARGET], { stdio: 'inherit' }).status !== 0) die('git clone failed');
} else {
  die('git not found and no local source to copy. Install git, or use the curl/PowerShell installer.');
}

// 3) dependencies
say('Installing dependencies (npm install)...');
// run via the shell as a single string: required on Windows (Node won't spawn npm.cmd directly),
// and avoids the DEP0190 warning that args-array + shell:true triggers. Args are static/safe.
// PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: skip the ~hundreds-of-MB browser download — Playwright is used
// lazily by the reverse tool and installs browsers on first use. Big speedup.
const npmEnv = { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' };
const npmInstall = cmd => spawnSync(cmd, { cwd: TARGET, stdio: 'inherit', shell: true, env: npmEnv }).status === 0;
// Don't hide output. Native deps (sharp, onnxruntime via transformers) sometimes can't fetch a
// prebuilt binary — retry leaner before giving up.
if (!npmInstall('npm install --no-audit --no-fund')
  && !npmInstall('npm install --no-audit --no-fund --omit=optional')
  && !npmInstall('npm ci --no-audit --no-fund --omit=optional'))
  die('npm install failed — scroll up for the error. Common causes: network/proxy blocking the npm registry, or out-of-date Node.');
ok('dependencies installed');

// 4) sanity check — real RUNTIME probe (node --check is parse-only and FALSE-passes a missing
// node:sqlite on old Node), then a syntax check, then register the `helm` command on PATH.
if (spawnSync(process.execPath, ['--input-type=module', '-e', 'await import("node:sqlite")'], { cwd: TARGET }).status !== 0)
  die(`this Node can't load node:sqlite — Helm needs Node 22.5+ (have ${process.version}). Update Node and re-run.`);
if (spawnSync(process.execPath, ['--check', 'index.js'], { cwd: TARGET }).status !== 0) die('index.js failed a syntax check (download may be corrupt — re-run).');
ok('runtime + syntax valid');
spawnSync('npm link', { cwd: TARGET, stdio: 'ignore', shell: true });

// 5) configure
const envPath = path.join(TARGET, '.env');
// Resolve a runnable claude path. On Windows `where` lists the extension-less npm shim first, which
// Node can't spawn (`spawn ...\npm\claude ENOENT`) — prefer a .exe/.cmd/.bat so CLAUDE_BIN is runnable.
const claudeHits = (spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' }).stdout || '').trim().split(/\r?\n/).filter(Boolean);
const claudePath = (process.platform === 'win32'
  ? (claudeHits.find(p => /\.(exe|cmd|bat)$/i.test(p)) || claudeHits[0])
  : claudeHits[0]) || 'claude';
if (existsSync(envPath)) {
  say(`  ${c.y}!!${c.x}  .env already exists — leaving it. Start with: helm`);
} else if (NONINTERACTIVE || !process.stdin.isTTY) {
  const tmpl = readFileSync(path.join(TARGET, '.env.example'), 'utf8').replace(/^CLAUDE_BIN=.*/m, `CLAUDE_BIN=${claudePath}`);
  writeFileSync(envPath, tmpl);
  say(`  ${c.y}!!${c.x}  Wrote .env from template. Set DISCORD_TOKEN + OWNER_ID, then run: helm`);
} else {
  spawnSync('node', ['scripts/wizard.mjs'], { cwd: TARGET, stdio: 'inherit' });
  if (!existsSync(envPath)) {
    const tmpl = readFileSync(path.join(TARGET, '.env.example'), 'utf8').replace(/^CLAUDE_BIN=.*/m, `CLAUDE_BIN=${claudePath}`);
    writeFileSync(envPath, tmpl);
  }
}

say('');
say(`${c.cy}${c.b}Done.${c.x} Installed at: ${TARGET}`);
say('Start it:   helm            (if not found, reopen your terminal)');
say('Check it:   helm doctor     (diagnoses Node / engine / model / config problems)');
say('Reminder: one Discord token = one running instance.');
