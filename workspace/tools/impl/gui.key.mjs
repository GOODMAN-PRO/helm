#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { winInput } from './win-input.mjs';

const args = process.argv.slice(2);
const get = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i+1] : null; };

const code = get('code');
const mods = get('mods');

if (!code) { console.error('--code required'); process.exit(1); }

if (process.platform === 'win32') {

  const r = winInput({ verb: 'key', code });
  if (!r.ok) { console.error(r.error || 'windows key failed'); process.exit(1); }
  console.log(JSON.stringify({ ok: true, code }));
} else if (process.platform === 'darwin') {
  const GUICTL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../bin/guicontrol');
  const r = spawnSync(GUICTL, mods ? ['key', code, mods] : ['key', code], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr || 'guicontrol failed'); process.exit(1); }
  console.log(JSON.stringify({ ok: true, code: Number(code), mods: mods || null }));
} else {
  console.error('keyboard control not supported on ' + process.platform);
  process.exit(1);
}
