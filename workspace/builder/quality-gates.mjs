import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { animationGate } from './quality/animation-gate.mjs';





const MAX_FINDINGS   = 200;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILES      = 2000;


const SKIP_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', '.git', '.helm-build',
  '.turbo', '.vercel', 'out', '.output', '.nuxt', '.svelte-kit',
]);


const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.astro', '.vue']);


const MARKUP_EXTS = new Set([...SOURCE_EXTS, '.html', '.htm', '.svelte']);







function* walkFiles(dir, exts) {
  const stack = [dir];
  let count = 0;
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); }
    catch { continue; }

    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(full);
        continue;
      }
      if (!e.isFile()) continue;
      if (exts && !exts.has(path.extname(e.name).toLowerCase())) continue;
      if (++count > MAX_FILES) return;
      yield full;
    }
  }
}


function safeRead(filePath) {
  try {
    const st = statSync(filePath);
    if (st.size > MAX_FILE_BYTES) return null;
    return readFileSync(filePath, 'utf8');
  } catch { return null; }
}








const LINE_PATTERNS = [
  {
    kind: 'todo-comment',
    critical: true,

    regex: /\b(TODO|FIXME)\b/i,
  },
  {
    kind: 'not-implemented',
    critical: true,
    regex: /not\s+implemented/i,
  },
  {
    kind: 'throw-stub',
    critical: true,

    regex: /throw\s+new\s+Error\s*\(\s*['"`][^'"`]*?(not\s+implemented|todo|stub)[^'"`]*?['"`]/i,
  },
  {
    kind: 'lorem-ipsum',
    critical: false,
    regex: /lorem\s+ipsum/i,
  },
  {
    kind: 'placeholder-url',
    critical: false,

    regex: /\b(example\.com|your[-_]?domain|lipsum\.com)\b/i,
  },
  {
    kind: 'empty-handler',
    critical: false,


    regex: /(?:handler|route|middleware|callback|controller|resolver|action)\s*[:=,\(][^;{]*=>\s*\{[\s]*\}/i,
  },
  {
    kind: 'console-log',
    critical: false,
    regex: /console\.log\s*\(/,
  },
];






export function scanForStubs(projectDir) {
  const findings = [];
  let criticalFound = false;

  try {
    for (const filePath of walkFiles(projectDir, SOURCE_EXTS)) {
      if (findings.length >= MAX_FINDINGS) break;

      const content = safeRead(filePath);
      if (content === null) continue;

      const lines = content.split('\n');
      const rel   = path.relative(projectDir, filePath);

      for (let i = 0; i < lines.length; i++) {
        if (findings.length >= MAX_FINDINGS) break;
        const line = lines[i];

        for (const pat of LINE_PATTERNS) {
          if (pat.regex.test(line)) {
            if (pat.critical) criticalFound = true;
            findings.push({
              file:    rel,
              line:    i + 1,
              kind:    pat.kind,

              excerpt: line.trim().slice(0, 120),
            });

            break;
          }
        }
      }
    }
  } catch {

  }

  return { ok: !criticalFound, findings };
}






function gateNoStubs(projectDir) {
  const result = scanForStubs(projectDir);
  const criticalCount = result.findings.filter(f =>
    ['todo-comment', 'not-implemented', 'throw-stub'].includes(f.kind)
  ).length;
  const advisoryCount = result.findings.length - criticalCount;
  return {
    name: 'no-stubs',
    ok: result.ok,
    details: result.ok
      ? `No stub/placeholder patterns found (${result.findings.length} advisory).`
      : `${criticalCount} critical stub(s) found (${advisoryCount} advisory). ` +
        result.findings
          .filter(f => ['todo-comment','not-implemented','throw-stub'].includes(f.kind))
          .slice(0, 5)
          .map(f => `${f.file}:${f.line} [${f.kind}]`)
          .join(', '),
    findings: result.findings,
  };
}



function gateSecretsSafe(projectDir) {
  const issues = [];


  const gitignorePath = path.join(projectDir, '.gitignore');
  if (!existsSync(gitignorePath)) {
    issues.push('.gitignore missing');
  } else {
    const gi = safeRead(gitignorePath) || '';
    // Accept bare `.env`, `.env*`, `*.env`, `.env.local`, etc.
    const ignoresEnv = /^\s*\.?env[^\n]*/m.test(gi) ||
                       /^\s*\*\.env\b/m.test(gi) ||
                       /^\s*\.env\b/m.test(gi) ||
                       /^\s*\.env\*/m.test(gi);
    if (!ignoresEnv) issues.push('.gitignore does not ignore .env');
  }




  const secretPattern = /(?:API_KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL|DB_PASS)\s*=\s*["']?[A-Za-z0-9+/=_\-.]{8,}/i;
  for (const envFile of ['.env', '.env.local', '.env.production']) {
    const p = path.join(projectDir, envFile);
    if (!existsSync(p)) continue;
    const content = safeRead(p) || '';
    if (secretPattern.test(content)) {
      issues.push(`${envFile} found with apparent secrets (should not be committed)`);
    }
  }

  const ok = issues.length === 0;
  return {
    name: 'secrets-safe',
    ok,
    details: ok ? '.gitignore present and ignores .env; no committed secret files detected.'
                : issues.join('; '),
  };
}

// Gate: a11y-basics
// Scans JSX/HTML for: <img> without alt, <html> without lang, icon-only <button> without aria-label.
function gateA11yBasics(projectDir) {
  let imgNoAlt = 0;
  let htmlNoLang = 0;
  let buttonNoLabel = 0;

  try {
    for (const filePath of walkFiles(projectDir, MARKUP_EXTS)) {
      const content = safeRead(filePath);
      if (!content) continue;

      // <img> tags without alt attribute
      // Match <img ...> (not self-closing forced) that doesn't contain alt=
      const imgMatches = content.match(/<img\b[^>]*>/gi) || [];
      for (const tag of imgMatches) {
        if (!/\balt\s*=/i.test(tag)) imgNoAlt++;
      }

      // <html> tags without lang attribute
      const htmlMatches = content.match(/<html\b[^>]*>/gi) || [];
      for (const tag of htmlMatches) {
        if (!/\blang\s*=/i.test(tag)) htmlNoLang++;
      }

      // <button> tags that look icon-only (no visible text, no aria-label, no aria-labelledby)
      // Heuristic: button contains only whitespace or an SVG/icon element and no label attribute
      const buttonMatches = content.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) || [];
      for (const tag of buttonMatches) {
        const hasLabel = /\baria-label\s*=/i.test(tag) ||
                         /\baria-labelledby\s*=/i.test(tag) ||
                         /\btitle\s*=/i.test(tag);
        if (hasLabel) continue;
        // Strip tags from content to check for text
        const inner = tag.replace(/<[^>]+>/g, '').trim();
        if (!inner) buttonNoLabel++; // Empty inner text without any label
      }
    }
  } catch { /* silent */ }

  const ok = imgNoAlt === 0 && htmlNoLang === 0 && buttonNoLabel === 0;
  const details = ok
    ? 'No a11y issues detected (alt, lang, button labels).'
    : [
        imgNoAlt     ? `${imgNoAlt} <img> missing alt`        : null,
        htmlNoLang   ? `${htmlNoLang} <html> missing lang`    : null,
        buttonNoLabel? `${buttonNoLabel} icon <button> without aria-label` : null,
      ].filter(Boolean).join('; ');

  return { name: 'a11y-basics', ok, details };
}

// Gate: seo-basics (advisory)
// Checks layout/head files for <title>, meta description, and Open Graph tags.
function gateSeoBasics(projectDir) {
  // Look in files that typically contain the site-wide <head>
  const headCandidates = [
    'src/app/layout.tsx', 'src/app/layout.jsx', 'src/app/layout.js',
    'app/layout.tsx',     'app/layout.jsx',     'app/layout.js',
    'src/pages/_document.tsx', 'src/pages/_document.jsx', 'pages/_document.tsx',
    'src/pages/_app.tsx',      'src/pages/_app.jsx',      'pages/_app.tsx',
    'index.html', 'src/index.html', 'public/index.html',
    'src/layouts/default.astro', 'src/layouts/Layout.astro', 'src/layouts/base.astro',
  ];

  let titleFound = false;
  let descFound  = false;
  let ogFound    = false;
  let checked    = 0;

  for (const rel of headCandidates) {
    const p = path.join(projectDir, rel);
    if (!existsSync(p)) continue;
    const content = safeRead(p) || '';
    checked++;
    if (/<title[\s>]/i.test(content) || /metadata.*title/i.test(content) || /title:\s*['"`]/.test(content)) titleFound = true;
    if (/meta[^>]*name=["']description["']/i.test(content) || /description:\s*['"`]/.test(content)) descFound = true;
    if (/meta[^>]*property=["']og:/i.test(content) || /openGraph/i.test(content)) ogFound = true;
  }

  if (checked === 0) {
    // No recognizable layout file — advisory pass (may be an API-only project)
    return { name: 'seo-basics', ok: true, details: 'No layout/head file found — SEO check skipped (advisory).' };
  }

  const missing = [
    !titleFound ? 'title' : null,
    !descFound  ? 'meta description' : null,
    !ogFound    ? 'Open Graph tags' : null,
  ].filter(Boolean);

  const ok = missing.length === 0;
  return {
    name: 'seo-basics',
    ok,
    details: ok
      ? 'Title, meta description, and Open Graph tags present.'
      : `Missing SEO elements: ${missing.join(', ')} (advisory).`,
  };
}

// Gate: deps-sane
// Verifies package.json is parseable and has scripts.build.
function gateDeplsSane(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) {
    return { name: 'deps-sane', ok: false, details: 'package.json not found.' };
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    return { name: 'deps-sane', ok: false, details: `package.json parse error: ${err.message}` };
  }

  const issues = [];
  if (!pkg.scripts?.build) issues.push('scripts.build is missing');

  // Warn on obviously suspicious deps (not blocking, advisory)
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const depCount = Object.keys(allDeps).length;

  const ok = issues.length === 0;
  return {
    name: 'deps-sane',
    ok,
    details: ok
      ? `package.json valid; scripts.build present; ${depCount} dependencies.`
      : issues.join('; '),
  };
}

// ---------------------------------------------------------------------------
// export: runQualityGates
// ---------------------------------------------------------------------------

/**
 * Run all static quality gates over a generated project.
 * @param {string} projectDir
 * @param {object} [ctx] — BuildContext (optional; tolerated if undefined)
 * @returns {Promise<{ ok: boolean, gates: Array<{name,ok,details}> }>}
 *   ok = false only when a CRITICAL gate fails (currently: no-stubs).
 *   Other gates are advisory.
 */
export async function runQualityGates(projectDir, ctx) {
  const gates = [];

  try {
    // Critical gate
    gates.push(gateNoStubs(projectDir));

    // Advisory gates
    gates.push(gateSecretsSafe(projectDir));
    gates.push(gateA11yBasics(projectDir));
    gates.push(gateSeoBasics(projectDir));
    gates.push(gateDeplsSane(projectDir));
    try { gates.push(animationGate(projectDir)); } catch { /* gate is best-effort */ }
  } catch (err) {
    // Defensive: if something above throws despite guards, surface it as a gate entry
    gates.push({
      name: 'internal-error',
      ok: false,
      details: `runQualityGates internal error: ${err?.message ?? String(err)}`,
    });
  }

  // Only no-stubs is critical — other failures are advisory
  const criticalGate = gates.find(g => g.name === 'no-stubs');
  const ok = criticalGate ? criticalGate.ok : true;

  // Optionally log to ctx if present
  try {
    if (ctx && typeof ctx.log === 'function') {
      const summary = gates.map(g => `${g.name}: ${g.ok ? 'PASS' : 'FAIL'}`).join(', ');
      ctx.log(`[quality-gates] ${summary}`);
    }
  } catch { /* ctx.log errors are silent */ }

  return { ok, gates };
}

// ---------------------------------------------------------------------------
// Self-test (only runs when executed directly)
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { mkdtempSync } = await import('node:fs');
  const os = await import('node:os');

  let pass = true;
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'quality-gates-test-'));

  function assert(condition, msg) {
    if (!condition) {
      console.error(`  FAIL: ${msg}`);
      pass = false;
    } else {
      console.log(`  PASS: ${msg}`);
    }
  }

  try {
    // --- Set up temp project ---
    // File with a TODO (critical) and a console.log (advisory)
    writeFileSync(path.join(tmpDir, 'dirty.ts'), [
      'export function doThing() {',
      '  // TODO: implement this properly',
      '  console.log("debug");',
      '}',
    ].join('\n'));


    writeFileSync(path.join(tmpDir, 'clean.ts'), [
      'export function cleanFn(x: number): number {',
      '  return x * 2;',
      '}',
    ].join('\n'));


    writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      scripts: { build: 'tsc', dev: 'next dev' },
      dependencies: { react: '^18' },
    }, null, 2));


    writeFileSync(path.join(tmpDir, '.gitignore'), '.env\n.env.local\nnode_modules/\n');


    const scan = scanForStubs(tmpDir);
    assert(typeof scan.ok === 'boolean', 'scanForStubs returns ok boolean');
    assert(Array.isArray(scan.findings), 'scanForStubs returns findings array');
    assert(!scan.ok, 'scanForStubs.ok is false when TODO found');
    assert(scan.findings.length >= 1, 'scanForStubs finds at least 1 issue');

    const todoFinding = scan.findings.find(f => f.kind === 'todo-comment');
    assert(!!todoFinding, 'todo-comment finding exists');
    assert(todoFinding.file === 'dirty.ts', `finding points to dirty.ts (got ${todoFinding?.file})`);
    assert(todoFinding.line === 2, `finding is on line 2 (got ${todoFinding?.line})`);
    assert(typeof todoFinding.excerpt === 'string', 'finding has excerpt string');


    const cleanDir = mkdtempSync(path.join(os.tmpdir(), 'quality-gates-clean-'));
    writeFileSync(path.join(cleanDir, 'clean.ts'), 'export const x = 1;\n');
    const cleanScan = scanForStubs(cleanDir);
    assert(cleanScan.ok === true, 'cleanScan.ok is true for clean project');
    assert(cleanScan.findings.length === 0, 'clean project has 0 findings');
    rmSync(cleanDir, { recursive: true, force: true });


    const gates = await runQualityGates(tmpDir);
    assert(typeof gates.ok === 'boolean', 'runQualityGates returns ok boolean');
    assert(Array.isArray(gates.gates), 'runQualityGates returns gates array');
    assert(gates.gates.length >= 5, `at least 5 gates (got ${gates.gates.length})`);
    assert(!gates.ok, 'runQualityGates.ok is false (critical no-stubs fails)');

    for (const g of gates.gates) {
      assert(typeof g.name === 'string',    `gate "${g.name}" has name string`);
      assert(typeof g.ok === 'boolean',     `gate "${g.name}" has ok boolean`);
      assert(typeof g.details === 'string', `gate "${g.name}" has details string`);
    }

    const noStubsGate = gates.gates.find(g => g.name === 'no-stubs');
    assert(!!noStubsGate, 'no-stubs gate present');
    assert(!noStubsGate.ok, 'no-stubs gate fails');

    const depsSaneGate = gates.gates.find(g => g.name === 'deps-sane');
    assert(!!depsSaneGate, 'deps-sane gate present');
    assert(depsSaneGate.ok, 'deps-sane gate passes (package.json has scripts.build)');

    const secretsGate = gates.gates.find(g => g.name === 'secrets-safe');
    assert(!!secretsGate, 'secrets-safe gate present');
    assert(secretsGate.ok, 'secrets-safe gate passes (.gitignore ignores .env)');


    const gatesNoCtx = await runQualityGates(tmpDir, undefined);
    assert(typeof gatesNoCtx.ok === 'boolean', 'runQualityGates tolerates undefined ctx');


    const gatesMissing = await runQualityGates('/tmp/helm-qg-nonexistent-9999xyz');
    assert(typeof gatesMissing.ok === 'boolean', 'runQualityGates handles missing dir');
    assert(Array.isArray(gatesMissing.gates), 'runQualityGates handles missing dir (gates array)');

  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {  }
  }

  console.log(`\n${pass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  process.exitCode = pass ? 0 : 1;
}
