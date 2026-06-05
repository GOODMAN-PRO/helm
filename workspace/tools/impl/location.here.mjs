#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '../../senses/location/location.mjs');

const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', timeout: 20000 });
process.stdout.write(r.stdout);
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 0);
