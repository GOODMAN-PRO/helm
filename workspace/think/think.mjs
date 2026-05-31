#!/usr/bin/env node
// Helm — 24/7 background cognition.
//
// Wakes every THINK_INTERVAL_MIN (default 15), runs a short reflection pass that does ACTIVE
// LEARNING: infers/refines the owner's preferences over time, notes durable facts, preps useful
// work — then journals and refreshes the memory index. Stays owner-quiet (exam season). Skips the
// nightly upgrade window (00:00-05:00) and never overlaps itself or a running self-upgrade.
//
// Launched by launchd com.helm.think. Uses a light model (sonnet) so 24/7 cadence stays sustainable.

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, appendFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // workspace/think
const WORKSPACE = path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '../..');
loadEnv({ path: path.join(ROOT, '.env') });

const { CLAUDE_BIN = 'claude' } = process.env;
const MODEL = process.env.THINK_MODEL || 'sonnet';
const INTERVAL = parseInt(process.env.THINK_INTERVAL_MIN || '15', 10) * 60_000;
const WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
// Safety guards: exit after MAX_TICKS iterations or MAX_WALL_MS wall time so launchd can restart fresh.
const MAX_TICKS    = parseInt(process.env.THINK_MAX_TICKS || '500', 10);
const MAX_WALL_MS  = parseInt(process.env.THINK_MAX_WALL_DAYS || '8', 10) * 24 * 60 * 60_000;
const THINK_START  = Date.now();
const JOURNAL_DIR = path.join(__dirname, 'journal');
const THINK_LOCK = path.join(__dirname, '.think.lock');
const UPGRADE_LOCK = path.join(ROOT, '.upgrade.lock');
const REFRESH = path.join(WORKSPACE, 'memory', 'refresh-index.mjs');
const CONSOLIDATE = path.join(WORKSPACE, 'memory', 'consolidate.mjs');
const WEEKLY_MARK = path.join(__dirname, '.last-weekly-review');
// Local time intentional — aligns with launchd's local-time StartCalendarInterval used by
// com.helm.selfupgrade and com.helm.discord. Window follows owner's overnight on whichever
// machine Helm is running on.
const THINK_QUIET_START = 0; // 00:00 local
const THINK_QUIET_END   = 5; // 05:00 local
mkdirSync(JOURNAL_DIR, { recursive: true });

const ts = () => new Date().toISOString();
const log = m => console.log(`[think] ${ts()} ${m}`);

const CHEAP_PROMPT = [
  'You are Helm THINKING IN THE BACKGROUND. No one is watching this run.',
  'Do NOT message the owner unless something is genuinely urgent — default to quiet, no noise.',
  'You can read your memory (`node workspace/memory/memory.mjs recall <q>` / `dump`), recent episodes, your workspace, and the whole Mac.',
  '',
  'Keep this tick SHORT and cheap (you run every ~15 min). Each tick:',
  '1. ACTIVE LEARNING — READ today\'s transcript at workspace/conversations/<today>.md (and yesterday\'s). For any durable fact/preference the owner revealed, persist it AND mirror it into /Users/owner/HelmBrain/02 People/About Me.md so nothing said in chat is ever lost:',
  '   node workspace/memory/memory.mjs remember <kind> <stable-short-key> "<value>" --source observed --confidence 0.6',
  '   (preferences use kind=preference; reuse the same key to update in place — confidence only rises with independent repeats.)',
  '2. Notice anything worth preparing later (a drill, a reminder, a draft). If useful, prepare it in the workspace or add a DISABLED scheduler job. Do NOT ping the owner now.',
  '3. Do NOT make destructive changes, do NOT edit source code, do NOT spend money. NEVER touch ~/helm or the Helm project.',
  '',
  'Output ONE or TWO sentences: what you reflected on and any preference you updated. No emojis, no preamble.',
].join('\n');

const WEEKLY_PROMPT = [
  'You are Helm running your WEEKLY DEEP REVIEW (once every 7 days). Take a few extra minutes.',
  'Do NOT message the owner unless something is genuinely urgent.',
  '',
  'Inputs you should read first:',
  '- node workspace/memory/memory.mjs dump',
  '- node workspace/memory/memory.mjs episode (last 50 episodes)',
  '- node workspace/memory/memory.mjs unsure --threshold 0.7 (preferences with weak evidence)',
  '- this week\'s journal files under workspace/think/journal/ (last 7 dated *.md)',
  '',
  'Then, do exactly these things:',
  '1. Write 1–3 episodes summarising the week\'s recurring themes:',
  '   node workspace/memory/memory.mjs episode add "<one line>" --channel weekly-review',
  '2. LLM-CONSOLIDATE the last 7 days of episodes into durable facts. Read the episodes output',
  '   and for each distinct theme, entity, or pattern that appears in 2+ recent episodes, write it',
  '   as a learned fact so it survives beyond the rolling episode window:',
  '   node workspace/memory/memory.mjs remember learned <kebab-key> "<concise value summarising the pattern>"',
  '   Only write facts that are genuinely recurring — skip one-offs.',
  '3. For each LOW-CONFIDENCE preference you saw evidence for this week, re-assert it so',
  '   its evidence_count and confidence advance:',
  '   node workspace/memory/memory.mjs remember preference <key> "<value>" --source observed --confidence 0.75',
  '   For ones you have NO new evidence on, leave them — consolidation will decay them.',
  '4. If a recurring pattern would benefit from a scheduled job, propose it DISABLED only:',
  '   node workspace/tools/tools.mjs call scheduler.add --json \'{"name":"...","cron":"...","payload":"...","enabled":false}\'',
  '   Add at most ONE per week. Do not enable it — the owner reviews.',
  '5. Do NOT edit source code, do NOT spend money, NEVER touch ~/helm.',
  '',
  'Output 2-4 sentences: what you found, what you persisted, any job proposal. No emojis, no preamble.',
].join('\n');

function weeklyDue() {
  try {
    const last = parseInt(readFileSync(WEEKLY_MARK, 'utf8').trim(), 10);
    if (!Number.isFinite(last)) return true;
    return Date.now() - last >= WEEKLY_INTERVAL_MS;
  } catch { return true; }
}

function tick() {
  if (existsSync(UPGRADE_LOCK)) { log('self-upgrade running — skip'); return; }
  if (existsSync(THINK_LOCK)) {
    try {
      const lockedPid = parseInt(readFileSync(THINK_LOCK, 'utf8').trim(), 10);
      // kill(pid, 0) throws if the process is gone — that means a stale lock.
      process.kill(lockedPid, 0);
      log('previous think still running — skip');
      return;
    } catch {
      // Process is gone; stale lock left by crash or SIGKILL. Remove it and continue.
      try { rmSync(THINK_LOCK); } catch {}
      log('stale think lock removed, proceeding');
    }
  }
  const h = new Date().getHours();
  if (h >= THINK_QUIET_START && h < THINK_QUIET_END) { log('nightly upgrade window (00:00-05:00) — skip'); return; }

  const deep = weeklyDue();
  const prompt = deep ? WEEKLY_PROMPT : CHEAP_PROMPT;
  const timeout = (deep ? 25 : 10) * 60_000;
  writeFileSync(THINK_LOCK, String(process.pid));
  try {
    log(`tick start (${deep ? 'WEEKLY deep review' : 'cheap'})`);
    const r = spawnSync(CLAUDE_BIN, [
      '-p', '--output-format', 'json', '--model', MODEL,
      '--permission-mode', 'bypassPermissions', '--add-dir', ROOT,
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    ], { cwd: WORKSPACE, input: prompt, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 });

    let thought = '';
    try { thought = (JSON.parse(r.stdout).result || '').trim(); }
    catch { thought = (r.stdout || r.stderr || '').trim().slice(0, 400); }

    const tag = deep ? '[WEEKLY] ' : '';
    appendFileSync(path.join(JOURNAL_DIR, ts().slice(0, 10) + '.md'),
      `- ${ts()} ${tag}${(thought || '(no output)').replace(/\n+/g, ' ')}\n`);

    if (deep) {
      // Run consolidation immediately after the weekly review so any decay/dedupe
      // reflects the freshly-written episodes and preferences.
      try {
        const c = spawnSync('/usr/bin/env', ['node', CONSOLIDATE, '--since-days', '7'], { encoding: 'utf8', timeout: 60_000 });
        log('consolidate: ' + ((c.stdout || '').trim().slice(0, 200).replace(/\s+/g, ' ')));
      } catch (e) { log('consolidate error ' + (e.message || e)); }
      // Only stamp the weekly mark when claude actually completed successfully.
      // If it timed out (r.signal === 'SIGTERM') or exited non-zero, leave the mark
      // untouched so the review is retried next tick rather than suppressed for 7 days.
      if (r.status === 0 && !r.signal) {
        try { writeFileSync(WEEKLY_MARK, String(Date.now())); } catch {}
      } else {
        log(`weekly review did not complete (status=${r.status} signal=${r.signal}) — mark not updated`);
      }
    }

    spawnSync('/usr/bin/env', ['node', REFRESH], { cwd: ROOT, encoding: 'utf8' });
    log('thought logged + index refreshed');
  } catch (e) {
    log('error ' + (e.message || e));
  } finally {
    try { rmSync(THINK_LOCK); } catch {}
  }
}

log(`background cognition online (every ${INTERVAL / 60_000} min, model ${MODEL}, maxTicks=${MAX_TICKS})`);
let tickCount = 0;
tick();
const thinkInterval = setInterval(() => {
  tick();
  tickCount++;
  if (tickCount >= MAX_TICKS || (Date.now() - THINK_START) >= MAX_WALL_MS) {
    log(`guard: maxTicks=${MAX_TICKS} or maxWall reached (ticks=${tickCount}) — exiting for launchd restart`);
    clearInterval(thinkInterval);
    try { rmSync(THINK_LOCK); } catch {}
    process.exit(0);
  }
}, INTERVAL);
process.on('SIGTERM', () => { clearInterval(thinkInterval); try { rmSync(THINK_LOCK); } catch {} process.exit(0); });
process.on('SIGINT',  () => { clearInterval(thinkInterval); try { rmSync(THINK_LOCK); } catch {} process.exit(0); });
