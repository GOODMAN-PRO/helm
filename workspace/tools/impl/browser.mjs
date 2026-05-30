#!/usr/bin/env node
// Unified CLI entry: browser.mjs <verb> [--url <url>] [--selector <sel>] [--text <txt>] [--out <path>]
// Delegates to browser-shared.mjs; playwright is imported lazily there.

import { fileURLToPath } from 'node:url';

async function main() {
  const verb    = process.argv[2];
  const rawArgs = process.argv.slice(3);
  const get     = k => { const i = rawArgs.indexOf(`--${k}`); return i !== -1 ? rawArgs[i + 1] : null; };

  if (!verb) { console.error('usage: browser.mjs <verb>'); process.exit(1); }

  const { runBrowser } = await import('./browser-shared.mjs');

  const params = {
    url:      get('url'),
    selector: get('selector'),
    text:     get('text'),
    out:      get('out'),
  };

  const result = await runBrowser(verb, params);
  console.log(JSON.stringify(result));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
