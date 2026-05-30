#!/usr/bin/env node
// Read text content of the current browser page (set by last browser.open or browser.click).
// playwright is imported lazily inside runBrowser — safe to import without launching a browser.

import { fileURLToPath } from 'node:url';

async function main() {
  const { runBrowser } = await import('./browser-shared.mjs');
  const result = await runBrowser('read', {});
  console.log(JSON.stringify(result));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
