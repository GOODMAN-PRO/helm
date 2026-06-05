import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function makeRunDir(slug) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
  const safe = (slug || 'run').replace(/[^a-z0-9-]/gi, '-').slice(0, 40);
  const dir = path.join(__dirname, `${ts}-${safe}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function appendLog(runDir, obj) {
  const line = JSON.stringify({ ts: Date.now(), ...obj });
  appendFileSync(path.join(runDir, 'log.jsonl'), line + '\n');
}

export function finaliseRun(runDir, result) {
  writeFileSync(path.join(runDir, 'result.md'), result);
}
