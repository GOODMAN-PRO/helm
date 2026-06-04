# Stripe × Linear × Vercel × Raycast: Design Playbook

Research grounded in source inspection, CSS analysis, and reverse engineering of live sites. Written for Next.js + Tailwind + Framer Motion (Motion v11+).

---

## 1. Stripe's Craft

### The Gradient Hero

Stripe's hero is WebGL-powered, not CSS. They use a proprietary micro-library called **minigl** that runs vertex shaders on a `<canvas>` element, producing the signature flowing mesh of cyan, blue, pink, and red. The canvas sits behind skewed text at a `-12deg` transform, and the gradient bleeds past the viewport edge so you never see a hard edge.

**Exact implementation colors (reverse-engineered from minified source):**

```css
--gradient-color-1: #6ec3f4;  /* sky cyan */
--gradient-color-2: #3a3aff;  /* electric blue */
--gradient-color-3: #ff61ab;  /* hot pink */
--gradient-color-4: #E63946;  /* crimson */
```

**For a Next.js fallback without WebGL:** use a CSS conic + radial stack animated via Framer Motion `useMotionValue` + `useMotionTemplate`:

```tsx
// colors cycle: #13FFAA → #1E67C6 → #CE84CF → #DD335C
// duration: 10s, ease: "easeInOut", repeat: Infinity, repeatType: "mirror"
background-image: radial-gradient(125% 125% at 50% 0%, #020617 50%, {animatedColor})
```

**For production hero:** use the Stripe `sstripe-gradient` WebGL class (jordienr's OSS port, ~800 lines). React init:

```tsx
useEffect(() => {
  const gradient = new Gradient();
  gradient.initGradient('#gradient-canvas');
}, []);
// canvas styled with position: absolute, width/height: 100%, z-index: -1
// CSS vars --gradient-color-1 through -4 set on the canvas element
```

**The skew trick:** wrap the canvas in a container with `transform: skewY(-12deg)` and `overflow: hidden`; the canvas inside compensates with `transform: skewY(12deg)` and `height: calc(100% + sin(12deg) * width)`. On Stripe, the skew value is `--section-skew-Y: -12deg`, with the sine precomputed as `0.212` for height padding.

### Typography (Stripe)

Stripe uses their proprietary **Sohne** (and Sohne-var for variable-font performance). The closest public equivalent is **Inter** with `font-feature-settings: "ss01"` on (single-story 'a').

| Role | Size | Weight | Tracking | Line Height |
|------|------|--------|----------|-------------|
| Display | 56–72px | 300 | -1.4px | 1.1 |
| H1 | 48px | 400 | -0.8px | 1.15 |
| H2 | 38px | 400 | -0.4px | 1.2 |
| H3 | 24px | 500 | -0.2px | 1.3 |
| Body | 18–20px | 400 | -0.11px | 1.6 |
| Small | 16px | 400 | 0 | 1.5 |
| Caption | 13–14px | 400 | +0.1px | 1.4 |

Negative tracking at display sizes is Stripe's typographic signature. Numbers and prices use `font-feature-settings: "tnum"` (tabular figures) with slightly tighter tracking.

### Stripe Color System (Marketing)

```
Background:       #ffffff (light), #0a2540 (hero dark wash)
Primary brand:    #533afd (purple, all CTAs)
Hero gradient:    #ff6118 → #ffe0ef → #533afd (the 2024-2025 orange-pink-purple arc)
Text primary:     #061b31 (near-black navy)
Text secondary:   #425466
Border light:     rgba(0, 0, 0, 0.08)
Shadow cards:     rgba(23, 23, 23, 0.06) 0 3px 6px
```

### Stripe Motion Language

- Animation engine priority: CSS transition → CSS animation → Web Animations API → `requestAnimationFrame`
- All animations exclusively on `transform` and `opacity` (no layout-triggering props)
- Easing signature: `cubic-bezier(0.2, 1, 0.2, 1)` — fast in, strong spring-out, duration ~800ms
- Scroll-driven: `IntersectionObserver` with `threshold: 1` to trigger elements
- `@media (prefers-reduced-motion: reduce)` cuts all decorative animation
- 3D product cards: face visibility calculated per-frame, shading uses linear interpolation on RGB channels to simulate a virtual light source

---

## 2. Linear's Craft

### The Quiet Premium Aesthetic

Linear's principle: **structure felt, not seen**. Every separator, border, and surface elevation is present but below conscious threshold. When you inspect it, you realize there are 3–4 surface layers stacked, but you never *noticed* them while using the product.

The 2025 marketing site swung further toward monochrome — almost no color saturation, accent purple used once per screen max, white and near-black carrying everything. "If most people don't notice what changed, that's a good sign."

### Linear Dark Theme Color System

Built on LCH color space (perceptually uniform — a red at L50 and a yellow at L50 appear equally bright). Three generative primitives: base color + accent color + contrast.

**Derived tokens (reconstructed from community analysis):**

```
Page background:    #08090a  (Pitch Black)
Canvas:             #0f1011  (Graphite)
Surface default:    #141414  (card backgrounds)
Surface elevated:   #161718  (Deep Slate, modals)
Surface input:      #1c1e23  
Button FG:          #18191a

Border hairline:    #23252a  (or rgba(255,255,255,0.06))
Border default:     rgba(255,255,255,0.08)
Border strong:      rgba(255,255,255,0.14)

Text primary:       #f0f0f0
Text secondary:     #9ca3af  (roughly)
Text muted:         #6b7280
Text disabled:      #4b5563

Accent purple:      #5e6ad2  (Linear's signature blue-purple)
Accent soft bg:     rgba(94, 106, 210, 0.12)
Accent glow:        rgba(94, 106, 210, 0.25) in box-shadow
```

No drop shadows for elevation. Depth comes **only** from the surface color ladder. Each notch lighter = one step closer to the viewer.

### Linear Typography

**Font:** Inter Variable. Always. Every size. Headings use **Inter Display** optical variant above 32px.

```
font-family: 'Inter var', 'Inter', system-ui, sans-serif;
font-feature-settings: "calt", "kern", "liga", "ss01";
```

| Role | Size | Weight | Tracking | Line Height |
|------|------|--------|----------|-------------|
| Display | 48–64px | 600 | -0.03em | 1.1 |
| H1 | 36–42px | 600 | -0.025em | 1.15 |
| H2 | 28–32px | 600 | -0.02em | 1.2 |
| H3 | 20–22px | 500 | -0.015em | 1.3 |
| Body | 16px | 400 | -0.011em | 1.6 |
| Body SM | 14px | 400 | -0.006em | 1.5 |
| Label/Badge | 12–13px | 500 | +0.02em | 1.4 |

Negative tracking is consistent from display down to body. Labels and badges flip positive for legibility at small sizes.

### Linear Micro-interactions

- **Hover states**: color shift only, no scale. Border opacity steps from 0.08 → 0.14, background lightens one step on the surface ladder.
- **Card hover**: subtle `box-shadow: 0 0 0 1px rgba(94,106,210,0.3)` appearing over 150ms — the accent glow bleeds in at the edge.
- **Button press**: scale(0.97), 80ms, spring-like snap back.
- **List items**: `translateX(0 → 2px)` on hover, 120ms ease-out. Barely perceptible — feels physical.
- **Focus rings**: `outline: 2px solid rgba(94,106,210,0.7)` at 2px offset, rounded to match element border-radius.
- **Page transitions**: opacity fade (0 → 1), 200ms, `ease-out`. No slide.

### Linear Glow / Border Treatment (the hardest part to replicate)

The "glow border" on cards and feature blocks:

```css
/* Card container */
border: 1px solid rgba(255, 255, 255, 0.08);
border-radius: 8px;
background: #141414;
position: relative;

/* Hover glow — pseudo-element technique */
&::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 9px; /* 1px larger than card */
  background: linear-gradient(135deg, rgba(94,106,210,0.4), transparent 50%);
  opacity: 0;
  transition: opacity 200ms ease;
  pointer-events: none;
}

&:hover::before { opacity: 1; }
```

Alternately, use `box-shadow`:

```css
box-shadow: 0 0 0 1px rgba(94,106,210,0.0);
transition: box-shadow 200ms ease;

&:hover {
  box-shadow: 0 0 0 1px rgba(94,106,210,0.35),
              0 0 20px 2px rgba(94,106,210,0.1);
}
```

---

## 3. Vercel's Craft

Vercel is the extreme of restraint: pure black, pure white, their custom **Geist** typeface, and almost no decoration.

### Vercel Color Tokens

```
Background:         #000000  (pure black)
Surface:            #0a0a0a  (Gray-950)
Surface elevated:   #171717  (Gray-900)
Surface card:       #262626  (Gray-800)

Text primary:       #ffffff
Text secondary:     #a3a3a3  (Gray-400)
Text muted:         #737373  (Gray-500)

Border default:     rgba(255,255,255,0.08)
Border strong:      rgba(255,255,255,0.15)

Accent blue:        #0070f3  (links, active only)
Error:              #ee0000
Warning:            #f5a623
```

No gradients on UI components. No marketing shadows. Depth is pure color value delta.

**Spacing:** aggressive 8px grid. Section padding 96–128px vertical. This is more whitespace than feels comfortable — that discomfort is the point.

**Border radius:** 0–4px marketing (sharp), 6–8px interactive. No rounded-xl on cards.

### Vercel Typography

```
font-family: 'Geist', system-ui, sans-serif;
/* Fallback: Inter at weight 300-400 */

letter-spacing: -0.04em  /* display */
letter-spacing: -0.01em  /* normal */
line-height: 1.15       /* tight headings */
line-height: 1.5        /* base */
```

---

## 4. Raycast's Craft

Raycast is the darkest and most chrome-free of the set. The marketing page *is* the product — command palette mockups as the hero visual, zero illustration, the product's own UI as the proof.

### Raycast Color Tokens

```
Canvas:             #07080a
Surface:            #0d0d0d
Surface elevated:   #101111
Surface card:       #121212
Button FG:          #18191a

Border hairline:    #242728
Border soft:        rgba(255,255,255,0.08)
Border strong:      rgba(255,255,255,0.16)

Text primary:       #f4f4f6
Text body:          #cdcdcd
Text muted:         #9c9c9d
Text disabled:      #6a6b6c

Accent blue:        #57c1ff
Accent blue soft:   rgba(87,193,255,0.15)
Hero gradient:      #ff5757 → #a1131a  (the red stripe)
```

**Typography:** Inter with `font-feature-settings: "calt", "kern", "liga", "ss03"`.

| Role | Size | Weight | Tracking | Line Height |
|------|------|--------|----------|-------------|
| Display XL | 64px | 600 | 0 | 1.1 |
| Display LG | 56px | 500 | +0.2px | 1.17 |
| Heading XL | 24px | 500 | +0.2px | 1.6 |
| Body MD | 16px | 400 | 0 | 1.6 |
| Caption | 12px | 400 | +0.4px | 1.5 |

---

## 5. Concrete Techniques

### Animated Gradient Hero (Three Approaches)

**Approach A — WebGL (Stripe-quality, max fidelity):**

```tsx
// /components/GradientCanvas.tsx
'use client';
import { useEffect, useRef } from 'react';
import { Gradient } from '@/lib/gradient'; // ~800-line minigl port

export function GradientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const gradient = new Gradient();
    gradient.initGradient('#stripe-gradient');
    return () => gradient.disconnect?.();
  }, []);

  return (
    <canvas
      id="stripe-gradient"
      ref={canvasRef}
      className="absolute inset-0 w-full h-full -z-10"
      style={{
        '--gradient-color-1': '#6ec3f4',
        '--gradient-color-2': '#3a3aff',
        '--gradient-color-3': '#ff61ab',
        '--gradient-color-4': '#E63946',
      } as React.CSSProperties}
    />
  );
}
```

**Approach B — CSS Aurora (pure CSS, performant, no WebGL):**

```css
/* Tailwind-friendly inline version */
.aurora-bg {
  background:
    radial-gradient(ellipse 80% 50% at 20% -20%, rgba(120,119,198,0.3), transparent),
    radial-gradient(ellipse 80% 50% at 80% -10%, rgba(78,161,211,0.2), transparent),
    radial-gradient(ellipse 80% 80% at 50% -50%, rgba(200,100,200,0.15), transparent),
    #020617;
  animation: aurora-shift 8s ease-in-out infinite alternate;
}

@keyframes aurora-shift {
  0%   { background-position: 20% -20%, 80% -10%, 50% -50%; }
  100% { background-position: 25% -15%, 75% -5%, 55% -45%; }
}
```

**Approach C — Framer Motion `useMotionTemplate` (React, animated color cycling):**

```tsx
'use client';
import { useEffect } from 'react';
import { motion, useMotionTemplate, useMotionValue, animate } from 'motion/react';

const COLORS = ['#13FFAA', '#1E67C6', '#CE84CF', '#DD335C'];

export function AuroraHero({ children }: { children: React.ReactNode }) {
  const color = useMotionValue(COLORS[0]);

  useEffect(() => {
    animate(color, COLORS, {
      ease: 'easeInOut',
      duration: 10,
      repeat: Infinity,
      repeatType: 'mirror',
    });
  }, []);

  const bg = useMotionTemplate`radial-gradient(125% 125% at 50% 0%, #020617 50%, ${color})`;

  return (
    <motion.section style={{ background: bg }} className="relative min-h-screen">
      {children}
    </motion.section>
  );
}
```

### Subtle Glow Border Card

```tsx
// Tailwind + CSS custom props
<div className="
  relative rounded-lg p-px
  bg-gradient-to-br from-white/10 via-transparent to-transparent
  hover:from-violet-500/30 hover:via-transparent hover:to-transparent
  transition-all duration-200
">
  <div className="rounded-[calc(0.5rem-1px)] bg-[#141414] p-6">
    {/* card content */}
  </div>
</div>
```

Or with `box-shadow` for the glow-on-hover pattern (no wrapper div needed):

```tsx
<div
  className="rounded-lg border border-white/8 bg-[#141414] p-6
             transition-shadow duration-200
             hover:shadow-[0_0_0_1px_rgba(94,106,210,0.35),0_0_24px_4px_rgba(94,106,210,0.08)]"
>
```

### Glassmorphism — Done Tastefully

Max 2–3 glass elements per viewport. Never place text directly on the glass surface without a backing panel.

```css
.glass-card {
  background: rgba(14, 14, 20, 0.65);    /* dark glass, not white */
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.05); /* top-edge highlight */
}

/* Noise texture overlay for depth (optional, tasteful amount) */
.glass-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: url("data:image/svg+xml,..."); /* 64x64 SVG noise, opacity 0.03 */
  pointer-events: none;
}
```

Fallback for no backdrop-filter:

```css
@supports not (backdrop-filter: blur(1px)) {
  .glass-card { background: rgba(14, 14, 20, 0.92); }
}
```

### Sticky Nav with Scroll State

```tsx
'use client';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <motion.nav
      className="fixed top-0 inset-x-0 z-50 px-6 py-4"
      animate={{
        backgroundColor: scrolled
          ? 'rgba(8, 9, 10, 0.85)'
          : 'rgba(8, 9, 10, 0)',
        backdropFilter: scrolled ? 'blur(12px)' : 'blur(0px)',
        borderBottomColor: scrolled
          ? 'rgba(255,255,255,0.08)'
          : 'rgba(255,255,255,0)',
      }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{ borderBottomWidth: '1px', borderBottomStyle: 'solid' }}
    >
      {/* nav content */}
    </motion.nav>
  );
}
```

### Section Transitions / Scroll Reveal

Keep it fast. The mistake is slow, dramatic reveals — best-in-class sites use 300–400ms, subtle translation.

```tsx
// /components/Reveal.tsx
'use client';
import { motion, useInView } from 'motion/react';
import { useRef } from 'react';

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
}

export function Reveal({ children, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.4,
        delay,
        ease: [0.16, 1, 0.3, 1], /* custom expo-out */
      }}
    >
      {children}
    </motion.div>
  );
}

// Stagger usage:
// <Reveal delay={0}>   <Reveal delay={0.08}>   <Reveal delay={0.16}>
```

For word/character reveals (Linear-style):

```tsx
const words = text.split(' ');
return (
  <div>
    {words.map((word, i) => (
      <motion.span
        key={i}
        initial={{ opacity: 0, y: 8 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="inline-block mr-[0.25em]"
      >
        {word}
      </motion.span>
    ))}
  </div>
);
```

---

## 6. Type Systems in Detail

### The Font Stack Decision

| Brand | Font | License | Fallback |
|-------|------|---------|----------|
| Stripe | Sohne / Sohne Var | Proprietary | Inter + ss01 |
| Linear | Inter Variable | Open (SIL) | system-ui |
| Vercel | Geist | Open (SIL) | Inter |
| Raycast | Inter | Open (SIL) | system-ui |

For Helm: **Inter Variable** loaded as a variable font, weight axis 100–900.

```html
<!-- next/font/google -->
import { Inter } from 'next/font/google';
const inter = Inter({
  subsets: ['latin'],
  axes: ['wght'],
  variable: '--font-inter',
  display: 'swap',
});
```

```css
/* Apply globally */
body {
  font-family: var(--font-inter), 'Inter', system-ui, sans-serif;
  font-feature-settings: "calt", "kern", "liga", "ss01";
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

**Anti-aliasing is mandatory.** On dark backgrounds without `-webkit-font-smoothing: antialiased`, Inter looks blurry and heavy. This is the single most impactful CSS rule for matching Linear's crispness.

### Type Scale (shared across Helm)

| Token | Size | Weight | Tracking | Line Height |
|-------|------|--------|----------|-------------|
| `display-xl` | 64px / 4rem | 600 | -0.03em | 1.1 |
| `display-lg` | 52px / 3.25rem | 600 | -0.025em | 1.12 |
| `heading-xl` | 40px / 2.5rem | 600 | -0.02em | 1.15 |
| `heading-lg` | 32px / 2rem | 600 | -0.018em | 1.2 |
| `heading-md` | 24px / 1.5rem | 500 | -0.015em | 1.3 |
| `heading-sm` | 20px / 1.25rem | 500 | -0.01em | 1.35 |
| `body-lg` | 18px / 1.125rem | 400 | -0.011em | 1.6 |
| `body-md` | 16px / 1rem | 400 | -0.008em | 1.6 |
| `body-sm` | 14px / 0.875rem | 400 | -0.006em | 1.5 |
| `label` | 13px / 0.8125rem | 500 | +0.02em | 1.4 |
| `caption` | 12px / 0.75rem | 400 | +0.03em | 1.5 |
| `mono` | 13px / 0.8125rem | 400 | 0 | 1.6 |

---

## 7. Dark Theme Color System Architecture

### Layer Model (6 layers, light to viewer = lighter value)

```
Layer 0 — Page        #08090a   (deepest, behind everything)
Layer 1 — Canvas      #0d0d0d   (default content area)
Layer 2 — Card        #111214   (cards, panels)
Layer 3 — Elevated    #161718   (modals, dropdowns)
Layer 4 — Input       #1c1e23   (inputs, selected rows)
Layer 5 — Hover       #222427   (hover states on Layer 4)
```

No shadows between layers. Just value steps. The human eye perceives the lighter surface as physically closer.

### Accent + Glow System

```
Accent:         hsl(235, 55%, 58%)   = #5e6ad2  (Linear blue-purple)
Accent soft:    rgba(94, 106, 210, 0.12)         (tinted backgrounds)
Accent glow:    rgba(94, 106, 210, 0.25)         (box-shadow only)
Accent border:  rgba(94, 106, 210, 0.35)         (hover borders)

/* Glow recipe — 3-layer box-shadow */
box-shadow:
  0 0 0 1px rgba(94, 106, 210, 0.35),   /* border layer */
  0 0 12px 2px rgba(94, 106, 210, 0.12), /* close ambient */
  0 0 40px 8px rgba(94, 106, 210, 0.05); /* far bloom */
```

### Border Opacity Ladder

```
Hairline (visual only, non-interactive):  rgba(255,255,255,0.05)
Default (card edges):                     rgba(255,255,255,0.08)
Moderate (section dividers):              rgba(255,255,255,0.12)
Strong (active state, modals):            rgba(255,255,255,0.16)
Prominent (focused, selected):            rgba(255,255,255,0.24)
```

---

## 8. Motion Language

### The Core Rule

Only animate `transform` and `opacity`. Everything else causes layout recalc or paint.

### Easing Vocabulary

```
/* Linear/Vercel — fade with purpose */
ease-out-subtle: cubic-bezier(0.16, 1, 0.3, 1)    /* expo-out, fast settle */

/* Stripe — energetic, spring-feel */
ease-stripe:     cubic-bezier(0.2, 1, 0.2, 1)      /* fast in, spring out */

/* Raycast — physical snap */
spring: { type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }

/* Hover micro — instantaneous feel */
ease-hover:      cubic-bezier(0.4, 0, 0.2, 1)       /* Material standard */
```

### Duration Rules

| Type | Duration | Notes |
|------|----------|-------|
| Hover in | 120–150ms | Feels instant |
| Hover out | 200–250ms | Slightly slower, feels natural |
| Element reveal on scroll | 300–400ms | Snappy, not theatrical |
| Page/section transition | 200ms | Fade only |
| Animated gradient background | 8–12s | Barely perceptible drift |
| Modal open | 220ms + spring | Fast open, spring overshoot |
| Modal close | 150ms | Faster close than open |

**Nothing decorative over 500ms.** If you're animating longer than that, it should be background / ambient (the gradient canvas), not UI.

### What Animates

| Event | Properties | Duration/Easing |
|-------|-----------|-----------------|
| Scroll into view | opacity 0→1, y 16→0 | 400ms, expo-out |
| Hover card | border opacity, box-shadow glow | 150ms, ease-out |
| Button hover | scale 1→1.02, background brighten | 120ms, ease |
| Button press | scale 1→0.97 | 80ms, ease-in |
| Nav scroll state | bg opacity, blur | 200ms, ease-out |
| Word/char reveal | opacity 0→1, y 8→0 (staggered) | 300ms per word, 40ms stagger |
| Feature tab switch | opacity, x translate | 200ms, ease-out |

### What Does NOT Animate

- Text color changes (jarring)
- Border-radius changes
- Font-weight changes
- Width/height (use transform: scaleX instead)
- Colors on gradient backgrounds (use opacity layers instead)

---

## 9. Grid & Spacing

Both Stripe and Linear use a **8px grid** strictly. Section padding: `96px` desktop, `64px` tablet, `48px` mobile.

```
Content max-width:    1200px (Stripe), 1120px (Linear)
Column gap:           24px (desktop), 16px (mobile)
Section gap:          96–128px (desktop), 64–80px (mobile)
Card padding:         24px / 32px
```

**The bento grid** (feature section) — used heavily by Linear and Raycast:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Feature cards, some spanning 2 cols for visual rhythm */}
  <div className="lg:col-span-2 ...">...</div>
  <div className="...">...</div>
  <div className="...">...</div>
  <div className="lg:col-span-2 ...">...</div>
</div>
```

Bento cards: `border border-white/8 rounded-xl bg-[#111214] p-6`. No equal-size grids — asymmetry is the signal of craft.

---

## 10. Product/Code Visuals

Stripe uses sub-pixel CSS 3D device mockups (no images, pure CSS perspective transforms) that scale perfectly and weigh under 1KB. For marketing features, their device frames are CSS `border-radius`, `perspective`, `rotateX`/`rotateY` with inline `box-shadow` for depth.

Linear and Raycast use direct product screenshots with:
- Dark chrome frame, thin border `rgba(255,255,255,0.1)`
- `border-radius: 12px`
- Background glow: `box-shadow: 0 0 80px 20px rgba(94,106,210,0.1)` beneath the screenshot
- Slight `transform: perspective(1200px) rotateX(4deg)` for hero product images

Code blocks: syntax-highlighted, monospace (Berkeley Mono or JetBrains Mono), dark `#0d1117` or `#0f1117` background, subtle line highlight on active line, border `rgba(255,255,255,0.06)`, corner `8px`.

---

## Rules for our builder

These are the concrete, non-negotiable tokens and techniques to apply to every Helm page.

### Color Tokens

```css
:root {
  /* Backgrounds */
  --bg-page:        #08090a;
  --bg-canvas:      #0d0d0d;
  --bg-card:        #111214;
  --bg-elevated:    #161718;
  --bg-input:       #1c1e23;

  /* Borders */
  --border-hairline: rgba(255,255,255,0.05);
  --border-default:  rgba(255,255,255,0.08);
  --border-moderate: rgba(255,255,255,0.12);
  --border-strong:   rgba(255,255,255,0.16);

  /* Text */
  --text-primary:    #f0f0f0;
  --text-secondary:  #9ca3af;
  --text-muted:      #6b7280;
  --text-disabled:   #4b5563;

  /* Accent (Helm brand — adjust hue as needed) */
  --accent:          hsl(235, 55%, 58%);   /* #5e6ad2 */
  --accent-soft:     rgba(94,106,210,0.12);
  --accent-glow:     rgba(94,106,210,0.25);
  --accent-border:   rgba(94,106,210,0.35);
}
```

### Tailwind Config Additions

```js
// tailwind.config.ts
colors: {
  page:      '#08090a',
  canvas:    '#0d0d0d',
  card:      '#111214',
  elevated:  '#161718',
  accent:    '#5e6ad2',
},
borderColor: {
  hairline: 'rgba(255,255,255,0.05)',
  DEFAULT:  'rgba(255,255,255,0.08)',
  moderate: 'rgba(255,255,255,0.12)',
  strong:   'rgba(255,255,255,0.16)',
},
```

### Typography Rules

```css
/* Always on body */
-webkit-font-smoothing: antialiased;
font-feature-settings: "calt", "kern", "liga", "ss01";

/* Display headlines */
font-size: clamp(2.5rem, 5vw, 4rem);
font-weight: 600;
letter-spacing: -0.03em;
line-height: 1.1;

/* Body */
font-size: 1rem;           /* 16px */
line-height: 1.6;
letter-spacing: -0.008em;
color: var(--text-secondary);  /* NOT primary — body text is secondary on dark */
```

### Gradient Hero Recipe

```tsx
// Use Approach C (Framer Motion) as default, upgrade to WebGL for home page only
// Colors for Helm: deep space palette
const HELM_GRADIENT_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669'];
// radial-gradient(125% 125% at 50% 0%, #020617 50%, {animatedColor})
// duration: 10s, ease: easeInOut, repeat: Infinity, repeatType: mirror
```

### Glow/Border Card Standard

```tsx
// Every feature card
className="rounded-xl border border-white/8 bg-card p-6
           transition-shadow duration-200 ease-out
           hover:shadow-[0_0_0_1px_rgba(94,106,210,0.35),0_0_24px_4px_rgba(94,106,210,0.08)]"
```

### Easing Tokens

```ts
export const ease = {
  out:    [0.16, 1, 0.3, 1]  as const,  // expo-out, primary reveal easing
  stripe: [0.2, 1, 0.2, 1]   as const,  // Stripe signature, energetic
  hover:  [0.4, 0, 0.2, 1]   as const,  // micro hover
};

export const spring = {
  snappy: { type: 'spring', stiffness: 300, damping: 30, mass: 0.8 },
  gentle: { type: 'spring', stiffness: 200, damping: 25, mass: 1 },
};
```

### Duration Rules

```ts
export const duration = {
  hover:   0.15,   // hover in
  hoverOut:0.22,   // hover out (slower)
  reveal:  0.4,    // scroll into view
  page:    0.2,    // page/section transitions
  ambient: 10,     // background gradient cycle
};
```

### Reveal Animation (use everywhere)

```tsx
// initial={{ opacity: 0, y: 16 }}
// animate={{ opacity: 1, y: 0 }}
// transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay }}
// trigger: useInView with once: true, margin: '-80px'
```

### Nav Scroll State

```
Unscrolled: bg transparent, no border
Scrolled >20px: bg rgba(8,9,10,0.85), backdrop-blur-md, border-bottom border-default
Transition: 200ms ease-out on backgroundColor, backdropFilter, borderBottomColor
```

### Section Spacing

```
py-24 md:py-32 lg:py-40   /* 96px / 128px / 160px */
max-w-7xl mx-auto px-6    /* content container */
gap-4 (bento), gap-6 (cards), gap-8 (feature rows)
```

### Banned Patterns

- Pure `#000000` backgrounds — use `#08090a`
- White borders without opacity — always use `rgba(255,255,255,0.08)` minimum
- Drop shadows for elevation — use surface color stepping
- Animations over 500ms (except ambient background)
- Animating anything other than `transform` and `opacity`
- `font-smoothing` omitted — always set `-webkit-font-smoothing: antialiased`
- Equal-size bento grids — asymmetry is mandatory
- More than 3 glass elements per viewport
- Animation on `backdrop-filter` elements (expensive repaint)
