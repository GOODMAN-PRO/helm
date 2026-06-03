// animation-libs.mjs — shared animation toolkit knowledge for the builder.
// Injected into frontend/design agent prompts; also imported by stack/quality code.
// Pure knowledge module: no I/O, no deps, never throws.

import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// ANIMATION_DEPS — npm packages to install for award-grade animated sites.
// 3D libs (three, @react-three/*) are optional but listed; agents that don't
// need 3D should install just the first four.
// ---------------------------------------------------------------------------
export const ANIMATION_DEPS = [
  'gsap',
  '@gsap/react',          // useGSAP hook (official; replaces raw useLayoutEffect patterns)
  'lenis',
  '@studio-freight/react-lenis',  // Lenis React context wrapper
  'framer-motion',
  'three',
  '@react-three/fiber',
  '@react-three/drei',
  '@studio-freight/tempus', // unified rAF scheduler; Lenis + GSAP ticker sync
];

// ---------------------------------------------------------------------------
// ANIMATION_STACK — rich prompt-ready string explaining which library to use
// for what, with Next.js App Router idioms and gotchas.
// ~300 words + code snippets; usable verbatim as prompt context.
// ---------------------------------------------------------------------------
export const ANIMATION_STACK = `
## Animation stack — which tool for what

### GSAP + ScrollTrigger (scroll choreography, pins, scrubs, parallax)
Use GSAP for anything driven by scroll position: pinned sections, horizontal scrub,
staggered text reveals, counter animations, progress-linked transforms. Always pair
with @gsap/react's \`useGSAP\` (cleans up on unmount automatically):

\`\`\`tsx
'use client';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function PinnedSection({ containerRef }) {
  useGSAP(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: containerRef.current,
        start: 'top top',
        end: '+=200%',
        pin: true,
        scrub: 1,
      },
    });
    tl.from('.card', { yPercent: 40, opacity: 0, stagger: 0.15 });
  }, { scope: containerRef });
}
\`\`\`

**Gotcha:** call \`ScrollTrigger.refresh()\` after fonts/images load to fix position
mismatches. In Next.js App Router, register plugins ONCE at module level outside components
(they register globally; re-registering is a no-op but costs a tick).

### Lenis (smooth / inertia scroll, synced to ScrollTrigger)
Lenis replaces native scroll with a momentum-based version. Sync it to GSAP's ticker
so ScrollTrigger reads the same position:

\`\`\`tsx
'use client';
import Lenis from 'lenis';
import { useEffect } from 'react';
import gsap from 'gsap';

export function SmoothScroll({ children }) {
  useEffect(() => {
    const lenis = new Lenis();
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0); // prevent large delta jumps
    return () => { lenis.destroy(); };
  }, []);
  return <>{children}</>;
}
\`\`\`

Wrap the layout root with this component. Never use both Lenis AND CSS \`scroll-behavior:smooth\` — they fight.

### Framer Motion (component/enter-exit/layout/page transitions, whileInView)
Use Framer Motion for React component lifecycles: mount/unmount animations, layout shifts,
\`whileInView\` reveals, page transitions, spring micro-interactions, and magnetic/hover states.

\`\`\`tsx
'use client';
import { motion } from 'framer-motion';

const fadeUp = { hidden: { opacity: 0, y: 32 }, visible: { opacity: 1, y: 0 } };

export function RevealCard({ children }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
\`\`\`

### React Three Fiber + drei + three (tasteful 3D hero/product scenes)
For hero backgrounds, product viewers, or WebGL accents — only when the content calls for it.
Always dynamic-import with \`ssr: false\` in Next.js (three.js uses browser APIs):

\`\`\`tsx
import dynamic from 'next/dynamic';
const HeroCanvas = dynamic(() => import('@/components/HeroCanvas'), { ssr: false });
\`\`\`

### SSR safety rules (Next.js App Router)
- Every file that uses GSAP, Framer Motion, or Lenis MUST have \`'use client'\` at the top.
- Dynamic-import with \`ssr: false\` for anything that touches \`window\`, \`document\`, or three.js.
- Check \`typeof window !== 'undefined'\` before referencing browser globals at module level.

### prefers-reduced-motion (non-negotiable)
\`\`\`ts
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// GSAP: gsap.globalTimeline.timeScale(prefersReduced ? 0 : 1);
// Framer: wrap variants in a hook that returns instant transitions when reduced.
\`\`\`
All animated components MUST provide a calm, fully-readable fallback for reduced-motion users.
Never hide content behind animation — it must be accessible with JS off or motion disabled.

### Performance rules
- Animate only \`transform\` and \`opacity\` — never \`width\`, \`height\`, \`top\`, \`left\` (layout thrash).
- Use \`will-change: transform\` sparingly (only on actively animating elements; remove after).
- Code-split 3D bundles with dynamic import; lazy-load GSAP plugins only when used.
- Target 60fps: profile in DevTools, kill any animation that causes paint/layout recalcs.
`.trim();

// ---------------------------------------------------------------------------
// installCmd — returns the install command for ANIMATION_DEPS + optional extras.
// Supports npm (default), pnpm, yarn. Never throws.
// ---------------------------------------------------------------------------
export function installCmd(packageManager = 'npm', extras = []) {
  try {
    const pm = String(packageManager || 'npm').toLowerCase().trim();
    const extraList = Array.isArray(extras) ? extras : [];
    const allPkgs = [...ANIMATION_DEPS, ...extraList].join(' ');

    if (pm === 'pnpm') return `pnpm add ${allPkgs}`;
    if (pm === 'yarn') return `yarn add ${allPkgs}`;
    return `npm install ${allPkgs}`;
  } catch {
    // defensive: if something unexpectedly goes wrong, return a safe default
    return `npm install ${ANIMATION_DEPS.join(' ')}`;
  }
}

// ---------------------------------------------------------------------------
// Self-test (guarded — only runs when executed directly)
// ---------------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let passed = 0;
  let failed = 0;

  function assert(label, cond) {
    if (cond) {
      console.log(`  PASS  ${label}`);
      passed++;
    } else {
      console.error(`  FAIL  ${label}`);
      failed++;
    }
  }

  console.log('animation-libs self-test');

  assert('ANIMATION_DEPS is a non-empty array',
    Array.isArray(ANIMATION_DEPS) && ANIMATION_DEPS.length > 0);

  assert('ANIMATION_DEPS contains gsap',
    ANIMATION_DEPS.includes('gsap'));

  assert('ANIMATION_STACK is a non-empty string',
    typeof ANIMATION_STACK === 'string' && ANIMATION_STACK.length > 0);

  assert('ANIMATION_STACK mentions ScrollTrigger',
    ANIMATION_STACK.includes('ScrollTrigger'));

  const pnpmCmd = installCmd('pnpm');
  assert('installCmd("pnpm") returns string starting with "pnpm"',
    typeof pnpmCmd === 'string' && pnpmCmd.startsWith('pnpm'));

  const npmCmd = installCmd('npm');
  assert('installCmd("npm") returns string starting with "npm"',
    typeof npmCmd === 'string' && npmCmd.startsWith('npm'));

  const yarnCmd = installCmd('yarn');
  assert('installCmd("yarn") returns string starting with "yarn"',
    typeof yarnCmd === 'string' && yarnCmd.startsWith('yarn'));

  const withExtras = installCmd('pnpm', ['@gsap/member-plugin']);
  assert('installCmd with extras includes the extra package',
    withExtras.includes('@gsap/member-plugin'));

  const defaultCmd = installCmd();
  assert('installCmd() defaults to npm',
    typeof defaultCmd === 'string' && defaultCmd.startsWith('npm'));

  assert('installCmd never throws on bad input',
    (() => { try { installCmd(null, null); return true; } catch { return false; } })());

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
