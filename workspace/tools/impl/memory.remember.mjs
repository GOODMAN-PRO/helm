#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_MJS = path.resolve(__dirname, '../../memory/memory.mjs');

const args = process.argv.slice(2);
const get = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i+1] : null; };

const kind  = get('kind');
const key   = get('key');
const value = get('value');

if (!kind || !key || !value) { console.error('--kind, --key, and --value required'); process.exit(1); }

const argv = [MEMORY_MJS, 'remember', kind, key, value];
const conf = get('confidence');
if (conf) argv.push('--confidence', conf);

const r = spawnSync(process.execPath, argv, { encoding: 'utf8', stdio: 'inherit' });
process.exit(r.status ?? 0);
