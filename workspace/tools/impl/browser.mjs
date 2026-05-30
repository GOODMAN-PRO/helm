#!/usr/bin/env node
// Browser tool — shared impl for all browser.* verbs.
// Session state (current URL) persists in workspace/browser-state.json between calls.
// Profile dir (workspace/browser-profile/) persists cookies/logins across invocations.
// Usage: browser.mjs <verb> [--url <url>] [--selector <sel>] [--text <txt>] [--out <path>]

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE  = path.resolve(__dirname, '../..');
const PROFILE    = path.join(WORKSPACE, 'browser-profile');
const STATE_FILE = path.join(WORKSPACE, 'browser-state.json');

const verb    = process.argv[2];
const rawArgs = process.argv.slice(3);
const get     = k => { const i = rawArgs.indexOf(`--${k}`); return i !== -1 ? rawArgs[i + 1] : null; };

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(s) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

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

async function run() {
  if (verb === 'close') {
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
    console.log(JSON.stringify({ ok: true, action: 'session cleared' }));
    return;
  }

  const state = loadState();
  const targetUrl = get('url') || state.url;

  if (!targetUrl) {
    console.error('no active URL: call browser.open --url <url> first');
    process.exit(1);
  }

  mkdirSync(PROFILE, { recursive: true });

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await ctx.newPage();

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const currentUrl = page.url();
    const title      = await page.title();
    saveState({ url: currentUrl });

    if (verb === 'open' || verb === 'read') {
      const html = await page.content();
      const text = stripHtml(html);
      console.log(JSON.stringify({ ok: true, url: currentUrl, title, text: text.slice(0, 10_000) }));

    } else if (verb === 'click') {
      const selector = get('selector');
      if (!selector) { console.error('--selector required'); process.exit(1); }
      await page.click(selector, { timeout: 10_000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
      const newUrl   = page.url();
      const newTitle = await page.title();
      saveState({ url: newUrl });
      console.log(JSON.stringify({ ok: true, url: newUrl, title: newTitle }));

    } else if (verb === 'fill') {
      const selector = get('selector');
      const text     = get('text');
      if (!selector || !text) { console.error('--selector and --text required'); process.exit(1); }
      await page.fill(selector, text, { timeout: 10_000 });
      console.log(JSON.stringify({ ok: true, selector, filled: text.length, url: currentUrl }));

    } else if (verb === 'screenshot') {
      const out = get('out') || '/tmp/helm-browser.png';
      await page.screenshot({ path: out, fullPage: false });
      console.log(JSON.stringify({ ok: true, path: out, url: currentUrl }));

    } else {
      console.error(`unknown browser verb: ${verb}`);
      process.exit(1);
    }
  } finally {
    await ctx.close();
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
