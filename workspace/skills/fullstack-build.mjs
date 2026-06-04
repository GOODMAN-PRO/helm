// fullstack-build skill — build a REAL, premium website with ONE cohesive agent guided by a research-
// distilled design playbook (apple/awwwards/stripe/linear craft), then a build-until-green loop that
// guarantees it compiles. This replaced the 40-agent swarm, which produced incoherent sites and failed
// under rate limits. Use it whenever the owner asks to "build me a website / landing / web app".

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildSolo } from '../builder/solo.mjs';
import { buildApp } from '../builder/orchestrator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const description =
  'Build a REAL, premium, production-quality WEBSITE that rivals apple.com / Stripe / Linear. ONE cohesive ' +
  'agent builds the whole site — guided by a research-distilled design playbook (type scale, color system, ' +
  'scroll choreography with GSAP+Lenis, Framer Motion micro-interactions, hero recipes, premium components) ' +
  '— then a build-until-green loop runs `npm run build` and fixes errors until it compiles cleanly. NO stubs, ' +
  'NO lorem, NO "coming soon", and it is GUARANTEED to build before it finishes. ' +
  'Usage: fullstack-build "<idea>" [--stack showcase-site|next-fullstack|astro-site|vite-react-spa] [--model sonnet|opus] [--dry-run]. ' +
  'Default stack auto-selects (animated/landing → showcase-site). Use --swarm only to opt back into the old ' +
  'multi-agent pipeline (slower, less coherent). The finished site + report land in workspace/builder/out/<slug>/. ' +
  'A real build takes ~10-25 min (one agent + fixes); pass --dry-run to preview instantly.';

function parse(argsStr) {
  const tokens = String(argsStr || '').trim();
  const o = { stack: undefined, outDir: undefined, dryRun: false, tier: undefined, swarm: false, model: undefined };
  let s = tokens;
  const flag = (re, set) => { const m = s.match(re); if (m) { set(m); s = s.replace(m[0], ' '); } };
  flag(/--dry-run|--plan/, () => { o.dryRun = true; });
  flag(/--swarm/, () => { o.swarm = true; });
  flag(/--lean/, () => { o.tier = 'lean'; });
  flag(/--premium/, () => { o.tier = 'premium'; });
  flag(/--tier\s+(\S+)/, m => { o.tier = m[1]; });
  flag(/--model\s+(\S+)/, m => { o.model = m[1]; });
  flag(/--stack\s+(\S+)/, m => { o.stack = m[1]; });
  flag(/--out\s+(\S+)/, m => { o.outDir = m[1]; });
  o.brief = s.replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
  return o;
}

export async function execute(argsStr = '') {
  const { brief, stack, outDir, dryRun, tier, swarm, model } = parse(argsStr);
  if (!brief) {
    return 'Usage: fullstack-build "<what to build>" [--stack showcase-site] [--model sonnet|opus] [--dry-run] [--swarm]\n' +
      'Default: ONE cohesive agent builds a premium, apple/stripe-grade site from a research design playbook, then a build-until-green loop guarantees it compiles. Add --dry-run to preview instantly.';
  }
  if (swarm) {   // opt-in legacy multi-agent path
    const r = await buildApp({ brief, stack, outDir, dryRun, tier, onProgress: e => { if (e && e.role) console.error(`[fullstack-build:swarm] [${e.phase}] ${e.role} — ${e.status}`); } });
    return `${dryRun ? 'Planned' : (r.ok ? 'Built' : 'Build had issues for')} (swarm): "${brief}".\nProject: ${r.projectDir}\n\n${r.report || ''}`.trim();
  }
  const r = await buildSolo({ brief, stack, outDir, dryRun, model: model || 'sonnet', onProgress: e => console.error(`[fullstack-build] [${e.phase}] ${e.status}`) });
  const head = dryRun
    ? `Planned a single-agent premium build for: "${brief}". (Dry run.)`
    : `${r.ok ? 'Built (compiles ✓)' : 'Build finished but does NOT compile yet'}: "${brief}".\nProject: ${r.projectDir}`;
  return `${head}\n\n${r.report || ''}`.trim();
}
