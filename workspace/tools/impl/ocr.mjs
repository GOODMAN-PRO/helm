#!/usr/bin/env node
// Helm OCR — locate visible text on screen using Windows.Media.Ocr (WinRT, built-in on Win10/11).
// Subcommands:
//   ocr.mjs read [--out <png>]             → screenshot + OCR; returns text, lines, words with coords
//   ocr.mjs find --text <substr> [--nth N] → find word/phrase; returns best center coords for gui.click
//
// Coordinates are ABSOLUTE physical screen pixels (virtual-desktop origin).
//
// ── How PS 5.1 WinRT-async is solved ──────────────────────────────────────────
// PowerShell 5.1 runs on .NET Framework 4.x. WinRT objects arrive as System.__ComObject, so the
// AsTask() extension from System.Runtime.WindowsRuntime cannot QI them to the typed
// IAsyncOperation<T> interface. Status-polling also fails because the Status property is not
// projected. Compiling a typed C# source file (via csc.exe, built into Windows) resolves all WinRT
// types at compile time through the Windows SDK UnionMetadata Windows.winmd, making AsTask() and
// GetAwaiter().GetResult() work correctly. The compiled exe is cached in %TEMP% and reused.

import { spawnSync }   from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import os   from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { captureScreen, defaultShotPath } from './capture-screen.mjs';
import { screenBounds }                   from './win-input.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Arg parsing (mirrors window.mjs) ────────────────────────────────────────
const args = process.argv.slice(2);
const verb = args[0];
const get  = (k) => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };

// ─── C# source for the WinRT OCR bridge ──────────────────────────────────────
// Written as an array of lines to avoid JS string-escaping confusion.
function getBridgeSource() {
  return [
    'using System;',
    'using System.Collections.Generic;',
    'using System.IO;',
    'using System.Runtime.InteropServices.WindowsRuntime;',
    'using System.Text;',
    'using Windows.Globalization;',
    'using Windows.Graphics.Imaging;',
    'using Windows.Media.Ocr;',
    'using Windows.Storage;',
    'using Windows.Storage.Streams;',
    '',
    'class HelmOcrBridge {',
    '    static T Await<T>(Windows.Foundation.IAsyncOperation<T> op) {',
    '        return op.AsTask().GetAwaiter().GetResult();',
    '    }',
    '',
    '    static string EscJson(string s) {',
    '        if (s == null) return "null";',
    '        var sb = new StringBuilder();',
    '        sb.Append(\'"\');',
    '        foreach (char c in s) {',
    '            switch (c) {',
    '                case \'"\':  sb.Append("\\\\\\""); break;',
    '                case \'\\\\\': sb.Append("\\\\\\\\"); break;',
    '                case \'\\n\': sb.Append("\\\\n");  break;',
    '                case \'\\r\': sb.Append("\\\\r");  break;',
    '                case \'\\t\': sb.Append("\\\\t");  break;',
    '                default:',
    '                    if (c < 0x20) sb.AppendFormat("\\\\u{0:x4}", (int)c);',
    '                    else sb.Append(c);',
    '                    break;',
    '            }',
    '        }',
    '        sb.Append(\'"\');',
    '        return sb.ToString();',
    '    }',
    '',
    '    static void Main(string[] mainArgs) {',
    '        if (mainArgs.Length < 1) {',
    '            Console.WriteLine("{\\"ok\\":false,\\"error\\":\\"usage: helm-ocr-bridge <image-path>\\"}");',
    '            return;',
    '        }',
    '        string imagePath = Path.GetFullPath(mainArgs[0]);',
    '',
    '        try {',
    '            var sf      = Await(StorageFile.GetFileFromPathAsync(imagePath));',
    '            var stream  = Await(sf.OpenReadAsync());',
    '            var decoder = Await(BitmapDecoder.CreateAsync(stream));',
    '            var bitmap  = Await(decoder.GetSoftwareBitmapAsync());',
    '',
    '            OcrEngine engine = OcrEngine.TryCreateFromUserProfileLanguages();',
    '            if (engine == null)',
    '                engine = OcrEngine.TryCreateFromLanguage(new Language("en-US"));',
    '            if (engine == null) {',
    '                Console.WriteLine("{\\"ok\\":false,\\"error\\":\\"no OCR engine available\\"}");',
    '                return;',
    '            }',
    '',
    '            var result = Await(engine.RecognizeAsync(bitmap));',
    '',
    '            var sb = new StringBuilder();',
    '            sb.Append("{\\"ok\\":true,\\"lines\\":[");',
    '            bool firstLine = true;',
    '            var allWords = new List<string>();',
    '',
    '            foreach (var line in result.Lines) {',
    '                if (!firstLine) sb.Append(\',\');',
    '                firstLine = false;',
    '                sb.Append("{\\"text\\":");',
    '                sb.Append(EscJson(line.Text));',
    '                sb.Append(",\\"words\\":[");',
    '                bool firstWord = true;',
    '                foreach (var word in line.Words) {',
    '                    if (!firstWord) sb.Append(\',\');',
    '                    firstWord = false;',
    '                    var r = word.BoundingRect;',
    '                    var ws = "{\\"text\\":" + EscJson(word.Text)',
    '                        + ",\\"x\\":" + (int)Math.Round(r.X)',
    '                        + ",\\"y\\":" + (int)Math.Round(r.Y)',
    '                        + ",\\"w\\":" + (int)Math.Round(r.Width)',
    '                        + ",\\"h\\":" + (int)Math.Round(r.Height) + "}";',
    '                    allWords.Add(ws);',
    '                    sb.Append(ws);',
    '                }',
    '                sb.Append("]}");',
    '            }',
    '            sb.Append("],\\"words\\":[");',
    '            sb.Append(string.Join(",", allWords));',
    '            sb.Append("]}");',
    '            Console.WriteLine(sb.ToString());',
    '        } catch (Exception ex) {',
    '            Console.WriteLine("{\\"ok\\":false,\\"error\\":" + EscJson(ex.Message) + "}");',
    '        }',
    '    }',
    '}',
  ].join('\n');
}

// ─── Locate build tools ───────────────────────────────────────────────────────
function findCsc() {
  const candidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
  ];
  return candidates.find(p => existsSync(p)) || null;
}

function findWinmd() {
  // Prefer the Windows SDK UnionMetadata — broadest WinRT type coverage.
  // Only consider version-numbered subdirs (e.g. "10.0.26100.0") — skip "Facade" (stub-only).
  const sdkBases = [
    'C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata',
    'C:\\Program Files\\Windows Kits\\10\\UnionMetadata',
  ];
  for (const base of sdkBases) {
    if (!existsSync(base)) continue;
    let dirs;
    try {
      dirs = readdirSync(base, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d/.test(d.name)) // version dirs start with a digit
        .map(d => d.name)
        .sort()
        .reverse(); // highest version first
    } catch { continue; }
    for (const d of dirs) {
      const candidate = path.join(base, d, 'Windows.winmd');
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function findRuntimeDll() {
  const candidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Runtime.WindowsRuntime.dll',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\System.Runtime.WindowsRuntime.dll',
  ];
  return candidates.find(p => existsSync(p)) || null;
}

function findSystemRuntimeDll() {
  const candidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Runtime.dll',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\System.Runtime.dll',
  ];
  return candidates.find(p => existsSync(p)) || null;
}

// ─── Compile bridge exe ───────────────────────────────────────────────────────
const BRIDGE_EXE    = path.join(os.tmpdir(), 'helm-ocr-bridge.exe');
const BRIDGE_CS     = path.join(os.tmpdir(), 'helm-ocr-bridge.cs');
const BRIDGE_STAMP  = path.join(os.tmpdir(), 'helm-ocr-bridge.stamp');
const BRIDGE_VER    = '4'; // bump to force recompile

function ensureBridge() {
  // Return cached result if stamp matches
  if (existsSync(BRIDGE_EXE) && existsSync(BRIDGE_STAMP)) {
    try { if (readFileSync(BRIDGE_STAMP, 'utf8').trim() === BRIDGE_VER) return { ok: true }; } catch {}
  }

  const csc   = findCsc();
  if (!csc)   return { ok: false, error: 'csc.exe not found — .NET Framework 4.x required' };

  const winmd = findWinmd();
  if (!winmd) return { ok: false, error: 'Windows.winmd not found — install Windows SDK (UnionMetadata)' };

  const rtDll = findRuntimeDll();
  if (!rtDll) return { ok: false, error: 'System.Runtime.WindowsRuntime.dll not found' };

  const srtDll = findSystemRuntimeDll();
  if (!srtDll) return { ok: false, error: 'System.Runtime.dll not found' };

  writeFileSync(BRIDGE_CS, getBridgeSource(), 'utf8');

  const r = spawnSync(csc, [
    '/nologo', '/target:exe', '/platform:x64',
    `/out:${BRIDGE_EXE}`,
    `/reference:${rtDll}`,
    `/reference:${srtDll}`,
    `/reference:${winmd}`,
    BRIDGE_CS,
  ], { encoding: 'utf8', timeout: 60_000 });

  if (r.status !== 0) {
    const err = ((r.stdout || '') + (r.stderr || '')).trim().slice(0, 600);
    return { ok: false, error: `bridge compile failed: ${err}` };
  }

  writeFileSync(BRIDGE_STAMP, BRIDGE_VER, 'utf8');
  return { ok: true };
}

// ─── Run bridge exe ───────────────────────────────────────────────────────────
function runBridge(imagePath) {
  const compile = ensureBridge();
  if (!compile.ok) return { raw: null, compileError: compile.error };

  const r = spawnSync(BRIDGE_EXE, [imagePath], { encoding: 'utf8', timeout: 30_000 });
  const stdout = (r.stdout || '').trim();
  // Bridge always prints exactly one JSON line; grab the last one in case there's .NET startup noise
  const jsonLine = stdout.split('\n').map(l => l.trim()).filter(l => l.startsWith('{')).pop();
  if (!jsonLine) return { raw: null, compileError: null };
  try { return { raw: JSON.parse(jsonLine), compileError: null }; } catch { return { raw: null, compileError: null }; }
}

// ─── Tesseract fallback ───────────────────────────────────────────────────────
function tesseractOcr(imagePath) {
  const r = spawnSync('tesseract', [imagePath, 'stdout', 'tsv'], { encoding: 'utf8', timeout: 30_000 });
  if ((r.error && r.error.code === 'ENOENT') || r.status !== 0) return null;

  const words   = [];
  const lineMap = {};
  for (const row of (r.stdout || '').split('\n').slice(1)) {
    const cols = row.split('\t');
    if (cols.length < 12) continue;
    const [level, , , , lineNum, , left, top, width, height, conf, ...rest] = cols;
    if (+level !== 5) continue;
    const text = rest.join('\t').trim();
    if (!text || +conf < 0) continue;
    const x = +left, y = +top, w = +width, h = +height;
    words.push({ text, x, y, w, h });
    if (!lineMap[lineNum]) lineMap[lineNum] = { text: '', words: [], minX: x, minY: y, maxX: x + w, maxY: y + h };
    const lm = lineMap[lineNum];
    lm.words.push({ text, x, y, w, h });
    lm.text  = (lm.text ? lm.text + ' ' : '') + text;
    lm.minX  = Math.min(lm.minX, x);
    lm.minY  = Math.min(lm.minY, y);
    lm.maxX  = Math.max(lm.maxX, x + w);
    lm.maxY  = Math.max(lm.maxY, y + h);
  }

  const lines = Object.values(lineMap).map(l => ({
    text:  l.text,
    rect:  { x: l.minX, y: l.minY, w: l.maxX - l.minX, h: l.maxY - l.minY },
    words: l.words,
  }));

  return { ok: true, lines, words };
}

// ─── Apply screen-offset + compute centers ────────────────────────────────────
// The screenshot covers the entire virtual desktop starting at screenBounds().left/top.
// OCR coords are image-relative (0,0 = top-left of screenshot).
// Absolute = image coords + virtual-desktop origin.
function applyOffset(raw, bounds) {
  const ox = bounds.left || 0;
  const oy = bounds.top  || 0;

  const mapWord = (w) => ({
    text:   w.text,
    x:      w.x + ox,
    y:      w.y + oy,
    w:      w.w,
    h:      w.h,
    center: { x: Math.round(w.x + ox + w.w / 2), y: Math.round(w.y + oy + w.h / 2) },
  });

  const mapLine = (l) => {
    let rect = l.rect;
    if (!rect && l.words && l.words.length) {
      const xs = l.words.flatMap(w => [w.x, w.x + w.w]);
      const ys = l.words.flatMap(w => [w.y, w.y + w.h]);
      rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    if (!rect) rect = { x: 0, y: 0, w: 0, h: 0 };
    return {
      text:   l.text,
      rect:   { x: rect.x + ox, y: rect.y + oy, w: rect.w, h: rect.h },
      center: { x: Math.round(rect.x + ox + rect.w / 2), y: Math.round(rect.y + oy + rect.h / 2) },
      words:  (l.words || []).map(mapWord),
    };
  };

  return {
    ok:    true,
    text:  (raw.lines || []).map(l => l.text).join('\n'),
    lines: (raw.lines || []).map(mapLine),
    words: (raw.words || []).map(mapWord),
  };
}

// ─── Core OCR pipeline ────────────────────────────────────────────────────────
function runOcr(outPath) {
  const cap = captureScreen(outPath);
  if (!cap.ok) return { ok: false, error: 'screenshot failed: ' + cap.error };

  const bounds = screenBounds();
  const offset  = bounds.ok ? bounds : { left: 0, top: 0 };

  // 1. WinRT bridge (Windows only)
  let raw = null;
  let compileError = null;
  if (process.platform === 'win32') {
    const br = runBridge(outPath);
    raw          = br.raw;
    compileError = br.compileError;
  }

  // 2. Tesseract fallback
  if (!raw) raw = tesseractOcr(outPath);

  if (!raw) {
    const detail = compileError || 'bridge produced no output; tesseract not on PATH';
    return { ok: false, error: `no OCR engine available — ${detail}` };
  }

  return applyOffset(raw, offset);
}

// ─── Subcommand: read ─────────────────────────────────────────────────────────
function cmdRead() {
  const outPath = get('out') || defaultShotPath('helm-ocr');
  console.log(JSON.stringify(runOcr(outPath)));
}

// ─── Subcommand: find ─────────────────────────────────────────────────────────
function cmdFind() {
  const needle = get('text');
  if (!needle) { console.error('find needs --text <substring>'); process.exit(1); }
  const nth     = parseInt(get('nth') || '1', 10);
  const outPath = defaultShotPath('helm-ocr-find');

  const ocr = runOcr(outPath);
  if (!ocr.ok) { console.log(JSON.stringify(ocr)); return; }

  const lower   = needle.toLowerCase();
  const scored  = [];

  // Word-level matches (most precise)
  for (const w of (ocr.words || [])) {
    if (w.text.toLowerCase().includes(lower)) {
      scored.push({ text: w.text, center: w.center, rect: { x: w.x, y: w.y, w: w.w, h: w.h }, _t: 'word' });
    }
  }

  // Line-level matches — narrow to tightest word span that contains the needle
  for (const l of (ocr.lines || [])) {
    if (!l.text.toLowerCase().includes(lower)) continue;
    const lw = l.words || [];
    let bestSub = null;
    outer: for (let s = 0; s < lw.length; s++) {
      let combined = '';
      for (let e = s; e < lw.length; e++) {
        combined = (combined ? combined + ' ' : '') + lw[e].text;
        if (combined.toLowerCase().includes(lower)) {
          const span = lw.slice(s, e + 1);
          const minX = Math.min(...span.map(w => w.x));
          const minY = Math.min(...span.map(w => w.y));
          const maxX = Math.max(...span.map(w => w.x + w.w));
          const maxY = Math.max(...span.map(w => w.y + w.h));
          bestSub = {
            text:   combined,
            center: { x: Math.round((minX + maxX) / 2), y: Math.round((minY + maxY) / 2) },
            rect:   { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
            _t:     'span',
          };
          break outer;
        }
      }
    }
    scored.push(bestSub || { text: l.text, center: l.center, rect: l.rect, _t: 'line' });
  }

  if (scored.length === 0) {
    console.log(JSON.stringify({ ok: true, found: false }));
    return;
  }

  // Sort: prefer word > span > line, then shorter text
  const prio = { word: 0, span: 1, line: 2 };
  scored.sort((a, b) => {
    const dp = (prio[a._t] || 0) - (prio[b._t] || 0);
    return dp !== 0 ? dp : a.text.length - b.text.length;
  });

  const clean = scored.map(({ _t, ...rest }) => rest);
  const best  = clean[Math.max(0, Math.min(nth - 1, clean.length - 1))];
  console.log(JSON.stringify({ ok: true, found: true, best, matches: clean }));
}

// ─── Entry point ──────────────────────────────────────────────────────────────
if (verb === 'read') {
  cmdRead();
} else if (verb === 'find') {
  cmdFind();
} else {
  console.error('verbs: read [--out <png>] | find --text <substr> [--nth N]');
  process.exit(1);
}
