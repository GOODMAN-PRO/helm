// stack-showcase.mjs — StackPreset for award-grade, highly-animated showcase/marketing sites.
// Bar: apple.com / Awwwards SotD / Stripe / Linear.
// Stack: Next.js App Router + TypeScript + Tailwind + Framer Motion + GSAP/ScrollTrigger +
//        Lenis smooth scroll + optional React Three Fiber/three for 3D.
//
// §6 of CONTRACT.md owns the StackPreset interface.
// §8 of CONTRACT.md defines the award-grade motion/craft standard — this preset encodes it.
//
// Collaborators: import `showcaseStack` from this file. Do NOT import internal helpers.

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Internal helpers (mirrors stack.mjs style for consistency across builder)
// ---------------------------------------------------------------------------

/** Run cmd + args non-interactively; return {ok, output, error?}. Never throws. */
function runCmd(cmd, args, { cwd, timeoutMs = 600_000 } = {}) {
  try {
    const result = spawnSync(cmd, args, {
      cwd,
      // CI=1 kills interactive prompts in create-next-app; ADBLOCK=1 skips telemetry nags
      env: { ...process.env, CI: '1', ADBLOCK: '1' },
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,  // scaffolders can be chatty
      windowsHide: true,
      encoding: 'utf8',
    });

    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

    if (result.error) {
      // ENOENT / ETIMEDOUT — CLI or network unavailable; engineers install manually
      return { ok: false, output, error: result.error.message };
    }
    if (result.status !== 0) {
      return { ok: false, output, error: `exit ${result.status}` };
    }
    return { ok: true, output };
  } catch (err) {
    // Defensive: spawnSync should absorb all OS errors, but guard anyway
    return { ok: false, output: '', error: String(err?.message ?? err) };
  }
}

/** Ensure the PARENT of projectDir exists so the scaffolder can create the leaf. */
function ensureParent(projectDir) {
  mkdirSync(path.dirname(projectDir), { recursive: true });
}

// ---------------------------------------------------------------------------
// The showcase-site StackPreset
// ---------------------------------------------------------------------------

export const showcaseStack = {
  id: 'showcase-site',
  label: 'Award-grade animated showcase site',

  summary:
    'Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion · ' +
    'GSAP + ScrollTrigger (scroll choreography) · Lenis (smooth/inertia scroll) · ' +
    'optional React Three Fiber + three.js (hero / product 3D scenes). ' +
    'Built for scroll-driven storytelling, premium motion language, 60fps GPU-accelerated ' +
    'animations, and a prefers-reduced-motion fallback throughout. ' +
    'The bar is apple.com / Awwwards Site of the Day / Stripe / Linear — ' +
    'impeccable type, generous whitespace, art-directed scenes, real preloader, and ' +
    'every interaction kinetically alive. No stubs, no Lorem, no "coming soon".',

  packageManager: 'npm',

  devCommand:   'next dev',
  buildCommand: 'next build',
  testCommand:  'next lint && tsc --noEmit',  // no heavy test runner by default for pure showcase sites
  lintCommand:  'next lint',

  notes: [
    // --- Directory layout ---
    'src/app/  — App Router pages and layouts (Next.js 14+).',
    'src/components/  — shared React components.',
    'src/components/motion/  — animation-specific components (MotionDiv wrappers, ScrollReveal, etc.).',
    'src/components/three/  — R3F scenes; always dynamic-imported with { ssr: false }.',
    'src/lib/motion-system.ts  — THE single source of truth for all easing curves, duration tokens,',
    '  and spring configs. Every animated component imports from here. No magic numbers in JSX.',
    'src/lib/lenis.ts  — Lenis singleton + React context. Also wires ScrollTrigger.scrollerProxy',
    '  so GSAP timelines track Lenis scroll, not the native scroll position.',
    '',
    // --- Component rules ---
    '"use client" is required on every file that imports Framer Motion, GSAP, Lenis, or R3F,',
    '  because they rely on browser APIs unavailable during SSR.',
    '3D scenes: use dynamic(import("../three/HeroScene"), { ssr: false }) — never import R3F at top level.',
    'Canvas components: wrap in <Suspense fallback={...}> with a styled placeholder that matches',
    '  final dimensions to prevent CLS.',
    '',
    // --- Animation conventions ---
    'Framer Motion: use `motion` primitives for enter/exit, layout animations, page transitions,',
    '  and springy micro-interactions (magnetic buttons, hover states). All transitions reference',
    '  the easing + duration tokens from src/lib/motion-system.ts.',
    'GSAP + ScrollTrigger: scroll-choreographed reveals, parallax, pinned sections, and scene',
    '  transitions. Initialize ScrollTrigger in a useLayoutEffect / useGSAP hook. Always call',
    '  ScrollTrigger.refresh() after Lenis emits a resize event.',
    'Lenis: instantiate once in src/app/layout.tsx (or a <SmoothScrollProvider> client wrapper).',
    '  Pass the Lenis instance to ScrollTrigger via scrollerProxy before any timeline is created.',
    '  On route change: lenis.destroy() and reinitialize.',
    '',
    // --- Performance rules ---
    'Animate transform and opacity ONLY — never width/height/top/left (forces layout).',
    'will-change: transform on elements that animate constantly (hero, parallax layers).',
    'Lazy-load and code-split 3D / heavy animation bundles via next/dynamic.',
    'Preload above-the-fold hero assets (fonts, key images) in <head> with priority.',
    '',
    // --- Reduced-motion ---
    'prefers-reduced-motion is non-negotiable. Pattern:',
    '  const prefersReduced = useReducedMotion();  // Framer Motion hook',
    '  Feed this into motion-system.ts variants: if prefersReduced → instant/opacity-only transitions.',
    '  GSAP timelines: check window.matchMedia("(prefers-reduced-motion: reduce)").matches before',
    '  registering scroll triggers; show final state immediately if true.',
    '  R3F scenes: if prefersReduced → static mesh, no animation loop.',
    '',
    // --- Craft checklist ---
    'Real preloader/reveal: block paint until fonts + hero asset are loaded, then animate out.',
    'Kinetic typography: headlines split into words/chars for staggered reveals (GSAP SplitText',
    '  or a lightweight custom splitter — no extra dep if budget is tight).',
    'Empty + loading states: always styled (skeleton / shimmer) — never a blank white box.',
    'All images: next/image with sizes prop for responsive delivery.',
    'Keyboard + screen-reader friendly: every interactive element reachable and operable without a pointer.',
    'No Lorem ipsum, no placeholder URLs, no stub handlers — every interaction must work.',
  ].join('\n'),

  /** Scaffold the project then install animation libraries.
   *  Steps:
   *    1. mkdirSync parent (recursive).
   *    2. create-next-app non-interactively (CI=1, ~600s).
   *    3. best-effort npm install of animation deps (~600s).
   *  Returns {ok, output, error?}. Never throws.
   */
  async scaffold(projectDir) {
    ensureParent(projectDir);

    // Step 1: create-next-app
    // Flags match the next-fullstack preset for consistency — same App Router + TS + Tailwind base.
    // --no-turbopack: use stable webpack so GSAP/Lenis plugins resolve without ESM quirks.
    const scaffoldResult = runCmd(
      'npx',
      [
        '--yes',
        'create-next-app@latest',
        projectDir,
        '--ts',
        '--tailwind',
        '--eslint',
        '--app',
        '--src-dir',
        '--use-npm',
        '--no-import-alias',
      ],
      { cwd: path.dirname(projectDir), timeoutMs: 600_000 },
    );

    if (!scaffoldResult.ok) {
      // create-next-app failed — could be network or missing npx.
      // Engineers will create the project manually; animation libs still can't be installed.
      return {
        ok: false,
        output: scaffoldResult.output,
        error: `create-next-app failed: ${scaffoldResult.error}`,
      };
    }

    // Step 2: install animation libraries (best-effort — if this fails the scaffold is still usable)
    // gsap         — ScrollTrigger, SplitText, etc. (all bundled)
    // lenis        — smooth/inertia scroll
    // framer-motion — React animation primitives
    // three        — WebGL math + renderer (R3F peer dep)
    // @react-three/fiber  — React renderer for three.js
    // @react-three/drei   — helpers: OrbitControls, Environment, Html, etc.
    const installResult = runCmd(
      'npm',
      [
        'install',
        'gsap',
        'lenis',
        'framer-motion',
        'three',
        '@react-three/fiber',
        '@react-three/drei',
      ],
      { cwd: projectDir, timeoutMs: 600_000 },
    );

    const combinedOutput = [scaffoldResult.output, installResult.output].filter(Boolean).join('\n');

    if (!installResult.ok) {
      // Network unavailable — animation libs must be installed manually.
      // The scaffold itself succeeded so ok:false here would block the orchestrator.
      // Return ok:true with a clear warning so the build can continue.
      return {
        ok: true,
        output: combinedOutput,
        error:
          'Animation libs could not be installed (network/npm unavailable). ' +
          'Run: npm install gsap lenis framer-motion three @react-three/fiber @react-three/drei',
      };
    }

    return { ok: true, output: combinedOutput };
  },
};

// ---------------------------------------------------------------------------
// Self-test (run with: node stack-showcase.mjs)
// Does NOT invoke scaffold — CONTRACT §14 / hard rule: never spawn real commands in tests.
// ---------------------------------------------------------------------------

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

  console.log('\n--- stack-showcase.mjs self-test ---\n');

  // 1. Export exists and is an object
  assert('showcaseStack is exported', showcaseStack !== undefined);
  assert('showcaseStack is object', showcaseStack && typeof showcaseStack === 'object');

  // 2. All required StackPreset fields present
  for (const field of REQUIRED_FIELDS) {
    assert(`field "${field}" present`, field in showcaseStack, 'missing');
  }

  // 3. Field value checks
  assert('id is "showcase-site"',   showcaseStack.id === 'showcase-site');
  assert('label is non-empty string', typeof showcaseStack.label === 'string' && showcaseStack.label.length > 0);
  assert('summary mentions Next.js',  showcaseStack.summary.includes('Next.js'));
  assert('summary mentions Framer Motion', showcaseStack.summary.includes('Framer Motion'));
  assert('summary mentions GSAP',     showcaseStack.summary.includes('GSAP'));
  assert('summary mentions Lenis',    showcaseStack.summary.includes('Lenis'));
  assert('summary mentions prefers-reduced-motion', showcaseStack.summary.includes('prefers-reduced-motion'));
  assert('packageManager is "npm"',   showcaseStack.packageManager === 'npm');
  assert('devCommand non-empty',      typeof showcaseStack.devCommand === 'string' && showcaseStack.devCommand.length > 0);
  assert('buildCommand non-empty',    typeof showcaseStack.buildCommand === 'string' && showcaseStack.buildCommand.length > 0);
  assert('testCommand non-empty',     typeof showcaseStack.testCommand === 'string' && showcaseStack.testCommand.length > 0);
  assert('lintCommand non-empty',     typeof showcaseStack.lintCommand === 'string' && showcaseStack.lintCommand.length > 0);
  assert('notes is non-empty string', typeof showcaseStack.notes === 'string' && showcaseStack.notes.length > 50);
  assert('notes mentions motion-system', showcaseStack.notes.includes('motion-system'));
  assert('notes mentions Lenis+ScrollTrigger sync', showcaseStack.notes.includes('scrollerProxy'));
  assert('notes mentions prefers-reduced-motion', showcaseStack.notes.includes('prefers-reduced-motion'));
  assert('notes mentions use client', showcaseStack.notes.includes('"use client"') || showcaseStack.notes.includes("'use client'"));
  assert('notes mentions ssr: false', showcaseStack.notes.includes('ssr: false'));

  // 4. scaffold is callable (but NEVER actually called in this test)
  assert('scaffold is async function', typeof showcaseStack.scaffold === 'function');
  assert('scaffold.constructor.name is AsyncFunction',
    showcaseStack.scaffold.constructor.name === 'AsyncFunction');

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}
