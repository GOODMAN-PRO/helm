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

// 1) prerequisites
if (!has('node')) die('Node 18+ not found (https://nodejs.org).');
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < 18) die(`Node ${process.version} is too old; need 18+.`);
if (!has('claude')) die("Claude Code (claude) not found. Install it, run 'claude' once and log in, then re-run.");
ok(`node ${process.version}   claude present${has('git') ? '   git present' : ''}`);

// 2) place the project at TARGET
if (path.resolve(PKG_ROOT) === path.resolve(TARGET)) {
  ok(`installing in place at ${TARGET}`);
} else if (existsSync(path.join(TARGET, '.git')) && has('git')) {
  say(`Updating existing install at ${TARGET}`);
  spawnSync('git', ['-C', TARGET, 'pull', '--ff-only'], { stdio: 'inherit' });
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
// shell:true is required on Windows (Node refuses to spawn npm.cmd directly) and harmless on POSIX
if (spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: TARGET, stdio: 'inherit', shell: true }).status !== 0)
  die(`npm install failed — run 'npm install' in ${TARGET}.`);
ok('dependencies installed');

// 4) sanity check
if (spawnSync('node', ['--check', 'index.js'], { cwd: TARGET }).status !== 0) die('index.js failed syntax check');
ok('index.js syntax valid');

// 5) configure
const envPath = path.join(TARGET, '.env');
const claudePath = (spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' }).stdout || 'claude').trim().split(/\r?\n/)[0];
if (existsSync(envPath)) {
  say(`  ${c.y}!!${c.x}  .env already exists — leaving it. Start with: npm start`);
} else if (NONINTERACTIVE || !process.stdin.isTTY) {
  const tmpl = readFileSync(path.join(TARGET, '.env.example'), 'utf8').replace(/^CLAUDE_BIN=.*/m, `CLAUDE_BIN=${claudePath}`);
  writeFileSync(envPath, tmpl);
  say(`  ${c.y}!!${c.x}  Wrote .env from template. Set DISCORD_TOKEN + OWNER_ID, then: npm start`);
} else {
  spawnSync('node', ['scripts/wizard.mjs'], { cwd: TARGET, stdio: 'inherit' });
  if (!existsSync(envPath)) {
    const tmpl = readFileSync(path.join(TARGET, '.env.example'), 'utf8').replace(/^CLAUDE_BIN=.*/m, `CLAUDE_BIN=${claudePath}`);
    writeFileSync(envPath, tmpl);
  }
}

say('');
say(`${c.cy}${c.b}Done.${c.x} Installed at: ${TARGET}`);
say(`Start it:   cd "${TARGET}" && npm start`);
say('Reminder: one Discord token = one running instance.');
