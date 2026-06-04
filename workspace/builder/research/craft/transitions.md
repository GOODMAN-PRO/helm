# Transitions & Motion Craft

Premium preloaders, intro reveals, hero entrance choreography, and route transitions for Next.js App Router.

---

## 1. Mental Model

The hierarchy is:

1. **Preloader** — masks the network gap, runs once per session
2. **Hero entrance** — the first thing users consciously see, choreographed stagger
3. **Route transition** — maintains narrative continuity across navigations
4. **Micro-motion** — scroll progress, shared elements, section indicators

The rule that ties them: **mask reveals over fades**. A clip-path wipe carries direction and weight. A simple opacity fade carries nothing.

---

## 2. Preloader / Intro Reveal

### What award sites actually do (2025–2026)

- **Counter 0 → 100** with non-mechanical randomized steps (e.g. 0 → 17 → 34 → 61 → 78 → 100) so it never feels like a linear progress bar.
- The counter is typeset large — display size, mono or tabular-nums. It *is* the design, not a utility readout.
- A race-pattern: data fetch starts in parallel with the visual sequence so the preloader never blocks longer than the actual load.
- Exit is a coordinated wipe or mask-lift that hands directly off into the hero entrance — the two are one continuous timeline, not two separate animations.
- **sessionStorage gate** — skip entirely on repeat visits within the session.
- **prefers-reduced-motion** — collapse the whole sequence to a 150 ms crossfade.

### Timing skeleton

```
0ms      Counter starts ticking (randomized intervals, total ~1400ms)
1000ms   Network/font/LCP asset expected ready
1400ms   Counter hits 100, pauses 120ms
1520ms   Panel lift / clip-path wipe begins (400ms)
1920ms   Hero entrance stagger starts (overlaps last 80ms of wipe)
```

### Implementation — GSAP counter + panel lift

```tsx
// components/Preloader.tsx
"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

const STEPS = [0, 11, 23, 38, 52, 67, 79, 88, 95, 100];
const SKIP_KEY = "helm_intro_seen";

interface PreloaderProps {
  onComplete: () => void;
}

export function Preloader({ onComplete }: PreloaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const numRef  = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Skip on repeat visits
    if (sessionStorage.getItem(SKIP_KEY)) {
      onComplete();
      return;
    }

    // Reduced-motion fast path
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      gsap.to(rootRef.current, { opacity: 0, duration: 0.15, onComplete });
      sessionStorage.setItem(SKIP_KEY, "1");
      return;
    }

    const tl = gsap.timeline({
      onComplete: () => {
        sessionStorage.setItem(SKIP_KEY, "1");
        onComplete();
      },
    });

    // Counter ticks through non-linear steps
    const obj = { val: 0 };
    STEPS.forEach((target, i) => {
      if (i === 0) return;
      const prev = STEPS[i - 1];
      const gap  = target - prev;
      // Variable speed: slow at start, rushes at end
      const dur  = i < 5 ? 0.22 : i < 8 ? 0.14 : 0.09;

      tl.to(obj, {
        val: target,
        duration: dur,
        ease: "power1.inOut",
        onUpdate() {
          if (numRef.current) {
            numRef.current.textContent = String(Math.round(obj.val)).padStart(3, "0");
          }
        },
      });
    });

    // Pause on 100
    tl.to({}, { duration: 0.12 });

    // Panel lifts away (clip-path inset from bottom)
    tl.to(panelRef.current, {
      clipPath: "inset(0 0 100% 0)",
      duration: 0.55,
      ease: "expo.inOut",
    });

    // Fade counter
    tl.to(numRef.current, { opacity: 0, duration: 0.2, ease: "power2.in" }, "<");

    return () => { tl.kill(); };
  }, [onComplete]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-end",
        padding: "2.5rem",
        background: "#0a0a0a",
        pointerEvents: "none",
      }}
    >
      {/* The lift panel — sits behind the counter */}
      <div
        ref={panelRef}
        style={{
          position: "absolute",
          inset: 0,
          background: "#0a0a0a",
          clipPath: "inset(0 0 0% 0)",
          transformOrigin: "top",
        }}
      />

      {/* Counter — positioned in front */}
      <span
        ref={numRef}
        style={{
          position: "relative",
          fontVariantNumeric: "tabular-nums",
          fontSize: "clamp(4rem, 10vw, 8rem)",
          fontWeight: 700,
          letterSpacing: "-0.04em",
          color: "#ffffff",
          lineHeight: 1,
          fontFamily: "var(--font-mono, monospace)",
        }}
      >
        000
      </span>
    </div>
  );
}
```

```tsx
// app/layout.tsx  (or a client wrapper)
"use client";
import { useState } from "react";
import { Preloader } from "@/components/Preloader";

export function RootShell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  return (
    <>
      <Preloader onComplete={() => setReady(true)} />
      <div style={{ visibility: ready ? "visible" : "hidden" }}>
        {children}
      </div>
    </>
  );
}
```

> Note: use `visibility: hidden` not `display: none` — the hero DOM renders while the preloader runs, so fonts and images are already loaded when the reveal fires.

---

## 3. Hero Entrance Choreography

Fire the stagger the instant `onComplete` is called from the preloader (or immediately on repeat visits).

### Pattern — staggered clip-path mask reveals

Each headline word, the sub-copy line, and the CTA button live inside a `<span class="mask-wrap">` that clips its child. The child translates up from below the clip edge.

```css
/* globals.css */
.mask-wrap {
  overflow: hidden;
  display: inline-block;   /* or block for full lines */
}
```

```tsx
// components/HeroReveal.tsx
"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

interface HeroRevealProps {
  ready: boolean; // passed from parent after preloader fires onComplete
  children: React.ReactNode;
}

export function HeroReveal({ ready, children }: HeroRevealProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const el = rootRef.current;
    if (!el) return;

    const words  = el.querySelectorAll<HTMLElement>("[data-reveal='word']");
    const lines  = el.querySelectorAll<HTMLElement>("[data-reveal='line']");
    const assets = el.querySelectorAll<HTMLElement>("[data-reveal='asset']");

    if (reduced) {
      gsap.set([words, lines, assets], { opacity: 1, y: 0 });
      return;
    }

    // Set initial state
    gsap.set(words,  { y: "110%", rotate: 3 });
    gsap.set(lines,  { y: "110%" });
    gsap.set(assets, { clipPath: "inset(0 0 100% 0)", opacity: 0 });

    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

    // Headline words — staggered mask lifts
    tl.to(words, {
      y: 0,
      rotate: 0,
      duration: 1.0,
      stagger: 0.07,
    }, 0);

    // Sub-copy line — comes in 180ms after first word
    tl.to(lines, {
      y: 0,
      duration: 0.85,
      stagger: 0.06,
    }, 0.18);

    // Visual / image asset — unclips from bottom
    tl.to(assets, {
      clipPath: "inset(0 0 0% 0)",
      opacity: 1,
      duration: 0.9,
      stagger: 0.08,
      ease: "expo.inOut",
    }, 0.25);

    return () => { tl.kill(); };
  }, [ready]);

  return <div ref={rootRef}>{children}</div>;
}
```

```tsx
// Example usage in the hero section
export function Hero({ ready }: { ready: boolean }) {
  return (
    <HeroReveal ready={ready}>
      <h1>
        {["Control.", "Every", "Device."].map((w) => (
          <span className="mask-wrap" key={w}>
            <span data-reveal="word">{w} </span>
          </span>
        ))}
      </h1>

      <p className="mask-wrap">
        <span data-reveal="line">Your AI fleet, always in formation.</span>
      </p>

      <div data-reveal="asset" className="hero-visual">
        {/* image / 3D / video */}
      </div>
    </HeroReveal>
  );
}
```

### Easing reference

| Use case              | Ease                   | Why                                        |
|-----------------------|------------------------|--------------------------------------------|
| Word mask lift        | `expo.out`             | Aggressive deceleration — lands with snap  |
| Asset clip wipe       | `expo.inOut`           | Crisp both ends, no floatiness             |
| Preloader panel lift  | `expo.inOut`           | Matches weight of the cover element        |
| Route overlay wipe    | `power4.inOut`         | Slightly softer than expo for longer spans |
| Shared-element morph  | `spring(stiffness:200)`| Physics feel — card to modal               |

---

## 4. Route Transitions in App Router

### The App Router exit-animation gotcha

`AnimatePresence` relies on detecting when a child unmounts. The App Router's `layout.tsx` is persistent — its children never fully unmount on navigation; the router updates the subtree in-place. This breaks the exit animation.

The fix is a `FrozenRouter` component that freezes the `LayoutRouterContext` during the exit animation, holding the old DOM in place long enough for the exit to complete.

### template.tsx vs layout.tsx

- `layout.tsx` — persists across routes (shared chrome: nav, footer)
- `template.tsx` — remounts on every navigation; each route gets a fresh instance

Use `template.tsx` at the route segment level for per-page mount/unmount animations.

### Complete wipe-overlay transition system

```tsx
// components/FrozenRouter.tsx
"use client";

import { useContext, useEffect, useRef } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

function usePreviousValue<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
    return () => { ref.current = undefined; };
  });
  return ref.current;
}

export function FrozenRouter({ children }: { children: React.ReactNode }) {
  const context     = useContext(LayoutRouterContext);
  const prevContext = usePreviousValue(context) || null;
  const segment     = useSelectedLayoutSegment();
  const prevSegment = usePreviousValue(segment);

  const changed =
    segment !== prevSegment &&
    segment !== undefined &&
    prevSegment !== undefined;

  return (
    <LayoutRouterContext.Provider value={changed ? prevContext : context}>
      {children}
    </LayoutRouterContext.Provider>
  );
}
```

```tsx
// components/PageTransition.tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useSelectedLayoutSegment } from "next/navigation";
import { FrozenRouter } from "./FrozenRouter";

// Overlay wipe: a panel sweeps in from the right edge,
// covers the old page, then recedes revealing the new page.
const overlayVariants = {
  initial:  { scaleX: 0, transformOrigin: "left center" },
  enter:    { scaleX: 1, transformOrigin: "left center",
              transition: { duration: 0.45, ease: [0.76, 0, 0.24, 1] } },
  exit:     { scaleX: 0, transformOrigin: "right center",
              transition: { duration: 0.45, ease: [0.76, 0, 0.24, 1] } },
};

const pageVariants = {
  initial:  { opacity: 0 },
  animate:  { opacity: 1, transition: { duration: 0.01, delay: 0.45 } },
  exit:     { opacity: 0, transition: { duration: 0.01 } },
};

export function PageTransition({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment();

  return (
    <>
      {/* Wipe overlay — sits above everything, fixed */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`overlay-${segment}`}
          variants={overlayVariants}
          initial="initial"
          animate="enter"
          exit="exit"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 8888,
            background: "#0a0a0a",
            pointerEvents: "none",
          }}
        />
      </AnimatePresence>

      {/* Page content — instant swap behind the overlay */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={segment}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <FrozenRouter>{children}</FrozenRouter>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
```

```tsx
// app/layout.tsx
import { PageTransition } from "@/components/PageTransition";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
```

> Alternative: place `PageTransition` inside `app/template.tsx` instead of `layout.tsx` for true per-route remounting — simpler but slightly more React overhead.

### Lenis + ScrollTrigger re-init on route change

```tsx
// components/SmoothScroll.tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ReactLenis, type LenisRef } from "lenis/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<LenisRef>(null);
  const pathname = usePathname();

  // Drive Lenis from GSAP ticker — single RAF loop
  useEffect(() => {
    function update(time: number) {
      lenisRef.current?.lenis?.raf(time * 1000);
    }
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    return () => gsap.ticker.remove(update);
  }, []);

  // On route change: scroll to top, kill stale ScrollTriggers, refresh
  useEffect(() => {
    lenisRef.current?.lenis?.scrollTo(0, { immediate: true });
    // Kill any triggers tied to the previous page's DOM
    ScrollTrigger.getAll().forEach((t) => t.kill());
    ScrollTrigger.refresh();
  }, [pathname]);

  return (
    <ReactLenis
      ref={lenisRef}
      root
      options={{
        lerp: 0.08,
        duration: 1.4,
        syncTouch: true,
        autoRaf: false, // GSAP ticker drives it
      }}
    >
      {children}
    </ReactLenis>
  );
}
```

---

## 5. Shared-Element / Morph Transitions (layoutId)

`layoutId` uses the FLIP technique: Framer records the element's bounding box before and after, inverts the transform, and plays it forward. The visual result is a card that physically morphs into a detail view.

### Rules for correct behavior

1. Both elements must share **one `AnimatePresence` boundary** — if they're on different routes, wrap the top-level layout in a single `AnimatePresence`.
2. Use `layout="position"` on the container and `layout` on children to prevent layout shift during the morph.
3. Unique IDs: `layoutId={`card-${item.id}`}` — never bare strings.

```tsx
// List view
export function CardGrid({ items }: { items: Item[] }) {
  return (
    <ul>
      {items.map((item) => (
        <Link href={`/item/${item.id}`} key={item.id}>
          <motion.li layoutId={`card-${item.id}`} layout="position">
            <motion.img
              layoutId={`card-img-${item.id}`}
              src={item.image}
              alt={item.title}
            />
            <motion.h2 layoutId={`card-title-${item.id}`}>{item.title}</motion.h2>
          </motion.li>
        </Link>
      ))}
    </ul>
  );
}

// Detail view — same layoutIds, different layout
export function ItemDetail({ item }: { item: Item }) {
  return (
    <motion.article layoutId={`card-${item.id}`}>
      <motion.img
        layoutId={`card-img-${item.id}`}
        src={item.image}
        alt={item.title}
        style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover" }}
      />
      <motion.h1 layoutId={`card-title-${item.id}`}>{item.title}</motion.h1>
      <p>{item.body}</p>
    </motion.article>
  );
}
```

---

## 6. Scroll Progress + Section Indicators

### Progress bar — hardware-accelerated with Framer Motion

```tsx
// components/ScrollProgress.tsx
"use client";

import { motion, useScroll, useSpring } from "framer-motion";

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  // Spring smooths out the raw scroll value
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 200,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "2px",
        background: "#ffffff",
        transformOrigin: "left",
        scaleX,
        zIndex: 9000,
      }}
    />
  );
}
```

### Section dots — driven by IntersectionObserver

Avoids scroll listeners entirely; fires a callback when a section crosses the threshold.

```tsx
// components/SectionDots.tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface Section {
  id: string;
  label: string;
}

export function SectionDots({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { threshold: 0.5 }
    );

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });

    return () => obs.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="Section navigation"
      style={{
        position: "fixed",
        right: "1.5rem",
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        zIndex: 9000,
      }}
    >
      {sections.map(({ id, label }) => {
        const isActive = active === id;
        return (
          <a
            key={id}
            href={`#${id}`}
            aria-label={label}
            aria-current={isActive ? "true" : undefined}
            style={{ display: "block" }}
          >
            <motion.span
              animate={{
                scale:           isActive ? 1.4 : 1,
                backgroundColor: isActive ? "#ffffff" : "rgba(255,255,255,0.3)",
              }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              style={{
                display: "block",
                width: "6px",
                height: "6px",
                borderRadius: "50%",
              }}
            />
          </a>
        );
      })}
    </nav>
  );
}
```

---

## 7. Taste Rules

| Rule                                        | Rationale                                                                 |
|---------------------------------------------|---------------------------------------------------------------------------|
| Mask/clip reveals, not fades                | Direction + weight vs. zero information                                   |
| `expo.out` for entrances, `expo.inOut` for wipes | Fast launch, crisp landing                                           |
| Total preloader time ≤ 1.8 s                | Users tolerate ~2 s; beyond that it reads as slow                        |
| Counter uses tabular-nums, display scale    | The counter *is* the design; make it earn its space                       |
| First visit only (sessionStorage)           | Animation rewards discovery; punishing repeat visitors is bad taste       |
| Reduced-motion: ≤ 150 ms crossfade          | ~25 % of users have this enabled; respect it unconditionally              |
| One RAF loop (GSAP ticker drives Lenis)     | Two RAF loops jitter; merge them                                          |
| Kill ScrollTriggers on route change         | Stale triggers fire on phantom DOM nodes and cause flicker                |
| `layoutId` IDs always include item ID       | Bare string causes wrong elements to morph when multiple items exist      |
| Section dots via IntersectionObserver       | Scroll listeners on every frame degrade INP; IO is browser-native         |

---

## Rules for our builder

**Rule: a premium intro reveal + choreographed hero entrance, first-visit only.**

On first visit (no `helm_intro_seen` in sessionStorage): run the full preloader → hero sequence. On repeat visits: skip straight to the hero at full opacity, no animation.

### Copy-paste: Preloader + Hero Reveal (self-contained)

```tsx
// --- 1. components/Preloader.tsx ---
"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";

const STEPS = [0, 11, 23, 38, 52, 67, 79, 88, 95, 100];
const KEY   = "helm_intro_seen";

export function Preloader({ onComplete }: { onComplete: () => void }) {
  const rootRef  = useRef<HTMLDivElement>(null);
  const numRef   = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem(KEY)) { onComplete(); return; }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      gsap.to(rootRef.current, { opacity: 0, duration: 0.15, onComplete });
      sessionStorage.setItem(KEY, "1");
      return;
    }

    const tl  = gsap.timeline({
      onComplete: () => { sessionStorage.setItem(KEY, "1"); onComplete(); },
    });
    const obj = { val: 0 };

    STEPS.forEach((target, i) => {
      if (i === 0) return;
      const dur = i < 5 ? 0.22 : i < 8 ? 0.14 : 0.09;
      tl.to(obj, {
        val: target, duration: dur, ease: "power1.inOut",
        onUpdate() {
          if (numRef.current)
            numRef.current.textContent = String(Math.round(obj.val)).padStart(3, "0");
        },
      });
    });

    tl.to({}, { duration: 0.12 });
    tl.to(panelRef.current, { clipPath: "inset(0 0 100% 0)", duration: 0.55, ease: "expo.inOut" });
    tl.to(numRef.current,   { opacity: 0, duration: 0.2, ease: "power2.in" }, "<");

    return () => { tl.kill(); };
  }, [onComplete]);

  return (
    <div ref={rootRef} style={{
      position:"fixed", inset:0, zIndex:9999,
      display:"flex", alignItems:"flex-end", justifyContent:"flex-end",
      padding:"2.5rem", background:"#0a0a0a", pointerEvents:"none",
    }}>
      <div ref={panelRef} style={{
        position:"absolute", inset:0, background:"#0a0a0a",
        clipPath:"inset(0 0 0% 0)",
      }} />
      <span ref={numRef} style={{
        position:"relative",
        fontVariantNumeric:"tabular-nums",
        fontSize:"clamp(4rem,10vw,8rem)",
        fontWeight:700, letterSpacing:"-0.04em",
        color:"#fff", lineHeight:1,
        fontFamily:"var(--font-mono,monospace)",
      }}>000</span>
    </div>
  );
}
```

```tsx
// --- 2. components/HeroReveal.tsx ---
"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";

export function HeroReveal({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready || !ref.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const words  = ref.current.querySelectorAll<HTMLElement>("[data-reveal='word']");
    const lines  = ref.current.querySelectorAll<HTMLElement>("[data-reveal='line']");
    const assets = ref.current.querySelectorAll<HTMLElement>("[data-reveal='asset']");

    if (reduced) { gsap.set([words, lines, assets], { opacity: 1, y: 0 }); return; }

    gsap.set(words,  { y: "110%", rotate: 3 });
    gsap.set(lines,  { y: "110%" });
    gsap.set(assets, { clipPath: "inset(0 0 100% 0)", opacity: 0 });

    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.to(words,  { y: 0, rotate: 0, duration: 1.0, stagger: 0.07 }, 0);
    tl.to(lines,  { y: 0,            duration: 0.85, stagger: 0.06 }, 0.18);
    tl.to(assets, { clipPath: "inset(0 0 0% 0)", opacity: 1,
                    duration: 0.9, stagger: 0.08, ease: "expo.inOut" }, 0.25);

    return () => { tl.kill(); };
  }, [ready]);

  return <div ref={ref}>{children}</div>;
}
```

```tsx
// --- 3. app/layout.tsx (or client shell) ---
"use client";
import { useState } from "react";
import { Preloader } from "@/components/Preloader";
import { HeroReveal } from "@/components/HeroReveal";

export function RootShell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(
    // If session already seen, start ready immediately
    typeof window !== "undefined" && !!sessionStorage.getItem("helm_intro_seen")
  );

  return (
    <>
      {!ready && <Preloader onComplete={() => setReady(true)} />}
      <HeroReveal ready={ready}>
        <div style={{ visibility: ready ? "visible" : "hidden" }}>
          {children}
        </div>
      </HeroReveal>
    </>
  );
}
```

```tsx
// --- 4. Overlay route transition — add to PageTransition.tsx ---
// (Use the full component from section 4 above)
// Key easing: [0.76, 0, 0.24, 1]  (power4.inOut in cubic-bezier form)
// Duration: 450ms in / 450ms out
// The overlay panel sweeps left→right to cover, right→left to reveal
```

### Required packages

```bash
bun add gsap framer-motion lenis @gsap/react
```

### Markup contract for HeroReveal

- Wrap each headline word in `.mask-wrap > [data-reveal="word"]`
- Wrap each copy line in `.mask-wrap > [data-reveal="line"]`
- Tag visual/image containers with `[data-reveal="asset"]`
- `.mask-wrap { overflow: hidden; display: inline-block; }`

---

*Research compiled 2026-06-04. Sources: Codrops (Thibault Guignand, clip-path wipes), imcorfitz.com (FrozenRouter pattern), devdreaming.com (Lenis/GSAP ticker sync), motion.dev (useScroll), GSAP community forums.*
