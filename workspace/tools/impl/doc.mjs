#!/usr/bin/env node
import { spawnSync }                                  from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync,
         existsSync, mkdtempSync, readdirSync,
         copyFileSync, statSync }                     from 'node:fs';
import { fileURLToPath }                              from 'node:url';
import path                                           from 'node:path';
import os                                             from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, '../..');


const args = process.argv.slice(2);
const verb = args[0];
const get  = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] ?? null : null; };


function run(cmd, cliArgs, opts = {}) {
  const r = spawnSync(cmd, cliArgs, { encoding: 'utf8', timeout: 60_000, ...opts });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status ?? -1, error: r.error };
}

// Cross-platform which/where — returns first match or null.
function which(name) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(finder, [name], { encoding: 'utf8', timeout: 5_000 });
  if (r.status === 0) return (r.stdout || '').split(/\r?\n/)[0].trim() || null;
  return null;
}

// ── backend detection ────────────────────────────────────────────────────────
// Fully synchronous detection — no await, no dynamic imports here.
// Playwright availability is checked via createRequire (sync CommonJS resolution).
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);

function detectBackends() {
  const b = {
    pdftotext:   null,
    pdfinfo:     null,
    pdfunite:    null,
    pdfseparate: null,
    python:      null,
    pypdf:       false,
    playwright:  false,
  };


  b.pdftotext   = which('pdftotext');
  b.pdfinfo     = which('pdfinfo');
  b.pdfunite    = which('pdfunite');
  b.pdfseparate = which('pdfseparate');


  for (const py of ['python', 'python3', 'py']) {
    const p = which(py);
    if (!p) continue;
    const r = spawnSync(p, ['-c', 'import pypdf; print(pypdf.__version__)'],
      { encoding: 'utf8', timeout: 8_000 });
    if (r.status === 0 && r.stdout.trim()) { b.python = p; b.pypdf = true; break; }

    if (!b.python) b.python = p;
  }


  try {
    const pw = _require('playwright');
    if (pw && pw.chromium && existsSync(pw.chromium.executablePath())) {
      b.playwright = true;
    }
  } catch {  }

  return b;
}

const backends = detectBackends();


function backendsReport() {
  const parts = [];
  if (backends.pdftotext)   parts.push(`pdftotext(${backends.pdftotext})`);
  if (backends.pdfinfo)     parts.push(`pdfinfo(${backends.pdfinfo})`);
  if (backends.pdfunite)    parts.push(`pdfunite(${backends.pdfunite})`);
  if (backends.pdfseparate) parts.push(`pdfseparate(${backends.pdfseparate})`);
  if (backends.pypdf)       parts.push(`python+pypdf(${backends.python})`);
  else if (backends.python) parts.push(`python(${backends.python},no-pypdf)`);
  if (backends.playwright)  parts.push('playwright-chromium');
  return parts.length ? parts : ['(none detected)'];
}


function noBackend(verb2, needs) {
  return {
    ok: false,
    verb: verb2,
    error: `No backend available for "${verb2}" — need ${needs}.`,
    hint: 'Install poppler (scoop install poppler  or  winget install GnuWin32.Poppler) or python pypdf (pip install pypdf). Playwright/Chromium is already bundled for topdf.',
    backends: backendsReport(),
  };
}

function out(obj) {
  console.log(JSON.stringify({ ...obj, backends: backendsReport() }));
}


function pyRun(script, extraArgs = []) {
  return run(backends.python, ['-c', script, ...extraArgs]);
}


function wrapHtml(content, ext, title = 'Document') {
  const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const css = `
    *{box-sizing:border-box}
    body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
         color:#1a1a1a;line-height:1.6;font-size:12px;margin:0;padding:0}
    h1{font-size:22px;border-bottom:2px solid #333;padding-bottom:6px;margin:0 0 12px}
    h2{font-size:17px;border-bottom:1px solid #ddd;padding-bottom:4px;margin:22px 0 8px}
    h3{font-size:14px;margin:16px 0 6px}
    h4,h5,h6{font-size:12.5px;margin:12px 0 4px}
    p{margin:8px 0}
    code{background:#f3f3f3;padding:1px 4px;border-radius:3px;
         font-family:Consolas,'SF Mono',Menlo,monospace;font-size:11px}
    pre{background:#f6f8fa;border:1px solid #e1e4e8;border-radius:6px;
        padding:10px;overflow-x:auto;white-space:pre-wrap;word-break:break-word}
    pre code{background:none;padding:0;font-size:10.5px}
    blockquote{border-left:3px solid #ccc;margin:10px 0;
               padding:4px 12px;color:#555;background:#fafafa}
    hr{border:none;border-top:1px solid #ddd;margin:16px 0}
    ul,ol{margin:8px 0;padding-left:22px}li{margin:2px 0}
    table{border-collapse:collapse;width:100%;margin:10px 0}
    th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;
          font-size:11px;vertical-align:top}
    th{background:#f0f0f0}
    a{color:#0366d6;text-decoration:none;word-break:break-all}`;

  if (ext === '.html' || ext === '.htm') {

    if (/<html[\s>]/i.test(content)) return content;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>` +
           `<style>${css}</style></head><body>${content}</body></html>`;
  }

  if (ext === '.md' || ext === '.markdown') {
    return mdToHtml(content, title, css);
  }


  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>` +
         `<style>${css} body{padding:20px}</style></head><body>` +
         `<pre>${esc(content)}</pre></body></html>`;
}


function mdToHtml(md, title, css) {
  const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g,     '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);

  const lines = md.split('\n');
  const html  = [];
  let i = 0, inUl = false, inOl = false;
  const closeLists = () => {
    if (inUl) { html.push('</ul>'); inUl = false; }
    if (inOl) { html.push('</ol>'); inOl = false; }
  };
  const isSpecial = l => /^(#{1,6}\s|```|>\s?|\s*[-*+]\s|\s*\d+\.\s|\s*\|)/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    // Fenced code
    if (/^```/.test(line)) {
      closeLists(); i++;
      const code = [];
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      html.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    // Table
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeLists();
      const head = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
        i++;
      }
      html.push('<table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') +
        '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>');
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      closeLists();
      html.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
      i++; continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { closeLists(); html.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(line)) {
      closeLists();
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      html.push(`<blockquote>${inline(q.join(' '))}</blockquote>`);
      continue;
    }
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      if (inOl) { html.push('</ol>'); inOl = false; }
      if (!inUl) { html.push('<ul>'); inUl = true; }
      html.push(`<li>${inline(m[1])}</li>`); i++; continue;
    }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      if (inUl) { html.push('</ul>'); inUl = false; }
      if (!inOl) { html.push('<ol>'); inOl = true; }
      html.push(`<li>${inline(m[1])}</li>`); i++; continue;
    }
    if (/^\s*$/.test(line)) { closeLists(); i++; continue; }
    // Paragraph
    closeLists();
    const para = [line]; i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isSpecial(lines[i])) {
      para.push(lines[i]); i++;
    }
    html.push(`<p>${inline(para.join(' '))}</p>`);
  }
  closeLists();

  const esc2 = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc2(title)}</title>` +
         `<style>${css} body{padding:20px}</style></head><body>${html.join('\n')}</body></html>`;
}

// ── Playwright PDF render (reuses reverse.mjs approach exactly) ──────────────
async function renderToPdf(htmlContent, pdfPath) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'load', timeout: 30_000 });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    });
  } finally {
    await browser.close();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// VERB: info
// ══════════════════════════════════════════════════════════════════════════════
async function verbInfo() {
  const pdfPath = get('path');
  if (!pdfPath) { out({ ok: false, verb: 'info', error: '--path <pdf> is required' }); return; }
  if (!existsSync(pdfPath)) { out({ ok: false, verb: 'info', error: `File not found: ${pdfPath}` }); return; }

  // Backend 1: pdfinfo (poppler)
  if (backends.pdfinfo) {
    const r = run(backends.pdfinfo, [pdfPath]);
    if (r.status === 0 && r.stdout.trim()) {
      const parsed = {};
      for (const line of r.stdout.split(/\r?\n/)) {
        const m = line.match(/^([^:]+):\s*(.*)$/);
        if (m) parsed[m[1].trim()] = m[2].trim();
      }
      const pages = parseInt(parsed['Pages'] || parsed['Page count'] || '0', 10) || 0;
      out({
        ok: true, verb: 'info', backend: 'pdfinfo',
        pages,
        title:    parsed['Title']   || '',
        author:   parsed['Author']  || '',
        subject:  parsed['Subject'] || '',
        creator:  parsed['Creator'] || '',
        producer: parsed['Producer'] || '',
        created:  parsed['CreationDate'] || parsed['Created'] || '',
        modified: parsed['ModDate'] || parsed['Modified'] || '',
        encrypted: (parsed['Encrypted'] || '').toLowerCase().startsWith('yes'),
        raw: parsed,
      });
      return;
    }
  }

  // Backend 2: python + pypdf
  if (backends.pypdf) {
    const script = `
import pypdf, json, sys
try:
    r = pypdf.PdfReader(sys.argv[1])
    info = r.metadata or {}
    result = {
        'pages':    len(r.pages),
        'title':    info.get('/Title','')   or '',
        'author':   info.get('/Author','')  or '',
        'subject':  info.get('/Subject','') or '',
        'creator':  info.get('/Creator','') or '',
        'producer': info.get('/Producer','') or '',
        'created':  str(info.get('/CreationDate','') or ''),
        'modified': str(info.get('/ModDate','') or ''),
        'encrypted': r.is_encrypted,
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
    const r = pyRun(script, [pdfPath]);
    if (r.status === 0 && r.stdout.trim()) {
      try {
        const data = JSON.parse(r.stdout.trim());
        if (data.error) {
          out({ ok: false, verb: 'info', backend: 'python+pypdf', error: data.error });
        } else {
          out({ ok: true, verb: 'info', backend: 'python+pypdf', ...data });
        }
        return;
      } catch { /* fall through */ }
    }
    out({ ok: false, verb: 'info', backend: 'python+pypdf',
          error: r.stderr.trim().slice(0, 300) || 'pypdf failed' });
    return;
  }

  out(noBackend('info', 'pdfinfo (poppler) or python+pypdf'));
}

// ══════════════════════════════════════════════════════════════════════════════
// VERB: extract
// ══════════════════════════════════════════════════════════════════════════════
async function verbExtract() {
  const pdfPath = get('path');
  const outPath = get('out');
  if (!pdfPath) { out({ ok: false, verb: 'extract', error: '--path <pdf> is required' }); return; }
  if (!existsSync(pdfPath)) { out({ ok: false, verb: 'extract', error: `File not found: ${pdfPath}` }); return; }

  // Backend 1: pdftotext (poppler)
  if (backends.pdftotext) {
    const dest = outPath || '-';
    const r = run(backends.pdftotext, [pdfPath, dest]);
    if (r.status === 0) {
      const text = dest === '-' ? r.stdout : readFileSync(outPath, 'utf8');
      if (outPath) {
        out({ ok: true, verb: 'extract', backend: 'pdftotext', out: outPath,
              chars: text.length, snippet: text.slice(0, 300) });
      } else {
        out({ ok: true, verb: 'extract', backend: 'pdftotext', text,
              chars: text.length });
      }
      return;
    }
    // pdftotext failed — fall through
  }

  // Backend 2: python + pypdf
  if (backends.pypdf) {
    const script = `
import pypdf, json, sys
try:
    r = pypdf.PdfReader(sys.argv[1])
    parts = []
    for page in r.pages:
        t = page.extract_text()
        if t: parts.append(t)
    text = '\\n\\f\\n'.join(parts)
    print(json.dumps({'text': text}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
    const r = pyRun(script, [pdfPath]);
    if (r.status === 0 && r.stdout.trim()) {
      try {
        const data = JSON.parse(r.stdout.trim());
        if (data.error) {
          out({ ok: false, verb: 'extract', backend: 'python+pypdf', error: data.error });
          return;
        }
        const text = data.text || '';
        if (outPath) {
          writeFileSync(outPath, text, 'utf8');
          out({ ok: true, verb: 'extract', backend: 'python+pypdf', out: outPath,
                chars: text.length, snippet: text.slice(0, 300) });
        } else {
          out({ ok: true, verb: 'extract', backend: 'python+pypdf', text,
                chars: text.length });
        }
        return;
      } catch { /* fall through */ }
    }
    out({ ok: false, verb: 'extract', backend: 'python+pypdf',
          error: r.stderr.trim().slice(0, 300) || 'pypdf extraction failed' });
    return;
  }

  out(noBackend('extract', 'pdftotext (poppler) or python+pypdf'));
}

// ══════════════════════════════════════════════════════════════════════════════
// VERB: merge
// ══════════════════════════════════════════════════════════════════════════════
async function verbMerge() {
  const outPdf  = get('out');
  const inputsRaw = get('inputs');
  if (!outPdf)     { out({ ok: false, verb: 'merge', error: '--out <pdf> is required' }); return; }
  if (!inputsRaw)  { out({ ok: false, verb: 'merge', error: '--inputs "a.pdf,b.pdf,..." is required' }); return; }

  const inputs = inputsRaw.split(',').map(s => s.trim()).filter(Boolean);
  if (inputs.length < 2) { out({ ok: false, verb: 'merge', error: '--inputs needs at least 2 PDF paths' }); return; }
  for (const f of inputs) {
    if (!existsSync(f)) { out({ ok: false, verb: 'merge', error: `Input not found: ${f}` }); return; }
  }

  // Ensure output directory exists
  const outDir2 = path.dirname(outPdf);
  if (outDir2 && !existsSync(outDir2)) mkdirSync(outDir2, { recursive: true });

  // Backend 1: pdfunite (poppler)
  if (backends.pdfunite) {
    const r = run(backends.pdfunite, [...inputs, outPdf]);
    if (r.status === 0 && existsSync(outPdf)) {
      const sz = statSync(outPdf).size;
      out({ ok: true, verb: 'merge', backend: 'pdfunite', out: outPdf,
            inputs: inputs.length, bytes: sz });
      return;
    }
  }

  // Backend 2: python + pypdf
  if (backends.pypdf) {
    // Pass inputs as newline-joined via stdin workaround: embed in script
    const escaped = inputs.map(f => f.replace(/\\/g, '\\\\').replace(/'/g, "\'")).join("','");
    const script = `
import pypdf, json, sys
inputs = ['${escaped}']
out_path = sys.argv[1]
try:
    writer = pypdf.PdfWriter()
    for p in inputs:
        reader = pypdf.PdfReader(p)
        for page in reader.pages:
            writer.add_page(page)
    with open(out_path, 'wb') as f:
        writer.write(f)
    print(json.dumps({'ok': True, 'pages': len(writer.pages)}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
    const r = pyRun(script, [outPdf]);
    if (r.status === 0 && r.stdout.trim()) {
      try {
        const data = JSON.parse(r.stdout.trim());
        if (data.error) {
          out({ ok: false, verb: 'merge', backend: 'python+pypdf', error: data.error });
          return;
        }
        const sz = existsSync(outPdf) ? statSync(outPdf).size : 0;
        out({ ok: true, verb: 'merge', backend: 'python+pypdf', out: outPdf,
              inputs: inputs.length, pages: data.pages, bytes: sz });
        return;
      } catch { /* fall through */ }
    }
    out({ ok: false, verb: 'merge', backend: 'python+pypdf',
          error: r.stderr.trim().slice(0, 300) || 'pypdf merge failed' });
    return;
  }

  out(noBackend('merge', 'pdfunite (poppler) or python+pypdf'));
}

// ══════════════════════════════════════════════════════════════════════════════
// VERB: split
// ══════════════════════════════════════════════════════════════════════════════
async function verbSplit() {
  const pdfPath = get('path');
  const outDir  = get('out');
  if (!pdfPath) { out({ ok: false, verb: 'split', error: '--path <pdf> is required' }); return; }
  if (!outDir)  { out({ ok: false, verb: 'split', error: '--out <dir> is required' }); return; }
  if (!existsSync(pdfPath)) { out({ ok: false, verb: 'split', error: `File not found: ${pdfPath}` }); return; }

  mkdirSync(outDir, { recursive: true });

  // Backend 1: pdfseparate (poppler)
  if (backends.pdfseparate) {
    // pdfseparate <src> <out-dir/page-%d.pdf>
    const pattern = path.join(outDir, 'page-%d.pdf');
    const r = run(backends.pdfseparate, [pdfPath, pattern]);
    if (r.status === 0) {
      const files = readdirSync(outDir)
        .filter(f => f.endsWith('.pdf'))
        .map(f => path.join(outDir, f))
        .sort();
      out({ ok: true, verb: 'split', backend: 'pdfseparate', out: outDir,
            pages: files.length, files });
      return;
    }
  }

  // Backend 2: python + pypdf
  if (backends.pypdf) {
    const script = `
import pypdf, json, sys, os
src = sys.argv[1]
out_dir = sys.argv[2]
try:
    reader = pypdf.PdfReader(src)
    files = []
    for i, page in enumerate(reader.pages, 1):
        writer = pypdf.PdfWriter()
        writer.add_page(page)
        out_path = os.path.join(out_dir, f'page-{i:04d}.pdf')
        with open(out_path, 'wb') as f:
            writer.write(f)
        files.append(out_path)
    print(json.dumps({'ok': True, 'pages': len(files), 'files': files}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
    const r = pyRun(script, [pdfPath, outDir]);
    if (r.status === 0 && r.stdout.trim()) {
      try {
        const data = JSON.parse(r.stdout.trim());
        if (data.error) {
          out({ ok: false, verb: 'split', backend: 'python+pypdf', error: data.error });
          return;
        }
        out({ ok: true, verb: 'split', backend: 'python+pypdf', out: outDir,
              pages: data.pages, files: data.files });
        return;
      } catch { /* fall through */ }
    }
    out({ ok: false, verb: 'split', backend: 'python+pypdf',
          error: r.stderr.trim().slice(0, 300) || 'pypdf split failed' });
    return;
  }

  out(noBackend('split', 'pdfseparate (poppler) or python+pypdf'));
}

// ══════════════════════════════════════════════════════════════════════════════
// VERB: topdf
// ══════════════════════════════════════════════════════════════════════════════
async function verbTopdf() {
  const srcPath = get('path');
  let   outPdf  = get('out');
  if (!srcPath) { out({ ok: false, verb: 'topdf', error: '--path <file> is required' }); return; }
  if (!existsSync(srcPath)) { out({ ok: false, verb: 'topdf', error: `File not found: ${srcPath}` }); return; }

  if (!backends.playwright) {
    out({ ok: false, verb: 'topdf', error: 'Playwright Chromium backend not available.',
          hint: 'Chromium should be bundled with helm (npm list playwright in the helm root). Try: cd C:/Users/User/helm && npx playwright install chromium' });
    return;
  }

  const ext = path.extname(srcPath).toLowerCase();
  let content;
  try { content = readFileSync(srcPath, 'utf8'); }
  catch (e) { out({ ok: false, verb: 'topdf', error: `Cannot read file: ${e.message}` }); return; }

  const title = path.basename(srcPath, ext);
  const htmlContent = wrapHtml(content, ext, title);

  // Default output path: same dir as source, .pdf extension
  if (!outPdf) {
    outPdf = path.join(path.dirname(srcPath), title + '.pdf');
  }
  const outDir2 = path.dirname(outPdf);
  if (outDir2 && !existsSync(outDir2)) mkdirSync(outDir2, { recursive: true });

  try {
    await renderToPdf(htmlContent, outPdf);
    const sz = statSync(outPdf).size;
    out({ ok: true, verb: 'topdf', backend: 'playwright-chromium',
          src: srcPath, out: outPdf, bytes: sz, format: ext || 'text' });
  } catch (e) {
    out({ ok: false, verb: 'topdf', backend: 'playwright-chromium',
          error: String(e.message || e) });
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!verb) {
    out({ ok: false, error: 'Usage: doc.mjs <info|extract|merge|split|topdf> [--flags...]',
          verbs: ['info --path <pdf>',
                  'extract --path <pdf> [--out <txt>]',
                  'merge --out <pdf> --inputs "a.pdf,b.pdf"',
                  'split --path <pdf> --out <dir>',
                  'topdf --path <txt|md|html> [--out <pdf>]'] });
    return;
  }

  if (verb === 'info')    { await verbInfo();    return; }
  if (verb === 'extract') { await verbExtract(); return; }
  if (verb === 'merge')   { await verbMerge();   return; }
  if (verb === 'split')   { await verbSplit();   return; }
  if (verb === 'topdf')   { await verbTopdf();   return; }

  out({ ok: false, error: `Unknown verb: "${verb}"`,
        verbs: ['info', 'extract', 'merge', 'split', 'topdf'] });
}

main().catch(e => {
  console.log(JSON.stringify({ ok: false, error: String(e.message || e) }));
  process.exit(0);
});
