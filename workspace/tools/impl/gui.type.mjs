#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const textIdx = args.indexOf('--text');
const text = textIdx !== -1 ? args[textIdx + 1] : null;

if (!text) { console.error('--text required'); process.exit(1); }

const GUICTL = '/Users/owner/secondme/bin/guicontrol';
const r = spawnSync(GUICTL, ['type', text], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr || 'guicontrol failed'); process.exit(1); }
console.log(JSON.stringify({ ok: true, typed: text.length + ' chars' }));
