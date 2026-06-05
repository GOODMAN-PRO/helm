#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, '..');
const ROOT      = path.resolve(__dirname, '../..');
const IMPL      = path.join(WORKSPACE, 'tools/impl');

let passed = 0, failed = 0;
function ok(label)          { console.log(`  PASS  ${label}`); passed++; }
function fail(label, reason) { console.error(`  FAIL  ${label}: ${reason}`); failed++; }


{
  const label = 'registry.json contains all Phase 2 tool entries';
  try {
    const reg = JSON.parse(readFileSync(path.join(WORKSPACE, 'tools/registry.json'), 'utf8'));
    const names = reg.map(t => t.name);
    const required = [
      'browser.open', 'browser.read', 'browser.click', 'browser.fill',
      'browser.screenshot', 'browser.close',
      'imessage.send_to',
      'calendar.list', 'calendar.add',
      'finder.search', 'finder.reveal',
      'web.fetch', 'web.search',
    ];
    const missing = required.filter(n => !names.includes(n));
    if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}


{
  const label = 'All Phase 2 impl scripts exist on disk';
  try {
    const files = [
      'browser.mjs', 'imessage.send_to.mjs', 'calendar.mjs', 'finder.mjs', 'web.mjs',
    ];
    const missing = files.filter(f => !existsSync(path.join(IMPL, f)));
    if (missing.length) throw new Error(`missing impl files: ${missing.join(', ')}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}


{
  const label = 'playwright package is installed and importable';
  try {
    const pkg = path.join(ROOT, 'node_modules/playwright/package.json');
    if (!existsSync(pkg)) throw new Error('node_modules/playwright not found — run npm install playwright');
    const { version } = JSON.parse(readFileSync(pkg, 'utf8'));
    ok(`${label} (v${version})`);
  } catch (e) { fail(label, e.message); }
}


{
  const label = 'Playwright Chromium binary is installed';
  try {
    const r = spawnSync('node', [
      '-e',
      `import('playwright').then(m => m.chromium.executablePath()).then(p => { require('fs').statSync(p); console.log(p); }).catch(e => { process.stderr.write(e.message); process.exit(1); })`,
    ], { encoding: 'utf8', timeout: 15_000, shell: false });


    const cacheBase = path.join(os.homedir(), 'Library/Caches/ms-playwright');
    if (!existsSync(cacheBase)) throw new Error('ms-playwright cache dir not found — run: npx playwright install chromium');
    const { readdirSync } = await import('node:fs');
    const entries = readdirSync(cacheBase);
    const hasChromium = entries.some(e => e.startsWith('chromium'));
    if (!hasChromium) throw new Error('no chromium* dir in ms-playwright cache — run: npx playwright install chromium');
    ok(label);
  } catch (e) { fail(label, e.message); }
}


{
  const label = 'tools list returns >= 23 total tools after Phase 2';
  try {
    const r = spawnSync('node', [path.join(WORKSPACE, 'tools/tools.mjs'), 'list'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`);
    const tools = JSON.parse(r.stdout);
    if (tools.length < 23) throw new Error(`only ${tools.length} tools (expected >= 23)`);
    ok(`${label} (${tools.length} tools)`);
  } catch (e) { fail(label, e.message); }
}


{
  const label = 'tools dispatcher exits 2 for confirm:true tool without --force';
  try {
    const r = spawnSync('node', [
      path.join(WORKSPACE, 'tools/tools.mjs'), 'call', 'imessage.send_to',
      '--json', '{"handle":"+000","text":"test"}',
    ], { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 2) throw new Error(`expected exit 2 (confirm gate), got exit ${r.status}`);
    if (!r.stderr.includes('CONFIRM REQUIRED')) throw new Error('CONFIRM REQUIRED message missing from stderr');
    ok(label);
  } catch (e) { fail(label, e.message); }
}


{
  const label = 'finder.mjs search exits 1 when --query missing';
  try {
    const r = spawnSync('node', [path.join(IMPL, 'finder.mjs'), 'search'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 1) throw new Error(`expected exit 1, got ${r.status}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}


{
  const label = 'web.mjs fetch exits 1 when --url missing';
  try {
    const r = spawnSync('node', [path.join(IMPL, 'web.mjs'), 'fetch'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 1) throw new Error(`expected exit 1, got ${r.status}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}


{
  const label = 'calendar.mjs add exits 1 when required args missing';
  try {
    const r = spawnSync('node', [path.join(IMPL, 'calendar.mjs'), 'add'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 1) throw new Error(`expected exit 1, got ${r.status}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}


{
  const label = 'browser.mjs read exits 1 when no active session';
  try {

    const stateFile = path.join(WORKSPACE, 'browser-state.json');
    const { unlinkSync, existsSync: exists } = await import('node:fs');
    if (exists(stateFile)) unlinkSync(stateFile);

    const r = spawnSync('node', [path.join(IMPL, 'browser.mjs'), 'read'],
      { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 1) throw new Error(`expected exit 1, got ${r.status}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}


{
  const label = 'mdfind binary exists at /usr/bin/mdfind';
  try {
    if (!existsSync('/usr/bin/mdfind')) throw new Error('mdfind not found');
    ok(label);
  } catch (e) { fail(label, e.message); }
}


{
  const label = 'tools dispatcher exits 2 for calendar.add without --force';
  try {
    const r = spawnSync('node', [
      path.join(WORKSPACE, 'tools/tools.mjs'), 'call', 'calendar.add',
      '--json', '{"title":"t","start":"2026-06-01T10:00:00","end":"2026-06-01T11:00:00"}',
    ], { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 2) throw new Error(`expected exit 2, got ${r.status}`);
    ok(label);
  } catch (e) { fail(label, e.message); }
}


console.log('');
console.log(`Phase 2 smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
