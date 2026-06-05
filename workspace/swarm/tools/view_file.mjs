import { readFileSync } from 'node:fs';
import path from 'node:path';

export function view_file(file, startLine = 1, cwd = process.cwd()) {
  const absPath = path.resolve(cwd, file);
  const lines = readFileSync(absPath, 'utf8').split('\n');
  const start = Math.max(0, startLine - 1);
  const end = Math.min(lines.length, start + 100);
  return lines.slice(start, end).map((l, i) => `${start + i + 1}\t${l}`).join('\n');
}
