#!/usr/bin/env node
// reverse.mjs — analyze a target and write BOTH a Markdown report and a PDF to workspace/reverse/.
// ETHICS: for the OWNER'S OWN or clearly authorized targets only.
//
// Cross-platform (macOS / Windows / Linux): uses Node's built-in fetch + pure-JS binary inspection
// instead of /usr/bin/* tools, and ALWAYS renders a PDF with the bundled Playwright Chromium.
//
// Usage:
//   node reverse.mjs web  <url>  [--name <slug>]
//   node reverse.mjs app  <path> [--name <slug>]
//   node reverse.mjs file <path> [--name <slug>]

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { analyzeSources, decodeInlineScripts, findSourceMapRef, parseSourceMap, traceTerms } from './reverse-code.mjs';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE   = path.resolve(__dirname, '../..');
const REVERSE_DIR = path.join(WORKSPACE, 'reverse');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
// The link-preview crawler UA: many sites (Instagram, TikTok, X) serve their PUBLIC Open Graph preview
// (author, caption, thumbnail, video) to this UA for sharing/unfurling, even when a browser is redirected
// to a login wall. This reads only the public preview the site publishes — not behind-auth data.
const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

const ETHICS_NOTE = `> **Authorization required.** Use this tool only on targets you own or are
> explicitly authorized to analyze. Unauthorized reverse engineering may violate
> terms of service and applicable law. This report is for the owner's personal use.`;

function slugify(s) {
  return s
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'target';
}

// Shorten the long hashed bundle/source names (e.g. `OBdQiWa9…FrnIAv.js`) so the report stays readable
// instead of printing a 90-char filename in every table row.
function shortName(s) {
  const b = String(s || '');
  if (b.length <= 26) return b;
  return b.slice(0, 14) + '…' + b.slice(-9);
}

// Did we get the UNAUTHENTICATED experience? Either a redirect to a login/auth URL, OR the page itself
// is a login/auth surface (password field + sign-in text, or known logged-out app markers). Many SPAs
// (instagram.com root) serve the logged-out shell WITHOUT redirecting, so the URL alone misses it.
export function looksLoggedOut(finalUrl = '', html = '') {
  const byUrl = /\/(accounts\/)?login\b|\/login\/|[?&](next|__coig_login)=|\/signin\b|auth0|oauth\/authorize|\/sso\//i.test(finalUrl || '');
  const byForm = /<input[^>]+type=["']password["']/i.test(html) && /\b(log[\s-]?in|sign[\s-]?in|password)\b/i.test(html);
  const byMarker = /PolarisLoggedOut|LoggedOutRoot|LoginForm|LoginAndSignup|__coig_login|BarcelonaLoggedOut/i.test(html);
  return byUrl || byForm || byMarker;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 30_000, ...opts });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status ?? -1 };
}

// Resolve an optional CLI tool across PATH (cross-platform `which`/`where`). Returns its path or null.
function whichTool(name) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  try {
    const r = spawnSync(finder, [name], { encoding: 'utf8' });
    if (r.status === 0) return (r.stdout || '').split(/\r?\n/)[0].trim() || null;
  } catch { /* not found */ }
  return null;
}

// ---- cross-platform page fetch (replaces curl) — Node's global fetch gives body + headers at once.
async function fetchPage(url, ua = UA) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, {
      redirect: 'follow', signal: ctrl.signal,
      headers: { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    const headers = {};
    for (const [k, v] of res.headers) headers[k.toLowerCase()] = v;
    let html = '';
    try { html = (await res.text()).slice(0, 5_000_000); } catch { /* binary/empty body */ }
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, headers, html };
  } catch (e) {
    return { ok: false, status: 0, finalUrl: url, headers: {}, html: '', error: e.message };
  } finally { clearTimeout(timer); }
}

// ---- pure-JS hexdump (replaces xxd) ----
function hexdump(buf, len = 256) {
  const out = [];
  const n = Math.min(len, buf.length);
  for (let off = 0; off < n; off += 16) {
    const slice = buf.subarray(off, Math.min(off + 16, n));
    const hex = [...slice].map(b => b.toString(16).padStart(2, '0')).join(' ').padEnd(16 * 3 - 1, ' ');
    const ascii = [...slice].map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('');
    out.push(off.toString(16).padStart(8, '0') + '  ' + hex + '  ' + ascii);
  }
  return out.join('\n');
}

// ---- pure-JS printable-string extraction (replaces strings) ----
function extractStrings(buf, { min = 6, max = 300, cap = 200 } = {}) {
  const out = [];
  const scanLen = Math.min(buf.length, 8_000_000);   // cap the scan so huge binaries stay fast
  let cur = '';
  for (let i = 0; i < scanLen; i++) {
    const b = buf[i];
    if (b >= 0x20 && b < 0x7f) { cur += String.fromCharCode(b); }
    else { if (cur.length >= min && cur.length <= max) { out.push(cur); if (out.length >= cap) return out; } cur = ''; }
  }
  if (cur.length >= min && cur.length <= max) out.push(cur);
  return out;
}

// Ensure the Playwright Chromium binary exists (auto-install once — needed for PDF + network capture).
async function ensureChromium(chromium) {
  if (!existsSync(chromium.executablePath())) {
    const { execSync } = await import('node:child_process');
    console.error('[reverse] installing Chromium (one-time, for PDF + network capture)...');
    execSync('npx playwright install chromium', { stdio: 'inherit' });
  }
}

// ---- minimal Markdown -> styled HTML (headings, bold, inline+fenced code, lists, tables, quotes, hr, links).
function mdToHtml(md, title = 'Reverse Engineering Report') {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);

  const lines = md.split('\n');
  const html = [];
  let i = 0, inUl = false, inOl = false;
  const closeLists = () => { if (inUl) { html.push('</ul>'); inUl = false; } if (inOl) { html.push('</ol>'); inOl = false; } };
  const special = l => /^(#{1,6}\s|```|>\s?|\s*[-*+]\s|\s*\d+\.\s|\s*\|)/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {                                   // fenced code
      closeLists(); i++;
      const code = [];
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      html.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) { // table
      closeLists();
      const head = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())); i++; }
      html.push('<table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { closeLists(); html.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { closeLists(); html.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(line)) {                                  // blockquote
      closeLists();
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      html.push(`<blockquote>${inline(q.join(' '))}</blockquote>`); continue;
    }
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { if (inOl) { html.push('</ol>'); inOl = false; } if (!inUl) { html.push('<ul>'); inUl = true; } html.push(`<li>${inline(m[1])}</li>`); i++; continue; }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) { if (inUl) { html.push('</ul>'); inUl = false; } if (!inOl) { html.push('<ol>'); inOl = true; } html.push(`<li>${inline(m[1])}</li>`); i++; continue; }
    if (/^\s*$/.test(line)) { closeLists(); i++; continue; }
    closeLists();                                              // paragraph
    const para = [line]; i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !special(lines[i])) { para.push(lines[i]); i++; }
    html.push(`<p>${inline(para.join(' '))}</p>`);
  }
  closeLists();

  const css = `
    *{box-sizing:border-box}
    body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;font-size:12px;margin:0}
    h1{font-size:22px;border-bottom:2px solid #333;padding-bottom:6px;margin:0 0 10px}
    h2{font-size:17px;border-bottom:1px solid #ddd;padding-bottom:4px;margin:22px 0 8px}
    h3{font-size:14px;margin:16px 0 6px}h4,h5,h6{font-size:12.5px;margin:12px 0 4px}
    code{background:#f3f3f3;padding:1px 4px;border-radius:3px;font-family:Consolas,'SF Mono',Menlo,monospace;font-size:11px}
    pre{background:#f6f8fa;border:1px solid #e1e4e8;border-radius:6px;padding:10px;overflow-x:auto}
    pre code{background:none;padding:0;font-size:10.5px;white-space:pre-wrap;word-break:break-word}
    table{border-collapse:collapse;width:100%;margin:10px 0}
    th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;font-size:11px;vertical-align:top}
    th{background:#f0f0f0}
    blockquote{border-left:3px solid #ccc;margin:10px 0;padding:4px 12px;color:#555;background:#fafafa}
    a{color:#0366d6;text-decoration:none;word-break:break-all}
    hr{border:none;border-top:1px solid #ddd;margin:16px 0}
    ul,ol{margin:8px 0;padding-left:22px}li{margin:2px 0}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${html.join('\n')}</body></html>`;
}

// Render a Markdown report to a PDF via the bundled Playwright Chromium.
async function writePdf(markdown, pdfPath, title) {
  const { chromium } = await import('playwright');
  await ensureChromium(chromium);
  const html = mdToHtml(markdown, title);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
  } finally { await browser.close(); }
}

// ---- web helpers ----

// Detect the stack from PRECISE signatures, not bare substrings. Libraries (jQuery/Bootstrap/Tailwind)
// are matched against <script>/<link> URLs or specific globals — never `html.includes('bootstrap')`,
// because big SPAs (Facebook/Instagram) ship tokens like `bootstrapData`/`requireLazy` that trip naive
// substring checks into false positives. `scripts`/`links` are the extracted src/href URLs.
function detectStack(html, headers, scripts = [], links = []) {
  const found = [];
  const h = html;
  const srcBlob = [...scripts, ...links].join('\n').toLowerCase();
  const inSrc = re => re.test(srcBlob);

  // Frameworks — markers specific enough to trust.
  if (/data-reactroot|__reactcontainer|__reactfiber|react-dom(?:\.production)?\.min\.js/i.test(h) || inSrc(/react-dom|\breact[-.@]/)) found.push('React');
  if (/__NEXT_DATA__|\/_next\//.test(h)) found.push('Next.js');
  if (/__NUXT__|\/_nuxt\//.test(h)) found.push('Nuxt');
  if (/\bng-version=|\bng-app=/i.test(h) || inSrc(/\bangular(?:[-.]|\.min)/)) found.push('Angular');
  if (/data-v-app|\b__vue__\b/i.test(h) || inSrc(/\bvue(?:@|[-.]|\.min|\.runtime|\.global)/)) found.push('Vue');
  if (/\bsvelte-[a-z0-9]{4,}\b/i.test(h)) found.push('Svelte');
  if (inSrc(/gatsby[-.]/) || /id=["']___gatsby["']/i.test(h)) found.push('Gatsby');
  if (/\bhx-(get|post|target|swap|trigger)=/i.test(h) || inSrc(/htmx(?:\.org|[-.])/)) found.push('htmx');

  // Libraries — by SCRIPT/LINK URL or a precise global only.
  if (inSrc(/jquery[-.@]?[\d.]*(?:\.min|\.slim)?\.js/) || /jquery\.fn\.jquery|window\.jquery\b/i.test(h)) found.push('jQuery');
  if (inSrc(/bootstrap[-.@]?[\d.]*(?:\.bundle|\.min)?\.(?:css|js)/)) found.push('Bootstrap');
  if (inSrc(/cdn\.tailwindcss\.com|tailwind[-.][\w.]*\.css/)) found.push('Tailwind CSS');
  if (/[?&"']graphql\b|"\/api\/graphql"|\/graphql"/i.test(h)) found.push('GraphQL (referenced)');
  if (inSrc(/apollo/) || /__APOLLO_STATE__/.test(h)) found.push('Apollo');

  // Server / infra from headers.
  const genM = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
  if (genM) found.push(`Generator: ${genM[1].trim()}`);
  if (headers['x-powered-by']) found.push(`Powered-by: ${headers['x-powered-by']}`);
  if (headers['server']) found.push(`Server: ${headers['server']}`);
  if (headers['x-vercel-id'] || headers['x-vercel-cache']) found.push('Vercel');
  if (headers['cf-ray']) found.push('Cloudflare');
  if (headers['x-amz-cf-id'] || headers['x-amz-request-id']) found.push('AWS');
  if (headers['x-fb-debug'] || /facebook\.com|instagram\.com/.test(headers['content-security-policy'] || '')) found.push('Meta (Facebook/Instagram) infra');
  return [...new Set(found)];
}

function extractApiEndpoints(html) {
  const eps = new Set();
  const patterns = [
    /["'`](\/api\/[^"'`\s<>]{2,100})["'`]/g,
    /["'`](\/v\d+\/[^"'`\s<>]{2,100})["'`]/g,
    /fetch\s*\(\s*["'`]([^"'`\s<>]{4,200})["'`]/g,
    /axios\.\w+\s*\(\s*["'`]([^"'`\s<>]{4,200})["'`]/g,
    /["'`](https?:\/\/[^/\s"'`<>]+\/(?:api|graphql|v\d+|rest)[^"'`\s<>]{0,100})["'`]/g,
  ];
  for (const pat of patterns) {
    for (const m of html.matchAll(pat)) {
      const ep = m[1];
      if (ep.length >= 4 && ep.length <= 200) eps.add(ep);
    }
  }
  return [...eps].slice(0, 50);
}

function extractScripts(html) {
  const srcs = [];
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) srcs.push(m[1]);
  return srcs.slice(0, 40);
}

function extractLinks(html) {
  const hrefs = [];
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)) hrefs.push(m[1]);
  return hrefs.slice(0, 40);
}

// ---- request classification: the central fix ----
// The old tool dumped EVERY request into one list and let the OpenAPI/clone stages treat CDN video
// byte-range fetches as distinct API "endpoints". Media delivery is not an API surface. We classify
// each captured request so the report separates the genuine API calls from media and static assets.
const CDN_HOST_RE  = /(fbcdn\.net|cdninstagram\.com|akamaihd\.net|akamaized\.net|cloudfront\.net|fastly\.net|gstatic\.com|ggpht\.com|googlevideo\.com|twimg\.com|licdn\.com|pinimg\.com|\bcdn\d*\.)/i;
const MEDIA_EXT_RE = /\.(?:mp4|m4s|webm|mov|ts|mp3|m4a|aac|ogg|flac|jpe?g|png|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot)(?:[?#]|$)/i;

function classifyRequest(req) {
  const t  = req.type;
  const u  = req.url;
  const ct = (req.contentType || '').toLowerCase();
  let host = ''; try { host = new URL(u).host; } catch {}
  const mediaCt    = /^(?:video|audio|image|font)\//.test(ct) || ct.includes('font/');
  const rangeChunk = /[?&](?:bytestart|byteend|efg)=/.test(u) || !!req.contentRange;   // fbcdn video chunks
  if (t === 'media' || t === 'image' || t === 'font' || mediaCt || MEDIA_EXT_RE.test(u) || (CDN_HOST_RE.test(host) && rangeChunk)) return 'media';
  if (t === 'document') return 'document';
  if (t === 'script' || t === 'stylesheet' || /\.(?:js|mjs|css)(?:[?#]|$)/i.test(u)) return 'asset';
  const looksApi = /\/api\/|\/graphql|\/ajax\/|\/gql(?:\b|\/)/i.test(u) || ct.includes('application/json') || /[?&]__a=/.test(u) || !!req.postData;
  if ((t === 'fetch' || t === 'xhr' || t === 'other') && looksApi && !CDN_HOST_RE.test(host)) return 'api';
  return 'other';
}

// Collapse byte-range chunks of the same media file to one key (host + path, query stripped).
function mediaKey(u) {
  try { const url = new URL(u); return url.host + url.pathname; } catch { return u.split('?')[0]; }
}

// Parse an application/x-www-form-urlencoded body into a plain object.
function parseForm(body) {
  const params = {};
  for (const pair of body.split('&')) {
    const i = pair.indexOf('=');
    if (i < 0) continue;
    try {
      const k = decodeURIComponent(pair.slice(0, i).replace(/\+/g, ' '));
      const v = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      params[k] = v;
    } catch { /* skip malformed pair */ }
  }
  return params;
}

// Extract the part that actually matters for reverse engineering a request: method, path, and — for
// GraphQL/AJAX POSTs — the operation name, doc_id/query_hash, and the variable KEYS. This is exactly
// what the old report omitted (it just emitted TODOs).
function summarizeApiCall(req) {
  const out = { method: req.method, url: req.url, status: req.status, contentType: req.contentType };
  try { out.path = new URL(req.url).pathname; } catch { out.path = req.url; }
  const body = req.postData || '';
  const ctHeader = (req.reqHeaders && req.reqHeaders['content-type']) || '';
  if (body) {
    const trimmed = body.trim();
    if (/multipart\/form-data/i.test(ctHeader) || /WebKitFormBoundary|Content-Disposition:\s*form-data/i.test(trimmed)) {
      // multipart/form-data — read the field NAMES, don't split on &/= (that produced boundary garbage).
      const names = [...trimmed.matchAll(/name="([^"]+)"/g)].map(m => m[1]);
      out.bodyParamKeys = [...new Set(names)];
      out.multipart = true;
    } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const j = JSON.parse(trimmed);
        if (!Array.isArray(j)) {
          const g = {};
          for (const k of ['operationName', 'doc_id', 'query_hash']) if (j[k] != null) g[k] = j[k];
          if (j.variables && typeof j.variables === 'object') g.variables_keys = Object.keys(j.variables);
          if (typeof j.query === 'string') g.query_snippet = j.query.replace(/\s+/g, ' ').slice(0, 160);
          if (Object.keys(g).length) out.graphql = g;
          out.bodyParamKeys = Object.keys(j);
        }
      } catch { /* not JSON */ }
    } else if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && trimmed.includes('=')) {
      const p = parseForm(trimmed);
      const g = {};
      for (const k of ['fb_api_req_friendly_name', 'doc_id', 'query_hash', 'fb_api_caller_class', 'operationName', 'operation_name', 'av']) if (p[k] != null) g[k] = p[k];
      if (p.variables) { try { g.variables_keys = Object.keys(JSON.parse(p.variables)); } catch { g.variables_raw = p.variables.slice(0, 200); } }
      if (Object.keys(g).length) out.graphql = g;
      out.bodyParamKeys = Object.keys(p);
    }
  }
  const hn = req.reqHeaders || {};
  out.reqContentType = hn['content-type'] || null;   // the REQUEST body media type (not the response)
  out.friendlyName = (out.graphql && out.graphql.fb_api_req_friendly_name) || hn['x-fb-friendly-name'] || hn['x-graphql-operation-name'] || null;
  return out;
}

// ---- content extraction: WHAT'S ACTUALLY INSIDE the page/reel ----
// Pull the real content (author, caption, video, audio, thumbnail, stats) from the public sources the
// page exposes to everyone: Open Graph tags, Twitter cards, and JSON-LD. This is "what's in the reel",
// not the code/network. (Reads only what the page serves; respect ToS/copyright — for your own analysis.)
function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return _; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return _; } });
}
function metaContent(html, key, attr = 'property') {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let m = html.match(new RegExp(`<meta[^>]+${attr}=["']${k}["'][^>]*?\\bcontent=["']([^"']*)["']`, 'i'));
  if (m) return decodeEntities(m[1]);
  m = html.match(new RegExp(`<meta[^>]+\\bcontent=["']([^"']*)["'][^>]*?${attr}=["']${k}["']`, 'i'));
  return m ? decodeEntities(m[1]) : null;
}
function extractJsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim()); out.push(...(Array.isArray(j) ? j : [j])); } catch {}
  }
  return out;
}
function extractContent(html) {
  const og = k => metaContent(html, 'og:' + k, 'property');
  const tw = k => metaContent(html, 'twitter:' + k, 'name');
  const c = {
    type: og('type'), site: og('site_name'),
    title: og('title') || tw('title') || (html.match(/<title[^>]*>([^<]{0,200})<\/title>/i) || [])[1] || null,
    description: og('description') || tw('description') || metaContent(html, 'description', 'name'),
    image: og('image') || og('image:secure_url') || tw('image'),
    video: og('video:secure_url') || og('video') || og('video:url') || tw('player:stream'),
    audio: og('audio'), author: null, caption: null, published: null,
    views: null, likes: null, comments: null, duration: null, hashtags: [],
  };
  // FIRST: Instagram/TikTok-style og parsing on the ORIGINAL og fields (before JSON-LD, which on IG
  // carries a generic name like "Reel" that must not clobber the rich og:title).
  //   og:title       = "Name on Instagram: \"caption\""
  //   og:description = "12K likes, 340 comments - handle on date: caption"
  const t = c.title || '', d = c.description || '';
  const mAuthor = t.match(/^(.+?)\s+on\s+(?:Instagram|TikTok|Threads)/i); if (mAuthor) c.author = mAuthor[1].trim();
  const mHandle = d.match(/-\s*([\w.]+)\s+on\s+/i); if (mHandle && !c.author) c.author = mHandle[1].trim();
  const mStats = d.match(/([\d.,]+\s*[KMB]?)\s+likes?[,\s].*?([\d.,]+\s*[KMB]?)\s+comments?/i);
  if (mStats) { c.likes = mStats[1].trim(); c.comments = mStats[2].trim(); }
  const mCap = t.match(/:\s*["“](.+?)["”]\s*$/) || d.match(/:\s*["“](.+?)["”]?\s*$/); if (mCap) c.caption = mCap[1].trim();
  // THEN: JSON-LD fills gaps only (||), but structured stats/media/dates win when present.
  for (const j of extractJsonLd(html)) {
    const ty0 = Array.isArray(j['@type']) ? j['@type'].join(',') : (j['@type'] || '');
    if (!/Video|Media|Posting|Image|Article/i.test(ty0) && !j.contentUrl && !j.interactionStatistic) continue;
    c.caption = c.caption || j.caption || j.articleBody || j.description;
    c.video = j.contentUrl || (j.video && (j.video.contentUrl || j.video)) || c.video;
    const thumb = j.thumbnailUrl || j.thumbnail; if (thumb) c.image = (Array.isArray(thumb) ? thumb[0] : (thumb.url || thumb)) || c.image;
    c.published = c.published || j.uploadDate || j.datePublished;
    c.duration = c.duration || j.duration;
    const a = j.author || j.creator || j.publisher; if (a && !c.author) c.author = (typeof a === 'string' ? a : (a.alternateName || a.name)) || c.author;
    for (const s of [].concat(j.interactionStatistic || [])) {
      const ty = String((s.interactionType && (s.interactionType['@type'] || s.interactionType)) || '');
      if (/Watch|View/i.test(ty) && s.userInteractionCount != null) c.views = s.userInteractionCount;
      else if (/Like/i.test(ty) && s.userInteractionCount != null) c.likes = s.userInteractionCount;
      else if (/Comment/i.test(ty) && s.userInteractionCount != null) c.comments = s.userInteractionCount;
    }
    if (j.commentCount != null) c.comments = j.commentCount;
  }
  if (!c.caption) c.caption = c.description;
  const text = `${c.caption || ''} ${c.title || ''}`;
  c.hashtags = [...new Set(text.match(/#[\p{L}\p{N}_]+/gu) || [])].slice(0, 30);
  c.mentions = [...new Set(text.match(/@[\w.]+/g) || [])].slice(0, 30);
  return c;
}
// Scan captured live API JSON (e.g. a logged-in GraphQL reel response) for the richest content fields.
function scanApiForContent(requests) {
  const out = {};
  const want = { username: ['username', 'owner_username'], full_name: ['full_name'], caption: ['caption_text', 'caption'], like_count: ['like_count'], play_count: ['play_count', 'view_count', 'ig_play_count'], comment_count: ['comment_count'], video_url: ['video_url'], audio: ['original_sound_title', 'song_name', 'audio_asset_id', 'title'], code: ['code', 'shortcode'] };
  for (const r of requests || []) {
    if (!r.body || !/json|javascript/i.test(r.contentType || '')) continue;
    let j; try { j = JSON.parse(r.body); } catch { continue; }
    const seen = new Set(); const stack = [j]; let n = 0;
    while (stack.length && n++ < 20000) {
      const v = stack.pop(); if (!v || typeof v !== 'object' || seen.has(v)) continue; seen.add(v);
      for (const [k, val] of Object.entries(v)) {
        for (const [field, keys] of Object.entries(want)) if (keys.includes(k) && out[field] == null && (typeof val === 'string' || typeof val === 'number')) out[field] = val;
        if (val && typeof val === 'object') stack.push(val);
      }
    }
  }
  return Object.keys(out).length ? out : null;
}

// ---- web subcommand ----

async function analyzeWeb(url, name) {
  const slug = name || slugify(url);
  const findings = { host: (() => { try { return new URL(url).hostname; } catch { return url; } })() };
  const lines = [
    `# Reverse Engineering Report: Web — ${url}`, '', ETHICS_NOTE, '',
    `## Target`, `- **URL:** ${url}`, `- **Date:** ${new Date().toISOString()}`, '',
  ];

  const resp = await fetchPage(url);
  const headers = resp.headers;
  const html = resp.html;
  if (resp.error) lines.push(`> Fetch warning: ${resp.error}`, '');
  lines.push(`- **HTTP status:** ${resp.status || 'n/a'}${resp.finalUrl && resp.finalUrl !== url ? `  ·  redirected to ${resp.finalUrl}` : ''}`, '');

  // Honesty gate: if this is a login/auth surface (redirected OR served inline), the capture is the
  // LOGGED-OUT shell. The real app and its authenticated API never loaded — say so loudly so the report
  // isn't mistaken for the app. (instagram.com root serves login inline without redirecting.)
  const loggedOut = looksLoggedOut(resp.finalUrl, html);
  findings.loggedOut = loggedOut;
  if (loggedOut) {
    lines.push('## ⚠ Capture Context — UNAUTHENTICATED',
      '> This is a **login / auth surface** (you were redirected to it, or it was served inline), so everything',
      '> below is the **logged-out shell**. The real application and its authenticated API did **not** load —',
      '> captured calls are public bootstrap, telemetry and route-prefetch, and the "key functions" are the',
      '> module loader, not the product code. To analyze the real surface you would need to be signed in as a',
      '> user **you are authorized to act as**. This tool does not bypass the auth wall.', '');
  }

  // ============================ CONTENT (what's inside) ============================
  // The headline: the actual content of the page/reel — who made it, the caption, the media, the stats.
  const content = extractContent(html);
  findings.content = content;   // same ref — later live-capture enrichment fills it in place
  const renderContent = (c, heading) => {
    const row = (label, val) => { if (val != null && String(val).trim()) lines.push(`- **${label}:** ${String(val).slice(0, 600)}`); };
    lines.push(heading);
    row('Type', [c.site, c.type].filter(Boolean).join(' · '));
    row('Author / creator', c.author);
    row('Caption / text', c.caption);
    row('Posted', c.published);
    row('Duration', c.duration);
    const stats = [c.views != null && `${c.views} views`, c.likes != null && `${c.likes} likes`, c.comments != null && `${c.comments} comments`].filter(Boolean).join(' · ');
    row('Stats', stats);
    row('Audio', c.audio);
    if (c.hashtags && c.hashtags.length) row('Hashtags', c.hashtags.join(' '));
    if (c.mentions && c.mentions.length) row('Mentions', c.mentions.join(' '));
    if (c.video) lines.push(`- **Video:** \`${String(c.video).slice(0, 300)}\``);
    if (c.image) lines.push(`- **Thumbnail:** \`${String(c.image).slice(0, 300)}\``);
    lines.push('');
  };
  const hasContent = c => c && (c.author || c.caption || c.video || c.image || c.views || c.likes);
  // Fallback: if a browser-UA fetch got gated to a login wall (no content), re-fetch as the link-preview
  // crawler — sites publish the reel's PUBLIC og preview to that UA for sharing.
  if (!hasContent(content)) {
    try {
      const r2 = await fetchPage(url, CRAWLER_UA);
      const c2 = extractContent(r2.html || '');
      for (const k of Object.keys(c2)) if (!content[k] && c2[k] && !(Array.isArray(c2[k]) && !c2[k].length)) content[k] = c2[k];
      if (hasContent(c2)) content._viaCrawler = true;
    } catch {}
  }
  if (hasContent(content)) renderContent(content, content._viaCrawler ? '## Content (public preview)' : '## Content');
  else { lines.push('## Content', '- (no public content fields found — the page gates its Open Graph/JSON-LD behind login. To read a reel\'s real content, sign in once with `browser.login --url https://www.instagram.com`, then re-run on the specific reel URL.)', ''); }

  const titleM = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
  const pageTitle = titleM ? titleM[1].trim() : new URL(url).hostname;

  // Extract script/link URLs first — stack detection matches against these, not raw HTML substrings.
  const scripts = extractScripts(html);
  const links = extractLinks(html);

  // Stack detection
  const stack = detectStack(html, headers, scripts, links);
  findings.stack = stack;
  lines.push('## Detected Stack');
  if (stack.length) for (const s of stack) lines.push(`- ${s}`);
  else lines.push('- (none detected via static analysis)');
  lines.push('');

  // Interesting response headers
  lines.push('## Response Headers');
  const interesting = ['server', 'x-powered-by', 'content-type', 'x-frame-options', 'content-security-policy',
    'strict-transport-security', 'x-content-type-options', 'cache-control', 'cf-ray', 'x-vercel-id', 'x-amz-cf-id'];
  let anyHeader = false;
  for (const k of interesting) if (headers[k]) { lines.push(`- **${k}:** \`${headers[k].slice(0, 200)}\``); anyHeader = true; }
  if (!anyHeader) lines.push('- (no interesting headers captured)');
  lines.push('');

  // Script sources — deduped; inline data: URIs are summarized, not pasted as base64 spew.
  const scriptCounts = new Map();
  for (const s of scripts) { const key = s.startsWith('data:') ? `data: inline script (${s.length} bytes)` : s; scriptCounts.set(key, (scriptCounts.get(key) || 0) + 1); }
  lines.push(`## Script Sources (${scriptCounts.size} unique of ${scripts.length})`);
  if (scriptCounts.size) for (const [s, n] of scriptCounts) lines.push(`- \`${s}\`${n > 1 ? `  ×${n}` : ''}`);
  else lines.push('- (none)');
  lines.push('');

  // Static API endpoint extraction
  const endpoints = extractApiEndpoints(html);
  lines.push(`## API Endpoints (static analysis, ${endpoints.length} found)`);
  if (endpoints.length) for (const ep of endpoints) lines.push(`- \`${ep}\``);
  else lines.push('- (none found in static HTML/JS; the network capture below may find dynamic calls)');
  lines.push('');

  // Page metadata
  const descM = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,300})["']/i);
  lines.push('## Page Metadata');
  if (titleM) lines.push(`- **Title:** ${titleM[1].trim()}`);
  if (descM) lines.push(`- **Description:** ${descM[1].trim()}`);
  if (!titleM && !descM) lines.push('- (no title or description meta found)');
  lines.push('');

  // Playwright network capture (Chromium is bundled; we also use it for the PDF). Every request is
  // CLASSIFIED so genuine API calls are separated from CDN media chunks and static assets.
  let netData = null;
  try { netData = await captureNetwork(url); } catch (e) { lines.push(`> Network capture skipped: ${String(e.message || e).slice(0, 120)}`, ''); }

  // Recover MORE content from the live capture: the rendered DOM (post-JS) often carries richer og/JSON-LD
  // than the raw fetch, and a logged-in API JSON response holds the full reel (owner, caption, counts, video).
  if (netData) {
    const extras = [];
    if (netData.html) { const dom = extractContent(netData.html); for (const k of ['author', 'caption', 'video', 'image', 'published', 'duration', 'views', 'likes', 'comments', 'audio']) if (!content[k] && dom[k]) { content[k] = dom[k]; extras.push(k); } }
    const api = scanApiForContent(netData.requests);
    if (api) {
      const map = { author: api.username, caption: api.caption, video: api.video_url, likes: api.like_count, views: api.play_count, comments: api.comment_count, audio: api.audio };
      for (const [k, v] of Object.entries(map)) if (v != null && !content[k]) { content[k] = v; extras.push(k); }
      if (api.code) content.code = api.code;
    }
    if (extras.length && hasContent(content)) renderContent(content, `## Content — recovered from the live page/API (${[...new Set(extras)].join(', ')})`);
  }

  let apiCalls = [];
  if (netData) {
    const buckets = { api: [], media: [], asset: [], document: [], other: [] };
    for (const r of netData.requests) buckets[classifyRequest(r)].push(r);

    lines.push('## Network Capture (Playwright)');
    lines.push(`- **Total requests:** ${netData.requests.length}`);
    lines.push(`- **API/XHR:** ${buckets.api.length}  ·  **Media/CDN:** ${buckets.media.length}  ·  **Scripts/CSS:** ${buckets.asset.length}  ·  **Documents:** ${buckets.document.length}  ·  **Other:** ${buckets.other.length}`);
    lines.push('');

    // ---- API surface: the only part that matters for reverse engineering ----
    // Dedupe by method + path + operation so repeated GraphQL POSTs collapse to one row.
    const seen = new Map();
    for (const r of buckets.api) {
      const s = summarizeApiCall(r);
      const op = s.friendlyName || (s.graphql && (s.graphql.doc_id || s.graphql.operationName)) || '';
      const key = `${s.method} ${s.path} ${op}`;
      if (!seen.has(key)) seen.set(key, s);
    }
    apiCalls = [...seen.values()];
    findings.apiCalls = apiCalls;
    lines.push(`## API Surface (${apiCalls.length} distinct call${apiCalls.length === 1 ? '' : 's'})`);
    if (apiCalls.length) {
      for (const s of apiCalls.slice(0, 25)) {
        lines.push(`- **${s.method}** \`${s.path}\`${s.status ? `  → ${s.status}` : ''}${s.contentType ? `  (${s.contentType.split(';')[0]})` : ''}`);
        if (s.friendlyName) lines.push(`  - operation: \`${s.friendlyName}\``);
        const g = s.graphql;
        if (g) {
          if (g.doc_id) lines.push(`  - doc_id: \`${g.doc_id}\``);
          if (g.query_hash) lines.push(`  - query_hash: \`${g.query_hash}\``);
          if (g.operationName && g.operationName !== s.friendlyName) lines.push(`  - operationName: \`${g.operationName}\``);
          if (g.query_snippet) lines.push(`  - query: \`${g.query_snippet}\``);
          if (g.variables_keys) lines.push(`  - variables: ${g.variables_keys.slice(0, 20).map(k => `\`${k}\``).join(', ')}`);
          else if (g.variables_raw) lines.push(`  - variables (raw): \`${g.variables_raw}\``);
        } else if (s.bodyParamKeys && s.bodyParamKeys.length) {
          lines.push(`  - body params: ${s.bodyParamKeys.slice(0, 12).map(k => `\`${k}\``).join(', ')}`);
        }
      }
    } else lines.push('- (no genuine API/XHR calls captured — the page may render server-side or only fetch media)');
    lines.push('');

    // ---- Media / CDN: collapse byte-range chunks of the same file into ONE asset ----
    if (buckets.media.length) {
      const assets = new Map();
      for (const r of buckets.media) {
        const k = mediaKey(r.url);
        const a = assets.get(k) || { key: k, chunks: 0, bytes: 0, type: r.contentType || '' };
        a.chunks++;
        if (r.contentLength) a.bytes += r.contentLength;
        if (!a.type && r.contentType) a.type = r.contentType;
        assets.set(k, a);
      }
      const list = [...assets.values()].sort((x, y) => y.chunks - x.chunks);
      lines.push(`## Media / CDN Assets (${list.length} file${list.length === 1 ? '' : 's'} across ${buckets.media.length} requests)`);
      lines.push('_Byte-range chunks of the same file are collapsed here — this is media delivery, NOT an API surface._', '');
      for (const a of list.slice(0, 15)) {
        const short = a.key.length > 90 ? a.key.slice(0, 88) + '…' : a.key;
        const sz = a.bytes ? ` · ~${(a.bytes / 1024).toFixed(0)} KB` : '';
        lines.push(`- \`${short}\` — ${a.chunks} request${a.chunks === 1 ? '' : 's'}${sz}${a.type ? ` · ${a.type.split(';')[0]}` : ''}`);
      }
      lines.push('');
    }
  }

  // ============================ CODE ANALYSIS ============================
  // The part that makes this reverse engineering instead of a HAR dump: parse the JS the site actually
  // serves the browser, enumerate functions with an AST, build a call graph, recover original file
  // structure from source maps, and point data-flow from captured request params back to the code.
  try {
    const scriptBodies = (netData?.requests || [])
      .filter(r => r.body && (r.type === 'script' || /\.m?js(?:[?#]|$)/i.test(r.url)))
      .map(r => ({ name: ((() => { try { return new URL(r.url).pathname.split('/').pop() || r.url; } catch { return r.url; } })()), code: r.body, url: r.url }));
    const inlineBlocks = decodeInlineScripts(html).map((b, i) => ({ name: `inline#${i + 1}`, code: b.code, count: b.count }));
    const sources = [...scriptBodies, ...inlineBlocks];

    if (sources.length) {
      const code = analyzeSources(sources);
      findings.code = code;
      lines.push('## Code Analysis (static, AST-based)');
      lines.push(`- **Bundles analyzed:** ${code.bundleCount} (${scriptBodies.length} external, ${inlineBlocks.length} inline-deduped)  ·  **~${(code.totalBytes / 1024).toFixed(0)} KB**  ·  **${code.totalFunctions} functions**`);
      if (code.moduleSystems.length) lines.push(`- **Module system:** ${code.moduleSystems.join(', ')}`);
      if (code.endpoints.length) lines.push(`- **Endpoints referenced in code:** ${code.endpoints.slice(0, 20).map(e => `\`${e}\``).join(', ')}`);
      lines.push('');

      // Source maps — recover original file/dir structure + symbol names (publicly served when present).
      const maps = [];
      for (const s of scriptBodies.slice(0, 12)) {
        const ref = findSourceMapRef(s.code);
        if (!ref) continue;
        let mapJson = null;
        try {
          if (ref.startsWith('data:')) {
            const b64 = ref.indexOf('base64,');
            if (b64 >= 0) mapJson = Buffer.from(ref.slice(b64 + 7), 'base64').toString('utf8');
            else { const c = ref.indexOf(','); if (c >= 0) mapJson = decodeURIComponent(ref.slice(c + 1)); }
          } else {
            const mu = new URL(ref, s.url).href;
            const rr = await fetch(mu, { headers: { 'User-Agent': UA } });
            if (rr.ok) mapJson = (await rr.text()).slice(0, 8_000_000);
          }
        } catch { /* map unavailable */ }
        const parsed = mapJson && parseSourceMap(mapJson);
        if (parsed) maps.push({ bundle: s.name, ...parsed });
      }
      if (maps.length) {
        lines.push('### Recovered Source Maps');
        for (const mp of maps) {
          lines.push(`- **${mp.bundle}** → ${mp.sourceCount} original source${mp.sourceCount === 1 ? '' : 's'}${mp.hasContent ? ' (with original code embedded)' : ''}`);
          for (const src of mp.sources.slice(0, 12)) lines.push(`  - \`${src}\``);
          if (mp.sources.length > 12) lines.push(`  - … +${mp.sources.length - 12} more`);
        }
        lines.push('');
      }

      // Key functions — ranked by network/signing behavior, call-fan-in and size.
      lines.push('### Key Functions (ranked)');
      if (code.keyFunctions.length) {
        lines.push('| Function | Bundle | Size | Callers | Signals | Calls |', '|---|---|--:|--:|---|---|');
        for (const f of code.keyFunctions) {
          const nm = f.name ? `\`${f.name}\`${f.async ? ' (async)' : ''}` : '_(anonymous)_';
          const calls = (f.calls || []).slice(0, 5).join(', ');
          lines.push(`| ${nm} | ${shortName(f.bundle)} | ${f.size} | ${f.callers} | ${(f.flags || []).join(', ') || '—'} | ${calls ? `\`${calls.slice(0, 60)}\`` : '—'} |`);
        }
      } else lines.push('- (no functions parsed — bundles may be encrypted or unavailable)');
      lines.push('');

      // Data-flow: where do the captured request params / doc_ids appear in the code?
      const terms = [];
      for (const s of apiCalls) {
        if (s.graphql) { if (s.graphql.doc_id) terms.push(s.graphql.doc_id); if (s.graphql.variables_keys) terms.push(...s.graphql.variables_keys); }
        if (s.bodyParamKeys) terms.push(...s.bodyParamKeys);
      }
      const traces = terms.length ? traceTerms(code.bundles, terms) : [];
      if (traces.length) {
        lines.push('### Request → Code Data-Flow');
        lines.push('_Functions that reference each captured request parameter. This points at the relevant code; it is not proof of construction._', '');
        for (const t of traces.slice(0, 15)) {
          lines.push(`- \`${t.term}\` referenced in: ${t.refs.map(r => `${r.fn} (${shortName(r.bundle)}${r.flags && r.flags.length ? `, ${r.flags.join('/')}` : ''})`).join('; ')}`);
        }
        lines.push('');
      }
    }
  } catch (e) { lines.push(`> Code analysis skipped: ${String(e.message || e).slice(0, 160)}`, ''); }

  // Clone scaffold outline — honest about what was actually extracted.
  lines.push('## Clone Scaffold Outline', '');
  if (stack.some(s => s.includes('Next.js'))) lines.push('```bash', 'npx create-next-app@latest clone', '# Rebuild app/page.tsx + app/layout.tsx; wire the API Surface calls above', '```');
  else if (stack.some(s => s.includes('React'))) lines.push('```bash', 'npm create vite@latest clone -- --template react-ts', '# Rebuild the component tree; wire the API Surface calls above', '```');
  else if (stack.some(s => s.includes('Vue') || s.includes('Nuxt'))) lines.push('```bash', 'npm create vue@latest clone', '# Rebuild views/components; wire the API Surface calls above', '```');
  else lines.push('```bash', 'mkdir clone && cd clone   # index.html / style.css / main.js', '```');
  if (!apiCalls.length) lines.push('', '_No API surface was captured this run, so the data layer can\'t be scaffolded — the page likely renders server-side or is media-only._');
  lines.push('');

  // API spec stub — built ONLY from the genuine API surface (never CDN media chunks), filled from the
  // captured operation/params rather than blanket TODOs.
  if (apiCalls.length) {
    lines.push('## API Spec Stub (OpenAPI 3.0)', '```yaml', 'openapi: "3.0.0"', 'info:', `  title: "${new URL(url).hostname} API"`, '  version: "0.1.0"', 'paths:');
    const byPath = new Map();
    for (const s of apiCalls) { if (!byPath.has(s.path)) byPath.set(s.path, []); byPath.get(s.path).push(s); }
    for (const [p, calls] of [...byPath.entries()].slice(0, 15)) {
      const safe = (p.replace(/[^a-zA-Z0-9/_\-{}]/g, '_').slice(0, 80)) || '/unknown';
      lines.push(`  "${safe}":`);
      for (const mth of [...new Set(calls.map(c => c.method.toLowerCase()))]) {
        const c = calls.find(cc => cc.method.toLowerCase() === mth);
        const summary = String(c.friendlyName || (c.graphql && (c.graphql.operationName || c.graphql.doc_id)) || `${mth.toUpperCase()} ${p}`).replace(/"/g, "'");
        lines.push(`    ${mth}:`, `      summary: "${summary}"`);
        const params = (c.graphql && c.graphql.variables_keys) || c.bodyParamKeys || [];
        // Use the REQUEST content-type (not the response's) and only emit a body when we actually
        // parsed params — an invented schema with the wrong media type is worse than none.
        if (params.length && (c.method !== 'GET' && c.method !== 'HEAD')) {
          lines.push('      requestBody:', '        content:', `          ${(c.reqContentType || 'application/x-www-form-urlencoded').split(';')[0]}:`,
            '            schema:', '              type: object', '              properties:');
          for (const k of params.slice(0, 20)) lines.push(`                ${String(k).replace(/[^a-zA-Z0-9_]/g, '_')}: { type: string }`);
        }
        lines.push('      responses:', '        "200": { description: "captured" }');
      }
    }
    lines.push('```', '');
  }

  return { slug, kind: 'web', target: url, findings, report: lines.join('\n'), title: `Reverse Engineering — ${pageTitle}` };
}

// Keep only non-sensitive request headers that aid reverse engineering (operation names, app ids).
// Deliberately drops cookies/authorization/csrf tokens so the report never captures the owner's creds.
const KEEP_REQ_HEADERS = ['x-fb-friendly-name', 'x-graphql-operation-name', 'x-ig-app-id', 'x-requested-with', 'content-type', 'x-asbd-id'];
function pickHeaders(h) {
  const out = {};
  for (const k of KEEP_REQ_HEADERS) if (h[k] != null) out[k] = h[k];
  return out;
}

// Playwright network capture — launches the bundled headless Chromium and records requests. We keep a
// larger POST body (GraphQL `variables` are long) and the content-length/range so media chunks can be
// collapsed and API payloads (doc_id, variables) extracted downstream.
async function captureNetwork(url) {
  const { chromium } = await import('playwright');
  await ensureChromium(chromium);
  const requests = [];
  // If the owner has signed in via `browser.login`, reuse that persistent profile so the capture is
  // AUTHENTICATED (the real reel + its GraphQL/API responses load). Otherwise a fresh anonymous context.
  const PROFILE = path.join(WORKSPACE, 'browser-profile');
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  let browser = null, ctx;
  if (existsSync(path.join(PROFILE, 'Default')) || existsSync(path.join(PROFILE, 'Cookies'))) {
    try { ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, userAgent: UA, args }); } catch { /* profile locked/busy — fall back */ }
  }
  if (!ctx) { browser = await chromium.launch({ headless: true, args }); ctx = await browser.newContext({ userAgent: UA }); }
  const page = await ctx.newPage();
  page.on('request', req => requests.push({
    url: req.url(), method: req.method(), type: req.resourceType(),
    postData: req.postDataBuffer()?.toString('utf8')?.slice(0, 8000) ?? null,
    reqHeaders: pickHeaders(req.headers()),
  }));
  // Capture the actual bytes of the executed scripts (+ the document) so we can analyze the REAL bundle,
  // not just its URL. Bounded so a huge page can't blow up memory.
  const bodyJobs = [];
  let bodied = 0;
  page.on('response', res => {
    const m = requests.find(r => r.url === res.url());
    if (!m) return;
    const h = res.headers();
    m.status = res.status();
    m.contentType = h['content-type'] ?? null;
    m.contentLength = h['content-length'] ? Number(h['content-length']) : null;
    m.contentRange = h['content-range'] ?? null;
    const rt = m.type || res.request().resourceType();
    const ct = m.contentType || '';
    // Capture script/document bytes (for code analysis) AND API JSON bodies (for content extraction —
    // a logged-in GraphQL reel response holds the caption, owner, counts, video_url, audio, etc.).
    const grab = (rt === 'script' || rt === 'document') ? bodied < 30
      : ((rt === 'fetch' || rt === 'xhr') && /json|javascript/i.test(ct)) ? bodied < 60 : false;
    if (grab) {
      bodied++;
      bodyJobs.push((async () => {
        try { const buf = await res.body(); if (buf && buf.length <= 4_000_000) m.body = buf.toString('utf8'); } catch { /* body unavailable (cached/opaque) */ }
      })());
    }
  });
  let domHtml = '';
  try { await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }); } catch { /* timeout/nav error acceptable */ }
  try { await Promise.allSettled(bodyJobs); } catch { /* best effort */ }
  try { domHtml = await page.content(); } catch { /* page closed/navigated */ }
  try { await ctx.close(); } catch {}
  if (browser) { try { await browser.close(); } catch {} }
  return { requests, html: domHtml };
}

// ---- binary format identification (shared by app + file) ----

function identifyMagic(sig8, buf) {
  const map = {
    'cafebabe': 'Mach-O fat binary (multi-architecture)', 'feedface': 'Mach-O 32-bit little-endian',
    'feedfacf': 'Mach-O 64-bit little-endian', 'cefaedfe': 'Mach-O 32-bit big-endian', 'cffaedfe': 'Mach-O 64-bit big-endian',
    '89504e47': 'PNG image', 'ffd8ffe0': 'JPEG image', 'ffd8ffe1': 'JPEG/EXIF image', 'ffd8ffdb': 'JPEG image',
    '25504446': 'PDF document', '504b0304': 'ZIP archive (or JAR / DOCX / XLSX / EPUB)', '504b0506': 'ZIP archive (empty)',
    '1f8b0800': 'gzip compressed archive', '425a6839': 'bzip2 compressed archive', 'fd377a58': 'XZ compressed archive',
    '7f454c46': 'ELF binary (Linux/Unix)', '4d5a9000': 'Windows PE executable (MZ)', '4d534346': 'Windows Cabinet (.cab)',
    '52494646': 'RIFF container (AVI or WAV)', '4f676753': 'Ogg container', '664c6143': 'FLAC audio', '377abcaf': '7-Zip archive', 'fffb9000': 'MP3 audio',
  };
  if (sig8.startsWith('4d5a')) return 'Windows PE/MZ executable';
  if (map[sig8]) return map[sig8];
  if (buf.length >= 6 && buf.subarray(0, 6).toString('ascii') === 'SQLite') return 'SQLite database';
  const sample = buf.subarray(0, Math.min(512, buf.length));
  const nonText = [...sample].filter(b => b < 9 || (b > 13 && b < 32)).length;
  if (sample.length && nonText / sample.length < 0.05) return 'Text file (UTF-8 / ASCII)';
  return '(unknown — see magic bytes and hexdump above)';
}

// Infer the app framework/runtime from the binary's strings (cross-platform).
function inferFrameworks(strs) {
  const blob = strs.join('\n');
  const fwks = [];
  const has = re => re.test(blob);
  if (has(/electron|chrome-sandbox|app\.asar/i)) fwks.push('Electron');
  if (has(/Qt\d|QtCore|QtWidgets/)) fwks.push('Qt');
  if (has(/flutter|libflutter/i)) fwks.push('Flutter');
  if (has(/tauri/i)) fwks.push('Tauri');
  if (has(/mscoree|\.NET Framework|System\.Private\.CoreLib|mscorlib/i)) fwks.push('.NET');
  if (has(/python3?\d|Py_Initialize|site-packages/i)) fwks.push('Python');
  if (has(/node_modules|libnode|v8::/)) fwks.push('Node.js');
  if (has(/Go build ID|runtime\.goexit|golang/i)) fwks.push('Go');
  if (has(/rustc|cargo|core::panic/i)) fwks.push('Rust');
  if (has(/UnityPlayer|libunity/i)) fwks.push('Unity');
  return [...new Set(fwks)];
}

// ---- app subcommand (macOS bundle inspection; generic binary analysis elsewhere) ----

async function analyzeApp(appPath, name) {
  const slug = name || slugify(path.basename(appPath));
  const label = path.basename(appPath);
  const findings = { label, frameworks: [], entitlements: [], urlSchemes: [], endpoints: [] };
  const lines = [
    `# Reverse Engineering Report: App — ${label}`, '', ETHICS_NOTE, '',
    `## Target`, `- **Path:** ${appPath}`, `- **Platform:** ${process.platform}`, `- **Date:** ${new Date().toISOString()}`, '',
  ];

  if (process.platform === 'darwin') {
    // ---- macOS-native bundle inspection (otool / plutil / codesign) ----
    const fileR = run('/usr/bin/file', [appPath]);
    findings.format = fileR.stdout.trim().split(':').slice(1).join(':').trim() || null;
    lines.push('## File Type', '```', fileR.stdout.trim() || '(file command returned no output)', '```', '');
    const isBundle = appPath.endsWith('.app');
    let execPath = isBundle ? null : appPath;
    if (isBundle) {
      const plistPath = path.join(appPath, 'Contents/Info.plist');
      if (existsSync(plistPath)) {
        const plR = run('/usr/bin/plutil', ['-p', plistPath]);
        if (plR.status === 0) {
          lines.push('## Info.plist', '```', plR.stdout.slice(0, 3000), '```', '');
          // URL schemes for deep-link detection; ATS-localhost exception flags a local helper/server.
          const sm = plR.stdout.match(/CFBundleURLSchemes"\s*=>\s*\[([\s\S]*?)\]/);
          if (sm) findings.urlSchemes = [...sm[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
          findings.atsLocalhost = /127\.0\.0\.1|"localhost"|NSAllowsLocalNetworking"\s*=>\s*1/.test(plR.stdout);
        }
        const ex = k => run('/usr/bin/plutil', ['-extract', k, 'raw', plistPath]).stdout.trim();
        findings.displayName = ex('CFBundleDisplayName') || ex('CFBundleName') || label.replace(/\.app$/, '');
        findings.bundleId = ex('CFBundleIdentifier') || null;
        findings.version = ex('CFBundleShortVersionString') || null;
        const execName = ex('CFBundleExecutable');
        if (execName) execPath = path.join(appPath, 'Contents/MacOS', execName);
      }
    }
    if (execPath && existsSync(execPath)) {
      const otoolR = run('/usr/bin/otool', ['-L', execPath]);
      if (otoolR.status === 0) {
        lines.push('## Shared Libraries (otool -L)', '```', otoolR.stdout.slice(0, 4000), '```', '');
        const libs = otoolR.stdout; const fwks = [];
        for (const [needle, label2] of [['AppKit', 'AppKit (macOS native)'], ['UIKit', 'UIKit'], ['SwiftUI', 'SwiftUI'], ['CoreData', 'CoreData'], ['WebKit', 'WebKit'], ['AVFoundation', 'AVFoundation'], ['ARKit', 'ARKit'], ['CoreML', 'CoreML'], ['Electron', 'Electron'], ['Flutter', 'Flutter']]) if (libs.includes(needle)) fwks.push(label2);
        findings.frameworks = fwks;
        lines.push('## Inferred Frameworks');
        if (fwks.length) for (const f of fwks) lines.push(`- ${f}`); else lines.push('- (standard system frameworks only)');
        lines.push('');
      }
      try {
        const strs = extractStrings(readFileSync(execPath), { cap: 50 }).filter(s => /https?:\/\/|\.api\.|\/api\/|endpoint|baseURL|baseUrl/i.test(s));
        if (strs.length) { findings.endpoints = strs.slice(0, 20); lines.push('## Interesting Strings (URLs + API hints)', '```', ...strs, '```', ''); }
      } catch {}
    }
    const entR = run('/usr/bin/codesign', ['-d', '--entitlements', '-', appPath], { timeout: 15_000 });
    if (entR.status === 0 && entR.stdout.trim()) {
      findings.entitlements = [...new Set([...entR.stdout.matchAll(/\[Key\]\s+([\w.\-]+)/g)].map(m => m[1]))];
      lines.push('## Entitlements', '```xml', entR.stdout.slice(0, 3000), '```', '');
    }
  } else {
    // ---- generic binary analysis (Windows / Linux) ----
    lines.push(`> macOS bundle inspection (otool/plutil/codesign) only runs on macOS; on ${process.platform} this is a generic binary analysis.`, '');
    let buf;
    try { buf = readFileSync(appPath); } catch (e) { lines.push(`(could not read: ${e.message})`); return { slug, kind: 'app', target: appPath, findings, report: lines.join('\n'), title: `Reverse Engineering — ${label}` }; }
    const sig8 = buf.subarray(0, 4).toString('hex');
    findings.format = identifyMagic(sig8, buf);
    findings.size = `${buf.length.toLocaleString()} bytes`;
    lines.push('## Format Identification', `- **4-byte signature:** \`0x${sig8}\``, `- **Identified as:** ${findings.format}`, `- **Size:** ${buf.length.toLocaleString()} bytes`, '');
    const strs = extractStrings(buf, { cap: 200 });
    const fwks = inferFrameworks(strs);
    findings.frameworks = fwks;
    lines.push('## Inferred Frameworks / Runtime');
    if (fwks.length) for (const f of fwks) lines.push(`- ${f}`); else lines.push('- (no common framework signatures found in strings)');
    lines.push('');
    const hints = strs.filter(s => /https?:\/\/|\.api\.|\/api\/|endpoint|baseURL|baseUrl|\.dll|\.exe|version|build/i.test(s)).slice(0, 50);
    if (hints.length) { findings.endpoints = hints.filter(s => /https?:\/\//.test(s)).slice(0, 20); lines.push('## Interesting Strings (URLs / APIs / modules)', '```', ...hints, '```', ''); }
  }

  return { slug, kind: 'app', target: appPath, findings, report: lines.join('\n'), title: `Reverse Engineering — ${label}` };
}

// ---- file subcommand (pure-JS: magic ID + hexdump + strings; uses external `file` if available) ----

async function analyzeFile(filePath, name) {
  const slug = name || slugify(path.basename(filePath));
  const label = path.basename(filePath);
  const findings = { label, frameworks: [], endpoints: [] };
  const lines = [
    `# Reverse Engineering Report: File — ${label}`, '', ETHICS_NOTE, '',
    `## Target`, `- **Path:** ${filePath}`, `- **Date:** ${new Date().toISOString()}`, '',
  ];

  // Optional external `file` if it's on PATH (Git-for-Windows / *nix); else rely on magic-byte ID below.
  const fileBin = whichTool('file');
  if (fileBin) {
    const fileR = run(fileBin, [filePath]);
    if (fileR.stdout.trim()) lines.push('## File Type (file command)', '```', fileR.stdout.trim(), '```', '');
  }

  let buf;
  try { buf = readFileSync(filePath); }
  catch (e) { lines.push(`(could not read file: ${e.message})`); return { slug, kind: 'file', target: filePath, findings, report: lines.join('\n'), title: `Reverse Engineering — ${label}` }; }

  const sig8 = buf.subarray(0, 4).toString('hex');
  const hex32 = (buf.subarray(0, 32).toString('hex').match(/.{2}/g) ?? []).join(' ');
  const ascii32 = buf.subarray(0, 32).toString('latin1').replace(/[^\x20-\x7e]/g, '.');
  findings.format = identifyMagic(sig8, buf);
  findings.size = `${buf.length.toLocaleString()} bytes`;
  lines.push('## Magic Bytes (first 32 bytes)', '```', `hex:   ${hex32}`, `ascii: ${ascii32}`, '```', '');
  lines.push('## Format Identification', `- **4-byte signature:** \`0x${sig8}\``, `- **Identified as:** ${findings.format}`, `- **Size:** ${buf.length.toLocaleString()} bytes`, '');

  lines.push('## Hexdump (first 256 bytes)', '```', hexdump(buf, 256), '```', '');

  const strs = extractStrings(buf, { min: 6, max: 300, cap: 100 });
  findings.frameworks = inferFrameworks(strs);
  findings.endpoints = strs.filter(s => /https?:\/\//.test(s)).slice(0, 10);
  if (strs.length) lines.push(`## Strings (${strs.length} printable sequences)`, '```', ...strs, '```', '');

  return { slug, kind: 'file', target: filePath, findings, report: lines.join('\n'), title: `Reverse Engineering — ${label}` };
}

// ============================ SYNTHESIS ============================
// A report must LEAD with an explanation, not a wall of raw data. From the structured findings each
// analyzer collected, we synthesize a plain-language "Summary" + "How It Works" brief and splice it in
// right after the Target block. Default is a deterministic, evidence-grounded synthesis (instant, never
// invents). Set HELM_REVERSE_LLM=1 to have the local Claude engine write richer prose instead (it falls
// back to the deterministic version if the engine is unavailable or returns nothing usable).

const bullets = arr => arr.filter(Boolean).map(b => `- ${b}`).join('\n');

function buildWebSummary(f) {
  const host = f.host || 'the site';
  const stack = f.stack || [];
  const api = f.apiCalls || [];
  const c = f.content || {};
  const code = f.code;
  const gql = api.filter(s => s.graphql);
  const isNext = stack.some(s => /Next\.js/i.test(s));
  const isReact = stack.some(s => /React/i.test(s));
  const isVue = stack.some(s => /Vue|Nuxt/i.test(s));

  const stackPhrase = isNext ? 'a Next.js (React) web application'
    : isReact ? 'a React single-page application'
    : isVue ? 'a Vue/Nuxt web application'
    : stack.length ? `a web app built with ${stack.slice(0, 2).join(' + ')}`
    : 'a web page';
  const mediaKind = c.video ? 'a video/media post' : (c.type || c.caption || c.author) ? 'a content post' : '';
  const sum = [`**${host}** is ${stackPhrase}${mediaKind ? ` — the captured page is ${mediaKind}` : ''}.`];
  if (c.author || c.caption) sum.push(`${[c.author && `By ${c.author}`, c.caption && `"${String(c.caption).slice(0, 120)}"`].filter(Boolean).join(' — ')}.`);
  if (api.length) sum.push(`Its data layer is ${gql.length ? 'a GraphQL API' : 'a REST/XHR API'} (${api.length} distinct call${api.length === 1 ? '' : 's'} captured).`);
  if (f.loggedOut) sum.push('This was the **logged-out shell** — the authenticated app and its real API did not load.');

  const how = [];
  how.push(isNext ? 'Rendering — server-rendered React (Next.js), hydrated in the browser; pages are React components.'
    : isReact ? 'Rendering — a client-side React SPA: the HTML shell boots JS bundles that build the UI in the browser.'
    : isVue ? 'Rendering — a Vue/Nuxt app: components render client-side once the JS loads.'
    : 'Rendering — largely static or server-rendered HTML.');
  if (gql.length) {
    const ops = gql.map(s => s.friendlyName || (s.graphql && (s.graphql.operationName || (s.graphql.doc_id && `doc_id ${s.graphql.doc_id}`)))).filter(Boolean).slice(0, 4);
    how.push(`Data — a GraphQL endpoint using ${gql.some(s => s.graphql && s.graphql.doc_id) ? 'persisted queries (doc_id-keyed)' : 'named operations'}${ops.length ? `, e.g. ${ops.map(o => `\`${o}\``).join(', ')}` : ''}.`);
  } else if (api.length) {
    how.push(`Data — REST/XHR calls, e.g. ${api.slice(0, 4).map(s => `\`${s.method} ${s.path}\``).join(', ')}.`);
  }
  if (c.video || c.image) how.push('Media — video/images are served from a CDN (often as byte-range chunks), separate from the API surface.');
  if (code) {
    const ks = (code.keyFunctions || []).filter(fn => fn.flags && fn.flags.length).slice(0, 3).map(fn => `\`${fn.name || '(anon)'}\` (${fn.flags.join('/')})`);
    how.push(`Client code — ${code.totalFunctions} functions across ${code.bundleCount} bundle(s)${code.moduleSystems && code.moduleSystems.length ? `, ${code.moduleSystems.join('/')} modules` : ''}${ks.length ? `; notable: ${ks.join(', ')}` : ''}.`);
  }
  if (f.loggedOut) how.push('Auth — a login wall gates the real app; everything captured is public bootstrap, telemetry and route-prefetch.');
  if (how.length <= 1 && !api.length) how.push('No dynamic API surface was captured — the page is likely server-rendered or media-only.');

  return `## Summary\n${sum.join(' ')}\n\n## How It Works\n${bullets(how)}`;
}

function buildAppSummary(f) {
  const name = f.displayName || f.label;
  const fw = f.frameworks || [];
  const ents = f.entitlements || [];
  const schemes = f.urlSchemes || [];
  const isElectron = fw.some(x => /Electron/i.test(x));
  const isFlutter = fw.some(x => /Flutter/i.test(x));
  const nativeFw = fw.filter(x => /AppKit|SwiftUI|UIKit|WebKit/i.test(x));

  const techPhrase = isElectron ? 'an Electron desktop app (a web UI running in a Chromium shell)'
    : isFlutter ? 'a Flutter app (UI drawn by the Flutter/Skia engine from compiled Dart)'
    : nativeFw.length ? `a native app using ${nativeFw.join(', ')}`
    : fw.length ? `built with ${fw.join(', ')}`
    : 'an application';
  const ver = f.version ? ` v${f.version}` : '';
  const idp = f.bundleId ? ` (\`${f.bundleId}\`)` : '';
  const sum = [`**${name}**${ver}${idp} is ${techPhrase}.`];
  if (f.format && !/^directory$/i.test(f.format)) sum.push(`Binary: ${f.format}.`);

  const how = [];
  if (isElectron) how.push('Architecture — Electron pairs a Chromium renderer (the UI, written in HTML/CSS/JS) with a Node.js main process for native/OS work; the UI code ships bundled in `Contents/Resources/app.asar`.');
  else if (isFlutter) how.push('Architecture — Flutter renders its own widgets via the Skia engine from Dart code compiled into the binary; no system UI toolkit.');
  else if (nativeFw.length) how.push(`Architecture — a native app built on ${nativeFw.join(', ')}.`);
  if (fw.length) how.push(`Frameworks linked: ${fw.join(', ')}.`);
  if (schemes.length) how.push(`Deep links — registers the \`${schemes.map(s => s + '://').join('`, `')}\` URL scheme(s) so other apps/links can drive it.`);
  if (f.atsLocalhost) how.push('Networking — its ATS config permits insecure HTTP to `127.0.0.1`/`localhost`, so it likely runs or talks to a local helper/server.');
  if (ents.length) how.push(`Capabilities (entitlements): ${ents.slice(0, 10).join(', ')}${ents.length > 10 ? ', …' : ''}.`);
  if (f.endpoints && f.endpoints.length) how.push(`Network hints in the binary: ${f.endpoints.slice(0, 5).map(e => `\`${String(e).slice(0, 80)}\``).join(', ')}.`);
  if (!how.length) how.push('Generic binary — no framework/runtime signatures or capabilities detected to explain its operation.');

  return `## Summary\n${sum.join(' ')}\n\n## How It Works\n${bullets(how)}`;
}

function buildFileSummary(f) {
  const sum = [`**${f.label}** is ${f.format ? `a ${f.format}` : 'a file'}${f.size ? `, ${f.size}` : ''}.`];
  const how = [];
  if (f.frameworks && f.frameworks.length) how.push(`Runtime/framework hints: ${f.frameworks.join(', ')}.`);
  if (f.endpoints && f.endpoints.length) how.push(`Embedded URLs/APIs: ${f.endpoints.slice(0, 5).map(e => `\`${String(e).slice(0, 80)}\``).join(', ')}.`);
  how.push('Identified by magic-byte signature; lower-level structure is in the hexdump and strings below.');
  return `## Summary\n${sum.join(' ')}\n\n## How It Works\n${bullets(how)}`;
}

function deterministicSummary(result) {
  const f = result.findings || {};
  if (result.kind === 'web') return buildWebSummary(f);
  if (result.kind === 'app') return buildAppSummary(f);
  return buildFileSummary(f);
}

function resolveClaudeBin() {
  const cands = [process.env.CLAUDE_BIN, path.join(os.homedir(), '.local/bin/claude'), path.join(os.homedir(), '.claude/local/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'].filter(Boolean);
  for (const c of cands) { try { if (existsSync(c)) return c; } catch {} }
  return 'claude';
}

// Opt-in (HELM_REVERSE_LLM=1): hand the collected findings to the Claude engine for richer prose.
function llmSummary(result) {
  const prompt = `Write the executive brief for a reverse-engineering report on this ${result.kind} target: ${result.target}.
Using ONLY the raw findings below, output GitHub Markdown with EXACTLY two sections and nothing else:

## Summary
2-4 plain-language sentences: what it is, what it's built with, its purpose.

## How It Works
4-8 concrete bullets walking through the architecture and runtime data flow — what talks to what, how data moves, the key mechanisms. Cite real evidence (actual frameworks, endpoints, function names). If something isn't known from the findings, say so; never invent.

No preamble, no other sections.

RAW FINDINGS:
${result.report.slice(0, 14000)}`;
  try {
    const r = spawnSync(resolveClaudeBin(), ['-p', '--model', 'sonnet'], { input: prompt, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    const out = (r.stdout || '').trim();
    if (r.status === 0 && /##\s*Summary/i.test(out) && out.length > 60) return out;
  } catch {}
  return null;
}

function buildReportSummary(result) {
  if (process.env.HELM_REVERSE_LLM === '1') { const llm = llmSummary(result); if (llm) return llm; }
  return deterministicSummary(result);
}

// Splice the summary in right after the "## Target" block so the report opens with the explanation.
function insertSummary(report, summaryMd) {
  if (!summaryMd) return report;
  const lines = report.split('\n');
  const ti = lines.findIndex(l => /^##\s+Target\s*$/.test(l));
  if (ti < 0) return summaryMd + '\n\n' + report;
  let j = ti + 1;
  while (j < lines.length && !/^##\s/.test(lines[j])) j++;   // walk to the next "## " heading
  lines.splice(j, 0, '', summaryMd, '');
  return lines.join('\n');
}

// ---- main ----

async function main() {
  const verb = process.argv[2];
  const target = process.argv[3];
  const rest = process.argv.slice(4);
  const get = k => { const i = rest.indexOf(`--${k}`); return i !== -1 ? rest[i + 1] : null; };
  const name = get('name');

  if (!verb || !target) { console.error('usage: reverse.mjs <web|app|file> <target> [--name <slug>]'); process.exit(1); }
  mkdirSync(REVERSE_DIR, { recursive: true });

  let result;
  if (verb === 'web') result = await analyzeWeb(target, name);
  else if (verb === 'app') result = await analyzeApp(target, name);
  else if (verb === 'file') result = await analyzeFile(target, name);
  else { console.error(`unknown subcommand: ${verb}. Use web, app, or file.`); process.exit(1); }

  // Lead with a synthesized plain-language brief (what it is + how it works), built from the findings.
  try { result.report = insertSummary(result.report, buildReportSummary(result)); } catch {}

  const mdPath = path.join(REVERSE_DIR, `${result.slug}-report.md`);
  writeFileSync(mdPath, result.report, 'utf8');

  // ALWAYS render a PDF (the headline output). Markdown is kept alongside it.
  let pdfPath = path.join(REVERSE_DIR, `${result.slug}-report.pdf`), pdfError = null;
  try { await writePdf(result.report, pdfPath, result.title || result.slug); }
  catch (e) { pdfError = String(e.message || e); pdfPath = null; }

  console.log(JSON.stringify({ ok: true, pdf: pdfPath, report: mdPath, pdf_error: pdfError, slug: result.slug }));
}

// Pure helpers exported for unit tests (no side effects on import).
export { detectStack, classifyRequest, mediaKey, parseForm, summarizeApiCall, extractScripts, extractLinks, extractContent };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
