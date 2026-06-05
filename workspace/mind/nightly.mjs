#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIND = path.join(__dirname, '../tools/impl/mind.mjs');
const LOG = path.join(__dirname, 'mind.log');
const log = m => { try { appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch {} };

for (const verb of ['synthesize', 'health']) {
  log(`mind ${verb} start`);
  const r = spawnSync(process.execPath, [MIND, verb], { encoding: 'utf8', timeout: 20 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  log(`mind ${verb} exit ${r.status}: ${((r.stdout || r.stderr || '').trim().slice(0, 400))}`);
}
log('nightly mind pass done');
