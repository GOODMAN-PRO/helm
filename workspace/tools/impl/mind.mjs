#!/usr/bin/env node
// Helm Mind — AI-first second brain over the HelmBrain vault.
// Runs a verb (save/capture/find/synthesize/research/daily/recap/health) by invoking the Claude
// engine with the MIND.md protocol + the relevant vault context, so the vault "rewrites itself".
//
// Usage:
//   node workspace/tools/impl/mind.mjs <verb> "<input>"
//   node workspace/tools/impl/mind.mjs find "what do I believe about pricing?"
//   node workspace/tools/impl/mind.mjs --help | --dry-run save "we decided X"
//
// The vault path is machine-aware (Mac/Windows) and overridable with HELM_BRAIN.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));   // workspace/tools/impl
const ROOT = path.resolve(__dirname, '../../..');                // secondme/
loadEnv({ path: path.join(ROOT, '.env') });
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const MIND_MD = path.join(ROOT, 'workspace/mind/MIND.md');

export function vaultPath() {
  if (process.env.HELM_BRAIN) return process.env.HELM_BRAIN;
  return process.platform === 'win32' ? 'C:\\Users\\User\\HelmBrain' : '/Users/owner/HelmBrain';
}

export const VERBS = {
  save: 'Read the INPUT (a conversation or notes). Extract every decision, person, task, and idea. For each, UPDATE the most appropriate existing note in the vault (create one only if none fits), following the AI-first format. Report a short list of what you saved and where.',
  capture: 'Append the INPUT as a single zero-friction capture note/line under `00 Inbox/` with a timestamp. Do not over-process it. Report the file you wrote.',
  find: 'Search the vault FIRST. Synthesize a direct answer to the INPUT from existing notes, citing the notes you used as [[wikilinks]]. If the vault has nothing, say so plainly. Do not fabricate.',
  synthesize: 'Scan recent and topically-related notes (use the INPUT as the topic if given, else the last ~30 days). Discover non-obvious patterns and write/UPDATE one synthesis page under `MOCs/` that links the cluster. Report the page.',
  research: 'VAULT-FIRST: summarize what the vault already knows about the INPUT topic and identify the gaps. Then research ONLY the gaps from the web. Write/UPDATE an AI-first research note under `05 Resources/` with key claims, sources, recency, and any contradictions vs the vault.',
  daily: 'Create or update today\'s daily note under `01 Journal/` (YYYY-MM-DD): open items, what changed today across the vault, and anything due. Keep it tight.',
  recap: 'Summarize activity over the period named in INPUT (day|week|month, default week) by reading the journal, logs, and recently-updated notes. Output a concise recap; do not modify notes.',
  health: 'Audit the vault: find orphan notes (no links in/out), stale claims (old last_updated/recency), and contradictions between notes. FIX the safe ones (add links, mark stale, reconcile clear dupes) and REPORT the rest for review. Be conservative; never delete content.',
};

function buildPrompt(verb, input) {
  const protocol = existsSync(MIND_MD) ? readFileSync(MIND_MD, 'utf8') : '(MIND.md missing)';
  return [
    'You are Helm operating your second brain (Helm Mind). Follow this protocol exactly:',
    '',
    protocol,
    '',
    `VAULT: ${vaultPath()}`,
    `TASK (${verb}): ${VERBS[verb]}`,
    `INPUT: ${input || '(none)'}`,
    '',
    'Honor the three rules (vault rewrites itself, two-output, vault-first) and the AI-first note format. No emojis, no preamble. End with a 1-3 line summary of what you changed.',
  ].join('\n');
}

function run(verb, input) {
  const prompt = buildPrompt(verb, input);
  const r = spawnSync(CLAUDE_BIN, [
    '-p', '--output-format', 'json',
    '--model', process.env.MIND_MODEL || 'sonnet',
    '--permission-mode', process.env.PERMISSION_MODE || 'bypassPermissions',
    '--add-dir', vaultPath(), '--add-dir', ROOT,
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
  ], { input: prompt, encoding: 'utf8', timeout: 20 * 60_000, maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0) { console.error((r.stderr || 'claude failed').slice(0, 800)); process.exit(r.status || 1); }
  try { console.log((JSON.parse(r.stdout).result || '').trim()); }
  catch { console.log((r.stdout || '').trim()); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry-run');
  const help = argv.includes('--help') || argv.length === 0;
  const flag = k => { const i = argv.indexOf('--' + k); return i !== -1 ? argv[i + 1] : null; };
  const rest = argv.filter(a => !a.startsWith('--'));
  const verb = flag('verb') || rest[0];
  const input = flag('input') || rest.slice(1).join(' ');
  if (help || !verb || !VERBS[verb]) {
    console.log('Helm Mind verbs: ' + Object.keys(VERBS).join(', '));
    console.log('usage: mind.mjs <verb> "<input>"   (--dry-run prints the prompt only)');
    process.exit(help ? 0 : 1);
  }
  if (dry) { console.log(buildPrompt(verb, input)); process.exit(0); }
  run(verb, input);
}
