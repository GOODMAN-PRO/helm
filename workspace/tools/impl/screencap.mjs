#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = (outIdx !== -1 && args[outIdx + 1]) ? args[outIdx + 1] : '/tmp/helm-screen.png';

const r = spawnSync('/usr/sbin/screencapture', ['-x', out], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr || 'screencapture failed');
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, path: out }));
