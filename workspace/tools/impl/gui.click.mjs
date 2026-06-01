#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const get = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i+1] : null; };

const x      = get('x');
const y      = get('y');
const button = get('button') || 'left';

if (!x || !y) { console.error('--x and --y required'); process.exit(1); }

const GUICTL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../bin/guicontrol');
const verb   = button === 'double' ? 'doubleclick' : button === 'right' ? 'rightclick' : 'click';
const r = spawnSync(GUICTL, [verb, x, y], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr || 'guicontrol failed'); process.exit(1); }
console.log(JSON.stringify({ ok: true, verb, x: Number(x), y: Number(y) }));
