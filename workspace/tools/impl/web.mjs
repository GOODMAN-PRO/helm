#!/usr/bin/env node
// Web tool — fetch a URL or search the web via DuckDuckGo (no API key).
// web.fetch: curl-based, fast.
// web.search: tries DDG HTML endpoint first; falls back to Playwright if bot-detection fires.
// Usage: web.mjs fetch  --url <url>
//        web.mjs search --query <q> [--limit 10]

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, '../..');

const verb    = process.argv[2];
const rawArgs = process.argv.slice(3);
const get     = k => { const i = rawArgs.indexOf(`--${k}`); return i !== -1 ? rawArgs[i + 1] : null; };

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function curlGet(url) {
  // Bare 'curl' (not /usr/bin/curl): Windows 10+ ships curl.exe and POSIX has curl on PATH — cross-platform.
  const r = spawnSync('curl', [
    '-sL', '--max-time', '20', '--max-filesize', '5000000',
    '-A', UA, '--compressed',
    '-H', 'Accept: text/html,application/xhtml+xml',
    '-H', 'Accept-Language: en-US,en;q=0.9',
    url,
  ], { encoding: 'utf8', timeout: 25_000 });
  if (r.status !== 0) throw new Error(r.stderr?.trim() || `curl exit ${r.status}`);
  return r.stdout;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(p|div|section|article|header|footer|h[1-6]|li|tr|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Decode a DDG redirect URL to the real destination URL.
function decodeDDGUrl(href) {
  const m = href.match(/uddg=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch {} }
  return href;
}

// Parse DDG HTML search results (works when bot-detection is not active).
// Each organic result is in <div class="result ... web-result ..."> blocks.
function parseDDG(html) {
  const results = [];
  // Split on web-result divs (skip ads which have "result--ad")
  const blocks = html.split('<div class="result results_links');
  for (const block of blocks.slice(1)) {
    if (block.includes('result--ad')) continue;
    // Extract title from result__a
    const titleM = /class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!titleM) continue;
    const url   = decodeDDGUrl(titleM[1]);
    const title = stripHtml(titleM[2]).trim();
    // Extract snippet from result__snippet <a>
    const snipM = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    const snippet = snipM ? stripHtml(snipM[1]).trim() : '';
    if (title && url) results.push({ title, url, snippet });
  }
  return results;
}

// Playwright-based DDG search (fallback when HTML endpoint shows bot-detection).
async function playwrightSearch(query, limit) {
  const { chromium } = await import('playwright');
  const PROFILE = path.join(WORKSPACE, 'browser-profile');
  mkdirSync(PROFILE, { recursive: true });

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await ctx.newPage();

  try {
    await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`, {
      waitUntil: 'domcontentloaded', timeout: 30_000,
    });
    // Wait for result containers (DDG uses data-testid or li.result)
    await page.waitForSelector('[data-testid="result"], li.result', { timeout: 15_000 }).catch(() => {});

    const results = await page.evaluate((max) => {
      // Modern DDG: data-testid="result"
      let items = Array.from(document.querySelectorAll('[data-testid="result"]'));
      if (!items.length) {
        // Older DDG: li.result
        items = Array.from(document.querySelectorAll('li.result'));
      }
      return items.slice(0, max).map(item => {
        const titleEl   = item.querySelector('[data-testid="result-title-a"], h2 a, .result__a');
        const snippetEl = item.querySelector('[data-testid="result-snippet"], .result__snippet');
        return {
          title:   titleEl?.textContent?.trim() || '',
          url:     titleEl?.href || '',
          snippet: snippetEl?.textContent?.trim() || '',
        };
      }).filter(r => r.title);
    }, limit);

    return results;
  } finally {
    await ctx.close();
  }
}

// ---- verbs ----

if (verb === 'fetch') {
  const url = get('url');
  if (!url) { console.error('--url required'); process.exit(1); }

  try {
    const html   = curlGet(url);
    const isHtml = /<html/i.test(html.slice(0, 1000)) || html.trimStart().startsWith('<');
    const text   = isHtml ? stripHtml(html) : html;
    console.log(JSON.stringify({ ok: true, url, length: text.length, text: text.slice(0, 12_000) }));
  } catch (e) { console.error(e.message); process.exit(1); }

} else if (verb === 'search') {
  const query = get('query');
  const limit = Math.min(Math.max(parseInt(get('limit') || '10', 10), 1), 20);
  if (!query) { console.error('--query required'); process.exit(1); }

  let results = [];
  let source  = '';

  // Attempt 1: DDG HTML endpoint via curl (fast, no browser launch)
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const html   = curlGet(ddgUrl);

    if (html.includes('challenge-form') || html.includes('anomaly.js') || html.includes('DuckDuckGo\n    </title>')) {
      throw new Error('bot-detection page returned');
    }

    results = parseDDG(html).slice(0, limit);
    source  = 'ddg-html';
  } catch {
    // Attempt 2: Playwright navigating real DDG (JS rendered, bypasses bot detection)
    try {
      results = (await playwrightSearch(query, limit)).slice(0, limit);
      source  = 'playwright-ddg';
    } catch (pwErr) {
      console.error(`web.search failed: ${pwErr.message}`);
      process.exit(1);
    }
  }

  console.log(JSON.stringify({ ok: true, query, count: results.length, results, source }));

} else {
  console.error(`unknown web verb: ${verb}. Use fetch or search.`);
  process.exit(1);
}
