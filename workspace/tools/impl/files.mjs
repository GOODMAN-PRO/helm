#!/usr/bin/env node
// files.mjs — elite file management for Helm (cross-platform, Node built-ins only)
// Verbs: find | tree | big | dupes | organize | rename | zip | unzip
// Always prints ONE JSON object to stdout; exits 0.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

// ── arg parsing ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const verb = argv[0];
const get = (k, def = null) => {
  const i = argv.indexOf(`--${k}`);
  return i !== -1 ? argv[i + 1] : def;
};
const flag = (k) => argv.includes(`--${k}`);

function die(msg) {
  console.log(JSON.stringify({ ok: false, error: msg }));
  process.exit(0);
}

// ── shared helpers ─────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '__pycache__', '.DS_Store']);

/** Recursively walk a directory, yielding file stats. Skips SKIP_DIRS. */
function* walkFiles(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkFiles(full);
    } else if (e.isFile()) {
      try {
        const st = fs.statSync(full);
        yield { path: full, size: st.size, mtime: st.mtime };
      } catch { /* skip unreadable */ }
    }
  }
}

/** Glob-style match: only * and ? wildcards (no path separators in pattern). */
function matchGlob(pattern, name) {
  // Convert simple glob to regex — escape everything except * and ?
  const re = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
                  .replace(/\*/g, '.*')
                  .replace(/\?/g, '.') + '$',
    'i'
  );
  return re.test(name);
}

// ── FIND ──────────────────────────────────────────────────────────────────────
if (verb === 'find') {
  const dir     = get('path');
  const nameGlob = get('name');
  const content = get('content');
  const days    = get('days') !== null ? parseFloat(get('days')) : null;
  const minsize = get('minsize') !== null ? parseInt(get('minsize'), 10) : null;

  if (!dir) die('find requires --path <dir>');
  if (!fs.existsSync(dir)) die(`path does not exist: ${dir}`);

  const cutoff = days !== null ? Date.now() - days * 86400000 : null;
  const results = [];

  for (const f of walkFiles(dir)) {
    if (nameGlob && !matchGlob(nameGlob, path.basename(f.path))) continue;
    if (minsize !== null && f.size < minsize) continue;
    if (cutoff !== null && f.mtime.getTime() < cutoff) continue;
    if (content) {
      try {
        const text = fs.readFileSync(f.path, 'utf8');
        if (!text.includes(content)) continue;
      } catch { continue; }
    }
    results.push({ path: f.path, size: f.size, mtime: f.mtime.toISOString() });
  }

  console.log(JSON.stringify({ ok: true, verb: 'find', count: results.length, files: results }));

// ── TREE ──────────────────────────────────────────────────────────────────────
} else if (verb === 'tree') {
  const dir   = get('path');
  const depth = get('depth') !== null ? parseInt(get('depth'), 10) : 3;

  if (!dir) die('tree requires --path <dir>');
  if (!fs.existsSync(dir)) die(`path does not exist: ${dir}`);

  function buildTree(d, maxDepth, currentDepth) {
    if (currentDepth > maxDepth) return null;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch { return null; }

    const node = { name: path.basename(d), type: 'dir', children: [] };
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        const child = buildTree(full, maxDepth, currentDepth + 1);
        if (child) node.children.push(child);
        else node.children.push({ name: e.name, type: 'dir', children: null });
      } else if (e.isFile()) {
        try {
          const st = fs.statSync(full);
          node.children.push({ name: e.name, type: 'file', size: st.size });
        } catch {
          node.children.push({ name: e.name, type: 'file', size: null });
        }
      }
    }
    return node;
  }

  // Also render a compact text version
  function renderTree(node, prefix, isLast) {
    const connector = isLast ? '└── ' : '├── ';
    const lines = [prefix + connector + node.name + (node.type === 'dir' ? '/' : '')];
    if (node.children && node.children.length > 0) {
      const ext = isLast ? '    ' : '│   ';
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const last = i === node.children.length - 1;
        if (child.type === 'dir' && child.children) {
          lines.push(...renderTree(child, prefix + ext, last));
        } else {
          const c2 = isLast ? '    ' : '│   ';
          const sz = child.size !== null && child.size !== undefined ? ` (${fmtBytes(child.size)})` : '';
          lines.push(prefix + ext + (last ? '└── ' : '├── ') + child.name + sz);
        }
      }
    }
    return lines;
  }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  const tree = buildTree(dir, depth, 1);
  const textLines = [path.resolve(dir) + '/'];
  if (tree && tree.children) {
    for (let i = 0; i < tree.children.length; i++) {
      const child = tree.children[i];
      const last = i === tree.children.length - 1;
      if (child.type === 'dir' && child.children) {
        textLines.push(...renderTree(child, '', last));
      } else {
        const sz = child.size !== null && child.size !== undefined ? ` (${fmtBytes(child.size)})` : '';
        textLines.push((last ? '└── ' : '├── ') + child.name + sz);
      }
    }
  }

  console.log(JSON.stringify({ ok: true, verb: 'tree', depth, root: dir, tree, text: textLines.join('\n') }));

// ── BIG ───────────────────────────────────────────────────────────────────────
} else if (verb === 'big') {
  const dir = get('path');
  const top = get('top') !== null ? parseInt(get('top'), 10) : 20;

  if (!dir) die('big requires --path <dir>');
  if (!fs.existsSync(dir)) die(`path does not exist: ${dir}`);

  const all = [];
  for (const f of walkFiles(dir)) {
    all.push({ path: f.path, size: f.size, mtime: f.mtime.toISOString() });
  }
  all.sort((a, b) => b.size - a.size);
  const files = all.slice(0, top);
  const totalSize = all.reduce((s, f) => s + f.size, 0);

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  const annotated = files.map(f => ({ ...f, size_human: fmtBytes(f.size) }));
  console.log(JSON.stringify({ ok: true, verb: 'big', total_files: all.length, total_size: totalSize, top, files: annotated }));

// ── DUPES ─────────────────────────────────────────────────────────────────────
} else if (verb === 'dupes') {
  const dir = get('path');
  if (!dir) die('dupes requires --path <dir>');
  if (!fs.existsSync(dir)) die(`path does not exist: ${dir}`);

  // Group by size first (fast), then hash same-size files
  const bySize = new Map();
  for (const f of walkFiles(dir)) {
    if (f.size === 0) continue;
    const arr = bySize.get(f.size) || [];
    arr.push(f);
    bySize.set(f.size, arr);
  }

  const byHash = new Map();
  for (const [, group] of bySize) {
    if (group.length < 2) continue;
    for (const f of group) {
      let data;
      try { data = fs.readFileSync(f.path); }
      catch { continue; }
      const h = crypto.createHash('sha256').update(data).digest('hex');
      const arr = byHash.get(h) || [];
      arr.push({ path: f.path, size: f.size, mtime: f.mtime.toISOString() });
      byHash.set(h, arr);
    }
  }

  const groups = [];
  let wastedBytes = 0;
  for (const [hash, files] of byHash) {
    if (files.length < 2) continue;
    const wasted = files[0].size * (files.length - 1);
    wastedBytes += wasted;
    groups.push({ hash, count: files.length, size: files[0].size, wasted_bytes: wasted, files });
  }
  groups.sort((a, b) => b.wasted_bytes - a.wasted_bytes);

  console.log(JSON.stringify({ ok: true, verb: 'dupes', groups_found: groups.length, wasted_bytes: wastedBytes, groups }));

// ── ORGANIZE ──────────────────────────────────────────────────────────────────
} else if (verb === 'organize') {
  const dir   = get('path');
  const by    = get('by', 'type');   // 'type' | 'date'
  const apply = get('apply', 'false') === 'true';

  if (!dir) die('organize requires --path <dir>');
  if (!fs.existsSync(dir)) die(`path does not exist: ${dir}`);
  if (!['type', 'date'].includes(by)) die('--by must be "type" or "date"');

  // Extension → category map
  const EXT_MAP = {
    // Images
    jpg: 'Images', jpeg: 'Images', png: 'Images', gif: 'Images', bmp: 'Images',
    webp: 'Images', tiff: 'Images', tif: 'Images', svg: 'Images', ico: 'Images', heic: 'Images', avif: 'Images',
    // Docs
    pdf: 'Docs', doc: 'Docs', docx: 'Docs', xls: 'Docs', xlsx: 'Docs',
    ppt: 'Docs', pptx: 'Docs', txt: 'Docs', md: 'Docs', rtf: 'Docs', odt: 'Docs', csv: 'Docs',
    // Video
    mp4: 'Video', mkv: 'Video', avi: 'Video', mov: 'Video', wmv: 'Video',
    flv: 'Video', webm: 'Video', m4v: 'Video', mpg: 'Video', mpeg: 'Video',
    // Audio
    mp3: 'Audio', wav: 'Audio', aac: 'Audio', flac: 'Audio', ogg: 'Audio',
    wma: 'Audio', m4a: 'Audio', aiff: 'Audio',
    // Archives
    zip: 'Archives', tar: 'Archives', gz: 'Archives', bz2: 'Archives',
    '7z': 'Archives', rar: 'Archives', xz: 'Archives', tgz: 'Archives',
    // Code
    js: 'Code', mjs: 'Code', cjs: 'Code', ts: 'Code', py: 'Code', rb: 'Code',
    java: 'Code', c: 'Code', cpp: 'Code', h: 'Code', cs: 'Code', go: 'Code',
    rs: 'Code', php: 'Code', html: 'Code', css: 'Code', json: 'Code', xml: 'Code',
    sh: 'Code', ps1: 'Code', bat: 'Code', sql: 'Code', yaml: 'Code', yml: 'Code',
    toml: 'Code', ini: 'Code',
  };

  const moves = [];
  // Only top-level files — don't dive into subdirectories for organize
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { die(`cannot read dir: ${e.message}`); }

  for (const e of entries) {
    if (!e.isFile()) continue;
    const srcPath = path.join(dir, e.name);
    let subfolder;

    if (by === 'type') {
      const ext = path.extname(e.name).slice(1).toLowerCase();
      subfolder = EXT_MAP[ext] || 'Other';
    } else {
      // by date: YYYY-MM from mtime
      try {
        const st = fs.statSync(srcPath);
        const d = st.mtime;
        subfolder = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } catch {
        subfolder = 'Other';
      }
    }

    const destDir  = path.join(dir, subfolder);
    const destPath = path.join(destDir, e.name);
    if (srcPath === destPath) continue;
    moves.push({ src: srcPath, dest: destPath, subfolder });
  }

  if (apply) {
    const done = [], errors = [];
    for (const m of moves) {
      try {
        fs.mkdirSync(m.dest.slice(0, m.dest.lastIndexOf(path.sep)), { recursive: true });
        fs.renameSync(m.src, m.dest);
        done.push(m);
      } catch (e) {
        errors.push({ ...m, error: e.message });
      }
    }
    console.log(JSON.stringify({ ok: true, verb: 'organize', dry_run: false, by, moved: done.length, errors: errors.length, moves: done, move_errors: errors }));
  } else {
    console.log(JSON.stringify({ ok: true, verb: 'organize', dry_run: true, by, planned_moves: moves.length, moves }));
  }

// ── RENAME ─────────────────────────────────────────────────────────────────────
} else if (verb === 'rename') {
  const dir   = get('path');
  const match = get('match');
  const to    = get('to');
  const apply = get('apply', 'false') === 'true';

  if (!dir)   die('rename requires --path <dir>');
  if (!match) die('rename requires --match <regex>');
  if (!to)    die('rename requires --to <pattern>');
  if (!fs.existsSync(dir)) die(`path does not exist: ${dir}`);

  let re;
  try { re = new RegExp(match); }
  catch (e) { die(`invalid regex: ${e.message}`); }

  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { die(`cannot read dir: ${e.message}`); }

  const renames = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!re.test(e.name)) continue;
    // Replace with $1..$9 backrefs
    const newName = e.name.replace(re, to);
    if (newName === e.name) continue;
    renames.push({
      src: path.join(dir, e.name),
      dest: path.join(dir, newName),
      from: e.name,
      to: newName,
    });
  }

  // Check for collisions
  const destNames = new Set(renames.map(r => r.dest));
  if (destNames.size !== renames.length) {
    die('rename plan has collisions (two files would get the same name). Aborting.');
  }

  if (apply) {
    const done = [], errors = [];
    for (const r of renames) {
      try {
        fs.renameSync(r.src, r.dest);
        done.push(r);
      } catch (e) {
        errors.push({ ...r, error: e.message });
      }
    }
    console.log(JSON.stringify({ ok: true, verb: 'rename', dry_run: false, renamed: done.length, errors: errors.length, renames: done, rename_errors: errors }));
  } else {
    console.log(JSON.stringify({ ok: true, verb: 'rename', dry_run: true, planned: renames.length, renames }));
  }

// ── ZIP ───────────────────────────────────────────────────────────────────────
} else if (verb === 'zip') {
  const src = get('src');
  const out = get('out');

  if (!src) die('zip requires --src <path>');
  if (!out) die('zip requires --out <zip>');
  if (!fs.existsSync(src)) die(`src does not exist: ${src}`);

  // Use PowerShell Compress-Archive
  const script = `
$ErrorActionPreference = 'Stop'
try {
  Compress-Archive -Path '${src.replace(/'/g, "''")}' -DestinationPath '${out.replace(/'/g, "''")}' -Force
  Write-Output '{"ok":true}'
} catch {
  Write-Output ('{\"ok\":false,\"error\":\"' + ($_.Exception.Message -replace '"','\\\"') + '\"}')
}
`.trim();
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8', timeout: 60000 });
  const line = (r.stdout || '').split('\n').map(l => l.trim()).find(l => l.startsWith('{'));
  if (line) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.ok) {
        let zipSize = null;
        try { zipSize = fs.statSync(out).size; } catch {}
        console.log(JSON.stringify({ ok: true, verb: 'zip', src, out, zip_size: zipSize }));
      } else {
        console.log(JSON.stringify({ ok: false, verb: 'zip', error: parsed.error }));
      }
    } catch {
      console.log(JSON.stringify({ ok: false, verb: 'zip', error: 'unexpected PowerShell output', raw: line }));
    }
  } else {
    const errText = (r.stderr || r.stdout || 'unknown error').trim().slice(0, 500);
    console.log(JSON.stringify({ ok: false, verb: 'zip', error: errText }));
  }

// ── UNZIP ─────────────────────────────────────────────────────────────────────
} else if (verb === 'unzip') {
  const src   = get('src');
  const out   = get('out');
  const apply = get('apply', 'false') === 'true';

  if (!src) die('unzip requires --src <zip>');
  if (!out) die('unzip requires --out <dir>');
  if (!fs.existsSync(src)) die(`src does not exist: ${src}`);

  if (!apply) {
    // Dry-run: list zip contents using PowerShell
    const script = `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead('${src.replace(/'/g, "''")}')
  $entries = $zip.Entries | ForEach-Object { [PSCustomObject]@{ name=$_.FullName; size=$_.Length } }
  $zip.Dispose()
  $json = $entries | ConvertTo-Json -Compress
  if ($json -eq $null) { $json = '[]' }
  Write-Output $json
} catch {
  Write-Output ('{\"error\":\"' + ($_.Exception.Message -replace '"','\\\"') + '\"}')
}
`.trim();
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8', timeout: 30000 });
    let entries = [];
    const raw = (r.stdout || '').trim();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) entries = parsed;
      else if (parsed && parsed.name) entries = [parsed]; // single entry PS unwraps array
      else if (parsed && parsed.error) {
        console.log(JSON.stringify({ ok: false, verb: 'unzip', error: parsed.error }));
        process.exit(0);
      }
    } catch { /* leave empty */ }
    console.log(JSON.stringify({ ok: true, verb: 'unzip', dry_run: true, src, out, entry_count: entries.length, entries }));
  } else {
    // Actually extract
    const script = `
$ErrorActionPreference = 'Stop'
try {
  Expand-Archive -Path '${src.replace(/'/g, "''")}' -DestinationPath '${out.replace(/'/g, "''")}' -Force
  Write-Output '{"ok":true}'
} catch {
  Write-Output ('{\"ok\":false,\"error\":\"' + ($_.Exception.Message -replace '"','\\\"') + '\"}')
}
`.trim();
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8', timeout: 120000 });
    const line = (r.stdout || '').split('\n').map(l => l.trim()).find(l => l.startsWith('{'));
    if (line) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.ok) {
          console.log(JSON.stringify({ ok: true, verb: 'unzip', src, out }));
        } else {
          console.log(JSON.stringify({ ok: false, verb: 'unzip', error: parsed.error }));
        }
      } catch {
        console.log(JSON.stringify({ ok: false, verb: 'unzip', error: 'unexpected output', raw: line }));
      }
    } else {
      const errText = (r.stderr || r.stdout || 'unknown error').trim().slice(0, 500);
      console.log(JSON.stringify({ ok: false, verb: 'unzip', error: errText }));
    }
  }

// ── UNKNOWN VERB ──────────────────────────────────────────────────────────────
} else {
  die(`unknown verb "${verb || '(none)'}". Valid verbs: find | tree | big | dupes | organize | rename | zip | unzip`);
}
