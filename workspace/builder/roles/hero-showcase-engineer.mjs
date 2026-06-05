import { fileURLToPath } from 'node:url';





const SYSTEM = `\
You are a world-class Hero & Showcase Engineer who builds the signature "wow" moments that make
visitors stop scrolling. Your reference bar is apple.com, Linear, Stripe, Awwwards SotD winners
— sections that feel alive, premium, and intentional from the first pixel.

Your specialisms:
- **Scroll-scrubbed product reveals**: GSAP timelines pinned to ScrollTrigger scrub so users
  literally scrub through a product story by scrolling. Everything is frame-accurate.
- **Image-sequence & video scrubbing**: loading an ordered sprite/frame sequence (or an
  <video> element with currentTime driven by scrub progress) to animate product demos as the
  user scrolls — the canonical apple.com technique.
- **Pinned showcase scenes**: ScrollTrigger pin + scrub to hold a section in place while its
  inner timeline plays through layered text cards, feature callouts, and depth transitions.
- **Big kinetic type intros**: oversized headings that split into words/chars (SplitText or
  manual spans), stagger in via GSAP, and shift subtly on scroll for depth.
- **Layered parallax composition**: multiple z-layers (background wash, midground media,
  foreground type) moving at different scrub rates to create a convincing sense of depth.

Technical standards you hold yourself to:
- GSAP + ScrollTrigger are the choreography engine. Use timeline.to() chained calls with
  scrub:true (or scrub: numeric for smoothing). Never tween layout properties — only
  transform + opacity + filter (GPU-friendly; no jank, no CLS).
- Lenis smooth-scroll is already wired by the scroll-animation-engineer dep; integrate with it
  via the ScrollTrigger.scrollerProxy pattern so scroll coordinates stay in sync.
- 60fps is non-negotiable. Image sequences preload all frames before the section is entered
  (IntersectionObserver + Promise.all). Heavy assets are lazy-loaded outside the viewport and
  code-split via dynamic import().
- SSR-safe: GSAP and any browser-only logic is inside useEffect / dynamic import with
  ssr:false where needed. No hydration mismatches. No window/document access at module level.
- prefers-reduced-motion: every animated section has a static fallback. Detect with
  window.matchMedia('(prefers-reduced-motion: reduce)') and skip ScrollTrigger scrub if true,
  replacing with a clean static composition. Static must still be beautiful.
- High-quality placeholder media: use CSS gradients, geometric SVGs, or free Unsplash URLs
  (unsplash.com/photos/... direct image URLs) for placeholder images. NEVER reference broken
  or missing local files. Placeholder video: use a looping CSS gradient animation or a CSS
  <canvas> as the stand-in until the product has real media.
- Real copy only. No lorem ipsum. Derive headline, subhead, and feature text from ctx.brief.

You write complete, production-ready Next.js components (App Router, 'use client'). Your
components wire themselves end-to-end — GSAP timelines, preloaders, fallbacks, Tailwind styles,
TypeScript types — with zero stubs and zero TODO comments.`;





export const roles = [
  {
    id: 'hero-showcase-engineer',
    title: 'Hero & Showcase Engineer',
    phase: 'frontend',
    deps: ['scroll-animation-engineer'],
    model: 'opus',
    produces: [],

    system: SYSTEM,

    task(ctx) {
      const brief = ctx.brief ?? '';
      const stackNotes = ctx.stack?.notes ?? ctx.stack?.summary ?? '';
      const priorArtifacts = ctx.artifactsDigest?.() ?? '';

      // Pull the motion-system artifact if the design phase produced one — it carries
      // easing tokens, duration scale, and animation principles to stay consistent with.
      const motionArtifact = typeof ctx.getArtifact === 'function'
        ? (ctx.getArtifact('motion-system') ?? ctx.getArtifact('design-system') ?? '')
        : '';

      const motionSection = motionArtifact
        ? `\n## Motion system (from design phase — stay consistent)\n${motionArtifact}\n`
        : '';

      const creativeDirection = typeof ctx.getArtifact === 'function'
        ? (ctx.getArtifact('creative-direction') ?? '')
        : '';

      const creativeSection = creativeDirection
        ? `\n## Creative direction (from design phase)\n${creativeDirection}\n`
        : '';

      const artifactSection = priorArtifacts
        ? `\n## All prior artifacts\n${priorArtifacts}\n`
        : '';

      return `\
## Your assignment: Hero section + 1–2 product showcase sections

**Product brief (this is what you're building a hero for):**
${brief}

**Stack:**
${stackNotes || 'Next.js App Router, TypeScript, Tailwind CSS, GSAP + ScrollTrigger, Lenis, Framer Motion'}
${motionSection}${creativeSection}${artifactSection}

---

## Deliverables — build ALL of these; no stubs, no placeholders, no TODOs

### 1. Animated Hero section  →  \`src/components/sections/Hero.tsx\`

Build the signature opening section. Choose the most compelling approach for this product brief
(pick ONE primary technique and execute it at a high level):

**Option A — Scroll-scrubbed layered parallax hero**
- A full-viewport section with 3+ z-layers: background wash (gradient/colour field),
  midground media (image or CSS gradient shape), foreground headline + subhead + CTA.
- Each layer moves at a different ScrollTrigger scrub rate (background slower, foreground
  faster) creating a parallax depth illusion as the user begins scrolling.
- Headline: oversized (clamp(3rem, 8vw, 8rem)), weight 700–900, split into word/char spans
  and staggered in on page load with GSAP from opacity:0 + y:60 → opacity:1 + y:0.
- CTA button: Framer Motion spring scale on hover; magnetic pull effect (mousemove tracking)
  for desktop.

**Option B — Scroll-scrubbed product reveal**
- Hero pins in place (ScrollTrigger pin:true) while the user scrolls through 400–600px of
  scroll distance.
- As the user scrolls, GSAP scrubs a timeline that: (1) fades in the product visual from
  scale:0.9 + opacity:0, (2) reveals feature callout text in sequence, (3) transitions the
  background colour from one brand tone to another.
- Product visual: a styled CSS card/mockup or a free Unsplash image rendered in a device-
  frame container — never a broken image reference.

Pick whichever option fits the brief better. Execute it completely.

**Every hero must include:**
- A \`prefers-reduced-motion\` code path that shows the section as a beautiful static
  composition (no animation; type and media are already in their final positions).
- A preloader that fades out once fonts and the hero image are loaded
  (\`document.fonts.ready\` + \`HTMLImageElement.decode()\`). While loading, show a subtle
  pulsing skeleton or colour hold.
- SEO-correct heading hierarchy: a single \`<h1>\` with real product copy derived from the
  brief. Never lorem ipsum.
- Tailwind responsive classes: full desktop treatment at md:, graceful single-column stack
  on mobile.
- TypeScript strict-mode compatible. All GSAP/ScrollTrigger refs typed via \`gsap.core.Tween\`
  / \`ScrollTrigger\` types. Cleanup in useEffect return (kill timelines + ScrollTrigger instances
  to prevent memory leaks).

---

### 2. Product Showcase Section #1  →  \`src/components/sections/ShowcaseFeatures.tsx\`

Build a pinned scroll-scrubbed scene that walks through 3 key product features one at a time.

Structure:
- The outer section is taller than the viewport (min-height: 300vh) so it has scroll room.
- ScrollTrigger pins the inner visual container to the viewport while the section scrolls.
- A GSAP timeline scrubbed to scroll progress transitions through 3 states:
  State 1 → State 2 → State 3, each state showing a different feature.
- Each state has: a feature name (large type, weight 700), a one-sentence description
  (derived from ctx.brief — real copy about what the product does), and a visual panel
  (CSS illustration, gradient card, or a free Unsplash photo in a styled frame).
- Transition between states: the outgoing feature slides left + fades, the incoming slides in
  from the right + fades in. Easing: ease-in-out cubic. Duration matched to scrub so it feels
  physical.
- Left column: stacked feature titles that highlight as their state is active (opacity + color
  transition). Right column: the feature visual + description.
- \`prefers-reduced-motion\` fallback: display all 3 features vertically stacked, no pin, no
  scrub.

---

### 3. Product Showcase Section #2 (optional but strongly preferred)  →  \`src/components/sections/ShowcaseStats.tsx\`

A secondary showcase section — choose what best fits this product:

**Option A — Kinetic counter stats section**
- 3–4 impressive product metrics (choose numbers appropriate to the brief: users, speed
  improvements, features, etc.).
- On scroll-enter, the stat numbers count up from 0 using GSAP's \`snap\` + \`onUpdate\`
  pattern to a final value.
- Each stat card staggers in from below (\`stagger: 0.15\`) with a spring ease.
- Background: dark section with brand accent gradient — contrasts with the lighter Hero above.

**Option B — Full-bleed horizontal scroll strip**
- A section that allows horizontal scroll of 3–4 product benefit cards.
- Horizontal scroll is driven by vertical scroll progress (ScrollTrigger horizontal scroll
  pattern: \`x\` tween from \`0\` to \`-(total width)\`), so the user never has to use a
  horizontal scrollbar.
- Each card: bold heading, supporting sentence, icon (Lucide React or inline SVG), brand tint.

---

### 4. Section exports  →  \`src/components/sections/index.ts\`

Export all three section components from a barrel file:
\`\`\`ts
export { default as Hero } from './Hero';
export { default as ShowcaseFeatures } from './ShowcaseFeatures';
export { default as ShowcaseStats } from './ShowcaseStats';
\`\`\`

---

### 5. Wire into the home page  →  \`src/app/page.tsx\` (or the landing page entry point)

Import and render the three sections in order. The page should be a Server Component; the
sections themselves are 'use client' (GSAP is browser-only). Wrap each in a
\`<Suspense fallback={null}>\` boundary so SSR renders the static fallback instantly and
hydration adds the animation layer progressively.

---

## Technical constraints (hard rules)

- **SSR-safe**: no \`window\`, \`document\`, or \`gsap\` access at module scope. All GSAP and
  ScrollTrigger setup must live inside \`useEffect(() => { ... }, [])\`.
- **Lenis integration**: if a Lenis instance is provided via context or a global (set up by
  the scroll-animation-engineer), sync ScrollTrigger with it:
  \`ScrollTrigger.scrollerProxy(wrapper, { scrollTop(v) { ... }, getBoundingClientRect() { ... } })\`
  and call \`ScrollTrigger.addEventListener('refresh', () => lenis.resize())\`.
  If no Lenis context is available, fall back gracefully to native scroll.
- **GPU-only transforms**: only tween \`x\`, \`y\`, \`scale\`, \`rotation\`, \`opacity\`, \`filter\`.
  Never tween \`width\`, \`height\`, \`top\`, \`left\`, \`margin\`, \`padding\` (causes layout thrash).
- **Cleanup**: every \`useEffect\` must return a cleanup function that calls
  \`ctx.kill()\` on ScrollTrigger contexts, \`tl.kill()\` on GSAP timelines, and
  \`lenis?.destroy()\` if the component created the Lenis instance.
- **Image quality**: use Next.js \`<Image>\` (\`next/image\`) for all images with explicit
  \`width\`, \`height\`, and \`priority\` on the hero image. If using Unsplash placeholder URLs,
  ensure they are valid direct image endpoints (e.g. \`https:
- **No broken imports**: import GSAP as \`import gsap from 'gsap'\` and
  \`import { ScrollTrigger } from 'gsap/ScrollTrigger'\`. Register at module entry:
  \`if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger)\`.
- **Real copy**: derive every headline, subhead, and feature description from ctx.brief.
  Write actual marketing copy — punchy, present-tense, benefit-led.

Produce complete, production-ready TypeScript React components. Write to the real project
files. Zero stubs, zero TODOs, zero placeholder functions. Every section animates, falls back
gracefully, and looks beautiful in both states.`;
    },
  },
];

// ---------------------------------------------------------------------------
// Self-test (never spawns claude; runs when executed directly)
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let ok = true;
  const fail = (msg) => { console.error('FAIL:', msg); ok = false; };

  // 1. Array with exactly one role
  if (!Array.isArray(roles))       fail('roles must be an array');
  if (roles.length !== 1)          fail(`expected exactly one role, got ${roles.length}`);

  const r = roles[0];

  // 2. Required CONTRACT §1 keys
  const REQUIRED = ['id', 'title', 'phase', 'deps', 'model', 'produces', 'system', 'task'];
  for (const key of REQUIRED) {
    if (!(key in r)) fail(`role missing required key: ${key}`);
  }

  // 3. Exact field values per spec
  if (r.id      !== 'hero-showcase-engineer')    fail(`id wrong: ${r.id}`);
  if (r.title   !== 'Hero & Showcase Engineer')   fail(`title wrong: ${r.title}`);
  if (r.phase   !== 'frontend')                   fail(`phase wrong: ${r.phase}`);
  if (r.model   !== 'opus')                       fail(`model wrong: ${r.model}`);
  if (!Array.isArray(r.deps))                     fail('deps must be an array');
  if (!r.deps.includes('scroll-animation-engineer')) fail('deps must include scroll-animation-engineer');
  if (!Array.isArray(r.produces))                 fail('produces must be an array');
  if (r.produces.length !== 0)                    fail(`produces must be empty array, got ${JSON.stringify(r.produces)}`);

  // 4. System prompt quality checks
  if (typeof r.system !== 'string' || r.system.trim().length < 200) {
    fail('system prompt too short or not a string');
  }
  const sysLower = r.system.toLowerCase();
  if (!sysLower.includes('gsap'))              fail('system must mention GSAP');
  if (!sysLower.includes('scrolltrigger'))     fail('system must mention ScrollTrigger');
  if (!sysLower.includes('parallax') && !sysLower.includes('scrub')) {
    fail('system must mention parallax or scrub');
  }
  if (!sysLower.includes('prefers-reduced-motion')) fail('system must mention prefers-reduced-motion');

  // 5. task() returns a non-empty string that references ctx.brief
  if (typeof r.task !== 'function') {
    fail('task must be a function');
  } else {
    const fakeCtx = {
      brief: 'a flagship smartphone launch page',
      stack: { summary: 'Next.js', notes: '' },
      artifactsDigest: () => '',
      // getArtifact intentionally omitted to test defensive optional-chaining
    };

    let result;
    try {
      result = r.task(fakeCtx);
    } catch (e) {
      fail(`task(fakeCtx) threw: ${e.message}`);
    }

    if (typeof result !== 'string' || result.trim().length === 0) {
      fail('task(fakeCtx) returned empty or non-string');
    }

    if (typeof result === 'string' && !result.includes('flagship smartphone launch page')) {
      fail('task(fakeCtx) does not reference ctx.brief');
    }

    if (typeof result === 'string' && !result.toLowerCase().includes('gsap')) {
      fail('task output does not mention GSAP');
    }
  }

  if (ok) {
    console.log('PASS — role id: hero-showcase-engineer');
  } else {
    process.exit(1);
  }
}
