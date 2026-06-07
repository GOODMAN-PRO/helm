# Helm Security Audit Review by Codex

Date: 2026-06-07

Scope: static review of the repository, install scripts, runtime entry points, tool registry, MCP configuration, service setup, secrets handling, and dependency audit output.

## Executive Summary

I did not find obvious covert malware patterns such as obfuscated payloads, hidden crypto-mining, or unexplained exfiltration endpoints in the reviewed source. The project is, however, intentionally high-risk software: it is a local autonomous agent that can run shell commands, read and write files, access the user home directory, control the GUI, use browser automation, interact with personal communication channels, schedule work, and self-modify its own code.

I would not recommend running this on a primary personal machine without isolation. The safest posture is to treat Helm like a powerful local admin assistant with prompt-injection exposure and broad ambient authority.

## High-Risk Findings

### 1. Home Directory Is Granted To Claude Code

The main Discord, iMessage, and scheduler paths pass both the Helm workspace and the user's home directory to Claude Code:

- `index.js`: builds Claude args with `--add-dir WORKSPACE` and `--add-dir os.homedir()`.
- `imessage.js`: same pattern for iMessage conversations.
- `workspace/scheduler/scheduler.mjs`: same pattern for scheduled jobs.

This means ordinary chat prompts, prompt-injected web/file content, or scheduled payloads may lead the model-agent to inspect or modify files across the user's home directory, depending on Claude Code permission mode.

Recommendation: do not add the full home directory by default. Prefer a dedicated workspace allowlist, with opt-in extra directories per task.

### 2. Runtime Defaults Fall Back To Full Autonomy

The `.env.example` correctly sets:

```env
PERMISSION_MODE=default
```

But multiple runtime entry points default to `bypassPermissions` if the environment variable is missing:

- `index.js`
- `imessage.js`
- `workspace/scheduler/scheduler.mjs`

This is a dangerous failure mode. A malformed, partial, or manually-created `.env` can silently move the system into full autonomy.

Recommendation: make `default` the code fallback everywhere, and require an explicit `PERMISSION_MODE=bypassPermissions` plus a prominent warning for full autonomy.

### 3. Nightly Self-Upgrade Is Autonomous Code Mutation

The service installer registers a nightly self-upgrade job unless `HELM_SKIP_SELFUPGRADE=1` is set. The self-upgrade script:

- commits a pre-upgrade snapshot,
- runs `npm update`,
- invokes Claude Code with `--permission-mode bypassPermissions`,
- edits the repository,
- runs syntax/smoke checks,
- commits changes,
- restarts the bot,
- may push to `origin main`.

The rollback logic and smoke tests are useful, but this remains autonomous code mutation and optional network push from an LLM-driven process.

Recommendation: make self-upgrade opt-in, never default. Disable push by default. Require a human review step before applying or publishing generated changes.

### 4. Runtime `npx -y` And `@latest` MCP Tools Increase Supply-Chain Risk

`workspace/mcp/servers.json` starts MCP servers using `npx -y`, including:

- `@modelcontextprotocol/server-filesystem`
- `@playwright/mcp@latest`

This means runtime behavior can depend on packages resolved from npm at execution time. The `@latest` pin is especially risky for a security-sensitive local agent.

Recommendation: pin exact versions, commit lockfiles or vendor wrappers, and avoid `npx -y` in privileged runtime paths.

### 5. Dependency Audit Found A Critical Transitive Vulnerability

`npm audit --omit=dev --package-lock-only` on the root package reported 4 vulnerabilities, including 1 critical, through:

```text
@xenova/transformers@2.17.2
  -> onnxruntime-web@1.14.0
  -> onnx-proto@4.0.4
  -> protobufjs@6.11.6
```

The audit reported multiple `protobufjs` advisories, including arbitrary/code execution and denial-of-service classes. The desktop package audit returned 0 vulnerabilities.

The embedding code does set `allowRemoteModels = false` during normal runtime, which reduces one model-loading risk. However, the vulnerable packages are still installed and importable in the agent process.

Recommendation: remove this dependency path or upgrade/replace it with a maintained embedding implementation whose dependency chain audits cleanly.

## Medium-Risk Findings

### 6. Install Script Performs Broad Network And State-Changing Actions

`install.sh` can:

- download Node from `nodejs.org`,
- install Claude Code globally with npm,
- clone or download Helm,
- run `npm install --no-audit`,
- run `npm link`,
- update an existing git install,
- use `git reset --hard origin/<branch>` after failed fast-forward.

These actions are mostly visible and conventional for an installer, but they are too broad for a one-line `curl | sh` command on an untrusted project.

Recommendation: document a safer manual install path first. Avoid `curl | sh` as the primary recommendation for a tool with local-machine control.

### 7. Tool Confirmation Coverage Is Inconsistent

The registry confirmation layer protects some risky tools, such as email sending, iMessage sending, calendar add, microphone recording, and process killing.

Other impactful actions are not confirmation-gated at the registry layer, including:

- GUI clicks and typing,
- clipboard writes,
- browser actions,
- file organization and rename operations,
- scheduled job registration,
- flow execution.

Claude Code's own permission prompt may still apply in `PERMISSION_MODE=default`, but registry-level side-effect marking is inconsistent.

Recommendation: require confirmation for all tools that modify user state, interact with external accounts, operate GUI input, alter files outside the workspace, or schedule future execution.

### 8. Personal Data Sensors Are Extensive

The project includes tools or daemons for:

- screen capture and OCR,
- notification polling,
- iMessage reading/sending,
- Gmail reading/sending,
- calendar access,
- location lookup,
- microphone recording/transcription,
- browser sessions with persisted cookies.

These are not hidden, and many are documented, but the combined privacy surface is large.

Recommendation: use per-capability opt-in, show enabled sensors in `helm doctor`, and keep each data source disabled until explicitly configured.

## Positive Findings

- Discord command handling is owner-locked to `OWNER_ID`.
- `.env.example` recommends `PERMISSION_MODE=default`.
- Secrets are encrypted with AES-256-GCM.
- The vault master key uses macOS Keychain, Windows Credential Manager, or a `0600` local keyfile depending on platform.
- `.gitignore` excludes `.env`, vault files, master keys, browser profiles, screenshots, audio, databases, owner profile data, inbox files, generated reports, and runtime state.
- The tool runner has a simple confirmation mechanism and a circuit breaker for repeated failures.
- The README is unusually candid that this is not sandboxed software and can control the user's machine.

## Suggested Safe-Use Guidance

For anyone testing Helm before deeper hardening:

1. Use a VM or a separate OS user account.
2. Do not connect personal iCloud, Messages, Gmail, Keychain, or browser profiles.
3. Set `PERMISSION_MODE=default` explicitly.
4. Set `HELM_SKIP_SELFUPGRADE=1` before installing services.
5. Disable or remove MCP entries that use `npx -y` or `@latest`.
6. Do not grant full home-directory access.
7. Fix the root dependency audit issue before regular use.
8. Avoid storing real credentials until the trust model is narrowed.

## Overall Assessment

Helm appears to be an interesting and ambitious local agent framework, not stealth malware. The core security issue is architectural: the system intentionally combines broad local privileges, persistent memory, external communications, GUI automation, scheduled execution, and autonomous self-modification.

That design can be useful, but it is not safe-by-default. It should be treated as experimental privileged automation and run only in an isolated environment unless the defaults and trust boundaries are tightened.
