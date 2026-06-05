import { readFileSync } from 'node:fs';
import path from 'node:path';

export function search_file(file, pattern, cwd = process.cwd()) {
  const absPath = path.resolve(cwd, file);
  const lines = readFileSync(absPath, 'utf8').split('\n');
  const re = new RegExp(pattern, 'i');
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) results.push({ line: i + 1, text: lines[i] });
    if (results.length >= 20) break;
  }
  return results;
}
