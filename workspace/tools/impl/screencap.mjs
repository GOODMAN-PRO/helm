#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { captureScreen, defaultShotPath, safeRoots } from './capture-screen.mjs';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const requested = (outIdx !== -1 && args[outIdx + 1]) ? args[outIdx + 1] : defaultShotPath();

const direct = args.includes('--direct');



const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE  = path.resolve(__dirname, '../..');
const SAFE_ROOTS = safeRoots(WORKSPACE);
const out = path.resolve(requested);
const inSafeRoot = SAFE_ROOTS.some(r => out === r || out.startsWith(r + path.sep) || out.startsWith(r + '/'));
if (!inSafeRoot) {
  console.error(`refusing --out outside safe roots (${SAFE_ROOTS.join(', ')}): ${out}`);
  process.exit(1);
}

const r = captureScreen(out, { direct });
if (!r.ok) {
  console.error(r.error || 'screen capture failed');
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, path: out }));
