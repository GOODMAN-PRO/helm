# Helm Full-Stack Builder — BUILD CONTRACT (single source of truth)

This subsystem gives Helm the ability to build **real, working, high-quality full-stack websites and
apps** by orchestrating 20+ specialized expert agents. Multiple agents are building this system in
parallel; **every file MUST conform to the interfaces below exactly** so the pieces integrate cleanly.

## Hard rules for every file
- ES module (`.mjs`), Node 22+. Built-ins only (`node:fs`, `node:path`, `node:child_process`, `node:os`,
  `node:url`). **No new npm dependencies.**
- Library functions **never throw** — catch internally and return a structured result. Only the CLI may exit non-zero.
- Match the existing repo style (look at `/Users/Nice/helm/workspace/tools/impl/reverse.mjs` for tone:
  terse comments explaining *why*, small helpers, defensive code).
- Include a self-test guarded by `if (process.argv[1] === fileURLToPath(import.meta.url))` that MOCKS any
  collaborator (never spawn a real `claude` in a test) and prints a quick pass/fail. Delete throwaway files.
- Do NOT edit files other than the one(s) assigned to you. Do NOT git commit, push, or restart services.

## Engine ⇄ collaborators import the documented signatures only. For self-tests, mock collaborators.

---

## 1. Role schema  (role files in `workspace/builder/roles/*.mjs`)
Each role file exports `export const roles = [Role, ...]`. A Role:
```js
{
  id: 'product-manager',          // unique kebab-case
  title: 'Product Manager',
  phase: 'discovery',             // one of PHASE_ORDER below
  deps: [],                       // role ids that must finish before this runs
  model: 'opus' | 'sonnet' | 'haiku',  // engine hint; use 'opus' for hard design/architecture, 'sonnet' for most, 'haiku' for trivial
  produces: ['PRD'],              // logical artifact keys this role writes via ctx.setArtifact(), and/or it writes real project files
  system: '...',                  // the role's expert persona/framing (a rich, opinionated senior-expert system prompt)
  task(ctx) { return '...task instruction string...'; }  // uses ctx (see §2) to produce the concrete instruction for this build
}
```
`PHASE_ORDER` (owned by orchestrator): `['discovery','architecture','design','scaffold','data','backend','auth','frontend','integration','quality','finalize']`.

Role `system` + `task` are PROMPTS sent to a coding agent that has full file-write tools in the project
dir. They must demand **production-quality, fully-wired, NO-STUB** output (no TODO, no "not implemented",
no lorem ipsum, no fake data unless seeding, no commented-out placeholders). Tell the agent to write to
real files in the project and to record concise specs via the artifact mechanism described in the task.

---

## 2. BuildContext  (`workspace/builder/context.mjs`)
```js
export function createContext({ brief, stack, projectDir }) -> ctx
```
`ctx` shape:
```js
{
  brief: string,                 // the user's app/website idea (verbatim)
  stack: StackPreset,            // resolved stack object (see §6)
  projectDir: string,            // absolute path to the generated project root
  buildDir: string,              // absolute: <projectDir>/.helm-build  (specs/logs/state live here)
  getArtifact(key): string|null, // read a stored spec artifact (persisted under buildDir/artifacts/<key>.md)
  setArtifact(key, content): void,
  listArtifacts(): string[],     // artifact keys present
  artifactsDigest(maxChars=8000): string,  // concatenated "## <key>\n<content>" of all artifacts, capped — for prompt context
  readFile(rel): string|null,    // read a file relative to projectDir
  log(msg): void,                // append to buildDir/build.log (and console.error)
  state: object,                 // free-form, persisted to buildDir/state.json via saveState()
  saveState(): void,
}
```
`createContext` must `mkdirSync` buildDir + artifacts dir. Never throw.

---

## 3. Agent runner  (`workspace/builder/agent-runner.mjs`)
```js
export const ANTI_STUB_RULES = `...`;          // shared string appended to every agent prompt (no stubs/TODOs/placeholders; wire everything; runnable code only)
export function resolveClaudeBin(): string;     // CLAUDE_BIN env, then ~/.local/bin/claude, ~/.claude/local/claude, /opt/homebrew/bin/claude, /usr/local/bin/claude, else 'claude'
export async function runRole(role, ctx, opts = {}) -> { ok, role, output, durationMs, error? }
```
`opts = { dryRun=false, timeoutMs=600000, onEvent }`.
Behavior: assemble prompt = `role.system` + a shared header (the brief, the resolved stack summary, and
`ctx.artifactsDigest()` so the agent sees prior specs) + `role.task(ctx)` + `ANTI_STUB_RULES`. Then spawn:
`<claudeBin> -p --model <role.model> --permission-mode bypassPermissions --add-dir <ctx.projectDir> --add-dir <ctx.buildDir>`
with `cwd: ctx.projectDir`, `input: prompt`, `windowsHide:true`, a generous `maxBuffer`, and `timeoutMs`.
The agent itself writes project files; `runRole` returns the agent's stdout as `output`. If `dryRun`, do
NOT spawn — return `{ ok:true, role:role.id, output:'[dry-run] '+role.title, durationMs:0 }`. Never throw
(catch spawn errors → `{ ok:false, error }`).

---

## 4. Orchestrator  (`workspace/builder/orchestrator.mjs`)
```js
export const PHASE_ORDER = [...];   // as in §1
export async function buildApp(options) -> Result
```
`options = { brief, stack, outDir, dryRun=false, concurrency=3, maxFixRounds=2, onProgress,
             _runRole, _roles, _verify, _gates }`  // underscore props are test injection overrides
Pipeline:
1. Resolve stack (`import { resolveStack } from './stack.mjs'`; or use injected).
2. Determine `projectDir` (outDir, default `<repo>/workspace/builder/out/<slug-of-brief>-<ts>`).
3. Scaffold the project via `stack.scaffold(projectDir)` (skip in dryRun).
4. `createContext({brief, stack, projectDir})`.
5. Load all roles: default `import { getAllRoles } from './roles.mjs'` (an aggregator created at
   integration). Tolerate it being absent by falling back to `_roles` or `[]` — DO NOT hard-crash if
   `./roles.mjs` doesn't exist yet (use a dynamic import in try/catch).
6. Schedule: group by `PHASE_ORDER`; within a phase, respect `deps`; run ready roles with a concurrency
   cap (`concurrency`). Call `runRole(role, ctx, {dryRun, onEvent})` (default import from
   `./agent-runner.mjs`, or injected `_runRole`). Emit `onProgress({phase, role, status})`.
7. After implementation phases, run `verifyProject(projectDir)` (`./verify.mjs` or `_verify`) and
   `runQualityGates(projectDir, ctx)` (`./quality-gates.mjs` or `_gates`).
8. Fix loop: while `!verify.ok` and rounds < `maxFixRounds`, run an internal **bug-fixer** step — a
   `runRole` call with a synthesized fixer role (id `auto-fixer`, model `sonnet`) whose task includes the
   failing step names + error excerpts from verify, instructing it to fix the project so build/tests pass;
   then re-verify. (Skip in dryRun.)
9. Build a Markdown report string (phases, roles run, artifacts, verify steps, gate results, project path).
Return `Result = { ok, projectDir, report, roleResults:[{role,ok,durationMs}], verify, gates, phases }`.
Never throw — on fatal error return `{ ok:false, error, projectDir }`.
Must support `dryRun` end-to-end WITHOUT spawning claude or scaffolding (so it can be unit-tested): in
dryRun, skip scaffold/verify/gates/fix-loop and just produce the planned ordering + report.

---

## 5. Verify  (`workspace/builder/verify.mjs`)
```js
export async function verifyProject(projectDir, opts = {}) -> { ok, steps:[{name,ok,output,durationMs,skipped?}], summary, pm }
```
Detect package manager from lockfile (`pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, `bun.lockb`→bun, else npm).
Run, in order, only those that exist (read package.json scripts): install (`<pm> install`), typecheck
(`tsc --noEmit` or `<pm> run typecheck`), lint (`<pm> run lint`), build (`<pm> run build`), test
(`<pm> run test`/`vitest run`). Each step: spawnSync with a timeout (install 300s, build 300s, others
120s), capture last ~3000 chars of combined output, record ok by exit code. `ok` = build step passed (and
typecheck if present). Never throw. If projectDir has no package.json → `{ ok:false, summary:'no project' }`.

---

## 6. Stacks  (`workspace/builder/stack.mjs`)
```js
export const STACKS = { 'next-fullstack': StackPreset, 'astro-site': StackPreset, 'vite-react-spa': StackPreset };
export function resolveStack(hint) -> StackPreset   // hint = stack id OR the brief text (keyword match); default 'next-fullstack'
```
`StackPreset`:
```js
{
  id, label, summary,                  // summary = 1-2 lines describing the stack (used in prompts)
  packageManager: 'npm'|'pnpm',
  devCommand, buildCommand, testCommand, lintCommand,   // strings
  async scaffold(projectDir) -> { ok, output, error? }  // runs the scaffolder (e.g. create-next-app) non-interactively; mkdir -p parent; never throw
  notes,                               // guidance injected into engineer prompts (conventions, dirs)
}
```
**Default `next-fullstack`:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Prisma ORM
(SQLite dev) + Auth.js (NextAuth v5) + Zod + Vitest + Playwright + ESLint/Prettier; pnpm preferred, npm
fallback. `scaffold` should run create-next-app non-interactively, e.g.:
`npx --yes create-next-app@latest <dir> --ts --tailwind --eslint --app --src-dir --use-npm --no-import-alias --no-turbopack`
(verify the flags; fall back gracefully). `scaffold` may be a no-op stub that returns `{ok:true}` if the
network/CLI is unavailable — but document it.

---

## 7. Quality gates  (`workspace/builder/quality-gates.mjs`)
```js
export function scanForStubs(projectDir) -> { ok, findings:[{file,line,kind,excerpt}] }   // TODO/FIXME, 'not implemented', throw-stub, lorem ipsum, placeholder URLs, empty handlers
export async function runQualityGates(projectDir, ctx) -> { ok, gates:[{name,ok,details}] }
```
Gates (static, fast, no network): anti-stub scan; secrets-not-committed (`.env` not tracked / `.gitignore`
present); a11y heuristics (img has alt, html has lang, buttons have text) over built/source HTML/JSX;
SEO heuristics (title + meta description + Open Graph present) for sites; dependency sanity. Each gate is
advisory (`ok` boolean + details). `runQualityGates.ok` = no critical gate failed (stubs are critical).
Never throw.

---

## Integration (done by the integrator, not you): a `roles.mjs` aggregator exporting `getAllRoles()` that
imports every `roles/*.mjs` and concatenates their `roles`; a `cli.mjs`; a Helm skill; a tool-registry
entry; CLAUDE.md docs. Build your assigned file to the contract above and it will slot in.
