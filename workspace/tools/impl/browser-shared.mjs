// Shared browser implementation. playwright is imported lazily inside runBrowser()
// so this module is safe to import without triggering a browser launch or chromium download.

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE  = path.resolve(__dirname, '../..');
export const PROFILE    = path.join(WORKSPACE, 'browser-profile');
export const STATE_FILE = path.join(WORKSPACE, 'browser-state.json');

export function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

export function saveState(s) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
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

async function ensureChromium(chromium) {
  // Auto-install on first use if the binary is missing.
  const exePath = chromium.executablePath();
  if (!existsSync(exePath)) {
    const { execSync } = await import('node:child_process');
    console.error('[browser] Chromium not found — installing (one-time)...');
    execSync('npx playwright install chromium', { stdio: 'inherit' });
  }
}

// verb: 'open' | 'read' | 'click' | 'fill' | 'screenshot' | 'close'
// params: { url?, selector?, text?, out? }
export async function runBrowser(verb, params = {}) {
  if (verb === 'close') {
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
    return { ok: true, action: 'session cleared' };
  }

  const state     = loadState();
  const targetUrl = params.url || state.url;

  if (!targetUrl) {
    throw new Error('no active URL: call browser.open --url <url> first');
  }

  // Lazy import — playwright is never required at module load time.
  const { chromium } = await import('playwright');
  await ensureChromium(chromium);

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
      return { ok: true, url: currentUrl, title, text: text.slice(0, 10_000) };

    } else if (verb === 'click') {
      const { selector } = params;
      if (!selector) throw new Error('--selector required');
      await page.click(selector, { timeout: 10_000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
      const newUrl   = page.url();
      const newTitle = await page.title();
      saveState({ url: newUrl });
      return { ok: true, url: newUrl, title: newTitle };

    } else if (verb === 'fill') {
      const { selector, text } = params;
      if (!selector || text == null) throw new Error('--selector and --text required');
      await page.fill(selector, text, { timeout: 10_000 });
      return { ok: true, selector, filled: text.length, url: currentUrl };

    } else if (verb === 'screenshot') {
      const out = params.out || '/tmp/helm-browser.png';
      await page.screenshot({ path: out, fullPage: false });
      return { ok: true, path: out, url: currentUrl };

    } else {
      throw new Error(`unknown browser verb: ${verb}`);
    }
  } finally {
    await ctx.close();
  }
}
