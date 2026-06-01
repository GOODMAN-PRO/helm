#!/usr/bin/env node
// brain-sync.mjs — keep the SINGLE HelmBrain Obsidian vault identical on the Mac and the Windows box.
//
// There is exactly ONE vault. It lives at $HOME/HelmBrain on macOS/Linux and
// %USERPROFILE%\HelmBrain on Windows. Edits happen on either machine; this reconciles them.
//
// Mechanism: git over **bundles** (not git-over-ssh — Windows' cmd.exe shell mangles the quoting
// git uses, so we never run git-upload-pack remotely). Instead each side packs its history into a
// single .git bundle file, we scp the file across (scp to Windows works fine), and each side
// fetches/merges from the local bundle. No cloud, no money — just SSH/Tailscale + scp.
//
// Flow (Mac-driven):
//   1. commit pending edits on BOTH sides (nothing is ever lost)
//   2. Windows -> bundle -> scp to Mac -> Mac fetches+merges windows edits
//   3. Mac -> bundle -> scp to Windows -> Windows fetches+merges (fast-forwards) -> working tree updates
// Conflicts: a normal git merge. Real markdown conflicts are surfaced, never guessed. Volatile
// per-machine files (.obsidian/workspace*.json, caches, .trash) are git-ignored.
//
// First run: pass --init. Windows is seeded FROM the Mac so both share one history; because the
// Windows HelmBrain is a copy of the Mac's, nothing is lost, and any Windows-only edits are captured
// as a commit on top. After that, sync is true two-way.
//
// Usage:  node workspace/tools/brain-sync.mjs [--init] [--dry-run]

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAC_VAULT = path.join(os.homedir(), 'HelmBrain');   // local vault ($HOME/HelmBrain)
const WIN_HOST = process.env.HELM_WIN_HOST || 'helm-win';
const WIN_VAULT = '%USERPROFILE%\\HelmBrain';   // remote Windows vault
const BRANCH = 'main';
const DRY = process.argv.includes('--dry-run');
const INIT = process.argv.includes('--init');

const MAC_BUNDLE = '/tmp/hb-mac.bundle';
const WIN_BUNDLE_LOCAL = '/tmp/hb-win.bundle';     // where we drop the windows bundle on the Mac
const WIN_BUNDLE_REMOTE = 'hb-win.bundle';         // relative to windows home
const MAC_BUNDLE_ON_WIN = 'hb-mac.bundle';         // relative to windows home

const GITIGNORE = [
  '# per-machine Obsidian UI state — never sync these',
  '.obsidian/workspace.json',
  '.obsidian/workspace-mobile.json',
  '.obsidian/workspace*.json',
  '.obsidian/cache',
  '.obsidian/.DS_Store',
  '.DS_Store',
  '.trash/',
  '',
].join('\n');

function log(...a) { console.log('[brain-sync]', ...a); }
function die(msg) { console.error('[brain-sync] ERROR:', msg); process.exit(1); }
const clean = s => (s || '').split('\n').filter(l => !/post-quantum|vulnerable to|may need to be upgraded|openssh\.com\/pq/.test(l)).join('\n').trim();

function git(args, opts = {}) {
  const r = spawnSync('git', ['-C', MAC_VAULT, ...args], { encoding: 'utf8', ...opts });
  return { code: r.status, out: (r.stdout || '').trim(), err: clean(r.stderr) };
}
function sh(cmd, args, timeout = 180_000) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout });
  return { code: r.status, out: (r.stdout || '').trim(), err: clean(r.stderr) };
}
// run a command on the Windows box (cmd.exe shell)
function win(cmdline, timeout = 180_000) {
  return sh('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', WIN_HOST, cmdline], timeout);
}
const inWinVault = g => `cd /d ${WIN_VAULT} && git ${g}`;

function ensureLocalGit() {
  if (!existsSync(MAC_VAULT)) die(`Mac vault not found at ${MAC_VAULT}`);
  if (!existsSync(`${MAC_VAULT}/.git`)) {
    log('init git in Mac vault');
    if (git(['init', '-b', BRANCH]).code !== 0) { git(['init']); git(['checkout', '-B', BRANCH]); }
  }
  if (!git(['config', 'user.email']).out) git(['config', 'user.email', 'helm@local']);
  if (!git(['config', 'user.name']).out) git(['config', 'user.name', 'Helm']);
  writeFileSync(`${MAC_VAULT}/.gitignore`, GITIGNORE);
}

function commitMac(label) {
  git(['add', '-A']);
  if (git(['status', '--porcelain']).out) {
    git(['commit', '-m', `brain-sync: mac ${label} ${new Date().toISOString()}`]);
    log('mac: committed local edits'); return true;
  }
  log('mac: nothing to commit'); return false;
}
function commitWin(label) {
  win(inWinVault('add -A'));
  const st = win(inWinVault('status --porcelain'));
  if (st.out) {
    win(inWinVault(`commit -m "brain-sync: windows ${label} ${new Date().toISOString()}"`));
    log('windows: committed local edits'); return true;
  }
  log('windows: nothing to commit'); return false;
}

// First-time: give the Windows vault the Mac's history so they share one root.
function seedWindowsFromMac() {
  const exists = win(`if exist ${WIN_VAULT}\\nul (echo YES) else (echo NO)`).out;
  if (!/YES/.test(exists)) die(`Windows vault ${WIN_VAULT} missing — refusing to create a duplicate. Seed %USERPROFILE%\\HelmBrain from the home machine once, then re-run --init.`);
  const hasGit = win(`if exist ${WIN_VAULT}\\.git (echo YES) else (echo NO)`).out;
  if (/YES/.test(hasGit)) { log('windows: git already initialised'); return; }
  log('windows: seeding git from Mac history');
  // mac bundle already created by caller; copy it over
  if (sh('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', MAC_BUNDLE, `${WIN_HOST}:${MAC_BUNDLE_ON_WIN}`]).code !== 0) die('scp mac bundle -> windows failed');
  let r = win(inWinVault('init -b ' + BRANCH));
  if (r.code !== 0) { win(inWinVault('init')); win(inWinVault('checkout -B ' + BRANCH)); }
  win(inWinVault('config user.email helm@local'));
  win(inWinVault('config user.name Helm'));
  win(inWinVault(`fetch %USERPROFILE%\\${MAC_BUNDLE_ON_WIN} ${BRANCH}`));
  // mixed reset: adopt Mac's committed tree as HEAD, keep Windows working files as pending changes
  r = win(inWinVault('reset FETCH_HEAD'));
  if (r.code !== 0) die(`windows reset failed: ${r.err || r.out}`);
  log('windows: seeded — shared history with Mac');
}

function main() {
  ensureLocalGit();

  // 1) commit pending edits on both sides (mac first so its bundle is current for seeding)
  commitMac(INIT ? 'init' : 'snapshot');
  if (INIT) {
    if (git(['bundle', 'create', MAC_BUNDLE, '--branches']).code !== 0) die('mac bundle (for seed) failed');
    seedWindowsFromMac();
  }
  commitWin(INIT ? 'init' : 'snapshot');

  // 2) windows -> bundle -> mac, then merge
  let r = win(inWinVault(`bundle create %USERPROFILE%\\${WIN_BUNDLE_REMOTE} --branches`));
  if (r.code !== 0) die(`windows bundle create failed: ${r.err || r.out}`);
  if (sh('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', `${WIN_HOST}:${WIN_BUNDLE_REMOTE}`, WIN_BUNDLE_LOCAL]).code !== 0) die('scp windows bundle -> mac failed');
  r = git(['fetch', WIN_BUNDLE_LOCAL, `${BRANCH}:refs/remotes/win/${BRANCH}`]);
  if (r.code !== 0) die(`mac fetch from windows bundle failed: ${r.err || r.out}`);
  const merge = git(['merge', '--no-edit', `win/${BRANCH}`]);
  if (merge.code !== 0) {
    const conflicts = git(['diff', '--name-only', '--diff-filter=U']).out;
    die(`merge conflict reconciling windows edits into mac:\n${conflicts}\nResolve in ${MAC_VAULT}, commit, then re-run.`);
  }

  if (DRY) { log('dry-run: would now push merged state to windows'); return; }

  // 3) mac -> bundle -> windows, then merge (fast-forwards; updates the windows working tree)
  if (git(['bundle', 'create', MAC_BUNDLE, '--branches']).code !== 0) die('mac bundle create failed');
  if (sh('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', MAC_BUNDLE, `${WIN_HOST}:${MAC_BUNDLE_ON_WIN}`]).code !== 0) die('scp mac bundle -> windows failed');
  r = win(inWinVault(`fetch %USERPROFILE%\\${MAC_BUNDLE_ON_WIN} ${BRANCH}`));
  if (r.code !== 0) die(`windows fetch from mac bundle failed: ${r.err || r.out}`);
  r = win(inWinVault('merge --no-edit FETCH_HEAD'));
  if (r.code !== 0) die(`windows merge failed (conflict or dirty tree): ${r.err || r.out}`);

  // tidy bundle files
  try { unlinkSync(WIN_BUNDLE_LOCAL); unlinkSync(MAC_BUNDLE); } catch {}
  win(`del /q %USERPROFILE%\\${WIN_BUNDLE_REMOTE} %USERPROFILE%\\${MAC_BUNDLE_ON_WIN} 2>nul & rem`);

  log('sync complete — Mac and Windows HelmBrain are identical.');
}

main();
