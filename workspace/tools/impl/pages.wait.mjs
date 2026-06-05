#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const get = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
  const url = get('url');
  const timeout = Math.max(5, parseInt(get('timeout') || '180', 10) || 180);
  if (!url) { console.error('--url required'); process.exit(1); }

  const start = Date.now();
  let lastStatus = 0, lastErr = null;
  while ((Date.now() - start) / 1000 < timeout) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'Cache-Control': 'no-cache' } });
      lastStatus = res.status; lastErr = null;
      if (res.ok) {
        console.log(JSON.stringify({ ok: true, live: true, url, status: res.status, waited_s: Math.round((Date.now() - start) / 1000) }));
        return;
      }
    } catch (e) { lastStatus = 0; lastErr = String(e.message || e); }
    await sleep(4000);
  }
  console.log(JSON.stringify({
    ok: true, live: false, url, status: lastStatus, error: lastErr, waited_s: timeout,
    note: "still not serving after timeout — a GitHub Pages first build can take 1-3 min; wait and try again, and don't tell the owner it's live yet.",
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
