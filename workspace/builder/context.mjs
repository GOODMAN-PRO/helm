import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';


function safeKey(key) {
  return String(key)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'artifact';
}


function ts() {
  return new Date().toISOString();
}


export function createContext({ brief, stack, projectDir }) {
  const buildDir      = path.join(projectDir, '.helm-build');
  const artifactsDir  = path.join(buildDir, 'artifacts');
  const stateFile     = path.join(buildDir, 'state.json');
  const logFile       = path.join(buildDir, 'build.log');


  try { mkdirSync(artifactsDir, { recursive: true }); } catch {  }


  let state = {};
  try {
    const raw = readFileSync(stateFile, 'utf8');
    state = JSON.parse(raw);
  } catch {  }



  function artifactPath(key) {
    return path.join(artifactsDir, `${safeKey(key)}.md`);
  }

  function getArtifact(key) {
    try { return readFileSync(artifactPath(key), 'utf8'); }
    catch { return null; }
  }

  function setArtifact(key, content) {
    try { writeFileSync(artifactPath(key), String(content), 'utf8'); }
    catch {  }
  }

  function listArtifacts() {
    try {
      return readdirSync(artifactsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.slice(0, -3));
    } catch { return []; }
  }


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




  function log(msg) {
    const line = `[${ts()}] ${msg}\n`;
    try { writeFileSync(logFile, line, { flag: 'a', encoding: 'utf8' }); } catch {  }
    console.error(line.trimEnd());
  }




  function saveState() {
    try { writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8'); }
    catch {  }
  }



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
    state,
    saveState,
  };

  return ctx;
}




if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tmpBase   = path.join(os.tmpdir(), `helm-ctx-test-${Date.now()}`);
  const projectDir = tmpBase;

  const ctx = createContext({ brief: 'test brief', stack: { id: 'mock' }, projectDir });

  let ok = true;
  function assert(cond, label) {
    if (!cond) { console.error(`FAIL: ${label}`); ok = false; }
  }


  assert(existsSync(ctx.buildDir),               'buildDir exists');
  assert(existsSync(path.join(ctx.buildDir, 'artifacts')), 'artifacts dir exists');


  ctx.setArtifact('prd', '# PRD\nFoo bar baz.');
  assert(ctx.getArtifact('prd') === '# PRD\nFoo bar baz.', 'getArtifact round-trips');


  assert(ctx.listArtifacts().includes('prd'),    'listArtifacts contains prd');


  assert(ctx.getArtifact('nonexistent') === null, 'missing artifact → null');


  const digest = ctx.artifactsDigest();
  assert(digest.includes('## prd'),              'digest contains ## prd');
  assert(digest.includes('Foo bar baz'),         'digest contains artifact content');


  ctx.setArtifact('big', 'x'.repeat(500));
  const short = ctx.artifactsDigest(50);
  assert(short.length <= 50,                     'digest honours maxChars');


  ctx.log('hello from self-test');
  const logContents = readFileSync(path.join(ctx.buildDir, 'build.log'), 'utf8');
  assert(logContents.includes('hello from self-test'), 'log writes to build.log');


  ctx.state.version = 42;
  ctx.saveState();

  const raw = JSON.parse(readFileSync(path.join(ctx.buildDir, 'state.json'), 'utf8'));
  assert(raw.version === 42,                     'saveState persists state.version');


  const ctx2 = createContext({ brief: 'test brief', stack: { id: 'mock' }, projectDir });
  assert(ctx2.state.version === 42,              'createContext reloads persisted state');


  const sampleFile = path.join(projectDir, 'hello.txt');
  writeFileSync(sampleFile, 'world', 'utf8');
  assert(ctx.readFile('hello.txt') === 'world',  'readFile reads relative to projectDir');
  assert(ctx.readFile('no-such.txt') === null,   'readFile missing → null');


  try {
    const { rmSync } = await import('node:fs');
    rmSync(tmpBase, { recursive: true, force: true });
  } catch {  }

  if (ok) {
    console.log('OK');
    process.exit(0);
  } else {
    process.exit(1);
  }
}
