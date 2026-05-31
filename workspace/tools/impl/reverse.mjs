#!/usr/bin/env node
// reverse.mjs — analyze a target and write a structured report to workspace/reverse/.
// ETHICS: for the OWNER'S OWN or clearly authorized targets only.
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

function parseHeaders(raw) {
  const h = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^:]+):\s*(.+)$/);
    if (m) h[m[1].toLowerCase().trim()] = m[2].trim();
  }
  return h;
}

// ---- web subcommand ----

async function analyzeWeb(url, name) {
  const slug = name || slugify(url);
  const lines = [
    `# Reverse Engineering Report: Web — ${url}`,
    '',
    ETHICS_NOTE,
    '',
    `## Target`,
    `- **URL:** ${url}`,
    `- **Date:** ${new Date().toISOString()}`,
    '',
  ];

  // Fetch headers
  const headR = run('/usr/bin/curl', [
    '-sI', '--max-time', '15',
    '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    url,
  ]);
  const headers = parseHeaders(headR.stdout);

  // Fetch body
  const bodyR = run('/usr/bin/curl', [
    '-sL', '--max-time', '30', '--max-filesize', '3000000',
    '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    url,
  ]);
  const html = bodyR.stdout;

  // Stack detection
  const stack = detectStack(html, headers);
  lines.push('## Detected Stack');
  if (stack.length) { for (const s of stack) lines.push(`- ${s}`); }
  else lines.push('- (none detected via static analysis)');
  lines.push('');

  // Interesting response headers
  lines.push('## Response Headers');
  const interesting = [
    'server', 'x-powered-by', 'content-type', 'x-frame-options',
    'content-security-policy', 'strict-transport-security',
    'x-content-type-options', 'cache-control',
    'cf-ray', 'x-vercel-id', 'x-amz-cf-id',
  ];
  let anyHeader = false;
  for (const k of interesting) {
    if (headers[k]) { lines.push(`- **${k}:** \`${headers[k].slice(0, 200)}\``); anyHeader = true; }
  }
  if (!anyHeader) lines.push('- (no interesting headers captured)');
  lines.push('');

  // Script sources
  const scripts = extractScripts(html);
  lines.push(`## Script Sources (${scripts.length})`);
  if (scripts.length) { for (const s of scripts) lines.push(`- \`${s}\``); }
  else lines.push('- (none)');
  lines.push('');

  // Static API endpoint extraction
  const endpoints = extractApiEndpoints(html);
  lines.push(`## API Endpoints (static analysis, ${endpoints.length} found)`);
  if (endpoints.length) { for (const ep of endpoints) lines.push(`- \`${ep}\``); }
  else lines.push('- (none found in static HTML/JS; Playwright network capture may find dynamic calls)');
  lines.push('');

  // Page metadata
  const titleM  = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
  const descM   = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,300})["']/i);
  lines.push('## Page Metadata');
  if (titleM) lines.push(`- **Title:** ${titleM[1].trim()}`);
  if (descM)  lines.push(`- **Description:** ${descM[1].trim()}`);
  if (!titleM && !descM) lines.push('- (no title or description meta found)');
  lines.push('');

  // Playwright network capture (lazy — only if playwright is resolvable)
  let netData = null;
  try {
    // Quick non-launching check: can we import playwright?
    const pwCheck = run('node', [
      '--input-type=module', '-e',
      "import('playwright').then(()=>process.exit(0)).catch(()=>process.exit(1))",
    ], { timeout: 10_000 });
    if (pwCheck.status === 0) {
      netData = await captureNetwork(url);
    }
  } catch { /* playwright not installed — skip */ }

  if (netData) {
    const xhrCalls = netData.requests.filter(r => r.type === 'fetch' || r.type === 'xhr');
    lines.push(`## Network Capture (Playwright — ${netData.requests.length} total, ${xhrCalls.length} XHR/fetch)`);
    if (xhrCalls.length) {
      for (const req of xhrCalls.slice(0, 30)) {
        lines.push(`- **${req.method}** \`${req.url}\``);
        if (req.postData) lines.push(`  - Body snippet: \`${req.postData.slice(0, 200)}\``);
        if (req.status)   lines.push(`  - Status: ${req.status} | Content-Type: ${req.contentType || '?'}`);
      }
    } else {
      lines.push('- (no XHR/fetch calls captured during page load)');
    }
    lines.push('');
  }

  // Clone scaffold outline
  lines.push('## Clone Scaffold Outline');
  lines.push('');
  if (stack.some(s => s.includes('Next.js'))) {
    lines.push('```bash');
    lines.push('npx create-next-app@latest clone');
    lines.push('# Recreate: app/page.tsx (home), app/layout.tsx (shell)');
    lines.push('# Identify data sources from API endpoints above');
    lines.push('```');
  } else if (stack.some(s => s.includes('React'))) {
    lines.push('```bash');
    lines.push('npm create vite@latest clone -- --template react-ts');
    lines.push('# Recreate: src/App.tsx and component tree from page structure');
    lines.push('```');
  } else if (stack.some(s => s.includes('Vue') || s.includes('Nuxt'))) {
    lines.push('```bash');
    lines.push('npm create vue@latest clone');
    lines.push('# Recreate: src/views/ and src/components/ from page structure');
    lines.push('```');
  } else {
    lines.push('```bash');
    lines.push('mkdir clone && cd clone');
    lines.push('# index.html  — main shell');
    lines.push('# style.css   — extracted styles');
    lines.push('# main.js     — extracted scripts');
    lines.push('```');
  }
  lines.push('');

  // API spec stub if endpoints found
  const allEndpoints = [...endpoints, ...(netData?.requests.filter(r => r.type === 'fetch' || r.type === 'xhr').map(r => r.url) || [])];
  if (allEndpoints.length) {
    lines.push('## API Spec Stub (OpenAPI 3.0)');
    lines.push('```yaml');
    lines.push('openapi: "3.0.0"');
    lines.push('info:');
    lines.push(`  title: "${new URL(url).hostname} API"`);
    lines.push('  version: "0.1.0"');
    lines.push('paths:');
    for (const ep of [...new Set(allEndpoints)].slice(0, 15)) {
      let p = ep;
      try { p = new URL(ep).pathname; } catch {}
      const safe = p.replace(/[^a-zA-Z0-9/_\-{}]/g, '_').slice(0, 80) || '/unknown';
      lines.push(`  ${safe}:`);
      lines.push('    get:');
      lines.push('      summary: "TODO — fill from network capture"');
      lines.push('      responses:');
      lines.push('        "200":');
      lines.push('          description: "TODO"');
    }
    lines.push('```');
    lines.push('');
  }

  return { slug, report: lines.join('\n') };
}

// Playwright network capture — only called when playwright is confirmed available.
async function captureNetwork(url) {
  const { chromium } = await import('playwright');
  const requests = [];
  const browser  = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx      = await browser.newContext();
  const page     = await ctx.newPage();

  page.on('request', req => {
    requests.push({
      url:      req.url(),
      method:   req.method(),
      type:     req.resourceType(),
      postData: req.postDataBuffer()?.toString('utf8')?.slice(0, 500) ?? null,
    });
  });
  page.on('response', async res => {
    const match = requests.find(r => r.url === res.url());
    if (match) {
      match.status      = res.status();
      match.contentType = res.headers()['content-type'] ?? null;
    }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch { /* timeout or nav error is acceptable */ }

  await browser.close();
  return { requests };
}

// ---- app subcommand (macOS) ----

async function analyzeApp(appPath, name) {
  const slug  = name || slugify(path.basename(appPath));
  const label = path.basename(appPath);
  const lines = [
    `# Reverse Engineering Report: App — ${label}`,
    '',
    ETHICS_NOTE,
    '',
    `## Target`,
    `- **Path:** ${appPath}`,
    `- **Date:** ${new Date().toISOString()}`,
    '',
  ];

  // file
  const fileR = run('/usr/bin/file', [appPath]);
  lines.push('## File Type');
  lines.push('```');
  lines.push(fileR.stdout.trim() || '(file command returned no output)');
  lines.push('```');
  lines.push('');

  const isBundle = appPath.endsWith('.app');
  let execPath   = null;

  if (isBundle) {
    const plistPath = path.join(appPath, 'Contents/Info.plist');
    if (existsSync(plistPath)) {
      const plR = run('/usr/bin/plutil', ['-p', plistPath]);
      if (plR.status === 0) {
        lines.push('## Info.plist');
        lines.push('```');
        lines.push(plR.stdout.slice(0, 3000));
        lines.push('```');
        lines.push('');
      }
      const execR = run('/usr/bin/plutil', ['-extract', 'CFBundleExecutable', 'raw', plistPath]);
      const execName = execR.stdout.trim();
      if (execName) execPath = path.join(appPath, 'Contents/MacOS', execName);
    }
  } else {
    execPath = appPath;
  }

  if (execPath && existsSync(execPath)) {
    // otool -L
    const otoolR = run('/usr/bin/otool', ['-L', execPath]);
    if (otoolR.status === 0) {
      lines.push('## Shared Libraries (otool -L)');
      lines.push('```');
      lines.push(otoolR.stdout.slice(0, 4000));
      lines.push('```');
      lines.push('');

      // Infer frameworks
      const libs = otoolR.stdout;
      const fwks = [];
      if (libs.includes('AppKit'))        fwks.push('AppKit (macOS native)');
      if (libs.includes('UIKit'))         fwks.push('UIKit');
      if (libs.includes('SwiftUI'))       fwks.push('SwiftUI');
      if (libs.includes('CoreData'))      fwks.push('CoreData');
      if (libs.includes('WebKit'))        fwks.push('WebKit');
      if (libs.includes('AVFoundation'))  fwks.push('AVFoundation');
      if (libs.includes('ARKit'))         fwks.push('ARKit');
      if (libs.includes('CoreML'))        fwks.push('CoreML');
      if (libs.includes('Electron') || libs.includes('node_modules')) fwks.push('Electron');
      if (libs.includes('Flutter'))       fwks.push('Flutter');
      if (libs.includes('React'))         fwks.push('React Native');

      lines.push('## Inferred Frameworks');
      if (fwks.length) { for (const f of fwks) lines.push(`- ${f}`); }
      else lines.push('- (standard system frameworks only)');
      lines.push('');
    }

    // strings — filter for interesting ones
    const strR = run('/usr/bin/strings', [execPath], { timeout: 20_000 });
    if (strR.status === 0) {
      const interesting = strR.stdout.split('\n')
        .filter(s => s.length >= 8 && s.length <= 300)
        .filter(s => /https?:\/\/|\.api\.|\/api\/|endpoint|baseURL|baseUrl|version\s*=|build[Nn]umber/i.test(s))
        .slice(0, 50);
      if (interesting.length) {
        lines.push('## Interesting Strings (URLs + API hints)');
        lines.push('```');
        for (const s of interesting) lines.push(s);
        lines.push('```');
        lines.push('');
      }
    }
  }

  // Entitlements
  const entR = run('/usr/bin/codesign', ['-d', '--entitlements', '-', appPath], { timeout: 15_000 });
  if (entR.status === 0 && entR.stdout.trim()) {
    lines.push('## Entitlements');
    lines.push('```xml');
    lines.push(entR.stdout.slice(0, 3000));
    lines.push('```');
    lines.push('');
  }

  return { slug, report: lines.join('\n') };
}

// ---- file subcommand ----

function identifyMagic(sig8, buf) {
  // sig8 is 8 hex chars = 4 bytes
  const map = {
    'cafebabe': 'Mach-O fat binary (multi-architecture)',
    'feedface': 'Mach-O 32-bit little-endian',
    'feedfacf': 'Mach-O 64-bit little-endian',
    'cefaedfe': 'Mach-O 32-bit big-endian',
    'cffaedfe': 'Mach-O 64-bit big-endian',
    '89504e47': 'PNG image (Portable Network Graphics)',
    'ffd8ffe0': 'JPEG image',
    'ffd8ffe1': 'JPEG/EXIF image',
    'ffd8ffdb': 'JPEG image',
    '25504446': 'PDF document',
    '504b0304': 'ZIP archive (or JAR / DOCX / XLSX / EPUB)',
    '504b0506': 'ZIP archive (empty)',
    '1f8b0800': 'gzip compressed archive',
    '425a6839': 'bzip2 compressed archive',
    'fd377a58': 'XZ compressed archive',
    '7f454c46': 'ELF binary (Linux/Unix)',
    '4d5a9000': 'Windows PE executable (MZ)',
    '4d534346': 'Windows Cabinet (.cab)',
    '52494646': 'RIFF container (AVI or WAV)',
    '00000020': 'MP4 / QuickTime container (ftyp check needed)',
    '4f676753': 'Ogg container',
    '664c6143': 'FLAC audio',
    '377abcaf': '7-Zip archive',
    'fffb9000': 'MP3 audio',
    'id3\x02\x00\x00': 'MP3 with ID3 tag',
  };
  // 2-byte check for MZ
  if (sig8.startsWith('4d5a')) return 'Windows PE/MZ executable';
  if (map[sig8]) return map[sig8];

  // SQLite
  if (buf.length >= 6 && buf.slice(0, 6).toString('ascii') === 'SQLite') return 'SQLite database';

  // Text heuristic
  const sample = buf.slice(0, Math.min(512, buf.length));
  const nonText = [...sample].filter(b => b < 9 || (b > 13 && b < 32)).length;
  if (sample.length && nonText / sample.length < 0.05) return 'Text file (UTF-8 / ASCII)';

  return '(unknown — see magic bytes and hexdump above)';
}

async function analyzeFile(filePath, name) {
  const slug  = name || slugify(path.basename(filePath));
  const label = path.basename(filePath);
  const lines = [
    `# Reverse Engineering Report: File — ${label}`,
    '',
    ETHICS_NOTE,
    '',
    `## Target`,
    `- **Path:** ${filePath}`,
    `- **Date:** ${new Date().toISOString()}`,
    '',
  ];

  // file command
  const fileR = run('/usr/bin/file', [filePath]);
  lines.push('## File Type (file command)');
  lines.push('```');
  lines.push(fileR.stdout.trim() || '(file command returned no output)');
  lines.push('```');
  lines.push('');

  // Magic bytes + format ID
  try {
    const buf  = readFileSync(filePath);
    const sig8 = buf.slice(0, 4).toString('hex');
    const hex  = (buf.slice(0, 32).toString('hex').match(/.{2}/g) ?? []).join(' ');
    const ascii = buf.slice(0, 32).toString('latin1').replace(/[^\x20-\x7e]/g, '.');

    lines.push('## Magic Bytes (first 32 bytes)');
    lines.push('```');
    lines.push(`hex:   ${hex}`);
    lines.push(`ascii: ${ascii}`);
    lines.push('```');
    lines.push('');

    const format = identifyMagic(sig8, buf);
    lines.push('## Format Identification');
    lines.push(`- **4-byte signature:** \`0x${sig8}\``);
    lines.push(`- **Identified as:** ${format}`);
    lines.push(`- **Size:** ${buf.length.toLocaleString()} bytes`);
    lines.push('');
  } catch (e) {
    lines.push(`(could not read file: ${e.message})`);
    lines.push('');
  }

  // Hexdump
  const xxdR = run('/usr/bin/xxd', ['-l', '256', filePath]);
  if (xxdR.status === 0) {
    lines.push('## Hexdump (first 256 bytes)');
    lines.push('```');
    lines.push(xxdR.stdout.slice(0, 5000));
    lines.push('```');
    lines.push('');
  }

  // Strings
  const strR = run('/usr/bin/strings', [filePath], { timeout: 20_000 });
  if (strR.status === 0) {
    const strs = strR.stdout.split('\n').filter(s => s.length >= 6 && s.length <= 300).slice(0, 100);
    if (strs.length) {
      lines.push(`## Strings (${strs.length} printable sequences)`);
      lines.push('```');
      for (const s of strs) lines.push(s);
      lines.push('```');
      lines.push('');
    }
  }

  return { slug, report: lines.join('\n') };
}

// ---- main ----

async function main() {
  const verb   = process.argv[2];
  const target = process.argv[3];
  const rest   = process.argv.slice(4);
  const get    = k => { const i = rest.indexOf(`--${k}`); return i !== -1 ? rest[i + 1] : null; };
  const name   = get('name');

  if (!verb || !target) {
    console.error('usage: reverse.mjs <web|app|file> <target> [--name <slug>]');
    process.exit(1);
  }

  mkdirSync(REVERSE_DIR, { recursive: true });

  let result;
  if      (verb === 'web')  result = await analyzeWeb(target, name);
  else if (verb === 'app')  result = await analyzeApp(target, name);
  else if (verb === 'file') result = await analyzeFile(target, name);
  else {
    console.error(`unknown subcommand: ${verb}. Use web, app, or file.`);
    process.exit(1);
  }

  const outPath = path.join(REVERSE_DIR, `${result.slug}-report.md`);
  writeFileSync(outPath, result.report, 'utf8');
  console.log(JSON.stringify({ ok: true, report: outPath, slug: result.slug }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
