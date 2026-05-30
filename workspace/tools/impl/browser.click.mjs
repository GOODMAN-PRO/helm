#!/usr/bin/env node
// Click a CSS selector on the current page; follows navigation.
// playwright is imported lazily inside runBrowser — safe to import without launching a browser.

import { fileURLToPath } from 'node:url';

async function main() {
  const rawArgs = process.argv.slice(2);
  const get = k => { const i = rawArgs.indexOf(`--${k}`); return i !== -1 ? rawArgs[i + 1] : null; };
  const { runBrowser } = await import('./browser-shared.mjs');
  const result = await runBrowser('click', { selector: get('selector') });
  console.log(JSON.stringify(result));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
