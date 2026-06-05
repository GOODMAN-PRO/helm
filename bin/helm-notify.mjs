#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUSH_BIN = path.join(__dirname, 'helm-push.mjs');

const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : null;
}

const task     = flag('task')     || 'job';
const duration = flag('duration');
const files    = flag('files');
const summary  = flag('summary')  || '';

// Build a compact single-line message: [DONE] task | Xs | N files changed | summary
const parts = [`[DONE] ${task}`];
if (duration !== null) {
  const secs = Number(duration);
  parts.push(Number.isFinite(secs) ? `${secs.toFixed(0)}s` : String(duration));
}
if (files !== null) {
  const n = Number(files);
  parts.push(`${Number.isFinite(n) ? n : files} file${n === 1 ? '' : 's'} changed`);
}
if (summary) parts.push(summary.slice(0, 200));

const message = parts.join(' | ');

try {
  const r = spawnSync(process.execPath, [PUSH_BIN, message], { encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write('helm-notify: push failed: ' + (r.stderr || '').trim() + '\n');
  } else {
    process.stdout.write('ok\n');
  }
} catch (e) {
  process.stderr.write('helm-notify: ' + (e.message || String(e)) + '\n');
}

process.exit(0);
