#!/usr/bin/env node
// workspace/sessions/compact.mjs
// Anchored session summarization + swarm handoff schema.
//
// Exports:
//   HANDOFF_SCHEMA  — template object; swarm workers fill this and write handoff.json
//   pruneFileReads(text, keepTurns=3) — strips numbered file-read blocks from old context
//   maybeCompact(context, opts)       — summarizes session into session_anchor.json at ~60% budget
//
// CLI:
//   node workspace/sessions/compact.mjs [--input <file>] [--session-dir <dir>]
//                                       [--budget <n>] [--force]
//   Reads stdin when --input is omitted.
//   Exits 0 = anchored, 2 = below threshold (not an error), 1 = failure.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
loadEnv({ path: path.join(ROOT, '.env') });

const CLAUDE = process.env.CLAUDE_BIN || 'claude';
const MODEL  = process.env.COMPACT_MODEL || 'haiku';
const DEFAULT_BUDGET    = parseInt(process.env.TOKEN_BUDGET || '100000', 10);
const COMPACT_THRESHOLD = 0.6; // trigger at 60% of budget
const LINES_PER_TURN    = 150; // approximate lines produced per agent turn
const FILE_BLOCK_MIN    = 15;  // min consecutive numbered lines to treat as a file read

// Schema for swarm worker handoffs. Workers write handoff.json using this shape;
// the orchestrator reads it instead of parsing raw stdout.
export const HANDOFF_SCHEMA = {
  worker_id:      '',   // string: swarm task id / agent identity
  task:           '',   // string: one-line description of what was attempted
  artifacts:      [],   // string[]: relative paths of files created or modified
  key_findings:   '',   // string: what the agent built or discovered (concise)
  decisions:      '',   // string: non-obvious choices made and why
  open_questions: '',   // string: unresolved issues or items needing owner attention
  confidence:     1.0,  // number 0-1: agent's self-assessed confidence in the result
};

// Approximate token count: ~1 token per 4 characters.
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

// Replace numbered file-read blocks (cat -n style: "N\t<content>") that are older than
// keepTurns * LINES_PER_TURN lines from the end with a short summary note.
// Blocks shorter than FILE_BLOCK_MIN lines are kept (they are likely inline snippets).
export function pruneFileReads(text, keepTurns = 3) {
  if (!text) return text;
  const keepLines = keepTurns * LINES_PER_TURN;
  const allLines = text.split('\n');
  if (allLines.length <= keepLines) return text;

  // Only the "old" portion (before the last keepLines lines) is subject to pruning.
  const cutIdx = allLines.length - keepLines;
  const oldLines  = allLines.slice(0, cutIdx);
  const recentLines = allLines.slice(cutIdx);

  const out = [];
  let i = 0;
  while (i < oldLines.length) {
    const line = oldLines[i];
    if (/^\d+\t/.test(line)) {
      // Collect the full run of numbered lines.
      let j = i;
      while (j < oldLines.length && /^\d+\t/.test(oldLines[j])) j++;
      const blockLen = j - i;
      if (blockLen >= FILE_BLOCK_MIN) {
        // Extract a file path from the 3 lines preceding the block.
        let filePath = 'file';
        for (let k = Math.max(0, i - 3); k < i; k++) {
          const m = oldLines[k].match(/([^\s]+\.(?:mjs|js|ts|json|md|txt|sh|py|yaml|yml|toml))/);
          if (m) { filePath = m[1]; break; }
        }
        out.push(`[file read: ${filePath}, ${blockLen} lines - dropped]`);
        i = j;
        continue;
      }
    }
    out.push(line);
    i++;
  }

  return out.join('\n') + '\n' + recentLines.join('\n');
}

// Summarize accumulated session context into a compact anchor JSON.
// Writes session_anchor.json to sessionDir.
// Returns { anchored: boolean, anchor: object|null, reason: string }.
export async function maybeCompact(context, { sessionDir = '.', budget = DEFAULT_BUDGET, force = false } = {}) {
  const used  = estimateTokens(context);
  const ratio = used / budget;

  if (!force && ratio < COMPACT_THRESHOLD) {
    return {
      anchored: false, anchor: null,
      reason: `${(ratio * 100).toFixed(1)}% used < ${COMPACT_THRESHOLD * 100}% threshold`,
    };
  }

  const prompt = [
    'Summarize the following session context into EXACTLY this JSON (output raw JSON only, no markdown fences):',
    '{',
    '  "intent":       "<original user goal — one sentence>",',
    '  "changes_made": "<files modified and actions taken>",',
    '  "decisions":    "<key decisions and rationale>",',
    '  "next_steps":   "<what must happen next to finish the task>",',
    '  "constraints":  "<hard rules that must be preserved going forward>"',
    '}',
    '',
    '=== SESSION CONTEXT (last 8000 chars) ===',
    context.slice(-8000),
  ].join('\n');

  const r = spawnSync(CLAUDE, [
    '-p', '--output-format', 'json', '--model', MODEL,
    '--permission-mode', 'bypassPermissions',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--max-turns', '1',
  ], { input: prompt, encoding: 'utf8', timeout: 60_000 });

  if (r.status !== 0) {
    return { anchored: false, anchor: null, reason: `claude error (exit ${r.status})` };
  }

  let raw = r.stdout.trim();
  try { raw = (JSON.parse(raw).result || raw).trim(); } catch {}
  raw = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();

  let anchor;
  try { anchor = JSON.parse(raw); }
  catch (e) { return { anchored: false, anchor: null, reason: `JSON parse failed: ${e.message}` }; }

  for (const k of ['intent', 'changes_made', 'decisions', 'next_steps', 'constraints']) {
    if (typeof anchor[k] !== 'string') anchor[k] = String(anchor[k] ?? '');
  }

  const anchorPath = path.resolve(sessionDir, 'session_anchor.json');
  writeFileSync(anchorPath, JSON.stringify(anchor, null, 2));
  return { anchored: true, anchor, reason: `anchored at ${(ratio * 100).toFixed(1)}% budget used` };
}

// CLI entry point — only executes when run as the main script.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg  = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };

  const inputFile  = arg('input', null);
  const sessionDir = arg('session-dir', '.');
  const budget     = parseInt(arg('budget', String(DEFAULT_BUDGET)), 10);
  const force      = argv.includes('--force');

  let context = '';
  if (inputFile) {
    context = readFileSync(inputFile, 'utf8');
  } else {
    try { context = readFileSync(0, 'utf8'); } catch {}   // fd 0 = stdin; cross-platform ('/dev/stdin' is POSIX-only)
  }

  if (!context.trim()) {
    console.error('compact.mjs: no input — use --input <file> or pipe via stdin');
    process.exit(1);
  }

  const result = await maybeCompact(context, { sessionDir, budget, force });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.anchored ? 0 : 2);
}
