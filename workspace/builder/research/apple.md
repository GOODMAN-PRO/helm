# Apple Product Page Design Playbook

Research-grounded reconstruction of how apple.com product pages achieve their signature premium feel, with concrete numbers and buildable patterns for a Next.js + Tailwind + Framer Motion + GSAP/ScrollTrigger + Lenis stack.

---

## 1. Scroll-Driven Product Reveal

### The Core Pattern

Apple product pages use a "cinematic scroll" model: the viewport does not move through sections in a conventional way. Instead, a section is **pinned** for several viewport heights of scroll distance, and during that pinned dwell the product animates — an image sequence plays frame-by-frame, text fades in from below, copy slides up and fades out as you leave.

### Image Sequence Scrubbing

The canonical Apple technique (AirPods Pro, iPhone camera, M-chip demos) is a canvas-rendered JPEG sequence driven by scroll position.

**Pattern:**
```js
// 1. Pin a section for 500vh of scroll
ScrollTrigger.create({
  trigger: "#sequence-section",
  start: "top top",
  end: "+=500%",       // 5× viewport height of scroll space
  pin: true,
  pinSpacing: true,
  scrub: true,
});

// 2. On scroll update, map progress → frame index
const frameCount = 148;
ScrollTrigger.create({
  trigger: "#sequence-section",
  start: "top top",
  end: "+=500%",
  scrub: 1.5,           // 1.5s catch-up lag = Apple's silky feel
  onUpdate: (self) => {
    const frameIndex = Math.min(
      frameCount - 1,
      Math.floor(self.progress * frameCount)
    );
    updateCanvasFrame(frameIndex);
  },
});

// 3. Canvas draw
function updateCanvasFrame(index) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(images[index], 0, 0);
}

// 4. Preload entire sequence on mount
const images = Array.from({ length: frameCount }, (_, i) => {
  const img = new Image();
  img.src = `/frames/${String(i + 1).padStart(4, "0")}.jpg`;
  return img;
});
```

**Key values:**
- `scrub: 1.5` — not `scrub: true`. The 1.5s lag is what makes the image feel physically attached to your scroll finger, not jittery.
- `end: "+=500%"` — gives enough scroll travel for 148 frames to feel smooth.
- JPEG sequence, not video — video `currentTime` seeking is too slow in browsers; image swap to canvas is frame-accurate.
- Serve AVIF/JPEG from CDN. 148 frames ≈ 15–25MB total; lazy-decode after preload.
- Fallback: single static PNG for `prefers-reduced-motion` and `(max-width: 768px)`.

### Pinned Feature Copy Pattern

Text enters from below (`y: 40, opacity: 0`), holds while product animates, then exits up (`y: -30, opacity: 0`). All copy + image movement is on a **single timeline** with a single ScrollTrigger — never multiple competing triggers on the same section.

```js
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: "#feature-section",
    start: "top top",
    end: "+=300%",
    pin: true,
    scrub: 1,
  },
});

// Copy enters
tl.from(".feature-eyebrow", { opacity: 0, y: 30, duration: 0.3, ease: "power2.out" })
  .from(".feature-headline", { opacity: 0, y: 40, duration: 0.4, ease: "power2.out" }, "-=0.1")
  .from(".feature-body",     { opacity: 0, y: 30, duration: 0.3, ease: "power2.out" }, "-=0.1")
// Hold in place (no tween = scroll distance = reading time)
  .to({}, { duration: 0.6 })
// Copy exits up
  .to(".feature-copy-group", { opacity: 0, y: -30, duration: 0.3, ease: "power2.in" });
```

### Section Transition: Curtain / Cross-Fade

Between dark and light sections (e.g., black AirPods section → white specs section):

```css
.section-curtain {
  position: fixed;
  inset: 0;
  background: #000;
  opacity: 0;
  z-index: 100;
  pointer-events: none;
  transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
.section-curtain.active {
  opacity: 1;
}
```

Triggered via ScrollTrigger `toggleClass` or `onEnter`/`onLeave` callbacks. Duration: `0.6s ease-out`.

---

## 2. Hero Design

### The First Frame

Apple heroes are **visually complete in one viewport** — no need to scroll to understand the product. Components:

1. **Background**: product photography filling 100vw × 100vh, or a deep black/near-black color field.
2. **Product image**: centered, large, no drop shadow, clipped or floating on background.
3. **Eyebrow**: small caps label above headline (e.g., "iPhone 16 Pro"). 11–12px, 0.08–0.12em letter-spacing, semibold.
4. **Hero headline**: massive, centered, no more than 2–3 words if possible.
5. **Subhead**: one sentence. 19–21px, regular weight.
6. **CTAs**: two ghost/text links — "Learn more" and "Buy" — separated by a subtle `|` divider. Never a heavy filled button in the hero.

### Hero Restraint Rules

- No more than **three text elements** in the hero (eyebrow + headline + subhead/CTA).
- No decorative icons, borders, or card containers.
- Background image never competes with text — use a gradient overlay or product is placed in a dedicated zone.
- CTA row sits 40–48px below the subhead.
- The product is **always the biggest element**, larger than any typography.

---

## 3. Typography

### Font Stack

```css
font-family: -apple-system, "SF Pro Display", "SF Pro Text",
             "Helvetica Neue", Helvetica, Arial, sans-serif;
```

On the web, SF Pro cannot be distributed — use the system font stack and it renders SF Pro on Apple devices automatically. On Windows/Android, Helvetica Neue or Inter are acceptable fallbacks.

### Type Scale (rem, fluid with clamp)

Apple uses fluid scaling between 390px (mobile) and 1440px (desktop) with clamp().

| Role       | Mobile     | Desktop    | Clamp formula                                  | Letter-spacing | Line-height |
|------------|------------|------------|------------------------------------------------|----------------|-------------|
| Hero       | 3.5rem/56px | 5rem/80px  | `clamp(3.5rem, 2.286vw + 2.943rem, 5rem)`     | -0.04em        | 1.05        |
| H1         | 3rem/48px  | 4rem/64px  | `clamp(3rem, 1.524vw + 2.629rem, 4rem)`        | -0.035em       | 1.06        |
| H2         | 2.5rem/40px | 3.1875rem/51px | `clamp(2.5rem, 1.048vw + 2.245rem, 3.1875rem)` | -0.03em    | 1.07        |
| H3         | 2.125rem/34px | 2.5625rem/41px | `clamp(2.125rem, 0.667vw + 1.963rem, 2.5625rem)` | -0.025em | 1.08      |
| H4         | 1.75rem/28px | 2.0625rem/33px | `clamp(1.75rem, 0.476vw + 1.634rem, 2.0625rem)` | -0.02em  | 1.1         |
| Body       | 1rem/16px  | 1.0625rem/17px | `17px` above 744px, `16px` below             | 0em            | 1.47 (24px/28px) |
| Caption    | 0.8125rem/13px | 0.875rem/14px | discrete, not fluid                         | 0.01em         | 1.54        |
| Label/eyebrow | 0.6875rem/11px | 0.75rem/12px | discrete                                   | 0.08em         | 1.45        |

**Weight usage:**
- Hero, H1, H2: **700 (bold)** — always. Never 800 or 900; those feel cheap.
- H3, H4: **600 (semibold)**
- Body: **400 (regular)**
- CTA links in hero: **400, no underline**
- Eyebrow labels: **600 (semibold)** with uppercase + wide tracking

**SF Pro Display vs SF Pro Text:** Apple switches fonts optically at ~20px. For web, this means `font-feature-settings: "kern" 1` on all text, and the letter-spacing values in the table above manually replicate SF Pro Display's tighter optical spacing on large sizes.

---

## 4. Layout and Whitespace

### Section Rhythm

Apple sections breathe. The primary inter-section gap at desktop is **120px–160px** (`7.5rem–10rem`). Section-internal padding (between section edge and first text element) is **80px–120px** (`5rem–7.5rem`).

Tailwind pattern using a consistent spacing scale:
```js
// tailwind.config.js
spacing: {
  section: "7.5rem",    // 120px — standard section gap
  section-lg: "10rem",  // 160px — major narrative break
  inner: "5rem",        // 80px — section internal padding
  inner-lg: "7.5rem",   // 120px — hero/feature internal padding
  content: "2.5rem",    // 40px — between headline and body
  tight: "1rem",        // 16px — eyebrow-to-headline gap
}
```

### Content Width

- **Max content width**: `980px` for text columns (Apple's actual container)
- **Full-bleed**: hero images, dark atmosphere sections, video backgrounds always run 100vw
- **Text columns inside full-bleed**: centered at `max-w-[980px] mx-auto px-6`
- At wide viewports, Apple centers content in a `1200px` container; sub-elements like feature grids go to `980px`

```css
.apple-container {
  max-width: 980px;
  margin: 0 auto;
  padding: 0 24px; /* 24px on mobile */
}
@media (min-width: 1068px) {
  .apple-container { padding: 0 48px; }
}
```

### Grid Patterns

- **2-up feature grid**: `grid-cols-1 md:grid-cols-2 gap-4 md:gap-6` — cards fill their column, no ornamental gaps
- **3-up stats/specs**: `grid-cols-3 gap-2 md:gap-4` — numbers large (H2), labels small (caption)
- Never justify-center a 3-col grid at desktop — left-align within the container

---

## 5. Color and Atmosphere

### Core Palette

| Token           | Hex       | Usage                                     |
|-----------------|-----------|-------------------------------------------|
| `apple-black`   | `#1d1d1f` | Primary text, dark section backgrounds    |
| `apple-gray`    | `#f5f5f7` | Light section backgrounds                 |
| `apple-white`   | `#ffffff` | Section backgrounds (bright product pages)|
| `apple-mid`     | `#6e6e73` | Secondary body text, captions             |
| `apple-link`    | `#0071e3` | Interactive links (used sparingly)        |
| `apple-dark-bg` | `#000000` or `#141414` | Full-bleed dark atmosphere sections |

### Dark Section Atmosphere

Product-on-dark sections use radial gradients to give depth:
```css
.dark-atmosphere {
  background: radial-gradient(
    ellipse 80% 60% at 50% 0%,
    #2a2a2d 0%,
    #141414 40%,
    #000000 100%
  );
}
```

For deep product reveal moments (like Vision Pro, AirPods on black):
```css
.product-dark-hero {
  background: #000;
  /* ambient glow behind product */
  position: relative;
}
.product-dark-hero::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 60% 40% at 50% 50%,
    rgba(100, 100, 120, 0.15) 0%,
    transparent 70%
  );
  pointer-events: none;
}
```

### Light-to-Dark Section Transitions

Apple never jumps cold. The transition sequence is:
1. White section fades/cuts to black via a scroll-triggered curtain (`opacity: 0.6s ease-out`)
2. Or: background-color transitions on a wrapper using `transition: background-color 0.8s ease`

Never use CSS transitions on `background-color` mid-scroll — it fights Lenis. Use ScrollTrigger `onEnter`/`onLeave` to toggle a class, and CSS handles the transition.

### Gradient Text (iPhone 15 Pro, iPad Pro style)

```css
.gradient-headline {
  background-image: linear-gradient(
    135deg,
    #e8e8e8 0%,
    #ffffff 30%,
    #c8c8c8 60%,
    #ffffff 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

For colorful gradient text (iPhone XR/color editions):
```css
.gradient-headline-color {
  background-image: linear-gradient(
    90deg,
    #ff6b6b 0%,
    #ffd93d 25%,
    #6bcb77 50%,
    #4d96ff 75%,
    #c77dff 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  background-size: 200% 100%;
}
```

---

## 6. Motion

### Easing Functions

Apple's feel is "deceleration-dominant" — things arrive quickly and settle gently. Departures are faster (objects leaving the screen should not linger).

| Name              | Cubic-bezier                     | Usage                                          |
|-------------------|----------------------------------|------------------------------------------------|
| Apple standard    | `cubic-bezier(0.4, 0, 0.2, 1)`  | Most scroll-triggered reveals, section transitions |
| Apple entrance    | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | Elements entering from below (fade-up) |
| Apple exit        | `cubic-bezier(0.55, 0, 1, 0.45)` | Elements leaving screen                   |
| Apple spring-feel | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Hover scale, micro-interactions only — never on large blocks |
| Curtain/overlay   | `cubic-bezier(0.4, 0, 0.6, 1)`  | Full-screen opacity transitions             |

GSAP equivalents:
- `"power2.out"` ≈ Apple entrance (use for fade-up reveals)
- `"power2.inOut"` ≈ Apple standard (use for scrubbed timelines)
- `"power2.in"` ≈ Apple exit
- `"expo.out"` — reserved for hero reveals only, not section transitions

### Timing

- **Section reveals (fade-up):** `duration: 0.6s`, `y: 30px → 0`, `opacity: 0 → 1`
- **Stagger between sibling elements:** `stagger: 0.08s` (very tight — Apple staggers feel like one motion, not a cascade)
- **Hover transitions (nav links, buttons):** `0.15s` — imperceptibly fast
- **Nav background appear:** `0.3s ease`
- **Curtain transitions:** `0.6s ease-out`
- **Image sequence scrub lag:** `scrub: 1.5` in GSAP (1.5-second catch-up)

### What Triggers on Scroll vs Hover

**Scroll-triggered:**
- Image sequences (canvas scrub)
- Pinned feature copy (enter/exit timeline)
- Section background color change
- Stats counting up (use IntersectionObserver, not ScrollTrigger, for counting)
- Product scale reveal (starts at `scale: 0.9`, reaches `scale: 1` over 200px of scroll)

**Hover-triggered:**
- Nav link underline slide (`0.15s`)
- Product card subtle lift (`transform: translateY(-4px)`, `0.2s`)
- Button background opacity (`0.15s`)
- Color swatch swap (immediate, 0s)

**Never animate on scroll:** padding, margin, width, height, font-size, border-radius. Only `opacity`, `transform` (translate, scale), and `filter`. Everything else triggers layout reflow and kills performance.

### Stagger Pattern (GSAP)

```js
gsap.from(".feature-card", {
  opacity: 0,
  y: 30,
  duration: 0.6,
  ease: "power2.out",
  stagger: 0.08,
  scrollTrigger: {
    trigger: ".feature-grid",
    start: "top 80%",
    toggleActions: "play none none none",
  },
});
```

---

## 7. Lenis + GSAP + ScrollTrigger Setup (Next.js App Router)

### SmoothScroll Provider

```tsx
// components/SmoothScrolling.tsx
"use client";
import { ReactLenis, useLenis } from "lenis/react";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function SmoothScrolling({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<any>(null);

  useEffect(() => {
    function update(time: number) {
      lenisRef.current?.lenis?.raf(time * 1000); // GSAP time is seconds; Lenis expects ms
    }
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0); // disable GSAP lag smoothing — Lenis handles it
    ScrollTrigger.refresh();
    return () => gsap.ticker.remove(update);
  }, []);

  return (
    <ReactLenis
      root
      ref={lenisRef}
      options={{
        lerp: 0.1,          // 0.1 = Apple-smooth. Range: 0.05 (ultra-smooth) – 0.2 (responsive)
        duration: 1.5,      // overridden by lerp but set as fallback
        syncTouch: true,    // smooth on iOS/Android too
        autoRaf: false,     // we drive RAF via GSAP ticker
      }}
    >
      {children}
    </ReactLenis>
  );
}
```

Wrap `app/layout.tsx` body with `<SmoothScrolling>`.

---

## 8. Sticky Navigation

### Global Nav (Apple-style)

The global nav is `position: fixed; top: 0; width: 100%` with `backdrop-filter: blur(20px) saturate(180%)` and a very subtle background. On Apple pages:
- **Default state (hero):** background `rgba(0,0,0,0)` on dark pages, `rgba(255,255,255,0)` on light pages — fully transparent
- **Scrolled state:** `rgba(0,0,0,0.72)` on dark, `rgba(255,255,255,0.72)` on light + blur

```css
.global-nav {
  position: fixed;
  top: 0;
  width: 100%;
  height: 48px;
  z-index: 9999;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  background: rgba(255, 255, 255, 0);
  transition: background 0.3s ease;
}
.global-nav.scrolled {
  background: rgba(255, 255, 255, 0.72);
}
```

Triggered by:
```js
ScrollTrigger.create({
  start: "top -48",
  onToggle: ({ isActive }) =>
    document.querySelector(".global-nav")?.classList.toggle("scrolled", isActive),
});
```

### Local Product Nav (subnav)

A secondary nav bar slides down below the global nav after the hero is scrolled past. Contains section jump links: "Overview | Features | Tech Specs | Compare | Buy".

- Height: `52px`
- Appears: `transform: translateY(-100%)` → `translateY(0)` over `0.4s` when hero leaves viewport
- Also uses `backdrop-filter: blur(20px)` + subtle `border-bottom: 1px solid rgba(0,0,0,0.08)`
- Active section link: `font-weight: 600`, no underline — just weight shift

---

## 9. The "Feels Expensive" Detail Checklist

### Image Quality
- Product images: minimum 2× resolution for retina. Use `srcSet` with `2x` and `3x` variants.
- Never scale up below-resolution images. A blurry product image kills the premium feel instantly.
- Hero images: 100vw × 100vh, `object-fit: cover`, loaded with `priority` in Next.js Image component.
- Product on dark: shoot or source against true black, no composite shadows.

### No Clutter Rule
- Max text per section: **headline + 2 sentences**. Every additional sentence should be cut or hidden behind an expand.
- Icon+label pairs: icon is illustrative only, never decorative. If the icon doesn't add information, remove it.
- No dividing lines between sections — whitespace does the separation work.
- No drop shadows on product images. Atmosphere = lighting in the photograph.

### Section Transitions (No Jarring Jumps)
- Background color changes always `transition: background-color 0.8s` or via curtain
- Section height: never use `min-height: 100vh` on text-only sections — let content dictate height + add `py-section` padding
- Avoid `border-radius` on full-bleed images — Apple never rounds hero imagery

### Buttons and CTAs
- Apple CTAs on dark backgrounds: text-only link with `→` or underline, font-size 17px, weight 400
- Primary action button (Buy): `border-radius: 980px` (pill), `background: #0071e3`, `padding: 12px 24px`, `font-size: 17px`
- Secondary: same pill, but transparent with `border: 1.5px solid currentColor`
- No shadow on buttons. Ever.

---

## Rules for Our Builder

This is the concrete checklist the build agent applies to every page/section without exception.

### Typography Rules

- [ ] Hero headline: `clamp(3.5rem, 2.286vw + 2.943rem, 5rem)`, `font-weight: 700`, `letter-spacing: -0.04em`, `line-height: 1.05`
- [ ] H1: `clamp(3rem, 1.524vw + 2.629rem, 4rem)`, `font-weight: 700`, `letter-spacing: -0.035em`, `line-height: 1.06`
- [ ] H2: `clamp(2.5rem, 1.048vw + 2.245rem, 3.1875rem)`, `font-weight: 700`, `letter-spacing: -0.03em`, `line-height: 1.07`
- [ ] H3: `clamp(2.125rem, 0.667vw + 1.963rem, 2.5625rem)`, `font-weight: 600`, `letter-spacing: -0.025em`
- [ ] Body: `17px` (≥744px) / `16px` (<744px), `font-weight: 400`, `letter-spacing: 0`, `line-height: 1.47`
- [ ] Eyebrow labels: `12px`, `font-weight: 600`, `letter-spacing: 0.08em`, uppercase
- [ ] Font stack: `-apple-system, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif`
- [ ] Never use font-weight 800 or 900 on any element

### Spacing Rules

- [ ] Section gap: `py-[7.5rem]` (120px) minimum. Major breaks: `py-[10rem]` (160px)
- [ ] Hero internal padding: `pt-[7.5rem] pb-[5rem]`
- [ ] Headline → body copy gap: `mt-[2.5rem]` (40px)
- [ ] Eyebrow → headline gap: `mb-4` (16px)
- [ ] Max content width for text: `max-w-[980px] mx-auto px-6 lg:px-12`
- [ ] Full-bleed sections (hero, dark atmosphere): 100vw, no max-width on the container

### Color Rules

- [ ] Primary text: `#1d1d1f`
- [ ] Secondary text: `#6e6e73`
- [ ] Light background: `#f5f5f7` (off-white) or `#ffffff`
- [ ] Dark section background: `#000000` or `#141414`
- [ ] Link/action blue: `#0071e3`
- [ ] No background colors other than these five unless it's a product-specific accent (and even then, use it only on the product object, not the section background)

### Motion Rules

- [ ] All scroll reveals: `opacity: 0→1`, `y: 30px→0`, `duration: 0.6s`, `ease: "power2.out"`
- [ ] Stagger siblings: `stagger: 0.08s` (not more)
- [ ] Image sequence scrub: `scrub: 1.5`, NOT `scrub: true`
- [ ] Pinned sections: one timeline, one ScrollTrigger — never multiple overlapping triggers on same section
- [ ] Curtain transitions: `opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)`
- [ ] Hover states: `0.15s` max. Scale: `1.0→1.02` only, never `1.05+`
- [ ] Only animate `opacity`, `transform` (translate/scale/rotate), and `filter`. Never `width`, `height`, `top`, `left`, `margin`, `padding`
- [ ] `prefers-reduced-motion`: disable all transforms and durations, keep opacity-only fades at `0.3s`

### Scroll Architecture Rules

- [ ] Lenis: `lerp: 0.1`, `syncTouch: true`, `autoRaf: false` — ticker driven by GSAP
- [ ] `gsap.ticker.lagSmoothing(0)` — required when pairing with Lenis
- [ ] `ScrollTrigger.refresh()` after Lenis mounts
- [ ] Image sequence section: container height = `500vh`, canvas `position: sticky; top: 0; height: 100vh`
- [ ] Pinned copy sections: `end: "+=300%"` for a 3× dwell
- [ ] `toggleActions: "play none none none"` — elements animate in once and stay; no reverse on scroll-back
- [ ] ScrollTrigger `start: "top 80%"` for standard reveals (element enters when its top is 80% down the viewport)

### Navigation Rules

- [ ] Global nav height: `48px`, `position: fixed`, `z-index: 9999`
- [ ] Nav default: `background: transparent`
- [ ] Nav scrolled: `background: rgba(255,255,255,0.72)`, `backdrop-filter: blur(20px) saturate(180%)`, `transition: background 0.3s ease`
- [ ] Local product subnav: appears after hero exits, `height: 52px`, same blur treatment, section jump links
- [ ] Active subnav link: `font-weight: 600` only — no underline, no color change

### Image Rules

- [ ] All product images: `2×` minimum via `srcSet`
- [ ] Hero: `<Image priority fill style={{objectFit:"cover"}} />`
- [ ] Product on dark: no CSS shadows — use photographic lighting
- [ ] No `border-radius` on full-bleed or product hero images

### "Never Do" Rules

- [ ] No font-weight 800/900
- [ ] No drop shadows on product photography
- [ ] No `border-radius` on full-bleed section images
- [ ] No more than 3 text elements in a hero
- [ ] No decorative horizontal rules between sections — use whitespace
- [ ] No filled primary buttons in hero CTAs — use text links
- [ ] No GSAP width/height/top/left animation
- [ ] No `scrub: true` (boolean) — always `scrub: <number>`
- [ ] No multiple ScrollTrigger instances on the same pinned section
