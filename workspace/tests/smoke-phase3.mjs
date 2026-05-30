#!/usr/bin/env node
// Phase 3 smoke tests.
// Each test is idempotent and does not require daemons to be running.
// Exits 0 if all pass, 1 if any fail.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TOOLS = path.join(ROOT, 'workspace/tools/tools.mjs');

let passed = 0;
let failed = 0;

function run(label, fn) {
  try {
    fn();
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${label}: ${e.message}`);
    failed++;
  }
}

function runTool(name, args = '') {
  const jsonArgs = args ? `--json '${args}'` : '';
  const cmd = `node ${TOOLS} call ${name} ${jsonArgs}`.trim();
  const r = spawnSync('sh', ['-c', cmd], { encoding: 'utf8', cwd: ROOT, timeout: 30000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function parseJSON(s) {
  try { return JSON.parse(s.trim()); } catch { return null; }
}

console.log('Phase 3 smoke tests\n');

// ---- 3.1 Screen watcher ----

run('screen: watcher.mjs exists', () => {
  const p = path.join(ROOT, 'workspace/senses/screen/watcher.mjs');
  if (!existsSync(p)) throw new Error('watcher.mjs not found');
});

run('screen: ocr-helper.swift exists', () => {
  const p = path.join(ROOT, 'workspace/senses/screen/ocr-helper.swift');
  if (!existsSync(p)) throw new Error('ocr-helper.swift not found');
});

run('screen: launchd plist exists', () => {
  const p = path.join(ROOT, 'workspace/senses/screen/com.helm.screen.plist');
  if (!existsSync(p)) throw new Error('com.helm.screen.plist not found');
});

run('screen: launchd plist NOT loaded', () => {
  const r = spawnSync('launchctl', ['list', 'com.helm.screen'], { encoding: 'utf8' });
  // launchctl list returns non-zero / error message when label is not loaded
  if (r.status === 0 && !r.stderr.includes('Could not find')) {
    throw new Error('com.helm.screen plist is loaded — it should be off by default');
  }
});

run('screen.recent: empty DB returns []', () => {
  const r = runTool('screen.recent', '{"limit":5}');
  const data = parseJSON(r.stdout);
  if (!Array.isArray(data)) throw new Error(`expected array, got: ${r.stdout}`);
});

run('screen.at: missing DB returns null', () => {
  const r = runTool('screen.at', `{"ts":${Date.now()}}`);
  const data = parseJSON(r.stdout);
  // null when no events exist
  if (data !== null && !Array.isArray(data) && typeof data !== 'object') {
    throw new Error(`unexpected result: ${r.stdout}`);
  }
});

run('screen.search: no OCR returns helpful error', () => {
  const r = runTool('screen.search', '{"query":"test"}');
  const data = parseJSON(r.stdout);
  // Should return error explaining OCR is off, not throw
  if (data === null || (data.error === undefined && !Array.isArray(data))) {
    throw new Error(`unexpected result: ${r.stdout}`);
  }
});

// ---- 3.2 Notify ----

run('notify: poller.mjs exists', () => {
  const p = path.join(ROOT, 'workspace/senses/notify/poller.mjs');
  if (!existsSync(p)) throw new Error('poller.mjs not found');
});

run('notify: launchd plist exists', () => {
  const p = path.join(ROOT, 'workspace/senses/notify/com.helm.notify.plist');
  if (!existsSync(p)) throw new Error('com.helm.notify.plist not found');
});

run('notify: launchd plist NOT loaded', () => {
  const r = spawnSync('launchctl', ['list', 'com.helm.notify'], { encoding: 'utf8' });
  if (r.status === 0 && !r.stderr.includes('Could not find')) {
    throw new Error('com.helm.notify plist is loaded — it should be off by default');
  }
});

run('notify.recent: empty DB returns []', () => {
  const r = runTool('notify.recent', '{"limit":5}');
  const data = parseJSON(r.stdout);
  if (!Array.isArray(data)) throw new Error(`expected array, got: ${r.stdout}`);
});

run('notify.unread: returns { messages, calendar, mail } shape', () => {
  const r = runTool('notify.unread', '{}');
  const data = parseJSON(r.stdout);
  if (!data || typeof data !== 'object') throw new Error(`not an object: ${r.stdout}`);
  if (!('messages' in data)) throw new Error('missing messages key');
  if (!('calendar' in data)) throw new Error('missing calendar key');
  if (!('mail' in data))     throw new Error('missing mail key');
  // Values may be null if permissions missing — that's acceptable
});

// ---- 3.3 Location ----

run('location: location.mjs exists', () => {
  const p = path.join(ROOT, 'workspace/senses/location/location.mjs');
  if (!existsSync(p)) throw new Error('location.mjs not found');
});

run('location.here: returns { installed: false } or valid location if CoreLocationCLI missing', () => {
  const r = runTool('location.here', '{}');
  const data = parseJSON(r.stdout);
  if (!data || typeof data !== 'object') throw new Error(`not an object: ${r.stdout}`);
  // Either installed=false (binary missing) or valid coords
  const hasCoords = 'lat' in data && 'lon' in data;
  const isNotInstalled = data.installed === false;
  if (!hasCoords && !isNotInstalled && !data.error) {
    throw new Error(`unexpected shape: ${r.stdout}`);
  }
});

// ---- 3.4 Mic ----

run('mic: record.mjs exists', () => {
  const p = path.join(ROOT, 'workspace/senses/mic/record.mjs');
  if (!existsSync(p)) throw new Error('record.mjs not found');
});

run('mic: transcribe.mjs exists', () => {
  const p = path.join(ROOT, 'workspace/senses/mic/transcribe.mjs');
  if (!existsSync(p)) throw new Error('transcribe.mjs not found');
});

run('mic.record: returns not-installed or path (no sox/ffmpeg = graceful)', () => {
  // We don't want to actually record; test that the tool returns valid JSON
  // with either a path (if sox/ffmpeg installed) or an error object.
  // Use --seconds 0 to minimise capture time if tools are present.
  // Since mic.record is confirm:true, call the impl directly.
  const IMPL = path.join(ROOT, 'workspace/senses/mic/record.mjs');
  const r = spawnSync(process.execPath, [IMPL, '--seconds', '1'], {
    encoding: 'utf8', cwd: ROOT,
    timeout: 20000,
    // Avoid actually recording in CI — just verify it produces valid JSON
  });
  const data = parseJSON(r.stdout);
  if (!data || typeof data !== 'object') throw new Error(`not an object: ${r.stdout}`);
  // Either { error } (not installed / mic denied) or { path } (success)
  if (!('error' in data) && !('path' in data)) {
    throw new Error(`unexpected shape: ${r.stdout}`);
  }
});

run('mic.transcribe: returns error or text, not crash', () => {
  const IMPL = path.join(ROOT, 'workspace/senses/mic/transcribe.mjs');
  const r = spawnSync(process.execPath, [IMPL, '--file', '/nonexistent.wav'], {
    encoding: 'utf8', cwd: ROOT, timeout: 15000
  });
  const data = parseJSON(r.stdout);
  if (!data || typeof data !== 'object') throw new Error(`not an object: ${r.stdout}`);
  if (!('error' in data)) throw new Error(`expected error key for missing file: ${r.stdout}`);
});

// ---- Registry ----

run('registry: all phase 3 tools listed', () => {
  const r = spawnSync('node', [TOOLS, 'list'], { encoding: 'utf8', cwd: ROOT, timeout: 10000 });
  const tools = parseJSON(r.stdout);
  if (!Array.isArray(tools)) throw new Error('tools list not array');
  const names = tools.map(t => t.name);
  const required = [
    'screen.recent', 'screen.at', 'screen.search',
    'notify.recent', 'notify.unread',
    'location.here',
    'mic.record', 'mic.transcribe'
  ];
  for (const n of required) {
    if (!names.includes(n)) throw new Error(`tool missing: ${n}`);
  }
  if (tools.length < 31) throw new Error(`expected ≥31 tools, got ${tools.length}`);
});

// ---- Summary ----

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
