// reference-standard.mjs — shared award-grade quality bar injected into every builder agent prompt.
// Pure ESM, no dependencies, no I/O, never throws.
// Self-test: node motion/reference-standard.mjs

import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// AWARD_STANDARD — the quality bar every frontend/design agent must meet.
// Directive text; usable verbatim as prompt context.
// ---------------------------------------------------------------------------

export const AWARD_STANDARD = `
You are building to the standard of apple.com, Awwwards Site of the Day, Stripe, and Linear —
not a generic template or a starter kit. Every site this system produces must feel premium,
intentional, and alive. Apply the following principles without exception.

SCROLL-DRIVEN STORYTELLING. Content does not simply appear; it is revealed through scroll
choreography. Use GSAP + ScrollTrigger for scroll-pinned scenes, parallax depth layers, and
section transitions tied precisely to scroll position. Use Lenis for smooth, inertia-based
scroll that makes the page feel physically real. Every section transition is a directed moment,
not a boundary.

COHERENT MOTION LANGUAGE. Framer Motion (motion.*) drives all component enter/exit, layout,
and page-transition animations. Define a shared motion system early in the design phase:
timing tokens (fast 150ms, standard 300ms, expressive 600ms), easing curves (ease-out cubic
for entrances, ease-in-out for state changes, spring for micro-interactions), and stagger
patterns for list reveals. Every animated element draws from this system — nothing is ad hoc.
Micro-interactions (magnetic buttons, hover lifts, cursor-follow effects, springy icon states)
make the interface feel alive at rest.

DEPTH WHERE IT SERVES THE STORY. When a product, concept, or brand moment benefits from
spatial depth, use Three.js / React Three Fiber for a hero or product scene. WebGL shader
accents (noise gradients, distortion effects, environment maps) are tools for storytelling, not
decoration. Never add 3D to fill space — add it when it makes something clearer or more felt.

IMPECCABLE CRAFT. Type scale follows a strict ratio (1.25 or 1.333); letter-spacing is set per
weight class; line-height is proportional to measure. Whitespace is generous and deliberate —
sections breathe, contrast between dense and open regions creates rhythm. Every page has a
real preloader/reveal sequence. Kinetic typography (character splits, blur reveals, counter
animations) is used for the moments that deserve emphasis. Imagery is art-directed: real
photos or high-quality illustrations that match the brand language, never generic stock.
Loading and empty states are polished, never blank.

60FPS GPU-FRIENDLY PERFORMANCE. Animate only transform and opacity — never trigger layout
(no width/height/top/left animations). Lazy-load all heavy assets. Code-split Three.js and
heavy animation bundles so the initial bundle is fast. Use will-change sparingly on surfaces
that animate frequently. Measure — no jank, no CLS, no paint storms.

ACCESSIBILITY IS NON-NEGOTIABLE. Every animated element must respect prefers-reduced-motion:
wrap all GSAP and Framer Motion animations in a reduced-motion check and provide a calm,
instant fallback. Content must be fully usable without JavaScript where feasible. All
interactive elements are keyboard-reachable and screen-reader friendly (aria labels, roles,
live regions for dynamic content). Color contrast meets WCAG AA at minimum.

ZERO STUBS. Real copy. Real imagery handling. Every interaction works end-to-end on first
load. No TODO comments, no "coming soon" sections, no lorem ipsum, no placeholder URLs, no
commented-out blocks. If data is not yet available, show a polished empty state — not a blank
div. Ship only what is complete.
`.trim();

// ---------------------------------------------------------------------------
// POLISH_CHECKLIST — fine → exceptional details every agent must verify.
// ---------------------------------------------------------------------------

export const POLISH_CHECKLIST = `
- Spacing rhythm: all gaps, padding, and margins derive from a 4px base grid; no arbitrary px values.
- Type hierarchy: maximum 3 distinct sizes per section; weights contrast clearly (e.g. 400/600/800); no orphan words on headlines.
- Hover states: every interactive element has a distinct, animated hover — no bare CSS color swap without motion.
- Focus states: visible, branded focus rings on all focusable elements; never outline:none without a replacement.
- Active/pressed states: buttons and links have a 80ms scale-down or color-deepen on active for physical feedback.
- Motion timing consistency: entrance animations across a page use the same easing family; no mixed spring/linear at the same level.
- Section seams: transitions between sections are intentional — gradient overlaps, clip-path reveals, or scroll-pinned crossfades; no abrupt background cuts.
- Contrast: body text ≥ 4.5:1 against its background; large display text ≥ 3:1; decorative-only elements exempt.
- Imagery quality: all images have correct aspect ratios, object-fit, and alt text; no stretched or blurry assets.
- Mobile polish: tap targets ≥ 44×44px; font sizes ≥ 16px for body; no horizontal overflow; scroll choreography degrades gracefully on touch.
- Reduced-motion fallback: tested with prefers-reduced-motion:reduce — layout still correct, content still accessible.
- Loading states: skeleton screens or spinners for any async content; never a blank flash.
- Error states: form errors are inline, specific, and non-blocking; network errors show a retry affordance.
- Empty states: illustrated or copywritten; never a blank container.
- Link and button copy: action-oriented, specific ("View case study" not "Click here"); no generic labels.
`.trim();

// ---------------------------------------------------------------------------
// standardFor — returns AWARD_STANDARD for a given interface kind.
// Kind is reserved for future variants ('app', 'email', etc.); always returns
// the string, never throws.
// ---------------------------------------------------------------------------

export function standardFor(kind = 'web') {
  // kind is reserved — all variants use the same standard for now.
  void kind;
  return AWARD_STANDARD;
}

// ---------------------------------------------------------------------------
// Self-test (only runs when executed directly)
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let pass = true;
  const fail = (msg) => { console.error(`FAIL: ${msg}`); pass = false; };

  if (typeof AWARD_STANDARD !== 'string' || AWARD_STANDARD.length === 0)
    fail('AWARD_STANDARD is not a non-empty string');

  if (typeof POLISH_CHECKLIST !== 'string' || POLISH_CHECKLIST.length === 0)
    fail('POLISH_CHECKLIST is not a non-empty string');

  const result = standardFor('web');
  if (typeof result !== 'string' || result.length === 0)
    fail('standardFor("web") did not return a non-empty string');

  const resultDefault = standardFor();
  if (typeof resultDefault !== 'string' || resultDefault.length === 0)
    fail('standardFor() did not return a non-empty string');

  const resultUnknown = standardFor('app');
  if (typeof resultUnknown !== 'string' || resultUnknown.length === 0)
    fail('standardFor("app") did not return a non-empty string');

  if (pass) {
    console.log('PASS: reference-standard.mjs — all exports verified');
  } else {
    process.exit(1);
  }
}
