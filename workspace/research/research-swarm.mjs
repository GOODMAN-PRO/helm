#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { resolveClaude } from '../lib/engine.mjs';
import { readFileSync, appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
loadEnv({ path: path.join(ROOT, '.env'), override: true });
const CLAUDE = process.env.CLAUDE_BIN || 'claude';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const MODEL = arg('model', 'sonnet');
const WORKERS = parseInt(arg('workers', '5'), 10);
const TOPICS = path.join(__dirname, 'topics.json');
const REPORTS = path.join(__dirname, 'reports');
const LOG = path.join(__dirname, 'research.log');
const PLAN = path.join(__dirname, 'HELM-UPGRADE-PLAN.md');
mkdirSync(REPORTS, { recursive: true });

const ts = () => new Date().toISOString();
const log = m => { const l = `[research ${ts()}] ${m}`; console.log(l); try { appendFileSync(LOG, l + '\n'); } catch {} };
const notify = m => { try { spawnSync(process.execPath, [path.join(ROOT, 'bin', 'helm-push.mjs'), m]); } catch {} };

function runClaude(cwd, prompt, capMin) {
  return new Promise(resolve => {
    const cb = resolveClaude();
    const child = spawn(cb.cmd, ['-p', '--output-format', 'json', '--model', MODEL,
      '--permission-mode', 'bypassPermissions', '--add-dir', cwd,
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'], { cwd, shell: cb.shell, windowsHide: true });
    let out = '', err = '';
    const kill = setTimeout(() => child.kill(), capMin * 60_000);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(kill); resolve({ code: -1, result: 'spawn error ' + e.message }); });
    child.on('close', c => { clearTimeout(kill); let r = ''; try { r = (JSON.parse(out).result || '').trim(); } catch { r = (out || err).trim().slice(-1500); } resolve({ code: c, result: r }); });
    child.stdin.write(prompt); child.stdin.end();
  });
}
async function pool(items, size, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) { const idx = i++; await fn(items[idx]); } })); }

const reportPrompt = t => [
  `You are a Helm RESEARCH agent. Research this topic deeply using WebSearch/WebFetch, then write a report file.`,
  `TOPIC: ${t.title}`,
  `FOCUS: ${t.focus}`,
  ``,
  `Find the CURRENT (2026) best-in-class: real products, frameworks, papers, repos, techniques. Name names, include links.`,
  `Then WRITE a markdown report to reports/${t.id}.md with these sections:`,
  `1. State of the art — the leading systems here and what specifically makes each good.`,
  `2. Capabilities/patterns worth stealing.`,
  `3. HOW HELM ADOPTS THIS — concrete, implementable upgrades. Helm is: a Node Discord/iMessage bot that shells to \`claude -p\` on a Mac (+ a Windows box over SSH), with structured SQLite memory + semantic recall, a cron scheduler, GUI control (screencapture + a native click/type helper) + Playwright browser, a git-worktree build swarm + reviewers + smoke gate, nightly self-upgrade, and a secrets vault.`,
  `4. Each idea rated impact (1-5) x effort (1-5).`,
  `Be concrete and real, no fluff. After writing, end your output with: WROTE reports/${t.id}.md`,
].join('\n');

const synthPrompt = [
  `You are Helm's chief architect. Read EVERY report in ${REPORTS} (Read each *.md file there).`,
  `Fuse them into ONE roadmap written to ${PLAN} — meant to be "the biggest Helm upgrade of all time",`,
  `but it must be CONCRETE and buildable on Helm's real stack (Node bot -> claude -p, SQLite memory,`,
  `scheduler, GUI + Playwright control, git-worktree build swarm, nightly self-upgrade, secrets vault; Mac + Windows).`,
  `Structure the plan: (1) Executive summary. (2) Top 10 upgrades ranked by impact/effort — each: what it is,`,
  `why it matters, concrete build approach on Helm's stack. (3) Phased plan: quick wins -> big bets.`,
  `(4) A QUEUE-ready task list (one '- [ ]' line each) the build swarm can implement directly.`,
  `Sharp and actionable, no hype. Write the file, then end with: WROTE HELM-UPGRADE-PLAN.md`,
].join('\n');

(async () => {
  const topics = JSON.parse(readFileSync(TOPICS, 'utf8'));
  log(`start: ${topics.length} topics, ${WORKERS} concurrent, model ${MODEL}`);
  await pool(topics, WORKERS, async t => { const r = await runClaude(__dirname, reportPrompt(t), 20); log(`report ${t.id} (code ${r.code})`); });
  const have = readdirSync(REPORTS).filter(f => f.endsWith('.md'));
  log(`reports written: ${have.length}/${topics.length} -> [${have.join(', ')}]`);
  log('synthesizing HELM-UPGRADE-PLAN.md ...');
  const s = await runClaude(__dirname, synthPrompt, 25);
  log(`synthesis (code ${s.code})`);
  notify(`Research swarm done: ${have.length} reports + HELM-UPGRADE-PLAN.md at workspace/research/.`);
  log('DONE');
})();
