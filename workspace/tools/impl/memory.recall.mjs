#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_MJS = path.resolve(__dirname, '../../memory/memory.mjs');

const args = process.argv.slice(2);
const queryIdx = args.indexOf('--query');
const query = queryIdx !== -1 ? args[queryIdx + 1] : args[0];
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? args[limitIdx + 1] : null;

if (!query) { console.error('--query required'); process.exit(1); }

const argv = [MEMORY_MJS, 'recall', query];
if (limit) argv.push('--limit', limit);

const r = spawnSync(process.execPath, argv, { encoding: 'utf8', stdio: 'inherit' });
process.exit(r.status ?? 0);
