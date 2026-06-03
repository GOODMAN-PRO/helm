#!/usr/bin/env node
// cli.mjs — command-line entry to the Helm full-stack builder.
//
//   node workspace/builder/cli.mjs "<app or website idea>" [options]
//
// Options:
//   --stack <id>        next-fullstack (default) | astro-site | vite-react-spa
//   --out <dir>         output project directory (default: workspace/builder/out/<slug>-<ts>)
//   --dry-run           plan only — print the agent pipeline without spawning agents or scaffolding
//   --plan              alias for --dry-run
//   --concurrency <n>   max agents running at once (default 3)
//   --max-fix <n>       max build-fix rounds after the pipeline (default 2)
//   --json              print the raw JSON result instead of the Markdown report
//
// It orchestrates 20+ specialist agents (PM → architect → DB → backend → auth → design → frontend →
// integration → QA/security/a11y/perf/SEO → finalize) to produce a REAL, working, verified project.

import { fileURLToPath } from 'node:url';
import { buildApp } from './orchestrator.mjs';

// Accepts both direct CLI style (`"<brief>" --dry-run`) and the tool-dispatcher style
// (`--brief "<text>" --stack <id> --dryRun true`), so `tools.mjs call builder.fullstack` works too.
const truthy = v => v === undefined || /^(1|true|yes|on)$/i.test(String(v));
function parseArgs(argv) {
  const out = { brief: '', stack: undefined, outDir: undefined, dryRun: false, concurrency: 3, maxFixRounds: 2, json: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '--plan') out.dryRun = true;
    else if (a === '--dryRun') out.dryRun = truthy(argv[++i]);
    else if (a === '--json') out.json = true;
    else if (a === '--brief') out.brief = argv[++i] || '';
    else if (a === '--stack') out.stack = argv[++i];
    else if (a === '--out' || a === '--outDir') out.outDir = argv[++i];
    else if (a === '--concurrency') out.concurrency = parseInt(argv[++i], 10) || 3;
    else if (a === '--max-fix' || a === '--maxFixRounds') out.maxFixRounds = parseInt(argv[++i], 10) || 2;
    else rest.push(a);
  }
  if (!out.brief) out.brief = rest.join(' ').trim();
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.brief) {
    console.error('usage: node workspace/builder/cli.mjs "<app or website idea>" [--stack <id>] [--out <dir>] [--dry-run] [--concurrency N] [--max-fix N] [--json]');
    process.exit(1);
  }
  const startedAt = Date.now();
  const result = await buildApp({
    brief: opts.brief,
    stack: opts.stack,
    outDir: opts.outDir,
    dryRun: opts.dryRun,
    concurrency: opts.concurrency,
    maxFixRounds: opts.maxFixRounds,
    onProgress: e => { if (e && e.role) console.error(`  ⚙️  [${e.phase}] ${e.role} — ${e.status}`); },
  });
  const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
  if (opts.json) { console.log(JSON.stringify({ ...result, elapsedMin: mins })); return; }
  console.log('\n' + (result.report || '(no report)'));
  console.log(`\n${result.ok ? '✅' : '⚠️'} ${opts.dryRun ? 'Planned' : 'Built'} in ${mins} min — project: ${result.projectDir || '(n/a)'}`);
  if (!result.ok && result.error) console.log(`error: ${result.error}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('builder failed:', e?.stack || e?.message || e); process.exit(1); });
}
