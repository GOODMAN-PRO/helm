#!/usr/bin/env node
// workspace/tools/impl/gui_task.mjs
// guiStep(action, description, maxRetries=3)
//   Run an action (async fn), screenshot, ask claude -p "did <description> succeed?",
//   retry on NO with failure classification: WRONG_ELEMENT | NOT_FOUND | PAGE_NOT_LOADED | AUTH_WALL
//
// CLI (for the tool registry):
//   gui_task.mjs --cmd "<shell>" --description "<expected>" [--retries <n>]

import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, statSync, unlinkSync } from 'node:fs';
import { captureScreen } from './capture-screen.mjs';

const FAILURE_CLASSES = ['WRONG_ELEMENT', 'NOT_FOUND', 'PAGE_NOT_LOADED', 'AUTH_WALL'];

function screenshot(imgPath) {
  const r = captureScreen(imgPath);   // cross-platform (macOS/Windows/Linux)
  if (!r.ok || !existsSync(imgPath) || statSync(imgPath).size < 100) {
    throw new Error(
      (r.error || 'screen capture failed') +
      ' — on macOS grant Screen Recording permission; a black/empty image often means the screen is locked.'
    );
  }
}

function verifyWithClaude(description, imgPath) {
  const prompt =
    `Please use your Read tool to read the image at the path below. ` +
    `Did the following GUI action succeed: "${description}"? ` +
    `Look at the current screen state and decide. ` +
    `Reply with ONLY a raw JSON object — either ` +
    `{"verified":true} or ` +
    `{"verified":false,"failure_class":"<WRONG_ELEMENT|NOT_FOUND|PAGE_NOT_LOADED|AUTH_WALL>","explanation":"<one sentence>"}. ` +
    `No markdown, no extra text.\n\nImage file path: ${imgPath}`;

  const r = spawnSync(
    'claude',
    [
      '-p',
      '--output-format', 'json',
      '--model', 'haiku',
      '--permission-mode', 'bypassPermissions',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--max-turns', '3',
    ],
    { input: prompt, encoding: 'utf8', timeout: 120_000 }
  );
  if (r.status !== 0) {
    throw new Error(`claude verify call failed (exit ${r.status}): ${(r.stderr ?? '').slice(0, 300)}`);
  }
  let out = r.stdout.trim();
  try { out = JSON.parse(out).result ?? out; } catch { /* raw text is fine */ }
  const jsonMatch = out.match(/\{[^{}]+\}/);
  if (!jsonMatch) throw new Error(`no JSON in claude response: ${out.slice(0, 300)}`);
  let result;
  try { result = JSON.parse(jsonMatch[0]); } catch (e) {
    throw new Error(`malformed JSON in claude response: ${jsonMatch[0]}`);
  }
  if (typeof result.verified !== 'boolean') {
    throw new Error(`expected {verified: bool}, got: ${jsonMatch[0]}`);
  }
  return {
    verified: result.verified,
    failure_class: FAILURE_CLASSES.includes(result.failure_class) ? result.failure_class : 'NOT_FOUND',
    explanation: result.explanation ?? '',
  };
}

// action: async () => void  — the GUI action to run each attempt
// description: string       — natural-language description of what success looks like
// maxRetries: number        — total attempts before throwing
export async function guiStep(action, description, maxRetries = 3) {
  let lastResult = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await action();

    const imgPath = join(tmpdir(), `helm-guitask-${process.pid}-${attempt}.png`);
    try {
      screenshot(imgPath);
      const result = verifyWithClaude(description, imgPath);
      if (result.verified) {
        return { ok: true, description, attempts: attempt };
      }
      lastResult = { ...result, attempt };
      process.stderr.write(
        `[gui_task] attempt ${attempt}/${maxRetries} FAILED ` +
        `(${lastResult.failure_class}): ${lastResult.explanation}\n`
      );
    } finally {
      try { if (existsSync(imgPath)) unlinkSync(imgPath); } catch { /* best-effort */ }
    }
  }
  const err = new Error(
    `guiStep failed after ${maxRetries} attempts — ${description}` +
    (lastResult ? ` [${lastResult.failure_class}: ${lastResult.explanation}]` : '')
  );
  Object.assign(err, lastResult ?? {});
  throw err;
}

// CLI entry point — used by the tool registry
async function main() {
  const args = process.argv.slice(2);
  const get  = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };

  const cmd         = get('cmd');
  const description = get('description');
  const retries     = Number(get('retries')) || 3;

  if (!cmd || !description) {
    process.stderr.write('usage: gui_task.mjs --cmd "<shell_cmd>" --description "<expected>" [--retries <n>]\n');
    process.exit(1);
  }

  const result = await guiStep(
    () => {
      const r = spawnSync('/bin/sh', ['-c', cmd], { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });
      if (r.error) throw new Error(`action exec failed: ${r.error.message}`);
      if (r.status !== 0) throw new Error(`action exited ${r.status}`);
    },
    description,
    retries
  );
  console.log(JSON.stringify(result));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
