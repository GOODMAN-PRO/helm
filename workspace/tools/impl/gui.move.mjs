#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { winInput, screenBounds, resolveAnchor } from './win-input.mjs';

const args = process.argv.slice(2);
const get = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
let x = get('x'), y = get('y');
const at = get('at'), xpct = get('xpct'), ypct = get('ypct');


if (x == null || y == null) {
  if (process.platform !== 'win32') { console.error('named/percent targets need Windows; on macOS pass --x and --y'); process.exit(1); }
  const b = screenBounds();
  if (!b.ok) { console.error(b.error); process.exit(1); }
  if (at) {
    const p = resolveAnchor(at, b);
    if (!p) { console.error('unknown anchor "' + at + '" — use top-left|top-right|bottom-left|bottom-right|center|top|bottom|left|right'); process.exit(1); }
    [x, y] = p;
  } else if (xpct != null && ypct != null) {
    x = b.left + Math.round((b.width - 1) * Number(xpct) / 100);
    y = b.top + Math.round((b.height - 1) * Number(ypct) / 100);
  } else {
    console.error('provide --x and --y, or --at <anchor>, or --xpct and --ypct'); process.exit(1);
  }
}
x = Number(x); y = Number(y);

if (process.platform === 'win32') {
  const r = winInput({ verb: 'move', x, y });
  if (!r.ok) { console.error(r.error || 'windows move failed'); process.exit(1); }
  console.log(JSON.stringify({ ok: true, verb: 'move', x, y, cursor: r.cursor || null }));
} else if (process.platform === 'darwin') {
  const GUICTL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../bin/guicontrol');
  const r = spawnSync(GUICTL, ['move', String(x), String(y)], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr || 'guicontrol failed'); process.exit(1); }
  console.log(JSON.stringify({ ok: true, verb: 'move', x, y }));
} else {
  console.error('mouse control not supported on ' + process.platform); process.exit(1);
}
