// page-transition-engineer.mjs — Page Transition Engineer role for the Helm full-stack builder.
// Implements premium route/page transitions: framer-motion template.tsx + AnimatePresence,
// View Transitions API (with fallback), Lenis re-init on route change, scroll restoration,
// and prefers-reduced-motion instant/cross-fade path.
//
// §1 of CONTRACT.md owns the role schema; §8 sets the award-grade motion bar.

import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Role definition
// ---------------------------------------------------------------------------

export const roles = [
  {
    id: 'page-transition-engineer',
    title: 'Page Transition Engineer',
    phase: 'frontend',
    deps: ['interaction-engineer'],
    model: 'sonnet',
    produces: [],

    // Expert persona: deep knowledge of Next.js App Router constraints, framer-motion,
    // View Transitions API, Lenis, and GSAP ScrollTrigger lifecycle across navigations.
    system: `You are an expert page-transition engineer with deep experience in Next.js App Router,
framer-motion, the native View Transitions API, Lenis smooth-scroll, and GSAP ScrollTrigger.
You have shipped many production sites where route transitions are seamless, fast, and feel
premium — the kind of transitions you see on award-winning Awwwards or Apple product pages.

Core expertise:
- App Router constraints: template.tsx re-mounts on every navigation (unlike layout.tsx), making
  it the correct hook for AnimatePresence. You know exactly why layout.tsx cannot host exit
  animations and never make that mistake.
- Framer Motion: AnimatePresence + motion.div variants for enter/exit choreography; layout
  animations for shared-element morphs; useReducedMotion() hook; LazyMotion + domAnimation
  bundle to keep the JS payload minimal.
- View Transitions API: document.startViewTransition() + ::view-transition-* CSS, view-transition-name
  on shared elements, graceful feature detection + fallback to framer-motion cross-fade.
- Lenis: re-initialise (or .start() after .stop()) after every route change so inertia scroll
  never carries stale state into the new page; integrate with GSAP ScrollTrigger.refresh() to
  re-bind scroll animations to the new DOM.
- Scroll restoration: next/navigation's useRouter does NOT restore scroll by default in some
  patterns — you know how to pair router.push() with manual window.scrollTo(0,0) or the
  experimental scrollRestoration config and when each is correct.
- Performance: all transitions run on transform/opacity only (no layout props), stay under 500ms,
  are GPU-composited, and never block interaction. Route chunks are code-split so the animation
  bundle does not bloat the initial load.
- prefers-reduced-motion: detected via useReducedMotion() and a CSS media query; reduced-motion
  path renders an instant page swap or a 150ms cross-fade — never a full slide/wipe.
- No stubs, no TODOs, no placeholder variants. Every transition is implemented and wired.`,

    // task(ctx) builds the concrete instruction for this build from the project context.
    task(ctx) {
      const stackNotes  = ctx.stack?.notes ?? 'Next.js App Router, framer-motion, Lenis, GSAP';
      const brief       = ctx.brief ?? '';
      const artifacts   = ctx.artifactsDigest?.() ?? '';

      return `
## Build: Premium Page Transitions

### Project brief
${brief}

### Stack conventions (follow exactly)
${stackNotes}

### Prior artifacts from upstream roles
${artifacts || '(none — infer from the brief and stack conventions above)'}

---

## What you must implement — all of it, zero stubs

### 1. Motion system import  →  \`src/lib/motion.ts\`
If a motion-system artifact exists in the prior artifacts above, read its easing/duration tokens
and re-export them from this file so page transitions stay consistent with component animations.
If no artifact exists, define a minimal set:
- \`TRANSITION_EASE\` — a cubic-bezier string: [0.22, 1, 0.36, 1] (ease-out-expo feel).
- \`PAGE_DURATION\` — 0.45 (seconds).
- \`REDUCED_DURATION\` — 0.15 (seconds).
Export these as named constants; import them everywhere instead of hard-coding values.

### 2. Route transition variants  →  \`src/lib/page-variants.ts\`
Define framer-motion Variants objects for the supported transition styles.
Export at minimum:
\`\`\`ts
export const fadeVariants: Variants        // opacity 0→1 / 1→0
export const slideUpVariants: Variants     // opacity + y 24px→0 enter / 0→-16px exit
export const maskWipeVariants: Variants    // clip-path inset(0 0 100% 0)→inset(0) enter; reverse exit
\`\`\`
Each variant must use TRANSITION_EASE + PAGE_DURATION from \`src/lib/motion.ts\`.
Provide a \`reducedVariants\` export that maps to a plain cross-fade (opacity only, REDUCED_DURATION).

### 3. Template wrapper  →  \`src/app/template.tsx\`
This is the heart of App Router page transitions. template.tsx re-mounts on EVERY navigation,
so AnimatePresence + motion.div work correctly here.

Requirements:
- Mark 'use client'.
- Import \`useReducedMotion\` from framer-motion; select \`reducedVariants\` or \`slideUpVariants\`
  (default) based on the result.
- Wrap children in \`<AnimatePresence mode="wait">\` → \`<motion.div>\` with the chosen variants,
  \`initial="initial"\`, \`animate="animate"\`, \`exit="exit"\`.
- Set \`key={usePathname()}\` on the motion.div so framer can track the page identity.
- Apply \`will-change: transform, opacity\` via a Tailwind class or inline style so the browser
  composites the layer. Remove it via onAnimationComplete to free GPU memory after the transition.
- Do NOT use layout.tsx for this — that file must remain a pure Server Component. Keep template.tsx
  as a thin wrapper; do not put data-fetching, providers, or non-transition logic here.

### 4. View Transitions API overlay  →  \`src/lib/view-transitions.ts\`
Implement a \`startPageTransition(callback: () => void | Promise<void>)\` helper that:
- Feature-detects \`document.startViewTransition\` at runtime.
- If supported: wraps the callback in \`document.startViewTransition(callback)\`; sets the
  \`view-transition-name: page-root\` on the outermost page element before the call and removes
  it after so it doesn't bleed into unrelated elements.
- If not supported (Safari < 18, Firefox): falls back to calling the callback directly, letting
  framer-motion template.tsx handle the transition visually.
- Returns a Promise that resolves when the transition finishes (or immediately on fallback).
Export a \`usePageTransition()\` hook that wraps \`next/navigation\`'s \`useRouter\` and patches
\`push\` / \`replace\` to run through \`startPageTransition\`.

### 5. Lenis + ScrollTrigger re-init on route change  →  \`src/components/smooth-scroll-provider.tsx\`
If a smooth-scroll provider already exists in the project (from the interaction-engineer role),
extend it. Otherwise create it.

Requirements:
- Mark 'use client'.
- Create a Lenis instance in useEffect (destroy + re-create on unmount pattern).
- Subscribe to GSAP's ticker: \`gsap.ticker.add((time) => lenis.raf(time * 1000))\`; remove on
  unmount. Set \`gsap.ticker.lagSmoothing(0)\`.
- On every pathname change (usePathname), call:
  1. \`lenis.stop()\`
  2. \`window.scrollTo(0, 0)\` (immediate, before the transition starts — prevents the old scroll
     position bleeding into the entering page).
  3. After the framer transition duration (PAGE_DURATION + 50ms buffer) call:
     \`ScrollTrigger.refresh()\` then \`lenis.start()\`.
  Use a setTimeout / cleanup ref pattern; clear the timeout on pathname change / unmount.
- Honour prefers-reduced-motion: if \`window.matchMedia('(prefers-reduced-motion: reduce)').matches\`,
  create Lenis with \`{ duration: 0 }\` effectively disabling the easing.
- Export a \`useLenis()\` hook (returns the lenis instance ref) so child components can call
  \`lenis.scrollTo(target)\`.

### 6. Shared-element / morph transition helper  →  \`src/lib/shared-element.tsx\`
Export a \`<SharedElement id={string}>\` wrapper component that:
- Sets \`view-transition-name: <id>\` on its child via inline style when the View Transitions API
  is supported (feature-detected via a lazy-evaluated \`supportsViewTransitions\` boolean).
- When VTA is NOT supported, falls back to framer-motion's \`layoutId={id}\` on the inner
  motion.div, enabling FLIP-based shared-element morphs within the same React tree
  (note: layoutId morphs between pages only work when both pages are mounted simultaneously
  — document this limitation in a comment).
- Accepts \`children: React.ReactNode\` and an optional \`as?: keyof JSX.IntrinsicElements\`
  prop (default 'div').

### 7. Global transition CSS  →  \`src/styles/transitions.css\` (imported in root layout)
Add CSS for:
\`\`\`css
/* View Transitions API root animation — overrides the UA default cross-fade */
::view-transition-old(root), ::view-transition-new(root) {
  animation-duration: 0.45s;
  animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
}
::view-transition-old(root) { animation-name: vt-slide-out; }
::view-transition-new(root) { animation-name: vt-slide-in; }

@keyframes vt-slide-out {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(-16px); }
}
@keyframes vt-slide-in {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Reduced-motion: instant swap, no animation */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none;
  }
}
\`\`\`
Import this CSS file in \`src/app/layout.tsx\` (add the import line — do NOT replace the layout,
just add the import).

### 8. Transition-aware Link  →  \`src/components/transition-link.tsx\`
Export a \`<TransitionLink href={string} ...rest>\` client component that:
- Uses the \`usePageTransition()\` hook from step 4 to route through \`startPageTransition\`.
- Renders a plain \`<a>\` tag (or accepts an \`as\` override) so it is semantically correct.
- Passes all other \`<a>\` props (className, children, aria-*, data-*, onClick, etc.) through.
- Prevents the default anchor navigation and uses router.push() inside the transition wrapper.
This is a drop-in replacement for \`<Link>\` when you need the VTA / framer choreography.

---

## Hard constraints
- template.tsx must remain a Client Component — no server-side imports (fs, prisma, etc.).
- All animations use transform + opacity only. Never animate width/height/top/left/margin.
- Page transitions must complete in ≤ 500ms at normal speed; ≤ 150ms in reduced-motion mode.
- No animation package other than framer-motion and GSAP (already in the stack) may be added.
- Every file must compile with TypeScript strict mode — no \`any\`, no non-null assertions.
- Lenis and GSAP are tree-shaken via named imports; do NOT import the full GSAP bundle globally.
- The smooth-scroll provider must be added to the existing providers composition in
  \`src/app/_providers.tsx\` (or \`src/app/layout.tsx\` if _providers does not exist) — do NOT
  create a parallel provider tree.
- Write to REAL project files. Do NOT use placeholder text. Every export must be used somewhere.
`.trim();
    },
  },
];

// ---------------------------------------------------------------------------
// Self-test (run only when executed directly: node page-transition-engineer.mjs)
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const REQUIRED_KEYS  = ['id', 'title', 'phase', 'deps', 'model', 'produces', 'system', 'task'];
  const VALID_PHASES   = ['discovery','architecture','design','scaffold','data','backend','auth',
                          'frontend','integration','quality','finalize'];
  const VALID_MODELS   = ['opus', 'sonnet', 'haiku'];

  let passed = 0;
  let failed = 0;

  function assert(label, condition, detail = '') {
    if (condition) {
      console.log(`  PASS  ${label}`);
      passed++;
    } else {
      console.error(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
      failed++;
    }
  }

  console.log('page-transition-engineer.mjs — self-test\n');

  // 1. Export shape
  assert('roles is an array',  Array.isArray(roles));
  assert('exactly one role',   roles.length === 1, `got ${roles.length}`);

  const role = roles[0];

  // 2. Required keys
  for (const key of REQUIRED_KEYS) {
    assert(`role has key '${key}'`, key in role);
  }

  // 3. Field values match the spec
  assert("id = 'page-transition-engineer'", role.id    === 'page-transition-engineer');
  assert("title = 'Page Transition Engineer'", role.title === 'Page Transition Engineer');
  assert("phase = 'frontend'",               role.phase === 'frontend');
  assert("model = 'sonnet'",                 role.model === 'sonnet');
  assert('phase is valid',                   VALID_PHASES.includes(role.phase));
  assert('model is valid',                   VALID_MODELS.includes(role.model));
  assert('deps includes interaction-engineer',
    Array.isArray(role.deps) && role.deps.includes('interaction-engineer'));
  assert('deps has exactly one entry',       role.deps.length === 1, `got ${role.deps.length}`);
  assert('produces is empty array',          Array.isArray(role.produces) && role.produces.length === 0);
  assert('system is non-empty string',       typeof role.system === 'string' && role.system.trim().length > 0);
  assert('task is a function',               typeof role.task   === 'function');

  // 4. task(fakeCtx) returns a non-empty string with key phrases
  const fakeCtx = {
    brief:           'x',
    stack:           { summary: 'Next.js', notes: 'App Router, template.tsx' },
    artifactsDigest: () => '',
  };

  let taskResult;
  try {
    taskResult = role.task(fakeCtx);
  } catch (err) {
    console.error(`  FAIL  task(fakeCtx) threw: ${err.message}`);
    failed++;
  }

  assert('task(fakeCtx) returns a string',   typeof taskResult === 'string');
  assert('task(fakeCtx) is non-empty',       typeof taskResult === 'string' && taskResult.trim().length > 200,
    `length=${typeof taskResult === 'string' ? taskResult.trim().length : 'N/A'}`);
  assert('task references stack notes',
    typeof taskResult === 'string' && taskResult.includes('App Router, template.tsx'));

  // 5. System prompt covers key domain signals
  const sys = role.system.toLowerCase();
  assert('system mentions template.tsx',         sys.includes('template.tsx'));
  assert('system mentions animatepresence',      sys.includes('animatepresence'));
  assert('system mentions view transitions',     sys.includes('view transition'));
  assert('system mentions lenis',                sys.includes('lenis'));
  assert('system mentions reduced-motion',       sys.includes('reduced-motion') || sys.includes('reducedmotion'));
  assert('system mentions 500ms perf target',    sys.includes('500ms') || sys.includes('500'));
  assert('system demands no stubs',              sys.includes('stub') || sys.includes('no stub') || sys.includes('no todo'));

  console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
