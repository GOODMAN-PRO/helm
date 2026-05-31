#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const requested = (outIdx !== -1 && args[outIdx + 1]) ? args[outIdx + 1] : '/tmp/helm-screen.png';

// Guard: --out must resolve under one of the allowlisted roots. Prevents the agent
// (or a crafted scheduler payload) from clobbering arbitrary files via this tool.
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE  = path.resolve(__dirname, '../..');
const SAFE_ROOTS = ['/tmp', '/private/tmp', WORKSPACE];
const out = path.resolve(requested);
const inSafeRoot = SAFE_ROOTS.some(r => out === r || out.startsWith(r + '/'));
if (!inSafeRoot) {
  console.error(`refusing --out outside safe roots (${SAFE_ROOTS.join(', ')}): ${out}`);
  process.exit(1);
}

const r = spawnSync('/usr/sbin/screencapture', ['-x', out], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr || 'screencapture failed');
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, path: out }));
