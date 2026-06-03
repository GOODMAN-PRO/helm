// context.mjs — shared BuildContext for the multi-agent full-stack builder.
// All library methods are defensive (never throw). Artifacts persist as Markdown under
// buildDir/artifacts/<key>.md; state persists to buildDir/state.json.
//
// Contract: §2 of CONTRACT.md — keep signatures in sync with that document.

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

// Sanitize an artifact key into a safe filename component (no path traversal, no spaces).
function safeKey(key) {
  return String(key)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'artifact';
}

// ISO timestamp suitable for log lines (no external deps).
function ts() {
  return new Date().toISOString();
}

/**
 * createContext({ brief, stack, projectDir }) -> ctx
 *
 * Creates (mkdir -p) buildDir and its artifacts sub-directory, then returns the
 * ctx object described in CONTRACT.md §2.
 */
export function createContext({ brief, stack, projectDir }) {
  const buildDir      = path.join(projectDir, '.helm-build');
  const artifactsDir  = path.join(buildDir, 'artifacts');
  const stateFile     = path.join(buildDir, 'state.json');
  const logFile       = path.join(buildDir, 'build.log');

  // Ensure directories exist — never throw.
  try { mkdirSync(artifactsDir, { recursive: true }); } catch { /* already exists or unwritable */ }

  // Load persisted state if present; start empty otherwise.
  let state = {};
  try {
    const raw = readFileSync(stateFile, 'utf8');
    state = JSON.parse(raw);
  } catch { /* first run or corrupt — start fresh */ }

  // ── artifact helpers ──────────────────────────────────────────────────────

  function artifactPath(key) {
    return path.join(artifactsDir, `${safeKey(key)}.md`);
  }

  function getArtifact(key) {
    try { return readFileSync(artifactPath(key), 'utf8'); }
    catch { return null; }
  }

  function setArtifact(key, content) {
    try { writeFileSync(artifactPath(key), String(content), 'utf8'); }
    catch { /* unwritable — silently skip */ }
  }

  function listArtifacts() {
    try {
      return readdirSync(artifactsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.slice(0, -3));           // strip .md to recover the safe key name
    } catch { return []; }
  }

  /**
   * artifactsDigest(maxChars = 8000) — concatenate "## <key>\n<content>\n\n" for every
   * artifact, then hard-truncate to maxChars so it fits in a prompt budget.
   */
  function artifactsDigest(maxChars = 8000) {
    const keys = listArtifacts();
    if (!keys.length) return '';

    let digest = '';
    for (const key of keys) {
      const content = getArtifact(key) ?? '';
      const chunk   = `## ${key}\n${content}\n\n`;
      if (digest.length + chunk.length > maxChars) {
        // Append as much as fits, then stop.
        const remaining = maxChars - digest.length;
        if (remaining > 0) digest += chunk.slice(0, remaining);
        break;
      }
      digest += chunk;
    }
    return digest;
  }

  // ── file reader ───────────────────────────────────────────────────────────

  /** readFile(rel) — read a file relative to projectDir; returns null on any error. */
  function readFile(rel) {
    try { return readFileSync(path.join(projectDir, rel), 'utf8'); }
    catch { return null; }
  }

  // ── logger ────────────────────────────────────────────────────────────────

  /** log(msg) — append a timestamped line to buildDir/build.log AND console.error. */
  function log(msg) {
    const line = `[${ts()}] ${msg}\n`;
    try { writeFileSync(logFile, line, { flag: 'a', encoding: 'utf8' }); } catch { /* disk full / perms */ }
    console.error(line.trimEnd());
  }

  // ── state persistence ─────────────────────────────────────────────────────

  /** saveState() — flush ctx.state to buildDir/state.json. Never throws. */
  function saveState() {
    try { writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8'); }
    catch { /* unwritable */ }
  }

  // ── assemble ctx ──────────────────────────────────────────────────────────

  const ctx = {
    brief,
    stack,
    projectDir,
    buildDir,
    getArtifact,
    setArtifact,
    listArtifacts,
    artifactsDigest,
    readFile,
    log,
    state,          // free-form object; caller mutates in-place, then calls saveState()
    saveState,
  };

  return ctx;
}

// ── self-test ─────────────────────────────────────────────────────────────────
// Run: node workspace/builder/context.mjs
// Guards against real production side-effects by using a temp directory.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tmpBase   = path.join(os.tmpdir(), `helm-ctx-test-${Date.now()}`);
  const projectDir = tmpBase;

  const ctx = createContext({ brief: 'test brief', stack: { id: 'mock' }, projectDir });

  let ok = true;
  function assert(cond, label) {
    if (!cond) { console.error(`FAIL: ${label}`); ok = false; }
  }

  // 1. buildDir created
  assert(existsSync(ctx.buildDir),               'buildDir exists');
  assert(existsSync(path.join(ctx.buildDir, 'artifacts')), 'artifacts dir exists');

  // 2. setArtifact / getArtifact round-trip
  ctx.setArtifact('prd', '# PRD\nFoo bar baz.');
  assert(ctx.getArtifact('prd') === '# PRD\nFoo bar baz.', 'getArtifact round-trips');

  // 3. listArtifacts sees the key
  assert(ctx.listArtifacts().includes('prd'),    'listArtifacts contains prd');

  // 4. getArtifact on missing key returns null
  assert(ctx.getArtifact('nonexistent') === null, 'missing artifact → null');

  // 5. artifactsDigest contains the key heading
  const digest = ctx.artifactsDigest();
  assert(digest.includes('## prd'),              'digest contains ## prd');
  assert(digest.includes('Foo bar baz'),         'digest contains artifact content');

  // 6. artifactsDigest respects maxChars
  ctx.setArtifact('big', 'x'.repeat(500));
  const short = ctx.artifactsDigest(50);
  assert(short.length <= 50,                     'digest honours maxChars');

  // 7. log writes to build.log
  ctx.log('hello from self-test');
  const logContents = readFileSync(path.join(ctx.buildDir, 'build.log'), 'utf8');
  assert(logContents.includes('hello from self-test'), 'log writes to build.log');

  // 8. state + saveState persistence
  ctx.state.version = 42;
  ctx.saveState();
  // Read state.json back raw to confirm persistence
  const raw = JSON.parse(readFileSync(path.join(ctx.buildDir, 'state.json'), 'utf8'));
  assert(raw.version === 42,                     'saveState persists state.version');

  // 9. createContext reloads persisted state
  const ctx2 = createContext({ brief: 'test brief', stack: { id: 'mock' }, projectDir });
  assert(ctx2.state.version === 42,              'createContext reloads persisted state');

  // 10. readFile reads relative to projectDir
  const sampleFile = path.join(projectDir, 'hello.txt');
  writeFileSync(sampleFile, 'world', 'utf8');
  assert(ctx.readFile('hello.txt') === 'world',  'readFile reads relative to projectDir');
  assert(ctx.readFile('no-such.txt') === null,   'readFile missing → null');

  // Clean up
  try {
    const { rmSync } = await import('node:fs');
    rmSync(tmpBase, { recursive: true, force: true });
  } catch { /* ignore cleanup failures */ }

  if (ok) {
    console.log('OK');
    process.exit(0);
  } else {
    process.exit(1);
  }
}
