import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildSolo } from '../builder/solo.mjs';
import { buildApp } from '../builder/orchestrator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const description =
  'Build a REAL, premium, production-quality WEBSITE that rivals apple.com / Stripe / Linear. ONE cohesive ' +
  'agent builds the whole site — guided by a research-distilled design playbook (type scale, color system, ' +
  'scroll choreography with GSAP+Lenis, Framer Motion micro-interactions, hero recipes, premium components) ' +
  '— then a build-until-green loop runs `npm run build`, and an AUTOMATED AUDITOR (real build + headless ' +
  'Chromium walkthrough at 1440 & 375) checks the quality checklist — broken images, console/hydration errors, ' +
  '404s, cutoff text, raw entities, missing SEO/meta/alt, invisible 3D canvas, stuck reveals — and loops a fix ' +
  'agent until the critical + major items are GREEN. NO stubs, NO lorem, NO "coming soon"; GUARANTEED to build ' +
  'and pass the auto-checklist before it finishes. ' +
  'Usage: fullstack-build "<idea>" [--stack showcase-site|next-fullstack|astro-site|vite-react-spa] [--model sonnet|opus] [--no-audit] [--dry-run]. ' +
  'Default stack auto-selects (animated/landing → showcase-site). Use --swarm only to opt back into the old ' +
  'multi-agent pipeline (slower, less coherent). The finished site + report land in workspace/builder/out/<slug>/. ' +
  'A real build takes ~10-25 min (one agent + fixes); pass --dry-run to preview instantly.';

function parse(argsStr) {
  const tokens = String(argsStr || '').trim();
  const o = { stack: undefined, outDir: undefined, dryRun: false, tier: undefined, swarm: false, model: undefined, audit: true };
  let s = tokens;
  const flag = (re, set) => { const m = s.match(re); if (m) { set(m); s = s.replace(m[0], ' '); } };
  flag(/--dry-run|--plan/, () => { o.dryRun = true; });
  flag(/--no-audit/, () => { o.audit = false; });
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
  const { brief, stack, outDir, dryRun, tier, swarm, model, audit } = parse(argsStr);
  if (!brief) {
    return 'Usage: fullstack-build "<what to build>" [--stack showcase-site] [--model sonnet|opus] [--dry-run] [--swarm]\n' +
      'Default: ONE cohesive agent builds a premium, apple/stripe-grade site from a research design playbook, then a build-until-green loop guarantees it compiles. Add --dry-run to preview instantly.';
  }
  if (swarm) {
    const r = await buildApp({ brief, stack, outDir, dryRun, tier, onProgress: e => { if (e && e.role) console.error(`[fullstack-build:swarm] [${e.phase}] ${e.role} — ${e.status}`); } });
    return `${dryRun ? 'Planned' : (r.ok ? 'Built' : 'Build had issues for')} (swarm): "${brief}".\nProject: ${r.projectDir}\n\n${r.report || ''}`.trim();
  }
  const r = await buildSolo({ brief, stack, outDir, dryRun, model: model || 'sonnet', audit, onProgress: e => console.error(`[fullstack-build] [${e.phase}] ${e.status}`) });
  const head = dryRun
    ? `Planned a single-agent premium build for: "${brief}". (Dry run.)`
    : `${r.ok ? 'Built (compiles ✓)' : 'Build finished but does NOT compile yet'}: "${brief}".\nProject: ${r.projectDir}`;
  return `${head}\n\n${r.report || ''}`.trim();
}
