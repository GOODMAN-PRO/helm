#!/usr/bin/env node
// Helm nightly self-upgrade — the Phase 4.3 self-modification gate, made real.
//
//   snapshot (git) -> npm update -> claude self-improves from QUEUE.md
//   -> node --check + smoke.mjs gate -> commit OR auto-revert
//   -> restart Discord bot -> health-check -> roll back if unhealthy -> DM owner.
//
// Safe to run manually. Env flags for testing:
//   HELM_UPGRADE_DRYRUN=1     skip npm update + the claude self-improve pass
//   HELM_UPGRADE_SKIP_SMOKE=1 skip the smoke gate (plumbing test only)

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, appendFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { renderStuckForPrompt, archiveAll } from './stuck.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // workspace/upgrades
const ROOT = path.resolve(__dirname, '../..');                  // secondme/
loadEnv({ path: path.join(ROOT, '.env') });
const { CLAUDE_BIN = 'claude', MODEL = 'opus' } = process.env;
const DRYRUN = process.env.HELM_UPGRADE_DRYRUN === '1';
const SKIP_SMOKE = process.env.HELM_UPGRADE_SKIP_SMOKE === '1';

const LOCK = path.join(ROOT, '.upgrade.lock');
const LOG = path.join(__dirname, 'self-upgrade.log');
const QUEUE = path.join(__dirname, 'QUEUE.md');
const HISTORY = path.join(__dirname, 'UPGRADE_LOG.md');
const AGENT_LOG = path.join(ROOT, 'agent.log');

const ts = () => new Date().toISOString();
const log = m => { const l = `[${ts()}] ${m}`; console.log(l); try { appendFileSync(LOG, l + '\n'); } catch {} };
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
// On Windows npm is `npm.cmd`, and patched Node refuses to spawn a .cmd without a shell (ENOENT/EINVAL).
// Route npm through the shell there so nightly self-upgrade doesn't silently fail to update deps.
const IS_WIN = process.platform === 'win32';
const npm = (args, opts = {}) => sh(IS_WIN ? 'npm.cmd' : 'npm', args, { shell: IS_WIN, timeout: 5 * 60_000, ...opts });
const git = (...a) => sh('git', ['-c', 'user.name=Helm', '-c', 'user.email=helm@localhost', ...a]);
const notify = msg => { try { sh(process.execPath, [path.join(ROOT, 'bin', 'helm-push.mjs'), msg]); } catch {} };

// Cross-platform sync sleep (no `sleep` binary on Windows).
function sleepMs(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} }

// Restart the Discord bot on whatever OS this is (launchd / Task Scheduler / systemd).
function restartBot() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  if (process.platform === 'win32') {
    sh('schtasks', ['/End', '/TN', 'HelmDiscord'], { timeout: 15_000 });
    sh('schtasks', ['/Run', '/TN', 'HelmDiscord'], { timeout: 15_000 });
  } else if (process.platform === 'darwin') {
    sh('launchctl', ['kickstart', '-k', `gui/${uid}/com.helm.discord`], { timeout: 15_000 });
  } else {
    sh('systemctl', ['--user', 'restart', 'helm-discord'], { timeout: 15_000 });
  }
}

function restartAndHealth() {
  // The bot writes workspace/.online (an ISO timestamp) when it connects to Discord. Restart, then
  // wait for that marker to be refreshed — cross-platform, no dependence on stdout→agent.log.
  const ONLINE = path.join(ROOT, 'workspace', '.online');
  const t0 = Date.now();
  restartBot();
  const start = Date.now();
  while (Date.now() - start < 45_000) {
    try { if (statSync(ONLINE).mtimeMs >= t0) return true; } catch {}
    sleepMs(2000);
  }
  return false;
}
function appendHistory(status, base, head, summary) {
  const entry = `\n## ${ts()} — ${status}\n- base: ${base}\n- head: ${head}\n- summary: ${(summary || '').slice(0, 1200).replace(/\n+/g, ' ')}\n`;
  try { appendFileSync(HISTORY, entry); } catch {}
}
function rollback(base, why, summary) {
  log(`ROLLBACK (${why}) -> ${base}`);
  git('reset', '--hard', base);
  git('clean', '-fd'); // remove untracked files created by the aborted upgrade pass
  npm(['ci', '--no-audit', '--no-fund']); // resync node_modules to restored lock
  const healthy = restartAndHealth();
  appendHistory(`REVERTED (${why})`, base, base, summary);
  notify(`Helm self-upgrade reverted (${why}). Code restored to ${base.slice(0, 7)}${healthy ? '' : ' — WARNING: bot still unhealthy, check manually'}.`);
}

if (existsSync(LOCK)) {
  // Check if the process that wrote the lock is still alive. A killed/crashed
  // upgrader leaves the lock file behind permanently; treat that as stale.
  let stale = false;
  try {
    const pid = parseInt(readFileSync(LOCK, 'utf8').trim(), 10);
    if (isNaN(pid)) { stale = true; }
    else { try { process.kill(pid, 0); } catch { stale = true; } } // ESRCH = not running
  } catch { stale = true; }
  if (stale) { log(`stale lock (pid gone) — removing and continuing`); rmSync(LOCK); }
  else { log('lock present — another upgrade running; exit'); process.exit(0); }
}
writeFileSync(LOCK, String(process.pid));
process.on('exit', () => { try { rmSync(LOCK); } catch {} });

try {
  log(`=== self-upgrade start ${DRYRUN ? '(DRYRUN) ' : ''}===`);

  // 0. snapshot current state as the precise revert point
  git('add', '-A');
  git('commit', '-q', '-m', `pre-upgrade snapshot ${ts()}`); // no-op (nonzero) if nothing to commit
  const base = git('rev-parse', 'HEAD').stdout.trim();
  log(`base ${base}`);

  // 1. tooling update (deps; package-lock is tracked so it's revertable)
  if (!DRYRUN) { const r = npm(['update', '--no-audit', '--no-fund']); log(`npm update exit ${r.status}`); }

  // 2. self-improve via claude (no time cap)
  let summary = '(dryrun: no changes)';
  if (!DRYRUN) {
    let queue = '(no queue file)';
    try { queue = readFileSync(QUEUE, 'utf8'); } catch {}
    // First, sweep TODAY's owner<->Helm messages for tasks Helm declined or failed (bug / missing
    // capability) and queue them — so this run builds the fixes. The review feeds the same stuck queue
    // we read on the next line.
    try { const rv = sh(process.execPath, [path.join(__dirname, 'review-day.mjs')], { timeout: 60_000 }); log(`daily review: ${(rv.stdout || '').trim().split('\n').pop() || 'done'}`); } catch (e) { log('daily review skipped: ' + (e?.message || e)); }
    const stuck = renderStuckForPrompt();
    const prompt = [
      `You are Helm performing your scheduled NIGHTLY SELF-UPGRADE on your own codebase at ${ROOT}.`,
      '',
      'HARD CONSTRAINTS (violating any = failure):',
      `- Work ONLY inside ${ROOT}. Respect any off-limits paths/projects the owner named in @owner.md; never reach into unrelated projects.`,
      '- Both bots MUST stay startable. After editing index.js or imessage.js run `node --check` on each.',
      '- Do NOT edit .env, do NOT delete owner data (drills/, memory/, sessions.db), do NOT spend money, do NOT install global software.',
      '- A smoke test (node workspace/tests/smoke.mjs) runs after you finish. If it fails, ALL changes auto-revert. Keep it green; never weaken tests to cheat.',
      '',
      'TASKS tonight, in priority order:',
      '1. STUCK QUEUE (highest priority): these are real things Helm got stuck on in daily use. For each, fix the ROOT CAUSE — add the missing capability, handle the error, or remove the limitation — not a band-aid. If an item is too big for one night, do a solid first step.',
      '2. Implement pending items in workspace/upgrades/QUEUE.md; mark each done as you finish it.',
      '3. Fix bugs (see workspace/upgrades/BUGS_REPORT.md).',
      '4. Small, safe, high-value improvements aligned with workspace/upgrades/PLAN.md. Prefer finishing started work over starting new.',
      '5. OPTIMISE & VERIFY: re-check everything you touched still works, tighten/clean up what you added (no dead code, no half-done edges), and confirm `node --check` + the smoke suite pass before you finish.',
      '',
      'Keep changes focused and reversible. Then WRITE A SMALL REPORT (<200 words, no emojis, no preamble): ' +
      'which stuck-queue/can\'t-do items you resolved, what you optimised, and anything still open for next time. ' +
      'This report is saved to workspace/upgrades/UPGRADE_LOG.md and sent to the owner.',
      '',
      '--- STUCK QUEUE (things Helm got stuck on; fix root causes) ---',
      stuck || '(empty — nothing got stuck recently)',
      '',
      '--- QUEUE.md ---',
      queue,
    ].join('\n');
    log('running claude self-improvement (up to ~4.5h; nightly 00:00-05:00 window)...');
    const cl = spawnSync(CLAUDE_BIN, [
      '-p', '--output-format', 'json', '--model', MODEL,
      '--permission-mode', 'bypassPermissions', '--add-dir', ROOT,
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    ], { cwd: ROOT, input: prompt, encoding: 'utf8', timeout: 270 * 60_000, maxBuffer: 256 * 1024 * 1024 });
    try { summary = (JSON.parse(cl.stdout).result || '').trim(); } catch { summary = (cl.stdout || cl.stderr || '').trim().slice(-1500); }
    log(`claude exit ${cl.status}`);
  }

  // 3. gate: node --check + smoke
  const syntaxOk = ['index.js', 'imessage.js'].every(f => sh(process.execPath, ['--check', f]).status === 0);
  let smokeOk = true;
  if (!SKIP_SMOKE) {
    const sm = sh(process.execPath, ['workspace/tests/smoke.mjs'], { timeout: 12 * 60_000 });
    smokeOk = sm.status === 0;
    log((sm.stdout || '').trim().split('\n').slice(-2).join(' '));
  }
  log(`syntax ${syntaxOk ? 'ok' : 'FAIL'}, smoke ${smokeOk ? 'pass' : 'FAIL'}`);

  if (!syntaxOk || !smokeOk) { rollback(base, !syntaxOk ? 'syntax' : 'smoke', summary); process.exit(0); }

  // 4. commit improvements
  git('add', '-A');
  git('commit', '-q', '-m', `self-upgrade ${ts()}`);
  const head = git('rev-parse', 'HEAD').stdout.trim();
  const changed = head !== base;
  log(`head ${head}${changed ? '' : ' (no changes)'}`);

  // 5. restart + health-check; roll back if unhealthy
  if (!restartAndHealth()) { rollback(base, 'unhealthy after restart', summary); process.exit(0); }

  // 5b. push the upgrade to origin so it's backed up / pullable. (Single machine — no peer to sync.)
  if (changed && !DRYRUN) {
    const pushed = git('push', 'origin', 'HEAD:main').status === 0;
    log(`push origin ${pushed ? 'ok' : 'FAIL (will retry next run)'}`);
  }

  // Clear the stuck queue once changes are applied and healthy (kept if nothing changed, so it retries).
  const archived = (changed && !DRYRUN) ? archiveAll() : 0;
  if (archived) log(`archived ${archived} stuck item(s) addressed this run`);

  appendHistory(changed ? `APPLIED ${head.slice(0, 7)}` : 'NO CHANGES', base, head, summary);
  notify(`Helm self-upgrade ${changed ? `applied ${head.slice(0, 7)}` : 'ran (no changes)'}${archived ? `, cleared ${archived} stuck item(s)` : ''}. ${summary.slice(0, 800)}`);
  log('=== self-upgrade done ===');
} catch (e) {
  log('FATAL: ' + (e.stack || e.message));
  notify('Helm self-upgrade crashed: ' + (e.message || e));
}
