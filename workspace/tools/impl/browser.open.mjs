#!/usr/bin/env node
// Open a URL in headless Chromium. Returns page text.
// playwright is imported lazily inside runBrowser — safe to import this module without launching a browser.

import { fileURLToPath } from 'node:url';

async function main() {
  const rawArgs = process.argv.slice(2);
  const get = k => { const i = rawArgs.indexOf(`--${k}`); return i !== -1 ? rawArgs[i + 1] : null; };
  const { runBrowser } = await import('./browser-shared.mjs');
  const result = await runBrowser('open', { url: get('url') });
  console.log(JSON.stringify(result));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
