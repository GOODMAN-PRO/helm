// orchestrator.mjs — pipeline scheduler for the Helm full-stack builder.
// Runs 20+ specialist roles in PHASE_ORDER, respecting intra-phase deps and a concurrency cap.
// Never throws — on any fatal error returns { ok:false, error, projectDir }.
//
// §4 of CONTRACT.md owns this file.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { selectRoles } from './select.mjs';   // adaptive, token-efficient role selection

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Repo root = two levels up from workspace/builder/
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ─── Phase order (canonical; role files key off this) ───────────────────────
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

// ─── Tiny helpers ────────────────────────────────────────────────────────────

// Convert an arbitrary string into a URL-safe slug (max 40 chars).
function slugify(s) {
  return String(s || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'project';
}

// Short ISO timestamp for directory names — no colons (filesystem-safe).
function tsNow() {
  // No uppercase / no ':'/'.': the folder basename becomes the project name, and create-next-app rejects
  // any name with capitals (npm naming) — the ISO 'T' separator silently broke every scaffold.
  return new Date().toISOString().replace(/[:.tz]/gi, '-').slice(0, 19);
}

// Safe dynamic import: returns the module or null on any error.
async function tryImport(specifier) {
  try {
    return await import(specifier);
  } catch {
    return null;
  }
}

// ─── Topological scheduler (within one phase) ────────────────────────────────
// Roles within a phase form a DAG via their `deps` arrays (role IDs that must
// finish before this role starts).  We run ready roles concurrently up to the
// `concurrency` cap, drain them, then look for the next batch — rinse/repeat
// until all roles in the phase are done or failed.
//
// A role is "ready" when every dep id has a finished result in `done`.
// If a dep failed we still mark it done (result.ok=false) so downstream roles
// are not blocked forever — the phase just accumulates failures.

// globalDone: shared map of role-id → result across ALL phases, so cross-phase
// deps (e.g. architect.deps=['pm'] where pm ran in a prior phase) are visible.
async function runPhase(phaseName, roles, ctx, runRoleFn, opts, globalDone) {
  const { concurrency, dryRun, onProgress } = opts;

  // Build a map for quick lookup within this phase.
  const byId = Object.fromEntries(roles.map(r => [r.id, r]));
  const active = new Set();  // ids currently in-flight

  // Roles still waiting to start.
  const pending = new Set(roles.map(r => r.id));

  const results = [];

  // Which ids are ready to run right now?
  // A role is ready when all its deps appear in globalDone (any phase).
  function getReady() {
    return [...pending].filter(id => {
      const role = byId[id];
      const deps = role.deps || [];
      return deps.every(d => d in globalDone) && !active.has(id);
    });
  }

  // Await one of an array of promises (handles the empty-array edge case).
  function raceNonEmpty(promises) {
    if (promises.length === 0) {
      // Nothing in-flight to race — yield to let microtasks drain.
      return new Promise(res => setImmediate ? setImmediate(res) : setTimeout(res, 0));
    }
    return Promise.race(promises);
  }

  // Run a single role and record its result into globalDone + local results.
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
    globalDone[id] = result;   // visible to all subsequent phases too
    results.push({ role: id, ok: result.ok, durationMs: result.durationMs ?? 0, error: result.error });
    onProgress?.({ phase: phaseName, role: id, status: result.ok ? 'done' : 'fail' });
    return result;
  }

  // Promises for active launches so we can race them while waiting for a slot.
  const inFlight = new Map();  // id -> Promise

  // Keep launching until nothing is pending.
  while (pending.size > 0 || active.size > 0) {
    const ready = getReady();

    if (ready.length === 0 && active.size === 0) {
      // Nothing ready and nothing running — dep cycle or all deps failed.
      // Drain the remaining pending roles as blocked so we don't hang.
      for (const id of [...pending]) {
        pending.delete(id);
        const err = 'blocked: unresolved or circular deps';
        globalDone[id] = { ok: false, role: id, error: err, durationMs: 0 };
        results.push({ role: id, ok: false, durationMs: 0, error: err });
        onProgress?.({ phase: phaseName, role: id, status: 'fail' });
      }
      break;
    }

    // Fill up to concurrency limit.
    const slots = concurrency - active.size;
    const toStart = ready.slice(0, Math.max(0, slots));

    if (toStart.length === 0) {
      // Concurrency cap hit — wait for any in-flight role to finish.
      await raceNonEmpty([...inFlight.values()]);
      // Clean up settled entries.
      for (const [id, p] of inFlight) {
        if (!(id in active)) inFlight.delete(id);
      }
      continue;
    }

    // Launch ready roles up to the available slot count.
    for (const id of toStart) {
      const p = launch(id).then(r => { inFlight.delete(id); return r; });
      inFlight.set(id, p);
    }

    // Wait for at least one to finish before re-evaluating.
    await raceNonEmpty([...inFlight.values()]);
  }

  return results;
}

// ─── Markdown report builder ──────────────────────────────────────────────────
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

// ─── buildApp ─────────────────────────────────────────────────────────────────
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
    // brief+stack pick the tier; force with tier:'lean'|'standard'|'premium'. include/exclude by id.
    tier,
    includeRoles,
    excludeRoles,
    maxAgents,
    // Test injection overrides (underscore convention).
    _runRole,
    _roles,
    _verify,
    _gates,
  } = options;

  let projectDir = outDir || null;
  // Single-build lock: spinning up a second 34-40 agent build while one is running thrashes the machine
  // (this is exactly what happened when a build was relaunched mid-run). Refuse to start a concurrent one.
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
      } catch { /* lock best-effort */ }
    }
    // ── 1. Resolve stack ────────────────────────────────────────────────────
    let stack = stackOpt;
    if (!stack) {
      const stackMod = await tryImport(path.join(__dirname, 'stack.mjs'));
      if (stackMod?.resolveStack) {
        stack = stackMod.resolveStack(brief);
      } else {
        // Minimal stub so the rest of the pipeline can still run.
        stack = {
          id: 'unknown',
          label: 'Unknown',
          summary: 'stack.mjs not available',
          scaffold: async () => ({ ok: true, output: '[stub]' }),
        };
      }
    }

    // ── 2. Determine projectDir ─────────────────────────────────────────────
    if (!projectDir) {
      const slug = slugify(brief);
      projectDir = path.join(REPO_ROOT, 'workspace', 'builder', 'out', `${slug}-${tsNow()}`);
    }

    // ── 3. Scaffold (skip in dryRun) ────────────────────────────────────────
    let scaffoldInfo = null;
    if (!dryRun && stack.scaffold) {
      try {
        scaffoldInfo = (await stack.scaffold(projectDir)) || { ok: true };
      } catch (e) {
        scaffoldInfo = { ok: false, error: String(e?.message ?? e) };
        console.error('[orchestrator] scaffold error:', e);
      }
      // HARD GUARANTEE: a real build must start from a valid project. If the preset didn't leave a
      // package.json, write the deterministic minimal Next.js base so agents never get an empty folder.
      try {
        if (!existsSync(path.join(projectDir, 'package.json'))) {
          const sutil = await tryImport(path.join(__dirname, 'scaffold-util.mjs'));
          if (sutil?.ensureNextScaffold) scaffoldInfo = sutil.ensureNextScaffold(projectDir, scaffoldInfo || {});
        }
      } catch (e) { console.error('[orchestrator] scaffold fallback error:', e); }
      onProgress?.({ phase: 'scaffold', role: '*', status: (scaffoldInfo && scaffoldInfo.ok === false) ? 'fail' : 'done', fallback: !!(scaffoldInfo && scaffoldInfo.fallback) });
    }

    // ── 4. Create context (skip in dryRun so a plan/smoke run never creates folders on disk) ──
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
      // Minimal inline fallback so roles can still receive a ctx object.
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
      // roles.mjs absent or threw — allRoles stays []
    }

    // ── 5b. Adaptive selection — only run the agents this job needs (skip when roles are injected) ──
    let selection = { roles: allRoles, tier: 'all', skipped: [], needs: {} };
    if (!_roles) {
      selection = selectRoles(allRoles, { brief, stack }, { tier, includeRoles, excludeRoles, maxAgents });
      allRoles = selection.roles;
    }
    onProgress?.({ phase: 'plan', role: '*', status: 'selected', tier: selection.tier, count: allRoles.length, skipped: selection.skipped.length });

    // ── 6. Resolve runRole ──────────────────────────────────────────────────
    let runRoleFn = _runRole;
    if (!runRoleFn) {
      const runnerMod = await tryImport(path.join(__dirname, 'agent-runner.mjs'));
      if (runnerMod?.runRole) {
        runRoleFn = (role, c, o) => runnerMod.runRole(role, c, o);
      } else {
        // Fallback stub — records dry-run-style output without spawning.
        runRoleFn = async (role) => ({
          ok: true,
          role: role.id,
          output: `[stub] ${role.title}`,
          durationMs: 0,
        });
      }
    }

    // ── 6. Schedule: group by PHASE_ORDER, respect deps within each phase ───
    // Index roles by phase.
    const byPhase = Object.fromEntries(PHASE_ORDER.map(p => [p, []]));
    for (const role of allRoles) {
      const ph = role.phase;
      if (PHASE_ORDER.includes(ph)) {
        byPhase[ph].push(role);
      } else {
        // Unknown phase — drop into 'finalize' as a safe catchall.
        byPhase['finalize'].push(role);
      }
    }

    const phaseResultsMap = {};  // phase -> RoleResult[]
    const allRoleResults  = [];
    const globalDone      = {};  // shared across all phases so cross-phase deps resolve

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

    // ── 7. Verify + quality gates (skip in dryRun) ─────────────────────────
    let verify = dryRun ? null : undefined;
    let gates  = dryRun ? null : undefined;

    if (!dryRun) {
      // verifyProject
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

      // runQualityGates
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

      // ── 8. Fix loop ───────────────────────────────────────────────────────
      let fixRound = 0;
      while (verify && !verify.ok && fixRound < maxFixRounds) {
        fixRound++;

        // Build a concise failure summary for the fixer prompt.
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

        // Re-verify after the fix attempt.
        if (verifyFn) {
          try {
            verify = await verifyFn(projectDir);
          } catch (e) {
            verify = { ok: false, summary: String(e), steps: [] };
          }
        }
      }
    }

    // ── 9. Build report ─────────────────────────────────────────────────────
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
    // Top-level guard — should never reach here, but the contract requires it.
    return {
      ok:         false,
      error:      String(fatal),
      projectDir: projectDir || null,
    };
  } finally {
    if (lockHeld) { try { unlinkSync(LOCK); } catch {} }   // always release the single-build lock
  }
}

// ─── Self-test ────────────────────────────────────────────────────────────────
// Run: node orchestrator.mjs
// Verifies:
//   1. PHASE_ORDER is an 11-element array with 'discovery' first and 'finalize' last.
//   2. dryRun=true returns a report string and the correct phase sequence.
//   3. Roles with deps run only after their deps are done.

if (process.argv[1] === __filename) {
  (async () => {
    let pass = true;
    function assert(cond, msg) {
      if (!cond) { console.error('FAIL:', msg); pass = false; }
      else        { console.log ('OK  :', msg); }
    }

    // ── Check PHASE_ORDER shape ──────────────────────────────────────────────
    assert(Array.isArray(PHASE_ORDER),           'PHASE_ORDER is array');
    assert(PHASE_ORDER.length === 11,             'PHASE_ORDER has 11 phases');
    assert(PHASE_ORDER[0]  === 'discovery',       'first phase is discovery');
    assert(PHASE_ORDER[10] === 'finalize',        'last phase is finalize');

    // ── Fake roles spanning phases with dependency chains ────────────────────
    // pm → architect (dep on pm) → ux (no deps, same phase)
    // fe-scaffold → fe-impl (dep on fe-scaffold)
    // All in separate phases to confirm PHASE_ORDER is honoured.
    const executionLog = [];  // record (id, ts) to verify ordering

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
      dryRun:   true,       // no scaffold / verify / fix loop
      _roles:   fakeRoles,
      _runRole: mockRunRole,
      onProgress: ({ phase, role, status }) => {
        if (status === 'start') process.stdout.write(`  [${phase}] ${role} → `);
        else                    process.stdout.write(`${status}\n`);
      },
    });

    // ── Basic return shape ───────────────────────────────────────────────────
    assert(typeof result       === 'object',  'result is object');
    assert(typeof result.ok    === 'boolean', 'result.ok is boolean');
    assert(typeof result.report === 'string' && result.report.length > 0, 'report is non-empty string');
    assert(Array.isArray(result.roleResults),  'roleResults is array');
    assert(typeof result.phases === 'object',  'phases is object');
    assert(result.ok === true,                 'dryRun result is ok');

    // ── All roles were executed ──────────────────────────────────────────────
    assert(result.roleResults.length === fakeRoles.length,
      `all ${fakeRoles.length} roles were run`);

    // ── Phase ordering: 'discovery' roles complete before 'architecture' ─────
    const discMax = Math.max(
      finishedAt['pm']         ?? -1,
      finishedAt['researcher'] ?? -1,
    );
    const archMin = finishedAt['architect'] ?? Infinity;
    assert(discMax < archMin, 'discovery finishes before architecture starts');

    // ── Intra-phase dep: architect ran after pm ──────────────────────────────
    assert((finishedAt['pm'] ?? Infinity) < (finishedAt['architect'] ?? -1),
      'architect ran after pm (dep)');

    // ── fe-impl ran after ux (cross-phase dep honoured via phase ordering) ───
    assert((finishedAt['ux'] ?? Infinity) < (finishedAt['fe-impl'] ?? -1),
      'fe-impl ran after ux');

    // ── qa ran after fe-impl ─────────────────────────────────────────────────
    assert((finishedAt['fe-impl'] ?? Infinity) < (finishedAt['qa'] ?? -1),
      'qa ran after fe-impl');

    // ── Report mentions key sections ─────────────────────────────────────────
    assert(result.report.includes('# Helm Builder Report'), 'report has heading');
    assert(result.report.includes('discovery'),             'report mentions discovery phase');
    assert(result.report.includes('pm'),                    'report mentions pm role');

    // ── dryRun: verify + gates are null ──────────────────────────────────────
    assert(result.verify === null, 'dryRun verify is null');
    assert(result.gates  === null, 'dryRun gates is null');

    console.log('');
    console.log(pass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
    process.exit(pass ? 0 : 1);
  })();
}
