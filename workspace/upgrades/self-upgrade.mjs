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
import { existsSync, writeFileSync, appendFileSync, readFileSync, rmSync } from 'node:fs';
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
const git = (...a) => sh('git', ['-c', 'user.name=Helm', '-c', 'user.email=helm@localhost', ...a]);
const notify = msg => { try { sh(process.execPath, [path.join(ROOT, 'bin', 'helm-push.mjs'), msg]); } catch {} };

function restartAndHealth() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  // Track how much of the log pre-dates this restart so stale "Helm online" text
  // from a previous boot isn't accepted as a successful health check.
  let prevLen = 0;
  try {
    writeFileSync(AGENT_LOG, '');
  } catch {
    try { prevLen = readFileSync(AGENT_LOG, 'utf8').length; } catch {}
  }
  // Cap the launchctl call so a hung daemon doesn't stall the upgrade forever.
  sh('launchctl', ['kickstart', '-k', `gui/${uid}/com.helm.discord`], { timeout: 15_000 });
  const start = Date.now();
  while (Date.now() - start < 30_000) {
    try {
      const content = readFileSync(AGENT_LOG, 'utf8');
      if (content.slice(prevLen).includes('Helm online')) return true;
    } catch {}
    sh('sleep', ['2']);
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
  sh('npm', ['ci', '--no-audit', '--no-fund'], { timeout: 5 * 60_000 }); // resync node_modules to restored lock
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
  if (!DRYRUN) { const r = sh('npm', ['update', '--no-audit', '--no-fund'], { timeout: 5 * 60_000 }); log(`npm update exit ${r.status}`); }

  // 2. self-improve via claude (no time cap)
  let summary = '(dryrun: no changes)';
  if (!DRYRUN) {
    let queue = '(no queue file)';
    try { queue = readFileSync(QUEUE, 'utf8'); } catch {}
    const stuck = renderStuckForPrompt();
    const prompt = [
      'You are Helm performing your scheduled NIGHTLY SELF-UPGRADE on your own codebase at /Users/owner/secondme.',
      '',
      'HARD CONSTRAINTS (violating any = failure):',
      '- Work ONLY inside /Users/owner/secondme. NEVER touch ~/helm, the Helm Supabase project, or com.helm.agent — that is a SEPARATE project and is strictly off-limits.',
      '- Both bots MUST stay startable. After editing index.js or imessage.js run `node --check` on each.',
      '- Do NOT edit .env, do NOT delete owner data (drills/, memory/, sessions.db), do NOT spend money, do NOT install global software.',
      '- A smoke test (node workspace/tests/smoke.mjs) runs after you finish. If it fails, ALL changes auto-revert. Keep it green; never weaken tests to cheat.',
      '',
      'TASKS tonight, in priority order:',
      '1. STUCK QUEUE (highest priority): these are real things Helm got stuck on in daily use. For each, fix the ROOT CAUSE — add the missing capability, handle the error, or remove the limitation — not a band-aid. If an item is too big for one night, do a solid first step.',
      '2. Implement pending items in workspace/upgrades/QUEUE.md; mark each done as you finish it.',
      '3. Fix bugs (see workspace/upgrades/BUGS_REPORT.md).',
      '4. Small, safe, high-value improvements aligned with workspace/upgrades/PLAN.md. Prefer finishing started work over starting new.',
      '',
      'Keep changes focused and reversible. Output a concise summary (<400 words) of what you changed and why. No emojis, no preamble.',
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
  const syntaxOk = ['index.js', 'imessage.js'].every(f => sh('node', ['--check', f]).status === 0);
  let smokeOk = true;
  if (!SKIP_SMOKE) {
    const sm = sh('node', ['workspace/tests/smoke.mjs'], { timeout: 12 * 60_000 });
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
