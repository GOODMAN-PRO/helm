# Components, Performance & Accessibility Playbook
> Next.js 15 · Tailwind CSS v4 · Framer Motion (Motion for React) · 2026

---

## PART 1 — Component Craft

### 1.1 Design Token Foundation

Define these tokens once in `globals.css` as CSS custom properties, reference them everywhere. Never hardcode values.

#### Radius Scale
```css
--radius-none:  0px;
--radius-xs:    3px;   /* micro chips, badges */
--radius-sm:    6px;   /* inputs, secondary buttons */
--radius-md:    8px;   /* primary buttons, cards */
--radius-lg:    12px;  /* panels, modals, drawers */
--radius-xl:    16px;  /* bottom sheets, feature cards */
--radius-2xl:   24px;  /* hero cards, large modals */
--radius-full:  9999px; /* pills, avatars, toggles */
```

Rule: pick **one radius personality** per project. Helm is sharp-but-refined — use `--radius-md` as the base for interactive elements and `--radius-lg` for containers.

#### Shadow System (dark-mode-first)
Shadows are nearly invisible on dark surfaces. Use luminance elevation instead — surfaces step lighter as they rise — plus a single inset highlight line on top.

```css
/* Surface elevation (HSL relative to base --color-bg-base) */
--surface-0:    hsl(222 14% 9%);   /* page base */
--surface-1:    hsl(222 14% 12%);  /* cards, sidebars */
--surface-2:    hsl(222 14% 15%);  /* nested cards, hover */
--surface-3:    hsl(222 14% 19%);  /* modals, popovers */
--surface-4:    hsl(222 14% 22%);  /* tooltips, top-layer */

/* Drop shadows (used sparingly, accent-tinted for depth signal) */
--shadow-sm:    0 1px 2px 0 rgba(0,0,0,0.4);
--shadow-md:    0 4px 12px 0 rgba(0,0,0,0.45), 0 1px 3px 0 rgba(0,0,0,0.3);
--shadow-lg:    0 8px 32px 0 rgba(0,0,0,0.5), 0 2px 8px 0 rgba(0,0,0,0.35);
--shadow-glow:  0 0 0 1px rgba(255,255,255,0.06), 0 4px 24px 0 rgba(var(--accent-rgb),0.15);

/* Inset highlight — the premium "raised edge" trick */
--highlight-inset: inset 0 1px 0 0 rgba(255,255,255,0.08);
```

#### Border Opacity Scale
```css
--border-subtle:   rgba(255,255,255,0.06);   /* dividers, lowest hierarchy */
--border-default:  rgba(255,255,255,0.10);   /* cards, inputs at rest */
--border-moderate: rgba(255,255,255,0.16);   /* cards on hover */
--border-strong:   rgba(255,255,255,0.24);   /* active inputs, focus */
--border-accent:   rgba(var(--accent-rgb),0.40); /* active states */
```

#### Color Tokens (Helm dark base)
```css
--color-bg-base:   hsl(222 14% 9%);
--color-text-primary:   hsl(220 15% 92%);   /* NOT #fff — reduces glare */
--color-text-secondary: hsl(220 10% 60%);
--color-text-muted:     hsl(220 8%  40%);
--color-accent:         hsl(245 90% 68%);   /* brand indigo-violet */
--accent-rgb:           104, 90, 250;       /* for rgba() usage */
--color-destructive:    hsl(0 80% 60%);
--color-success:        hsl(150 60% 48%);
```

---

### 1.2 The Premium Button Recipe

Three tiers: **Primary** (filled, accent), **Secondary** (outlined, surface-raised), **Ghost** (text-level, surface on hover).

#### Anatomy (every button)
- `px-4 py-2` for default · `px-5 py-2.5` for large · `px-3 py-1.5` for small
- `min-w-[88px]` — never let a button shrink to its icon only without a label
- `h-9` (36px) default · `h-10` (40px) large · `h-7` (28px) small
- `gap-2` between icon and label
- Icon: `16px` at default size, `1.5px` stroke weight (use Lucide or Phosphor, never mix)
- `font-medium text-sm tracking-[-0.01em]`
- `rounded-[var(--radius-md)]` (8px)
- `select-none cursor-pointer`
- `transition-all duration-150 ease-out` — 150ms is the fastest humans register as intentional

#### Primary Button
```tsx
className={`
  relative inline-flex items-center justify-center gap-2
  h-9 px-4 rounded-[var(--radius-md)]
  bg-[var(--color-accent)] text-white
  font-medium text-sm tracking-[-0.01em]
  shadow-[var(--shadow-md)] [box-shadow:var(--highlight-inset),var(--shadow-md)]
  border border-[rgba(255,255,255,0.12)]
  transition-all duration-150 ease-out
  hover:brightness-110 hover:shadow-[var(--shadow-glow)]
  active:scale-[0.97] active:brightness-95
  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-[var(--color-accent)]
  disabled:opacity-40 disabled:pointer-events-none
`}
```

**The micro-lift on hover:** `hover:shadow-[var(--shadow-glow)]` adds the accent glow; `brightness-110` brightens instead of darkening (common mistake). `active:scale-[0.97]` gives tactile press feel without overshooting.

#### Secondary Button
```tsx
className={`
  ... bg-[var(--surface-1)] text-[var(--color-text-primary)]
  border border-[var(--border-default)]
  hover:bg-[var(--surface-2)] hover:border-[var(--border-moderate)]
  active:scale-[0.97]
  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-[var(--color-accent)]
`}
```

#### Ghost Button
```tsx
className={`
  ... bg-transparent text-[var(--color-text-secondary)]
  border border-transparent
  hover:bg-[var(--surface-1)] hover:text-[var(--color-text-primary)]
  hover:border-[var(--border-subtle)]
  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-[var(--color-accent)]
`}
```

#### Framer Motion wrapper (apply to ALL buttons)
```tsx
import { motion } from "motion/react";

const MotionButton = motion.button;

// Prop set — reuse everywhere:
const buttonMotion = {
  whileHover: { scale: 1.02 },
  whileTap:   { scale: 0.97 },
  transition: { type: "spring", stiffness: 400, damping: 30 },
};
```

Never animate `width`, `height`, or `padding` — compositor-only. Spring `stiffness: 400, damping: 30` is snappy without being violent.

---

### 1.3 Cards

Cards are the fundamental surface unit. Dark theme rule: **never float a card with a shadow alone** — use border + shadow + inset highlight together.

#### Card Token Trio (always applied together)
```css
background: var(--surface-1);
border: 1px solid var(--border-default);
box-shadow: var(--highlight-inset), var(--shadow-md);
```

#### Hover Lift Card
```tsx
<motion.div
  className={`
    rounded-[var(--radius-lg)] p-5
    bg-[var(--surface-1)] border border-[var(--border-default)]
    [box-shadow:var(--highlight-inset),var(--shadow-md)]
    cursor-pointer transition-colors duration-150
    hover:bg-[var(--surface-2)] hover:border-[var(--border-moderate)]
  `}
  whileHover={{ y: -2, boxShadow: "0 8px 32px 0 rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)" }}
  transition={{ type: "spring", stiffness: 300, damping: 28 }}
>
```

The `y: -2` lift + enhanced shadow is the premium hover signal. Keep it at **-2px max** — more is cartoonish.

#### Glassmorphic / Frosted Card (use sparingly — hero sections only)
```css
background: rgba(255,255,255,0.04);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
border: 1px solid rgba(255,255,255,0.08);
box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.08);
```

Performance note: `backdrop-filter: blur()` triggers a new compositor layer. Limit to **≤3 glassmorphic elements per viewport**. Never blur >12px on mobile.

---

### 1.4 Navigation / Header

Sticky, scroll-aware, blur-on-scroll is now table stakes — implement it correctly.

```tsx
"use client";
import { useScroll, useMotionValueEvent } from "motion/react";
import { useState } from "react";

export function Header() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 16);
  });

  return (
    <header className={`
      sticky top-0 z-50 h-14
      transition-all duration-300
      ${scrolled
        ? "bg-[var(--color-bg-base)]/80 backdrop-blur-md border-b border-[var(--border-subtle)]"
        : "bg-transparent"
      }
    `}>
```

- Use `useMotionValueEvent` — **not** a React state listener on `scroll` events. It reads directly from the MotionValue without triggering re-renders on every frame.
- `bg-[var(--color-bg-base)]/80` with `backdrop-blur-md` is the canonical "frosted nav" look.
- Height: `h-14` (56px) — consistent with iOS 18 system patterns users already know.
- Logo: vertically centered, `h-6` (24px) tall.
- Nav links: `text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-150`.

---

### 1.5 Badges and Pills

```tsx
// Semantic badge
<span className={`
  inline-flex items-center gap-1
  h-5 px-2 rounded-[var(--radius-full)]
  text-[11px] font-semibold uppercase tracking-[0.06em]
  bg-[var(--color-accent)]/15 text-[var(--color-accent)]
  border border-[var(--color-accent)]/25
`}>

// Status dot + label
<span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
  Online
</span>
```

Rules:
- `text-[11px]` badges — always `font-semibold uppercase tracking-[0.06em]`. Lowercase badges at this size read as body text noise.
- Status dots: `w-1.5 h-1.5` (6px). Smaller than that is invisible on non-retina.
- `animate-pulse` on "live" indicators — but wrap in `motion-safe:animate-pulse` (see Part 2).

---

### 1.6 Inputs and Forms

The form focus state is where most premium sites fall apart — it's the most frequently interacted-with element.

```tsx
<input className={`
  w-full h-9 px-3
  rounded-[var(--radius-sm)]
  bg-[var(--surface-1)]
  border border-[var(--border-default)]
  text-sm text-[var(--color-text-primary)]
  placeholder:text-[var(--color-text-muted)]
  transition-all duration-150
  hover:border-[var(--border-moderate)]
  focus:outline-none focus:border-[var(--border-accent)]
  focus:bg-[var(--surface-2)]
  focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),0.18)]
`} />
```

The focus **glow ring** (`box-shadow: 0 0 0 3px rgba(accent, 0.18)`) is the premium signal — NOT a hard `outline`. It reads as "system selected this" not "browser default." Always combine with `focus:outline-none`.

Label best practice:
- Labels above inputs, never placeholder-as-label.
- `text-xs font-medium text-[var(--color-text-secondary)] mb-1.5`
- For error state: `border-[var(--color-destructive)] focus:[box-shadow:0_0_0_3px_rgba(destructive-rgb,0.20)]`

---

### 1.7 Footer

Footers often feel cheap because they're under-spaced and under-contrasted.

```
pt-16 pb-12 border-t border-[var(--border-subtle)]
```

- Background: `var(--surface-0)` — same as page base or one step below. Never a different hue.
- Copyright text: `text-xs text-[var(--color-text-muted)]`
- Link columns: `text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]`
- Column gap: `gap-12` between link groups, `gap-2` between items in a column
- Max-width: same container as main content (`max-w-6xl mx-auto px-6`)

---

### 1.8 The Details That Separate Good from Great

| Detail | Wrong | Right |
|---|---|---|
| Radius consistency | Mixed 4px / 8px / 12px | One system; containers = 2× button radius |
| Border on dark card | No border, just shadow | Border + inset highlight + shadow (the trio) |
| Icon sizing | `w-5 h-5` everywhere | `w-4 h-4` (16px) inline, `w-5 h-5` (20px) standalone |
| Icon stroke | Mixed 1px / 2px | Locked to `1.5px` (Lucide default is fine) |
| Hover on links | `underline` | `text-[var(--color-text-primary)] transition-colors` |
| Active state | None | `scale-[0.97]` on press (all clickable elements) |
| Focus ring | `outline: none` or browser blue ring | Custom glow: `0 0 0 3px rgba(accent, 0.2)` |
| Empty state | Hidden or blank | Centered icon + message + optional CTA |
| Loading state | Spinner only | Skeleton with `animate-pulse` at exact element dimensions |
| Text on dark | `#fff` | `hsl(220 15% 92%)` — off-white, less glare |
| Transition speed | `duration-300` everywhere | 150ms for state changes, 300ms for reveals, 500ms for page transitions |
| Line height (body) | Default 1.5 | `leading-[1.6]` on small text, `leading-[1.3]` on headings |

---

## PART 2 — Performance & Accessibility

### 2.1 60fps Animation: The Compositor Contract

The browser rendering pipeline: **JavaScript → Style → Layout → Paint → Composite**. Each earlier step forces all subsequent steps. Only `transform` and `opacity` run **exclusively at Composite** — they never trigger Layout or Paint.

**Tier-1 properties (free — compositor only):**
- `transform: translateX/Y/Z`, `scale`, `rotate`, `skew`
- `opacity`
- In Framer Motion: `x`, `y`, `scale`, `rotate`, `opacity`, `scaleX`, `scaleY`

**Tier-2 properties (expensive — triggers Layout):**
- `width`, `height`, `top`, `left`, `margin`, `padding`, `font-size`
- Never animate these. If you need height animation, use `layout` prop (Framer auto-converts to transform).

**will-change discipline:**
```css
/* Only add when animation is imminent */
.will-animate { will-change: transform, opacity; }
/* Remove after animation completes */
```

Framer Motion handles `will-change` automatically during active animations. Only add it manually to elements with **perpetual** animation (e.g., a background orb that loops forever). Overuse creates excessive GPU layers and can degrade performance worse than not using it.

**Compositor layer audit**: Open Chrome DevTools → Rendering → "Layer borders". Each yellow border is a layer. Cap total layers at ~20 per page. More than that means something is leaking `will-change` or `transform: translateZ(0)` globally.

**Scroll work — never block the main thread:**
```tsx
// CORRECT — reads from MotionValue directly, no re-render
const { scrollY } = useScroll();
const y = useTransform(scrollY, [0, 300], [0, 50]);
return <motion.div style={{ y }} />;

// WRONG — creates state updates on every scroll frame
window.addEventListener("scroll", () => setState(window.scrollY));
```

Use `useMotionValueEvent` for threshold checks (header opacity, etc.), never `useState` + `useEffect` on scroll.

**Debounce non-animation scroll work** (analytics, non-visual updates):
```ts
const handleScroll = useCallback(
  debounce(() => { /* analytics call */ }, 200),
  []
);
```

**RAF discipline for custom animations not using Framer:**
```ts
let rafId: number;
const animate = () => {
  // update only transform/opacity
  rafId = requestAnimationFrame(animate);
};
rafId = requestAnimationFrame(animate);
return () => cancelAnimationFrame(rafId);
```

---

### 2.2 Core Web Vitals for Animated Sites

#### LCP (target: ≤2.5s)
```tsx
// Hero image: priority + sizes + explicit dimensions
<Image
  src="/hero.jpg"
  alt="Helm dashboard"
  width={1200}
  height={680}
  priority            // preloads — use ONLY on above-fold image
  sizes="(max-width: 768px) 100vw, 1200px"
  placeholder="blur"
  blurDataURL={blurDataURL}
  className="w-full h-auto object-cover"
/>
```

- `priority` injects a `<link rel="preload">` — **only use on the single LCP candidate** per page.
- Serve AVIF first, WebP fallback — Next.js `<Image>` does this automatically with `formats: ['image/avif', 'image/webp']` in `next.config.js`.
- Never animate the LCP element before it paints. Fade-in the hero only AFTER `onLoad`.

#### CLS (target: ≤0.1)
```tsx
// Reserve space for dynamic content
<div className="min-h-[400px] contain-intrinsic-size-auto">
  <Suspense fallback={<Skeleton />}>
    <DynamicSection />
  </Suspense>
</div>
```

CLS killers specific to animated sites:
- Entrance animations that shift layout (sliding in from off-screen top/bottom) — use `opacity` + `translateY` from inside the reserved bounding box, not from outside it.
- `height: 0 → auto` transitions — use `layout` prop instead, or `max-height` with a known value.
- Late-loading fonts: use `next/font` exclusively. It auto-generates `size-adjust` CSS to match fallback metrics.

#### INP (target: ≤200ms)
```tsx
// Keep UI thread free during transitions
const [isPending, startTransition] = useTransition();

const handleNavigate = () => {
  startTransition(() => {
    router.push("/dashboard");
  });
};
```

- Use `useTransition` for route changes — marks navigation as non-urgent, keeps the current page responsive.
- Code-split heavy animation libraries:
```tsx
// GSAP / Three.js — dynamic import, never in the initial bundle
const HeavyAnimation = dynamic(() => import("@/components/HeavyAnimation"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});
```

#### Fonts
```tsx
// next/font — self-hosted, zero layout shift, optimal subsetting
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});
```

Never use `@import` from Google Fonts CDN in production — it adds a network round-trip and causes CLS.

#### LazyMotion — reduce Framer bundle
```tsx
// layout.tsx — wrap entire app
import { LazyMotion, domAnimation } from "motion/react";

export default function Layout({ children }) {
  return (
    <LazyMotion features={domAnimation}>
      {children}
    </LazyMotion>
  );
}

// In components — use `m` instead of `motion`
import { m } from "motion/react";
<m.div animate={{ opacity: 1 }} />
```

`domAnimation` = ~15kb vs the full `motion` import at ~34kb. Use `domMax` only if you need layout animations or advanced drag.

---

### 2.3 Accessibility

#### Global Reduced Motion (non-negotiable — implement first)
```tsx
// In layout.tsx — wraps the entire tree
import { MotionConfig } from "motion/react";

<MotionConfig reducedMotion="user">
  {children}
</MotionConfig>
```

`reducedMotion="user"` reads `prefers-reduced-motion: reduce` and auto-disables all Framer Motion durations. Opacity transitions survive; all transforms/springs stop.

For CSS animations not controlled by Framer:
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

Use `motion-safe:animate-pulse` (Tailwind) on status indicators so they only pulse when motion is acceptable.

#### Skip Link (must be first focusable element in DOM)
```tsx
// In layout.tsx, before <header>
<a
  href="#main-content"
  className={`
    sr-only focus:not-sr-only
    focus:fixed focus:top-4 focus:left-4 focus:z-[100]
    focus:px-4 focus:py-2 focus:rounded-[var(--radius-md)]
    focus:bg-[var(--color-accent)] focus:text-white
    focus:text-sm focus:font-medium
  `}
>
  Skip to main content
</a>
```

#### Focus Rings (every interactive element)
```css
/* globals.css — override browser default */
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Suppress focus ring for mouse users only */
:focus:not(:focus-visible) {
  outline: none;
}
```

Never `outline: none` without a `:focus-visible` replacement. That's an a11y violation.

#### Semantic HTML and ARIA
```tsx
<header role="banner">           // implicit in <header> — still OK to explicit
<nav aria-label="Main navigation">
<main id="main-content">         // skip link target
<section aria-labelledby="features-heading">
<footer role="contentinfo">
```

For custom interactive components:
```tsx
// Custom button (avoid if possible — use <button>)
<div
  role="button"
  tabIndex={0}
  aria-label="Open settings"
  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
>

// Modal
<dialog
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-description"
>

// Animated list/carousel
<div role="list" aria-label="Feature cards">
  <div role="listitem">
```

**The `inert` attribute** — now universally supported. Use on off-screen panels instead of complex `aria-hidden` trees:
```tsx
<div inert={!isOpen}>
  <SidePanel />
</div>
```

#### Focus Management in Modals and Drawers
```tsx
import { useEffect, useRef } from "react";

export function Modal({ isOpen, onClose, children }) {
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) firstFocusRef.current?.focus();
  }, [isOpen]);

  // Trap focus: intercept Tab/Shift+Tab, cycle within modal
  // Use a library like `focus-trap-react` — do not roll your own
```

#### Color Contrast
```
WCAG AA minimum: 4.5:1 for body text, 3:1 for large text / UI components.

Helm dark theme checks:
--color-text-primary  (#E8EAF0) on --surface-0 (#171B27) → ~12:1 ✓
--color-text-secondary (#8A90A4) on --surface-0           → ~4.7:1 ✓ (barely — verify)
--color-accent (#6E5AFA) on --surface-0                   → ~4.6:1 ✓ (check with actual hex)
--color-text-muted (#545A6E) on --surface-0               → ~3.2:1 ✗ — NEVER use for meaningful text
```

Muted text is for decorative/supporting content only. Any text carrying information must meet 4.5:1. Use [Polypane](https://polypane.app/) or `axe DevTools` in CI.

#### Alt Text Rules
```tsx
// Meaningful image
<Image alt="Helm agent dashboard showing active goals" ... />

// Decorative
<Image alt="" role="presentation" ... />

// Icon with visible label (icon is decorative)
<button>
  <Icon aria-hidden="true" />
  <span>Open settings</span>
</button>

// Icon-only button (must have accessible name)
<button aria-label="Open settings">
  <Icon aria-hidden="true" />
</button>
```

#### Keyboard Operability Checklist
- Every interactive element reachable by `Tab` / `Shift+Tab`
- No positive `tabIndex` values (breaks natural order) — only `0` or `-1`
- Dropdowns/menus: `Arrow` keys navigate items, `Escape` closes, `Enter/Space` selects
- Modals: focus trapped inside while open, returned to trigger on close
- Carousels: `Arrow` keys advance slides (and pause auto-play when focused)
- Toast notifications: `role="status"` (polite) or `role="alert"` (assertive) — not both

---

## Rules for Our Builder

### Component Token Set

```
Radius:
  xs=3px  sm=6px  md=8px  lg=12px  xl=16px  2xl=24px  full=9999px
  Rule: container radius = 2× button radius

Spacing (button padding):
  sm: px-3 py-1.5 (h-7)
  md: px-4 py-2   (h-9)   ← default
  lg: px-5 py-2.5 (h-10)

Icons:
  inline = 16px (w-4 h-4), stroke 1.5px
  standalone = 20px (w-5 h-5), stroke 1.5px
  hero/empty-state = 32–48px (w-8–w-12)

Borders (dark surfaces):
  subtle   = rgba(255,255,255,0.06)
  default  = rgba(255,255,255,0.10)
  moderate = rgba(255,255,255,0.16)
  strong   = rgba(255,255,255,0.24)
  accent   = rgba(accent-rgb, 0.40)

Shadows (dark, always paired with inset highlight):
  card:   inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.45)
  lifted: inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.5)
  glow:   0 0 0 1px rgba(255,255,255,0.06), 0 4px 24px rgba(accent-rgb,0.15)

Focus ring:
  box-shadow: 0 0 0 3px rgba(accent-rgb, 0.18)
  outline: 2px solid var(--color-accent), offset: 2px

Transitions:
  state-change: 150ms ease-out
  reveal:       300ms ease-out
  page:         500ms ease-in-out
  spring:       stiffness 300–400, damping 28–32
```

---

### Performance + Accessibility Checklist

Every component the builder generates MUST satisfy:

**Animation performance**
- [ ] All animated properties are `transform` or `opacity` only (x, y, scale, rotate, opacity)
- [ ] No animation of width, height, margin, padding, top, left
- [ ] `layout` prop used for height/size transitions (Framer handles transform conversion)
- [ ] `LazyMotion` with `domAnimation` wraps the app; `m.` prefix used in components
- [ ] `will-change` not hardcoded in CSS unless element is in perpetual loop
- [ ] Scroll-linked effects use `useScroll` + `useTransform`, never `useState` on scroll events
- [ ] Spring config stays in stiffness 100–500, damping 10–40 range
- [ ] `backdrop-filter: blur()` capped at 12px, max 3 blurred elements per viewport

**Core Web Vitals**
- [ ] Hero image uses `<Image priority>` with explicit `width`, `height`, `sizes`
- [ ] All images use `next/image` — no raw `<img>` tags
- [ ] Fonts loaded via `next/font` only — no CDN @import
- [ ] Dynamic import + `ssr: false` on any component >50kb that is below-fold
- [ ] Skeleton/placeholder at exact final dimensions for all lazy content
- [ ] No entrance animation that causes layout shift outside the reserved bounding box
- [ ] `useTransition` wraps all route pushes

**Accessibility**
- [ ] `<MotionConfig reducedMotion="user">` at root layout
- [ ] `@media (prefers-reduced-motion: reduce)` CSS rule present in globals
- [ ] Skip link is first focusable element, visible on focus
- [ ] All interactive elements have `:focus-visible` ring (no bare `outline: none`)
- [ ] `<main id="main-content">` present and is skip link target
- [ ] Semantic landmarks used: `<header>`, `<nav aria-label>`, `<main>`, `<footer>`
- [ ] All `<img>` have either descriptive `alt` text or `alt=""` with `role="presentation"`
- [ ] Icon-only buttons have `aria-label`; icons inside labelled buttons have `aria-hidden="true"`
- [ ] Body text contrast ≥ 4.5:1; UI component contrast ≥ 3:1
- [ ] `--color-text-muted` never used for informational text (contrast <4.5:1)
- [ ] Modal/drawer: focus trapped, returned to trigger on close
- [ ] `inert` attribute used on off-screen panels (replaces `aria-hidden` tree)
- [ ] Keyboard nav: Tab order correct, Escape closes overlays, Arrow keys navigate menus
- [ ] Status badges that animate use `motion-safe:animate-pulse`
- [ ] `role="status"` on toast notifications for screen reader announcements
