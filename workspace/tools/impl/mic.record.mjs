#!/usr/bin/env node
// Tool: mic.record [--seconds N]
// Records a WAV clip from the default mic. Returns path or install note.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '../../senses/mic/record.mjs');

const r = spawnSync(process.execPath, [SCRIPT, ...process.argv.slice(2)],
  { encoding: 'utf8', timeout: 320000 });
process.stdout.write(r.stdout);
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 0);
