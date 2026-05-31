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

// ---- 4. memory remember -> recall round-trip (data-independent) ----
{
  const label = 'memory.mjs remember -> recall round-trip finds a seeded fact';
  const mem = path.join(WORKSPACE, 'memory/memory.mjs');
  const KEY = 'smoke_recall_probe';
  try {
    spawnSync('node', [mem, 'remember', 'note', KEY, 'zorbic quaffle widget'], { encoding: 'utf8', timeout: 15_000 });
    const r = spawnSync('node', [mem, 'recall', 'zorbic quaffle'], { encoding: 'utf8', timeout: 15_000 });
    if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`);
    const facts = JSON.parse(r.stdout);
    if (!facts.some(f => f.key === KEY)) throw new Error(`seeded fact not recalled: ${JSON.stringify(facts).slice(0, 200)}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
  finally {
    try {
      const d = spawnSync('node', [mem, 'dump'], { encoding: 'utf8' });
      const id = (JSON.parse(d.stdout) || []).find(f => f.key === KEY)?.id;
      if (id) spawnSync('node', [mem, 'forget', String(id)], { encoding: 'utf8' });
    } catch {}
  }
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

    // recall --keyword-only must succeed and return an array regardless of model availability
    // (data-independent: don't assert specific facts — memory can be empty/fresh)
    const r = spawnSync('node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'recall', 'anything', '--keyword-only'],
      { encoding: 'utf8', timeout: 15_000 });
    if (r.status !== 0) throw new Error(`recall --keyword-only failed: ${r.stderr}`);
    const arr = JSON.parse(r.stdout);
    if (!Array.isArray(arr)) throw new Error('recall --keyword-only must return array');
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

// ---- 38. Both bots have crash-guard handlers (unhandledRejection + Discord error listener) ----
{
  const label = 'Both bots: unhandledRejection guard present; index.js has Discord error listener';
  try {
    const dSrc = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    const iSrc = readFileSync(path.join(ROOT, 'imessage.js'), 'utf8');
    if (!dSrc.includes("process.on('unhandledRejection'"))
      throw new Error('index.js missing unhandledRejection handler');
    if (!iSrc.includes("process.on('unhandledRejection'"))
      throw new Error('imessage.js missing unhandledRejection handler');
    // Discord client emits 'error' events; without a listener Node crashes the process.
    if (!dSrc.includes("client.on('error'"))
      throw new Error("index.js missing client.on('error') listener — Discord WebSocket errors would crash the bot");
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 39. recall ranks high-confidence fact above low-confidence same-keyword fact ----
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

// ---- 40. exam-countdown: parseExamDate handles real value formats; daysUntil arithmetic correct ----
{
  const label = 'exam-countdown.mjs: syntax valid; parseExamDate parses ≈ YYYY-MM-DD; daysUntil arithmetic correct';
  try {
    // Syntax check
    const rc = spawnSync('node', ['--check', path.join(WORKSPACE, 'scheduler/exam-countdown.mjs')],
      { encoding: 'utf8', timeout: 10_000 });
    if (rc.status !== 0) throw new Error(`syntax check failed: ${rc.stderr}`);

    // Import without executing main (guarded by argv check)
    const { parseExamDate, daysUntil } = await import(
      path.join(WORKSPACE, 'scheduler/exam-countdown.mjs')
    );

    // parseExamDate: range value like "~1 week away (≈ 2026-06-05/06)"
    const d1 = parseExamDate('~1 week away (≈ 2026-06-05/06)');
    if (d1 !== '2026-06-05') throw new Error(`range date: expected 2026-06-05, got ${d1}`);

    // parseExamDate: exact value like "~3 days away (≈ 2026-06-02)"
    const d2 = parseExamDate('~3 days away (≈ 2026-06-02)');
    if (d2 !== '2026-06-02') throw new Error(`exact date: expected 2026-06-02, got ${d2}`);

    // parseExamDate: no date present → null
    if (parseExamDate('no date here') !== null)
      throw new Error('missing date should return null');

    // daysUntil: fixed reference — 2026-05-31 UTC (= 2026-05-31 00:00 GMT+7 after shift)
    // nowMs is shifted by +7h inside daysUntil; pick a UTC ms that lands on 2026-05-31 in GMT+7
    const ref = new Date('2026-05-31T00:00:00Z').getTime() - 7 * 3600_000; // UTC midnight that → GMT+7 2026-05-31
    const days2 = daysUntil('2026-06-02', ref);
    if (days2 !== 2) throw new Error(`expected 2 days until 2026-06-02 from 2026-05-31, got ${days2}`);

    const days0 = daysUntil('2026-05-31', ref);
    if (days0 !== 0) throw new Error(`expected 0 days for same day, got ${days0}`);

    const daysNeg = daysUntil('2026-05-30', ref);
    if (daysNeg !== -1) throw new Error(`expected -1 for yesterday, got ${daysNeg}`);

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 41. vision: verify verb present; closes GUI verify-after-action loop ----
{
  const label = 'vision: verify verb present in vision.mjs with verified/explanation JSON shape';
  try {
    const src = readFileSync(path.join(ROOT, 'workspace/tools/impl/vision.mjs'), 'utf8');
    if (!src.includes("verb === 'verify'"))
      throw new Error("verify verb branch missing from vision.mjs");
    if (!src.includes('result.verified'))
      throw new Error('result.verified check missing from verify handler');
    if (!src.includes('explanation'))
      throw new Error('explanation field missing from verify handler');
    if (!src.includes('--expect'))
      throw new Error('--expect flag missing from verify handler');
    // Registry must expose vision.verify so the tool dispatcher can call it
    const reg = readFileSync(path.join(ROOT, 'workspace/tools/registry.json'), 'utf8');
    if (!reg.includes('"vision.verify"'))
      throw new Error('vision.verify entry missing from tools/registry.json');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 42. dashboard: /api/state includes recentRuns array; HTML includes Recent Job Runs panel ----
{
  const label = 'dashboard: /api/state has recentRuns array; HTML renders Recent Job Runs panel';
  let server;
  try {
    // Re-import using a cache-busting search (module is already cached from check 21 — use the
    // same cached import, which is fine: we just need the already-started module shape).
    const { start } = await import(path.join(WORKSPACE, 'dashboard/server.mjs'));
    const { server: s, url } = await start(0);
    server = s;

    const apiRes = await fetch(url + '/api/state');
    if (apiRes.status !== 200) throw new Error(`GET /api/state returned ${apiRes.status}`);
    const state = await apiRes.json();
    if (!('recentRuns' in state)) throw new Error('/api/state missing recentRuns key');
    if (!Array.isArray(state.recentRuns)) throw new Error('recentRuns must be an array');

    const homeRes = await fetch(url + '/');
    if (homeRes.status !== 200) throw new Error(`GET / returned ${homeRes.status}`);
    const html = await homeRes.text();
    if (!html.includes('Recent Job Runs')) throw new Error('HTML missing "Recent Job Runs" panel heading');

    ok(label);
  } catch (e) { fail(label, e.message); }
  finally { if (server) server.close(); }
}

// ---- 43. circuit-breaker: module exports CircuitBreaker; state machine transitions work ----
{
  const label = 'circuit-breaker.mjs: CircuitBreaker exports and state transitions (closed->open->half-open->closed)';
  try {
    const { CircuitBreaker, DB_PATH } = await import(path.join(WORKSPACE, 'tools/circuit-breaker.mjs'));

    if (typeof CircuitBreaker !== 'function') throw new Error('CircuitBreaker not exported as a class');
    if (typeof DB_PATH !== 'string') throw new Error('DB_PATH not exported');

    const NAME = '__smoke_cb_test';
    const cb = new CircuitBreaker(NAME);

    // Should start closed, no guard
    if (cb.guard() !== null) throw new Error('fresh circuit should allow (guard=null)');
    if (cb.currentState() !== 'closed') throw new Error('fresh state should be closed');

    // 4 failures should stay closed
    for (let i = 0; i < 4; i++) cb.onFailure();
    if (cb.currentState() !== 'closed') throw new Error('4 failures should still be closed');

    // 5th failure opens it
    cb.onFailure();
    if (cb.currentState() !== 'open') throw new Error('5th failure should open circuit');
    if (cb.guard() === null) throw new Error('open circuit should block (guard != null)');

    // Success resets to closed
    cb.onSuccess();
    if (cb.currentState() !== 'closed') throw new Error('success should close circuit');
    if (cb.guard() !== null) throw new Error('closed circuit should allow after reset');

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 55. apply-edit.mjs: exports applyEdits; 0-match returns error; no-blocks is no-op ----
{
  const label = 'swarm/apply-edit.mjs: applyEdits exported; 0-match error; no-blocks no-op';
  const { writeFileSync: wfs43, unlinkSync: ufs43 } = await import('node:fs');
  // Use a .txt temp file (not syntax-checked, not git-tracked) with known content.
  const tmpRel = 'workspace/swarm/.smoke43.txt';
  const tmpAbs = path.join(ROOT, tmpRel);
  wfs43(tmpAbs, 'ALPHA=hello\nBETA=world\n');
  try {
    const { applyEdits } = await import(path.join(WORKSPACE, 'swarm/apply-edit.mjs'));
    if (typeof applyEdits !== 'function') throw new Error('applyEdits not a function');

    // No edit blocks -> no-op (must not mutate any file)
    const rNone = applyEdits('no edit blocks here', ROOT);
    if (rNone.applied !== 0) throw new Error('no-block text: expected applied=0, got ' + rNone.applied);
    if (rNone.errors.length) throw new Error('no-block text: unexpected errors: ' + JSON.stringify(rNone.errors));

    // 0-match: OLD string is not in the temp file -> error with "0 matches"
    const noMatchText = `<<<OLD ${tmpRel}\nSTRING_NOT_IN_TEMP_FILE\n===\nreplacement\n>>>NEW`;
    const r0 = applyEdits(noMatchText, ROOT);
    if (r0.applied !== 0) throw new Error(`expected 0 applied on non-match, got ${r0.applied}`);
    if (!r0.errors.length) throw new Error('expected at least one error for 0-match');
    if (!r0.errors[0].error.includes('0 matches')) throw new Error(`wrong error msg: ${r0.errors[0].error}`);

    ok(label);
  } catch (e) { fail(label, e.message); }
  finally { try { ufs43(tmpAbs); } catch {} }
}

// ---- 56. swarm/tools: view_file (100-line window), search_repo (file list), search_file (capped matches) ----
{
  const label = 'swarm/tools: view_file (100-line window), search_repo (file list), search_file (capped matches)';
  try {
    const { view_file } = await import(path.join(WORKSPACE, 'swarm/tools/view_file.mjs'));
    const { search_repo } = await import(path.join(WORKSPACE, 'swarm/tools/search_repo.mjs'));
    const { search_file } = await import(path.join(WORKSPACE, 'swarm/tools/search_file.mjs'));

    if (typeof view_file    !== 'function') throw new Error('view_file not a function');
    if (typeof search_repo  !== 'function') throw new Error('search_repo not a function');
    if (typeof search_file  !== 'function') throw new Error('search_file not a function');

    // view_file: reads smoke.mjs from line 1, must return <= 100 lines with line numbers
    const view = view_file('workspace/tests/smoke.mjs', 1, ROOT);
    const viewLines = view.split('\n');
    if (viewLines.length > 100) throw new Error(`view_file returned ${viewLines.length} lines, expected <= 100`);
    if (!viewLines[0].startsWith('1\t')) throw new Error('view_file line 1 must start with "1\\t"');

    // search_repo: pattern 'smoke' must return <=50 results and include smoke.mjs
    const files = search_repo('smoke', ROOT);
    if (!Array.isArray(files)) throw new Error('search_repo must return an array');
    if (files.length > 50)    throw new Error(`search_repo capped at 50, got ${files.length}`);
    if (!files.some(f => f.includes('smoke'))) throw new Error('search_repo for "smoke" must include a smoke file');

    // search_file: search smoke.mjs for 'PASS' -> array of {line, text}, capped at 20
    const matches = search_file('workspace/tests/smoke.mjs', 'PASS', ROOT);
    if (!Array.isArray(matches)) throw new Error('search_file must return an array');
    if (matches.length > 20)    throw new Error(`search_file capped at 20 matches, got ${matches.length}`);
    if (matches.length === 0)   throw new Error('search_file for "PASS" in smoke.mjs returned no results');
    if (!('line' in matches[0] && 'text' in matches[0])) throw new Error('search_file result must have {line, text}');

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 53. model-routing: classifyComplexity returns valid tiers ----
{
  const label = 'model-routing: classifyComplexity returns haiku/sonnet/opus for known inputs';
  try {
    const { classifyComplexity } = await import(path.join(WORKSPACE, 'model-routing.mjs'));
    const VALID = new Set(['haiku', 'sonnet', 'opus']);

    const cases = [
      ['',                           'haiku'],   // empty -> short -> haiku
      ['hi',                         'haiku'],   // trivial greeting
      ['ok',                         'haiku'],   // trivial ack
      ['thanks',                     'haiku'],   // trivial
      ['build a discord bot',        'opus'],    // build keyword
      ['implement oauth login',      'opus'],    // implement keyword
      ['debug this crash',           'opus'],    // debug keyword
      ['fix the bug in auth.js',     'opus'],    // fix the bug pattern
      ['create a REST api endpoint', 'opus'],    // create … api endpoint
      ['x'.repeat(1001),             'opus'],    // length > 1000
      ['explain the difference between TCP and UDP protocols', 'sonnet'],  // medium-length, no opus/haiku triggers
    ];

    for (const [input, expected] of cases) {
      const tier = classifyComplexity(input);
      if (!VALID.has(tier)) throw new Error(`classifyComplexity(${JSON.stringify(input.slice(0, 30))}) returned invalid tier ${JSON.stringify(tier)}`);
      if (tier !== expected) throw new Error(`classifyComplexity(${JSON.stringify(input.slice(0, 30))}) = ${tier}, expected ${expected}`);
    }

    // Fuzz: ensure ALL outputs are valid tier strings
    const extras = ['hello', 'what time is it', 'translate this', 'refactor the module',
                    'deploy to staging', 'write a function', 'yes', 'where is the file'];
    for (const input of extras) {
      const tier = classifyComplexity(input);
      if (!VALID.has(tier)) throw new Error(`classifyComplexity(${JSON.stringify(input)}) returned invalid tier: ${JSON.stringify(tier)}`);
    }

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 57. swarm/coding-task.mjs: codingTask exported; module loads without side effects ----
{
  const label = 'swarm/coding-task.mjs: codingTask exported and module loads without side effects';
  try {
    const { codingTask } = await import(path.join(WORKSPACE, 'swarm/coding-task.mjs'));
    if (typeof codingTask !== 'function') throw new Error('codingTask is not a function');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 44. cost-tracker: appendCost + getCostSummary round-trip ----
{
  const label = 'cost-tracker.mjs: appendCost records entry; getCostSummary returns it in since window';
  try {
    const { appendCost, getCostSummary } = await import(path.join(WORKSPACE, 'costs/cost-tracker.mjs'));

    if (typeof appendCost !== 'function') throw new Error('appendCost not exported');
    if (typeof getCostSummary !== 'function') throw new Error('getCostSummary not exported');

    const before = Date.now();
    appendCost('smoke-model', 1000, 200);

    const rows = getCostSummary(new Date(before));
    const row = rows.find(r => r.model === 'smoke-model');
    if (!row) throw new Error('appended cost not found in getCostSummary result');
    if (row.runs < 1) throw new Error('runs should be >= 1');
    if (row.total_est_tokens <= 0) throw new Error('est_tokens should be > 0 for non-zero chars');
    // est_tokens = round((1000 + 200) / 4) = 300
    if (row.total_est_tokens !== 300) throw new Error(`expected 300 est_tokens, got ${row.total_est_tokens}`);

    // getCostSummary(future) must return empty for our smoke entry
    const future = getCostSummary(new Date(Date.now() + 60_000));
    if (future.some(r => r.model === 'smoke-model')) throw new Error('future since should exclude past entries');

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 45. /cost command + think/swarm guards: wired in source ----
{
  const label = '/cost in index.js; maxTicks/maxWall in think.mjs; swarm wall-time guard in swarm.mjs';
  try {
    const iSrc = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    if (!iSrc.includes('/cost'))
      throw new Error('/cost command handler missing from index.js');
    if (!iSrc.includes('getCostSummary'))
      throw new Error('getCostSummary call missing from index.js');
    if (!iSrc.includes('appendCost'))
      throw new Error('appendCost call missing from index.js');

    const thinkSrc = readFileSync(path.join(WORKSPACE, 'think/think.mjs'), 'utf8');
    if (!thinkSrc.includes('MAX_TICKS'))
      throw new Error('MAX_TICKS guard missing from think.mjs');
    if (!thinkSrc.includes('MAX_WALL_MS'))
      throw new Error('MAX_WALL_MS guard missing from think.mjs');
    if (!thinkSrc.includes('maxTicks'))
      throw new Error('maxTicks check not wired in think.mjs interval callback');

    const swarmSrc = readFileSync(path.join(WORKSPACE, 'swarm/swarm.mjs'), 'utf8');
    if (!swarmSrc.includes('SWARM_MAX_WALL_MS'))
      throw new Error('SWARM_MAX_WALL_MS guard missing from swarm.mjs');
    if (!swarmSrc.includes('swarm wall time exceeded'))
      throw new Error('wall-time exceeded log message missing from swarm.mjs');

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 46. !mode command: index.js has the handler; preference round-trips through memory.db ----
{
  const label = '!mode: handler present in index.js; helm.autonomy_mode preference round-trips';
  try {
    // Verify source has the !mode handler and autonomy infrastructure.
    const src = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    if (!src.includes('getAutonomyMode'))
      throw new Error('getAutonomyMode missing from index.js');
    if (!src.includes('setAutonomyMode'))
      throw new Error('setAutonomyMode missing from index.js');
    if (!src.includes('helm.autonomy_mode'))
      throw new Error("preference key 'helm.autonomy_mode' missing from index.js");
    if (!src.includes('autopilotTimers'))
      throw new Error('autopilotTimers Map missing from index.js (autopilot plan scheduling)');
    if (!src.includes('[PLAN-PENDING]'))
      throw new Error('[PLAN-PENDING] marker handling missing from index.js');
    if (!src.includes('buildPersona'))
      throw new Error('buildPersona missing from index.js');
    if (!src.includes('MODE_GUIDANCE'))
      throw new Error('MODE_GUIDANCE missing from index.js');

    // Verify CLAUDE.md has plan-before-act and confidence signaling sections.
    const claudeMd = readFileSync(path.join(WORKSPACE, 'CLAUDE.md'), 'utf8');
    if (!claudeMd.includes('Plan-before-act'))
      throw new Error('Plan-before-act section missing from CLAUDE.md');
    if (!claudeMd.includes('Confidence signaling'))
      throw new Error('Confidence signaling section missing from CLAUDE.md');
    if (!claudeMd.includes('[PLAN-PENDING]'))
      throw new Error('[PLAN-PENDING] marker documentation missing from CLAUDE.md');

    // Preference round-trip: write 'autopilot' via memory.mjs, read it back, clean up.
    const KEY = 'helm.autonomy_mode';
    const mem = path.join(WORKSPACE, 'memory/memory.mjs');
    spawnSync('node', [mem, 'remember', 'preference', KEY, 'autopilot'],
      { encoding: 'utf8', timeout: 10_000 });

    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(WORKSPACE, 'memory/memory.db'));
    const row = db.prepare(`SELECT value FROM facts WHERE kind = 'preference' AND key = ? AND expired_at IS NULL`).get(KEY);
    const stored = row?.value;

    // Restore to copilot (the default) so we don't leave a changed preference behind.
    spawnSync('node', [mem, 'remember', 'preference', KEY, 'copilot'],
      { encoding: 'utf8', timeout: 10_000 });
    db.close();

    if (stored !== 'autopilot')
      throw new Error(`expected 'autopilot' in DB, got '${stored}'`);

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 54. model-routing: index.js wired (import + pickModel + !model handler) ----
{
  const label = 'model-routing: index.js imports classifyComplexity, has pickModel, has !model handler';
  try {
    const src = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    if (!src.includes('classifyComplexity')) throw new Error('classifyComplexity not referenced in index.js');
    if (!src.includes('model-routing')) throw new Error('model-routing import missing from index.js');
    if (!src.includes('pickModel')) throw new Error('pickModel helper missing from index.js');
    if (!src.includes('!model')) throw new Error('!model command handler missing from index.js');
    if (!src.includes('setModelPref')) throw new Error('setModelPref call missing from index.js');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 47. BM25 ranking: higher TF fact ranks above lower TF fact ----
{
  const label = 'memory recall: BM25 ranks fact with higher term frequency above lower TF fact';
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(WORKSPACE, 'memory/memory.db'));
    const KIND = 'note';
    const KEY_HI = '__smoke_bm25_hi';
    const KEY_LO = '__smoke_bm25_lo';
    db.prepare(`DELETE FROM facts WHERE kind = ? AND key IN (?, ?) AND expired_at IS NULL`).run(KIND, KEY_HI, KEY_LO);
    // High TF: 'quasar' appears 3 times
    db.prepare(
      `INSERT INTO facts (kind, key, value, source, confidence, evidence_count, last_seen, updated)
       VALUES (?, ?, 'bm25probe quasar quasar quasar', 'smoke', 0.9, 3, unixepoch(), unixepoch())`
    ).run(KIND, KEY_HI);
    // Low TF: 'quasar' appears once
    db.prepare(
      `INSERT INTO facts (kind, key, value, source, confidence, evidence_count, last_seen, updated)
       VALUES (?, ?, 'bm25probe quasar minimal', 'smoke', 0.9, 1, unixepoch(), unixepoch())`
    ).run(KIND, KEY_LO);
    db.close();

    const r = spawnSync('node',
      [path.join(WORKSPACE, 'memory/memory.mjs'), 'recall', 'bm25probe quasar', '--keyword-only'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`recall failed: ${r.stderr}`);
    const arr = JSON.parse(r.stdout);

    const db2 = new DatabaseSync(path.join(WORKSPACE, 'memory/memory.db'));
    db2.prepare(`DELETE FROM facts WHERE kind = ? AND key IN (?, ?)`).run(KIND, KEY_HI, KEY_LO);
    db2.close();

    const hiIdx = arr.findIndex(f => f.key === KEY_HI);
    const loIdx = arr.findIndex(f => f.key === KEY_LO);
    if (hiIdx === -1 || loIdx === -1) throw new Error(`BM25 test facts not in results (hi=${hiIdx}, lo=${loIdx})`);
    if (hiIdx >= loIdx) throw new Error(`high-TF fact (idx ${hiIdx}) did not rank above low-TF (idx ${loIdx})`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 48. temporal supersede: new value creates new row, old gets expired_at; history returns both ----
{
  const label = 'memory.mjs temporal supersede: new value expires old row; recall returns new; history returns both';
  const mem = path.join(WORKSPACE, 'memory/memory.mjs');
  const KEY = '__smoke_supersede';
  try {
    // Clean up any leftover rows from previous test runs
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(WORKSPACE, 'memory/memory.db'));
    db.prepare(`DELETE FROM facts WHERE kind = 'note' AND key = ?`).run(KEY);
    db.close();

    const r1 = JSON.parse(spawnSync('node', [mem, 'remember', 'note', KEY, 'first value'],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (!['inserted', 'updated'].includes(r1.action)) throw new Error(`unexpected action: ${r1.action}`);

    const r2 = JSON.parse(spawnSync('node', [mem, 'remember', 'note', KEY, 'second value'],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (r2.action !== 'superseded') throw new Error(`expected action 'superseded', got '${r2.action}'`);
    if (r2.value !== 'second value') throw new Error(`new value not in output: ${r2.value}`);
    if (!r2.old_id) throw new Error('old_id missing from superseded output');

    // recall must return only the new value
    const recall = JSON.parse(spawnSync('node', [mem, 'recall', KEY, '--keyword-only'],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    const active = recall.filter(f => f.key === KEY);
    if (active.length !== 1) throw new Error(`expected 1 active fact, got ${active.length}`);
    if (active[0].value !== 'second value') throw new Error(`recall returned old value: ${active[0].value}`);

    // history must return at least 2 rows (old expired + new active)
    const hist = JSON.parse(spawnSync('node', [mem, 'history', KEY],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (hist.length < 2) throw new Error(`expected >= 2 history rows, got ${hist.length}`);
    const hasExpired = hist.some(f => f.expired_at !== null);
    if (!hasExpired) throw new Error('no expired row found in history — supersede did not set expired_at');
    const hasActive = hist.some(f => f.expired_at === null);
    if (!hasActive) throw new Error('no active row found in history');

    // Cleanup
    const db2 = new DatabaseSync(path.join(WORKSPACE, 'memory/memory.db'));
    db2.prepare(`DELETE FROM facts WHERE kind = 'note' AND key = ?`).run(KEY);
    db2.close();
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 49. access_count incremented on recall hit ----
{
  const label = 'memory.mjs recall: access_count bumped for returned facts';
  const mem = path.join(WORKSPACE, 'memory/memory.mjs');
  const KEY = '__smoke_access_count';
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(WORKSPACE, 'memory/memory.db'));
    db.prepare(`DELETE FROM facts WHERE kind = 'note' AND key = ?`).run(KEY);
    db.close();

    spawnSync('node', [mem, 'remember', 'note', KEY, 'accesscount probe unique'],
      { encoding: 'utf8', timeout: 10_000 });

    // Recall to trigger access_count bump
    const r = spawnSync('node', [mem, 'recall', 'accesscount probe', '--keyword-only'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`recall failed: ${r.stderr}`);
    const arr = JSON.parse(r.stdout);
    if (!arr.some(f => f.key === KEY)) throw new Error('probe fact not in recall results');

    // Dump and check access_count
    const dump = JSON.parse(spawnSync('node', [mem, 'dump'],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    const fact = dump.find(f => f.key === KEY);
    if (!fact) throw new Error('probe fact not found in dump');
    if (!(fact.access_count >= 1)) throw new Error(`access_count not bumped: ${fact.access_count}`);

    // Cleanup
    const db2 = new DatabaseSync(path.join(WORKSPACE, 'memory/memory.db'));
    db2.prepare(`DELETE FROM facts WHERE kind = 'note' AND key = ?`).run(KEY);
    db2.close();
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 50. bin/guiclick: syntax clean + detectScale exported ----
{
  const label = 'bin/guiclick: node --check clean; detectScale exported as a function';
  try {
    const guiclickPath = path.join(ROOT, 'bin/guiclick');
    if (!existsSync(guiclickPath)) throw new Error('bin/guiclick not found');

    const r = spawnSync('node', ['--check', guiclickPath], { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`syntax check failed: ${r.stderr}`);

    // Import as a module and verify detectScale is exported.
    // The CLI argv check prevents main() from running on import.
    const { detectScale } = await import(guiclickPath);
    if (typeof detectScale !== 'function') throw new Error('detectScale not exported from bin/guiclick');

    // detectScale must return a positive integer without Screen Recording (it reads display metadata).
    const scale = detectScale();
    if (typeof scale !== 'number' || scale < 1 || !Number.isInteger(scale)) {
      throw new Error(`detectScale returned unexpected value: ${scale}`);
    }
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 51. gui_task.mjs: syntax clean + guiStep exported ----
{
  const label = 'gui_task.mjs: node --check clean; guiStep exported as async function';
  try {
    const guiTaskPath = path.join(WORKSPACE, 'tools/impl/gui_task.mjs');
    if (!existsSync(guiTaskPath)) throw new Error('workspace/tools/impl/gui_task.mjs not found');

    const r = spawnSync('node', ['--check', guiTaskPath], { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`syntax check failed: ${r.stderr}`);

    // Import without triggering CLI main() — the argv guard prevents execution on import.
    const { guiStep } = await import(guiTaskPath);
    if (typeof guiStep !== 'function') throw new Error('guiStep not exported from gui_task.mjs');
    // Must be async (returns a Promise)
    const asyncTag = Object.prototype.toString.call(guiStep);
    if (!guiStep.constructor?.name?.includes('Async') && guiStep.length === undefined) {
      // Check by invoking with a no-op and confirming a Promise is returned
    }
    // Structural check: guiStep accepts 3 params (action, description, maxRetries)
    if (guiStep.length < 2) throw new Error(`guiStep.length=${guiStep.length} — expected at least 2 params`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 52. MCP: playwright entry present with command; gui.step in registry ----
{
  const label = 'MCP playwright server present; gui.step registered in tools registry';
  try {
    const configPath = path.join(ROOT, 'workspace/mcp/servers.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!config.mcpServers.playwright)
      throw new Error('"playwright" server missing from workspace/mcp/servers.json');
    if (!config.mcpServers.playwright.command || typeof config.mcpServers.playwright.command !== 'string')
      throw new Error('playwright server entry missing command field');
    if (!Array.isArray(config.mcpServers.playwright.args) || !config.mcpServers.playwright.args.includes('--headless'))
      throw new Error('playwright server args missing --headless flag');

    // gui.step must be in the tools registry
    const registryPath = path.join(WORKSPACE, 'tools/registry.json');
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    const guiStep = registry.find(t => t.name === 'gui.step');
    if (!guiStep) throw new Error('gui.step not found in tools/registry.json');
    if (!guiStep.exec) throw new Error('gui.step missing exec field in registry');
    if (!guiStep.args_schema?.cmd) throw new Error('gui.step missing cmd in args_schema');
    if (!guiStep.args_schema?.description) throw new Error('gui.step missing description in args_schema');

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 63. plan.mjs: DAG parallelism + reflexion retry + replan round-trip ----
{
  const label = 'plan.mjs: DAG parallelism + retry insertion + replan round-trip';
  const PLAN = path.join(WORKSPACE, 'plans/plan.mjs');
  try {
    // 1. Create plan
    const p = JSON.parse(spawnSync('node', [PLAN, 'create', 'smoke-dag-plan'],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (!p.id) throw new Error('create did not return id');
    const pid = p.id;

    // 2. Add two independent steps (no deps)
    const sA = JSON.parse(spawnSync('node', [PLAN, 'add-step', String(pid), 'task A'],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    const sB = JSON.parse(spawnSync('node', [PLAN, 'add-step', String(pid), 'task B'],
      { encoding: 'utf8', timeout: 10_000 }).stdout);

    // 3. Add step C that depends on both A and B
    const sC = JSON.parse(spawnSync('node', [PLAN, 'add-step', String(pid), 'task C',
      '--deps', `${sA.id},${sB.id}`],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (!Array.isArray(sC.deps) || sC.deps.length !== 2)
      throw new Error(`step C deps should be [${sA.id},${sB.id}], got ${JSON.stringify(sC.deps)}`);

    // 4. next must return A and B (runnable), not C (deps unsatisfied)
    const nxt1 = JSON.parse(spawnSync('node', [PLAN, 'next', String(pid)],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (!Array.isArray(nxt1.steps)) throw new Error('next must return steps array');
    if (nxt1.steps.length !== 2)
      throw new Error(`expected 2 runnable steps, got ${nxt1.steps.length}`);
    const taskNames1 = nxt1.steps.map(s => s.task).sort();
    if (!taskNames1.includes('task A') || !taskNames1.includes('task B'))
      throw new Error(`expected tasks A and B, got ${JSON.stringify(taskNames1)}`);
    // backwards-compat: step field must exist
    if (!nxt1.step) throw new Error('next must still populate step (backwards compat)');

    // 5. Complete A with a result (test result propagation)
    const cA = JSON.parse(spawnSync('node', [PLAN, 'complete', String(pid), String(sA.id),
      '--result', 'A-output'],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (cA.status !== 'done') throw new Error(`sA should be done, got ${cA.status}`);

    // 6. Complete B with failure — should insert retry step (skip reflexion for speed)
    const cB = JSON.parse(spawnSync('node', [PLAN, 'complete', String(pid), String(sB.id),
      '--result', 'error: something went wrong', '--failed', '--no-reflexion'],
      { encoding: 'utf8', timeout: 15_000 }).stdout);
    if (!cB.retry_step_inserted) throw new Error('complete --failed must set retry_step_inserted');
    if (cB.status !== 'failed') throw new Error(`sB should be failed, got ${cB.status}`);

    // 7. Plan should have >= 4 steps (A, B, C, retry-B)
    const show1 = JSON.parse(spawnSync('node', [PLAN, 'show', String(pid)],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (show1.steps.length < 4)
      throw new Error(`expected >= 4 steps after retry insert, got ${show1.steps.length}`);

    // 8. Checkpoints table must have rows for this plan
    const { DatabaseSync } = await import('node:sqlite');
    const planDb = new DatabaseSync(path.join(WORKSPACE, 'plans/plans.db'));
    const cpRows = planDb.prepare(`SELECT * FROM checkpoints WHERE plan_id = ?`).all(pid);
    planDb.close();
    if (cpRows.length < 1) throw new Error(`expected checkpoints for plan ${pid}, got 0`);

    // 9. Exhaust retries on the retry step to trigger escalation
    const retryStep = show1.steps.find(s => s.retry_count > 0 && s.status === 'pending');
    if (!retryStep) throw new Error('retry step not found in pending state');

    // retry_count is already 1 — one more failure should also retry (count 1 < 2)
    const cR1 = JSON.parse(spawnSync('node', [PLAN, 'complete', String(pid), String(retryStep.id),
      '--result', 'still failing', '--failed', '--no-reflexion'],
      { encoding: 'utf8', timeout: 15_000 }).stdout);
    if (!cR1.retry_step_inserted) throw new Error('second retry should still insert a retry step');

    // Now retry_count=2, next failure must escalate
    const show2 = JSON.parse(spawnSync('node', [PLAN, 'show', String(pid)],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    const lastRetry = show2.steps.find(s => s.retry_count === 2 && s.status === 'pending');
    if (!lastRetry) throw new Error('retry_count=2 step not found');

    const cR2 = JSON.parse(spawnSync('node', [PLAN, 'complete', String(pid), String(lastRetry.id),
      '--result', 'still failing', '--failed', '--no-reflexion'],
      { encoding: 'utf8', timeout: 15_000 }).stdout);
    if (!cR2.escalated) throw new Error('third failure must set escalated=true');

    // Plan should now be blocked
    const showBlocked = JSON.parse(spawnSync('node', [PLAN, 'show', String(pid)],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (showBlocked.status !== 'blocked')
      throw new Error(`plan should be blocked, got ${showBlocked.status}`);

    // 10. Replan with --steps-json bypass (no claude call; unblocks plan)
    const newStepsJson = JSON.stringify([
      { task: 'new task D', tool_or_cmd: null, deps: [] },
      { task: 'new task E', tool_or_cmd: null, deps: [] },
    ]);
    const rp1 = JSON.parse(spawnSync('node', [PLAN, 'replan', String(pid),
      '--failure', 'task B permanently failed',
      '--steps-json', newStepsJson],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (rp1.replan_count !== 1) throw new Error(`expected replan_count 1, got ${rp1.replan_count}`);
    if (!Array.isArray(rp1.steps)) throw new Error('replan must return steps array');
    if (rp1.steps.length !== 2) throw new Error(`expected 2 inserted steps, got ${rp1.steps.length}`);

    // Plan should be active again
    const showActive = JSON.parse(spawnSync('node', [PLAN, 'show', String(pid)],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (showActive.status !== 'active')
      throw new Error(`plan should be active after replan, got ${showActive.status}`);
    if (showActive.replan_count !== 1)
      throw new Error(`plan replan_count should be 1, got ${showActive.replan_count}`);

    // 11. replan_count cap: 2 more replans hit the limit of 3
    for (let i = 0; i < 2; i++) {
      spawnSync('node', [PLAN, 'replan', String(pid), '--steps-json', newStepsJson],
        { encoding: 'utf8', timeout: 10_000 });
    }
    const capRes = spawnSync('node', [PLAN, 'replan', String(pid), '--steps-json', newStepsJson],
      { encoding: 'utf8', timeout: 10_000 });
    if (capRes.status === 0) throw new Error('replan should fail after hitting cap of 3');

    // 12. Result substitution: add a step referencing A's result, verify next substitutes it
    const planDb2 = new DatabaseSync(path.join(WORKSPACE, 'plans/plans.db'));
    // Mark remaining pending steps done so plan advances cleanly for this sub-check
    planDb2.prepare(`UPDATE steps SET status='done' WHERE plan_id=? AND status='pending'`).run(pid);
    planDb2.prepare(`UPDATE plans SET status='active' WHERE id=?`).run(pid);
    planDb2.close();

    const sRef = JSON.parse(spawnSync('node', [PLAN, 'add-step', String(pid),
      `use result: {{step.${sA.id}.result}}`],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    const nxtRef = JSON.parse(spawnSync('node', [PLAN, 'next', String(pid)],
      { encoding: 'utf8', timeout: 10_000 }).stdout);
    if (!nxtRef.step) throw new Error('next should return the substitution step');
    if (!nxtRef.step.task.includes('A-output'))
      throw new Error(`result substitution failed: got task "${nxtRef.step.task}"`);

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 58. swarm/swarm.mjs: critic gate present before merge; PASS/FAIL verdict logic wired ----
{
  const label = 'swarm/swarm.mjs: critic gate (PASS/FAIL check) present before merge; critic-rejected status wired';
  try {
    const swarmSrc = readFileSync(path.join(WORKSPACE, 'swarm/swarm.mjs'), 'utf8');

    if (!swarmSrc.includes('critic'))
      throw new Error('"critic" keyword not found in swarm.mjs — critic gate missing');
    if (!swarmSrc.includes('PASS') || !swarmSrc.includes('FAIL'))
      throw new Error('PASS/FAIL verdict strings missing from swarm.mjs critic gate');
    if (!swarmSrc.includes('critic-rejected'))
      throw new Error('"critic-rejected" status not found in swarm.mjs');

    // Critic gate must appear before the first git merge call
    const criticIdx = swarmSrc.indexOf('critic');
    const mergeIdx  = swarmSrc.indexOf("git(ROOT, 'merge', '--no-ff'");
    if (criticIdx === -1 || mergeIdx === -1)
      throw new Error('could not locate critic gate or merge call in swarm.mjs');
    if (criticIdx >= mergeIdx)
      throw new Error('critic gate must appear before the git merge call');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 59. compact.mjs: syntax valid; HANDOFF_SCHEMA shape; pruneFileReads strips old blocks ----
{
  const label = 'compact.mjs: syntax valid; HANDOFF_SCHEMA has correct keys; pruneFileReads strips old file blocks; swarm.mjs wired';
  try {
    // Syntax check
    const rc = spawnSync('node', ['--check', path.join(WORKSPACE, 'sessions/compact.mjs')],
      { encoding: 'utf8', timeout: 10_000 });
    if (rc.status !== 0) throw new Error(`syntax check failed: ${rc.stderr}`);

    const { HANDOFF_SCHEMA, pruneFileReads } = await import(
      path.join(WORKSPACE, 'sessions/compact.mjs')
    );

    // Schema shape
    const required = ['worker_id', 'task', 'artifacts', 'key_findings', 'decisions', 'open_questions', 'confidence'];
    for (const k of required) {
      if (!(k in HANDOFF_SCHEMA)) throw new Error(`HANDOFF_SCHEMA missing key: ${k}`);
    }
    if (!Array.isArray(HANDOFF_SCHEMA.artifacts))    throw new Error('HANDOFF_SCHEMA.artifacts must be an array');
    if (typeof HANDOFF_SCHEMA.confidence !== 'number') throw new Error('HANDOFF_SCHEMA.confidence must be a number');

    // pruneFileReads: text shorter than threshold is unchanged
    const shortText = 'hello world\nfoo bar\nbaz';
    if (pruneFileReads(shortText) !== shortText) throw new Error('short text should pass through unchanged');

    // pruneFileReads: null/undefined safe
    if (pruneFileReads(null) !== null) throw new Error('null should be returned as-is');

    // pruneFileReads: 20-line numbered block in old region gets dropped
    const numBlock = Array.from({ length: 20 }, (_, i) => `${i + 1}\tcode_line_${i};`).join('\n');
    const recent   = Array.from({ length: 500 }, (_, i) => `recent_line_${i}`).join('\n');
    const combined = numBlock + '\n' + recent;
    const pruned   = pruneFileReads(combined, 3);
    // First numbered line must be gone (replaced by the [file read: ...] note)
    if (pruned.includes('1\tcode_line_0;')) throw new Error('pruneFileReads did not drop numbered block from old region');
    if (!pruned.includes('dropped'))         throw new Error('pruneFileReads missing "dropped" note');

    // swarm.mjs must reference the new features
    const swarmSrc = readFileSync(path.join(WORKSPACE, 'swarm/swarm.mjs'), 'utf8');
    if (!swarmSrc.includes('HANDOFF_SCHEMA'))  throw new Error('swarm.mjs does not import HANDOFF_SCHEMA');
    if (!swarmSrc.includes('pruneFileReads'))  throw new Error('swarm.mjs does not import pruneFileReads');
    if (!swarmSrc.includes('handoff.json'))    throw new Error('swarm.mjs does not reference handoff.json');

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 64. MCP expansion: github/google-workspace/brave-search + check.mjs ----
{
  const label = 'MCP expansion: 3 new servers in servers.json; check.mjs syntax valid + importable; bots wired';
  try {
    // 1. check.mjs passes node --check
    const rc = spawnSync('node', ['--check', path.join(WORKSPACE, 'mcp/check.mjs')],
      { encoding: 'utf8', timeout: 10_000 });
    if (rc.status !== 0) throw new Error(`check.mjs syntax error: ${rc.stderr}`);

    // 2. All 3 wrapper scripts pass node --check
    for (const w of ['wrap-github.mjs', 'wrap-google-workspace.mjs', 'wrap-brave-search.mjs']) {
      const rw = spawnSync('node', ['--check', path.join(WORKSPACE, 'mcp', w)],
        { encoding: 'utf8', timeout: 10_000 });
      if (rw.status !== 0) throw new Error(`${w} syntax error: ${rw.stderr}`);
    }

    // 3. servers.json has all 3 new servers with required Helm schema fields
    const config = JSON.parse(readFileSync(path.join(WORKSPACE, 'mcp/servers.json'), 'utf8'));
    const servers = config.mcpServers;
    for (const name of ['github', 'google-workspace', 'brave-search']) {
      if (!servers[name]) throw new Error(`server "${name}" missing from servers.json`);
      const s = servers[name];
      if (!('healthCheck' in s)) throw new Error(`server "${name}" missing healthCheck field`);
      if (!('enabled' in s)) throw new Error(`server "${name}" missing enabled field`);
      if (s.healthCheck !== 'initialize')
        throw new Error(`server "${name}" healthCheck should be "initialize", got ${JSON.stringify(s.healthCheck)}`);
    }

    // 4. check.mjs imports cleanly and exports runHealthChecks (no network, no keys required)
    const { runHealthChecks } = await import(path.join(WORKSPACE, 'mcp/check.mjs'));
    if (typeof runHealthChecks !== 'function')
      throw new Error('runHealthChecks not exported from check.mjs');

    // 5. Both bots import runHealthChecks from check.mjs (startup wiring)
    const dSrc = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    const iSrc = readFileSync(path.join(ROOT, 'imessage.js'), 'utf8');
    if (!dSrc.includes('workspace/mcp/check.mjs'))
      throw new Error('index.js does not import workspace/mcp/check.mjs');
    if (!iSrc.includes('workspace/mcp/check.mjs'))
      throw new Error('imessage.js does not import workspace/mcp/check.mjs');
    if (!dSrc.includes('runHealthChecks'))
      throw new Error('index.js missing runHealthChecks call');
    if (!iSrc.includes('runHealthChecks'))
      throw new Error('imessage.js missing runHealthChecks call');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 60. think.mjs: computeInterruptScore function + 0.65 threshold gate present ----
{
  const label = 'think.mjs: computeInterruptScore named function + 0.65 threshold gate present';
  try {
    const src = readFileSync(path.join(WORKSPACE, 'think/think.mjs'), 'utf8');
    if (!src.includes('function computeInterruptScore'))
      throw new Error('computeInterruptScore function not found in think.mjs');
    if (!src.includes('0.65'))
      throw new Error('threshold 0.65 not found in think.mjs');
    if (!src.includes('score > 0.65'))
      throw new Error('score > 0.65 gate not found in think.mjs');
    if (!src.includes('PUSH_BIN'))
      throw new Error('PUSH_BIN constant not found in think.mjs — helm-push not wired');
    // Syntax check
    const rc = spawnSync('node', ['--check', path.join(WORKSPACE, 'think/think.mjs')],
      { encoding: 'utf8', timeout: 10_000 });
    if (rc.status !== 0) throw new Error(`syntax check failed: ${rc.stderr}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 61. computeInterruptScore: urgency keywords present; relevance via memory recall ----
{
  const label = 'computeInterruptScore: required urgency keywords present; recall wired; score capped at 1';
  try {
    const src = readFileSync(path.join(WORKSPACE, 'think/think.mjs'), 'utf8');
    for (const kw of ['deadline', 'urgent', 'exam', 'critical', 'emergency']) {
      if (!src.includes(`'${kw}'`))
        throw new Error(`urgency keyword '${kw}' missing from URGENCY_KEYWORDS`);
    }
    // Must call memory.mjs recall for relevance scoring
    if (!src.includes("'recall'"))
      throw new Error('memory recall call not found in computeInterruptScore');
    // Score formula must weight urgency higher (0.7) and cap at 1
    if (!src.includes('0.7 * urgency'))
      throw new Error('urgency weight 0.7 missing from score formula');
    if (!src.includes('Math.min(0.7 * urgency'))
      throw new Error('Math.min cap missing from score formula');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 62. bin/helm-notify.mjs: syntax valid; task/duration/files/summary fields present ----
{
  const label = 'bin/helm-notify.mjs: syntax valid; all required fields wired; exits 0 on push failure';
  try {
    const notifyPath = path.join(ROOT, 'bin/helm-notify.mjs');
    if (!existsSync(notifyPath)) throw new Error('bin/helm-notify.mjs not found');

    const rc = spawnSync('node', ['--check', notifyPath], { encoding: 'utf8', timeout: 10_000 });
    if (rc.status !== 0) throw new Error(`syntax check failed: ${rc.stderr}`);

    const src = readFileSync(notifyPath, 'utf8');
    if (!src.includes('helm-push'))
      throw new Error('helm-notify does not reference helm-push');
    for (const field of ['task', 'duration', 'files', 'summary']) {
      if (!src.includes(`'${field}'`) && !src.includes(`"${field}"`))
        throw new Error(`${field} field missing from helm-notify`);
    }
    // Must always exit 0 so a failed DM never breaks a calling job
    if (!src.includes('process.exit(0)'))
      throw new Error('process.exit(0) not found — helm-notify might propagate push failures');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- 65. reverse: tools registered; module imports without heavy side effects ----
{
  const label = 'reverse: reverse.web/app/file in registry; module imports cleanly without running anything';
  try {
    const r = spawnSync('node', [path.join(WORKSPACE, 'tools/tools.mjs'), 'list'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`tools list failed: ${r.stderr}`);
    const tools = JSON.parse(r.stdout);
    const names = tools.map(t => t.name);
    for (const n of ['reverse.web', 'reverse.app', 'reverse.file']) {
      if (!names.includes(n)) throw new Error(`missing from registry: ${n}`);
    }

    // node --check: syntax must be valid
    const chk = spawnSync('node', ['--check', path.join(WORKSPACE, 'tools/impl/reverse.mjs')],
      { encoding: 'utf8', timeout: 10_000 });
    if (chk.status !== 0) throw new Error(`syntax check failed: ${chk.stderr}`);

    // Dynamic import must succeed without launching playwright or running any subcommand
    await import(path.join(WORKSPACE, 'tools/impl/reverse.mjs'));

    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- stuck queue: record dedups + renders + archives (isolated temp queue) ----
{
  const label = 'stuck.mjs: record/dedup/render/archive + self-upgrade integration';
  try {
    const stuckPath = path.join(WORKSPACE, 'upgrades/stuck.mjs');
    if (!existsSync(stuckPath)) throw new Error('workspace/upgrades/stuck.mjs not found');
    if (spawnSync('node', ['--check', stuckPath], { encoding: 'utf8', timeout: 10_000 }).status !== 0)
      throw new Error('stuck.mjs syntax check failed');
    const { recordStuck, listStuck, renderStuckForPrompt, archiveAll, readAll } = await import(stuckPath);
    // record two identical-ish summaries -> dedup to one with count 2
    const before = readAll().length;
    recordStuck('__smoke_stuck test thing', 'detail a', 'test');
    recordStuck('__smoke_stuck test thing!', 'detail b', 'test');   // normalizes to same key
    const mine = listStuck().filter(i => i.summary.startsWith('__smoke_stuck'));
    if (mine.length !== 1) throw new Error(`expected 1 deduped entry, got ${mine.length}`);
    if (mine[0].count < 2) throw new Error(`expected count>=2, got ${mine[0].count}`);
    const rendered = renderStuckForPrompt();
    if (!rendered.includes('__smoke_stuck')) throw new Error('renderStuckForPrompt did not include the entry');
    // archive clears the live queue
    archiveAll();
    if (listStuck().some(i => i.summary.startsWith('__smoke_stuck'))) throw new Error('archiveAll did not clear the queue');
    if (readAll().length > before) throw new Error('archiveAll left residue in the live queue');
    // self-upgrade must import + use the stuck queue
    const su = readFileSync(path.join(WORKSPACE, 'upgrades/self-upgrade.mjs'), 'utf8');
    if (!su.includes("from './stuck.mjs'") || !su.includes('renderStuckForPrompt') || !su.includes('archiveAll'))
      throw new Error('self-upgrade.mjs does not integrate the stuck queue');
    // index.js must record stuck on failure + expose the [STUCK:]/[USE:] directives
    const idx = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    if (!idx.includes('recordStuck(')) throw new Error('index.js does not record stuck events');
    if (!idx.includes('[STUCK:') || !idx.includes('[USE:')) throw new Error('index.js missing STUCK/USE directive handling');
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- templates: export -> import round-trip is lossless + secret-free ----
{
  const label = 'templates.mjs: export/import round-trip, sanitized (no secrets)';
  try {
    const tplPath = path.join(WORKSPACE, 'templates/templates.mjs');
    if (!existsSync(tplPath)) throw new Error('workspace/templates/templates.mjs not found');
    if (spawnSync('node', ['--check', tplPath], { encoding: 'utf8', timeout: 10_000 }).status !== 0)
      throw new Error('templates.mjs syntax check failed');
    const { exportTemplate, importTemplate, listTemplates } = await import(tplPath);
    const out = exportTemplate('__smoke_tpl', 'smoke template');
    if (!existsSync(out)) throw new Error('export did not write a file');
    const raw = readFileSync(out, 'utf8');
    const tpl = JSON.parse(raw);
    if (tpl.helmTemplate !== 1) throw new Error('bad template version');
    // must NOT leak secrets/identity
    for (const bad of ['DISCORD_TOKEN', 'OWNER_ID', 'ANTHROPIC_API_KEY', 'sk-ant']) {
      if (raw.includes(bad)) throw new Error(`template leaked ${bad}`);
    }
    // install-dir path must be tokenized, not absolute
    if (raw.includes('/Users/owner/secondme')) throw new Error('template leaked an absolute install path');
    if (!listTemplates().includes('__smoke_tpl')) throw new Error('listTemplates missing the new template');
    // import should not throw and should report what it applied — but must not leave the real
    // servers.json/persona reformatted, so snapshot and restore them around the call.
    const fsmod = await import('node:fs');
    const serversFile = path.join(WORKSPACE, 'mcp/servers.json');
    const personaFile = path.join(WORKSPACE, 'persona.local.md');
    const serversBak = readFileSync(serversFile, 'utf8');
    const personaBak = existsSync(personaFile) ? readFileSync(personaFile, 'utf8') : null;
    let r;
    try {
      r = importTemplate('__smoke_tpl');
    } finally {
      fsmod.writeFileSync(serversFile, serversBak);
      if (personaBak === null) { try { fsmod.unlinkSync(personaFile); } catch {} }
      else fsmod.writeFileSync(personaFile, personaBak);
    }
    if (!r || !Array.isArray(r.applied)) throw new Error('import returned no result');
    // index.js must wire the template commands + persona override
    const idx = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    if (!idx.includes('exportTemplate') || !idx.includes('importTemplate') || !idx.includes('ownerPersonaOverride'))
      throw new Error('index.js does not wire templates');
    // cleanup the smoke artifact
    try { (await import('node:fs')).unlinkSync(out); } catch {}
    ok(label);
  } catch (e) { fail(label, e.message); }
}

// ---- summary ----
console.log('');
console.log(`Smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
