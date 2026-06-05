import { spawnSync } from 'node:child_process';

export function search_repo(pattern, cwd = process.cwd()) {
  const r = spawnSync('git', ['-C', cwd, 'ls-files'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) return [];
  return r.stdout.trim().split('\n').filter(f => f && f.includes(pattern)).slice(0, 50);
}
