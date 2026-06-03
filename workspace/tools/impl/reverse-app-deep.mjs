// reverse-app-deep.mjs — the DEEP layer for the `reverse app` command.
//
// The base `analyzeApp` in reverse.mjs is shallow: Info.plist dump, `otool -L`, entitlements. This module
// goes the rest of the way — it explains WHAT an application actually IS and HOW it works internally, by
// cracking open the things that carry the real answer:
//
//   - Electron app.asar (parsed in PURE JS, no `asar` npm dep) — package.json, the full dependency tree,
//     the main-process entry file's startup behavior, and detected subsystems (auto-update, telemetry,
//     plugin host, embedded server, native addons). This is THE payload for Obsidian / VS Code / Claude /
//     Slack and every other Electron desktop app.
//   - Architectures (lipo / file): arm64 / x86_64, universal or not.
//   - Embedded frameworks with their versions (Electron Framework 30.x, Sparkle, Squirrel, …).
//   - Helper apps & background services (Electron GPU/Renderer/Plugin helpers, XPCServices, LoginItems).
//   - The auto-update feed (Sparkle SUFeedURL / electron-updater) — where the app phones home for updates.
//   - Code signing (Authority / TeamIdentifier / Identifier / hardened runtime).
//   - A capabilities summary from Info.plist (category, URL schemes, document types, background modes, and
//     every NS*UsageDescription privacy string — i.e. what the app is allowed to touch).
//
// Windows PE (.exe/.dll) and Linux ELF get pure-JS header parsing: machine/subsystem, imported DLLs /
// NEEDED libraries, interpreter, version info, and runtime inference (.NET, Electron, Qt, Go, Rust).
//
// ETHICS: this reads files that already sit on the owner's disk and explains them. It defeats nothing.
// Use only on apps you own or are authorized to analyze.
//
// SOLE EXPORT:  async function appDeepDive(appPath, platform = process.platform) -> { lines, findings }
//   `lines`    — Markdown lines to APPEND to the report (one array element per line).
//   `findings` — structured object the caller's synthesis reads. KEYS (all optional; absent on failure):
//       platform          string   — the platform branch taken ('darwin' | 'win32' | 'linux').
//       kind              string   — 'electron' | 'native-macos' | 'pe' | 'elf' | 'unknown'.
//       app               object   — { name, productName, version, description, author, homepage,
//                                       license, main } pulled from the Electron package.json.
//       electron          object   — Electron-specific detail:
//                                       { asarPath, hasUnpacked, mainEntry, fileCount, jsFileCount,
//                                         totalBytes, topLevel:[...], dependencies:{name:ver},
//                                         devDependencies:{name:ver}, depCount, mainRequires:[...],
//                                         mainSignals:[...], electronVersion }
//       subsystems        string[] — human-readable detected subsystems (auto-update, telemetry, plugin
//                                     host, local server, native addons, …).
//       architectures     string[] — CPU archs in the main executable (e.g. ['arm64','x86_64']).
//       universal         boolean  — true if >1 arch (a universal/fat binary).
//       frameworks        object[] — [{ name, version }] embedded *.framework bundles.
//       helpers           string[] — helper *.app / XPCService / LoginItem names under Contents.
//       updateFeed        object   — { type:'sparkle'|'electron-updater', url, publicEDKey? } if found.
//       signing           object   — { signed, identifier, authority:[...], teamId, hardenedRuntime,
//                                       flags } from codesign.
//       capabilities      object   — { category, minOS, urlSchemes:[...], documentTypes:[...],
//                                       backgroundModes:[...], privacyStrings:{ key: description } }.
//       executable        string   — path to the analyzed main executable.
//       pe / elf          object   — Windows/Linux header detail (machine, subsystem, imports/needed,
//                                     interpreter, version info, runtime).
//       errors            string[] — non-fatal problems encountered (each stage failure is recorded here).
//
// This function NEVER throws. On total failure it returns { lines: [], findings: {} }. Partial output is
// the normal, expected case — every stage is independently guarded.

import { spawnSync } from 'node:child_process';
import { openSync, readSync, closeSync, existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- local self-contained helpers (mirrors reverse.mjs conventions; reimplemented to stay independent) ----

// Run a system tool, never throw. Mirrors reverse.mjs `run`.
function run(cmd, args, opts = {}) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024, ...opts });
    return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status ?? -1 };
  } catch (e) {
    return { stdout: '', stderr: e.message || String(e), status: -1 };
  }
}

// Truncate a multi-line dump to a sane number of lines for the report.
function clip(str, maxLines = 40, maxChars = 4000) {
  let s = String(str || '');
  if (s.length > maxChars) s = s.slice(0, maxChars) + '\n… (truncated)';
  const ls = s.split(/\r?\n/);
  if (ls.length > maxLines) return ls.slice(0, maxLines).join('\n') + `\n… (+${ls.length - maxLines} more lines)`;
  return ls.join('\n');
}

const fmtBytes = n => {
  if (!Number.isFinite(n)) return '?';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
};

// =====================================================================================================
// ASAR PARSER (pure JS — no `asar` npm dependency)
// Format: [4-byte pickle len-of-len][4-byte header-size][4-byte L][L bytes JSON header][...file data...]
// We read ONLY the small header via ranged reads, never the whole archive (asar can be tens of MB).
// =====================================================================================================

// Open an asar and return { header, dataStart, fd } — caller MUST closeSync(fd). Throws on bad magic;
// every caller wraps this in try/catch.
function openAsar(asarPath) {
  const fd = openSync(asarPath, 'r');
  try {
    // First pickle: 8 bytes. bytes[0..3] = size of the size field (always 4); bytes[4..7] = header object size.
    const sizeBuf = Buffer.alloc(8);
    readSync(fd, sizeBuf, 0, 8, 0);
    const size = sizeBuf.readUInt32LE(4);               // total bytes of the header pickle that follows
    if (!size || size > 256 * 1024 * 1024) throw new Error(`implausible asar header size ${size}`);
    const headerBuf = Buffer.alloc(size);
    readSync(fd, headerBuf, 0, size, 8);
    const L = headerBuf.readUInt32LE(4);                // length of the JSON string inside the pickle
    const json = headerBuf.toString('utf8', 8, 8 + L);
    const header = JSON.parse(json);
    const dataStart = 8 + size;                         // file payloads begin right after the header pickle
    return { header, dataStart, fd };
  } catch (e) {
    closeSync(fd);
    throw e;
  }
}

// Walk header.files down a POSIX-style path ('package.json', 'main.js', 'a/b/c'). Returns the node or null.
function asarNode(header, relPath) {
  const parts = relPath.split('/').filter(Boolean);
  let node = header;
  for (const part of parts) {
    if (!node || !node.files || !node.files[part]) return null;
    node = node.files[part];
  }
  return node;
}

// Read a single file out of an open asar by relative path. Returns a Buffer or null. `cap` bounds the read.
function asarReadFile(asar, relPath, cap = 4 * 1024 * 1024) {
  const node = asarNode(asar.header, relPath);
  if (!node || node.files) return null;                 // missing, or it's a directory
  const size = Math.min(Number(node.size) || 0, cap);
  if (size <= 0) return Buffer.alloc(0);
  const off = asar.dataStart + Number(node.offset);     // offset is a decimal STRING in the header
  const buf = Buffer.alloc(size);
  readSync(asar.fd, buf, 0, size, off);
  return buf;
}

// Tally the archive: top-level entries, total JS files, and total uncompressed byte size (recursive).
function asarStats(header) {
  const topLevel = header.files ? Object.keys(header.files) : [];
  let fileCount = 0, jsFileCount = 0, totalBytes = 0;
  const walk = (node) => {
    if (!node || !node.files) return;
    for (const [name, child] of Object.entries(node.files)) {
      if (child.files) { walk(child); }
      else {
        fileCount++;
        totalBytes += Number(child.size) || 0;
        if (/\.(c|m)?jsx?$/.test(name)) jsFileCount++;
      }
    }
  };
  walk(header);
  return { topLevel, fileCount, jsFileCount, totalBytes };
}

// =====================================================================================================
// SIGNAL DETECTION — map dependency names + main-entry source to human-readable subsystems.
// =====================================================================================================

// Known dependency-name → subsystem fingerprints. First match per group wins for the headline list.
const DEP_SIGNALS = [
  { re: /^electron-updater$|^electron-builder$/i,                 label: 'Auto-update (electron-updater)' },
  { re: /^update-electron-app$/i,                                 label: 'Auto-update (update-electron-app)' },
  { re: /^@sentry\b|^raven\b/i,                                   label: 'Crash reporting / error telemetry (Sentry)' },
  { re: /^@segment\b|^analytics-node$/i,                          label: 'Product analytics (Segment)' },
  { re: /^amplitude\b|^@amplitude\b/i,                            label: 'Product analytics (Amplitude)' },
  { re: /^mixpanel\b/i,                                           label: 'Product analytics (Mixpanel)' },
  { re: /^posthog\b/i,                                            label: 'Product analytics (PostHog)' },
  { re: /^analytics\b|google-analytics|gtag|universal-analytics/i,label: 'Web analytics (Google Analytics)' },
  { re: /^express$/i,                                             label: 'Embedded HTTP server (Express)' },
  { re: /^koa$|^fastify$|^hapi$/i,                                label: 'Embedded HTTP server' },
  { re: /^ws$|^socket\.io\b|^socketio\b/i,                        label: 'WebSocket server/client' },
  { re: /^node-fetch$|^axios$|^got$|^superagent$/i,               label: 'HTTP client library' },
  { re: /^sqlite3$|^better-sqlite3$|^sql\.js$|^level\b|^lmdb$/i,   label: 'Local database / embedded store' },
  { re: /^codemirror$|^@codemirror\b/i,                           label: 'CodeMirror editor core' },
  { re: /^monaco-editor$/i,                                       label: 'Monaco editor core' },
  { re: /^react$|^react-dom$/i,                                   label: 'React UI framework' },
  { re: /^vue$/i,                                                 label: 'Vue UI framework' },
  { re: /^@electron\/remote$|^electron-remote$/i,                 label: 'electron remote bridge' },
  { re: /^keytar$/i,                                              label: 'OS keychain access (keytar)' },
  { re: /^node-machine-id$/i,                                     label: 'Device fingerprinting (machine-id)' },
];

// Source-level fingerprints applied to the main-process entry file.
const SOURCE_SIGNALS = [
  { re: /\bautoUpdater\b|electron-updater|checkForUpdates/,       label: 'Auto-update wired in main process' },
  { re: /\bBrowserWindow\b/,                                      label: 'Creates BrowserWindow(s)' },
  { re: /\bprotocol\.(registerSchemesAsPrivileged|registerFileProtocol|handle|register)\b/, label: 'Registers custom protocol(s)' },
  { re: /\bapp\.setAsDefaultProtocolClient\b/,                    label: 'Registers a custom URL scheme handler' },
  { re: /\bsession\.|webRequest\b/,                               label: 'Intercepts network requests (session/webRequest)' },
  { re: /\bglobalShortcut\b/,                                     label: 'Registers global keyboard shortcuts' },
  { re: /\bTray\b/,                                               label: 'Menu-bar / system-tray presence' },
  { re: /\bipcMain\b/,                                            label: 'IPC main<->renderer messaging' },
  { re: /\bchild_process\b|\.spawn\(|\.exec\(/,                   label: 'Spawns child processes' },
  { re: /require\(['"]http(s)?['"]\)|createServer\(/,             label: 'Starts a local server' },
  { re: /\.node['"]\)/,                                           label: 'Loads a native addon (.node)' },
];

// Pull the require()/import specifiers a JS file loads at startup (best-effort regex, deduped).
function extractRequires(src) {
  const out = new Set();
  const re = /(?:require\(\s*|import\s+[^'"]*?from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) && out.size < 80) out.add(m[1]);
  return [...out];
}

// =====================================================================================================
// MACOS — Electron app.asar deep dive
// =====================================================================================================

function analyzeElectron(asarPath, findings, lines, errors) {
  let asar;
  try { asar = openAsar(asarPath); }
  catch (e) { errors.push(`asar parse failed: ${e.message}`); return false; }

  const electron = { asarPath };
  try {
    const stats = asarStats(asar.header);
    electron.fileCount = stats.fileCount;
    electron.jsFileCount = stats.jsFileCount;
    electron.totalBytes = stats.totalBytes;
    electron.topLevel = stats.topLevel.slice(0, 60);

    // ---- package.json: identity + dependency tree ----
    let pkg = null;
    const pkgBuf = asarReadFile(asar, 'package.json');
    if (pkgBuf) { try { pkg = JSON.parse(pkgBuf.toString('utf8')); } catch (e) { errors.push(`package.json parse: ${e.message}`); } }
    if (pkg) {
      const authorStr = typeof pkg.author === 'object' && pkg.author ? (pkg.author.name || JSON.stringify(pkg.author)) : pkg.author;
      findings.app = {
        name: pkg.name || null,
        productName: pkg.productName || null,
        version: pkg.version || null,
        description: pkg.description || null,
        author: authorStr || null,
        homepage: pkg.homepage || null,
        license: pkg.license || null,
        main: pkg.main || null,
      };
      electron.mainEntry = pkg.main || null;
      electron.dependencies = pkg.dependencies || {};
      electron.devDependencies = pkg.devDependencies || {};
      electron.depCount = Object.keys(electron.dependencies).length + Object.keys(electron.devDependencies).length;
      const ev = (pkg.devDependencies && pkg.devDependencies.electron) || (pkg.dependencies && pkg.dependencies.electron);
      if (ev) electron.electronVersion = ev;
    }

    // ---- main entry: what it loads + what it does at startup ----
    const mainRel = (electron.mainEntry || 'main.js').replace(/^\.\//, '');
    const mainBuf = asarReadFile(asar, mainRel) || asarReadFile(asar, 'main.js') || asarReadFile(asar, 'index.js');
    if (mainBuf) {
      const src = mainBuf.toString('utf8');
      electron.mainRequires = extractRequires(src).slice(0, 40);
      electron.mainSignals = SOURCE_SIGNALS.filter(s => s.re.test(src)).map(s => s.label);
    }
  } catch (e) {
    errors.push(`electron analysis: ${e.message}`);
  } finally {
    try { closeSync(asar.fd); } catch { /* already closed */ }
  }

  findings.kind = 'electron';
  findings.electron = electron;

  // ---- subsystem detection from deps + source ----
  const subsystems = new Set();
  const allDeps = { ...(electron.dependencies || {}), ...(electron.devDependencies || {}) };
  for (const depName of Object.keys(allDeps)) {
    for (const sig of DEP_SIGNALS) { if (sig.re.test(depName)) { subsystems.add(sig.label); break; } }
  }
  for (const label of (electron.mainSignals || [])) subsystems.add(label);
  // native addon presence from the file listing
  if ((electron.topLevel || []).some(n => /node_modules|\.node$/.test(n))) { /* deep .node detected later via unpacked */ }
  findings.subsystems = [...subsystems];

  // ---- render Markdown ----
  const app = findings.app || {};
  lines.push('## Application Internals (Electron)', '');
  lines.push('This is an **Electron** desktop application — a Chromium browser + a Node.js runtime bundled together, with the app\'s own code shipped inside an `app.asar` archive. The archive was parsed directly to recover what the app is built from.', '');
  if (app.productName || app.name) {
    lines.push('### Identity (from app.asar/package.json)', '');
    const idRow = [
      app.productName && `- **Product:** ${app.productName}`,
      app.name && `- **Package name:** \`${app.name}\``,
      app.version && `- **Version:** ${app.version}`,
      app.description && `- **Description:** ${app.description}`,
      app.author && `- **Author:** ${app.author}`,
      app.homepage && `- **Homepage:** ${app.homepage}`,
      app.license && `- **License:** ${app.license}`,
      app.main && `- **Main process entry:** \`${app.main}\``,
      electron.electronVersion && `- **Electron version:** ${electron.electronVersion}`,
    ].filter(Boolean);
    lines.push(...idRow, '');
  }

  lines.push('### Archive contents', '');
  lines.push(`- **Files in archive:** ${electron.fileCount ?? '?'} (${electron.jsFileCount ?? '?'} JavaScript), **uncompressed size:** ${fmtBytes(electron.totalBytes)}`);
  if (electron.hasUnpacked) lines.push('- An **`app.asar.unpacked`** directory is present (native modules / binaries that must live on disk, not inside the archive).');
  if (electron.topLevel && electron.topLevel.length) lines.push(`- **Top-level entries:** ${electron.topLevel.slice(0, 25).map(s => `\`${s}\``).join(', ')}`);
  lines.push('');

  const deps = electron.dependencies || {};
  const dev = electron.devDependencies || {};
  if (Object.keys(deps).length) {
    lines.push(`### Runtime dependencies (${Object.keys(deps).length})`, '');
    lines.push('These ship inside the app and run at runtime — they reveal the building blocks of the product:', '');
    lines.push('```');
    for (const [n, v] of Object.entries(deps).slice(0, 60)) lines.push(`${n}@${v}`);
    if (Object.keys(deps).length > 60) lines.push(`… (+${Object.keys(deps).length - 60} more)`);
    lines.push('```', '');
  }
  if (Object.keys(dev).length) {
    lines.push(`### Build / dev dependencies (${Object.keys(dev).length})`, '');
    lines.push('```');
    for (const [n, v] of Object.entries(dev).slice(0, 40)) lines.push(`${n}@${v}`);
    if (Object.keys(dev).length > 40) lines.push(`… (+${Object.keys(dev).length - 40} more)`);
    lines.push('```', '');
  }

  if (electron.mainRequires && electron.mainRequires.length) {
    lines.push('### Main-process startup', '');
    lines.push(`The main entry (\`${electron.mainEntry || 'main'}\`) loads these modules at launch:`, '');
    lines.push('```');
    lines.push(...electron.mainRequires.slice(0, 30));
    lines.push('```', '');
  }
  if (findings.subsystems.length) {
    lines.push('### Detected subsystems', '');
    lines.push(...findings.subsystems.map(s => `- ${s}`), '');
  }
  return true;
}

// =====================================================================================================
// MACOS — bundle-level extraction (archs, frameworks, helpers, update feed, signing, capabilities)
// =====================================================================================================

// Resolve the main executable from Info.plist CFBundleExecutable, falling back to the bundle base name.
function macExecutablePath(appPath) {
  const macOSDir = path.join(appPath, 'Contents/MacOS');
  const plist = path.join(appPath, 'Contents/Info.plist');
  let exe = null;
  if (existsSync(plist)) {
    const r = run('/usr/bin/plutil', ['-extract', 'CFBundleExecutable', 'raw', plist]);
    if (r.status === 0 && r.stdout.trim()) exe = r.stdout.trim();
  }
  if (exe && existsSync(path.join(macOSDir, exe))) return path.join(macOSDir, exe);
  // fall back: first file in Contents/MacOS
  try {
    const files = readdirSync(macOSDir);
    if (files.length) return path.join(macOSDir, files[0]);
  } catch { /* no MacOS dir */ }
  return null;
}

function analyzeArchitectures(execPath, findings, lines, errors) {
  if (!execPath) return;
  try {
    let archs = [];
    const lipo = run('/usr/bin/lipo', ['-archs', execPath]);
    if (lipo.status === 0 && lipo.stdout.trim()) {
      archs = lipo.stdout.trim().split(/\s+/);
    } else {
      const f = run('/usr/bin/file', [execPath]);
      if (f.status === 0) {
        for (const a of ['arm64', 'x86_64', 'i386', 'arm64e']) if (f.stdout.includes(a)) archs.push(a);
      }
    }
    if (archs.length) {
      findings.architectures = archs;
      findings.universal = archs.length > 1;
      lines.push('### Architectures', '');
      lines.push(`- **CPU architectures:** ${archs.join(', ')}${archs.length > 1 ? ' (universal / fat binary)' : ' (single-arch)'}`, '');
    }
  } catch (e) { errors.push(`arch: ${e.message}`); }
}

// Read a framework's short version from its Info.plist (Versions/Current/Resources or top-level).
function frameworkVersion(fwPath) {
  const candidates = [
    path.join(fwPath, 'Resources/Info.plist'),
    path.join(fwPath, 'Versions/Current/Resources/Info.plist'),
    path.join(fwPath, 'Info.plist'),
  ];
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    // Prefer the marketing version; fall back to CFBundleVersion (the Electron Framework only carries that).
    for (const key of ['CFBundleShortVersionString', 'CFBundleVersion']) {
      const r = run('/usr/bin/plutil', ['-extract', key, 'raw', c]);
      if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
    }
  }
  return null;
}

function analyzeFrameworks(appPath, findings, lines, errors) {
  const fwDir = path.join(appPath, 'Contents/Frameworks');
  if (!existsSync(fwDir)) return;
  try {
    const entries = readdirSync(fwDir).filter(n => n.endsWith('.framework'));
    if (!entries.length) return;
    const fwks = [];
    for (const name of entries) {
      const ver = frameworkVersion(path.join(fwDir, name));
      fwks.push({ name: name.replace(/\.framework$/, ''), version: ver });
    }
    findings.frameworks = fwks;
    // The Electron Framework's own version is the real Chromium/Electron engine version — surface it on
    // the electron findings when package.json didn't pin `electron` itself (the common case).
    const ef = fwks.find(f => /^Electron Framework$/.test(f.name));
    if (ef && ef.version && findings.electron && !findings.electron.electronVersion) {
      findings.electron.electronVersion = ef.version;
    }
    lines.push('### Embedded frameworks', '');
    lines.push('Bundled frameworks the app links against (their versions pin the engine and update machinery):', '');
    lines.push(...fwks.map(f => `- **${f.name}**${f.version ? ` ${f.version}` : ''}`), '');
  } catch (e) { errors.push(`frameworks: ${e.message}`); }
}

function analyzeHelpers(appPath, findings, lines, errors) {
  const contents = path.join(appPath, 'Contents');
  const helpers = [];
  try {
    // Electron helper apps live under Contents/Frameworks; XPC and login items have their own dirs.
    const scanDirs = [
      ['Frameworks', /\.app$/],
      ['XPCServices', /\.xpc$/],
      ['Library/LoginItems', /\.app$/],
      ['Library/LaunchAgents', /\.(plist|app)$/],
    ];
    for (const [sub, re] of scanDirs) {
      const dir = path.join(contents, sub);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) if (re.test(name)) helpers.push(`${sub}/${name}`);
    }
    if (helpers.length) {
      findings.helpers = helpers;
      lines.push('### Helper apps & background services', '');
      lines.push('Separate executables the app launches (Electron isolates the GPU, renderer and plugin processes; XPC/login items run privileged or at startup):', '');
      lines.push(...helpers.map(h => `- \`${h}\``), '');
    }
  } catch (e) { errors.push(`helpers: ${e.message}`); }
}

// Read a single Info.plist key as raw text (returns '' if absent).
function plistRaw(plist, key) {
  const r = run('/usr/bin/plutil', ['-extract', key, 'raw', plist]);
  return r.status === 0 ? r.stdout.trim() : '';
}
// Read an Info.plist key as JSON (for arrays/dicts). Returns parsed value or null.
function plistJson(plist, key) {
  const r = run('/usr/bin/plutil', ['-extract', key, 'json', plist]);
  if (r.status !== 0 || !r.stdout.trim()) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function analyzeUpdateFeed(appPath, plist, findings, lines, errors) {
  try {
    const feed = plistRaw(plist, 'SUFeedURL');
    const edKey = plistRaw(plist, 'SUPublicEDKey');
    if (feed || edKey) {
      findings.updateFeed = { type: 'sparkle', url: feed || null, publicEDKey: edKey || null };
      lines.push('### Auto-update feed (Sparkle)', '');
      if (feed) lines.push(`- **Update feed URL:** ${feed}`);
      if (edKey) lines.push('- A **Sparkle EdDSA public key** is present (updates are signature-verified).');
      lines.push('');
      return;
    }
    // electron-updater config (app-update.yml under Resources)
    const cfg = path.join(appPath, 'Contents/Resources/app-update.yml');
    if (existsSync(cfg)) {
      const yml = readFileSync(cfg, 'utf8').slice(0, 2000);
      const urlM = yml.match(/url:\s*(\S+)/i);
      const provM = yml.match(/provider:\s*(\S+)/i);
      findings.updateFeed = { type: 'electron-updater', url: urlM ? urlM[1] : null, provider: provM ? provM[1] : null };
      lines.push('### Auto-update feed (electron-updater)', '');
      if (provM) lines.push(`- **Update provider:** ${provM[1]}`);
      if (urlM) lines.push(`- **Update URL:** ${urlM[1]}`);
      lines.push('');
    }
  } catch (e) { errors.push(`updateFeed: ${e.message}`); }
}

function analyzeSigning(appPath, findings, lines, errors) {
  try {
    const r = run('/usr/bin/codesign', ['-dv', '--verbose=4', appPath], { timeout: 20_000 });
    const text = (r.stderr || '') + (r.stdout || '');     // codesign prints to stderr
    if (!text.trim()) return;
    const signing = { signed: !/code object is not signed/i.test(text) && r.status === 0 };
    const idM = text.match(/^Identifier=(.+)$/m);
    if (idM) signing.identifier = idM[1].trim();
    const teamM = text.match(/^TeamIdentifier=(.+)$/m);
    if (teamM && teamM[1].trim() !== 'not set') signing.teamId = teamM[1].trim();
    signing.authority = [...text.matchAll(/^Authority=(.+)$/gm)].map(m => m[1].trim());
    const flagsM = text.match(/^CodeDirectory v=.*flags=([^ ]+)/m) || text.match(/flags=(0x[0-9a-f]+\s*\([^)]*\))/i);
    if (flagsM) signing.flags = flagsM[1].trim();
    signing.hardenedRuntime = /runtime/i.test(flagsM ? flagsM[0] : '') || /flags=.*runtime/i.test(text);
    findings.signing = signing;

    lines.push('### Code signing', '');
    if (!signing.signed) {
      lines.push('- The app is **not code-signed** (or the signature is invalid).', '');
    } else {
      if (signing.identifier) lines.push(`- **Signing identifier:** \`${signing.identifier}\``);
      if (signing.teamId) lines.push(`- **Apple Team ID:** ${signing.teamId}`);
      if (signing.authority && signing.authority.length) lines.push(`- **Authority chain:** ${signing.authority.join(' → ')}`);
      lines.push(`- **Hardened runtime:** ${signing.hardenedRuntime ? 'enabled' : 'not detected'}`);
      lines.push('');
    }
  } catch (e) { errors.push(`signing: ${e.message}`); }
}

function analyzeCapabilities(plist, findings, lines, errors) {
  if (!existsSync(plist)) return;
  try {
    const caps = {};
    caps.category = plistRaw(plist, 'LSApplicationCategoryType') || null;
    caps.minOS = plistRaw(plist, 'LSMinimumSystemVersion') || null;

    // URL schemes the app registers (deep links / protocol handlers).
    const urlTypes = plistJson(plist, 'CFBundleURLTypes');
    const schemes = [];
    if (Array.isArray(urlTypes)) for (const t of urlTypes) if (Array.isArray(t.CFBundleURLSchemes)) schemes.push(...t.CFBundleURLSchemes);
    caps.urlSchemes = schemes;

    // Document types the app declares it can open.
    const docTypes = plistJson(plist, 'CFBundleDocumentTypes');
    const docs = [];
    if (Array.isArray(docTypes)) for (const d of docTypes) if (d.CFBundleTypeName) docs.push(d.CFBundleTypeName);
    caps.documentTypes = docs;

    // Background execution modes (LSBackgroundOnly / UIBackgroundModes).
    const bg = plistJson(plist, 'UIBackgroundModes');
    caps.backgroundModes = Array.isArray(bg) ? bg : [];

    // Every NS*UsageDescription privacy string — what hardware/data the app asks to touch.
    const privacy = {};
    const pp = run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist]);
    if (pp.status === 0) {
      try {
        const obj = JSON.parse(pp.stdout);
        for (const [k, v] of Object.entries(obj)) if (/UsageDescription$/.test(k) && typeof v === 'string') privacy[k] = v;
      } catch { /* not parseable */ }
    }
    caps.privacyStrings = privacy;
    findings.capabilities = caps;

    lines.push('### Declared capabilities (Info.plist)', '');
    if (caps.category) lines.push(`- **App Store category:** ${caps.category}`);
    if (caps.minOS) lines.push(`- **Minimum macOS:** ${caps.minOS}`);
    if (schemes.length) lines.push(`- **URL schemes (deep links):** ${schemes.map(s => `\`${s}://\``).join(', ')}`);
    if (docs.length) lines.push(`- **Opens document types:** ${docs.slice(0, 15).join(', ')}`);
    if (caps.backgroundModes.length) lines.push(`- **Background modes:** ${caps.backgroundModes.join(', ')}`);
    const pk = Object.keys(privacy);
    if (pk.length) {
      lines.push(`- **Privacy / hardware access requested (${pk.length}):**`);
      for (const k of pk.slice(0, 20)) {
        const human = k.replace(/^NS/, '').replace(/UsageDescription$/, '');
        lines.push(`  - **${human}:** ${privacy[k]}`);
      }
    }
    lines.push('');
  } catch (e) { errors.push(`capabilities: ${e.message}`); }
}

// macOS top-level orchestration.
function analyzeMacApp(appPath, findings, lines, errors) {
  findings.platform = 'darwin';
  const plist = path.join(appPath, 'Contents/Info.plist');

  // 1. Electron app.asar (the headline) -------------------------------------------------------------
  const asarPath = path.join(appPath, 'Contents/Resources/app.asar');
  const isElectron = existsSync(asarPath);
  if (isElectron) {
    const unpacked = path.join(appPath, 'Contents/Resources/app.asar.unpacked');
    const hasUnpacked = existsSync(unpacked);
    const ok = analyzeElectron(asarPath, findings, lines, errors);
    if (ok && findings.electron) {
      findings.electron.hasUnpacked = hasUnpacked;
      // detect native .node addons in the unpacked tree (cheap, shallow scan)
      if (hasUnpacked) {
        try {
          const nativeFound = [];
          const scan = (dir, depth) => {
            if (depth > 4) return;
            for (const n of readdirSync(dir)) {
              const p = path.join(dir, n);
              let st; try { st = statSync(p); } catch { continue; }
              if (st.isDirectory()) scan(p, depth + 1);
              else if (n.endsWith('.node')) nativeFound.push(path.relative(unpacked, p));
            }
          };
          scan(unpacked, 0);
          if (nativeFound.length) {
            findings.electron.nativeAddons = nativeFound.slice(0, 20);
            findings.subsystems = [...new Set([...(findings.subsystems || []), `Native addons (${nativeFound.length} .node files)`])];
            lines.push('### Native addons (app.asar.unpacked)', '');
            lines.push('Compiled native modules that run outside the JS sandbox:', '');
            lines.push(...nativeFound.slice(0, 15).map(n => `- \`${n}\``), '');
          }
        } catch (e) { errors.push(`native scan: ${e.message}`); }
      }
    }
  } else {
    findings.kind = 'native-macos';
    lines.push('## Application Internals (native macOS)', '');
    lines.push('No `app.asar` was found — this is a **native macOS application** (likely Swift/Objective-C/AppKit), not an Electron web app.', '');
  }

  // 2. Architectures -------------------------------------------------------------------------------
  const execPath = macExecutablePath(appPath);
  if (execPath) findings.executable = execPath;
  analyzeArchitectures(execPath, findings, lines, errors);

  // 3. Frameworks ----------------------------------------------------------------------------------
  analyzeFrameworks(appPath, findings, lines, errors);

  // 4. Helpers & services --------------------------------------------------------------------------
  analyzeHelpers(appPath, findings, lines, errors);

  // 5. Auto-update feed ----------------------------------------------------------------------------
  if (existsSync(plist)) analyzeUpdateFeed(appPath, plist, findings, lines, errors);

  // 6. Code signing --------------------------------------------------------------------------------
  analyzeSigning(appPath, findings, lines, errors);

  // 7. Capabilities --------------------------------------------------------------------------------
  analyzeCapabilities(plist, findings, lines, errors);
}

// =====================================================================================================
// WINDOWS PE (.exe/.dll) — pure-JS header parse
// =====================================================================================================

const PE_MACHINE = { 0x014c: 'x86 (i386)', 0x8664: 'x86_64 (AMD64)', 0x01c0: 'ARM', 0xaa64: 'ARM64', 0x0200: 'IA64' };
const PE_SUBSYSTEM = { 1: 'Native', 2: 'Windows GUI', 3: 'Windows Console', 9: 'Windows CE GUI', 10: 'EFI application' };

function analyzePE(filePath, findings, lines, errors) {
  findings.kind = 'pe';
  let fd;
  try {
    fd = openSync(filePath, 'r');
    const head = Buffer.alloc(0x400);
    const n = readSync(fd, head, 0, head.length, 0);
    if (n < 64 || head.readUInt16LE(0) !== 0x5a4d) { errors.push('not a PE (no MZ)'); return; } // 'MZ'
    const peOff = head.readUInt32LE(0x3c);
    const sig = Buffer.alloc(4); readSync(fd, sig, 0, 4, peOff);
    if (sig.toString('ascii', 0, 2) !== 'PE') { errors.push('not a PE (no PE\\0\\0)'); return; }

    const coff = Buffer.alloc(20); readSync(fd, coff, 0, 20, peOff + 4);
    const machine = coff.readUInt16LE(0);
    const numSections = coff.readUInt16LE(2);
    const optSize = coff.readUInt16LE(16);
    const characteristics = coff.readUInt16LE(18);

    const opt = Buffer.alloc(Math.min(optSize, 240)); readSync(fd, opt, 0, opt.length, peOff + 24);
    const magic = opt.readUInt16LE(0);
    const isPE32Plus = magic === 0x20b;                  // PE32+ = 64-bit
    const subsystem = opt.readUInt16LE(68);
    const dllChars = opt.readUInt16LE(70);
    // Data directory 14 = CLR header → .NET. Offset differs between PE32 and PE32+.
    const ddBase = isPE32Plus ? 112 : 96;
    let isDotNet = false;
    if (opt.length >= ddBase + 15 * 8) {
      const clrRva = opt.readUInt32LE(ddBase + 14 * 8);
      isDotNet = clrRva !== 0;
    }

    // Section table follows the optional header.
    const secOff = peOff + 24 + optSize;
    const secBuf = Buffer.alloc(Math.min(numSections, 32) * 40);
    readSync(fd, secBuf, 0, secBuf.length, secOff);
    const sections = [];
    for (let i = 0; i < Math.min(numSections, 32); i++) {
      const name = secBuf.toString('ascii', i * 40, i * 40 + 8).replace(/\0+$/, '');
      if (name) sections.push(name);
    }

    const pe = {
      machine: PE_MACHINE[machine] || `0x${machine.toString(16)}`,
      bits: isPE32Plus ? 64 : 32,
      subsystem: PE_SUBSYSTEM[subsystem] || `0x${subsystem.toString(16)}`,
      dll: !!(characteristics & 0x2000),
      sections,
      dotnet: isDotNet,
      aslr: !!(dllChars & 0x0040),
      dep: !!(dllChars & 0x0100),
    };

    // Runtime inference from sibling files + section/string hints.
    const dir = path.dirname(filePath);
    const runtime = [];
    if (isDotNet) runtime.push('.NET (managed / CLR)');
    try {
      const sibs = readdirSync(dir);
      if (sibs.some(s => /\.pak$/.test(s)) || sibs.includes('resources') || sibs.some(s => /chrome_\w+\.pak/.test(s))) runtime.push('Electron / Chromium');
      if (sibs.some(s => /^Qt\w*\.dll$/i.test(s))) runtime.push('Qt');
    } catch { /* dir unreadable */ }
    if (!runtime.length) runtime.push(pe.dotnet ? '.NET' : 'native Win32');
    pe.runtime = runtime;
    findings.pe = pe;

    lines.push('## Application Internals (Windows PE)', '');
    lines.push(`- **Machine / architecture:** ${pe.machine} (${pe.bits}-bit)`);
    lines.push(`- **Type:** ${pe.dll ? 'DLL (library)' : 'EXE (executable)'} — subsystem: ${pe.subsystem}`);
    lines.push(`- **Runtime:** ${runtime.join(', ')}`);
    lines.push(`- **Mitigations:** ASLR ${pe.aslr ? 'on' : 'off'}, DEP ${pe.dep ? 'on' : 'off'}`);
    if (sections.length) lines.push(`- **Sections:** ${sections.join(', ')}`);
    lines.push('');

    // Imports + version info from strings (best-effort, avoids a full import-directory walk).
    const big = Buffer.alloc(Math.min(statSync(filePath).size, 2 * 1024 * 1024));
    readSync(fd, big, 0, big.length, 0);
    const ascii = big.toString('latin1');
    const dlls = [...new Set([...ascii.matchAll(/([A-Za-z0-9_.-]+\.dll)/gi)].map(m => m[1]))].slice(0, 30);
    if (dlls.length) {
      findings.pe.importedDlls = dlls;
      lines.push('### Imported DLLs (sampled)', '', '```', ...dlls.slice(0, 25), '```', '');
    }
    // VERSIONINFO strings are stored UTF-16LE; pull a couple of recognizable keys.
    const u16 = big.toString('utf16le');
    const verInfo = {};
    for (const key of ['CompanyName', 'ProductName', 'FileVersion', 'ProductVersion', 'FileDescription']) {
      const m = u16.match(new RegExp(key + '[\\u0000-\\u0001]*([\\x20-\\x7e]{2,60})'));
      if (m) verInfo[key] = m[1].replace(/[ -]+$/, '').trim();
    }
    if (Object.keys(verInfo).length) {
      findings.pe.versionInfo = verInfo;
      lines.push('### Version info', '', ...Object.entries(verInfo).map(([k, v]) => `- **${k}:** ${v}`), '');
    }
  } catch (e) {
    errors.push(`pe: ${e.message}`);
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* ignore */ }
  }
}

// =====================================================================================================
// LINUX ELF — pure-JS header parse
// =====================================================================================================

const ELF_MACHINE = { 0x03: 'x86', 0x3e: 'x86_64', 0x28: 'ARM', 0xb7: 'AArch64 (ARM64)', 0xf3: 'RISC-V' };
const ELF_TYPE = { 1: 'relocatable', 2: 'executable', 3: 'shared object (PIE/.so)', 4: 'core dump' };

function analyzeELF(filePath, findings, lines, errors) {
  findings.kind = 'elf';
  let fd;
  try {
    fd = openSync(filePath, 'r');
    const head = Buffer.alloc(64);
    readSync(fd, head, 0, 64, 0);
    if (head.toString('latin1', 0, 4) !== '\x7fELF') { errors.push('not an ELF'); return; }
    const elfClass = head[4] === 2 ? 64 : 32;
    const type = head.readUInt16LE(16);
    const machine = head.readUInt16LE(18);

    const elf = {
      class: elfClass,
      type: ELF_TYPE[type] || `0x${type.toString(16)}`,
      machine: ELF_MACHINE[machine] || `0x${machine.toString(16)}`,
    };

    // Pull strings from a large prefix to recover NEEDED libs, interpreter, and runtime hints.
    const big = Buffer.alloc(Math.min(statSync(filePath).size, 3 * 1024 * 1024));
    readSync(fd, big, 0, big.length, 0);
    const s = big.toString('latin1');
    const interpM = s.match(/(\/lib(?:64)?\/ld-[a-z0-9.\-]+\.so[0-9.]*)/i) || s.match(/(\/lib(?:64)?\/ld[a-z0-9.\-]*)/i);
    if (interpM) elf.interpreter = interpM[1];
    const needed = [...new Set([...s.matchAll(/\b(lib[a-z0-9_+\-]+\.so(?:\.[0-9]+)*)\b/gi)].map(m => m[1]))].slice(0, 30);
    elf.needed = needed;

    const runtime = [];
    if (/electron|chrome_crashpad|libffmpeg\.so/i.test(s)) runtime.push('Electron / Chromium');
    if (needed.some(n => /libQt|libqt/i.test(n)) || /Qt_\d/i.test(s)) runtime.push('Qt');
    if (/go\.buildid|runtime\.goexit|Go build ID/i.test(s)) runtime.push('Go');
    if (/rustc|__rust_|cargo/i.test(s)) runtime.push('Rust');
    if (/glibc|GLIBC_/i.test(s) && !runtime.length) runtime.push('native (glibc)');
    elf.runtime = runtime;
    findings.elf = elf;

    lines.push('## Application Internals (Linux ELF)', '');
    lines.push(`- **Class / architecture:** ELF${elf.class}, ${elf.machine}`);
    lines.push(`- **Type:** ${elf.type}`);
    if (elf.interpreter) lines.push(`- **Interpreter (PT_INTERP):** \`${elf.interpreter}\``);
    if (runtime.length) lines.push(`- **Runtime:** ${runtime.join(', ')}`);
    lines.push('');
    if (needed.length) lines.push('### Linked libraries (sampled)', '', '```', ...needed.slice(0, 25), '```', '');
  } catch (e) {
    errors.push(`elf: ${e.message}`);
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* ignore */ }
  }
}

// Sniff a file's binary kind from its first bytes (for the non-macOS / raw-binary path).
function sniffKind(filePath) {
  try {
    const fd = openSync(filePath, 'r');
    const b = Buffer.alloc(4);
    readSync(fd, b, 0, 4, 0);
    closeSync(fd);
    if (b[0] === 0x4d && b[1] === 0x5a) return 'pe';                    // MZ
    if (b.toString('latin1', 0, 4) === '\x7fELF') return 'elf';        // ELF
  } catch { /* unreadable */ }
  return 'unknown';
}

// =====================================================================================================
// PUBLIC ENTRY
// =====================================================================================================

export async function appDeepDive(appPath, platform = process.platform) {
  const lines = [];
  const findings = {};
  const errors = [];
  try {
    if (!appPath || !existsSync(appPath)) {
      return { lines: [], findings: {} };
    }
    findings.platform = platform;

    if (platform === 'darwin' && (appPath.endsWith('.app') || existsSync(path.join(appPath, 'Contents')))) {
      analyzeMacApp(appPath, findings, lines, errors);
    } else {
      // Non-bundle path: identify the binary format and parse accordingly.
      let target = appPath;
      // If handed a macOS bundle on a non-mac platform, point at its executable if we can.
      const kind = sniffKind(target);
      if (kind === 'pe') analyzePE(target, findings, lines, errors);
      else if (kind === 'elf') analyzeELF(target, findings, lines, errors);
      else {
        findings.kind = 'unknown';
        lines.push('## Application Internals', '', `- Could not classify \`${path.basename(target)}\` as a known binary format (not Mach-O bundle, PE, or ELF).`, '');
      }
    }

    if (errors.length) findings.errors = errors;
    // A short footer noting any non-fatal gaps keeps the report honest without alarming the reader.
    if (errors.length) {
      lines.push('### Analysis notes', '');
      lines.push(...errors.slice(0, 10).map(e => `- ${e}`), '');
    }
    return { lines, findings };
  } catch (e) {
    // Total failure — never throw.
    return { lines: [], findings: {} };
  }
}

// ---- inline smoke test: `node reverse-app-deep.mjs [appPath]` ----
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] || '/Applications/Obsidian.app';
  (async () => {
    console.error(`\n=== appDeepDive("${target}") ===\n`);
    const { lines, findings } = await appDeepDive(target);
    console.log(lines.join('\n'));
    console.error('\n=== findings ===');
    console.error(JSON.stringify(findings, (k, v) => (k === 'dependencies' || k === 'devDependencies') && v && Object.keys(v).length > 6
      ? `{${Object.keys(v).length} entries}` : v, 2));
    console.error('\n=== non-existent path (must not throw) ===');
    const bad = await appDeepDive('/Applications/__nope__.app');
    console.error(JSON.stringify(bad));
  })();
}
