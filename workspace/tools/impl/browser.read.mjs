#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

async function main() {
  const { runBrowser } = await import('./browser-shared.mjs');
  const result = await runBrowser('read', {});
  console.log(JSON.stringify(result));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
