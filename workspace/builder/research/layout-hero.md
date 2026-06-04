# Hero Sections & Page Layout Playbook

Senior art-director reference for Tailwind + Framer Motion + GSAP builds.
Target bar: Apple / Stripe / Awwwards SOTD quality.

---

## 1. Hero Patterns

### 1.1 Oversized Kinetic-Type Hero

**When to use:** Product launches, agency/portfolio sites, brand identity-first products
where the message *is* the visual. Works when you have one sharp headline that can
carry the weight of the entire fold.

**Structure:**
```
[nav — fixed, 60px tall]
[hero — 100svh, centered column]
  display: headline (display-xl, 96–160px, tracked tight)
  sub-line (18–22px, 500 weight, muted)
  CTA row — left-aligned to type baseline, gap-6
[below-fold — next section starts immediately]
```

**Grid:** 12-col, headline spans full 12 cols, CTA row constrained to 6 cols from left.
Headline bleeds past container on wide screens (`max-w-none`, padding 0).

**The motion:**
- `SplitText` (GSAP) or manual `split()` into `.chars`
- Stagger chars in from `x: 50, opacity: 0` with `duration: 0.9, stagger: 0.05, ease: "power3.out"`
- Overlap sub-line entrance by `-=0.3` on the GSAP timeline
- After all text settles, CTA button fades in with `opacity: 0 → 1, y: 12 → 0, duration: 0.5`
- Optional: headline characters respond to cursor with magnetic hover (`damping: 15, stiffness: 150, mass: 0.1, multiplier: 0.3`)

**Framer Motion alternative:**
```tsx
// per-char stagger
variants: {
  hidden: { opacity: 0, x: 20 },
  visible: (i) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.04, duration: 0.6, ease: [0.16, 1, 0.3, 1] }
  })
}
// always add: will-change: transform; useReducedMotion guard
```

**Layout spec:**
- Hero height: `100svh` (not `100vh` — mobile address bar safe)
- Headline: `clamp(4rem, 10vw + 1rem, 10rem)` — fluid 64px → 160px
- Sub-line: `clamp(1rem, 1.2vw + 0.8rem, 1.375rem)`
- CTA: 48px height, 20px horizontal padding, no border-radius or 4px max
- CTA vertical position: `mt-10` below sub-line (40px), never floated to absolute bottom
- Inner content: `max-w-[1280px] mx-auto px-6 sm:px-10 lg:px-16`

---

### 1.2 Scroll-Scrubbed Product Reveal

**When to use:** SaaS dashboards, hardware, any product where the UI or form factor
needs to be "discovered" rather than shown instantly. Apple iPhone/MacBook pages
are the canonical reference. Requires a clear product asset (3D render, mockup, screenshot).

**Structure:**
```
[section — position: relative, min-height: 300vh]
  [sticky container — top: 0, height: 100vh]
    [product canvas — centered, 60% width on desktop]
    [caption track — right column, 40% width, transitions between states]
```

**The motion (GSAP ScrollTrigger):**
```js
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: ".product-section",
    start: "top top",
    end: "+=200%",   // pins for 2× viewport height of scroll
    pin: true,
    scrub: 1,        // 1-second lag for organic feel (not instant)
    pinSpacing: true
  }
});

tl
  .from(".product-img", { opacity: 0, scale: 0.85, duration: 1 })
  .to(".caption-1", { opacity: 0, y: -30, duration: 0.5 }, 0.8)
  .from(".caption-2", { opacity: 0, y: 30, duration: 0.5 }, 1.0)
  .to(".product-img", { rotateY: 15, duration: 1 }, 1.2);
```

**Scrub values:**
- `scrub: true` — instant (jarring, avoid unless intentional)
- `scrub: 1` — 1s lag (smooth, natural, use this by default)
- `scrub: 2` — 2s lag (cinematic, use for slow atmospheric reveals)

**Pin duration guidance:**
- Quick reveal (3 caption states): `end: "+=150%"` (1.5× vh of scroll)
- Deep reveal (5+ states): `end: "+=300%"`

**Layout spec:**
- Product image: `max-width: 560px`, centered, `object-fit: contain`
- Caption column: `max-width: 380px`, `position: absolute, right: 10%`
- Section background: dark or white — high contrast against product
- `ScrollTrigger.batch()` for any grid of products (never individual triggers per card)

---

### 1.3 Animated-Gradient / WebGL Hero

**When to use:** AI products, creative tools, ambiguous or abstract value props where you
need visceral warmth before the user reads anything. Also a strong default for any
dark-mode-first brand. Stripe's gradient and Linear's aurora are canonical refs.

**Structure:**
```
[hero — 100svh, WebGL canvas as background layer (z-index: 0)]
  [content layer — z-index: 1, centered, text over canvas]
    headline (white or light, semi-bold)
    sub-line
    CTA row
```

**Three.js liquid gradient (the Stripe-grade approach):**
```js
// Renderer setup — disable depth + stencil for perf
new THREE.WebGLRenderer({
  antialias: true, powerPreference: "high-performance",
  alpha: false, stencil: false, depth: false
})

// Key uniforms
uColor1–6: vec3 (normalized RGB, 6-color blend)
uTime: float (elapsed, drives animation)
uSpeed: 1.2 (gradient flow rate)
uIntensity: 1.8 (color center movement range)
uGrainIntensity: 0.08 (subtle film grain overlay)
uTouchTexture: 64×64 canvas (cursor distortion input)

// Delta clamp prevents jumps on tab-switch
const delta = Math.min(clock.getDelta(), 0.1);
```

**CSS-only fallback (Tailwind):**
```html
<!-- Conic gradient animated via @keyframes rotate -->
<div class="absolute inset-0 bg-[conic-gradient(from_0deg,#6366f1,#8b5cf6,#ec4899,#6366f1)]
            animate-[spin_8s_linear_infinite] blur-[120px] opacity-40 scale-150" />
```

**Text readability over gradient:**
- Add `backdrop-blur-none` on text container but wrap in a subtle `bg-black/20 backdrop-blur-sm`
  for legibility without killing the gradient
- Headline: white (`#ffffff`), minimum contrast ratio 4.5:1 against gradient
- Never full black text over a color gradient — always light text on dark gradient or
  text-shadow `0 1px 20px rgba(0,0,0,0.4)`

**Layout spec:**
- Canvas: `position: absolute, inset: 0, width: 100%, height: 100%`
- Content: `position: relative, z-index: 10, display: flex, flex-direction: column,
  align-items: center, justify-content: center`
- Headline: centered, `clamp(3rem, 6vw + 1rem, 7rem)`
- CTA: centered below sub-line, `mt-10`

---

### 1.4 Full-Bleed Image / Video Hero

**When to use:** Consumer hardware, fashion, hospitality, photography, film — anywhere
the product *looks* premium and the visual quality carries conversion weight on its own.
Linear video (no sound) at 100svh is the highest-impact format for lifestyle brands.

**Structure:**
```
[hero — 100svh, position: relative]
  [media layer — position: absolute, inset: 0]
    <video autoplay muted loop playsinline /> or <img />
    [gradient overlay — position: absolute, inset: 0]
      linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.72) 100%)
  [content layer — position: absolute, bottom: 80px, left: 10%]
    eyebrow label (12px, tracked wide, uppercase, muted-light)
    headline (white, 48–72px, bold)
    CTA row
```

**Media specs:**
- Video: `1920×1080` source, `object-fit: cover`, `object-position: center`
- Mobile: serve a separate vertical crop `800×1200` with `srcset` or `<source media="(max-width: 768px)">`
- Overlay opacity: `rgba(0,0,0,0.65–0.75)` — test at 70% as default
- Always `autoplay muted loop playsinline` — missing any one of these breaks on mobile

**The motion:**
- Video plays naturally (no scroll control needed)
- On load: headline fades up `opacity: 0 → 1, y: 20 → 0, duration: 0.8, delay: 0.3, ease: "power2.out"`
- Parallax: `gsap.to(".hero-media", { yPercent: 30, scrollTrigger: { scrub: true } })` —
  moves media layer at 30% of scroll speed relative to content (content stays fixed)

**Layout spec:**
- Content: `max-width: 640px`, never wider — text reads against narrow gradient lane
- CTA: 52px height, background `white` with `text-black` for inversion contrast
- Eyebrow: `letter-spacing: 0.12em`, uppercase, 11–13px
- Bottom anchor: `bottom: clamp(40px, 6vh, 100px)` — responsive without media queries

---

### 1.5 Split Editorial Hero

**When to use:** B2B SaaS, developer tools, editorial/magazine brands, any product with
a strong screenshot or diagram that needs equal billing with the headline. Stripe's docs
landing and Linear's feature pages use this pattern.

**Structure:**
```
[hero — min-height: 100svh]
  [grid — 12 col]
    [left column — cols 1–6 or 1–7]
      eyebrow
      headline
      body (2–3 lines max)
      CTA row
      optional: social proof row (logos, rating)
    [right column — cols 7–12 or 8–12]
      [product visual — screenshot, illustration, 3D asset]
      can overflow the grid edge: margin-right: -5vw
```

**Asymmetric variants:**
- `5/7 split`: copy left 5 cols, visual right 7 — visual-dominant (hardware, lifestyle)
- `7/5 split`: copy left 7 cols, visual right 5 — message-dominant (SaaS, B2B)
- `6/6 split`: balanced editorial (magazine, portfolio)
- Asymmetric by offset: left col `col-span-5`, right col `col-span-7` with right panel
  starting at `col-start-6` so they overlap by 1 col — creates layering depth

```css
/* Tailwind implementation */
.hero-grid {
  @apply grid grid-cols-12 gap-x-6 items-center min-h-[100svh];
}
.hero-copy { @apply col-span-12 lg:col-span-6 xl:col-span-5; }
.hero-visual { @apply col-span-12 lg:col-span-6 xl:col-span-7 lg:-mr-[5vw]; }
```

**The motion:**
- Left column: staggered entrance `y: 24 → 0, opacity: 0 → 1` in sequence:
  eyebrow (delay 0), headline (delay 0.12), body (delay 0.22), CTA (delay 0.34)
- Right column: slides in from right `x: 60 → 0, opacity: 0 → 1, delay: 0.1, duration: 0.9`
- Framer Motion orchestration via `staggerChildren: 0.12` on the copy container variant

**Layout spec:**
- Hero: `pt-[120px] pb-[80px]` (accounts for fixed nav + breathing below content)
- Gap between columns: `gap-x-[clamp(32px,4vw,80px)]`
- Headline: `clamp(2.5rem, 4vw + 1rem, 4.5rem)` (72px desktop cap)
- Body text: `18–20px`, line-height `1.6`, max-width `480px`
- CTA row: `mt-8, gap-4`
- Visual: max-width `640px`, box-shadow `0 24px 64px rgba(0,0,0,0.12)`, subtle `border-radius: 12px`

---

## 2. Layout & Composition System

### 2.1 Grid System

**Base:** 12-column CSS Grid. Never float or flex for major page layout — Grid only.

```css
/* Container token */
.container {
  width: 100%;
  max-width: 1280px;   /* main content */
  margin: 0 auto;
  padding-inline: clamp(24px, 4vw, 64px);  /* responsive gutter */
}

/* Wider variant for editorial/showcase */
.container-wide { max-width: 1440px; }

/* Narrow variant for prose/blog */
.container-prose { max-width: 768px; }
```

**Container widths (canonical):**
| Purpose | max-width |
|---|---|
| Main content | 1280px |
| Wide/showcase | 1440px |
| Full bleed | none (100vw) |
| Prose/reading | 768px |
| Narrow CTA | 640px |

**Asymmetry rules:**
- At least 1 section per page should break the symmetric grid — bleeds past container,
  or uses offset columns (e.g., `col-start-2 col-span-10` to inset)
- Overlapping elements: `z-index` layers + negative margins create depth without JS
- Odd-number splits (5/7, 4/8, 3/9) create more visual tension than 6/6

### 2.2 Section Vertical Rhythm

The spacing scale — use exclusively these values, never arbitrary numbers:

```
Section padding scale (top/bottom):
  --section-xs:  clamp(40px, 5vh, 64px)    — footer, small utility sections
  --section-sm:  clamp(64px, 8vh, 96px)    — compact feature blocks
  --section-md:  clamp(80px, 10vh, 128px)  — standard sections (default)
  --section-lg:  clamp(120px, 14vh, 192px) — hero, marquee showcases
  --section-xl:  clamp(160px, 18vh, 256px) — full-bleed editorial moments

Tailwind equivalents (approx):
  xs → py-10 sm:py-16
  sm → py-16 sm:py-24
  md → py-20 sm:py-32
  lg → py-28 sm:py-48
  xl → py-40 sm:py-64
```

**Internal section gaps (between sub-elements):**
```
gap-2  → 8px   (inline, between icon + label)
gap-4  → 16px  (tight, within a card)
gap-6  → 24px  (between headline + subtext)
gap-8  → 32px  (between subtext + CTA)
gap-12 → 48px  (between card rows)
gap-16 → 64px  (between major sub-sections)
gap-24 → 96px  (between section blocks within a section)
```

**The 8px grid rule:** every spacing value is a multiple of 8. No 10px, 14px, 18px paddings.

### 2.3 Full-Bleed vs Contained

| Technique | When | How |
|---|---|---|
| Full-bleed background | Every other section — alternates dark/light | `width: 100vw` background, content still in container |
| Edge-to-edge image | Hero, showcase, product reveal | `position: absolute, inset: 0` behind container |
| Content bleed | Visual overflows container right edge | Negative margin on image: `-mr-[5vw]` to `calc(100% + 5vw)` |
| Contained | Prose, feature grids, pricing | `max-w-[1280px] mx-auto` |
| Inset | Pull-quote, stat block, CTA band | `max-w-[768px] mx-auto` inside a full-bleed section |

Rule: the background can always be full-bleed. The readable content never exceeds 1280px.

### 2.4 Negative Space

- Every section needs at least 40% of its height to be "empty" — white space is not wasted
- Feature grids: 3-col is the max density. 4-col feels like a spec sheet, not a product page
- Between two high-energy sections (hero + social proof), use a `section-xs` gap section
  with only a single element (a marquee of logos, one stat, one quote)
- Vertical whitespace signals quality. Compressed layouts signal "we didn't make decisions"

### 2.5 Scale Contrast & Layering

Premium pages use extreme type scale contrast within sections:

```
Display (hero headline):  clamp(4rem, 10vw, 10rem)   — 64px → 160px
Section headline:         clamp(2rem, 4vw, 4rem)      — 32px → 64px
Sub-headline:             clamp(1.25rem, 2vw, 2rem)   — 20px → 32px
Body:                     clamp(1rem, 1vw + 0.75rem, 1.25rem) — 16px → 20px
Label/eyebrow:            11–13px, tracked 0.1–0.15em, uppercase
```

Layering for depth (not just z-index):
- Blur a background element: `filter: blur(80px)` on a shape behind content
- Drop-shadow hierarchy: `shadow-sm` on cards, `shadow-2xl` on modals/overlays
- Gradient feather: sections "bleed" into each other via `linear-gradient` on section edges
  rather than hard cuts

---

## 3. Section Sequencing

The canonical landing page arc for a premium product:

```
1. HERO          — stop the scroll, one sentence, clear CTA
2. SOCIAL PROOF  — logos or stats, maximum trust density, minimum footprint
3. PROBLEM/FIT   — why this exists (short, 2–3 sentences + icon grid)
4. FEATURES      — what it does (3-col or alternating 2-col deep-dive)
5. SHOWCASE      — how it looks in use (scroll-scrubbed or full-bleed video)
6. SPECS/DETAILS — for the evaluator (table, comparison grid, tech list)
7. SECOND CTA    — repeat the primary ask after proof is established
8. FOOTER        — nav, legal, secondary links
```

**Pacing — how each section should feel:**

| Section | Energy | Padding | Background | Motion |
|---|---|---|---|---|
| Hero | Maximum tension | `section-lg` | Custom (gradient/video/type) | Complex entrance |
| Social Proof | Quiet exhale | `section-xs` | Same as hero OR flat contrast | Fade-in logos, no drama |
| Problem/Fit | Building tension | `section-sm` | White or near-white | Staggered reveal |
| Features | Methodical | `section-md` | Alternating light/dark | Scroll-triggered per card |
| Showcase | Climax | `section-xl` | Dark, full-bleed | Scroll-scrubbed (the big moment) |
| Specs | Cool/technical | `section-sm` | White, clean | Minimal (accordion or fade) |
| Second CTA | Closing urgency | `section-md` | Brand color or black | Simple fade, strong typography |
| Footer | Resolved | Fixed | Darkest shade | None |

**Alternation rule:** never two consecutive sections with the same background.
Light → dark → light → dark is the simplest version.
More sophisticated: use 3–4 distinct background treatments: white, `zinc-950`, brand tint,
and `zinc-100` — cycle them so no two neighbors match.

**Transition between sections:**
- Gradient bleed: `background: linear-gradient(to bottom, #000 0%, #0a0a0a 100%)` on section
  base — subtle depth vs hard cuts
- Overlap: hero image/graphic can extend `mb-[-80px] z-10` to visually bridge into the next section
- Entrance threshold: default `ScrollTrigger start: "top 80%"` — element enters before it's
  centered in viewport, avoiding lag

---

## 4. Responsive: Mobile Re-Tuning

**Rule: do not just shrink. Redesign the section logic for each breakpoint.**

### Kinetic Type Hero on Mobile
- Reduce headline scale: desktop 120px → mobile `clamp(2.5rem, 10vw, 4rem)` (40–64px)
- Single column, centered
- Reduce stagger: mobile users don't wait — cut `staggerChildren` from 0.05 to 0.03
- Blur-in instead of slide-in (cheaper to render, feels faster)

### Scroll-Scrubbed Reveal on Mobile
- Disable the pin entirely below `md:` breakpoint — pinned scroll is unreliable in iOS Safari
- Replace with a simple fade-in-on-scroll sequence: `ScrollTrigger start: "top 85%", no pin, no scrub`
- Product image: full-width, stacked above caption text

```js
// Disable pin on mobile
const isMobile = window.innerWidth < 768;
scrollTrigger: {
  pin: !isMobile,
  scrub: isMobile ? false : 1,
  end: isMobile ? "bottom 20%" : "+=200%"
}
```

### WebGL / Gradient Hero on Mobile
- Keep the CSS conic-gradient fallback always active; load Three.js only above `1024px`
  (check `window.innerWidth` before initializing renderer)
- Reduce `uGrainIntensity` to 0 on mobile (GPU grain is expensive on low-power chips)
- Ensure `pointer-events: none` on canvas so touch events pass through to content

### Full-Bleed Video Hero on Mobile
- Serve `800×1200` vertical video via `<source media="(max-width: 768px)">`
- Use `object-position: center 20%` to keep face/focal point in frame on vertical crop
- Increase overlay to `rgba(0,0,0,0.75)` — mobile ambient light is variable
- Content: stack vertically, anchor to `bottom: 48px`

### Split Editorial Hero on Mobile
- Collapse to single column: visual first, copy below (or swap to copy first based on product)
- Remove the asymmetric column offset — full-width on both
- Add `pt-[80px]` for nav clearance, `pb-[48px]`
- Image: `max-height: 300px, object-fit: contain, mx-auto` — never oversized on mobile

### Global Mobile Responsive Rules
- Use `100svh` everywhere (not `100vh`) — accounts for iOS Safari chrome
- Clamp typography always — never hard-switch sizes with `@media` for body/heading scale
- Reduce `section-md` to `section-sm` padding at `max-width: 768px`
- Disable or simplify parallax below 768px (`ScrollTrigger.matchMedia` or `useReducedMotion`)
- `useReducedMotion` (Framer Motion) should always gate all scroll animations

---

## 5. Concrete Token Reference

### Typography Scale
```css
/* Hero display */
--text-display:    clamp(4rem, 10vw + 0.5rem, 10rem);   /* 64–160px */
--text-headline:   clamp(2rem, 4vw + 0.5rem, 4.5rem);   /* 32–72px */
--text-title:      clamp(1.5rem, 2.5vw + 0.5rem, 2.5rem); /* 24–40px */
--text-body-lg:    clamp(1rem, 1.2vw + 0.75rem, 1.375rem); /* 16–22px */
--text-body:       clamp(0.9375rem, 1vw + 0.75rem, 1.125rem); /* 15–18px */
--text-label:      0.6875rem;  /* 11px, always uppercase + tracked */
--text-caption:    0.75rem;    /* 12px */
```

### Container Widths
```css
--container-main:    1280px;
--container-wide:    1440px;
--container-prose:   768px;
--container-narrow:  640px;
--container-gutter:  clamp(24px, 4vw, 64px);  /* responsive side padding */
```

### Section Padding Scale
```css
--section-xs: clamp(40px, 5vh, 64px);
--section-sm: clamp(64px, 8vh, 96px);
--section-md: clamp(80px, 10vh, 128px);  /* default */
--section-lg: clamp(120px, 14vh, 192px);
--section-xl: clamp(160px, 18vh, 256px);
```

### Spacing (Internal)
```
4   → 1rem   →  16px  (gap within text group)
6   → 1.5rem →  24px  (headline → subtext)
8   → 2rem   →  32px  (subtext → CTA)
12  → 3rem   →  48px  (between cards in a row)
16  → 4rem   →  64px  (between sub-sections)
24  → 6rem   →  96px  (between blocks within section)
```

### Z-Index Layers
```
0   background canvas (WebGL, video)
1   background decorative (shapes, gradients)
10  content
20  sticky elements (nav, scroll progress)
30  popovers, dropdowns
40  modals, overlays
50  tooltips
```

### Border Radius
```
none  →  0       (editorial, hard crop)
xs    →  4px     (tags, chips)
sm    →  8px     (buttons)
md    →  12px    (cards)
lg    →  16px    (large cards)
xl    →  24px    (panels)
full  →  9999px  (pills, avatars)
```

### Shadows
```css
--shadow-card:     0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06);
--shadow-raised:   0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06);
--shadow-float:    0 12px 48px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08);
--shadow-hero-img: 0 24px 80px rgba(0,0,0,0.20);
```

### Motion Tokens
```
duration-fast:    0.15s
duration-base:    0.35s
duration-slow:    0.6s
duration-entrance: 0.8–0.9s  (major element entrances)

ease-out:    cubic-bezier(0.16, 1, 0.3, 1)   /* snappy decelerate — default */
ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)  /* slight overshoot */
ease-linear: linear                            /* scroll-scrubbed only */

stagger-chars:  0.05s
stagger-words:  0.10s
stagger-lines:  0.15s
stagger-cards:  0.08s
```

---

## Rules for our builder

These are the non-negotiable rules the build agent applies to every generated page.

### Hero Recipe Selector

| Situation | Hero Pattern |
|---|---|
| App with one sharp tagline | 1.1 Kinetic Type |
| Product with a strong UI/visual | 1.5 Split Editorial |
| SaaS with complex feature | 1.2 Scroll-Scrubbed Reveal |
| AI / abstract product | 1.3 Animated Gradient / WebGL |
| Hardware / lifestyle / film | 1.4 Full-Bleed Video/Image |

### Hero Musts
- Always `100svh` height (never `100vh`)
- Always one primary CTA — never two competing CTAs in the hero
- Always `useReducedMotion` guard on all animations
- Always `will-change: transform` on animated elements
- Headline uses `clamp()` — never hard `@media` font size switch
- `scrub: 1` on scroll-linked animations (never `scrub: true`)
- Pin duration for scroll-scrubbed: `end: "+=150%"` minimum, `"+=300%"` for deep reveals
- Video hero: `autoplay muted loop playsinline` — all four attributes

### Layout Musts
- Content max-width: `1280px` (`container-main`)
- Section padding: always from the scale — `section-md` is the default
- Spacing: 8px-grid multiples only (4, 8, 16, 24, 32, 48, 64, 96, 128...)
- Grid: 12-column, CSS Grid — no flexbox for major page layout
- Never two consecutive sections with the same background
- One section per page must break the container (full-bleed or overflow)
- Section sequence: Hero → Social Proof → Problem/Fit → Features → Showcase → CTA → Footer
- Every section transition: gradient feather or overlap — never hard cuts

### Mobile Musts
- Disable `pin: true` below `768px` on all scroll-scrubbed sections
- Load WebGL/Three.js only above `1024px`
- Serve separate vertical crop for full-bleed video/image on mobile
- Reduce stagger speed by 40% on mobile (0.05s → 0.03s per char)
- Reduce `section-md` to `section-sm` padding below `768px`
- All overlay opacity for video: +0.1 above desktop value on mobile

### Token Application
```
Container:   max-w-[1280px] mx-auto px-[clamp(24px,4vw,64px)]
Hero:        min-h-[100svh] py-[clamp(120px,14vh,192px)]
Section:     py-[clamp(80px,10vh,128px)]         (default: section-md)
Headline:    text-[clamp(2rem,4vw+0.5rem,4.5rem)]
Display:     text-[clamp(4rem,10vw+0.5rem,10rem)]
Body:        text-[clamp(0.9375rem,1vw+0.75rem,1.125rem)] leading-relaxed
Eyebrow:     text-[11px] tracking-[0.12em] uppercase
CTA button:  h-12 px-5 rounded-[8px]
Card shadow: shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.06)]
```
