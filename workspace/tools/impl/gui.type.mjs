#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { winInput } from './win-input.mjs';

const args = process.argv.slice(2);
const textIdx = args.indexOf('--text');
const text = textIdx !== -1 ? args[textIdx + 1] : null;

if (text == null) { console.error('--text required'); process.exit(1); }

if (process.platform === 'win32') {
  const r = winInput({ verb: 'type', text });
  if (!r.ok) { console.error(r.error || 'windows type failed'); process.exit(1); }
  console.log(JSON.stringify({ ok: true, typed: text.length + ' chars' }));
} else if (process.platform === 'darwin') {
  const GUICTL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../bin/guicontrol');
  const r = spawnSync(GUICTL, ['type', text], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr || 'guicontrol failed'); process.exit(1); }
  console.log(JSON.stringify({ ok: true, typed: text.length + ' chars' }));
} else {
  console.error('keyboard control not supported on ' + process.platform);
  process.exit(1);
}
