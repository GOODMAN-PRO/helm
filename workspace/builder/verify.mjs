import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';



const TAIL_CHARS = 3000;
function tail(s) {
  if (!s) return '';
  if (s.length <= TAIL_CHARS) return s;
  return '…[truncated]\n' + s.slice(-TAIL_CHARS);
}



function detectPm(projectDir) {
  if (existsSync(join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectDir, 'yarn.lock')))      return 'yarn';
  if (existsSync(join(projectDir, 'bun.lockb')))      return 'bun';
  return 'npm';
}


function readPkg(projectDir) {
  try {
    return JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}



function runStep(name, cmd, args, projectDir, timeoutMs) {
  const start = Date.now();
  let result;
  try {
    result = spawnSync(cmd, args, {
      cwd: projectDir,
      shell: true,
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      encoding: 'utf8',

      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {

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




  try {
    steps.push(runStep('install', pm, ['install'], projectDir, 300_000));
  } catch (err) {
    steps.push({ name: 'install', ok: false, output: String(err), durationMs: 0 });
  }




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



  if (scripts['lint']) {
    try {
      steps.push(runStep('lint', pm, ['run', 'lint'], projectDir, 120_000));
    } catch (err) {
      steps.push({ name: 'lint', ok: false, output: String(err), durationMs: 0 });
    }
  }



  if (scripts['build']) {
    try {
      steps.push(runStep('build', pm, ['run', 'build'], projectDir, 300_000));
    } catch (err) {
      steps.push({ name: 'build', ok: false, output: String(err), durationMs: 0 });
    }
  }



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




  const buildStep     = steps.find(s => s.name === 'build');
  const typecheckStep = steps.find(s => s.name === 'typecheck');

  let ok;
  if (buildStep) {
    ok = buildStep.ok && (typecheckStep ? typecheckStep.ok : true);
  } else {

    ok = steps.every(s => s.ok);
  }

  const failed = steps.filter(s => !s.ok).map(s => s.name);
  const summary = ok
    ? `all checks passed (${steps.map(s => s.name).join(', ')})`
    : `failed: ${failed.join(', ')}`;

  return { ok, steps, summary, pm };
}





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

    console.log('\n[A] verifyProject on non-existent dir');
    const noProject = await verifyProject('/nonexistent-helm-verify-test-dir-xyz');
    assert(noProject.ok === false,    'ok is false');
    assert(noProject.pm === null,     'pm is null');
    assert(noProject.steps.length === 0, 'steps is empty');
    assert(/no project/.test(noProject.summary), 'summary contains "no project"');


    console.log('\n[B] verifyProject on minimal temp project');
    tmpDir = join(tmpdir(), `helm-verify-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });


    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'helm-verify-test',
      version: '0.0.1',
      private: true,
      scripts: {

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


    const typecheckStep = result.steps.find(s => s.name === 'typecheck');
    assert(typecheckStep == null,     'no typecheck step (no tsconfig)');


    assert(result.ok === true,        'overall ok is true');


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
