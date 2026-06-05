import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { selectRoles } from './select.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);


const REPO_ROOT = path.resolve(__dirname, '..', '..');


export const PHASE_ORDER = [
  'discovery',
  'architecture',
  'design',
  'scaffold',
  'data',
  'backend',
  'auth',
  'frontend',
  'integration',
  'quality',
  'finalize',
];




function slugify(s) {
  return String(s || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'project';
}


function tsNow() {


  return new Date().toISOString().replace(/[:.tz]/gi, '-').slice(0, 19);
}


async function tryImport(specifier) {
  try {


    const spec = path.isAbsolute(specifier) ? pathToFileURL(specifier).href : specifier;
    return await import(spec);
  } catch {
    return null;
  }
}













async function runPhase(phaseName, roles, ctx, runRoleFn, opts, globalDone) {
  const { concurrency, dryRun, onProgress } = opts;


  const byId = Object.fromEntries(roles.map(r => [r.id, r]));
  const active = new Set();


  const pending = new Set(roles.map(r => r.id));

  const results = [];



  function getReady() {
    return [...pending].filter(id => {
      const role = byId[id];
      const deps = role.deps || [];
      return deps.every(d => d in globalDone) && !active.has(id);
    });
  }


  function raceNonEmpty(promises) {
    if (promises.length === 0) {

      return new Promise(res => setImmediate ? setImmediate(res) : setTimeout(res, 0));
    }
    return Promise.race(promises);
  }


  async function launch(id) {
    const role = byId[id];
    pending.delete(id);
    active.add(id);
    onProgress?.({ phase: phaseName, role: id, status: 'start' });
    let result;
    try {
      result = await runRoleFn(role, ctx, { dryRun });
    } catch (err) {
      result = { ok: false, role: id, error: String(err), durationMs: 0 };
    }
    active.delete(id);
    globalDone[id] = result;
    results.push({ role: id, ok: result.ok, durationMs: result.durationMs ?? 0, error: result.error });
    onProgress?.({ phase: phaseName, role: id, status: result.ok ? 'done' : 'fail' });
    return result;
  }


  const inFlight = new Map();


  while (pending.size > 0 || active.size > 0) {
    const ready = getReady();

    if (ready.length === 0 && active.size === 0) {


      for (const id of [...pending]) {
        pending.delete(id);
        const err = 'blocked: unresolved or circular deps';
        globalDone[id] = { ok: false, role: id, error: err, durationMs: 0 };
        results.push({ role: id, ok: false, durationMs: 0, error: err });
        onProgress?.({ phase: phaseName, role: id, status: 'fail' });
      }
      break;
    }


    const slots = concurrency - active.size;
    const toStart = ready.slice(0, Math.max(0, slots));

    if (toStart.length === 0) {

      await raceNonEmpty([...inFlight.values()]);



      for (const [id, p] of inFlight) {
        if (!active.has(id)) inFlight.delete(id);
      }
      continue;
    }


    for (const id of toStart) {
      const p = launch(id).then(r => { inFlight.delete(id); return r; });
      inFlight.set(id, p);
    }


    await raceNonEmpty([...inFlight.values()]);
  }

  return results;
}


function buildReport({ brief, projectDir, phases, roleResults, verify, gates, dryRun, selection, scaffoldInfo }) {
  const lines = [];
  lines.push('# Helm Builder Report');
  lines.push('');
  lines.push(`**Brief:** ${brief || '(none)'}`);
  lines.push(`**Project:** \`${projectDir}\``);
  lines.push(`**Mode:** ${dryRun ? 'dry-run (no files written)' : 'live'}`);
  if (selection) {
    lines.push(`**Tier:** ${selection.tier}  ·  **Agents selected:** ${roleResults.length}${selection.skipped?.length ? `  ·  **Skipped (not needed):** ${selection.skipped.length}` : ''}`);
    if (selection.needs) lines.push(`**Detected needs:** backend=${!!selection.needs.needsBackend}, animation=${!!selection.needs.wantsAnimation}`);
  }
  if (scaffoldInfo) lines.push(`**Scaffold:** ${scaffoldInfo.ok === false ? '❌ FAILED — ' + (scaffoldInfo.error || 'unknown') : (scaffoldInfo.fallback ? '⚠ create-next-app failed; used minimal fallback base' : '✓ create-next-app')}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');

  // Phases table.
  lines.push('## Phases');
  for (const [phase, results] of Object.entries(phases)) {
    const total  = results.length;
    const passed = results.filter(r => r.ok).length;
    lines.push(`\n### ${phase}  (${passed}/${total} ok)`);
    for (const r of results) {
      const icon = r.ok ? '✓' : '✗';
      const ms   = r.durationMs != null ? ` ${r.durationMs}ms` : '';
      lines.push(`- ${icon} \`${r.role}\`${ms}${r.error ? ` — ${r.error}` : ''}`);
    }
  }

  lines.push('');
  lines.push('## All Roles');
  lines.push('| Role | OK | ms |');
  lines.push('|------|----|----|');
  for (const r of roleResults) {
    lines.push(`| \`${r.role}\` | ${r.ok ? 'yes' : 'no'} | ${r.durationMs ?? 0} |`);
  }

  if (verify) {
    lines.push('');
    lines.push('## Verify');
    lines.push(`**ok:** ${verify.ok}`);
    if (verify.steps) {
      for (const s of verify.steps) {
        const icon = s.skipped ? '—' : (s.ok ? '✓' : '✗');
        lines.push(`- ${icon} ${s.name}${s.skipped ? ' (skipped)' : ''}`);
      }
    }
    if (verify.summary) lines.push(`\n${verify.summary}`);
  }

  if (gates) {
    lines.push('');
    lines.push('## Quality Gates');
    lines.push(`**ok:** ${gates.ok}`);
    if (gates.gates) {
      for (const g of gates.gates) {
        lines.push(`- ${g.ok ? '✓' : '✗'} ${g.name}${g.details ? `: ${g.details}` : ''}`);
      }
    }
  }

  return lines.join('\n');
}


export async function buildApp(options = {}) {
  const {
    brief       = '',
    stack: stackOpt,
    outDir,
    dryRun      = false,
    concurrency = 3,
    maxFixRounds = 2,
    onProgress,
    // Adaptive selection: run only the agents the job needs (token-efficient). 'auto' lets the

    tier,
    includeRoles,
    excludeRoles,
    maxAgents,

    _runRole,
    _roles,
    _verify,
    _gates,
  } = options;

  let projectDir = outDir || null;


  const LOCK = path.join(REPO_ROOT, 'workspace', 'builder', '.build.lock');
  let lockHeld = false;

  try {
    if (!dryRun) {
      try {
        if (existsSync(LOCK)) {
          const pid = parseInt(readFileSync(LOCK, 'utf8'), 10);
          let alive = false; try { if (pid) { process.kill(pid, 0); alive = true; } } catch {}
          if (alive) return { ok: false, error: `a build is already running (pid ${pid}). Wait for it to finish or stop it before starting another — running several at once thrashes the machine.`, projectDir: null };
        }
        mkdirSync(path.dirname(LOCK), { recursive: true });
        writeFileSync(LOCK, String(process.pid));
        lockHeld = true;
      } catch {  }
    }

    let stack = stackOpt;
    if (!stack) {
      const stackMod = await tryImport(path.join(__dirname, 'stack.mjs'));
      if (stackMod?.resolveStack) {
        stack = stackMod.resolveStack(brief);
      } else {

        stack = {
          id: 'unknown',
          label: 'Unknown',
          summary: 'stack.mjs not available',
          scaffold: async () => ({ ok: true, output: '[stub]' }),
        };
      }
    }


    if (!projectDir) {
      const slug = slugify(brief);
      projectDir = path.join(REPO_ROOT, 'workspace', 'builder', 'out', `${slug}-${tsNow()}`);
    }


    let scaffoldInfo = null;
    if (!dryRun && stack.scaffold) {
      try {
        scaffoldInfo = (await stack.scaffold(projectDir)) || { ok: true };
      } catch (e) {
        scaffoldInfo = { ok: false, error: String(e?.message ?? e) };
        console.error('[orchestrator] scaffold error:', e);
      }


      try {
        if (!existsSync(path.join(projectDir, 'package.json'))) {
          const sutil = await tryImport(path.join(__dirname, 'scaffold-util.mjs'));
          if (sutil?.ensureNextScaffold) scaffoldInfo = sutil.ensureNextScaffold(projectDir, scaffoldInfo || {});
        }
      } catch (e) { console.error('[orchestrator] scaffold fallback error:', e); }
      onProgress?.({ phase: 'scaffold', role: '*', status: (scaffoldInfo && scaffoldInfo.ok === false) ? 'fail' : 'done', fallback: !!(scaffoldInfo && scaffoldInfo.fallback) });
    }


    let ctx;
    const ctxMod = await tryImport(path.join(__dirname, 'context.mjs'));
    if (!dryRun && ctxMod?.createContext) {
      try {
        ctx = ctxMod.createContext({ brief, stack, projectDir });
      } catch (e) {
        console.error('[orchestrator] createContext error:', e);
      }
    }
    if (!ctx) {

      ctx = {
        brief,
        stack,
        projectDir,
        buildDir: path.join(projectDir, '.helm-build'),
        getArtifact: () => null,
        setArtifact: () => {},
        listArtifacts: () => [],
        artifactsDigest: () => '',
        readFile: () => null,
        log: (msg) => console.error('[helm]', msg),
        state: {},
        saveState: () => {},
      };
    }

    // ── 5. Load roles ───────────────────────────────────────────────────────
    let allRoles = [];
    if (_roles) {
      allRoles = _roles;
    } else {
      const rolesMod = await tryImport(path.join(__dirname, 'roles.mjs'));
      if (rolesMod?.getAllRoles) {
        try {
          allRoles = await rolesMod.getAllRoles();
        } catch (e) {
          console.error('[orchestrator] getAllRoles error:', e);
        }
      }

    }


    let selection = { roles: allRoles, tier: 'all', skipped: [], needs: {} };
    if (!_roles) {
      selection = selectRoles(allRoles, { brief, stack }, { tier, includeRoles, excludeRoles, maxAgents });
      allRoles = selection.roles;
    }
    onProgress?.({ phase: 'plan', role: '*', status: 'selected', tier: selection.tier, count: allRoles.length, skipped: selection.skipped.length });


    let runRoleFn = _runRole;
    if (!runRoleFn) {
      const runnerMod = await tryImport(path.join(__dirname, 'agent-runner.mjs'));
      if (runnerMod?.runRole) {
        runRoleFn = (role, c, o) => runnerMod.runRole(role, c, o);
      } else {

        runRoleFn = async (role) => ({
          ok: true,
          role: role.id,
          output: `[stub] ${role.title}`,
          durationMs: 0,
        });
      }
    }



    const byPhase = Object.fromEntries(PHASE_ORDER.map(p => [p, []]));
    for (const role of allRoles) {
      const ph = role.phase;
      if (PHASE_ORDER.includes(ph)) {
        byPhase[ph].push(role);
      } else {

        byPhase['finalize'].push(role);
      }
    }

    const phaseResultsMap = {};
    const allRoleResults  = [];
    const globalDone      = {};

    for (const phase of PHASE_ORDER) {
      const roles = byPhase[phase];
      if (roles.length === 0) {
        phaseResultsMap[phase] = [];
        continue;
      }
      const results = await runPhase(phase, roles, ctx, runRoleFn, {
        concurrency,
        dryRun,
        onProgress,
      }, globalDone);
      phaseResultsMap[phase] = results;
      allRoleResults.push(...results);
    }


    let verify = dryRun ? null : undefined;
    let gates  = dryRun ? null : undefined;

    if (!dryRun) {

      let verifyFn = _verify;
      if (!verifyFn) {
        const verifyMod = await tryImport(path.join(__dirname, 'verify.mjs'));
        if (verifyMod?.verifyProject) verifyFn = verifyMod.verifyProject;
      }
      if (verifyFn) {
        try {
          verify = await verifyFn(projectDir);
        } catch (e) {
          verify = { ok: false, summary: String(e), steps: [] };
        }
      } else {
        verify = { ok: true, summary: 'verify.mjs not available — skipped', steps: [] };
      }


      let gatesFn = _gates;
      if (!gatesFn) {
        const gatesMod = await tryImport(path.join(__dirname, 'quality-gates.mjs'));
        if (gatesMod?.runQualityGates) gatesFn = gatesMod.runQualityGates;
      }
      if (gatesFn) {
        try {
          gates = await gatesFn(projectDir, ctx);
        } catch (e) {
          gates = { ok: false, gates: [{ name: 'quality-gates', ok: false, details: String(e) }] };
        }
      } else {
        gates = { ok: true, gates: [], details: 'quality-gates.mjs not available — skipped' };
      }


      let fixRound = 0;
      while (verify && !verify.ok && fixRound < maxFixRounds) {
        fixRound++;


        const failingSteps = (verify.steps || [])
          .filter(s => !s.ok && !s.skipped)
          .map(s => `- ${s.name}: ${(s.output || '').slice(-800)}`)
          .join('\n');

        const fixerRole = {
          id:     'auto-fixer',
          title:  'Bug Fixer',
          phase:  'finalize',
          deps:   [],
          model:  'sonnet',
          system: 'You are a senior full-stack debugging engineer. Your only job is to make the project build and tests pass. Fix root causes, never stub things out.',
          task:   () => [
            `The project at ${projectDir} has failing verification steps (round ${fixRound}/${maxFixRounds}).`,
            'Fix all issues so that the build succeeds and tests pass. Do NOT introduce stubs or TODOs.',
            '',
            'Failing steps:',
            failingSteps || '(see verify output above)',
          ].join('\n'),
        };

        onProgress?.({ phase: 'finalize', role: 'auto-fixer', status: 'start' });
        let fixResult;
        try {
          fixResult = await runRoleFn(fixerRole, ctx, { dryRun: false });
        } catch (e) {
          fixResult = { ok: false, role: 'auto-fixer', error: String(e), durationMs: 0 };
        }
        onProgress?.({ phase: 'finalize', role: 'auto-fixer', status: fixResult.ok ? 'done' : 'fail' });
        allRoleResults.push({ role: 'auto-fixer', ok: fixResult.ok, durationMs: fixResult.durationMs ?? 0 });


        if (verifyFn) {
          try {
            verify = await verifyFn(projectDir);
          } catch (e) {
            verify = { ok: false, summary: String(e), steps: [] };
          }
        }
      }
    }


    const report = buildReport({
      brief,
      projectDir,
      phases: phaseResultsMap,
      roleResults: allRoleResults,
      verify,
      gates,
      dryRun,
      selection,
      scaffoldInfo,
    });

    const overallOk = dryRun
      ? true
      : (verify?.ok !== false) && (gates?.ok !== false) && allRoleResults.every(r => r.ok);

    return {
      ok:          overallOk,
      projectDir,
      report,
      roleResults: allRoleResults,
      verify:      verify ?? null,
      gates:       gates  ?? null,
      phases:      phaseResultsMap,
      tier:        selection.tier,
      skipped:     selection.skipped,
    };

  } catch (fatal) {

    return {
      ok:         false,
      error:      String(fatal),
      projectDir: projectDir || null,
    };
  } finally {
    if (lockHeld) { try { unlinkSync(LOCK); } catch {} }
  }
}








if (process.argv[1] === __filename) {
  (async () => {
    let pass = true;
    function assert(cond, msg) {
      if (!cond) { console.error('FAIL:', msg); pass = false; }
      else        { console.log ('OK  :', msg); }
    }


    assert(Array.isArray(PHASE_ORDER),           'PHASE_ORDER is array');
    assert(PHASE_ORDER.length === 11,             'PHASE_ORDER has 11 phases');
    assert(PHASE_ORDER[0]  === 'discovery',       'first phase is discovery');
    assert(PHASE_ORDER[10] === 'finalize',        'last phase is finalize');





    const executionLog = [];

    const fakeRoles = [
      { id: 'pm',          phase: 'discovery',    deps: [],       title: 'PM',          model: 'sonnet', system: '', task: () => '' },
      { id: 'researcher',  phase: 'discovery',    deps: [],       title: 'Researcher',  model: 'haiku',  system: '', task: () => '' },
      { id: 'architect',   phase: 'architecture', deps: ['pm'],   title: 'Architect',   model: 'opus',   system: '', task: () => '' },
      { id: 'ux',          phase: 'design',       deps: [],       title: 'UX',          model: 'sonnet', system: '', task: () => '' },
      { id: 'fe-scaffold', phase: 'scaffold',     deps: [],       title: 'Scaffolder',  model: 'haiku',  system: '', task: () => '' },
      { id: 'fe-impl',     phase: 'frontend',     deps: ['ux'],   title: 'FE Impl',     model: 'sonnet', system: '', task: () => '' },
      { id: 'qa',          phase: 'quality',      deps: ['fe-impl'], title: 'QA',        model: 'haiku',  system: '', task: () => '' },
    ];

    // Track finish order to verify dep constraints.
    const finishedAt = {};  // id -> index of completion
    let callIdx = 0;

    const mockRunRole = async (role) => {
      const idx = callIdx++;
      executionLog.push(role.id);
      finishedAt[role.id] = idx;
      return { ok: true, role: role.id, output: `[mock] ${role.title}`, durationMs: 0 };
    };

    const result = await buildApp({
      brief:    'test app',
      dryRun:   true,
      _roles:   fakeRoles,
      _runRole: mockRunRole,
      onProgress: ({ phase, role, status }) => {
        if (status === 'start') process.stdout.write(`  [${phase}] ${role} → `);
        else                    process.stdout.write(`${status}\n`);
      },
    });


    assert(typeof result       === 'object',  'result is object');
    assert(typeof result.ok    === 'boolean', 'result.ok is boolean');
    assert(typeof result.report === 'string' && result.report.length > 0, 'report is non-empty string');
    assert(Array.isArray(result.roleResults),  'roleResults is array');
    assert(typeof result.phases === 'object',  'phases is object');
    assert(result.ok === true,                 'dryRun result is ok');


    assert(result.roleResults.length === fakeRoles.length,
      `all ${fakeRoles.length} roles were run`);


    const discMax = Math.max(
      finishedAt['pm']         ?? -1,
      finishedAt['researcher'] ?? -1,
    );
    const archMin = finishedAt['architect'] ?? Infinity;
    assert(discMax < archMin, 'discovery finishes before architecture starts');


    assert((finishedAt['pm'] ?? Infinity) < (finishedAt['architect'] ?? -1),
      'architect ran after pm (dep)');


    assert((finishedAt['ux'] ?? Infinity) < (finishedAt['fe-impl'] ?? -1),
      'fe-impl ran after ux');


    assert((finishedAt['fe-impl'] ?? Infinity) < (finishedAt['qa'] ?? -1),
      'qa ran after fe-impl');


    assert(result.report.includes('# Helm Builder Report'), 'report has heading');
    assert(result.report.includes('discovery'),             'report mentions discovery phase');
    assert(result.report.includes('pm'),                    'report mentions pm role');


    assert(result.verify === null, 'dryRun verify is null');
    assert(result.gates  === null, 'dryRun gates is null');

    console.log('');
    console.log(pass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
    process.exit(pass ? 0 : 1);
  })();
}
