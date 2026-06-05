#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { buildApp } from './orchestrator.mjs';
import { buildSolo } from './solo.mjs';



const truthy = v => v === undefined || /^(1|true|yes|on)$/i.test(String(v));
function parseArgs(argv) {
  const out = { brief: '', stack: undefined, outDir: undefined, dryRun: false, concurrency: 3, maxFixRounds: undefined, json: false,
    tier: undefined, maxAgents: undefined, includeRoles: undefined, excludeRoles: undefined, swarm: false, model: undefined, polish: true,
    audit: true, maxAuditRounds: undefined };
  const rest = [];
  const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
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
    else if (a === '--tier') out.tier = argv[++i];
    else if (a === '--lean') out.tier = 'lean';
    else if (a === '--premium') out.tier = 'premium';
    else if (a === '--max-agents' || a === '--maxAgents') out.maxAgents = parseInt(argv[++i], 10) || undefined;
    else if (a === '--include' || a === '--includeRoles') out.includeRoles = list(argv[++i]);
    else if (a === '--exclude' || a === '--excludeRoles') out.excludeRoles = list(argv[++i]);
    else if (a === '--swarm') out.swarm = true;
    else if (a === '--solo') out.swarm = false;
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--no-polish') out.polish = false;
    else if (a === '--no-audit') out.audit = false;
    else if (a === '--audit-rounds' || a === '--maxAuditRounds') out.maxAuditRounds = parseInt(argv[++i], 10) || undefined;
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

  const result = opts.swarm
    ? await buildApp({
        brief: opts.brief, stack: opts.stack, outDir: opts.outDir, dryRun: opts.dryRun,
        concurrency: opts.concurrency, maxFixRounds: opts.maxFixRounds, tier: opts.tier,
        maxAgents: opts.maxAgents, includeRoles: opts.includeRoles, excludeRoles: opts.excludeRoles,
        onProgress: e => {
          if (e && e.status === 'selected') console.error(`  → tier=${e.tier}, ${e.count} agents selected (${e.skipped} skipped as unneeded)`);
          else if (e && e.role) console.error(`  ⚙️  [${e.phase}] ${e.role} — ${e.status}`);
        },
      })
    : await buildSolo({
        brief: opts.brief, stack: opts.stack, outDir: opts.outDir, dryRun: opts.dryRun,
        maxFixRounds: opts.maxFixRounds || 4, model: opts.model || 'sonnet', polish: opts.polish !== false,
        audit: opts.audit !== false, maxAuditRounds: opts.maxAuditRounds || 3,
        onProgress: e => console.error(`  · [${e.phase}] ${e.status}`),
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
