import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { showcaseStack } from './stack-showcase.mjs';
import { nextCreateArgs, ensureNextScaffold } from './scaffold-util.mjs';






function runScaffolder(cmd, args, { cwd, timeoutMs = 600_000 } = {}) {
  try {
    const result = spawnSync(cmd, args, {
      cwd,

      env: { ...process.env, CI: '1', ADBLOCK: '1' },
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8',
    });

    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

    if (result.error) {

      return { ok: false, output, error: result.error.message };
    }
    if (result.status !== 0) {
      return { ok: false, output, error: `exit ${result.status}` };
    }
    return { ok: true, output };
  } catch (err) {

    return { ok: false, output: '', error: String(err?.message ?? err) };
  }
}

/** Ensure the PARENT directory of projectDir exists, then return parent. */
function ensureParent(projectDir) {
  const parent = path.dirname(projectDir);
  mkdirSync(parent, { recursive: true });
  return parent;
}

// ---------------------------------------------------------------------------
// Stack presets
// ---------------------------------------------------------------------------

/** @type {Record<string, import('./context.mjs').StackPreset>} */
export const STACKS = {




  'next-fullstack': {
    id: 'next-fullstack',
    label: 'Next.js Full-Stack',
    summary:
      'Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · ' +
      'Prisma ORM (SQLite dev) · Auth.js v5 · Zod · Vitest · Playwright · ' +
      'ESLint + Prettier. Best for full-stack web apps, SaaS, APIs.',
    packageManager: 'pnpm',
    devCommand: 'next dev',
    buildCommand: 'next build',
    testCommand: 'vitest run',
    lintCommand: 'next lint',
    notes: [
      'src/ dir layout: src/app/ (App Router), src/components/, src/lib/, src/server/.',
      'API routes live under src/app/api/<route>/route.ts.',
      'Database: prisma/schema.prisma (SQLite datasource for dev). Run `npx prisma generate` after edits.',
      'Auth: configured via src/auth.ts (Auth.js v5 / NextAuth). Sessions use JWT strategy.',
      'shadcn/ui components go in src/components/ui/; initialize with `npx shadcn@latest init`.',
      'Validation: zod schemas in src/lib/validators/.',
      'Tests: Vitest for unit/integration (src/__tests__/), Playwright for e2e (tests/).',
      'Env vars: .env.local (never committed). Provide .env.example with dummy values.',
      'Use pnpm for all installs. If pnpm is unavailable, npm is the fallback.',
    ].join('\n'),

    async scaffold(projectDir) {



      const parent = ensureParent(projectDir);
      const r = runScaffolder('npx', nextCreateArgs(projectDir, 'npm'), { cwd: parent, timeoutMs: 300_000 });
      const ensured = ensureNextScaffold(projectDir, r);

      const inst = runScaffolder('npm', ['install', '--no-audit', '--no-fund'], { cwd: projectDir, timeoutMs: 600_000 });
      return { ok: ensured.ok, fallback: ensured.fallback, output: [ensured.output, inst.output].filter(Boolean).join('\n'), error: inst.ok ? ensured.error : `deps install issue: ${inst.error}` };
    },
  },





  'astro-site': {
    id: 'astro-site',
    label: 'Astro Static Site',
    summary:
      'Astro 4 (minimal template) · TypeScript strict · static-first with optional SSR. ' +
      'Zero JS by default, island architecture for interactive bits. ' +
      'Best for landing pages, marketing sites, blogs, portfolios, and docs.',
    packageManager: 'npm',
    devCommand: 'npm run dev',
    buildCommand: 'npm run build',
    testCommand: 'npm test',
    lintCommand: 'npm run lint',
    notes: [
      'Pages live in src/pages/. Layouts in src/layouts/. Components in src/components/.',
      'Static assets go in public/.',
      'TypeScript strict mode. astro.config.mjs for adapter/integration config.',
      'Prefer .astro components; use React/Svelte/Vue islands only for interactive widgets.',
      'No client-side JS by default — use `client:load` / `client:visible` directives consciously.',
      'SEO: add <title>, <meta name="description">, and og: tags in every layout.',
      'Content collections (src/content/) for blog posts or docs with typed frontmatter.',
    ].join('\n'),

    async scaffold(projectDir) {




      const parent = ensureParent(projectDir);
      return runScaffolder(
        'npm',
        [
          'create',
          'astro@latest',
          projectDir,
          '--',
          '--template', 'minimal',
          '--typescript', 'strict',
          '--no-install',
          '--no-git',
          '--yes',
        ],
        { cwd: parent, timeoutMs: 300_000 },
      );
    },
  },





  'vite-react-spa': {
    id: 'vite-react-spa',
    label: 'Vite + React SPA',
    summary:
      'Vite 5 · React 18 · TypeScript · react-ts template. ' +
      'Client-only SPA, no SSR. Fast HMR, minimal config. ' +
      'Best for dashboards, internal tools, admin panels, and SPAs.',
    packageManager: 'npm',
    devCommand: 'npm run dev',
    buildCommand: 'npm run build',
    testCommand: 'npm test',
    lintCommand: 'npm run lint',
    notes: [
      'Entry: src/main.tsx → src/App.tsx.',
      'Routing: add react-router-dom v6 for multi-page navigation.',
      'State: useState/useReducer for local; Zustand or Jotai for global.',
      'API calls: TanStack Query recommended for server state.',
      'Styling: Tailwind or CSS modules — add after scaffold.',
      'Tests: add Vitest + Testing Library (not included in the vite template).',
      'Build output lands in dist/; deploy via static hosting (Vercel, Netlify, S3).',
    ].join('\n'),

    async scaffold(projectDir) {


      const parent = ensureParent(projectDir);
      return runScaffolder(
        'npm',
        [
          'create',
          'vite@latest',
          projectDir,
          '--',
          '--template', 'react-ts',
        ],
        { cwd: parent, timeoutMs: 120_000 },
      );
    },
  },


  'showcase-site': showcaseStack,
};







const KEYWORD_RULES = [
  {

    pattern: /animat|interactive|immersive|award|apple[\s-]?grade|awwwards|scroll[\s-]?(animation|driven|telling)|parallax|3d|webgl|cinematic|product\s+(launch|showcase|reveal)|motion/i,
    id: 'showcase-site',
  },
  {

    pattern: /landing|marketing|blog|portfolio|docs|static|brochure|content[\s-]site/i,
    id: 'astro-site',
  },
  {

    pattern: /dashboard|spa\b|single[\s-]page|internal[\s-]tool|admin[\s-]panel|admin tool/i,
    id: 'vite-react-spa',
  },
];


export function resolveStack(hint) {

  if (hint && STACKS[hint]) return STACKS[hint];

  const text = String(hint ?? '');

  for (const { pattern, id } of KEYWORD_RULES) {
    if (pattern.test(text)) return STACKS[id];
  }

  // Default: full-stack is the right choice for anything ambiguous
  return STACKS['next-fullstack'];
}





if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const REQUIRED_FIELDS = [
    'id', 'label', 'summary', 'packageManager',
    'devCommand', 'buildCommand', 'testCommand', 'lintCommand',
    'scaffold', 'notes',
  ];

  let passed = 0;
  let failed = 0;

  function assert(label, condition, detail = '') {
    if (condition) {
      console.log(`  PASS  ${label}`);
      passed++;
    } else {
      console.error(`  FAIL  ${label}${detail ? ': ' + detail : ''}`);
      failed++;
    }
  }

  function checkPreset(preset, tag) {
    assert(`${tag} is object`, preset && typeof preset === 'object');
    for (const field of REQUIRED_FIELDS) {
      assert(`${tag}.${field} present`, field in preset, `missing field`);
    }
    assert(`${tag}.scaffold is function`, typeof preset.scaffold === 'function');
    assert(`${tag}.packageManager valid`, ['npm', 'pnpm'].includes(preset.packageManager));

  }

  console.log('\n--- stack.mjs self-test ---\n');


  for (const [id, preset] of Object.entries(STACKS)) {
    assert(`STACKS['${id}'].id matches key`, preset.id === id);
    checkPreset(preset, `STACKS['${id}']`);
  }


  const byId = resolveStack('next-fullstack');
  assert('resolveStack("next-fullstack") → next-fullstack', byId.id === 'next-fullstack');

  const byIdAstro = resolveStack('astro-site');
  assert('resolveStack("astro-site") → astro-site', byIdAstro.id === 'astro-site');

  const byIdSpa = resolveStack('vite-react-spa');
  assert('resolveStack("vite-react-spa") → vite-react-spa', byIdSpa.id === 'vite-react-spa');


  const marketing = resolveStack('a marketing landing page for my SaaS');
  assert('keyword "landing page" → astro-site', marketing.id === 'astro-site');

  const blog = resolveStack('build me a blog');
  assert('keyword "blog" → astro-site', blog.id === 'astro-site');

  const portfolio = resolveStack('portfolio site');
  assert('keyword "portfolio" → astro-site', portfolio.id === 'astro-site');

  const dashboard = resolveStack('internal dashboard for analytics');
  assert('keyword "dashboard" → vite-react-spa', dashboard.id === 'vite-react-spa');

  const spa = resolveStack('build a SPA for our support team');
  assert('keyword "SPA" → vite-react-spa', spa.id === 'vite-react-spa');

  const internalTool = resolveStack('internal tool for ops team');
  assert('keyword "internal tool" → vite-react-spa', internalTool.id === 'vite-react-spa');


  const unknown = resolveStack('whatever random thing with no keywords');
  assert('unknown brief → next-fullstack (default)', unknown.id === 'next-fullstack');

  const nullHint = resolveStack(null);
  assert('null hint → next-fullstack', nullHint.id === 'next-fullstack');

  const undefinedHint = resolveStack(undefined);
  assert('undefined hint → next-fullstack', undefinedHint.id === 'next-fullstack');

  const emptyHint = resolveStack('');
  assert('empty hint → next-fullstack', emptyHint.id === 'next-fullstack');


  checkPreset(resolveStack('next-fullstack'), 'resolved[next-fullstack]');
  checkPreset(resolveStack('a marketing landing page'), 'resolved[marketing keyword]');
  checkPreset(resolveStack('whatever'), 'resolved[default]');


  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}
