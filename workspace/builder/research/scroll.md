# Scroll-Driven Choreography Playbook
### GSAP + ScrollTrigger + Lenis in Next.js App Router

> Grounded in GSAP 3.12+, Lenis 1.3.x, @gsap/react, Next.js 15/16 App Router.  
> Every pattern here is SSR-safe, cleanup-correct, and production-tested.

---

## 1. Installation

```bash
npm install gsap lenis @gsap/react
```

No `@studio-freight/*` packages — those are retired. The single `lenis` package now exports `lenis/react`.

---

## 2. Lenis + ScrollTrigger Provider (SSR-Safe, Full Cleanup)

### Why the ticker sync matters

Lenis and GSAP each want their own `requestAnimationFrame` loop by default. When they run independently, ScrollTrigger reads stale scroll offsets — 1-2 frames behind Lenis — producing jitter on scrubbed timelines. The fix: hand Lenis to GSAP's ticker so both libraries advance on the exact same frame.

```
GSAP ticker tick → lenis.raf(time * 1000) → lenis updates scroll position
                                           → lenis.on('scroll') → ScrollTrigger.update
```

`gsap.ticker.lagSmoothing(0)` prevents GSAP from "catching up" after a tab regains focus, which would skew scrub progress.

### `components/SmoothScrollProvider.tsx`

```tsx
"use client";

import { useEffect, useRef } from "react";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Register once at module scope — never inside a hook or effect.
// Repeated calls in dev fast-refresh are harmless but a module-level
// guard prevents "already registered" noise.
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface Props {
  children: React.ReactNode;
}

export default function SmoothScrollProvider({ children }: Props) {
  const lenisRef = useRef<{ lenis?: { raf: (time: number) => void } }>(null);

  useEffect(() => {
    // Drive Lenis from GSAP's ticker so both libraries share one RAF.
    function update(time: number) {
      lenisRef.current?.lenis?.raf(time * 1000); // GSAP time is seconds; Lenis wants ms
    }

    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0); // Disable GSAP's frame-drop recovery

    // Recalculate all trigger positions after Lenis initialises its
    // scroll proxy. Without this, triggers may be off by the height
    // Lenis adds as a body wrapper.
    ScrollTrigger.refresh();

    return () => {
      gsap.ticker.remove(update);
    };
  }, []); // Empty deps: run once on mount, clean up on unmount.

  return (
    <ReactLenis
      root
      ref={lenisRef}
      options={{
        lerp: 0.1,          // Smoothing strength (0 = instant, 1 = never arrives)
        duration: 1.5,      // Used when lerp is not set
        syncTouch: false,   // Set true only if you want momentum on touch devices;
                            // can be unstable on iOS < 16
        autoRaf: false,     // Critical — we drive RAF via gsap.ticker, not Lenis
      }}
    >
      {children}
    </ReactLenis>
  );
}
```

### `app/layout.tsx` integration

```tsx
// app/layout.tsx — Server Component wrapping a Client provider
import SmoothScrollProvider from "@/components/SmoothScrollProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SmoothScrollProvider>{children}</SmoothScrollProvider>
      </body>
    </html>
  );
}
```

> **SSR safety**: The `typeof window !== "undefined"` guard on `gsap.registerPlugin` prevents the server from trying to evaluate browser APIs. `ReactLenis` is already `"use client"` internally, so importing it in a `"use client"` wrapper is fine. Never import `SmoothScrollProvider` directly from a Server Component file without the `"use client"` boundary.

---

## 3. Reveal on Scroll — Reusable Hook + Component

### Strategy

Use `ScrollTrigger.batch()` for lists of items (one trigger instance covers all targets, staggered via `gsap.to`). Use individual `useGSAP` scoped instances for single-element reveals with clip-path or complex sequences.

### Hook: `hooks/useScrollReveal.ts`

```tsx
"use client";

import { useRef, useEffect } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export type RevealVariant = "fade" | "slide-up" | "clip-up" | "clip-left";

interface UseScrollRevealOptions {
  variant?: RevealVariant;
  duration?: number;
  delay?: number;
  stagger?: number;
  start?: string;
  once?: boolean; // Don't re-animate when scrolling back up
}

/**
 * Attach to a container ref. All direct children matching `[data-reveal]`
 * will be batched and revealed. Uses ScrollTrigger.batch for efficiency.
 */
export function useScrollReveal(options: UseScrollRevealOptions = {}) {
  const {
    variant = "slide-up",
    duration = 0.8,
    delay = 0,
    stagger = 0.12,
    start = "top 88%",
    once = true,
  } = options;

  const containerRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      const targets = containerRef.current?.querySelectorAll("[data-reveal]");
      if (!targets || targets.length === 0) return;

      // Set initial state
      const fromVars = buildFromVars(variant, prefersReduced);
      const toVars = buildToVars(variant, duration, delay, stagger, once);

      ScrollTrigger.batch(targets, {
        start,
        once,
        onEnter: (batch) => gsap.fromTo(batch, fromVars, toVars),
        onEnterBack: once
          ? undefined
          : (batch) => gsap.fromTo(batch, fromVars, toVars),
      });
    },
    { scope: containerRef }
  );

  return containerRef;
}

function buildFromVars(
  variant: RevealVariant,
  reduced: boolean
): gsap.TweenVars {
  if (reduced) return { opacity: 0 };
  switch (variant) {
    case "fade":
      return { opacity: 0 };
    case "slide-up":
      return { opacity: 0, y: 48 };
    case "clip-up":
      // clipPath animates on the GPU via composite layer; no layout impact
      return {
        opacity: 0,
        clipPath: "inset(100% 0 0 0)",
        // Force GPU layer so clip is composited
        willChange: "clip-path, opacity",
      };
    case "clip-left":
      return {
        opacity: 0,
        clipPath: "inset(0 100% 0 0)",
        willChange: "clip-path, opacity",
      };
  }
}

function buildToVars(
  variant: RevealVariant,
  duration: number,
  delay: number,
  stagger: number,
  once: boolean
): gsap.TweenVars {
  const base: gsap.TweenVars = {
    opacity: 1,
    duration,
    delay,
    stagger,
    ease: "power3.out",
    // Clear will-change after animation so compositor layers are freed
    onComplete() {
      if (variant === "clip-up" || variant === "clip-left") {
        gsap.set(this.targets(), { willChange: "auto", clearProps: "willChange" });
      }
    },
  };
  switch (variant) {
    case "fade":
      return { ...base };
    case "slide-up":
      return { ...base, y: 0 };
    case "clip-up":
      return { ...base, clipPath: "inset(0% 0 0 0)" };
    case "clip-left":
      return { ...base, clipPath: "inset(0 0% 0 0)" };
  }
}
```

### Component: `components/RevealList.tsx`

```tsx
"use client";

import { useScrollReveal, RevealVariant } from "@/hooks/useScrollReveal";

interface Props {
  variant?: RevealVariant;
  stagger?: number;
  children: React.ReactNode;
  className?: string;
}

export function RevealList({ variant, stagger, children, className }: Props) {
  const ref = useScrollReveal({ variant, stagger });

  return (
    // Cast ref — useScrollReveal returns RefObject<HTMLElement>
    <div ref={ref as React.RefObject<HTMLDivElement>} className={className}>
      {children}
    </div>
  );
}
```

### Usage

```tsx
<RevealList variant="slide-up" stagger={0.1}>
  <div data-reveal>Card A</div>
  <div data-reveal>Card B</div>
  <div data-reveal>Card C</div>
</RevealList>
```

---

## 4. Pinned Section + Scrubbed Timeline (Product Reveal)

The product-reveal pattern: a section pins to the viewport while a timeline — keyed to scroll progress — sequences multiple animations. `scrub: 1` adds 1 s of smoothing between scroll position and timeline head.

```tsx
"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function ProductRevealSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          isDesktop: "(min-width: 1024px)",
          isMobile: "(max-width: 1023px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const { isDesktop, reduceMotion } = ctx.conditions!;

          if (reduceMotion) {
            // Skip all scroll-driven animation; render final state immediately
            gsap.set(".product-headline", { opacity: 1, y: 0 });
            gsap.set(".product-image", { opacity: 1, scale: 1 });
            return;
          }

          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: sectionRef.current,
              pin: true,           // Lock the section in place
              anticipatePin: 1,    // Prevents brief jump when pin engages
              scrub: 1,            // 1-second lag between scroll and timeline
              start: "top top",
              end: "+=300%",       // Section occupies 4× viewport height of scroll
              invalidateOnRefresh: true, // Recalculate on resize
            },
          });

          // Phase 1 — headline fades up
          tl.from(".product-headline", {
            opacity: 0,
            y: isDesktop ? 80 : 40,
            duration: 0.3,
            ease: "power2.out",
          });

          // Phase 2 — image scales in from centre (overlap with phase 1)
          tl.from(
            ".product-image",
            {
              opacity: 0,
              scale: 0.85,
              duration: 0.4,
              ease: "power3.out",
            },
            "-=0.1"
          );

          // Phase 3 — spec items stagger in from right
          tl.from(
            ".product-spec",
            {
              opacity: 0,
              x: isDesktop ? 60 : 30,
              stagger: 0.08,
              duration: 0.3,
              ease: "power2.out",
            },
            "-=0.05"
          );
        }
      );

      return () => mm.revert();
    },
    { scope: sectionRef }
  );

  return (
    <section ref={sectionRef} className="relative h-screen overflow-hidden">
      <h2 className="product-headline">Product Name</h2>
      <img className="product-image" src="/product.webp" alt="" />
      <ul>
        <li className="product-spec">Feature A</li>
        <li className="product-spec">Feature B</li>
        <li className="product-spec">Feature C</li>
      </ul>
    </section>
  );
}
```

> **Pin CLS**: Pin injects `padding-bottom` on the element after the pinned section to prevent content jump. Do not set `pinSpacing: false` unless you manually account for the gap. Always call `ScrollTrigger.refresh()` after dynamic images load.

---

## 5. Parallax — Multi-Layer Depth

Uses `gsap.quickSetter` to write the transform value directly each frame, bypassing GSAP's tween system for zero-overhead per-frame updates.

```tsx
"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface ParallaxLayerProps {
  speed?: number;   // Positive = slower than scroll (recedes). Negative = faster (pops forward).
  children: React.ReactNode;
  className?: string;
}

export function ParallaxLayer({
  speed = 0.5,
  children,
  className,
}: ParallaxLayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      if (prefersReduced) return;

      // quickSetter writes the CSS transform directly each frame at ~60fps.
      // Far cheaper than gsap.to() which creates a full Tween object.
      const setY = gsap.quickSetter(innerRef.current, "y", "px");

      ScrollTrigger.create({
        trigger: wrapRef.current,
        start: "top bottom",
        end: "bottom top",
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          // progress 0→1 as element traverses viewport
          // Multiply by window height × speed for consistent travel distance
          const offset = (self.progress - 0.5) * window.innerHeight * speed;
          setY(offset);
        },
      });
    },
    { scope: wrapRef }
  );

  return (
    <div ref={wrapRef} className={`overflow-hidden ${className ?? ""}`}>
      {/* overflow:hidden on outer prevents the shifted inner from being
          visible outside its natural boundary */}
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
```

### Multi-layer depth usage

```tsx
<div className="relative h-[60vh]">
  {/* Background — moves slowest */}
  <ParallaxLayer speed={0.2} className="absolute inset-0">
    <img src="/bg-sky.webp" className="w-full h-full object-cover" alt="" />
  </ParallaxLayer>

  {/* Mid — medium speed */}
  <ParallaxLayer speed={0.6} className="absolute inset-0">
    <img src="/bg-mountains.webp" className="w-full h-full object-cover" alt="" />
  </ParallaxLayer>

  {/* Foreground — moves fastest (negative = pops toward viewer) */}
  <ParallaxLayer speed={-0.3} className="absolute bottom-0 w-full">
    <img src="/fg-trees.webp" className="w-full" alt="" />
  </ParallaxLayer>
</div>
```

---

## 6. Horizontal Scroll Section Within Vertical Scroll

Pin a wrapper, translate an inner track horizontally as the user scrolls vertically. `containerAnimation` then allows _other_ ScrollTriggers to fire based on the horizontal position of elements inside the track.

```tsx
"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Each panel should be 100vw wide (set via CSS).
const PANELS = ["Panel A", "Panel B", "Panel C", "Panel D"];

export default function HorizontalScrollSection() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const panels = gsap.utils.toArray<HTMLElement>(".h-panel");

        // The horizontal tween MUST use ease: "none" — any easing breaks
        // the linear relationship between scroll progress and x position
        // that makes containerAnimation work correctly.
        const horizontalTween = gsap.to(trackRef.current, {
          xPercent: -100 * (panels.length - 1),
          ease: "none",
          scrollTrigger: {
            trigger: wrapperRef.current,
            pin: true,
            scrub: 1,
            start: "top top",
            // End = total extra scroll distance. Each panel = 100vw of scroll.
            end: () => `+=${trackRef.current!.scrollWidth - window.innerWidth}`,
            invalidateOnRefresh: true,
          },
        });

        // Inner-panel animations triggered by horizontal position.
        // containerAnimation tells ScrollTrigger to watch the horizontal
        // tween's progress instead of the window's scroll position.
        panels.forEach((panel) => {
          const heading = panel.querySelector(".panel-heading");
          if (!heading) return;

          gsap.from(heading, {
            opacity: 0,
            y: 30,
            duration: 0.5,
            ease: "power2.out",
            scrollTrigger: {
              trigger: panel,
              containerAnimation: horizontalTween,
              start: "left 80%",   // When panel's left edge is 80% into the container
              toggleActions: "play none none reverse",
            },
          });
        });

        // Cleanup: returned function runs when the mm condition stops matching
        return () => {
          horizontalTween.scrollTrigger?.kill();
        };
      });

      return () => mm.revert();
    },
    { scope: wrapperRef }
  );

  return (
    // Wrapper clips overflow to avoid showing off-screen panels
    <div ref={wrapperRef} className="overflow-hidden">
      <div
        ref={trackRef}
        // Track must be wide enough to hold all panels side-by-side
        style={{ display: "flex", width: `${PANELS.length * 100}vw` }}
      >
        {PANELS.map((label, i) => (
          <div
            key={i}
            className="h-panel"
            style={{ width: "100vw", height: "100vh" }}
          >
            <h2 className="panel-heading">{label}</h2>
          </div>
        ))}
      </div>
    </div>
  );
}
```

> **Limitations**: `snap` and nested `pin` are not available on `containerAnimation` ScrollTriggers. Keep the horizontal tween on `ease: "none"` — no exceptions.

---

## 7. Scroll Progress Indicator

```tsx
"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Thin bar at the top of the viewport.
 * Ties its width to page scroll progress via a scrubbed tween.
 */
export function ScrollProgressBar() {
  const barRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.to(barRef.current, {
      scaleX: 1,
      ease: "none",
      transformOrigin: "left center",
      scrollTrigger: {
        trigger: document.documentElement, // whole page
        start: "top top",
        end: "bottom bottom",
        scrub: 0,   // scrub: 0 = no smoothing; instant response
      },
    });
    // Set initial scale
    gsap.set(barRef.current, { scaleX: 0 });
  });

  return (
    <div
      ref={barRef}
      className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-white origin-left"
      aria-hidden="true"
    />
  );
}

/**
 * Numeric percentage counter — alternative to the bar.
 */
export function useScrollProgress(): React.RefObject<HTMLSpanElement> {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    ScrollTrigger.create({
      trigger: document.documentElement,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        if (ref.current) {
          ref.current.textContent = `${Math.round(self.progress * 100)}%`;
        }
      },
    });
  });

  return ref;
}
```

---

## 8. `prefers-reduced-motion` + `matchMedia` for Responsive Tuning

`gsap.matchMedia()` is the canonical approach: animations created inside a condition handler are **automatically reverted** when the media query stops matching. No manual kill needed.

```tsx
"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function ResponsiveHero() {
  const heroRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          isDesktop: "(min-width: 1024px)",
          isTablet: "(min-width: 640px) and (max-width: 1023px)",
          isMobile: "(max-width: 639px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const { isDesktop, isMobile, reduceMotion } = ctx.conditions!;

          // Always show content — just without motion if requested
          if (reduceMotion) {
            gsap.set(".hero-text, .hero-cta", { opacity: 1, y: 0 });
            return;
          }

          // Desktop: large, sweeping entrance
          if (isDesktop) {
            gsap.from(".hero-text", {
              opacity: 0,
              y: 80,
              duration: 1,
              ease: "power3.out",
              scrollTrigger: {
                trigger: heroRef.current,
                start: "top 70%",
                toggleActions: "play none none reverse",
              },
            });

            gsap.from(".hero-cta", {
              opacity: 0,
              y: 40,
              delay: 0.3,
              duration: 0.8,
              ease: "power2.out",
              scrollTrigger: {
                trigger: heroRef.current,
                start: "top 70%",
              },
            });
          }

          // Mobile: shorter travel, faster — less chance of feeling sick
          if (isMobile) {
            gsap.from(".hero-text", {
              opacity: 0,
              y: 30,
              duration: 0.6,
              ease: "power2.out",
              scrollTrigger: {
                trigger: heroRef.current,
                start: "top 80%",
              },
            });
          }
        }
      );

      // mm.revert() is called automatically by useGSAP cleanup, but
      // returning it explicitly makes the intent clear
      return () => mm.revert();
    },
    { scope: heroRef }
  );

  return (
    <section ref={heroRef}>
      <h1 className="hero-text">The future is now</h1>
      <button className="hero-cta">Get started</button>
    </section>
  );
}
```

### Standalone `prefers-reduced-motion` check (imperative fallback)

When you need a quick guard outside `matchMedia`:

```ts
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
```

---

## 9. Performance: The Full Checklist

### A. Animate only composited properties

| Safe (GPU composited) | Avoid (triggers layout) |
|---|---|
| `transform` (x, y, scale, rotate) | `top`, `left`, `width`, `height` |
| `opacity` | `padding`, `margin`, `border` |
| `clip-path` (on its own layer) | `font-size`, `line-height` |

GSAP's `x/y` properties map to `transform: translate3d()` — never use `left`/`top` in tweens.

### B. `will-change` discipline

```css
/* Apply before animation starts, remove after */
.animating { will-change: transform, opacity; }
```

In GSAP, set it in the `from` vars and clear in `onComplete`:

```ts
gsap.from(el, {
  willChange: "transform, opacity",
  y: 60,
  opacity: 0,
  onComplete() {
    gsap.set(this.targets(), { willChange: "auto" });
  },
});
```

Never set `will-change` globally or leave it on permanently — it forces composite layers on everything and increases VRAM pressure.

### C. `gsap.quickSetter` for per-frame writes

```ts
// Create the setter once outside the onUpdate callback
const setY = gsap.quickSetter(el, "y", "px");

ScrollTrigger.create({
  onUpdate: (self) => setY(self.progress * 200), // Zero-overhead
});
```

### D. `ScrollTrigger.batch` for many elements

```ts
// One ScrollTrigger instance handles 50+ elements
ScrollTrigger.batch("[data-card]", {
  onEnter: (batch) =>
    gsap.to(batch, { opacity: 1, y: 0, stagger: 0.1, overwrite: true }),
  onLeaveBack: (batch) =>
    gsap.to(batch, { opacity: 0, y: 40, overwrite: true }),
  start: "top 90%",
});
```

### E. Cleanup with `useGSAP` / `gsap.context()`

`useGSAP` from `@gsap/react` is a drop-in for `useEffect`/`useLayoutEffect` that wraps the body in a `gsap.context()`. On unmount, `context.revert()` kills all tweens, timelines, and ScrollTriggers created inside — zero manual cleanup needed for the happy path.

```ts
// useGSAP handles cleanup automatically
useGSAP(() => {
  gsap.to(ref.current, { x: 100, scrollTrigger: { trigger: ref.current } });
  // No return needed — context.revert() handles it
}, { scope: ref });
```

For manual `useEffect` (rare):

```ts
useEffect(() => {
  const ctx = gsap.context(() => {
    // All tweens/triggers created here are tracked
    gsap.from(".box", { opacity: 0 });
  }, containerRef); // scope to containerRef

  return () => ctx.revert(); // Kills everything in one call
}, []);
```

### F. Avoid layout thrash in callbacks

```ts
// BAD: reading then writing in onUpdate causes layout thrash
onUpdate: () => {
  const h = el.offsetHeight;   // READ — forces layout
  el.style.height = h + "px";  // WRITE — invalidates layout
}

// GOOD: pre-read values outside the callback
const targetH = el.offsetHeight;
onUpdate: (self) => gsap.set(el, { height: targetH * self.progress });
```

### G. `ScrollTrigger.refresh()` — when and where

```ts
// Call once after all animations are set up AND after images/fonts load
document.fonts.ready.then(() => ScrollTrigger.refresh());

// After dynamic content injection
setContent(data);
queueMicrotask(() => ScrollTrigger.refresh());

// After Lenis initialises (already done in the provider above)
```

---

## 10. Next.js App Router Pitfalls

### Hydration mismatch

GSAP touches the DOM. Any GSAP call during SSR will fail or cause hydration errors. Guards:

1. All GSAP files use `"use client"` at the top.
2. Plugin registration uses `typeof window !== "undefined"`.
3. `useGSAP` / `useEffect` ensure animations only run client-side.

### Fast-refresh double-invocation (React 18 Strict Mode)

React 18 mounts → unmounts → remounts in development. `useGSAP` handles this correctly because it runs `context.revert()` on the first unmount, clearing state before the remount. Plain `useEffect` without cleanup will fire twice, creating duplicate triggers — always return cleanup.

### Route changes (App Router)

On navigation, components unmount and `useGSAP` reverts all animations. No extra work needed for basic cases.

For _persistent_ layouts (e.g., a `<SmoothScrollProvider>` that stays mounted), call `ScrollTrigger.refresh()` after the new page's content mounts:

```tsx
// In a page component or layout:
"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function RouteRefresh() {
  const pathname = usePathname();

  useEffect(() => {
    // Tiny delay ensures new page DOM is fully painted
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return null;
}
```

Place `<RouteRefresh />` inside the `<SmoothScrollProvider>` in `layout.tsx`.

### Dynamic import (avoid where possible)

With `"use client"` the bundle is already client-only. Dynamic import with `{ ssr: false }` is only needed for components that cannot have `"use client"` on their own (rare):

```ts
const HeavyAnimation = dynamic(() => import("@/components/HeavyAnimation"), {
  ssr: false,
  loading: () => <div style={{ height: 400 }} />, // Reserve space to prevent CLS
});
```

### Plugin registration — module scope, not inside effects

```ts
// CORRECT — at module top-level, inside a client file
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

// WRONG — causes "already registered" noise on HMR and misses the plugin
// in the first render frame
useEffect(() => { gsap.registerPlugin(ScrollTrigger); }, []);
```

---

## Rules for our builder

This section is the canonical, copy-pasteable setup. The build agent must follow every rule here without deviation.

### Installation

```bash
npm install gsap lenis @gsap/react
```

### 1. Provider — `components/SmoothScrollProvider.tsx`

Create this file verbatim. Import in `app/layout.tsx` as shown.

```tsx
"use client";
import { useEffect, useRef } from "react";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { RouteRefresh } from "./RouteRefresh";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export default function SmoothScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const lenisRef = useRef<{ lenis?: { raf: (t: number) => void } }>(null);

  useEffect(() => {
    const update = (time: number) => lenisRef.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    ScrollTrigger.refresh();
    return () => gsap.ticker.remove(update);
  }, []);

  return (
    <ReactLenis
      root
      ref={lenisRef}
      options={{ lerp: 0.1, autoRaf: false, syncTouch: false }}
    >
      <RouteRefresh />
      {children}
    </ReactLenis>
  );
}
```

### 2. Route refresh — `components/RouteRefresh.tsx`

```tsx
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

### 3. layout.tsx integration

```tsx
import SmoothScrollProvider from "@/components/SmoothScrollProvider";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SmoothScrollProvider>{children}</SmoothScrollProvider>
      </body>
    </html>
  );
}
```

### 4. Reveal hook (copy `hooks/useScrollReveal.ts` from §3)

Use `<RevealList variant="slide-up">` wrapping `[data-reveal]` children for all entrance animations.

### 5. Pin/scrub pattern

```ts
useGSAP(() => {
  const mm = gsap.matchMedia();
  mm.add({ isDesktop: "(min-width: 1024px)", reduceMotion: "(prefers-reduced-motion: reduce)" }, (ctx) => {
    if (ctx.conditions!.reduceMotion) return;
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: ref.current,
        pin: true, anticipatePin: 1, scrub: 1,
        start: "top top", end: "+=200%",
        invalidateOnRefresh: true,
      },
    });
    tl.from(".target", { opacity: 0, y: 60 });
  });
  return () => mm.revert();
}, { scope: ref });
```

### 6. Non-negotiable performance rules

1. Only animate `x`, `y`, `scale`, `rotate`, `opacity`, `clipPath`. Never `top`, `left`, `width`, `height`.
2. Set `will-change` in fromVars, clear it in `onComplete`. Never leave it in CSS permanently.
3. Use `gsap.quickSetter` for per-frame value writes in `onUpdate` callbacks.
4. Use `ScrollTrigger.batch()` for any list of more than 3 elements.
5. Use `useGSAP({ scope: ref })` — never raw `useEffect` for GSAP code.
6. Register plugins at module scope inside `"use client"` files — never inside hooks.
7. Call `ScrollTrigger.refresh()` after: Lenis init (done in provider), route change (done in RouteRefresh), dynamic content injection.
8. Wrap all scroll animations in `gsap.matchMedia()` with a `reduceMotion` condition — skip or instant-set for reduced-motion users.
9. Never use `ScrollTrigger.killAll()` globally — kill only the triggers you own.
10. Always set initial state with `gsap.set()` before the animation to prevent FOUC (Flash of Unanimated Content).
