# Award-Tier Web Design Playbook

Research grounded in Awwwards SOTD/SOTY winners, FWA, CSS Design Awards, and referenced studios (2023–2025). Written for the Helm builder agent targeting Next.js + Tailwind + Framer Motion + GSAP/ScrollTrigger + Lenis.

---

## 1. What Separates Winners from Average Sites

Awwwards judges on four axes: Design (40%), Usability (30%), Creativity (20%), Content (10%). Most submissions fail on usability — judges test on mobile first and penalise anything that feels ported from desktop. Technical execution baselines: LCP under 1.5s, sustained 60fps animations, sub-3MB page weight.

The deeper separator is **one strong idea executed with total conviction**. Not a collection of effects — a single interaction or visual metaphor that pervades the whole site. Every animation, every colour decision, every type choice either serves that idea or gets cut. Sites that try to demonstrate every technique they know read as intern portfolios.

### The craft-vs-gimmick line

Craft: every animation has a *reason* tied to the content or the concept. The easing curve matches the brand's personality (elastic for playful, expo for authoritative, circ for clean/technical). Hover states have consistent logic — all interactive elements respond the same way. Negative space is *designed*, not the absence of content.

Gimmick: effects applied because they are impressive in isolation. Parallax on hero images where the layers have no compositional relationship. Custom cursors that obscure content. Preloaders longer than 2s on a fast connection. Scroll-linked animations that fight the user's scroll intent instead of enriching it.

### Hierarchy and pacing

Award sites have extreme typographic contrast: a headline at 120–200px clamps against body copy at 16–18px. Nothing lives in the middle. Sections breathe — typical padding-top between sections is 160–240px (10–15rem). The eye has somewhere to rest before the next reveal fires.

Pacing rule: no more than one "wow moment" per viewport height of scroll. If three things animate at once, nothing is memorable.

---

## 2. Signature Moves — with Restraint Guidelines

### 2.1 Custom Cursors and Magnetic Elements

**What:** The native cursor is hidden (`cursor: none`). A `div` follows the pointer using `useMotionValue` + `useSpring` from Framer Motion (or GSAP ticker), giving it lag that reads as weight. On interactive elements it morphs — grows, changes label, deforms.

**Magnetic buttons:** On `mouseenter`, calculate distance from cursor to button center and apply a `translate` offset of ~30% of the distance. On `mouseleave`, spring back to origin. Framer Motion's `useSpring({ damping: 15, stiffness: 150, mass: 0.1 })` on x/y motion values handles this cleanly.

**Implementation (Framer Motion):**
```tsx
// cursor position via motion values, spring-lagged
const mouseX = useMotionValue(0);
const mouseY = useMotionValue(0);
const cursorX = useSpring(mouseX, { damping: 20, stiffness: 300 });
const cursorY = useSpring(mouseY, { damping: 20, stiffness: 300 });

// magnetic: on hover, shift element toward cursor
const distance = { x: clientX - center.x, y: clientY - center.y };
x.set(distance.x * 0.3);
y.set(distance.y * 0.3);
```

**When to use:** Portfolio sites, agency sites, product marketing pages where brand craft is the message. Skip on dashboards, e-commerce checkout flows, content-dense documentation.

**Restraint:** One cursor state = default. Two states max — default + hover-on-interactive. Three states (default / hover-interactive / hover-media) is the absolute ceiling. Never make the cursor so large it obscures content it's meant to reveal.

---

### 2.2 Scroll-Driven Storytelling

**What:** GSAP ScrollTrigger pins a container and drives animation progress with `scrub: 1` or `scrub: 1.5`. The key is making scroll *feel* like turning a page, not fighting gravity. Lenis provides the momentum scroll layer that makes scroll feel physical; ScrollTrigger hooks into its `raf` loop.

**Lenis + ScrollTrigger integration (canonical pattern):**
```ts
const lenis = new Lenis();
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```

**When to use:** Product storytelling (hardware reveals, feature walkthroughs), portfolio case studies, brand narrative pages. The whole page should be readable as a single visual sentence from top to bottom.

**Restraint:** Every pinned section adds scroll distance. If a user must scroll 4000px to consume 400px of content, the experience is a tax. Pin only 1–2 sections per page. Give users a visible progress signal (thin line indicator or section counter).

---

### 2.3 Pinned Horizontal Scroll

**What:** A row of panels (or a single wide canvas) translates on X while the page scroll progresses on Y. GSAP's canonical pattern:
```ts
gsap.to(".track", {
  x: () => -(track.scrollWidth - window.innerWidth),
  ease: "none",
  scrollTrigger: {
    trigger: ".pinned-wrapper",
    pin: true,
    scrub: 1,
    end: () => `+=${track.scrollWidth - window.innerWidth}`,
  }
});
```

**When to use:** Portfolio work grids, product line showcases, timeline narratives. Works because the horizontal axis is unused in normal scroll — the novelty is earned when the *content* benefits from side-by-side reading.

**Restraint:** Never use on mobile — the pinning math breaks and accessibility suffers. Use `matchMedia` to disable the ScrollTrigger on viewports narrower than 768px and fall back to vertical stacking.

---

### 2.4 Kinetic Typography

**What:** Large headline text that morphs, stretches, splits, or marches across the screen in sync with scroll position or time. Implementations range from GSAP SplitText character-by-character staggers to variable font axis animation (`font-variation-settings: 'wght' ${weight}`) driven by scroll progress.

**Staggered character reveal (GSAP SplitText):**
```ts
const split = new SplitText(".hero-title", { type: "chars" });
gsap.from(split.chars, {
  y: "100%",
  opacity: 0,
  stagger: 0.03,
  ease: "expo.out",
  duration: 1,
  scrollTrigger: { trigger: ".hero", start: "top 80%" }
});
```

**Variable font scroll:**
```ts
gsap.to(".display-text", {
  fontVariationSettings: "'wght' 800",
  scrollTrigger: { trigger: ".section", scrub: true }
});
```

**When to use:** Hero sections where the brand has something loud to say. Section intros. NOT on body copy — kinetic type works because it's an event, not a pattern.

**Restraint:** One kinetic type moment per scroll depth of two viewports. Keep the text readable throughout the animation — if it's illegible mid-animation, shorten the animation not the legibility.

---

### 2.5 Preloaders and Intro Reveals

**What:** A full-screen overlay dissolves to reveal the page. Award-quality preloaders are brief (0.8–1.6s on a warm connection), have a concept (not a spinner), and use the reveal animation to *introduce* the site's visual language — same typeface, same palette, same motion character.

**Clip-path curtain reveal (GSAP):**
```ts
gsap.fromTo(".curtain", 
  { clipPath: "inset(0 0 0 0)" },
  { clipPath: "inset(0 0 100% 0)", duration: 1.2, ease: "expo.inOut",
    onComplete: () => curtain.remove() }
);
// Simultaneously reveal content
gsap.from(".hero-content > *", { y: 60, opacity: 0, stagger: 0.08, delay: 0.4 });
```

**Counter-based preloader:** Count from 0 to 100 while assets load, then trigger the reveal. The counter text should be set in the same display face as the hero.

**When to use:** Sites where the first impression is the product. Agency portfolios, brand campaigns, award submissions.

**Restraint:** Gate on actual asset loading (`Promise.all` of critical images + fonts), not a fixed timeout. On fast connections skip or shorten. Never block content behind a preloader for more than 3s total.

---

### 2.6 Page Transitions

**What:** When navigating between routes, animate out the current page and animate in the next — creating the sensation of a coherent spatial world. In Next.js App Router, this requires wrapping content in Framer Motion `AnimatePresence` with layout-aware `motion.div` wrappers at the page level.

**Framer Motion pattern:**
```tsx
// layout.tsx
<AnimatePresence mode="wait">
  <motion.div
    key={pathname}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
  >
    {children}
  </motion.div>
</AnimatePresence>
```

**Overlay transition (more dramatic):** A coloured `div` sweeps in from the bottom, holds at full height while the next page loads, then sweeps out upward. Coordinate with GSAP's Context for cleanup.

**When to use:** Multi-page sites where navigating should feel like moving through a space, not reloading a document.

**Restraint:** Transition duration must be under 500ms perceived. Users click because they want to go somewhere — the transition is service, not spectacle. Avoid transitions that repeat on every navigation (the novelty decays fast).

---

### 2.7 WebGL Accents

**What:** Three.js / React Three Fiber rendering of a single striking visual element — a shader-based gradient plane, a cloth simulation, a morphing geometry — as a background or hero accent. The rest of the page is vanilla HTML. WebGL earns its weight when no CSS equivalent could produce the same effect.

**Shader displacement on hover (Three.js pattern):**
A plane mesh with a custom GLSL fragment shader reads a uniform `uMouse` and distorts the UV coordinates — creating liquid or ripple effects on images. The uniform updates in the `requestAnimationFrame` loop via lerp toward the real cursor position.

**When to use:** When the brand concept maps to a physical/spatial metaphor. Studios demonstrating technical capability. Product launches where the hero needs to be singular.

**Restraint:** One WebGL canvas per page. Bundle the minimal Three.js subset (use tree-shaking). Provide a CSS fallback for users with `prefers-reduced-motion` and low-end GPUs. Test on iPhone — mobile GPU limits are brutal.

---

## 3. Named Examples and Signature Techniques

### Lusion v3 (2024 Awwwards Site of the Year)
**Technique:** Pre-calculated cloth simulation baked in Houdini FX and streamed as ArrayBuffer vertex animation. The interaction is frictionless — cloth responds to the cursor as if physically present — but the computation already happened offline. The lesson: *precalculate expensive physics, replay it in real-time*. Never try to simulate cloth in the browser.

### Bruno Simon Portfolio
**Technique:** The entire portfolio IS a Three.js game. Navigation happens by driving a toy car through a 3D world. Physics via Cannon.js — every element is rigid-body collidable. The concept (playfulness) maps perfectly to the interaction model. What looks maximalist is actually one idea: *play as navigation*.

### Stripe Dot Dev (Awwwards SOTD, October 2024)
**Technique:** A developer documentation site that behaves like a rare-book library crossed with a terminal. The "endless footer" implements a Shepard tone scroll illusion — the footer grows infinitely but never arrives. Sound design, theming, and a working CLI built into the page. The lesson: *find the one metaphor that matches your audience and commit completely*.

### Obys Agency
**Technique:** Kinetic typography as the primary layout system. Oversized PP Neue letterforms stretch and shuffle to scroll inertia via a custom RAF-based animation engine. The twelve-column grid is strict — only typography and WebGL video tiles. Nothing decorates; everything is structural. The lesson: *choose one typeface, make it do everything*.

### Igloo Inc (Awwwards Annual Award 2024 — Site of the Year)
**Technique:** An iceberg as navigation metaphor. A single matte-black 3D shard rotates on GSAP-driven scroll, revealing sub-ventures as the camera descends. HDRI-lit WebGL ice crystal grown by custom algorithms. Color palette: #b6bac5 (ice gray) and #383e4e (deep slate). Two colors. Total restraint, enormous presence.

### Active Theory V6 (Awwwards SOTM, February 2024)
**Technique:** Real-time WebGL portfolio with AI chat integration and multiplayer — visitors can see each other navigating. The navigation pill responds to scroll velocity. State-based (not object-oriented) JavaScript keeps the rendering deterministic. The lesson: *the interface demonstrates the studio's actual product*.

### Stripe BFCM Machine (Awwwards SOTD, January 2025)
**Technique:** Augmented video with a persistent HUD overlay — the entire site is a user manual wrapped around live campaign data. Two colors only: #111111 and #efefef. Sound design tied to interactions. The lesson: *editorial constraint (black + white, no images outside the video) creates focus*.

### Basement Foundry
**Technique:** A type specimen site that IS the specimen. Every interaction demonstrates a font capability — hover states, weight axes, contextual alternates all fire as you browse. The grotesque typeface (Basement Grotesque, inspired by 19th-century woodtype) provides every visual element. No photography, no illustration. Type is the product and the canvas.

---

## 4. Common Color and Type Traits of Winners

### Typography
- Two-tier scale: **display** (120–200px, tight tracking at -0.02 to -0.04em) and **body** (16–18px, 1.6 line-height). Nothing in between occupies hierarchy space.
- Predominant faces in winners: PP Neue Montreal (grotesque, neutral but warm), PP Editorial New (transitional serif with Italian optical qualities), Neue Haas Grotesk (Swiss rationalism), ABC Diatype (geometric, optical corrections at large sizes), custom/variable grotesques.
- Variable fonts used for scroll-driven weight/width animation — treat the axis range as an animation timeline, not just a style toggle.
- All-caps with extreme tracking (0.2–0.5em) for labels, captions, navigation items.

### Color
- Award palettes are almost always 2–3 colors with high contrast. Complexity comes from *usage*, not palette breadth.
- Common modes: off-black (#111 / #0f0f0f) + single chromatic accent; warm white (#f5f0eb) + dark slate + single warm accent; arctic palette (ice gray + deep cool charcoal) for technical/premium.
- Monochromatic schemes dominate the top tier. When color appears it is singular and intentional — a neon accent in an otherwise all-dark site hits harder than five pastels.
- Avoid pure #ffffff and pure #000000 — off-whites and near-blacks feel more resolved.

### Layout
- 12-column grid, used asymmetrically. Full-bleed elements break the grid deliberately.
- Sections are often single-axis: either full-width typographic with no imagery, or full-bleed visual with no text. Mixing both reduces impact.
- Vertical rhythm driven by a base unit (8px or 10px) — all spacing is a multiple of it.
- Horizontal scroll sections, sticky sections, and pinned reveals break vertical rhythm intentionally and therefore feel like *events*.

---

## 5. Anti-Patterns That Mark Amateur Work

1. **Template skeleton visible.** Cards with identical heights, sections that grid cleanly into hero/features/testimonials/CTA. The layout reveals its origin in a Tailwind UI or shadcn template.

2. **Parallax without purpose.** The hero image moves at 0.5x scroll speed, the foreground at 1x. If the layers have no compositional relationship it just creates a depth lie.

3. **Excessive effects, no hierarchy.** Five elements animate in simultaneously. The eye has nowhere to land. Quantity of animation inversely predicts quality of experience.

4. **Scroll-hijacking that fights intent.** Overriding native scroll with a snap-to-section that requires precise scroll positioning. Users on trackpads and momentum-scroll devices are trapped.

5. **Custom cursor that obscures content.** A 200px custom cursor circle that covers text or buttons. The cursor's job is to *extend* pointing precision, not to be a design element in its own right.

6. **Preloader longer than real loading.** A timed preloader with a fake counter that holds for 3s regardless of connection speed. Users notice immediately.

7. **Generic Google Fonts pairings.** Inter + Playfair Display is the "Lorem Ipsum" of type pairings. Judges see it and stop reading.

8. **Blur/glassmorphism as a substitute for hierarchy.** Backdrop-filter cards stacked on cards. The depth is synthetic and the hierarchy is unresolved.

9. **Dark mode implemented as CSS filter invert.** Or simply swapping background/foreground colors without rethinking the entire palette. Dark mode is a different palette, not a toggle.

10. **Animation on every element.** `aos: fade-up` on every card, every heading, every paragraph. The animation signals nothing because everything moves. Reserve animation for elements that *earn* the attention call.

11. **No mobile intent.** Desktop-first with `@media (max-width: 768px)` patches. Judges test mobile first. Pinned horizontal scroll left enabled, giant GSAP timelines firing on 375px screens.

12. **Unconstrained type scale on mobile.** 160px display type that clamps to nothing on mobile. Use `clamp(3rem, 8vw, 10rem)` — the scale should remain dramatic at every breakpoint.

---

## 6. Performance and Technical Baselines

- **Animate only `transform` and `opacity`.** Any animation touching `width`, `height`, `top`, `left`, `margin`, or `padding` causes layout recalc and kills INP scores.
- **`will-change: transform`** on elements that will animate, set before the animation fires, removed after completion.
- **Lenis + GSAP ticker** for smooth scroll — do not use both Lenis and `overflow: hidden` scroll containers. Pick one scroll model per page.
- **Code-split GSAP plugins.** Import `ScrollTrigger` only in the component that uses it. `gsap.registerPlugin(ScrollTrigger)` inside a `useEffect`.
- **Three.js tree-shaking.** `import { WebGLRenderer, Scene, ... }` not `import * as THREE from 'three'`. Saves 200–400KB.
- **Framer Motion `LazyMotion`.** Use `LazyMotion` + `domAnimation` feature set (27KB) instead of the full `motion` import (40KB+) for non-critical pages.
- **Font loading.** `next/font` with `display: swap` and `preload: true` for the primary display face. Variable fonts served as single files — not 8 weight files.
- **ScrollTrigger cleanup.** Always return `() => ctx.revert()` from `useEffect` to prevent memory leaks in Next.js App Router's concurrent rendering.

---

## Rules for our builder

### DO

- [ ] Commit to one visual concept before writing a line of code. Every subsequent decision gets evaluated against it.
- [ ] Use two colors maximum in the base palette. Add a third only as a functional accent (links, CTAs, states).
- [ ] Set display type ≥ 100px on desktop with `clamp()` for mobile (min 2.5rem). Let it dominate.
- [ ] Choose PP Neue Montreal, Neue Haas Grotesk, or a Pangram Pangram face as the primary typeface. No Inter as a display face.
- [ ] Use off-black (#0f0f0f – #141414) and off-white (#f4f0eb – #fafaf8) as base. Never pure black/white.
- [ ] Set section padding-top to at least 10rem (160px). Sections need space between them.
- [ ] Animate only `transform` and `opacity`. Everything else triggers layout recalc.
- [ ] Integrate Lenis via `gsap.ticker` — single RAF loop for both scroll and animation.
- [ ] Write `ScrollTrigger` inside `useLayoutEffect` with `ctx = gsap.context()` and `return () => ctx.revert()`.
- [ ] Cap custom cursor at 2 states: default and hover-interactive.
- [ ] Gate preloaders on actual asset load promises, not fixed timeouts. Keep total preloader time < 2s.
- [ ] Implement `prefers-reduced-motion` media query — wrap all non-essential animations in a check.
- [ ] Disable pinned horizontal scroll below 768px — fall back to vertical stack.
- [ ] Code-split heavy libs: Three.js tree-shaken, GSAP plugins per-component, Framer Motion `LazyMotion`.
- [ ] Test on an actual mobile device before calling a component done.
- [ ] Add one signature moment per page — one thing judges will remember. Identify it explicitly before building.
- [ ] Use `clamp()` for all fluid type and spacing values.

### DON'T

- [ ] Don't use the default Tailwind card component pattern unmodified as a primary layout element.
- [ ] Don't apply scroll animations to more than one element per visible section at a time.
- [ ] Don't import `import * as THREE from 'three'` — tree-shake every Three.js import.
- [ ] Don't override scroll position or implement snap-to-section without testing on a trackpad with momentum.
- [ ] Don't use `aos` or CSS `@keyframes` fade-up on every block of content. Reserve animation for hierarchy-defining moments.
- [ ] Don't stack glassmorphism cards. If blurred glass is used, it is the *only* card style on the page.
- [ ] Don't use Inter, Montserrat, or Raleway as display faces. These are utility faces at body sizes.
- [ ] Don't implement dark mode as an `invert()` or simple background swap — rethink the whole palette.
- [ ] Don't run Three.js on mobile without testing frame rate. Always provide a static fallback.
- [ ] Don't let the preloader last more than 3 seconds on a 50Mbps connection.
- [ ] Don't animate width, height, margin, padding, top, or left — only transform/opacity.
- [ ] Don't add `will-change: transform` to every element — it creates new compositing layers and increases memory use. Target only elements actively animating.
- [ ] Don't make the custom cursor bigger than 80px — it will obscure content on hover states.
- [ ] Don't use parallax on hero images unless the layers are designed compositionally to separate.
- [ ] Don't stack more than one "signature effect" per page scroll depth. One wow moment per two viewport-heights of scroll.
