// fullstack-build skill — build a REAL, top-quality full-stack website or app by orchestrating 20+
// specialist agents (PM, architect, DB, API, backend, auth, UX, visual design, frontend, components,
// features, integration, testing, security, a11y, performance, SEO, devops, docs, anti-stub reviewer).
//
// This is the heavy-duty builder: use it when the owner asks to "build me a website / web app / SaaS /
// full-stack app". It runs a phased pipeline that produces a real, installable, verified project (build +
// tests run, no stubs), not a UI shell. Each agent is a focused `claude` expert; the pipeline ends with a
// verify+fix loop so the project actually builds.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildApp } from '../builder/orchestrator.mjs';
import { getAllRoles } from '../builder/roles.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const description =
  'Build a REAL, production-quality FULL-STACK website or app by orchestrating 20+ specialist agents ' +
  '(product, architecture, database, API, backend, auth, UX, visual design, frontend, components, features, ' +
  'integration, testing, security, accessibility, performance, SEO, devops, docs, anti-stub review). ' +
  'Usage: fullstack-build "<idea>" [--stack next-fullstack|astro-site|vite-react-spa|showcase-site] [--dry-run] [--out <dir>]. ' +
  'Default stack: Next.js + TypeScript + Tailwind + shadcn/ui + Prisma + Auth.js + Zod + Vitest/Playwright. ' +
  'For award-grade ANIMATED sites that rival apple.com (scroll-driven, super-interactive, GSAP+Lenis+Framer Motion+3D), ' +
  'use --stack showcase-site (auto-selected when the idea mentions animation/interactive/immersive/scroll/parallax/3d). ' +
  'The pipeline runs a verify+fix loop so the project actually installs, builds and tests — NO stubs, NO ' +
  'fake data, NO "coming soon". Use this (not app-build) whenever asked to build a website or web app. ' +
  'A real build runs many agents and takes a while; pass --dry-run first to preview the agent plan instantly. ' +
  'The generated project + a build report land in workspace/builder/out/<slug>/.';

function parse(argsStr) {
  const tokens = String(argsStr || '').trim();
  const o = { stack: undefined, outDir: undefined, dryRun: false };
  let s = tokens;
  const flag = (re, set) => { const m = s.match(re); if (m) { set(m); s = s.replace(m[0], ' '); } };
  flag(/--dry-run|--plan/, () => { o.dryRun = true; });
  flag(/--stack\s+(\S+)/, m => { o.stack = m[1]; });
  flag(/--out\s+(\S+)/, m => { o.outDir = m[1]; });
  o.brief = s.replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
  return o;
}

export async function execute(argsStr = '') {
  const { brief, stack, outDir, dryRun } = parse(argsStr);
  if (!brief) {
    const roles = getAllRoles();
    return 'Usage: fullstack-build "<what to build>" [--stack next-fullstack|astro-site|vite-react-spa] [--dry-run]\n' +
      `Pipeline: ${roles.length} specialist agents across discovery → architecture → design → scaffold → data → backend → auth → frontend → integration → quality → finalize.\n` +
      'Tip: add --dry-run to preview the agent plan instantly before committing to a full build.';
  }
  const result = await buildApp({
    brief, stack, outDir, dryRun,
    onProgress: e => { if (e && e.role) console.error(`[fullstack-build] [${e.phase}] ${e.role} — ${e.status}`); },
  });
  const head = dryRun
    ? `Planned a ${result.roleResults ? result.roleResults.length : 0}-agent full-stack build for: "${brief}". (Dry run — no files written.)`
    : `${result.ok ? 'Built' : 'Build finished with issues for'}: "${brief}".\nProject: ${result.projectDir}`;
  return `${head}\n\n${result.report || ''}`.trim();
}
