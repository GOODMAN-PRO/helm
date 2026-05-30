#!/usr/bin/env node
// Helm build swarm.
//
//   N builder agents  ->  each in its own isolated git worktree/branch, builds ONE feature
//   N reviewer agents ->  independently check each build (diff + smoke), APPROVE / REJECT (+ fix)
//   one revision round for rejects
//   sequential SMOKE-GATED merge into main  ->  auto-revert any merge that breaks smoke
//
// Main is never left broken: a feature that fails review or the smoke gate simply doesn't land.
//
// tasks: workspace/swarm/tasks.json = [{ id, title, spec, status }]
// usage: node workspace/swarm/swarm.mjs [--workers 5] [--reviewers 5]
//        [--build-model sonnet] [--review-model sonnet] [--tasks <file>] [--dry]

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // workspace/swarm
const WORKSPACE = path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '../..');
loadEnv({ path: path.join(ROOT, '.env') });

const argv = process.argv;
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const WORKERS = parseInt(arg('workers', '5'), 10);
const REVIEWERS = parseInt(arg('reviewers', '5'), 10);
const BUILD_MODEL = arg('build-model', process.env.SWARM_BUILD_MODEL || 'sonnet');
const REVIEW_MODEL = arg('review-model', process.env.SWARM_REVIEW_MODEL || 'sonnet');
const TASKS_FILE = arg('tasks', path.join(__dirname, 'tasks.json'));
const DRY = argv.includes('--dry');
const CLAUDE = process.env.CLAUDE_BIN || 'claude';
const AGENT_CAP_MS = 60 * 60_000;

const SWARM_WT = path.join(ROOT, '.swarm');
const LOG = path.join(__dirname, 'swarm.log');
const REPORT = path.join(__dirname, 'REPORT.md');

const ts = () => new Date().toISOString();
const log = m => { const l = `[swarm ${ts()}] ${m}`; console.log(l); try { appendFileSync(LOG, l + '\n'); } catch {} };
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
const git = (cwd, ...a) => sh('git', ['-c', 'user.name=Helm', '-c', 'user.email=helm@localhost', '-C', cwd, ...a]);
const notify = msg => { try { sh('/usr/bin/env', ['node', path.join(ROOT, 'bin', 'helm-push.mjs'), msg]); } catch {} };

function runClaude(cwd, model, prompt) {
  return new Promise(resolve => {
    const child = spawn(CLAUDE, [
      '-p', '--output-format', 'json', '--model', model,
      '--permission-mode', 'bypassPermissions', '--add-dir', cwd,
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    ], { cwd });
    let out = '', err = '';
    const kill = setTimeout(() => child.kill(), AGENT_CAP_MS);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(kill); resolve({ code: -1, result: 'spawn error: ' + e.message }); });
    child.on('close', code => {
      clearTimeout(kill);
      let result = '';
      try { result = (JSON.parse(out).result || '').trim(); } catch { result = (out || err).trim().slice(-2000); }
      resolve({ code, result });
    });
    child.stdin.write(prompt); child.stdin.end();
  });
}

async function pool(items, size, fn) {
  const ret = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    while (i < items.length) { const idx = i++; ret[idx] = await fn(items[idx], idx); }
  }));
  return ret;
}

const buildPrompt = t => [
  `You are a Helm BUILD agent working in an isolated git worktree of the ~/secondme repo. Implement ONE feature, fully.`,
  ``,
  `FEATURE: ${t.title}`,
  `SPEC:`,
  t.spec,
  ``,
  `HARD RULES (a reviewer + a smoke gate will check you):`,
  `- Work only in this worktree. NEVER touch ~/helm, the Helm Supabase project, or com.helm.agent.`,
  `- Do NOT edit .env or commit secrets.`,
  `- The smoke test MUST still pass: \`node workspace/tests/smoke.mjs\`. If you add behavior, ADD a smoke check for it; never weaken existing checks.`,
  `- Keep both bots startable: \`node --check index.js\` and \`node --check imessage.js\`.`,
  `- If you need npm packages, \`npm install <pkg>\` here so package.json updates. Keep big downloads lazy where possible.`,
  ``,
  `Build it, run the smoke test yourself, fix anything you broke. Then output a concise summary (<300 words) of what you added and how to use it. No emojis.`,
].join('\n');

const reviewPrompt = (t, builderSummary) => [
  `You are a Helm REVIEW agent. Independently review another agent's implementation in this git worktree.`,
  ``,
  `FEATURE: ${t.title}`,
  `SPEC:`,
  t.spec,
  ``,
  `Builder summary:`,
  builderSummary || '(none)',
  ``,
  `Do this:`,
  `- Read the diff vs main: \`git diff main\``,
  `- Run the smoke test: \`node workspace/tests/smoke.mjs\``,
  `- Verify: meets the spec? repo still startable? no secrets, no ~/helm edits, no weakened tests?`,
  `If anything is wrong, FIX it yourself, then re-run smoke until green.`,
  ``,
  `End with EXACTLY one final line: "VERDICT: APPROVE" or "VERDICT: REJECT - <one line reason>".`,
].join('\n');

(async () => {
  let tasks;
  try { tasks = JSON.parse(readFileSync(TASKS_FILE, 'utf8')); }
  catch (e) { log('cannot read tasks: ' + e.message); process.exit(1); }
  const todo = tasks.filter(t => t.status !== 'done');
  if (!todo.length) { log('no pending tasks'); return; }
  log(`start: ${todo.length} tasks, ${WORKERS} builders / ${REVIEWERS} reviewers, build=${BUILD_MODEL} review=${REVIEW_MODEL}${DRY ? ' [DRY]' : ''}`);

  if (git(ROOT, 'status', '--porcelain').stdout.trim()) {
    git(ROOT, 'add', '-A'); git(ROOT, 'commit', '-q', '-m', `swarm: pre-run snapshot ${ts()}`);
  }
  const baseMain = git(ROOT, 'rev-parse', 'HEAD').stdout.trim();
  log(`base ${baseMain}`);
  mkdirSync(SWARM_WT, { recursive: true });

  for (const t of todo) {
    t._wt = path.join(SWARM_WT, t.id);
    sh('git', ['-C', ROOT, 'worktree', 'remove', '--force', t._wt]);
    git(ROOT, 'branch', '-D', `swarm/${t.id}`);
    const r = git(ROOT, 'worktree', 'add', '-b', `swarm/${t.id}`, t._wt, baseMain);
    if (r.status !== 0) log(`worktree add failed ${t.id}: ${(r.stderr || '').trim()}`);
  }

  log('=== BUILD ===');
  await pool(todo, WORKERS, async t => {
    if (DRY) writeFileSync(path.join(t._wt, `SWARM_DRY_${t.id}.md`), `dry ${t.id} ${ts()}\n`);
    else { const r = await runClaude(t._wt, BUILD_MODEL, buildPrompt(t)); t._build = r.result; log(`built ${t.id} (code ${r.code})`); }
    git(t._wt, 'add', '-A'); git(t._wt, 'commit', '-q', '-m', `swarm build: ${t.id}`);
  });

  log('=== REVIEW ===');
  await pool(todo, REVIEWERS, async t => {
    if (DRY) { t._verdict = 'APPROVE'; return; }
    let r = await runClaude(t._wt, REVIEW_MODEL, reviewPrompt(t, t._build));
    git(t._wt, 'add', '-A'); git(t._wt, 'commit', '-q', '-m', `swarm review: ${t.id}`);
    let v = (r.result.match(/VERDICT:\s*(APPROVE|REJECT)[^\n]*/i) || [''])[0];
    if (/REJECT/i.test(v)) {
      log(`reject ${t.id}: ${v}`);
      const rev = await runClaude(t._wt, BUILD_MODEL, `Revise your "${t.title}" implementation. A reviewer REJECTED it:\n${v}\nFix it, keep \`node workspace/tests/smoke.mjs\` green, then summarize.`);
      git(t._wt, 'add', '-A'); git(t._wt, 'commit', '-q', '-m', `swarm revise: ${t.id}`);
      r = await runClaude(t._wt, REVIEW_MODEL, reviewPrompt(t, rev.result));
      git(t._wt, 'add', '-A'); git(t._wt, 'commit', '-q', '-m', `swarm review2: ${t.id}`);
      v = (r.result.match(/VERDICT:\s*(APPROVE|REJECT)[^\n]*/i) || [''])[0];
    }
    t._verdict = /APPROVE/i.test(v) ? 'APPROVE' : 'REJECT';
    t._vtext = v || '(no verdict line)';
    log(`verdict ${t.id}: ${t._verdict}`);
  });

  log('=== MERGE (gated) ===');
  const results = [];
  for (const t of todo) {
    if (t._verdict !== 'APPROVE') { results.push({ id: t.id, status: 'rejected', note: t._vtext }); continue; }
    const before = git(ROOT, 'rev-parse', 'HEAD').stdout.trim();
    const m = git(ROOT, 'merge', '--no-ff', '--no-edit', `swarm/${t.id}`);
    if (m.status !== 0) {
      // conflict — combine both sides with a resolver agent instead of bailing
      log(`conflict ${t.id}; invoking resolver`);
      await runClaude(ROOT, REVIEW_MODEL, [
        `A git merge of feature branch swarm/${t.id} into main hit CONFLICTS. Resolve them now.`,
        `Feature: ${t.title}`,
        `Run \`git status\` to find conflicted files. Edit each to COMBINE both sides — keep main's existing content AND integrate the feature's additions. For append-style files (workspace/tests/smoke.mjs, workspace/tools/registry.json, .gitignore, workspace/CLAUDE.md) keep ALL entries/checks from both sides; renumber duplicate smoke check numbers so each is unique. Drop no one's work.`,
        `Then \`git add -A\` (do NOT commit). Make sure NO conflict markers remain and \`node workspace/tests/smoke.mjs\` passes. NEVER touch ~/helm.`,
      ].join('\n'));
      if (git(ROOT, 'diff', '--name-only', '--diff-filter=U').stdout.trim()) {
        git(ROOT, 'merge', '--abort'); results.push({ id: t.id, status: 'conflict-unresolved' }); log(`unresolved ${t.id}`); continue;
      }
      git(ROOT, 'commit', '--no-edit');
    }
    if (git(ROOT, 'diff', '--name-only', before, 'HEAD').stdout.includes('package.json')) sh('npm', ['install', '--no-audit', '--no-fund'], { cwd: ROOT, timeout: 10 * 60_000 });
    const smoke = sh('node', ['workspace/tests/smoke.mjs'], { cwd: ROOT, timeout: 12 * 60_000 });
    if (smoke.status !== 0) {
      git(ROOT, 'reset', '--hard', before);
      sh('npm', ['ci', '--no-audit', '--no-fund'], { cwd: ROOT, timeout: 10 * 60_000 });
      results.push({ id: t.id, status: 'reverted-smoke' }); log(`reverted ${t.id} (smoke fail)`);
    } else {
      results.push({ id: t.id, status: 'merged', commit: git(ROOT, 'rev-parse', '--short', 'HEAD').stdout.trim() });
      t.status = 'done'; log(`merged ${t.id}`);
    }
  }

  for (const t of todo) { sh('git', ['-C', ROOT, 'worktree', 'remove', '--force', t._wt]); git(ROOT, 'branch', '-D', `swarm/${t.id}`); }

  if (DRY) { git(ROOT, 'reset', '--hard', baseMain); log('DRY: main restored'); }
  else { writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2)); }

  const summary = results.map(r => `- ${r.id}: ${r.status}${r.commit ? ' (' + r.commit + ')' : ''}${r.note ? ' — ' + r.note : ''}`).join('\n');
  appendFileSync(REPORT, `\n## swarm run ${ts()} ${DRY ? '[DRY] ' : ''}\n${summary}\n`);
  log('DONE\n' + summary);
  const merged = results.filter(r => r.status === 'merged').length;
  if (!DRY) {
    if (merged) { const uid = process.getuid(); sh('launchctl', ['kickstart', '-k', `gui/${uid}/com.helm.discord`]); }
    notify(`Swarm finished: ${merged}/${results.length} features merged.\n${summary}`);
  }
})();
