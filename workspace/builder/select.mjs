#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

const BACKEND_ROLES = ['database-architect', 'database-engineer', 'api-designer', 'backend-engineer', 'auth-engineer'];
const ANIM_FULL = ['creative-director', 'motion-designer', 'art-director', 'scroll-animation-engineer',
  'hero-showcase-engineer', 'page-transition-engineer', 'kinetic-typography-engineer', 'cursor-effects-engineer',
  'webgl-3d-engineer', 'parallax-depth-engineer', 'loading-experience-engineer', 'visual-polish-critic'];
const ANIM_LEAN = ['interaction-engineer', 'responsive-motion-engineer'];

const CORE = ['product-manager', 'solutions-architect', 'ui-visual-designer', 'design-system-engineer',
  'project-scaffolder', 'frontend-architect', 'component-engineer', 'feature-engineer',
  'integration-engineer', 'code-reviewer', 'technical-writer'];

const STANDARD_EXTRA = ['requirements-analyst', 'ux-designer', 'accessibility-specialist', 'performance-engineer', 'test-engineer'];

const PREMIUM_EXTRA = ['security-auditor', 'devops-engineer', 'animation-performance-engineer'];


export function detectNeeds(brief = '', stack = {}) {
  const b = String(brief || '').toLowerCase();
  const stackId = stack?.id || '';
  const isStatic = stackId === 'astro-site';
  const needsBackend = !isStatic && (stackId === 'next-fullstack' || stackId === 'unknown') &&
    /(account|log ?in|sign ?[ui]p|sign ?in|auth|user|member|database|\bdb\b|save|persist|store|\bpost(s|ing)?\b|comment|dashboard|admin|\bapi\b|backend|server|crud|payment|checkout|cart|booking|reserv|cms|profile|messag|chat|upload|todo|task|note|inventory|order|review)/.test(b);
  const wantsAnimation = stackId === 'showcase-site' ||
    /(animat|interactiv|immersiv|award|apple|awwwards|scroll[\s-]?(animation|driven|telling)?|parallax|3 ?d|webgl|cinematic|motion|premium|stunning|wow|fancy|sleek|polished|flashy|micro[\s-]?interaction)/.test(b);
  const wantsSeo = isStatic || /(marketing|landing|seo|blog|public|brand|site\b)/.test(b);
  return { stackId, isStatic, needsBackend, wantsAnimation, wantsSeo };
}


export function autoTier(needs) {
  if (needs.wantsAnimation) return 'premium';
  return 'standard';
}

export function selectRoles(allRoles = [], ctx = {}, opts = {}) {
  try {
    const byId = new Map(allRoles.map(r => [r.id, r]));
    const needs = detectNeeds(ctx.brief, ctx.stack);
    const tier = ['lean', 'standard', 'premium'].includes(opts.tier) ? opts.tier : autoTier(needs);

    const include = new Set();
    const add = id => { if (byId.has(id)) include.add(id); };

    CORE.forEach(add);
    if (needs.needsBackend) BACKEND_ROLES.forEach(add);
    if (needs.wantsSeo) add('seo-specialist');

    if (tier === 'standard' || tier === 'premium') STANDARD_EXTRA.forEach(add);
    if (tier === 'premium') {
      PREMIUM_EXTRA.forEach(add);
      ANIM_FULL.forEach(add);
      ANIM_LEAN.forEach(add);
    } else if (needs.wantsAnimation) {
      ANIM_LEAN.forEach(add);
    }

    if (tier === 'lean') ['security-auditor', 'seo-specialist', 'devops-engineer', 'test-engineer', 'performance-engineer', 'accessibility-specialist'].forEach(id => include.delete(id));


    for (const id of (opts.includeRoles || [])) add(id);
    for (const id of (opts.excludeRoles || [])) include.delete(id);







    let chosenIds = allRoles.filter(r => include.has(r.id)).map(r => r.id);
    if (Number.isFinite(opts.maxAgents) && opts.maxAgents > 0 && chosenIds.length > opts.maxAgents) {
      chosenIds = chosenIds.slice(0, opts.maxAgents);
    }
    const chosen = new Set(chosenIds);


    const roles = allRoles
      .filter(r => chosen.has(r.id))
      .map(r => ({ ...r, deps: (r.deps || []).filter(d => chosen.has(d)) }));

    const skipped = allRoles.filter(r => !chosen.has(r.id)).map(r => r.id);
    return { roles, tier, needs, skipped };
  } catch {

    return { roles: allRoles, tier: 'premium', needs: {}, skipped: [] };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fake = (id, phase, deps = []) => ({ id, phase, deps, model: 'sonnet', system: 'x', task: () => 'x' });
  const all = [
    ...CORE.map(id => fake(id, 'frontend')),
    ...BACKEND_ROLES.map(id => fake(id, 'backend')),
    ...ANIM_FULL.map(id => fake(id, 'frontend')),
    ...ANIM_LEAN.map(id => fake(id, 'frontend')),
    ...STANDARD_EXTRA.map(id => fake(id, 'quality')),
    ...PREMIUM_EXTRA.map(id => fake(id, 'quality')),
    fake('seo-specialist', 'quality'),
  ];
  const cases = [
    ['a simple static portfolio landing page', { id: 'astro-site' }],
    ['an internal CRUD task manager with login', { id: 'next-fullstack' }],
    ['a cinematic product launch site with scroll animations', { id: 'showcase-site' }],
  ];
  for (const [brief, stack] of cases) {
    const r = selectRoles(all, { brief, stack });
    console.log(`\n${brief}\n  tier=${r.tier} agents=${r.roles.length} backend=${r.needs.needsBackend} anim=${r.needs.wantsAnimation}`);
  }
}
