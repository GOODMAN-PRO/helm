// Shared browser implementation. playwright is imported lazily inside runBrowser()
// so this module is safe to import without triggering a browser launch or chromium download.

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE  = path.resolve(__dirname, '../..');
export const PROFILE    = path.join(WORKSPACE, 'browser-profile');
export const STATE_FILE = path.join(WORKSPACE, 'browser-state.json');
export const DOWNLOADS   = path.join(WORKSPACE, 'downloads');

// A realistic desktop-Chrome UA so sites don't serve the "HeadlessChrome" experience (some block it).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

export function saveState(s) {
  const tmp = STATE_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, STATE_FILE);
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
  // Auto-install on first use if the binary is missing. Cross-platform (`npx` resolves per-OS).
  const exePath = chromium.executablePath();
  if (!existsSync(exePath)) {
    const { execSync } = await import('node:child_process');
    console.error('[browser] Chromium not found — installing (one-time, ~150MB)...');
    execSync('npx playwright install chromium', { stdio: 'inherit' });
  }
}

const clampInt = (v, def, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const truthy   = v => v === true || v === 'true' || v === '1' || v === 1;
const stamp    = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const hostSlug = u => { try { return new URL(u).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-'); } catch { return 'page'; } };
const extFor   = ct => ({ 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/x-icon': 'ico' }[ct.split(';')[0].trim()] || 'img');

// Scroll the page in steps so lazy-loaded / infinite-scroll images actually render before we read them.
async function autoScroll(page, rounds) {
  for (let i = 0; i < rounds; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight)).catch(() => {});
    await page.waitForTimeout(450);
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
}

// Gather every image URL the page references: <img> (src/currentSrc/srcset/lazy attrs), <picture><source>,
// CSS background-image, and og:image/twitter:image meta — with the element's rendered size so we can rank.
async function collectImageCandidates(page) {
  return page.evaluate(() => {
    const seen = new Map();
    const add = (u, w = 0, h = 0) => {
      if (!u || u.startsWith('data:')) return;
      const p = seen.get(u) || { url: u, w: 0, h: 0 };
      seen.set(u, { url: u, w: Math.max(p.w, w | 0), h: Math.max(p.h, h | 0) });
    };
    const largest = ss => {
      let best = null, bw = -1;
      for (const part of ss.split(',')) {
        const t = part.trim().split(/\s+/); const u = t[0];
        let w = 0; if (t[1]) { if (t[1].endsWith('w')) w = parseInt(t[1]); else if (t[1].endsWith('x')) w = parseFloat(t[1]) * 1000; }
        if (u && w > bw) { bw = w; best = u; }
      }
      return best;
    };
    for (const img of document.querySelectorAll('img')) {
      const w = img.naturalWidth || img.width || 0, h = img.naturalHeight || img.height || 0;
      const primary = img.currentSrc || img.getAttribute('src') || (img.srcset && largest(img.srcset));
      add(primary, w, h);
      for (const a of ['data-src', 'data-original', 'data-lazy-src', 'data-srcset']) {
        const v = img.getAttribute(a); if (v) add(v.split(',')[0].trim().split(/\s+/)[0], w, h);
      }
    }
    for (const s of document.querySelectorAll('picture source')) {
      if (s.srcset) add(largest(s.srcset));
    }
    for (const el of document.querySelectorAll('*')) {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') { const m = bg.match(/url\(["']?(.*?)["']?\)/); if (m) { const r = el.getBoundingClientRect(); add(m[1], r.width, r.height); } }
    }
    for (const m of document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"]')) {
      add(m.getAttribute('content') || m.getAttribute('href'));
    }
    return [...seen.values()];
  }).catch(() => []);
}

// verb: 'open' | 'read' | 'click' | 'fill' | 'screenshot' | 'images' | 'login' | 'close'
// params: { url?, selector?, text?, out?, count?, min?, scroll?, headful?, seconds? }
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

  // `login` always runs visibly; everything else is headless unless asked for a visible window.
  const headful = verb === 'login' || truthy(params.headful) || process.env.HELM_BROWSER_HEADFUL === '1';
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: !headful,
    viewport: { width: 1366, height: 900 },
    userAgent: UA,
    locale: 'en-US',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });

  try {
    const page = ctx.pages()[0] || await ctx.newPage();

    // --- login: open a real (visible) window so the owner signs in once; the cookies persist in the
    // profile, so every later headless call (open/read/images) is already authenticated. Finishes when
    // the owner closes the window or after `seconds`.
    if (verb === 'login') {
      const secs = clampInt(params.seconds, 180, 10, 900);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      try { saveState({ url: page.url() }); } catch {}
      await Promise.race([
        new Promise(r => ctx.once('close', r)),
        new Promise(r => page.once('close', r)),
        new Promise(r => setTimeout(r, secs * 1000)),
      ]);
      let url = targetUrl; try { url = page.url(); } catch {}
      try { saveState({ url }); } catch {}
      return { ok: true, action: 'login window finished', url, note: 'Logged-in cookies saved to the browser profile. Future browser.open / browser.images calls reuse this session — no API needed.' };
    }

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const currentUrl = page.url();
    const title      = await page.title().catch(() => '');
    saveState({ url: currentUrl });

    if (verb === 'open' || verb === 'read') {
      const html = await page.content();
      const text = stripHtml(html);
      return { ok: true, url: currentUrl, title, text: text.slice(0, 10_000) };

    } else if (verb === 'images') {
      // Navigate (above), scroll to trigger lazy loading, collect every referenced image, rank by
      // rendered area (biggest = the real content, not icons), then download through the browser's
      // own request context so cookies/referer apply. No site API required.
      const count    = clampInt(params.count, 20, 1, 200);
      const minBytes = clampInt(params.min, 3000, 0, 50_000_000);   // skip 1px tracking pixels / spacers
      const scrolls  = clampInt(params.scroll, 8, 0, 60);
      const outDir   = params.out || path.join(DOWNLOADS, `${hostSlug(currentUrl)}-${stamp()}`);

      await autoScroll(page, scrolls);
      const cands = await collectImageCandidates(page);

      // resolve relative → absolute, drop non-http and dupes, rank by area
      const seen = new Set(); const ranked = [];
      for (const c of cands) {
        let abs; try { abs = new URL(c.url, currentUrl).href; } catch { continue; }
        if (!/^https?:/i.test(abs) || seen.has(abs)) continue;
        seen.add(abs); ranked.push({ url: abs, area: (c.w || 0) * (c.h || 0) });
      }
      ranked.sort((a, b) => b.area - a.area);

      mkdirSync(outDir, { recursive: true });
      const saved = []; let n = 0;
      for (const r of ranked) {
        if (saved.length >= count) break;
        try {
          const resp = await ctx.request.get(r.url, { headers: { referer: currentUrl }, timeout: 20_000 });
          if (!resp.ok()) continue;
          const ct = (resp.headers()['content-type'] || '').toLowerCase();
          if (!ct.startsWith('image/')) continue;
          const buf = await resp.body();
          if (buf.length < minBytes) continue;
          const file = path.join(outDir, `img-${String(++n).padStart(2, '0')}.${extFor(ct)}`);
          writeFileSync(file, buf);
          saved.push({ url: r.url, path: file, bytes: buf.length, type: ct });
        } catch { /* skip a single bad image, keep going */ }
      }
      return { ok: true, url: currentUrl, title, found: ranked.length, downloaded: saved.length, dir: outDir, images: saved };

    } else if (verb === 'click') {
      const { selector } = params;
      if (!selector) throw new Error('--selector required');
      await page.click(selector, { timeout: 10_000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
      const newUrl   = page.url();
      const newTitle = await page.title().catch(() => '');
      saveState({ url: newUrl });
      return { ok: true, url: newUrl, title: newTitle };

    } else if (verb === 'fill') {
      const { selector, text } = params;
      if (!selector || text == null) throw new Error('--selector and --text required');
      await page.fill(selector, text, { timeout: 10_000 });
      return { ok: true, selector, filled: text.length, url: currentUrl };

    } else if (verb === 'screenshot') {
      const out = params.out || path.join(os.tmpdir(), 'helm-browser.png');
      const full = truthy(params.full);
      await page.screenshot({ path: out, fullPage: full });
      return { ok: true, path: out, url: currentUrl };

    } else {
      throw new Error(`unknown browser verb: ${verb}`);
    }
  } finally {
    try { await ctx.close(); } catch {}
  }
}
