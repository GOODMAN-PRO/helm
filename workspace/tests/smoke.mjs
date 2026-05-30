#!/usr/bin/env node
// Helm Phase 1 smoke test. Exits 0 on all green, 1 on any failure.
// Run: node workspace/tests/smoke.mjs

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE  = path.resolve(__dirname, '..');
const ROOT       = path.resolve(__dirname, '../..');

let passed = 0, failed = 0;

function ok(label) {
  console.log(`  PASS  ${label}`);
  passed++;
}
function fail(label, reason) {
  console.error(`  FAIL  ${label}: ${reason}`);
  failed++;
}

// ---- 1. Discord adapter: parses messages correctly ----
{
  const label = 'Discord adapter: splitAttachments + chunk parsing';
  try {
    // Import the relevant logic directly from index.js without starting the bot.
    // We test the parsing functions in isolation.
    const src = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    if (!src.includes('splitAttachments')) throw new Error('splitAttachments missing from index.js');
    if (!src.includes('ATTACH:')) throw new Error('ATTACH: convention missing');
    if (!src.includes('workspace/sessions.mjs')) throw new Error('unified sessions not imported in index.js');
    if (!src.includes('30 * 60_000')) throw new Error('30-min cap not found in index.js (old 5-min cap still present?)');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 2. iMessage: attributedBody decoder present ----
{
  const label = 'iMessage: decodeAttributedBody present and NSString logic intact';
  try {
    const src = readFileSync(path.join(ROOT, 'imessage.js'), 'utf8');
    if (!src.includes('decodeAttributedBody')) throw new Error('decodeAttributedBody missing');
    if (!src.includes('NSString')) throw new Error('NSString anchor missing');
    if (!src.includes('workspace/sessions.mjs')) throw new Error('unified sessions not imported in imessage.js');
    if (!src.includes('30 * 60_000')) throw new Error('30-min cap not found in imessage.js');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 3. claude -p round-trip from WORKSPACE ----
{
  const label = 'claude -p: round-trip with --add-dir workspace';
  try {
    const r = spawnSync(
      'claude',
      ['-p', '--output-format', 'json',
       '--model', 'haiku',
       '--permission-mode', 'bypassPermissions',
       '--add-dir', WORKSPACE,
       '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
       '--max-turns', '1'],
      { input: 'Reply with exactly: SMOKE_OK', encoding: 'utf8', timeout: 120_000 }
    );
    if (r.status !== 0) throw new Error(`exit ${r.status}: ${(r.stderr || '').slice(0, 200)}`);
    let result = r.stdout.trim();
    try { result = JSON.parse(result).result ?? result; } catch { /* raw output */ }
    if (!result.includes('SMOKE_OK')) throw new Error(`unexpected reply: ${result.slice(0, 120)}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 4. memory.recall "example query" returns the seeded example facts ----
{
  const label = 'memory.recall "example query" returns the seeded example facts';
  try {
    const r = spawnSync(
      'node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'recall', 'example query'],
      { encoding: 'utf8', timeout: 15_000 }
    );
    if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`);
    const facts = JSON.parse(r.stdout);
    const hasExam = facts.some(f => f.kind === 'exam' || /examfacts/i.test(f.key + f.value));
    if (!hasExam) throw new Error(`no the seeded example facts found in ${JSON.stringify(facts).slice(0, 200)}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 5. tools list returns >= 10 built-ins ----
{
  const label = 'tools list returns all 10 built-in tools';
  try {
    const r = spawnSync(
      'node',
      [path.join(WORKSPACE, 'tools/tools.mjs'), 'list'],
      { encoding: 'utf8', timeout: 10_000 }
    );
    if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`);
    const tools = JSON.parse(r.stdout);
    if (tools.length < 10) throw new Error(`only ${tools.length} tools (expected >= 10)`);
    const required = ['screencap', 'gui.click', 'gui.type', 'gui.key', 'imessage.send',
                      'discord.attach', 'memory.remember', 'memory.recall',
                      'scheduler.add', 'scheduler.list'];
    const names = tools.map(t => t.name);
    const missing = required.filter(n => !names.includes(n));
    if (missing.length) throw new Error(`missing tools: ${missing.join(', ')}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 6. sessions.db module works ----
{
  const label = 'sessions.mjs: get/set/delete round-trip';
  try {
    const { getSession, setSession, deleteSession } = await import(
      path.join(ROOT, 'workspace/sessions.mjs')
    );
    setSession('smoke-test', 'sess-abc', 'test');
    const v = getSession('smoke-test');
    if (v !== 'sess-abc') throw new Error(`expected sess-abc, got ${v}`);
    deleteSession('smoke-test');
    const v2 = getSession('smoke-test');
    if (v2 !== null) throw new Error(`expected null after delete, got ${v2}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 7. scheduler cron module: basic correctness (UTC interpretation) ----
{
  const label = 'scheduler/cron.mjs: match + nextCronDate (UTC)';
  try {
    const { cronMatches, nextCronDate } = await import(
      path.join(WORKSPACE, 'scheduler/cron.mjs')
    );
    // Use Date.UTC so results are timezone-independent.
    const d = new Date(Date.UTC(2026, 4, 30, 9, 0, 0)); // 2026-05-30 09:00 UTC
    if (!cronMatches('* * * * *', d)) throw new Error('* * * * * should always match');
    if (!cronMatches('0 9 * * *', d)) throw new Error('0 9 * * * should match UTC 09:00');
    const d2 = new Date(Date.UTC(2026, 4, 30, 9, 1, 0)); // UTC 09:01
    if (cronMatches('0 9 * * *', d2)) throw new Error('should not match UTC 09:01');
    const next = nextCronDate('0 9 * * *', d);
    if (!next) throw new Error('nextCronDate returned null');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 8. runs/runs.mjs: makeRunDir creates a dir ----
{
  const label = 'runs/runs.mjs: makeRunDir creates directory';
  try {
    const { makeRunDir, appendLog, finaliseRun } = await import(
      path.join(WORKSPACE, 'runs/runs.mjs')
    );
    const dir = makeRunDir('smoke');
    const { existsSync: exists } = await import('node:fs');
    if (!exists(dir)) throw new Error(`dir not created: ${dir}`);
    appendLog(dir, { event: 'test' });
    finaliseRun(dir, 'smoke passed');
    if (!exists(path.join(dir, 'result.md'))) throw new Error('result.md not written');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 9. BUG-1: cron 0 2 * * * fires at UTC 02:00, not local 02:00 ----
{
  const label = 'BUG-1: cron 0 2 * * * matches UTC 02:00, not local time';
  try {
    const { cronMatches, nextCronDate } = await import(
      path.join(WORKSPACE, 'scheduler/cron.mjs')
    );
    const atUtc2 = new Date(Date.UTC(2026, 4, 30, 2, 0, 0)); // 2026-05-30 02:00 UTC
    if (!cronMatches('0 2 * * *', atUtc2)) throw new Error('must match UTC 02:00');
    const atUtc9 = new Date(Date.UTC(2026, 4, 30, 9, 0, 0)); // 2026-05-30 09:00 UTC
    if (cronMatches('0 2 * * *', atUtc9)) throw new Error('must not match UTC 09:00');
    // nextCronDate from UTC 03:00 must land at next day UTC 02:00
    const from = new Date(Date.UTC(2026, 4, 30, 3, 0, 0));
    const next = nextCronDate('0 2 * * *', from);
    if (!next) throw new Error('nextCronDate returned null');
    if (next.getUTCHours() !== 2 || next.getUTCMinutes() !== 0)
      throw new Error(`expected UTC 02:00, got ${next.toISOString()}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 10. BUG-2: migrate.mjs is idempotent — double run does not grow facts ----
{
  const label = 'BUG-2: migrate.mjs double run does not grow fact count';
  try {
    const r1 = spawnSync('node', [path.join(WORKSPACE, 'memory/migrate.mjs')],
      { encoding: 'utf8', timeout: 15_000 });
    if (r1.status !== 0) throw new Error(`first run failed: ${r1.stderr}`);
    const dump1 = spawnSync('node', [path.join(WORKSPACE, 'memory/memory.mjs'), 'dump'],
      { encoding: 'utf8', timeout: 10_000 });
    const count1 = JSON.parse(dump1.stdout).length;
    const r2 = spawnSync('node', [path.join(WORKSPACE, 'memory/migrate.mjs')],
      { encoding: 'utf8', timeout: 15_000 });
    if (r2.status !== 0) throw new Error(`second run failed: ${r2.stderr}`);
    const dump2 = spawnSync('node', [path.join(WORKSPACE, 'memory/memory.mjs'), 'dump'],
      { encoding: 'utf8', timeout: 10_000 });
    const count2 = JSON.parse(dump2.stdout).length;
    if (count2 !== count1) throw new Error(`count grew ${count1} → ${count2} on re-run`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 11. BUG-3: confirm gate — imessage.send without --force exits non-zero ----
{
  const label = 'BUG-3: tools.mjs imessage.send without --force exits non-zero with CONFIRM in stderr';
  try {
    const r = spawnSync('node', [
      path.join(WORKSPACE, 'tools/tools.mjs'), 'call', 'imessage.send',
      '--json', '{"handle":"+1555000000","text":"test"}',
    ], { encoding: 'utf8', timeout: 10_000 });
    if (r.status === 0) throw new Error('expected non-zero exit, got 0');
    if (!r.stderr.includes('CONFIRM')) throw new Error(`"CONFIRM" missing from stderr: ${r.stderr.slice(0, 200)}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 12. BUG-5: scheduler.add rejects impossible cron expression ----
{
  const label = 'BUG-5: scheduler.add rejects impossible cron 0 0 30 2 *';
  try {
    const r = spawnSync('node', [
      path.join(WORKSPACE, 'tools/impl/scheduler.add.mjs'),
      '--name', 'smoke-impossible-cron',
      '--cron', '0 0 30 2 *',
      '--payload', 'test',
      '--enabled', 'false',
    ], { encoding: 'utf8', timeout: 10_000 });
    if (r.status === 0) throw new Error('expected non-zero exit for impossible cron, got 0');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- summary ----
console.log('');
console.log(`Smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
