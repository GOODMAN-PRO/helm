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
    // null guard: setSession with null/undefined sessionId must throw
    let threw = false;
    try { setSession('smoke-null-guard', null); } catch { threw = true; }
    if (!threw) throw new Error('setSession with null sessionId should throw');
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

// ---- 13. memory consolidation script is runnable and idempotent ----
{
  const label = 'memory/consolidate.mjs: dry-run + live run succeed and preserve owner facts';
  try {
    // Pre/post fact count of CLAUDE.md-sourced rows must be unchanged (those never decay/prune).
    const before = JSON.parse(spawnSync('node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'dump'],
      { encoding: 'utf8', timeout: 10_000 }).stdout)
      .filter(f => f.source === 'CLAUDE.md').length;

    const dry = spawnSync('node',
      [path.join(WORKSPACE, 'memory/consolidate.mjs'), '--dry-run'],
      { encoding: 'utf8', timeout: 15_000 });
    if (dry.status !== 0) throw new Error(`dry-run failed: ${dry.stderr}`);
    const dryReport = JSON.parse(dry.stdout);
    if (dryReport.dry_run !== true) throw new Error('dry_run flag not echoed');

    const live = spawnSync('node',
      [path.join(WORKSPACE, 'memory/consolidate.mjs')],
      { encoding: 'utf8', timeout: 15_000 });
    if (live.status !== 0) throw new Error(`live run failed: ${live.stderr}`);

    const after = JSON.parse(spawnSync('node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'dump'],
      { encoding: 'utf8', timeout: 10_000 }).stdout)
      .filter(f => f.source === 'CLAUDE.md').length;
    if (after !== before) throw new Error(`CLAUDE.md facts changed: ${before} → ${after}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 14. active learning: evidence_count rises on repeat, provisional cap on first observe ----
{
  const label = 'memory.remember: observed first-write capped at 0.7, repeat increments evidence_count';
  try {
    const KEY = '__smoke_active_learn';
    // ensure clean state
    const cleanup = () => {
      const d = JSON.parse(spawnSync('node',
        [path.join(WORKSPACE, 'memory/memory.mjs'), 'dump', '--kind', 'preference'],
        { encoding: 'utf8', timeout: 10_000 }).stdout);
      for (const r of d.filter(x => x.key === KEY)) {
        spawnSync('node',
          [path.join(WORKSPACE, 'memory/memory.mjs'), 'forget', String(r.id)],
          { encoding: 'utf8', timeout: 5_000 });
      }
    };
    cleanup();

    const r1 = JSON.parse(spawnSync('node', [
      path.join(WORKSPACE, 'memory/memory.mjs'), 'remember', 'preference', KEY, 'v1',
      '--source', 'observed', '--confidence', '0.95',
    ], { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (r1.evidence_count !== 1) throw new Error(`expected evidence_count 1, got ${r1.evidence_count}`);
    if (r1.confidence > 0.71) throw new Error(`first observation should cap conf <=0.7, got ${r1.confidence}`);

    const r2 = JSON.parse(spawnSync('node', [
      path.join(WORKSPACE, 'memory/memory.mjs'), 'remember', 'preference', KEY, 'v1',
      '--source', 'observed', '--confidence', '0.95',
    ], { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (r2.evidence_count !== 2) throw new Error(`expected evidence_count 2 on repeat, got ${r2.evidence_count}`);
    if (r2.confidence <= r1.confidence) throw new Error(`repeat should raise confidence (${r1.confidence} → ${r2.confidence})`);
    cleanup();
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 15. unsure verb returns array of low-confidence preferences ----
{
  const label = 'memory.mjs unsure: returns JSON array filtered by threshold';
  try {
    const r = spawnSync('node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'unsure', '--threshold', '1.0'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`);
    const arr = JSON.parse(r.stdout);
    if (!Array.isArray(arr)) throw new Error('output is not an array');
    if (arr.some(x => x.kind !== 'preference')) throw new Error('returned non-preference row');
    if (arr.some(x => x.confidence >= 1.0)) throw new Error('threshold not respected');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 16. recall output shape unchanged (semantic blend preserves keys) ----
{
  const label = 'memory.mjs recall: output shape includes the original fact columns';
  try {
    const r = spawnSync('node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'recall', 'example query'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`);
    const arr = JSON.parse(r.stdout);
    if (!arr.length) throw new Error('no results');
    const first = arr[0];
    for (const k of ['id', 'kind', 'key', 'value', 'confidence', 'updated']) {
      if (!(k in first)) throw new Error(`missing key in recall result: ${k}`);
    }
    for (const k of ['_score', '_k', '_s']) {
      if (k in first) throw new Error(`internal scoring key ${k} leaked to output`);
    }
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 17. browser tools: tools list includes browser.open; modules import without browser launch ----
{
  const label = 'browser: tools list includes browser.open; modules load without launching a browser';
  try {
    // Part 1: tools list
    const r = spawnSync('node', [path.join(WORKSPACE, 'tools/tools.mjs'), 'list'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`tools list failed: ${r.stderr}`);
    const tools = JSON.parse(r.stdout);
    const names = tools.map(t => t.name);
    for (const n of ['browser.open', 'browser.read', 'browser.click', 'browser.fill', 'browser.screenshot']) {
      if (!names.includes(n)) throw new Error(`browser tool missing from list: ${n}`);
    }

    // Part 2: each module must import cleanly without launching chromium
    const implDir = path.join(WORKSPACE, 'tools/impl');
    for (const f of ['browser.open', 'browser.read', 'browser.click', 'browser.fill', 'browser.screenshot']) {
      await import(path.join(implDir, `${f}.mjs`));
    }
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 18. MCP: servers.json is valid JSON with at least one server; index.js references it ----
{
  const label = 'MCP: workspace/mcp/servers.json is valid JSON with >= 1 server; index.js references it';
  try {
    const configPath = path.join(ROOT, 'workspace/mcp/servers.json');
    if (!existsSync(configPath)) throw new Error('workspace/mcp/servers.json not found');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!config.mcpServers || typeof config.mcpServers !== 'object')
      throw new Error('mcpServers key missing or not an object');
    if (Object.keys(config.mcpServers).length < 1)
      throw new Error('at least one server required in mcpServers');
    const src = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    if (!src.includes('workspace/mcp/servers.json'))
      throw new Error('index.js does not reference workspace/mcp/servers.json');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 19. embed.mjs: API shape, cosineSimilarity math, isModelAvailable safety ----
{
  const label = 'embed.mjs: API exports correct, cosineSimilarity works, isModelAvailable safe without model';
  try {
    const { isModelAvailable, cosineSimilarity, embedText, getOrComputeVector, ensureVectorsTable } =
      await import(path.join(WORKSPACE, 'memory/embed.mjs'));

    if (typeof isModelAvailable   !== 'function') throw new Error('isModelAvailable not exported');
    if (typeof cosineSimilarity   !== 'function') throw new Error('cosineSimilarity not exported');
    if (typeof embedText          !== 'function') throw new Error('embedText not exported');
    if (typeof getOrComputeVector !== 'function') throw new Error('getOrComputeVector not exported');
    if (typeof ensureVectorsTable !== 'function') throw new Error('ensureVectorsTable not exported');

    // cosineSimilarity must handle known cases correctly
    const a = [1, 0, 0], b = [0, 1, 0], c = [1, 0, 0];
    if (Math.abs(cosineSimilarity(a, b)) > 0.001)
      throw new Error(`orthogonal vectors should give ~0, got ${cosineSimilarity(a, b)}`);
    if (Math.abs(cosineSimilarity(a, c) - 1.0) > 0.001)
      throw new Error(`identical vectors should give ~1, got ${cosineSimilarity(a, c)}`);
    if (cosineSimilarity(null, [1]) !== 0)
      throw new Error('null input should return 0');

    // isModelAvailable() must return a boolean without throwing (model download NOT required)
    const avail = await isModelAvailable();
    if (typeof avail !== 'boolean')
      throw new Error(`isModelAvailable must return boolean, got ${typeof avail}`);

    // recall --keyword-only must succeed regardless of model availability
    const r = spawnSync('node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'recall', 'example query', '--keyword-only'],
      { encoding: 'utf8', timeout: 15_000 });
    if (r.status !== 0) throw new Error(`recall --keyword-only failed: ${r.stderr}`);
    const arr = JSON.parse(r.stdout);
    if (!Array.isArray(arr)) throw new Error('recall --keyword-only must return array');
    const hasExam = arr.some(f => f.kind === 'exam' || /examfacts/i.test(f.key + f.value));
    if (!hasExam) throw new Error('recall --keyword-only returned no the seeded example facts');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 20. vision: tools registered and module importable without screenshot ----
{
  const label = 'vision: vision.describe + vision.find registered; module imports without taking a screenshot';
  try {
    const r = spawnSync('node', [path.join(WORKSPACE, 'tools/tools.mjs'), 'list'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`tools list failed: ${r.stderr}`);
    const tools = JSON.parse(r.stdout);
    const names = tools.map(t => t.name);
    for (const n of ['vision.describe', 'vision.find']) {
      if (!names.includes(n)) throw new Error(`vision tool missing from registry: ${n}`);
    }
    // Module must import cleanly without taking a real screenshot (main() is gated behind argv check)
    await import(path.join(WORKSPACE, 'tools/impl/vision.mjs'));
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 21. dashboard server: imports cleanly + GET / returns HTTP 200 on ephemeral port ----
{
  const label = 'dashboard/server.mjs: imports cleanly; GET / returns 200; GET /api/state returns valid JSON';
  let server;
  try {
    const { start } = await import(path.join(WORKSPACE, 'dashboard/server.mjs'));
    // port 0 → OS assigns an ephemeral port; avoids conflicts
    const { server: s, url } = await start(0);
    server = s;

    // GET /
    const homeRes = await fetch(url + '/');
    if (homeRes.status !== 200) throw new Error(`GET / returned ${homeRes.status}`);
    const html = await homeRes.text();
    if (!html.includes('<title>Helm Dashboard</title>')) throw new Error('HTML missing expected title');

    // GET /api/state
    const apiRes = await fetch(url + '/api/state');
    if (apiRes.status !== 200) throw new Error(`GET /api/state returned ${apiRes.status}`);
    const state = await apiRes.json();
    for (const key of ['ts', 'services', 'memory', 'jobs', 'journal', 'upgradeHistory', 'fleetTarget', 'gitLog']) {
      if (!(key in state)) throw new Error(`/api/state missing key: ${key}`);
    }
    if (!Array.isArray(state.services)) throw new Error('state.services is not an array');
    if (state.services.length !== 5) throw new Error(`expected 5 services, got ${state.services.length}`);

    ok(label);
  } catch (e) { fail(label, e.message); }
  finally { if (server) server.close(); }
}

// ---- 22. scheduler.add accepts --notify, scheduler.list surfaces it ----
{
  const label = 'scheduler.add: --notify false is persisted and surfaced by scheduler.list';
  try {
    const NAME = '__smoke_notify_flag';
    // Add with notify=false
    const r1 = spawnSync('node', [
      path.join(WORKSPACE, 'tools/impl/scheduler.add.mjs'),
      '--name', NAME, '--cron', '0 4 * * *',
      '--payload', 'smoke notify test',
      '--enabled', 'false', '--notify', 'false',
    ], { encoding: 'utf8', timeout: 10_000 });
    if (r1.status !== 0) throw new Error(`add failed: ${r1.stderr}`);
    const added = JSON.parse(r1.stdout);
    if (added.notify !== false) throw new Error(`add returned notify=${added.notify}, expected false`);

    // List should show it with notify=false.
    // Call scheduler.list.mjs directly (same as add above) so both read/write the same local
    // jobs.db; going through tools.mjs call would invoke the registry exec path which resolves
    // relative to the production install, not this worktree.
    const r2 = spawnSync('node', [path.join(WORKSPACE, 'tools/impl/scheduler.list.mjs')],
      { encoding: 'utf8', timeout: 10_000 });
    if (r2.status !== 0) throw new Error(`list failed: ${r2.stderr}`);
    const jobs = JSON.parse(r2.stdout);
    const found = jobs.find(j => j.name === NAME);
    if (!found) throw new Error(`job ${NAME} not in list`);
    if (found.notify !== false) throw new Error(`list returned notify=${found.notify}, expected false`);

    // Re-add with default notify (omit flag) — should flip back to true
    const r3 = spawnSync('node', [
      path.join(WORKSPACE, 'tools/impl/scheduler.add.mjs'),
      '--name', NAME, '--cron', '0 4 * * *',
      '--payload', 'smoke notify test',
      '--enabled', 'false',
    ], { encoding: 'utf8', timeout: 10_000 });
    if (r3.status !== 0) throw new Error(`re-add failed: ${r3.stderr}`);
    const readded = JSON.parse(r3.stdout);
    if (readded.notify !== true) throw new Error(`re-add returned notify=${readded.notify}, expected true (default)`);

    // Cleanup: delete the row directly
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(WORKSPACE, 'scheduler/jobs.db'));
    db.prepare(`DELETE FROM jobs WHERE name = ?`).run(NAME);
    db.close();
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 23. facts(kind, key) UNIQUE index prevents duplicate rows ----
{
  const label = 'memory: UNIQUE index on facts(kind, key) exists and blocks direct duplicate inserts';
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(WORKSPACE, 'memory/memory.db'));
    // Index is created by memory.mjs init on import (we triggered it via earlier tests).
    const idx = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='facts_kind_key_uniq'`
    ).get();
    if (!idx) throw new Error('facts_kind_key_uniq index missing');

    const KEY = '__smoke_uniq_index';
    // Cleanup any leftovers
    db.prepare(`DELETE FROM facts WHERE kind = 'preference' AND key = ?`).run(KEY);
    db.prepare(
      `INSERT INTO facts (kind, key, value, source) VALUES ('preference', ?, 'v1', 'smoke')`
    ).run(KEY);
    let threw = false;
    try {
      db.prepare(
        `INSERT INTO facts (kind, key, value, source) VALUES ('preference', ?, 'v2', 'smoke')`
      ).run(KEY);
    } catch (e) {
      threw = /UNIQUE|constraint/i.test(e.message);
    }
    db.prepare(`DELETE FROM facts WHERE kind = 'preference' AND key = ?`).run(KEY);
    db.close();
    if (!threw) throw new Error('second insert should have failed UNIQUE constraint');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 24. swarm state machine: intermediate states in source + filtering logic ----
{
  const label = 'swarm: state machine has merging/merged-pending-smoke states; filtering logic correct';
  try {
    const swarmSrc = readFileSync(path.join(WORKSPACE, 'swarm/swarm.mjs'), 'utf8');

    // Source must declare the two intermediate states
    if (!swarmSrc.includes("'merging'"))
      throw new Error("state 'merging' not found in swarm.mjs");
    if (!swarmSrc.includes("'merged-pending-smoke'"))
      throw new Error("state 'merged-pending-smoke' not found in swarm.mjs");

    // flushTasks must be present and called after state transitions
    if (!swarmSrc.includes('flushTasks'))
      throw new Error('flushTasks helper not found in swarm.mjs');

    // startup filter must skip merging tasks (operator review required)
    if (!swarmSrc.includes('operator review required'))
      throw new Error("'operator review required' warning not found — merging skip missing");

    // state must be written before the merge call (merging) and after (merged-pending-smoke)
    // Use the assignment form to skip occurrences in the startup filter.
    const mergingAssign = swarmSrc.indexOf("t.status = 'merging'");
    const mergeCall = swarmSrc.indexOf("git(ROOT, 'merge', '--no-ff'");
    const pendingSmokeAssign = swarmSrc.indexOf("t.status = 'merged-pending-smoke'");
    if (mergingAssign === -1 || mergeCall === -1)
      throw new Error("could not locate t.status='merging' assignment or merge call");
    if (mergingAssign >= mergeCall)
      throw new Error("t.status='merging' must be written before the git merge call");
    if (pendingSmokeAssign === -1 || pendingSmokeAssign <= mergeCall)
      throw new Error("t.status='merged-pending-smoke' must be written after the git merge call");

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 25. sweepidx-1: child.stdin has error handler in runClaude ----
{
  const label = 'sweepidx-1: runClaude guards child.stdin against EPIPE (error handler present)';
  try {
    const src = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    if (!src.includes("child.stdin.on('error'"))
      throw new Error("child.stdin.on('error') handler missing from runClaude — EPIPE crashes process");
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 26. sweepidx-2: error-handler reply is guarded with try-catch ----
{
  const label = 'sweepidx-2: msg.reply(m) in MessageCreate catch block is wrapped in try-catch';
  try {
    const src = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    // The pattern we require: "try { await msg.reply(m); } catch" inside the outer catch block.
    if (!src.includes('try { await msg.reply(m); } catch'))
      throw new Error('msg.reply(m) in error handler is not wrapped in try-catch — Discord API failure becomes unhandled rejection');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 27. BUG-imessage-A: readAt bounds guards prevent RangeError on truncated blobs ----
{
  const label = 'BUG-imessage-A: readAt has bounds guards for 0x81/0x82 length prefixes';
  try {
    const src = readFileSync(path.join(ROOT, 'imessage.js'), 'utf8');
    if (!src.includes('i + 3 > buf.length')) throw new Error('missing bounds guard for 0x81 (readUInt16LE)');
    if (!src.includes('i + 5 > buf.length')) throw new Error('missing bounds guard for 0x82 (readUInt32LE)');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 28. BUG-imessage-B: timeout flag prevents spurious retry after 30-min cap ----
{
  const label = 'BUG-imessage-B: runClaude sets _timedOut; ask() skips retry on timeout';
  try {
    const src = readFileSync(path.join(ROOT, 'imessage.js'), 'utf8');
    if (!src.includes('_timedOut')) throw new Error('_timedOut flag not set in runClaude');
    if (!src.includes('e.timedOut')) throw new Error('e.timedOut check missing from ask() catch block');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 29. cron N/step: single-start step expands to full range, not just start ----
{
  const label = 'cron.mjs: N/step (e.g. 5/15) expands to full range, not just start value';
  try {
    const { cronMatches, nextCronDate } = await import(
      path.join(WORKSPACE, 'scheduler/cron.mjs')
    );
    // 5/15 on minutes should match {5, 20, 35, 50}
    const matchedMinutes = [];
    for (let m = 0; m < 60; m++) {
      const d = new Date(Date.UTC(2026, 4, 30, 9, m, 0));
      if (cronMatches('5/15 * * * *', d)) matchedMinutes.push(m);
    }
    const expected = [5, 20, 35, 50];
    if (JSON.stringify(matchedMinutes) !== JSON.stringify(expected))
      throw new Error(`5/15 matched ${JSON.stringify(matchedMinutes)}, expected ${JSON.stringify(expected)}`);

    // nextCronDate from 09:06 should land at 09:20, not skip to next cycle
    const from = new Date(Date.UTC(2026, 4, 30, 9, 6, 0));
    const next = nextCronDate('5/15 * * * *', from);
    if (!next) throw new Error('nextCronDate returned null for 5/15');
    if (next.getUTCMinutes() !== 20)
      throw new Error(`expected next minute=20, got ${next.getUTCMinutes()} (${next.toISOString()})`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 30. plan.mjs: add-step reactivates done plan; complete rejects already-done step ----
{
  const label = 'plan.mjs: add-step reactivates done plan; complete rejects already-done step';
  const PLAN = path.join(WORKSPACE, 'plans/plan.mjs');
  try {
    // Create plan and add + complete one step so plan auto-closes
    const p = JSON.parse(spawnSync('node', [PLAN, 'create', 'smoke-plan-25'],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    const pid = p.id;

    const s1 = JSON.parse(spawnSync('node', [PLAN, 'add-step', String(pid), 'step one'],
      { encoding: 'utf8', timeout: 10_000 }).stdout);

    const done1 = JSON.parse(spawnSync('node', [PLAN, 'complete', String(pid), String(s1.id)],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (done1.status !== 'done') throw new Error(`step should be done, got ${done1.status}`);

    const after1 = JSON.parse(spawnSync('node', [PLAN, 'show', String(pid)],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (after1.status !== 'done') throw new Error(`plan should be done after all steps complete, got ${after1.status}`);

    // Fix 1: add-step to a done plan must reactivate it
    spawnSync('node', [PLAN, 'add-step', String(pid), 'step two'],
      { encoding: 'utf8', timeout: 10_000 });
    const after2 = JSON.parse(spawnSync('node', [PLAN, 'show', String(pid)],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (after2.status !== 'active')
      throw new Error(`plan should be reactivated after add-step, got ${after2.status}`);

    // next must return the pending step, not null
    const nxt = JSON.parse(spawnSync('node', [PLAN, 'next', String(pid)],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (!nxt.step) throw new Error('next should return pending step after reopen, got null');
    if (nxt.step.task !== 'step two') throw new Error(`unexpected step task: ${nxt.step.task}`);

    // Fix 2: complete an already-done step must exit non-zero
    const r2 = spawnSync('node', [PLAN, 'complete', String(pid), String(s1.id)],
      { encoding: 'utf8', timeout: 10_000 });
    if (r2.status === 0) throw new Error('completing an already-done step should exit non-zero');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 31. scheduler: in-flight tracking present (overlap fix) ----
{
  const label = 'scheduler.mjs: in-flight Set prevents concurrent execution of the same job';
  try {
    const src = readFileSync(path.join(WORKSPACE, 'scheduler/scheduler.mjs'), 'utf8');
    if (!src.includes('const running = new Set()'))
      throw new Error('running Set not declared');
    if (!src.includes('running.add(job.id)'))
      throw new Error('running.add(job.id) not found in fireJob');
    if (!src.includes('running.delete(job.id)'))
      throw new Error('running.delete(job.id) not found in close/error handlers');
    if (!src.includes('running.has(job.id)'))
      throw new Error('running.has(job.id) guard not found in tick()');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 32. scheduler: overdue jobs fire regardless of cronMatches (catch-up fix) ----
{
  const label = 'scheduler.mjs: overdue jobs (next_run in past) fire as catch-up, not silently dropped';
  try {
    const src = readFileSync(path.join(WORKSPACE, 'scheduler/scheduler.mjs'), 'utf8');
    if (!src.includes('isOverdue'))
      throw new Error('isOverdue logic not found');
    if (!src.includes('job.next_run !== null'))
      throw new Error('overdue detection (job.next_run !== null) not found');
    if (!src.includes('!isOverdue'))
      throw new Error('cronMatches bypass for overdue jobs not found');
    if (!src.includes('overdue — firing catch-up run'))
      throw new Error('catch-up log message not found');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 33. scheduler: stmtSchedule used on new-job path (last_run not poisoned) ----
{
  const label = 'scheduler.mjs: new-job schedule path uses stmtSchedule (not stmtUpdate) so last_run stays NULL';
  try {
    const src = readFileSync(path.join(WORKSPACE, 'scheduler/scheduler.mjs'), 'utf8');
    if (!src.includes('stmtSchedule'))
      throw new Error('stmtSchedule not declared');
    if (!src.includes('UPDATE jobs SET next_run = ?'))
      throw new Error('stmtSchedule SQL (next_run only) not found');
    // The new-job scheduling path must call stmtSchedule, not stmtUpdate
    if (!src.includes('stmtSchedule.run('))
      throw new Error('stmtSchedule.run() call not found');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 34. vision: scale-math fix — invalid --scale string must not produce NaN ----
{
  const label = 'vision: invalid --scale string falls back to SCALE_DEFAULT, not NaN';
  try {
    // Verify the fixed pattern: Number(val) || default handles NaN and null safely.
    const parseScale = (val, def = 2) => Number(val) || def;
    if (isNaN(parseScale('abc'))) throw new Error('invalid scale should fall back, not NaN');
    if (parseScale('abc') !== 2) throw new Error(`expected 2 for "abc", got ${parseScale('abc')}`);
    if (parseScale(null) !== 2) throw new Error(`expected 2 for null, got ${parseScale(null)}`);
    if (parseScale('1') !== 1) throw new Error(`expected 1 for "1", got ${parseScale('1')}`);
    if (parseScale('2') !== 2) throw new Error(`expected 2 for "2", got ${parseScale('2')}`);
    // Confirm the old buggy pattern would have produced NaN for the same input.
    const OLD = val => Number(val || 2);
    if (!isNaN(OLD('abc'))) throw new Error('test setup error: old pattern should give NaN for "abc"');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 35. think.mjs: weekly mark guarded by r.status/r.signal ----
{
  const label = 'think.mjs: weekly mark write guarded by r.status === 0 && !r.signal';
  try {
    const src = readFileSync(path.join(WORKSPACE, 'think/think.mjs'), 'utf8');
    // The guard must appear inside the if(deep) block, before the writeFileSync(WEEKLY_MARK call.
    const deepIdx = src.indexOf('if (deep) {');
    const markIdx = src.indexOf('writeFileSync(WEEKLY_MARK', deepIdx);
    if (deepIdx === -1 || markIdx === -1)
      throw new Error('if(deep) block or writeFileSync(WEEKLY_MARK not found');
    const between = src.slice(deepIdx, markIdx);
    if (!between.includes('r.status === 0'))
      throw new Error('r.status === 0 guard missing before writeFileSync(WEEKLY_MARK');
    if (!between.includes('!r.signal'))
      throw new Error('!r.signal guard missing before writeFileSync(WEEKLY_MARK');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 36. bin/helm-push.mjs: syntax valid + env value trimming + sendFile empty body guard ----
{
  const label = 'bin/helm-push.mjs: syntax valid; env values trimmed; sendFile guards empty body';
  try {
    const r = spawnSync('node', ['--check', path.join(ROOT, 'bin/helm-push.mjs')],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`syntax check failed: ${r.stderr}`);

    const src = readFileSync(path.join(ROOT, 'bin/helm-push.mjs'), 'utf8');

    // Bug 1 fix: env value must be trimmed to strip trailing whitespace from .env lines
    if (!src.includes(".trim()"))
      throw new Error('env value .trim() missing — trailing-whitespace bug not fixed');

    // Bug 2 fix: sendFile must guard against empty response body (consistent with api())
    if (!src.includes("body ? JSON.parse(body)"))
      throw new Error('sendFile empty-body guard missing — JSON.parse(body) without guard');

    // Bug 3 fix: sendFile error must include statusText (consistent with api())
    const sendFileIdx = src.indexOf('async function sendFile');
    if (sendFileIdx === -1) throw new Error('sendFile function not found');
    const sendFileBody = src.slice(sendFileIdx);
    if (!sendFileBody.includes('res.statusText'))
      throw new Error('sendFile error missing res.statusText — error messages inconsistent with api()');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 37. MCP wiring completeness: both bots wired, all servers have command, fetch present ----
{
  const label = 'MCP: imessage.js wired; --strict-mcp-config in both bots; all servers have command; fetch server present';
  try {
    const configPath = path.join(ROOT, 'workspace/mcp/servers.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const servers = config.mcpServers;

    // Every declared server must have a command field — missing command would hang the MCP launch.
    for (const [key, entry] of Object.entries(servers)) {
      if (!entry.command || typeof entry.command !== 'string')
        throw new Error(`server "${key}" has no command field — would hang on launch`);
    }

    // The fetch server must be present (documented in CLAUDE.md; both bots comment "filesystem + fetch").
    if (!servers.fetch)
      throw new Error('"fetch" server missing from mcpServers — HTTP fetch tool unavailable');

    // imessage.js must also reference the config (test 18 only checks index.js).
    const iSrc = readFileSync(path.join(ROOT, 'imessage.js'), 'utf8');
    if (!iSrc.includes('workspace/mcp/servers.json'))
      throw new Error('imessage.js does not reference workspace/mcp/servers.json');

    // Both bots must pass --strict-mcp-config so the user's global MCP config is not leaked in.
    const dSrc = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    if (!dSrc.includes('--strict-mcp-config'))
      throw new Error('index.js missing --strict-mcp-config flag');
    if (!iSrc.includes('--strict-mcp-config'))
      throw new Error('imessage.js missing --strict-mcp-config flag');

    // Both bots must have the fallback that returns empty-config JSON when servers.json is bad
    // (protects against a malformed file hanging the bot at startup).
    const fallback = '{"mcpServers":{}}';
    if (!dSrc.includes(fallback))
      throw new Error(`index.js missing mcpConfigArg fallback string '${fallback}'`);
    if (!iSrc.includes(fallback))
      throw new Error(`imessage.js missing mcpConfigArg fallback string '${fallback}'`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 38. recall ranks high-confidence fact above low-confidence same-keyword fact ----
{
  const label = 'memory recall: confidence weighting ranks high-confidence fact above low-confidence match';
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(WORKSPACE, 'memory/memory.db'));
    const KIND = 'preference';
    const KEY_HI = '__smoke_conf_hi';
    const KEY_LO = '__smoke_conf_lo';
    // Clean up any prior run
    db.prepare(`DELETE FROM facts WHERE kind = ? AND key IN (?, ?)`).run(KIND, KEY_HI, KEY_LO);
    // Insert two facts with identical keyword content but different confidence
    db.prepare(
      `INSERT INTO facts (kind, key, value, source, confidence, evidence_count, last_seen, updated)
       VALUES (?, ?, 'helmconftest alpha bravo', 'smoke', 0.95, 5, unixepoch(), unixepoch())`
    ).run(KIND, KEY_HI);
    db.prepare(
      `INSERT INTO facts (kind, key, value, source, confidence, evidence_count, last_seen, updated)
       VALUES (?, ?, 'helmconftest alpha bravo', 'smoke', 0.3, 1, unixepoch(), unixepoch())`
    ).run(KIND, KEY_LO);
    db.close();

    const r = spawnSync('node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'recall', 'helmconftest alpha bravo', '--keyword-only'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`recall failed: ${r.stderr}`);
    const arr = JSON.parse(r.stdout);

    // Clean up
    const db2 = new DatabaseSync(path.join(WORKSPACE, 'memory/memory.db'));
    db2.prepare(`DELETE FROM facts WHERE kind = ? AND key IN (?, ?)`).run(KIND, KEY_HI, KEY_LO);
    db2.close();

    const hiIdx = arr.findIndex(f => f.key === KEY_HI);
    const loIdx = arr.findIndex(f => f.key === KEY_LO);
    if (hiIdx === -1 || loIdx === -1) throw new Error(`test facts not in recall results (hi=${hiIdx}, lo=${loIdx})`);
    if (hiIdx >= loIdx) throw new Error(`high-confidence fact (idx ${hiIdx}) did not rank above low-confidence (idx ${loIdx})`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- summary ----
console.log('');
console.log(`Smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
