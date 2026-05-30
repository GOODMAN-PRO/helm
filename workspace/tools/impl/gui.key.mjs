#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const get = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i+1] : null; };

const code = get('code');
const mods = get('mods');

if (!code) { console.error('--code required'); process.exit(1); }

const GUICTL = '/Users/owner/secondme/bin/guicontrol';
const r = spawnSync(GUICTL, mods ? ['key', code, mods] : ['key', code], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr || 'guicontrol failed'); process.exit(1); }
console.log(JSON.stringify({ ok: true, code: Number(code), mods: mods || null }));
