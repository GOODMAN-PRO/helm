# Helm Repo Scan — Bug Report

_Generated 2026-06-02. Severity for each issue is the reviewer's `adjustedSeverity` from verification._

## Executive Summary

A scan of the Helm repository surfaced **25 confirmed issues**. Every one was verified by direct code read, and most by empirical reproduction on the owner's Windows machine.

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 9 |
| Medium | 11 |
| Low | 5 |
| **Total** | **25** |

**Dominant theme — Windows process spawning (19 of 25 issues).** The codebase repeatedly spawns external commands (`claude`, `npm`, `npx`, `curl`, `/bin/sh`) using hardcoded POSIX paths or bare command names without `{ shell: true }`. On Windows these resolve to `.cmd`/`.ps1`/extension-less npm shims that patched Node refuses to spawn without a shell, producing `ENOENT`/`EINVAL`. The repo already contains the correct pattern (`index.js` `resolveClaude()`, `mcp/check.mjs` `shell: process.platform==='win32'`), so most fixes are a matter of applying the existing in-repo remedy consistently.

**Secondary theme — dangling fleet remnants (4 issues).** The multi-machine "fleet" feature was removed, but the terminal client, dashboard, and public marketing site still reference it (dead commands, a vestigial "Fleet Target" card, and false advertising on the landing page).

The 9 high-severity issues are the ones to fix first: they break core cross-platform features (the build/upgrade swarm, web fetch, GUI automation, the GitHub MCP server, the research swarm, and the first-run memory migration) on the owner's supported Windows target.

---

## Critical

_No critical issues. (Three issues were originally flagged critical but were downgraded to high during verification because they are scoped to build-orchestration tooling rather than the always-on agent, and are conditional on Windows configuration.)_

---

## High

### 1. `migrate.mjs` crashes with "no such column: expired_at" on a fresh `memory.db`

- **File:** `workspace/memory/migrate.mjs:31-35`
- **What's wrong:** The `CREATE TABLE IF NOT EXISTS facts` block (lines 16-27) defines only 8 columns (`id, kind, key, value, source, confidence, created, updated`) — it omits `expired_at`/`valid_from`/`access_count`. Immediately after, lines 31-35 run a dedup `DELETE FROM facts WHERE expired_at IS NULL AND id NOT IN (SELECT MIN(id) ... GROUP BY kind, key)`. Unlike `memory.mjs` (lines 53-60) and `consolidate.mjs` (lines 45-51), `migrate.mjs` has **no** idempotent `ALTER TABLE ... ADD COLUMN expired_at` guard before the DELETE. On a fresh install — the documented primary use case ("one-time migration of CLAUDE.md ... safe to re-run") — the column does not exist and the DELETE throws `ERR_SQLITE_ERROR: no such column: expired_at`, exiting code 1 with 0 facts migrated and a half-initialized DB. Reproduced empirically. The smoke test (`smoke.mjs:205`) masks this because it runs `migrate.mjs` against the already-initialized shared `memory.db`.
- **Fix:** Add the same idempotent column guards the sibling scripts use, immediately after the CREATE TABLE block, e.g. `try { db.exec('ALTER TABLE facts ADD COLUMN expired_at INTEGER'); } catch {}` (plus `valid_from`, `access_count`, and `evidence_count`/`last_seen` for parity). Alternatively add those columns directly to the CREATE TABLE statement. Either makes the script self-sufficient on a fresh DB.

### 2. `web.fetch` / `web.search` hardcode `/usr/bin/curl` — ENOENT on Windows

- **File:** `workspace/tools/impl/web.mjs:22-30`
- **What's wrong:** `curlGet()` calls `spawnSync('/usr/bin/curl', ...)` with an absolute POSIX path. `web.fetch` and `web.search` are registered cross-platform (no `platform: darwin` in `registry.json`), and CLAUDE.md lists web tools as macOS + Windows. On Windows `/usr/bin/curl` does not exist — `spawnSync` returns `error.code ENOENT` (status `null`). `web.fetch` then throws and `process.exit(1)`s with no fallback (fatally broken). `web.search`'s primary DDG-via-curl path always throws and wastes the call before degrading to the Playwright fallback.
- **Fix:** Best: replace curl with Node's built-in global `fetch` (as `reverse.mjs` already does in `fetchPage()`), e.g. `const res = await fetch(url, { headers: { 'User-Agent': UA, ... }, signal: AbortSignal.timeout(20000) }); return await res.text();` — cross-platform, no child process. Minimal: invoke bare `'curl'` (Win10+ ships `curl.exe`, which Node resolves via PATHEXT without a shell) instead of the absolute path.

### 3. `gui.step` runs the action via `/bin/sh` — ENOENT on Windows

- **File:** `workspace/tools/impl/gui_task.mjs:120`
- **What's wrong:** The CLI `main()` executes the `--cmd` action with `spawnSync('/bin/sh', ['-c', cmd], ...)` — hardcoded shell, no `{ shell: true }`, no per-platform branch. `gui.step` is registered cross-platform and CLAUDE.md documents its exact Windows usage. The `await action()` call sits as the first statement of the retry loop, **outside** the only try/finally, so the ENOENT (`action exec failed: spawn /bin/sh ENOENT`) propagates uncaught to the top-level `.catch` and exits 1 on attempt 1, before any screenshot/verify. The retry loop cannot help because ENOENT is deterministic. `gui.step` can never succeed on Windows.
- **Fix:** Pick the shell per-platform: `const sh = process.platform==='win32' ? { cmd: process.env.ComSpec || 'cmd.exe', args: ['/c', cmd] } : { cmd: '/bin/sh', args: ['-c', cmd] };` then `spawnSync(sh.cmd, sh.args, {...})`. Or call `spawnSync(cmd, { shell: true, ... })` so the OS default shell is used.

### 4. Swarm `npm install` spawned without `shell: true` — ENOENT on Windows, breaks deps + reverts good features

- **File:** `workspace/swarm/swarm.mjs:267`
- **What's wrong:** Line 267 calls `sh('npm', ['install','--no-audit','--no-fund'], { cwd: ROOT })` where `sh` (line 48) is a `spawnSync` wrapper with no shell option. On Windows `npm` is `npm.cmd`; spawning a bare `.cmd` without `{ shell: true }` throws ENOENT (verified: status `null`/ENOENT without shell, status 0 with shell). This runs after a merged feature modified `package.json`; the return value is ignored, so the install silently fails, the merged code runs against stale `node_modules`, the smoke test at line 269 fails, and line 271 hard-reverts (`git reset --hard before`) a feature that was actually fine. `index.js` already documents this exact gotcha and wraps `npx` as `cmd /c npx`.
- **Fix:** Pass `shell: true` on win32 for npm, e.g. `const npmCmd = (args, opts) => sh(process.platform==='win32' ? 'npm.cmd' : 'npm', args, { shell: process.platform==='win32', ...opts });` — mirroring the `cmd /c npx` pattern already in `index.js` `loadMcpConfig()`.

### 5. Swarm `npm ci` spawned without `shell: true` — ENOENT on Windows, leaves deps broken for rest of run

- **File:** `workspace/swarm/swarm.mjs:272`
- **What's wrong:** Same defect as line 267, but this is the **restore** path. After `git reset --hard before` reverts a smoke-failing merge (line 271), `sh('npm', ['ci','--no-audit','--no-fund'], { cwd: ROOT })` is meant to bring `node_modules` back in sync with the reverted lockfile. On Windows it throws ENOENT and no-ops silently, leaving `node_modules` out of sync with the reverted tree, corrupting every subsequent task's build/review/smoke in the same swarm run. This is a genuinely distinct code path from line 267 — fixing one does not fix the other.
- **Fix:** Same as line 267 — pass `shell: process.platform==='win32'` (or use `npm.cmd` with `shell: true`) for the `npm ci` call.

### 6. `runClaude` spawns CLAUDE bare (no `resolveClaude`, no shell) — ENOENT on Windows; every swarm agent fails

- **File:** `workspace/swarm/swarm.mjs:56`
- **What's wrong:** `runClaude` (lines 54-74) does `spawn(CLAUDE, [...], { cwd })` where `CLAUDE = process.env.CLAUDE_BIN || 'claude'` (line 35), with no shell option and bypassing `index.js`'s `resolveClaude()`. On Windows `CLAUDE_BIN` commonly points at the extension-less npm shim (`%APPDATA%\npm\claude`) or `claude.cmd`, which Node cannot spawn without a shell (verified: the shim exists on this box and `spawnSync` of it returns ENOENT). `runClaude` is the sole spawn path for every swarm agent (build, review, revision, critic, conflict-resolver), so with a shim/`.cmd` `CLAUDE_BIN` the entire swarm produces zero features. (Currently works in the default state only because `CLAUDE_BIN` is unset and `claude.exe` is on PATH.)
- **Fix:** Reuse `index.js`'s `resolveClaude()`: `const cb = resolveClaude(); spawn(cb.cmd, args, { cwd, shell: cb.shell, windowsHide: true });`. At minimum, on win32 resolve `.cmd`/`.exe` and pass `shell: true` with `windowsHide: true`.

### 7. `coding-task.mjs` `runClaude` spawns CLAUDE bare — ENOENT on Windows; both localize + repair phases fail

- **File:** `workspace/swarm/coding-task.mjs:21`
- **What's wrong:** `runClaude` (lines 19-43) does `spawn(CLAUDE, [...], { cwd })` with `CLAUDE = process.env.CLAUDE_BIN || 'claude'` (line 16), no shell, bypassing `resolveClaude()` — identical root cause to `swarm.mjs:56`. When `CLAUDE_BIN` is the npm shim or `claude.cmd`, both Phase 1 (localize, line 58) and Phase 2 (repair, line 107) receive `{ code: -1, result: 'spawn error: ...ENOENT' }`; the localize result fails to parse, location stays null, and `codingTask` returns a "localize phase failed" error applying nothing. `coding-task.mjs` is cross-platform (not darwin-gated) and runs wherever the brain runs.
- **Fix:** Same as `swarm.mjs:56` — use `resolveClaude()` and pass `{ shell: cb.shell, windowsHide: true }` to `spawn`; or on win32 resolve the `.exe`/`.cmd` and pass `shell: true`.

### 8. `wrap-github` spawns `npx` with `shell: false` — ENOENT on Windows, GitHub MCP server never starts

- **File:** `workspace/mcp/wrap-github.mjs:29-33`
- **What's wrong:** `spawn('npx', ['-y','@modelcontextprotocol/server-github'], { shell: false })`. On Windows `npx` is `npx.cmd`; spawning a `.cmd` with `shell: false` throws ENOENT (reproduced on this box: `npx` → `npx.ps1`/`.cmd`, ENOENT without shell, version printed with shell). The `child.on('error')` handler catches it and `process.exit(1)`, so the bot keeps running but `check.mjs` marks the server DOWN — the GitHub MCP server (enabled in `servers.json`, `healthCheck: "initialize"`) is permanently non-functional on Windows. `check.mjs:47-52` in the same directory does this correctly with `shell: process.platform==='win32'` and a comment explaining the exact gotcha.
- **Fix:** Pass `shell: process.platform === 'win32'` to the `spawn()` call (matching `check.mjs`), or on Windows use `'npx.cmd'`. **Note:** the identical bug exists in the two sibling wrappers `wrap-brave-search.mjs:29-33` and `wrap-google-workspace.mjs:46-50` (see Medium #7 and #8) — apply the same fix to all three.

### 9. Research swarm spawns the claude engine with a bare command and no shell — fails on Windows

- **File:** `workspace/research/research-swarm.mjs:33`
- **What's wrong:** `spawn(CLAUDE, ['-p', ...], { cwd })` where `CLAUDE = process.env.CLAUDE_BIN || 'claude'` (line 17), with no shell flag, no `resolveClaude()`, no `windowsHide`. On Windows the engine on disk is `claude.cmd`/`claude.exe`; with `shell: false` Node does no PATHEXT resolution, so bare `claude` throws ENOENT (and an explicit `.cmd` path throws EINVAL on patched Node). `child.on('error')` swallows the throw and resolves `{ code: -1 }`, so every research worker **and** the synthesis pass silently fail — zero reports under `workspace/research/reports` and no `HELM-UPGRADE-PLAN.md` are produced, while the script still logs "DONE".
- **Fix:** Replicate `index.js`'s `resolveClaude()` and pass the shell flag: `const cb = resolveClaude(); spawn(cb.cmd, args, { cwd, shell: cb.shell, windowsHide: true });`. Minimal fix: `spawn(CLAUDE, args, { cwd, shell: process.platform==='win32' })`.

---

## Medium

### 1. Nightly self-upgrade spawns claude without Windows shim resolution

- **File:** `workspace/upgrades/self-upgrade.mjs:149-153`
- **What's wrong:** `spawnSync(CLAUDE_BIN, ['-p', ...])` with no shell option and `CLAUDE_BIN` defaulting to `'claude'`. The **same file** explicitly handles this hazard for npm (lines 35-38: "patched Node refuses to spawn a `.cmd` without a shell" → npm uses `{ shell: IS_WIN }`) but not for the claude spawn. When `CLAUDE_BIN` is a `.cmd`/extension-less shim on Windows, the spawn errors, `cl.stdout` is empty, `JSON.parse` throws, the catch falls back to empty, claude makes no changes, the node-check + smoke gate trivially passes on an unchanged tree, and the run commits a no-op "self-upgrade" and even pushes — a silent permanent no-op of the entire self-improvement feature. Latent on this box only because `.env` pins `CLAUDE_BIN` to a real `claude.exe`.
- **Fix:** Mirror `index.js` `resolveClaude()`: compute `{ cmd, shell }` from `CLAUDE_BIN` for win32 (existing `.exe` → `shell: false`; `.cmd`/`.bat`/shim → `shell: true`, prefer sibling `.exe`) and pass `shell` to `spawnSync`. Reuse the helper already present for npm.

### 2. Scheduler daemon spawns claude without Windows shim resolution

- **File:** `workspace/scheduler/scheduler.mjs:101`
- **What's wrong:** `spawn(CLAUDE_BIN, args, { cwd: WORKSPACE })` with `CLAUDE_BIN` defaulting to `'claude'` and no `{ shell }`, not using `resolveClaude()`. On a standard Windows `npm install -g` setup with `CLAUDE_BIN` unset, `claude` resolves to the npm `claude.cmd` shim; spawning a `.cmd` with `shell: false` throws EINVAL/ENOENT. `child.on('error')` (line 142) catches it so the daemon survives, but `finaliseRun` writes "ERROR" to the run dir and `pushOwner()` (only inside `child.on('close')`) never fires — so every scheduled job silently fails with no owner notification. Latent on this box because `.env` pins `CLAUDE_BIN` to a real `.exe`.
- **Fix:** Resolve `CLAUDE_BIN` the way `index.js` does and spawn with the computed `{ shell }`. Optionally factor `resolveClaude()` into a shared module imported by `index.js`, `scheduler.mjs`, `think.mjs`, `self-upgrade.mjs`, and `plan.mjs` (which share this pattern).

### 3. Background think tick spawns claude without Windows shim resolution

- **File:** `workspace/think/think.mjs:178-182`
- **What's wrong:** `spawnSync(CLAUDE_BIN, ['-p', ...], { cwd: WORKSPACE, input: prompt, ... })` with `CLAUDE_BIN` default `'claude'` and no `{ shell }`. On a Windows npm-shim install this errors, `JSON.parse(r.stdout)` throws into the inner catch, and the journal records "(no output)" — so every ~15-min think tick and the weekly deep review silently produce nothing, rendering the entire background-cognition subsystem inert. Does not crash. Latent on this box because `.env` points `CLAUDE_BIN` at `claude.exe`. (Minor: the weekly mark is correctly gated on `r.status===0`, so it is retried rather than suppressed — slightly better than a worst case.)
- **Fix:** Apply `index.js` `resolveClaude()` logic and pass the computed `{ shell }` to the `spawnSync` on line 178.

### 4. `vision.*` spawns literal `'claude'` raw — ignores `CLAUDE_BIN`, breaks on `.cmd`-only Windows installs

- **File:** `workspace/tools/impl/vision.mjs:35-46`
- **What's wrong:** `askClaude()` does `spawnSync('claude', [...], { input, ... })` with no shell handling and **ignoring** `process.env.CLAUDE_BIN`. `vision.describe/find/verify` are registered cross-platform. This is the only claude-invoking script in the repo that does not honor `CLAUDE_BIN`. Two concrete failures regardless of PATH luck: (1) a configured `CLAUDE_BIN` pointing outside PATH (which the install scripts write into `.env` precisely because the bare name often is not resolvable) is silently ignored → ENOENT; (2) on Windows installs exposing only `claude.cmd`, `spawnSync('claude', ...)` without `{ shell: true }` throws ENOENT.
- **Fix:** Read `const bin = process.env.CLAUDE_BIN || 'claude'`, and on win32 prefer `.exe` / fall back to `.cmd` with `{ shell: true }`, like `image.read.mjs`'s `claudeCmd()`. Factor `claudeCmd()` into a shared module and import it here.

### 5. `gui.step`'s verify call spawns literal `'claude'` raw — ignores `CLAUDE_BIN`, fragile on Windows

- **File:** `workspace/tools/impl/gui_task.mjs:39-50`
- **What's wrong:** `verifyWithClaude()` does `spawnSync('claude', [...])` with no shell handling and ignoring `CLAUDE_BIN`, same as `vision.mjs`. Breaks on Windows installs where `claude` is only a `.cmd` shim (Node cannot spawn `.cmd` without `shell: true`) and ignores a `CLAUDE_BIN` configured to a non-PATH location (→ throws "claude verify call failed (exit null)"). Combined with the `/bin/sh` bug (High #3), `gui.step` has two independent Windows failure points.
- **Fix:** Resolve claude via the shared `resolveClaude`/`claudeCmd` helper (`CLAUDE_BIN`-aware, `.exe`-then-`.cmd`-with-shell) and pass `{ cmd, shell }` into `spawnSync` instead of the literal `'claude'`.

### 6. `mind` tool spawns `CLAUDE_BIN` without `.cmd`/shell resolution

- **File:** `workspace/tools/impl/mind.mjs:22, 58-64`
- **What's wrong:** `CLAUDE_BIN` is read (good), but `run()` does `spawnSync(CLAUDE_BIN, [...], { input, ... })` with no shell handling. `.env.example` ships `CLAUDE_BIN=claude` (extension-less), and on a Windows install where `CLAUDE_BIN` resolves to the npm `.cmd`/extension-less shim, `spawnSync` without `{ shell: true }` throws ENOENT/EINVAL (verified on this box for `.cmd`). Every `mind` verb (save/capture/find/synthesize/research/daily/recap/health) and the nightly `com.helm.mind` agent then fail, while `index.js` keeps working — inconsistent. Latent on this box because `.env` overrides `CLAUDE_BIN` to a real `.exe`.
- **Fix:** Apply the same `resolveClaude` logic used in `index.js`: on win32, if `CLAUDE_BIN` is `.cmd`/`.bat`/extension-less, set `shell: true` (or prefer the sibling `.exe`), then `spawnSync(cmd, args, { shell, input, ... })`. Import a shared helper rather than duplicating.

### 7. `wrap-google-workspace` spawns `npx` with `shell: false` — ENOENT on Windows

- **File:** `workspace/mcp/wrap-google-workspace.mjs:46-50`
- **What's wrong:** Same defect as `wrap-github`: `spawn('npx', ['-y','@modelcontextprotocol/server-google-workspace'], { shell: false })` throws ENOENT on Windows because `npx` is `npx.cmd`. The error is caught (`exit 1`) so the bot survives, but the Google Workspace MCP server (Calendar + Gmail) is dead on Windows. (Credential-gated, so presently inert anyway, but a genuine cross-platform functional bug.)
- **Fix:** Add `shell: process.platform === 'win32'` to the spawn options (matching `workspace/mcp/check.mjs:51`).

### 8. `wrap-brave-search` spawns `npx` with `shell: false` — ENOENT on Windows

- **File:** `workspace/mcp/wrap-brave-search.mjs:29-33`
- **What's wrong:** Same defect: `spawn('npx', ['-y','@modelcontextprotocol/server-brave-search'], { shell: false })` throws ENOENT on Windows (`npx.cmd`). Caught and `exit 1`, so the bot starts but the Brave Search MCP server (enabled in `servers.json`, `healthCheck: "initialize"`) is permanently DOWN on Windows. Only reached after `BRAVE_API_KEY` is set.
- **Fix:** Add `shell: process.platform === 'win32'` to the spawn options (matching `workspace/mcp/check.mjs:51`).

### 9. `compact.mjs` reads stdin via POSIX-only `/dev/stdin` — silently empty on Windows

- **File:** `workspace/sessions/compact.mjs:162`
- **What's wrong:** `context = readFileSync('/dev/stdin', 'utf8')` inside a bare try/catch. On Windows Node resolves the path to `C:\dev\stdin`, which does not exist, so the read throws ENOENT, the `catch {}` swallows it, and `context` stays `''`. The CLI then hits the `!context.trim()` guard at line 165 and exits 1 with "no input" **even when data was piped in**. So `type file | node compact.mjs` (the documented stdin path) never works on Windows. Reproduced empirically. `secrets.mjs:67` already uses the cross-platform form `readFileSync(0, 'utf8')`.
- **Fix:** Read from file descriptor 0: `context = readFileSync(0, 'utf8')` (works on macOS, Linux, and Windows).

### 10. Secrets vault key store is macOS-only (`/usr/bin/security`) — disables all credential MCP servers on Windows

- **File:** `workspace/secrets/secrets.mjs:33-46`
- **What's wrong:** `keychainGet()`/`keychainSet()` call `spawnSync('/usr/bin/security', ...)` with no `process.platform` guard and no Windows backend. On Windows that binary returns ENOENT, so `keychainGet()` returns null; `getKey()` then `die()`s with "no vault key" unless `HELM_VAULT_KEY` is set, and `init` fails because `keychainSet()` errors. Consequence: on Windows without `HELM_VAULT_KEY`, every `secrets.mjs get <KEY>` exits non-zero, so `wrap-github`/`wrap-google-workspace`/`wrap-brave-search` all treat the key as missing and the credential-gated MCP servers are all DOWN. CLAUDE.md (lines 84-87, 359) claims secrets work cross-platform. The undocumented `HELM_VAULT_KEY` env escape hatch exists and the bot degrades rather than crashing, hence medium.
- **Fix:** Add a Windows key backend gated on `process.platform` (e.g. DPAPI via a small PowerShell call, or an OS-appropriate protected file), falling back to the existing Keychain path on darwin. At minimum, document that `HELM_VAULT_KEY` must be set on Windows and make the "no vault key" message say so.

### 11. Terminal client advertises removed `use` / `where` fleet commands the brain no longer handles

- **File:** `cli.js:127-128`
- **What's wrong:** The `COMMANDS` menu still lists `where` ("show which machine (peer) is active") and `use` ("switch active machine: use mac | use windows") — pure fleet routing. `cli.js` sends every command as plain text via `{ type: 'msg', text }` (line 390), and `index.js` has **no** handler for `use` or `where` (the only `where` matches are the Windows `where claude` executable lookup). So typing `where` or `use windows` leaks the raw string to the LLM as a prompt instead of doing anything — a dead command surface pointing at deleted functionality. Degrades gracefully (no crash) but is misleading.
- **Fix:** Remove the `where` and `use` entries from the `COMMANDS` array (`cli.js:127-128`); drop `use` (and the now-unused `pull|push`, which `index.js` also does not handle) from the `takesArgs` regex at `cli.js:400`; and remove the stale "run ... where immediately" comment at line 402.

---

## Low

### 1. `plan.mjs` hardcodes `'claude'` and ignores `CLAUDE_BIN` entirely

- **File:** `workspace/plans/plan.mjs:141-149`
- **What's wrong:** `claudeOneTurn()` calls `spawnSync('claude', [...])` with no shell option. This is the only claude-invoking module in scope that never reads `process.env.CLAUDE_BIN` at all, so the configured engine path is ignored and it relies on bare `claude` being on PATH. On Windows, if the only `claude` on PATH is the npm shim, `spawnSync` without `{ shell: true }` errors and `claudeOneTurn` returns null, silently disabling step-failure reflexion (`complete --failed`) and LLM replan. Verified latent on this box (PATH prefers the real `.exe`, so it currently works); it will break in the precise scenario `CLAUDE_BIN` exists for (engine installed off-PATH). Call sites guard it, so it fails gracefully — hence low.
- **Fix:** Read `const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'` and resolve it like `index.js` `resolveClaude()`: on win32 prefer an existing `.exe` (`shell: false`); for a `.cmd`/`.bat`/extension-less shim use `{ shell: true }` (and prefer the sibling `.exe`). Pass `{ input: prompt, encoding: 'utf8', timeout, shell }` to `spawnSync`.

### 2. Cron day-of-month and day-of-week combined with AND instead of standard OR

- **File:** `workspace/scheduler/cron.mjs:44-48`
- **What's wrong:** `cronMatches()` unconditionally ANDs all five fields. Standard Vixie/POSIX cron uses **OR** for the day fields when both day-of-month and day-of-week are non-`*`: the job fires if either matches. Verified: `cronMatches('0 0 13 * 5', Sat 2026-06-13)` returns false, but standard cron fires (13th OR Friday). A job like `'0 9 13 * 1'` ("9am on the 13th or on Mondays") would only ever fire when the 13th is a Monday. Latent because the only common shape affected requires restricting both day fields; the scheduler's own demo job `'0 9 * * 1-5'` (dom `*`) is unaffected. No crash — silent under-firing.
- **Fix:** In `cronMatches`, special-case the day fields: if both `domF !== '*'` and `dowF !== '*'`, match when `(dom matches getUTCDate())` **OR** `(dow matches getUTCDay())`; otherwise keep the current per-field AND. `nextCronDate` inherits the fix automatically.

### 3. Dead "fleet target" remnant — reads non-existent `workspace/active-target`, always renders "mac"

- **File:** `workspace/dashboard/server.mjs:120-126`
- **What's wrong:** `fleetTarget()` reads `workspace/active-target` and the dashboard renders a "Fleet Target" card (lines 167, 403-404, 454-455). The multi-machine fleet feature was removed; `active-target` is never written anywhere in the repo (only this read remains, plus the removed Swift dashboard), so the card always shows the hardcoded default `'mac'`. Dead fleet UI showing misleading info; no crash. `smoke.mjs:477` asserts the `fleetTarget` key exists, so it must be updated in the same change.
- **Fix:** Remove the `fleetTarget()` collector, the `state.fleetTarget` field, and the "Fleet Target" card (both the server-side and inline client `renderAllCards`), and drop `'fleetTarget'` from the `smoke.mjs` key list at line 477.

### 4. Public marketing site still promises the removed multi-machine fleet feature

- **File:** `docs/index.html:7, 226, 276, 280, 320`
- **What's wrong:** The shipped landing page advertises a removed capability: meta description "give it full shell, files, screen and your whole fleet" (line 7); a feature card `<h3>Your whole fleet</h3><p>Swap between your Mac and Windows box mid-conversation over Tailscale. One agent, every machine.</p>` (line 226); the comparison lead "ties your whole fleet together" (line 276); and a comparison chip (line 280) and table row (line 320) "Multi-machine fleet (Mac + Windows)" with a ✓ for Helm. The codebase has no `runClaudeRemote`/scp/SSH routing left, and `index.js`/`workspace/CLAUDE.md` explicitly state there is no fleet/peer/cross-machine sync; the wizard even strips leftover fleet env keys. This is user-facing false advertising of deleted functionality. Pure marketing copy, no runtime impact — hence low.
- **Fix:** Remove the "Your whole fleet" feature card (line 226), the "Multi-machine fleet" comparison chip (line 280) and table row (line 320), and edit the meta description (line 7) and comparison lead (line 276) to drop the fleet claims.

### 5. Dashboard still renders a vestigial "Fleet Target" card from removed fleet state

- **File:** `workspace/dashboard/server.mjs:120-126, 167, 403-404, 454`
- **What's wrong:** Same vestigial fleet concept as Low #3, enumerated across all its wiring. `fleetTarget()` (lines 120-126) reads `workspace/active-target` — a file that is never created (install's copy filter at `bin/helm-install.mjs:65` excludes it) — and defaults to `'mac'`. It is wired into `/api/state` (line 167) and rendered as a "Fleet Target" card in both the client-side JS renderer (lines 403-404) and the no-JS fallback (line 454), always showing a meaningless `'mac'`. The try/catch means no crash, but it is dead UI surfacing a removed concept.
- **Fix:** Delete the `fleetTarget()` function, the `fleetTarget` field in the `/api/state` object (line 167), and the two "Fleet Target" card renders (lines 403-404 and 454). Update `smoke.mjs:477` so its `/api/state` key assertion no longer requires `fleetTarget`.

---

_End of report. 25 confirmed issues (0 critical, 9 high, 11 medium, 5 low)._
