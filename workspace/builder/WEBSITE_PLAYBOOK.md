# WEBSITE PLAYBOOK — Master Reference
> Single source of truth for every site the builder agent generates.
> Stack: Next.js 15 App Router · TypeScript · Tailwind CSS v4 · Framer Motion (`motion/react` v12+) · GSAP 3.12+ · Lenis 1.3+
> Target bar: Apple.com / Awwwards SOTD / Stripe / Linear quality.

---

## 0. HARD RULES (read first, enforce always)

1. **`npm run build` must pass with zero errors** before the task is done. No exceptions.
2. **No stubs, no lorem, no "coming soon".** Every section has real copy, real content.
3. **Transform + opacity only.** Never animate `width`, `height`, `top`, `left`, `margin`, `padding`, `font-size`. Zero layout-triggering animations.
4. **`prefers-reduced-motion` is mandatory** — implement on every animation (CSS and JS).
5. **WCAG AA contrast everywhere** — 4.5:1 body, 3:1 UI components. Muted text is for decorative labels only.
6. **`tsconfig.json` must NOT enable** `exactOptionalPropertyTypes` or `noUncheckedIndexedAccess` — they break Next.js builds.
7. **Keyboard accessible** — every interactive element reachable by Tab, custom focus ring on all `:focus-visible`.
8. **60fps always** — `will-change` only on actively animating elements, cleared in `onComplete`.
9. **One visual concept** — commit to it. Every decision either serves it or gets cut.
10. **No pure `#000000` or `#ffffff`** — use off-black and off-white from the token system.

---

## 1. DESIGN TOKENS

### 1.1 Color System — CSS Variables

Paste into `app/globals.css` before `@theme`.

```css
/* ================================================================
   DESIGN TOKENS — Dark (default) + Light themes
   Change --hue to rebrand: 250=indigo 220=blue 175=teal 290=purple 340=rose
   ================================================================ */

:root,
:root[data-theme="dark"] {
  --hue: 250;

  /* Surfaces — luminance hierarchy. NO drop shadows between layers. */
  --surface-base:    oklch(9%  0.010 250);   /* #0c0d14 — page bg */
  --surface-raised:  oklch(13% 0.010 250);   /* #161820 — cards */
  --surface-overlay: oklch(17% 0.010 250);   /* #1e2030 — hover, active rows */
  --surface-float:   oklch(22% 0.008 250);   /* #282b3a — modals, dropdowns */
  --surface-sunken:  oklch(6%  0.012 250);   /* #090a10 — inset wells */

  /* Borders — white alpha only, adapts to any surface tint */
  --border-subtle:   rgba(255,255,255,0.06);
  --border-default:  rgba(255,255,255,0.10);
  --border-moderate: rgba(255,255,255,0.16);
  --border-strong:   rgba(255,255,255,0.24);
  --border-focus:    rgba(255,255,255,0.30);

  /* Text — always verify contrast; tertiary is 18px+ only */
  --text-primary:    oklch(95% 0.004 250);   /* #f0f1f5 — 16:1 on base ✓ */
  --text-secondary:  oklch(70% 0.008 250);   /* #9ea3b8 — 6.5:1 ✓ */
  --text-tertiary:   oklch(50% 0.008 250);   /* #656a80 — 4.2:1 large only */
  --text-disabled:   oklch(36% 0.006 250);   /* #454858 */
  --text-on-accent:  oklch(98% 0.002 250);

  /* Accent — ONE hue, multiple opacities */
  --accent:          oklch(62% 0.18 250);    /* #5B6EF5 — primary actions */
  --accent-hover:    oklch(70% 0.18 250);
  --accent-pressed:  oklch(55% 0.18 250);
  --accent-muted:    oklch(62% 0.06 250);
  --accent-ghost:    oklch(62% 0.03 250);
  --accent-glow:     oklch(62% 0.18 250 / 0.25);
  --accent-border:   oklch(62% 0.18 250 / 0.35);
  --accent-rgb:      91, 110, 245;           /* for rgba() usage */

  /* Semantic states */
  --success:  oklch(68% 0.14 150);
  --warning:  oklch(78% 0.16 70);
  --error:    oklch(62% 0.20 22);

  /* Atmosphere */
  --hero-glow:        oklch(55% 0.15 250 / 0.20);
  --grad-accent:      linear-gradient(135deg, oklch(58% 0.22 255), oklch(68% 0.16 235));
  --grad-display:     linear-gradient(120deg,
                        oklch(92% 0.005 255) 0%,
                        oklch(80% 0.008 220) 40%,
                        oklch(85% 0.006 270) 70%,
                        oklch(92% 0.004 255) 100%);
  --grad-hero-bg:     linear-gradient(180deg, oklch(7% 0.012 250), oklch(11% 0.010 250));

  /* Shadows (pair with --border-subtle inset highlight on cards) */
  --shadow-card:   inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.45);
  --shadow-raised: inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.5);
  --shadow-glow:   0 0 0 1px rgba(255,255,255,0.06), 0 4px 24px rgba(var(--accent-rgb),0.15);
  --shadow-float:  0 12px 48px rgba(0,0,0,0.50), 0 2px 8px rgba(0,0,0,0.35);
}

:root[data-theme="light"] {
  --surface-base:    oklch(98% 0.003 250);   /* #f9f9fc */
  --surface-raised:  oklch(100% 0 0);        /* #ffffff */
  --surface-overlay: oklch(96% 0.004 250);   /* #f1f2f7 */
  --surface-float:   oklch(100% 0 0);
  --surface-sunken:  oklch(94% 0.005 250);

  --border-subtle:   rgba(0,0,0,0.04);
  --border-default:  rgba(0,0,0,0.09);
  --border-moderate: rgba(0,0,0,0.16);
  --border-strong:   rgba(0,0,0,0.24);
  --border-focus:    rgba(0,0,0,0.28);

  --text-primary:    oklch(12% 0.010 250);   /* #131420 */
  --text-secondary:  oklch(40% 0.010 250);   /* #4a4f68 */
  --text-tertiary:   oklch(58% 0.008 250);   /* #7e84a0 */
  --text-disabled:   oklch(72% 0.006 250);
  --text-on-accent:  oklch(99% 0.001 0);

  --accent:          oklch(52% 0.18 250);
  --accent-hover:    oklch(45% 0.18 250);
  --accent-pressed:  oklch(40% 0.18 250);
  --accent-muted:    oklch(52% 0.06 250);
  --accent-ghost:    oklch(52% 0.025 250);
  --accent-glow:     oklch(52% 0.18 250 / 0.18);
  --accent-border:   oklch(52% 0.18 250 / 0.25);
  --accent-rgb:      75, 85, 210;

  --success: oklch(50% 0.16 150);
  --warning: oklch(52% 0.18 70);
  --error:   oklch(50% 0.22 22);

  --hero-glow:     oklch(52% 0.12 250 / 0.12);
  --grad-accent:   linear-gradient(135deg, oklch(48% 0.22 255), oklch(58% 0.16 235));
  --grad-display:  linear-gradient(120deg,
                     oklch(15% 0.012 255) 0%,
                     oklch(25% 0.010 220) 40%,
                     oklch(20% 0.008 270) 70%,
                     oklch(15% 0.010 255) 100%);
  --grad-hero-bg:  linear-gradient(180deg, oklch(97% 0.005 250), oklch(93% 0.008 250));

  --shadow-card:   0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06);
  --shadow-raised: 0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06);
  --shadow-glow:   0 0 0 1px rgba(var(--accent-rgb),0.15), 0 4px 24px rgba(var(--accent-rgb),0.12);
  --shadow-float:  0 12px 48px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08);
}

/* ── Tailwind v4 @theme registration ─────────────────────────── */
@theme {
  --color-surface-base:    var(--surface-base);
  --color-surface-raised:  var(--surface-raised);
  --color-surface-overlay: var(--surface-overlay);
  --color-surface-float:   var(--surface-float);
  --color-surface-sunken:  var(--surface-sunken);
  --color-border-subtle:   var(--border-subtle);
  --color-border-default:  var(--border-default);
  --color-border-moderate: var(--border-moderate);
  --color-border-strong:   var(--border-strong);
  --color-border-focus:    var(--border-focus);
  --color-text-primary:    var(--text-primary);
  --color-text-secondary:  var(--text-secondary);
  --color-text-tertiary:   var(--text-tertiary);
  --color-text-disabled:   var(--text-disabled);
  --color-text-on-accent:  var(--text-on-accent);
  --color-accent:          var(--accent);
  --color-accent-hover:    var(--accent-hover);
  --color-accent-pressed:  var(--accent-pressed);
  --color-accent-muted:    var(--accent-muted);
  --color-accent-ghost:    var(--accent-ghost);
  --color-success:         var(--success);
  --color-warning:         var(--warning);
  --color-error:           var(--error);
}
```

### 1.2 Fluid Type Scale

#### Tailwind `fontSize` config (v3 — drop into `tailwind.config.ts`)

```ts
fontSize: {
  // Display — fluid 375px → 1440px
  'display-2xl': ['clamp(4rem,   1.532rem + 6.573vw, 9rem)',      { lineHeight: '0.95', letterSpacing: '-0.04em'  }],
  'display-xl':  ['clamp(3rem,   1.127rem + 4.990vw, 7rem)',      { lineHeight: '1.0',  letterSpacing: '-0.035em' }],
  'display-lg':  ['clamp(2.25rem,0.964rem + 3.427vw, 5rem)',      { lineHeight: '1.0',  letterSpacing: '-0.03em'  }],
  // Headings — fluid
  'heading-xl':  ['clamp(2rem,   1.296rem + 1.878vw, 3.5rem)',    { lineHeight: '1.05', letterSpacing: '-0.025em' }],
  'heading-lg':  ['clamp(1.5rem, 1.031rem + 1.250vw, 2.5rem)',    { lineHeight: '1.1',  letterSpacing: '-0.02em'  }],
  'heading-md':  ['clamp(1.25rem,0.957rem + 0.783vw, 1.875rem)',  { lineHeight: '1.15', letterSpacing: '-0.015em' }],
  'heading-sm':  ['clamp(1.125rem,0.949rem + 0.469vw,1.5rem)',    { lineHeight: '1.2',  letterSpacing: '-0.01em'  }],
  // Body — subtle fluid
  'body-lg':     ['clamp(1.125rem,1.066rem + 0.157vw, 1.25rem)',  { lineHeight: '1.6',  letterSpacing: '-0.005em' }],
  'body-base':   ['clamp(1rem,   0.941rem + 0.157vw, 1.125rem)',  { lineHeight: '1.65', letterSpacing: '0em'      }],
  'body-sm':     ['clamp(0.9375rem,0.907rem + 0.08vw, 1rem)',     { lineHeight: '1.6',  letterSpacing: '0em'      }],
  // Fixed — UI elements never scale
  'label':       ['0.875rem',    { lineHeight: '1.2',  letterSpacing: '0.01em'  }],
  'caption':     ['clamp(0.75rem,0.721rem + 0.078vw,0.8125rem)',  { lineHeight: '1.4',  letterSpacing: '0.02em'  }],
  'micro':       ['0.6875rem',   { lineHeight: '1.4',  letterSpacing: '0.03em'  }],
},
letterSpacing: {
  display: '-0.04em',   'tight-xl': '-0.03em',  'tight-lg': '-0.02em',
  'tight-md': '-0.015em', 'tight-sm': '-0.01em', body: '0em',
  ui: '0.01em',  caps: '0.08em',
},
lineHeight: {
  display: '0.95', heading: '1.1', snug: '1.25',
  normal: '1.5',   reading: '1.65', loose: '1.8',
},
```

#### Hero / display quick reference

| Token | Clamp range | Weight | Tracking | Line-height |
|---|---|---|---|---|
| `display-2xl` | 64px → 144px | 600–700 | -0.04em | 0.95 |
| `display-xl` | 48px → 112px | 600–700 | -0.035em | 1.0 |
| `display-lg` | 36px → 80px | 600 | -0.03em | 1.0 |
| `heading-xl` | 32px → 56px | 600 | -0.025em | 1.05 |
| `heading-lg` | 24px → 40px | 600 | -0.02em | 1.1 |
| `body-base` | 16px → 18px | 400 | 0 | 1.65 |
| `label` | 14px fixed | 500 | +0.01em | 1.2 |

### 1.3 Spacing, Section Rhythm & Container Widths

```css
/* Section padding scale — use these ONLY, no arbitrary values */
--section-xs:  clamp(40px, 5vh,  64px);    /* footer, utility */
--section-sm:  clamp(64px, 8vh,  96px);    /* compact feature blocks */
--section-md:  clamp(80px, 10vh, 128px);   /* default — use 95% of time */
--section-lg:  clamp(120px,14vh, 192px);   /* hero, showcase */
--section-xl:  clamp(160px,18vh, 256px);   /* full-bleed editorial */

/* Container widths */
--container-main:   1280px;   /* all content max-width */
--container-wide:   1440px;   /* showcase, full editorial */
--container-prose:  768px;    /* blog, reading */
--container-narrow: 640px;    /* CTAs, single column */
--container-gutter: clamp(24px, 4vw, 64px);  /* responsive side padding */
```

Tailwind: `max-w-[1280px] mx-auto px-[clamp(24px,4vw,64px)]`

**Internal gaps (8px grid — multiples only):**

| Tailwind | px | Use |
|---|---|---|
| `gap-2` | 8px | icon + label |
| `gap-4` | 16px | within card |
| `gap-6` | 24px | headline → subtext |
| `gap-8` | 32px | subtext → CTA |
| `gap-12` | 48px | between card rows |
| `gap-16` | 64px | between sub-sections |
| `gap-24` | 96px | between major blocks |

### 1.4 Radius Scale

```css
--radius-none: 0;    /* editorial, hard crop */
--radius-xs:   3px;  /* chips, badges */
--radius-sm:   6px;  /* inputs */
--radius-md:   8px;  /* buttons — project default */
--radius-lg:   12px; /* cards, panels */
--radius-xl:   16px; /* large cards */
--radius-2xl:  24px; /* hero cards */
--radius-full: 9999px; /* pills, avatars */
```

Rule: container radius = 2× button radius (button `md=8px` → card `lg=12px`).

### 1.5 Shadow System

```css
/* Always pair cards with inset highlight + shadow (the trio) */
--shadow-card:   inset 0 1px 0 rgba(255,255,255,0.08),
                 0 4px 12px rgba(0,0,0,0.45);
--shadow-raised: inset 0 1px 0 rgba(255,255,255,0.08),
                 0 8px 32px rgba(0,0,0,0.50);
--shadow-glow:   0 0 0 1px rgba(255,255,255,0.06),
                 0 4px 24px rgba(var(--accent-rgb),0.15);
--shadow-float:  0 12px 48px rgba(0,0,0,0.50),
                 0 2px 8px rgba(0,0,0,0.35);
/* Accent button glow */
.btn-accent-glow {
  box-shadow:
    0 0 0 1px oklch(62% 0.18 250 / 0.15),
    0 2px 8px  oklch(62% 0.18 250 / 0.30),
    0 8px 32px oklch(62% 0.18 250 / 0.20);
}
.btn-accent-glow:hover {
  box-shadow:
    0 0 0 1px oklch(72% 0.18 250 / 0.20),
    0 2px 8px  oklch(72% 0.18 250 / 0.40),
    0 12px 40px oklch(72% 0.18 250 / 0.28);
  transform: translateY(-1px);
}
```

### 1.6 Motion Tokens — `lib/motion-tokens.ts`

```ts
import type { Transition } from "motion/react"

// ── Easings ────────────────────────────────────────────────────────
export const easeApple  = [0.25, 0.1,  0.25, 1] as [number,number,number,number]
export const easeSnap   = [0.16, 1,    0.3,  1] as [number,number,number,number]  // primary reveal
export const easeOut    = [0.0,  0.0,  0.2,  1] as [number,number,number,number]
export const easeMid    = [0.4,  0.0,  0.2,  1] as [number,number,number,number]
export const easeStripe = [0.2,  1,    0.2,  1] as [number,number,number,number]  // energetic

// GSAP string equivalents:
// easeSnap ≈ "power3.out"   easeApple ≈ "power2.inOut"   easeStripe ≈ "power2.out"

// ── Springs ───────────────────────────────────────────────────────
export const springPress:    Transition = { type:"spring", stiffness:500, damping:40,  mass:0.6 }
export const springHover:    Transition = { type:"spring", stiffness:300, damping:28,  mass:0.6 }
export const springMagnetic              = { damping:20,   stiffness:150, mass:0.5 }
export const springTilt:     Transition = { type:"spring", stiffness:400, damping:30,  mass:0.4 }
export const springPage:     Transition = { type:"spring", stiffness:260, damping:30,  mass:0.8 }
export const springDialog:   Transition = { type:"spring", stiffness:350, damping:28,  bounce:0.15 }

// ── Duration scale (seconds) ──────────────────────────────────────
export const dur = { xs:0.10, sm:0.18, md:0.28, lg:0.38, xl:0.55 } as const
// xs=micro/icon swap  sm=hover state  md=card hover  lg=panel/modal  xl=page/hero

// ── Stagger ───────────────────────────────────────────────────────
export const stag = { fast:0.04, normal:0.07, slow:0.12 } as const
// fast=tight lists  normal=card grids  slow=hero word reveals

// ── Viewport thresholds (whileInView) ────────────────────────────
export const vp = {
  once:   { once:true,  amount:0.15 },
  repeat: { once:false, amount:0.20 },
  half:   { once:true,  amount:0.50 },
} as const
```

**Duration rules:**

| Event | Duration | Notes |
|---|---|---|
| Hover in | 120–150ms | Feels instant |
| Hover out | 200–250ms | Slightly slower |
| Scroll reveal | 380–400ms | Snappy, not theatrical |
| Page transition | 280ms | Fade only |
| Hero entrance | 550ms | The longest allowed UI animation |
| Background gradient | 10–18s | Barely perceptible drift |

---

## 2. CANONICAL CODE PATTERNS

### 2.1 Font Setup — `app/fonts.ts`

```ts
// app/fonts.ts
import { Geist, Instrument_Serif } from 'next/font/google'
import localFont from 'next/font/local'

// Primary sans — body, UI, headings (Geist = Vercel rational linear sans)
export const fontSans = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',   // never omit — prevents FOIT
})

// Serif display — large headings ONLY when editorial pairing is desired
export const fontSerif = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  weight: '400',
})

// Optional: Satoshi via local font (download free from fontshare.com)
export const fontDisplay = localFont({
  src: [{ path: '../public/fonts/Satoshi-Variable.woff2', weight: '300 900', style: 'normal' }],
  variable: '--font-display',
  display: 'swap',
})
```

```tsx
// app/layout.tsx — apply variables to <html>, antialiased to <body>
import { fontSans, fontSerif } from './fonts'
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontSerif.variable}`}>
      <body className="font-sans antialiased bg-surface-base text-text-primary">
        {/* -webkit-font-smoothing: antialiased is mandatory — dark themes look blurry without it */}
        {children}
      </body>
    </html>
  )
}
```

**Font choice rule:**

| Mood | Display | Body |
|---|---|---|
| Tech / SaaS / AI | Geist 600–700 | Geist 400 |
| Editorial / Product | Instrument Serif 400 | Inter 400–500 |
| Bold / Agency | Satoshi 800–900 | Satoshi 400 |
| Monochrome Pro | Inter 800 | Inter 400 |

Max 2 families per project. Never import fonts inside component files — always from `app/fonts.ts`.

### 2.2 Lenis + GSAP ScrollTrigger Provider

```tsx
// components/SmoothScrollProvider.tsx
"use client";
import { useEffect, useRef } from "react";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);  // module scope, SSR-safe guard
}

export default function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<{ lenis?: { raf: (t: number) => void } }>(null);

  useEffect(() => {
    const update = (time: number) => lenisRef.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);  // REQUIRED — prevents catch-up jitter with Lenis
    ScrollTrigger.refresh();
    return () => gsap.ticker.remove(update);
  }, []);

  return (
    <ReactLenis root ref={lenisRef} options={{ lerp: 0.1, autoRaf: false, syncTouch: false }}>
      <RouteRefresh />
      {children}
    </ReactLenis>
  );
}
```

```tsx
// components/RouteRefresh.tsx — refresh ScrollTrigger on every route change
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function RouteRefresh() {
  const pathname = usePathname();
  useEffect(() => {
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [pathname]);
  return null;
}
```

Wrap `app/layout.tsx` body: `<SmoothScrollProvider>{children}</SmoothScrollProvider>`

**Lenis options:** `lerp: 0.1` = Apple-smooth (0.05 = ultra, 0.2 = responsive). `autoRaf: false` is critical — GSAP owns the RAF loop.

### 2.3 Reveal-on-Scroll Hook + Component

```tsx
// hooks/useScrollReveal.ts
"use client";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export type RevealVariant = "fade" | "slide-up" | "clip-up" | "clip-left";

export function useScrollReveal(
  variant: RevealVariant = "slide-up",
  options: { stagger?: number; duration?: number; start?: string; once?: boolean } = {}
) {
  const { stagger = 0.07, duration = 0.38, start = "top 88%", once = true } = options;
  const containerRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = containerRef.current?.querySelectorAll("[data-reveal]");
    if (!targets?.length) return;

    const from: gsap.TweenVars = reduced
      ? { opacity: 0 }
      : variant === "slide-up"  ? { opacity: 0, y: 48 }
      : variant === "clip-up"   ? { opacity: 0, clipPath: "inset(100% 0 0 0)", willChange: "clip-path,opacity" }
      : variant === "clip-left" ? { opacity: 0, clipPath: "inset(0 100% 0 0)", willChange: "clip-path,opacity" }
      : { opacity: 0 };

    const to: gsap.TweenVars = {
      opacity: 1,
      ...(variant === "slide-up"  ? { y: 0 } : {}),
      ...(variant === "clip-up"   ? { clipPath: "inset(0% 0 0 0)" } : {}),
      ...(variant === "clip-left" ? { clipPath: "inset(0 0% 0 0)" } : {}),
      duration, stagger, ease: "power3.out",
      onComplete() { gsap.set(this.targets(), { willChange: "auto", clearProps: "willChange" }); },
    };

    ScrollTrigger.batch(targets, {
      start,
      once,
      onEnter: (batch) => gsap.fromTo(batch, from, to),
    });
  }, { scope: containerRef });

  return containerRef;
}

// components/RevealList.tsx
export function RevealList({ variant, stagger, children, className }: {
  variant?: RevealVariant; stagger?: number; children: React.ReactNode; className?: string;
}) {
  const ref = useScrollReveal(variant, { stagger });
  return <div ref={ref as React.RefObject<HTMLDivElement>} className={className}>{children}</div>;
}
// Usage: <RevealList variant="slide-up"><div data-reveal>A</div><div data-reveal>B</div></RevealList>
```

### 2.4 Framer Motion Reveal Component

```tsx
// components/ui/Reveal.tsx  — simpler single-element reveal
"use client";
import { motion, useReducedMotion } from "motion/react";
import { easeSnap, dur, vp } from "@/lib/motion-tokens";

export function Reveal({ children, delay = 0, className }: {
  children: React.ReactNode; delay?: number; className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={vp.once}
      transition={{ duration: dur.lg, ease: easeSnap, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Stagger grid variant
export function StaggerGrid({ children, className }: {
  children: React.ReactNode[]; className?: string;
}) {
  const reduced = useReducedMotion();
  const container = { hidden: {}, show: { transition: { staggerChildren: stag.normal, delayChildren: 0.1 } } };
  const item = { hidden: { opacity:0, y:20, scale:0.97 }, show: { opacity:1, y:0, scale:1, transition: { duration: dur.lg, ease: easeSnap } } };
  return (
    <motion.ul variants={reduced ? {} : container} initial="hidden" whileInView="show" viewport={vp.once} className={className}>
      {children.map((child, i) => (
        <motion.li key={i} variants={reduced ? {} : item}>{child}</motion.li>
      ))}
    </motion.ul>
  );
}
```

### 2.5 CSS Animated Gradient Hero Background

Default hero background — works everywhere, zero JS, GPU-composited via `transform`. Use this unless product explicitly needs WebGL.

```css
/* globals.css */
.gradient-hero {
  position: relative;
  min-height: 100svh;   /* svh = mobile-safe */
  background: oklch(9% 0.010 250);
  overflow: hidden;
}

.gradient-hero::before {
  content: "";
  position: absolute;
  inset: -50%;
  width: 200%;
  height: 200%;
  background:
    radial-gradient(ellipse 80% 60% at 20% 30%, oklch(55% 0.12 250 / 0.55), transparent 65%),
    radial-gradient(ellipse 60% 80% at 80% 20%, oklch(60% 0.10 230 / 0.45), transparent 60%),
    radial-gradient(ellipse 70% 50% at 50% 80%, oklch(50% 0.08 270 / 0.40), transparent 55%),
    radial-gradient(ellipse 50% 70% at 10% 70%, oklch(58% 0.12 240 / 0.35), transparent 60%);
  animation: gradient-shift 18s ease-in-out infinite alternate;
  will-change: transform;  /* compositor layer — zero repaint cost */
}

.gradient-hero::after {
  content: "";
  position: absolute;
  inset: 0;
  /* SVG fractal noise kills gradient banding — looks shader-grade */
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px 256px;
  pointer-events: none;
  opacity: 0.5;
}

@keyframes gradient-shift {
  0%   { transform: translate(0%,   0%)   rotate(0deg);    }
  25%  { transform: translate(-3%,  4%)   rotate(1.5deg);  }
  50%  { transform: translate(4%,  -2%)   rotate(-1deg);   }
  75%  { transform: translate(-2%, -4%)   rotate(2deg);    }
  100% { transform: translate(3%,   3%)   rotate(-0.5deg); }
}

@media (prefers-reduced-motion: reduce) {
  .gradient-hero::before { animation: none; }
}
```

For a Framer Motion / React color-cycling variant:

```tsx
// components/AuroraHero.tsx
"use client";
import { useEffect } from "react";
import { motion, useMotionTemplate, useMotionValue, animate, useReducedMotion } from "motion/react";

const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#059669"];

export function AuroraHero({ children }: { children: React.ReactNode }) {
  const color = useMotionValue(COLORS[0]);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const controls = animate(color, COLORS, { ease:"easeInOut", duration:10, repeat:Infinity, repeatType:"mirror" });
    return controls.stop;
  }, [reduced]);

  const bg = useMotionTemplate`radial-gradient(125% 125% at 50% 0%, oklch(9% 0.010 250) 50%, ${color})`;

  return (
    <motion.section style={{ background: bg }} className="relative min-h-[100svh]">
      {children}
    </motion.section>
  );
}
```

### 2.6 Magnetic Button

```tsx
// components/ui/MagneticButton.tsx
"use client";
import { useRef, useCallback } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react";
import { springMagnetic } from "@/lib/motion-tokens";

const MAX_PULL = 0.35;  // 35% of element size — sweet spot; below 0.2 feels broken, above 0.6 feels silly

export function MagneticButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, springMagnetic);
  const sy = useSpring(y, springMagnetic);

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current || reduced) return;
    const { left, top, width, height } = ref.current.getBoundingClientRect();
    x.set((e.clientX - left - width / 2) * MAX_PULL);
    y.set((e.clientY - top - height / 2) * MAX_PULL);
  }, [x, y, reduced]);

  const onLeave = useCallback(() => { x.set(0); y.set(0); }, [x, y]);

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy, display: "inline-block" }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

### 2.7 `prefers-reduced-motion` Strategy

**Framer Motion (global — in `app/layout.tsx`):**
```tsx
import { MotionConfig } from "motion/react";
// Wraps entire app — auto-disables all durations when user prefers reduced motion
<MotionConfig reducedMotion="user">{children}</MotionConfig>
```

**CSS (in `globals.css` — for non-Framer animations):**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**GSAP (in every animation that uses gsap.matchMedia):**
```ts
const mm = gsap.matchMedia();
mm.add({ reduceMotion: "(prefers-reduced-motion: reduce)" }, (ctx) => {
  if (ctx.conditions!.reduceMotion) {
    gsap.set(targets, { opacity: 1, y: 0, scale: 1, clearProps: "all" });
    return;
  }
  // ... full animation
});
return () => mm.revert();
```

**Rule:** reduced-motion users still see the final animated state (content visible, layout intact). Only motion is removed, never content.

### 2.8 Page Transitions

```tsx
// app/template.tsx  — remounts on every navigation (NOT layout.tsx)
"use client";
import { motion } from "motion/react";
import { easeSnap, dur } from "@/lib/motion-tokens";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: dur.xl, ease: easeSnap }}
    >
      {children}
    </motion.div>
  );
}
```

---

## 3. HERO RECIPES

### Decision table — pick ONE per project

| Product type | Hero pattern | Why |
|---|---|---|
| App with ONE sharp tagline | **Kinetic Type** | Message is the visual |
| Product with strong UI/screenshot | **Split Editorial** | Visual + copy equal billing |
| SaaS with complex feature walkthrough | **Scroll-Scrubbed Reveal** | Discovery over time |
| AI / abstract / creative product | **Animated Gradient** | Warmth before reading |
| Hardware / lifestyle / film | **Full-Bleed Image/Video** | Photograph carries conversion |

### Hero A — Kinetic Type

```
Structure: 100svh · centered column · headline (display-xl/2xl) · sub (body-lg) · CTA row
Motion: GSAP SplitText OR per-char Framer stagger (stagger: 0.04s per char)
Rule: <30 chars = char stagger; ≥30 chars = word stagger (stagger: 0.07s per word)
Layout: max-w-[1280px] mx-auto px-[clamp(24px,4vw,64px)]
```

### Hero B — Animated Gradient (Default)

```
Structure: 100svh · .gradient-hero (see §2.5) · content z-1 centered
Text: always light on dark gradient — min 4.5:1. Add text-shadow: 0 1px 20px rgba(0,0,0,0.4) if needed.
Motion: headline fade-up 0.55s easeSnap; sub delay 0.12s; CTA delay 0.22s
```

### Hero C — Split Editorial (5/7 or 7/5)

```css
.hero-grid { @apply grid grid-cols-12 gap-x-6 items-center min-h-[100svh] pt-[120px] pb-20; }
.hero-copy { @apply col-span-12 lg:col-span-5; }
.hero-visual { @apply col-span-12 lg:col-span-7 lg:-mr-[5vw]; }
```

```
Motion: left col stagger y:24→0, opacity sequence (eyebrow 0 / headline 0.12 / body 0.22 / CTA 0.34)
        right col: x:60→0, opacity:0→1, delay:0.10, duration:0.9
Visual: max-w-[640px], border border-white/8, rounded-lg, shadow-float, perspective(1200px) rotateX(4deg)
```

### Hero D — Scroll-Scrubbed Reveal

```ts
const tl = gsap.timeline({ scrollTrigger: {
  trigger: ".product-section", pin: true, anticipatePin: 1,
  scrub: 1,       // NEVER scrub:true (boolean) — always use a number
  start: "top top", end: "+=200%", invalidateOnRefresh: true,
}});
tl.from(".product-img", { opacity:0, scale:0.85, duration:1 })
  .from(".caption-2",    { opacity:0, y:30,      duration:0.5 }, 0.8);
// Disable pin below 768px — iOS Safari pinning is unreliable
```

### Hero E — Full-Bleed Video/Image

```html
<section class="relative min-h-[100svh] overflow-hidden">
  <video autoplay muted loop playsinline class="absolute inset-0 w-full h-full object-cover object-center" />
  <!-- ALL FOUR video attributes are required — missing one breaks mobile -->
  <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />
  <div class="absolute bottom-[clamp(40px,6vh,100px)] left-[10%] max-w-[640px]">
    <!-- eyebrow + headline + CTA -->
  </div>
</section>
```

---

## 4. SECTION SEQUENCING & LAYOUT

### Canonical landing page order

| # | Section | Energy | Padding | Background | Motion |
|---|---|---|---|---|---|
| 1 | **Hero** | Max tension | `section-lg` | Custom (gradient/video) | Complex entrance |
| 2 | **Social Proof** | Quiet exhale | `section-xs` | Same as hero OR flat | Logo fade-in, no drama |
| 3 | **Problem/Fit** | Building | `section-sm` | Light or near-white | Staggered reveal |
| 4 | **Features** | Methodical | `section-md` | Alternating light/dark | Scroll-triggered per block |
| 5 | **Showcase** | Climax | `section-xl` | Dark full-bleed | Scroll-scrubbed |
| 6 | **Specs/Details** | Cool technical | `section-sm` | White, clean | Minimal |
| 7 | **Second CTA** | Closing urgency | `section-md` | Brand or black | Simple fade |
| 8 | **Footer** | Resolved | fixed | Darkest surface | None |

### Layout rules

- **Never two consecutive sections with the same background.** Light → dark → light → dark minimum.
- Background can always be full-bleed (`100vw`). Readable content never exceeds `1280px`.
- One section per page must **break the container** — bleeds past edge or uses offset columns.
- Odd splits (5/7, 4/8) create more visual tension than 6/6.
- Section transitions: gradient feather or overlap. Never hard cuts.
- Each section uses `section-md` padding by default. Drop to `section-sm` below `768px`.
- Feature grids: 3-col max. 4-col reads as spec sheet.
- 40% of each section's height should be "empty" — negative space signals quality.

### Bento grid pattern (asymmetric, mandatory)

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <div className="lg:col-span-2 rounded-xl border border-white/10 bg-surface-raised p-6">...</div>
  <div className="rounded-xl border border-white/10 bg-surface-raised p-6">...</div>
  <div className="rounded-xl border border-white/10 bg-surface-raised p-6">...</div>
  <div className="lg:col-span-2 rounded-xl border border-white/10 bg-surface-raised p-6">...</div>
</div>
```

Equal-size bento grids are an anti-pattern — asymmetry is the signal of craft.

---

## 5. COMPONENT CRAFT

### 5.1 Button

```tsx
// Primary
className="relative inline-flex items-center justify-center gap-2
  h-9 px-4 rounded-[var(--radius-md)]
  bg-[var(--accent)] text-[var(--text-on-accent)]
  font-medium text-sm tracking-[-0.01em]
  [box-shadow:var(--shadow-card)]
  border border-[rgba(255,255,255,0.12)]
  transition-all duration-150 ease-out
  hover:brightness-110 hover:[box-shadow:var(--shadow-glow)]
  active:scale-[0.97] active:brightness-95
  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]
  disabled:opacity-40 disabled:pointer-events-none"

// Secondary
className="... bg-[var(--surface-raised)] text-[var(--text-primary)]
  border border-[var(--border-default)]
  hover:bg-[var(--surface-overlay)] hover:border-[var(--border-moderate)]"

// Ghost
className="... bg-transparent text-[var(--text-secondary)] border border-transparent
  hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
```

Framer Motion: `whileHover={{ scale:1.02, transition: springHover }}` + `whileTap={{ scale:0.97, transition: springPress }}`

### 5.2 Card

```tsx
// Standard card — always use the token trio: border + inset highlight + shadow
<motion.div
  className="rounded-[var(--radius-lg)] p-5
    bg-[var(--surface-raised)] border border-[var(--border-default)]
    [box-shadow:var(--shadow-card)]
    transition-colors duration-150
    hover:bg-[var(--surface-overlay)] hover:border-[var(--border-moderate)]"
  whileHover={{ y: -2, boxShadow: "var(--shadow-raised)" }}
  transition={{ type:"spring", stiffness:300, damping:28 }}
>

// Glow border card (feature cards, bento items)
<div className="rounded-xl border border-white/8 bg-surface-raised p-6
  transition-shadow duration-200
  hover:shadow-[0_0_0_1px_rgba(var(--accent-rgb),0.35),0_0_24px_4px_rgba(var(--accent-rgb),0.08)]">

// Shimmer border card (hero feature highlight)
// background: linear-gradient(surface, surface) padding-box,
//             linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.03), rgba(255,255,255,0.10)) border-box;
// border: 1px solid transparent;
```

Card hover lift: `y: -2px` max. More is cartoonish.

### 5.3 Navigation

```tsx
"use client";
import { useScroll, useMotionValueEvent } from "motion/react";
import { useState } from "react";

export function Nav({ children }: { children: React.ReactNode }) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  // useMotionValueEvent reads MotionValue directly — zero re-renders per frame
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 16));

  return (
    <header className={`
      fixed top-0 inset-x-0 z-50 h-14 px-[clamp(24px,4vw,64px)]
      flex items-center justify-between
      transition-all duration-300
      ${scrolled
        ? "bg-[var(--surface-base)]/85 backdrop-blur-md border-b border-[var(--border-subtle)]"
        : "bg-transparent"}
    `}>
      {children}
    </header>
  );
}
```

Nav tokens: height `h-14` (56px), logo `h-6` (24px), links `text-sm font-medium`, active link via `layoutId` spring indicator.

### 5.4 Footer

```tsx
<footer className="pt-16 pb-12 border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
  <div className="max-w-[1280px] mx-auto px-[clamp(24px,4vw,64px)]">
    {/* logo row */}
    {/* link columns: gap-12 between groups, gap-2 within */}
    {/* copyright: text-xs text-[var(--text-tertiary)] */}
  </div>
</footer>
```

Footer background: `surface-sunken` (darkest) or `surface-base`. Never a different hue from the page.

### 5.5 Atmosphere effects (copy-paste)

```css
/* Hero radial glow behind heading */
.hero-glow::before {
  content: ''; position: absolute;
  top: -25%; left: 50%; transform: translateX(-50%);
  width: min(800px, 100vw); height: 500px; border-radius: 50%;
  background: radial-gradient(ellipse at center, var(--hero-glow) 0%, transparent 68%);
  pointer-events: none; z-index: 0;
}

/* Glass surface */
.glass {
  background: oklch(17% 0.010 250 / 0.70);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid var(--border-default);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px oklch(5% 0.010 250 / 0.40);
}
/* Max 3 glass elements per viewport. blur(12–20px) sweet spot. Never blur > 20px mobile. */

/* Grain texture — kills banding, feels tactile */
.grain::after {
  content: ''; position: fixed; inset: 0; opacity: 0.04;
  pointer-events: none; z-index: 999; filter: url(#grain-filter);
}
/* Add hidden SVG with <feTurbulence baseFrequency="0.65" numOctaves="4"> to DOM */

/* Section gradient bridge (dark → light seam, no hard cut) */
.section-light::before {
  content: ''; display: block; height: 120px; margin-top: -120px;
  background: linear-gradient(to bottom, oklch(9% 0.010 250), oklch(98% 0.003 250));
  pointer-events: none;
}

/* Vignette */
.vignette::after {
  content: ''; position: fixed; inset: 0;
  background: radial-gradient(ellipse 110% 90% at 50% 50%, transparent 55%, oklch(5% 0.010 250 / 0.55) 100%);
  pointer-events: none; z-index: 9;
}
```

---

## 6. WEBGL / 3D RULES

Default: **use the CSS gradient hero (§2.5)**. WebGL only when product explicitly needs it.

| Product | Use | Skip |
|---|---|---|
| AI / infra / devtools | CSS gradient or shader plane | Particle fields |
| Hardware / physical | Scroll-linked model rotation | Multiple meshes |
| Creative agency | Full WebGL scene | — |
| B2B SaaS conversion | CSS gradient ONLY | Any R3F |
| Mobile-first | CSS gradient ONLY | All canvas |

**WebGL mandatory guardrails (ALL must be present):**

```tsx
// 1. Always dynamic import with ssr:false — Three.js crashes Node
const HeroCanvas = dynamic(
  () => import("@/components/HeroCanvas").then(m => m.HeroCanvas),
  { ssr: false, loading: () => <div className="gradient-hero" /> }
);

// 2. DPR cap — never omit
<Canvas dpr={[1, 1.5]} gl={{ antialias:false, powerPreference:"low-power", depth:false, stencil:false }}>

// 3. Pause when offscreen + tab hidden
const observer = new IntersectionObserver(([e]) => setFrameloop(e.isIntersecting ? "always" : "never"), { threshold:0.01 });
document.addEventListener("visibilitychange", () => setFrameloop(document.hidden ? "never" : "always"));

// 4. PerformanceMonitor with degradation
<PerformanceMonitor onDecline={() => { setDpr([1,1]); setCount(n => Math.floor(n * 0.4)); }}>

// 5. WebGL + reduced-motion fallback
if (!hasWebGL() || prefersReducedMotion) return <div className="gradient-hero" />;
```

Never put `three` in the initial JS bundle. Verify with `next build --analyze`.

---

## 7. PERFORMANCE & CORE WEB VITALS

### Compositor contract — animatable properties only

| Safe (GPU composited) | Forbidden (triggers layout) |
|---|---|
| `transform` (x, y, scale, rotate, skew) | `top`, `left`, `width`, `height` |
| `opacity` | `padding`, `margin`, `border-width` |
| `clip-path` | `font-size`, `line-height` |
| `filter` (on own layer) | Colors on gradient backgrounds |

**Framer Motion:** use `x`, `y`, `scale`, `rotate`, `opacity`. Never `width`/`height` — use `layout` prop for size transitions.

**GSAP:** use `x`, `y`, `scale`, `rotate`, `opacity`, `clipPath`. Use `gsap.quickSetter` for per-frame writes in `onUpdate`.

### Core Web Vitals targets

**LCP ≤ 2.5s:**
```tsx
// Hero image: priority + explicit dimensions + sizes
<Image src="/hero.jpg" alt="..." width={1200} height={680}
  priority sizes="(max-width:768px) 100vw, 1200px"
  placeholder="blur" blurDataURL={blurDataURL}
  className="w-full h-auto object-cover" />
// Only ONE priority image per page (the actual LCP candidate)
```

**CLS ≤ 0.1:**
- Reserve space with `min-h-[...]` + `Suspense` fallback at exact final dimensions
- Entrance animations: `opacity` + `translateY` from inside reserved bounding box
- Fonts via `next/font` only (auto-generates `size-adjust` for fallback metric matching)

**INP ≤ 200ms:**
```tsx
// Wrap route changes in startTransition — marks navigation as non-urgent
const [isPending, startTransition] = useTransition();
const handleNav = () => startTransition(() => router.push("/new"));
```

### Bundle discipline

```tsx
// LazyMotion — reduces Framer bundle from ~34KB to ~15KB
import { LazyMotion, domAnimation, m } from "motion/react";
<LazyMotion features={domAnimation}>{children}</LazyMotion>
// Use m.div instead of motion.div in components

// GSAP plugins: register at module scope inside "use client" files only
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);  // NEVER inside useEffect

// Dynamic import for heavy below-fold components
const Heavy = dynamic(() => import("@/components/Heavy"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,  // exact dimensions prevent CLS
});
```

---

## 8. ACCESSIBILITY

### Non-negotiable checklist (every page)

**Root layout requirements:**
```tsx
// MotionConfig at root for global reduced-motion
<MotionConfig reducedMotion="user">

// Skip link — must be first focusable element
<a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100]
  focus:px-4 focus:py-2 focus:rounded-md focus:bg-[var(--accent)] focus:text-[var(--text-on-accent)]">
  Skip to main content
</a>

// Semantic landmarks
<header>  <nav aria-label="Main navigation">  <main id="main-content">  <footer>
```

**Focus rings — no bare `outline: none`:**
```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
:focus:not(:focus-visible) { outline: none; }
```

For inputs: `focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),0.18)]` (glow ring, not hard outline).

**Contrast requirements:**
- Body text: ≥ 4.5:1 (`--text-primary` and `--text-secondary` pass)
- `--text-tertiary`: 18px+ or large-text (non-critical UI only)
- `--text-disabled`: decorative only, never informational
- Interactive elements: ≥ 3:1

**Image alt text:**
```tsx
<Image alt="Descriptive text" />                  // meaningful image
<Image alt="" role="presentation" />              // decorative
<button aria-label="Close"><XIcon aria-hidden="true" /></button>  // icon-only
<button><XIcon aria-hidden="true" /><span>Close</span></button>   // icon + label
```

**Animated content:**
- Split text (chars/words): `aria-label={fullText}` on parent, `aria-hidden="true"` on individual spans
- Status badges: `motion-safe:animate-pulse` (Tailwind) — respects reduced-motion automatically
- Toast: `role="status"` (polite) for confirmations, `role="alert"` (assertive) for errors
- Modals: `focus-trap-react`, return focus to trigger on close, `inert` on off-screen panels

**Keyboard operability:**
- Tab order: natural DOM order, no positive `tabIndex`
- Dropdowns: Arrow keys navigate, Escape closes, Enter/Space selects
- Modals: focus trapped inside while open
- No scroll-snap that traps users on trackpad momentum scroll

---

## 9. TSCONFIG RULES

```jsonc
// REQUIRED settings for Next.js builds
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }

    // NEVER enable these — they break builds:
    // "exactOptionalPropertyTypes": true    ← breaks Next.js internals
    // "noUncheckedIndexedAccess": true      ← breaks array access patterns
  }
}
```

---

## 10. ANTI-PATTERNS (never do)

| Anti-pattern | Why | Fix |
|---|---|---|
| `scrub: true` (boolean) in GSAP | Jittery, no lag | Always `scrub: 1` or `scrub: 1.5` |
| Multiple overlapping ScrollTriggers on same pinned section | Conflicts | One timeline, one trigger |
| `will-change` in permanent CSS | Forces compositor layers forever, degrades VRAM | Set in `fromVars`, clear in `onComplete` |
| `import * as THREE from 'three'` | 600KB+ in initial bundle | Tree-shake: `import { WebGLRenderer, Scene } from 'three'` |
| `useState` + scroll event listener | Re-renders every frame | `useMotionValueEvent` or GSAP `onUpdate` |
| `backdrop-filter` on animated elements | Expensive repaint | Keep glass elements static |
| More than 3 glass elements per viewport | GPU cost stacks | Pick 1–2 max |
| Pure `#000000` / `#ffffff` backgrounds | Harsh edges, amateur feel | Use `surface-base` / `surface-raised` tokens |
| White borders without alpha | Never adapts to background | `rgba(255,255,255,0.10)` always |
| Drop shadows for dark-theme elevation | Invisible on dark surfaces | Luminance stepping (surface ladder) |
| Inter / Montserrat as display face | Generic, overused | Geist, Satoshi, or Instrument Serif for display |
| Parallax without compositional layers | Depth lie, disorienting | Only parallax if layers are photographically separate |
| Equal-size bento grids | Looks like a template | Always asymmetric: one card spans 2 cols |
| `@media (max-width:768px)` font-size patches | Not fluid | `clamp()` handles all breakpoints |
| `pin: true` on mobile | iOS Safari unreliable | `gsap.matchMedia()` — disable below 768px |
| WebGL in initial JS bundle | Kills LCP | `dynamic({ ssr:false })` always |
| Custom cursor > 80px | Obscures content | Cap at 60px, max 2 states |
| Preloader > 2s (or not gated on real assets) | Users see through fake counts | Gate on `Promise.all([...imageLoads, document.fonts.ready])` |
| Stagger > 0.12s between items | Cascade feels like lag | Cap at `stag.slow = 0.12s` |
| Five things animating in the same viewport | Eye has nowhere to land | One animation event per viewport scroll depth |
| `exactOptionalPropertyTypes: true` in tsconfig | Breaks Next.js build | Never enable |
| Stubs / lorem / placeholder content | Build agent rule | Real copy everywhere, always |

---

## APPENDIX: Z-INDEX LAYERS

```
0   background canvas (WebGL, video)
1   background decorative (shapes, gradient pseudo-elements)
10  content
20  sticky elements (nav, scroll progress bar)
30  popovers, dropdowns
40  modals, overlays, backdrops
50  tooltips
100 skip link (focus only)
9999 loading screen / preloader
```

## APPENDIX: Install commands

```bash
npm install gsap lenis @gsap/react motion
npm install next @types/react @types/node typescript
# Optional 3D:
npm install @react-three/fiber @react-three/drei three
npm install @types/three
```

## APPENDIX: Quick glow card (one-liner)

```tsx
// Feature card with accent glow on hover — copy-paste ready
<div className="rounded-xl border border-white/[0.08] bg-[var(--surface-raised)] p-6
  transition-shadow duration-200 ease-out
  hover:shadow-[0_0_0_1px_rgba(var(--accent-rgb),0.35),0_0_24px_4px_rgba(var(--accent-rgb),0.08)]">
```
