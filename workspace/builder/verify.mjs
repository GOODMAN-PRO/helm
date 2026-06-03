// verify.mjs — verifies a generated project installs, type-checks, lints, builds, and tests.
// Only uses: node:fs, node:path, node:child_process, node:os, node:url.
// Never throws — all errors are caught and returned as structured step results.

import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Truncate combined output to last ~N chars — keeps the most relevant tail (errors) without
// blowing up the result object with megabytes of install logs.
const TAIL_CHARS = 3000;
function tail(s) {
  if (!s) return '';
  if (s.length <= TAIL_CHARS) return s;
  return '…[truncated]\n' + s.slice(-TAIL_CHARS);
}

// Detect package manager from lockfiles present in projectDir.
// Priority: pnpm > yarn > bun > npm (npm has no lockfile requirement).
function detectPm(projectDir) {
  if (existsSync(join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectDir, 'yarn.lock')))      return 'yarn';
  if (existsSync(join(projectDir, 'bun.lockb')))      return 'bun';
  return 'npm';
}

// Read and parse package.json — returns {} on any error (defensive).
function readPkg(projectDir) {
  try {
    return JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

// Run a single verification step via spawnSync. Returns a step result object.
// shell:true is needed on macOS/Linux so npx and script aliases resolve correctly.
function runStep(name, cmd, args, projectDir, timeoutMs) {
  const start = Date.now();
  let result;
  try {
    result = spawnSync(cmd, args, {
      cwd: projectDir,
      shell: true,
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,   // 20 MB — large installs can be chatty
      encoding: 'utf8',
      // combine stderr into stdout so the tail contains both
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    // spawnSync itself can throw (e.g. ENOMEM) — capture as failed step
    return {
      name,
      ok: false,
      output: tail(String(err)),
      durationMs: Date.now() - start,
    };
  }
  const combined = (result.stdout || '') + (result.stderr || '');
  const timedOut = result.signal === 'SIGTERM' || result.error?.code === 'ETIMEDOUT';
  const ok = result.status === 0 && !timedOut;
  return {
    name,
    ok,
    output: tail(combined + (timedOut ? '\n[TIMED OUT]' : '')),
    durationMs: Date.now() - start,
  };
}

/**
 * Verify a generated project by running install → typecheck → lint → build → test.
 * Steps that don't apply are omitted (never skipped:true unless opted in via opts).
 *
 * @param {string} projectDir  Absolute path to the project root.
 * @param {object} opts        Reserved for future use (e.g. { skipInstall, skipLint }).
 * @returns {{ ok, steps, summary, pm }}
 */
export async function verifyProject(projectDir, opts = {}) {
  // Guard: no package.json → bail early with a clear signal
  if (!existsSync(join(projectDir, 'package.json'))) {
    return { ok: false, steps: [], summary: 'no project (package.json missing)', pm: null };
  }

  const pkg = readPkg(projectDir);
  if (!pkg) {
    return { ok: false, steps: [], summary: 'no project (package.json unreadable)', pm: null };
  }

  const pm     = detectPm(projectDir);
  const scripts = pkg.scripts || {};
  const deps    = { ...( pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  const steps = [];

  // ── 1. Install ──────────────────────────────────────────────────────────────
  // Always run — ensures the project is in a known installed state before any
  // subsequent step. bun/pnpm/yarn/npm all support a bare `install` subcommand.
  try {
    steps.push(runStep('install', pm, ['install'], projectDir, 300_000));
  } catch (err) {
    steps.push({ name: 'install', ok: false, output: String(err), durationMs: 0 });
  }

  // ── 2. Typecheck ─────────────────────────────────────────────────────────────
  // Prefer a "typecheck" script; fall back to `npx tsc --noEmit` if tsconfig.json
  // exists. Skip entirely if there's no TypeScript config and no script.
  const hasTsConfig = existsSync(join(projectDir, 'tsconfig.json'));
  if (scripts['typecheck']) {
    try {
      steps.push(runStep('typecheck', pm, ['run', 'typecheck'], projectDir, 120_000));
    } catch (err) {
      steps.push({ name: 'typecheck', ok: false, output: String(err), durationMs: 0 });
    }
  } else if (hasTsConfig) {
    try {
      steps.push(runStep('typecheck', 'npx', ['tsc', '--noEmit'], projectDir, 120_000));
    } catch (err) {
      steps.push({ name: 'typecheck', ok: false, output: String(err), durationMs: 0 });
    }
  }

  // ── 3. Lint ──────────────────────────────────────────────────────────────────
  // Only if the project declares a lint script.
  if (scripts['lint']) {
    try {
      steps.push(runStep('lint', pm, ['run', 'lint'], projectDir, 120_000));
    } catch (err) {
      steps.push({ name: 'lint', ok: false, output: String(err), durationMs: 0 });
    }
  }

  // ── 4. Build ─────────────────────────────────────────────────────────────────
  // Only if the project declares a build script. Build is the primary success signal.
  if (scripts['build']) {
    try {
      steps.push(runStep('build', pm, ['run', 'build'], projectDir, 300_000));
    } catch (err) {
      steps.push({ name: 'build', ok: false, output: String(err), durationMs: 0 });
    }
  }

  // ── 5. Test ───────────────────────────────────────────────────────────────────
  // Prefer a "test" script; fall back to `npx vitest run` if vitest is a dep.
  const hasVitest = 'vitest' in deps;
  if (scripts['test']) {
    try {
      steps.push(runStep('test', pm, ['run', 'test'], projectDir, 120_000));
    } catch (err) {
      steps.push({ name: 'test', ok: false, output: String(err), durationMs: 0 });
    }
  } else if (hasVitest) {
    try {
      steps.push(runStep('test', 'npx', ['vitest', 'run'], projectDir, 120_000));
    } catch (err) {
      steps.push({ name: 'test', ok: false, output: String(err), durationMs: 0 });
    }
  }

  // ── Overall ok ───────────────────────────────────────────────────────────────
  // ok = build passed (if it ran) AND typecheck passed (if it ran).
  // If neither ran, ok = all steps passed (install-only scenario).
  const buildStep     = steps.find(s => s.name === 'build');
  const typecheckStep = steps.find(s => s.name === 'typecheck');

  let ok;
  if (buildStep) {
    ok = buildStep.ok && (typecheckStep ? typecheckStep.ok : true);
  } else {
    // No build script — ok only if every step that ran passed.
    ok = steps.every(s => s.ok);
  }

  const failed = steps.filter(s => !s.ok).map(s => s.name);
  const summary = ok
    ? `all checks passed (${steps.map(s => s.name).join(', ')})`
    : `failed: ${failed.join(', ')}`;

  return { ok, steps, summary, pm };
}

// ── Self-test ─────────────────────────────────────────────────────────────────
// Runs when executed directly: `node verify.mjs`
// Creates a minimal temp project with a trivial passing build script, verifies it,
// then verifies a non-existent dir returns the no-project shape. Cleans up on exit.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let tmpDir;
  let allPassed = true;

  function assert(cond, msg) {
    if (!cond) {
      console.error(`  FAIL: ${msg}`);
      allPassed = false;
    } else {
      console.log(`  pass: ${msg}`);
    }
  }

  try {
    // ── Test A: non-existent directory ──────────────────────────────────────
    console.log('\n[A] verifyProject on non-existent dir');
    const noProject = await verifyProject('/nonexistent-helm-verify-test-dir-xyz');
    assert(noProject.ok === false,    'ok is false');
    assert(noProject.pm === null,     'pm is null');
    assert(noProject.steps.length === 0, 'steps is empty');
    assert(/no project/.test(noProject.summary), 'summary contains "no project"');

    // ── Test B: minimal passing project ─────────────────────────────────────
    console.log('\n[B] verifyProject on minimal temp project');
    tmpDir = join(tmpdir(), `helm-verify-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    // Minimal package.json: only a build script that exits 0.
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'helm-verify-test',
      version: '0.0.1',
      private: true,
      scripts: {
        // shell-level no-op; works on macOS, Linux, and Windows (node is always present)
        build: 'node -e "process.exit(0)"',
      },
    }, null, 2));

    const result = await verifyProject(tmpDir);
    console.log('  result:', JSON.stringify({ ok: result.ok, summary: result.summary, pm: result.pm }));
    console.log('  steps:', result.steps.map(s => `${s.name}:${s.ok ? 'ok' : 'FAIL'}`).join(', '));

    assert(result.pm === 'npm',       'pm detected as npm (no lockfile)');
    assert(Array.isArray(result.steps), 'steps is array');
    assert(result.steps.length >= 1,  'at least install step ran');
    assert(typeof result.summary === 'string', 'summary is string');

    const installStep = result.steps.find(s => s.name === 'install');
    assert(installStep != null,       'install step present');
    assert(installStep.ok === true,   'install step ok');
    assert(typeof installStep.durationMs === 'number', 'install has durationMs');

    const buildStep = result.steps.find(s => s.name === 'build');
    assert(buildStep != null,         'build step present (script declared)');
    assert(buildStep.ok === true,     'build step ok');

    // No typecheck script and no tsconfig.json → no typecheck step
    const typecheckStep = result.steps.find(s => s.name === 'typecheck');
    assert(typecheckStep == null,     'no typecheck step (no tsconfig)');

    // ok = build passed (no typecheck) → true
    assert(result.ok === true,        'overall ok is true');

    // ── Test C: failing build ────────────────────────────────────────────────
    console.log('\n[C] verifyProject on project with failing build');
    const tmpDir2 = join(tmpdir(), `helm-verify-test-fail-${Date.now()}`);
    mkdirSync(tmpDir2, { recursive: true });
    writeFileSync(join(tmpDir2, 'package.json'), JSON.stringify({
      name: 'helm-verify-fail',
      version: '0.0.1',
      private: true,
      scripts: { build: 'node -e "process.exit(1)"' },
    }, null, 2));

    const failResult = await verifyProject(tmpDir2);
    assert(failResult.ok === false,   'overall ok is false when build fails');
    const failBuild = failResult.steps.find(s => s.name === 'build');
    assert(failBuild?.ok === false,   'build step ok is false');
    assert(/failed/.test(failResult.summary), 'summary mentions failure');
    rmSync(tmpDir2, { recursive: true, force: true });

  } catch (err) {
    console.error('Unexpected error in self-test:', err);
    allPassed = false;
  } finally {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`\n${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}
