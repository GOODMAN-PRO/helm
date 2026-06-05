#!/usr/bin/env node
import { winInput } from './win-input.mjs';

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
const x = get('x'), y = get('y'), x2 = get('x2'), y2 = get('y2');
if (x == null || y == null || x2 == null || y2 == null) { console.error('drag needs --x --y --x2 --y2'); process.exit(1); }
if (process.platform !== 'win32') { console.error('gui.drag is Windows-only here (macOS: use bin/guicontrol)'); process.exit(1); }

const r = winInput({ verb: 'drag', x: Number(x), y: Number(y), x2: Number(x2), y2: Number(y2) });
if (!r.ok) { console.error(r.error || 'drag failed'); process.exit(1); }
console.log(JSON.stringify({ ok: true, from: [Number(x), Number(y)], to: [Number(x2), Number(y2)], cursor: r.cursor || null }));
