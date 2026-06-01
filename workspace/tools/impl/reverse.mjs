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

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE   = path.resolve(__dirname, '../..');
const REVERSE_DIR = path.join(WORKSPACE, 'reverse');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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
async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, {
      redirect: 'follow', signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
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

function detectStack(html, headers) {
  const found = [];
  const h = html.toLowerCase();
  if (h.includes('__reactfiber') || h.includes('data-reactroot') || h.includes('react-dom')) found.push('React');
  if ((h.includes('vue') && (h.includes('v-if') || h.includes('__vue'))) || h.includes('vuejs')) found.push('Vue');
  if (h.includes('ng-app') || h.includes('ng-version') || h.includes('angular')) found.push('Angular');
  if (h.includes('__nuxt') || h.includes('/_nuxt/')) found.push('Nuxt');
  if (h.includes('__next') || h.includes('/_next/')) found.push('Next.js');
  if (h.includes('svelte')) found.push('Svelte');
  if (h.includes('gatsby')) found.push('Gatsby');
  if (h.includes('htmx.org') || h.includes('hx-get')) found.push('htmx');
  if (h.includes('jquery')) found.push('jQuery');
  if (h.includes('bootstrap')) found.push('Bootstrap');
  if (h.includes('tailwind')) found.push('Tailwind CSS');
  if (h.includes('graphql')) found.push('GraphQL');
  if (h.includes('apollo')) found.push('Apollo');
  const genM = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
  if (genM) found.push(`Generator: ${genM[1].trim()}`);
  if (headers['x-powered-by']) found.push(`Powered-by: ${headers['x-powered-by']}`);
  if (headers['server']) found.push(`Server: ${headers['server']}`);
  if (headers['x-vercel-id'] || headers['x-vercel-cache']) found.push('Vercel');
  if (headers['cf-ray']) found.push('Cloudflare');
  if (headers['x-amz-cf-id'] || headers['x-amz-request-id']) found.push('AWS');
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
  return srcs.slice(0, 20);
}

// ---- web subcommand ----

async function analyzeWeb(url, name) {
  const slug = name || slugify(url);
  const lines = [
    `# Reverse Engineering Report: Web — ${url}`, '', ETHICS_NOTE, '',
    `## Target`, `- **URL:** ${url}`, `- **Date:** ${new Date().toISOString()}`, '',
  ];

  const resp = await fetchPage(url);
  const headers = resp.headers;
  const html = resp.html;
  if (resp.error) lines.push(`> Fetch warning: ${resp.error}`, '');
  lines.push(`- **HTTP status:** ${resp.status || 'n/a'}${resp.finalUrl && resp.finalUrl !== url ? `  ·  redirected to ${resp.finalUrl}` : ''}`, '');

  const titleM = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
  const pageTitle = titleM ? titleM[1].trim() : new URL(url).hostname;

  // Stack detection
  const stack = detectStack(html, headers);
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

  // Script sources
  const scripts = extractScripts(html);
  lines.push(`## Script Sources (${scripts.length})`);
  if (scripts.length) for (const s of scripts) lines.push(`- \`${s}\``);
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

  // Playwright network capture (Chromium is bundled; we also use it for the PDF)
  let netData = null;
  try { netData = await captureNetwork(url); } catch (e) { lines.push(`> Network capture skipped: ${String(e.message || e).slice(0, 120)}`, ''); }

  if (netData) {
    const xhrCalls = netData.requests.filter(r => r.type === 'fetch' || r.type === 'xhr');
    lines.push(`## Network Capture (Playwright — ${netData.requests.length} total, ${xhrCalls.length} XHR/fetch)`);
    if (xhrCalls.length) {
      for (const req of xhrCalls.slice(0, 30)) {
        lines.push(`- **${req.method}** \`${req.url}\``);
        if (req.postData) lines.push(`  - Body snippet: \`${req.postData.slice(0, 200)}\``);
        if (req.status) lines.push(`  - Status: ${req.status} | Content-Type: ${req.contentType || '?'}`);
      }
    } else lines.push('- (no XHR/fetch calls captured during page load)');
    lines.push('');
  }

  // Clone scaffold outline
  lines.push('## Clone Scaffold Outline', '');
  if (stack.some(s => s.includes('Next.js'))) lines.push('```bash', 'npx create-next-app@latest clone', '# Recreate: app/page.tsx (home), app/layout.tsx (shell)', '# Identify data sources from the API endpoints above', '```');
  else if (stack.some(s => s.includes('React'))) lines.push('```bash', 'npm create vite@latest clone -- --template react-ts', '# Recreate: src/App.tsx and the component tree from the page structure', '```');
  else if (stack.some(s => s.includes('Vue') || s.includes('Nuxt'))) lines.push('```bash', 'npm create vue@latest clone', '# Recreate: src/views/ and src/components/ from the page structure', '```');
  else lines.push('```bash', 'mkdir clone && cd clone', '# index.html  — main shell', '# style.css   — extracted styles', '# main.js     — extracted scripts', '```');
  lines.push('');

  // API spec stub if endpoints found
  const allEndpoints = [...endpoints, ...(netData?.requests.filter(r => r.type === 'fetch' || r.type === 'xhr').map(r => r.url) || [])];
  if (allEndpoints.length) {
    lines.push('## API Spec Stub (OpenAPI 3.0)', '```yaml', 'openapi: "3.0.0"', 'info:', `  title: "${new URL(url).hostname} API"`, '  version: "0.1.0"', 'paths:');
    for (const ep of [...new Set(allEndpoints)].slice(0, 15)) {
      let p = ep; try { p = new URL(ep).pathname; } catch {}
      const safe = p.replace(/[^a-zA-Z0-9/_\-{}]/g, '_').slice(0, 80) || '/unknown';
      lines.push(`  ${safe}:`, '    get:', '      summary: "TODO — fill from network capture"', '      responses:', '        "200":', '          description: "TODO"');
    }
    lines.push('```', '');
  }

  return { slug, report: lines.join('\n'), title: `Reverse Engineering — ${pageTitle}` };
}

// Playwright network capture — launches the bundled headless Chromium and records requests.
async function captureNetwork(url) {
  const { chromium } = await import('playwright');
  await ensureChromium(chromium);
  const requests = [];
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ userAgent: UA });
  const page = await ctx.newPage();
  page.on('request', req => requests.push({ url: req.url(), method: req.method(), type: req.resourceType(), postData: req.postDataBuffer()?.toString('utf8')?.slice(0, 500) ?? null }));
  page.on('response', res => { const m = requests.find(r => r.url === res.url()); if (m) { m.status = res.status(); m.contentType = res.headers()['content-type'] ?? null; } });
  try { await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }); } catch { /* timeout/nav error acceptable */ }
  await browser.close();
  return { requests };
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
  const lines = [
    `# Reverse Engineering Report: App — ${label}`, '', ETHICS_NOTE, '',
    `## Target`, `- **Path:** ${appPath}`, `- **Platform:** ${process.platform}`, `- **Date:** ${new Date().toISOString()}`, '',
  ];

  if (process.platform === 'darwin') {
    // ---- macOS-native bundle inspection (otool / plutil / codesign) ----
    const fileR = run('/usr/bin/file', [appPath]);
    lines.push('## File Type', '```', fileR.stdout.trim() || '(file command returned no output)', '```', '');
    const isBundle = appPath.endsWith('.app');
    let execPath = isBundle ? null : appPath;
    if (isBundle) {
      const plistPath = path.join(appPath, 'Contents/Info.plist');
      if (existsSync(plistPath)) {
        const plR = run('/usr/bin/plutil', ['-p', plistPath]);
        if (plR.status === 0) lines.push('## Info.plist', '```', plR.stdout.slice(0, 3000), '```', '');
        const execName = run('/usr/bin/plutil', ['-extract', 'CFBundleExecutable', 'raw', plistPath]).stdout.trim();
        if (execName) execPath = path.join(appPath, 'Contents/MacOS', execName);
      }
    }
    if (execPath && existsSync(execPath)) {
      const otoolR = run('/usr/bin/otool', ['-L', execPath]);
      if (otoolR.status === 0) {
        lines.push('## Shared Libraries (otool -L)', '```', otoolR.stdout.slice(0, 4000), '```', '');
        const libs = otoolR.stdout; const fwks = [];
        for (const [needle, label2] of [['AppKit', 'AppKit (macOS native)'], ['UIKit', 'UIKit'], ['SwiftUI', 'SwiftUI'], ['CoreData', 'CoreData'], ['WebKit', 'WebKit'], ['AVFoundation', 'AVFoundation'], ['ARKit', 'ARKit'], ['CoreML', 'CoreML'], ['Electron', 'Electron'], ['Flutter', 'Flutter']]) if (libs.includes(needle)) fwks.push(label2);
        lines.push('## Inferred Frameworks');
        if (fwks.length) for (const f of fwks) lines.push(`- ${f}`); else lines.push('- (standard system frameworks only)');
        lines.push('');
      }
      try {
        const strs = extractStrings(readFileSync(execPath), { cap: 50 }).filter(s => /https?:\/\/|\.api\.|\/api\/|endpoint|baseURL|baseUrl/i.test(s));
        if (strs.length) lines.push('## Interesting Strings (URLs + API hints)', '```', ...strs, '```', '');
      } catch {}
    }
    const entR = run('/usr/bin/codesign', ['-d', '--entitlements', '-', appPath], { timeout: 15_000 });
    if (entR.status === 0 && entR.stdout.trim()) lines.push('## Entitlements', '```xml', entR.stdout.slice(0, 3000), '```', '');
  } else {
    // ---- generic binary analysis (Windows / Linux) ----
    lines.push(`> macOS bundle inspection (otool/plutil/codesign) only runs on macOS; on ${process.platform} this is a generic binary analysis.`, '');
    let buf;
    try { buf = readFileSync(appPath); } catch (e) { lines.push(`(could not read: ${e.message})`); return { slug, report: lines.join('\n'), title: `Reverse Engineering — ${label}` }; }
    const sig8 = buf.subarray(0, 4).toString('hex');
    lines.push('## Format Identification', `- **4-byte signature:** \`0x${sig8}\``, `- **Identified as:** ${identifyMagic(sig8, buf)}`, `- **Size:** ${buf.length.toLocaleString()} bytes`, '');
    const strs = extractStrings(buf, { cap: 200 });
    const fwks = inferFrameworks(strs);
    lines.push('## Inferred Frameworks / Runtime');
    if (fwks.length) for (const f of fwks) lines.push(`- ${f}`); else lines.push('- (no common framework signatures found in strings)');
    lines.push('');
    const hints = strs.filter(s => /https?:\/\/|\.api\.|\/api\/|endpoint|baseURL|baseUrl|\.dll|\.exe|version|build/i.test(s)).slice(0, 50);
    if (hints.length) lines.push('## Interesting Strings (URLs / APIs / modules)', '```', ...hints, '```', '');
  }

  return { slug, report: lines.join('\n'), title: `Reverse Engineering — ${label}` };
}

// ---- file subcommand (pure-JS: magic ID + hexdump + strings; uses external `file` if available) ----

async function analyzeFile(filePath, name) {
  const slug = name || slugify(path.basename(filePath));
  const label = path.basename(filePath);
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
  catch (e) { lines.push(`(could not read file: ${e.message})`); return { slug, report: lines.join('\n'), title: `Reverse Engineering — ${label}` }; }

  const sig8 = buf.subarray(0, 4).toString('hex');
  const hex32 = (buf.subarray(0, 32).toString('hex').match(/.{2}/g) ?? []).join(' ');
  const ascii32 = buf.subarray(0, 32).toString('latin1').replace(/[^\x20-\x7e]/g, '.');
  lines.push('## Magic Bytes (first 32 bytes)', '```', `hex:   ${hex32}`, `ascii: ${ascii32}`, '```', '');
  lines.push('## Format Identification', `- **4-byte signature:** \`0x${sig8}\``, `- **Identified as:** ${identifyMagic(sig8, buf)}`, `- **Size:** ${buf.length.toLocaleString()} bytes`, '');

  lines.push('## Hexdump (first 256 bytes)', '```', hexdump(buf, 256), '```', '');

  const strs = extractStrings(buf, { min: 6, max: 300, cap: 100 });
  if (strs.length) lines.push(`## Strings (${strs.length} printable sequences)`, '```', ...strs, '```', '');

  return { slug, report: lines.join('\n'), title: `Reverse Engineering — ${label}` };
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

  const mdPath = path.join(REVERSE_DIR, `${result.slug}-report.md`);
  writeFileSync(mdPath, result.report, 'utf8');

  // ALWAYS render a PDF (the headline output). Markdown is kept alongside it.
  let pdfPath = path.join(REVERSE_DIR, `${result.slug}-report.pdf`), pdfError = null;
  try { await writePdf(result.report, pdfPath, result.title || result.slug); }
  catch (e) { pdfError = String(e.message || e); pdfPath = null; }

  console.log(JSON.stringify({ ok: true, pdf: pdfPath, report: mdPath, pdf_error: pdfError, slug: result.slug }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
