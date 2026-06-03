#!/usr/bin/env node
// Scroll the wheel at the current cursor (or at --x/--y). amount = notches; negative = down (default -3).
import { winInput } from './win-input.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
const amount = Number(get('amount') ?? get('clicks') ?? -3);
const horizontal = args.includes('--horizontal');
const x = get('x'), y = get('y');

if (process.platform === 'win32') {
  const r = winInput({ verb: 'scroll', amount, horizontal, x: x != null ? Number(x) : null, y: y != null ? Number(y) : null });
  if (!r.ok) { console.error(r.error || 'scroll failed'); process.exit(1); }
  console.log(JSON.stringify({ ok: true, scrolled: amount, horizontal, cursor: r.cursor || null }));
} else if (process.platform === 'darwin') {
  const GUICTL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../bin/guicontrol');
  const r = spawnSync(GUICTL, ['scroll', String(amount)], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr || 'guicontrol scroll failed'); process.exit(1); }
  console.log(JSON.stringify({ ok: true, scrolled: amount }));
} else { console.error('scroll not supported on ' + process.platform); process.exit(1); }
