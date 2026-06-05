#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { macOnlyOrExit } from './mac-only.mjs';

macOnlyOrExit('finder');
const verb    = process.argv[2];
const rawArgs = process.argv.slice(3);
const get     = k => { const i = rawArgs.indexOf(`--${k}`); return i !== -1 ? rawArgs[i + 1] : null; };

if (verb === 'search') {
  const query = get('query');
  const limit = parseInt(get('limit') || '50', 10);
  if (!query) { console.error('--query required'); process.exit(1); }

  const r = spawnSync('/usr/bin/mdfind', [query], { encoding: 'utf8', timeout: 15_000 });
  if (r.status !== 0) {
    console.error(r.stderr?.trim() || 'mdfind failed');
    process.exit(1);
  }
  const paths = r.stdout.trim().split('\n').filter(Boolean).slice(0, limit);
  console.log(JSON.stringify({ ok: true, query, count: paths.length, paths }));

} else if (verb === 'reveal') {
  const p = get('path');
  if (!p) { console.error('--path required'); process.exit(1); }

  const script = `tell application "Finder"\nreveal POSIX file ${JSON.stringify(p)}\nactivate\nend tell`;
  const r = spawnSync('/usr/bin/osascript', ['-e', script], { encoding: 'utf8', timeout: 10_000 });
  if (r.status !== 0) {
    console.error(r.stderr?.trim() || 'osascript failed');
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, path: p }));

} else {
  console.error(`unknown finder verb: ${verb}. Use search or reveal.`);
  process.exit(1);
}
