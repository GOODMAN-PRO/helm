#!/usr/bin/env node
// Tool: mic.transcribe --file <path>
// Runs whisper.cpp against a WAV file. Returns text or install note.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '../../senses/mic/transcribe.mjs');

const r = spawnSync(process.execPath, [SCRIPT, ...process.argv.slice(2)],
  { encoding: 'utf8', timeout: 130000 });
process.stdout.write(r.stdout);
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 0);
