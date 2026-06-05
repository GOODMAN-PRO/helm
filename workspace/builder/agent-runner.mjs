#!/usr/bin/env node
import { spawn }         from 'node:child_process';
import { existsSync }    from 'node:fs';
import { fileURLToPath } from 'node:url';
import os                from 'node:os';
import { AWARD_STANDARD } from './motion/reference-standard.mjs';
import { ANIMATION_STACK } from './motion/animation-libs.mjs';





export const ANTI_STUB_RULES = `
================================================================================
ABSOLUTE PRODUCTION-QUALITY REQUIREMENTS — NON-NEGOTIABLE
================================================================================

You MUST follow every rule below without exception. Violating any of them is a
build failure.

1. NO STUBS, TODOs, or placeholders.
   - Never write "TODO", "FIXME", "not implemented", "placeholder", "coming soon",
     "left as an exercise", "implement later", or any equivalent phrase.
   - Never write commented-out code blocks that say what *should* be there instead
     of actually being there.
   - Never use "lorem ipsum", fake/hardcoded dummy data (unless the task explicitly
     says to create seed data), or placeholder URLs like "https://example.com".
   - Never throw a NotImplementedError or an equivalent stub exception.

2. WRITE REAL FILES — do not merely describe what you would write.
   - Every file mentioned in your plan must actually be created or edited on disk.
   - Use your file-write tools to produce the content. Describing it in prose
     without writing it is the same as not doing it.

3. ALL CODE MUST BE RUNNABLE and leave the project in a buildable state.
   - Imports must resolve — no importing from files or packages you haven't created
     or that aren't in the dependency list.
   - Functions must have real implementations, not just type signatures.
   - Config files must have valid, complete values.

4. WIRE EVERYTHING END-TO-END.
   - If you add a UI component, connect it to real data / handlers.
   - If you add an API route, implement the handler logic fully.
   - If you add a schema, run or generate the migration.
   - If a feature needs environment variables, document them in .env.example with
     actual placeholder formats (e.g. "DATABASE_URL=postgresql://user:pass@host/db").

5. KEEP DEPENDENCIES VALID.
   - Only import packages already in package.json. If you need a new one, add it.
   - Never import from a relative path that doesn't exist.

6. NO "EMPTY HANDLER" SHORTCUTS.
   - onClick={() => {}} or async function handler() {} with no body is a stub.
     Implement the logic or leave it out entirely.

Produce complete, correct, shippable code on the first pass.
================================================================================
`;





export function resolveClaudeBin() {

  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;


  const candidates = [
    `${os.homedir()}/.local/bin/claude`,
    `${os.homedir()}/.claude/local/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }


  return 'claude';
}





export async function runRole(role, ctx, opts = {}) {
  const {
    dryRun    = false,
    timeoutMs = 600_000,
    onEvent,
  } = opts;

  const t0 = Date.now();




  const VISUAL_PHASES = new Set(['design', 'frontend', 'quality']);
  const isVisual = VISUAL_PHASES.has(role.phase);
  const digestCap = isVisual ? 6000 : 3000;



  const stackHeader = [
    '## BUILD BRIEF',
    ctx.brief,
    '',
    '## STACK',
    ctx.stack?.summary ?? '',
    ctx.stack?.notes   ?? '',
    '',
    '## PROJECT SPECS SO FAR',
    ctx.artifactsDigest(digestCap),
  ].join('\n');

  const qualityBlock = isVisual
    ? ['## QUALITY BAR (every build aims here)', AWARD_STANDARD, '',
       '## ANIMATION TOOLKIT (use these idioms when you touch the frontend)', ANIMATION_STACK]
    : ['## QUALITY BAR', 'Production-grade, fully-wired, no stubs/placeholders/lorem. Match the project conventions.'];

  const prompt = [
    role.system,
    '',
    stackHeader,
    '',
    ...qualityBlock,
    '',
    '## YOUR TASK',
    role.task(ctx),
    '',
    ANTI_STUB_RULES,
  ].join('\n');


  if (dryRun) {
    return {
      ok:         true,
      role:       role.id,
      output:     '[dry-run] ' + role.title,
      durationMs: 0,
    };
  }

  const bin   = resolveClaudeBin();
  const model = role.model || 'sonnet';




  const args = [
    '-p',
    '--model',                model,
    '--permission-mode',      'bypassPermissions',
    '--add-dir',              ctx.projectDir,
    '--add-dir',              ctx.buildDir,
  ];

  return new Promise((resolve) => {
    let output  = '';
    let errText = '';
    let timedOut = false;

    let proc;
    try {
      proc = spawn(bin, args, {
        cwd:         ctx.projectDir,
        windowsHide: true,
        stdio:       ['pipe', 'pipe', 'pipe'],
      });
    } catch (spawnErr) {

      resolve({
        ok:         false,
        role:       role.id,
        output:     '',
        durationMs: Date.now() - t0,
        error:      String(spawnErr?.message ?? spawnErr),
      });
      return;
    }

    // Guard stdin against EPIPE: if claude exits before reading the (large) prompt, the error is
    // emitted asynchronously on the stream — a surrounding try/catch won't catch it, and an

    proc.stdin.on('error', () => {});

    try {
      proc.stdin.write(prompt, 'utf8');
      proc.stdin.end();
    } catch {

    }


    proc.stdout.on('data', (chunk) => { output  += chunk.toString('utf8'); });
    proc.stderr.on('data', (chunk) => { errText += chunk.toString('utf8'); });


    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGTERM'); } catch {  }
    }, timeoutMs);

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        ok:         false,
        role:       role.id,
        output,
        durationMs: Date.now() - t0,
        error:      String(err?.message ?? err),
      });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);

      if (timedOut) {
        resolve({
          ok:         false,
          role:       role.id,
          output,
          durationMs: Date.now() - t0,
          error:      `timed out after ${timeoutMs}ms`,
        });
        return;
      }

      resolve({
        ok:         code === 0,
        role:       role.id,
        output,
        durationMs: Date.now() - t0,

        ...(code !== 0 && { error: errText.trim() || `exit code ${code}` }),
      });
    });
  });
}





if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let passed = 0;
  let failed = 0;

  function assert(label, condition) {
    if (condition) {
      console.log(`  PASS  ${label}`);
      passed++;
    } else {
      console.error(`  FAIL  ${label}`);
      failed++;
    }
  }

  console.log('\n=== agent-runner.mjs self-test ===\n');


  const bin = resolveClaudeBin();
  assert('resolveClaudeBin() returns a string', typeof bin === 'string');
  assert('resolveClaudeBin() returns a non-empty string', bin.length > 0);


  assert('ANTI_STUB_RULES is a string', typeof ANTI_STUB_RULES === 'string');
  assert('ANTI_STUB_RULES mentions TODO', ANTI_STUB_RULES.includes('TODO'));
  assert('ANTI_STUB_RULES mentions placeholder', ANTI_STUB_RULES.toLowerCase().includes('placeholder'));


  const fakeRole = {
    id:     'test-role',
    title:  'Test Role',
    model:  'sonnet',
    system: 'You are a test agent.',
    task:   (_ctx) => 'Do nothing — this is a dry run.',
  };

  const fakeCtx = {
    brief:      'A test app',
    projectDir: '/tmp/fake-project',
    buildDir:   '/tmp/fake-project/.helm-build',
    stack: {
      summary: 'Test stack summary',
      notes:   'Test stack notes',
    },
    artifactsDigest: () => '(no artifacts yet)',
  };

  const result = await runRole(fakeRole, fakeCtx, { dryRun: true });

  assert('dry-run ok === true',         result.ok === true);
  assert('dry-run role === role.id',    result.role === 'test-role');
  assert('dry-run output starts with [dry-run]', result.output.startsWith('[dry-run]'));
  assert('dry-run output contains title', result.output.includes('Test Role'));
  assert('dry-run durationMs === 0',    result.durationMs === 0);
  assert('dry-run has no error key',    !('error' in result));


  const noModelRole = { ...fakeRole, model: undefined };
  const r2 = await runRole(noModelRole, fakeCtx, { dryRun: true });
  assert('dry-run with model=undefined still returns ok', r2.ok === true);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}
