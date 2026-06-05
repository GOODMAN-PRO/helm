#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveClaude } from '../lib/engine.mjs';
import { applyEdits } from './apply-edit.mjs';
import { view_file } from './tools/view_file.mjs';

const CLAUDE = process.env.CLAUDE_BIN || 'claude';
const PHASE_CAP_MS = 5 * 60_000;

function runClaude(cwd, model, prompt) {
  return new Promise(resolve => {
    const cb = resolveClaude();
    const child = spawn(cb.cmd, [
      '-p', '--output-format', 'json', '--model', model,
      '--permission-mode', 'bypassPermissions',
      '--add-dir', cwd,
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--max-turns', '1',
    ], { cwd, shell: cb.shell, windowsHide: true });
    let out = '', err = '';
    const kill = setTimeout(() => child.kill(), PHASE_CAP_MS);
    child.stdin.on('error', () => {});
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(kill); resolve({ code: -1, result: 'spawn error: ' + e.message }); });
    child.on('close', code => {
      clearTimeout(kill);
      let result = '';
      try { result = (JSON.parse(out).result || '').trim(); } catch { result = (out || err).trim().slice(-2000); }
      resolve({ code, result });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export async function codingTask(description, cwd, model = 'sonnet') {

  const localizePrompt = [
    'You are a code localization agent. Your only job is to identify the source file and approximate line range for the task below.',
    '',
    `TASK: ${description}`,
    '',
    'Use shell commands (ls, find, grep) to explore the repo, then reply with ONLY valid JSON — no prose before or after:',
    '{ "file": "relative/path/from/cwd.mjs", "startLine": 1, "reason": "one-line explanation" }',
    '',
    'The file path must be relative to the current working directory.',
  ].join('\n');

  const locResult = await runClaude(cwd, model, localizePrompt);
  let location = null;
  try {
    const jsonMatch = locResult.result.match(/\{[\s\S]*?\}/);
    if (jsonMatch) location = JSON.parse(jsonMatch[0]);
  } catch {}

  if (!location || !location.file) {
    return {
      applied: 0, diffs: '', rawPatch: '',
      errors: [{ file: '?', error: `localize phase failed: ${locResult.result.slice(0, 300)}` }],
      location: null,
    };
  }

  // Phase 2: repair — provide the excerpt and ask for a patch using edit blocks
  let excerpt = '';
  try {
    excerpt = view_file(location.file, location.startLine || 1, cwd);
  } catch (e) {
    excerpt = `(could not read ${location.file}: ${e.message})`;
  }

  const repairPrompt = [
    'You are a code repair agent. Fix the issue described below using <<<OLD/===/>>>NEW edit blocks.',
    '',
    `TASK: ${description}`,
    '',
    `TARGET FILE: ${location.file}`,
    `EXCERPT (lines from ${location.startLine || 1}):`,
    '```',
    excerpt,
    '```',
    '',
    'Output ONLY edit blocks — no prose, no explanations:',
    '',
    '<<<OLD ' + location.file,
    '<exact existing code to replace — must match the file byte-for-byte, whitespace included>',
    '===',
    '<replacement code>',
    '>>>NEW',
    '',
    'Rules:',
    '- Use the exact relative file path shown above.',
    '- The OLD block must match the file EXACTLY (copy-paste from the excerpt; adjust if the surrounding context is different).',
    '- You may emit multiple edit blocks for multiple hunks.',
    '- No backtick fences around the edit blocks themselves.',
  ].join('\n');

  const repairResult = await runClaude(cwd, model, repairPrompt);
  const editResult = applyEdits(repairResult.result, cwd);

  return { ...editResult, location, rawPatch: repairResult.result };
}


if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const cwdIdx = argv.indexOf('--cwd');
  const modelIdx = argv.indexOf('--model');
  const cwd = cwdIdx >= 0 ? argv[cwdIdx + 1] : process.cwd();
  const model = modelIdx >= 0 ? argv[modelIdx + 1] : 'sonnet';

  let description = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { description += d; });
  process.stdin.on('end', async () => {
    const result = await codingTask(description.trim(), cwd, model);
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exit(1);
  });
}
