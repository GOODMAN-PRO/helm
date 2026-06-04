# Scroll Storytelling — Advanced Patterns for Next.js

Research date: 2026-06-04. Stack: GSAP 3.12+, Lenis 1.3.x, Next.js 15 App Router, React 18/19.

---

## 1. Foundation: Lenis + ScrollTrigger Integration

This is the non-negotiable base. Get this right before any effect.

### Install

```bash
npm install gsap lenis @gsap/react
```

### SmoothScroll provider — `/components/SmoothScroll.tsx`

```tsx
"use client";
import { ReactLenis, useLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePathname } from "next/navigation";

gsap.registerPlugin(ScrollTrigger);

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<{ lenis?: { raf: (t: number) => void } }>(null);

  // Drive Lenis from GSAP's ticker — ONE RAF loop
  useEffect(() => {
    function update(time: number) {
      lenisRef.current?.lenis?.raf(time * 1000); // GSAP uses seconds; Lenis wants ms
    }
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0); // prevents catch-up jumps
    ScrollTrigger.refresh();
    return () => gsap.ticker.remove(update);
  }, []);

  // Route-change cleanup: kill all triggers, let them re-init on new page
  const pathname = usePathname();
  useEffect(() => {
    ScrollTrigger.getAll().forEach((t) => t.kill());
    ScrollTrigger.refresh();
  }, [pathname]);

  return (
    <ReactLenis
      root
      ref={lenisRef}
      options={{
        lerp: 0.1,          // smoothing (0 = instant, 1 = no movement)
        duration: 1.5,
        syncTouch: true,    // replaces deprecated smoothTouch
        autoRaf: false,     // GSAP drives the loop
        anchors: true,      // native anchor links work
      }}
    >
      {children}
    </ReactLenis>
  );
}
```

### Root layout usage

```tsx
// app/layout.tsx
import { SmoothScroll } from "@/components/SmoothScroll";
import "lenis/dist/lenis.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
```

### SSR safety rules

- Every component using GSAP must be `"use client"`.
- Register plugins at module level once per file — not inside hooks.
- Use `useGSAP()` from `@gsap/react` instead of `useEffect` for GSAP setup; it auto-kills on unmount.
- Never read `window` at module level — only inside `useEffect`/`useGSAP`.

---

## 2. Pinned Multi-Step Product Reveal (The Apple Move)

A section pins to the viewport. As the user scrolls through a long spacer, a GSAP timeline scrubs through 3–5 narrative beats. The product graphic and copy animate together. The user feels in control.

### How it works

- The wrapper `<section>` is `min-height: 400vh` (the scroll distance).
- The inner sticky container is `position: sticky; height: 100vh`.
- ScrollTrigger pins the sticky element and scrubs a GSAP timeline from `start: "top top"` to `end: "bottom bottom"` of the outer wrapper.

### Component — `/components/PinnedReveal.tsx`

```tsx
"use client";
import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function PinnedReveal() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          isDesktop: "(min-width: 768px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const { reduceMotion } = ctx.conditions as {
            isDesktop: boolean;
            reduceMotion: boolean;
          };
          if (reduceMotion) return;

          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: wrapperRef.current,
              start: "top top",
              end: "bottom bottom",
              scrub: 1,         // 1-second catch-up for smooth feel
              pin: stickyRef.current,
              anticipatePin: 1, // pre-calculates pin to avoid jump
              invalidateOnRefresh: true,
            },
          });

          // Beat 1: product fades in, hero headline enters
          tl.fromTo(
            ".pr-product",
            { opacity: 0, scale: 0.88, y: 40 },
            { opacity: 1, scale: 1, y: 0, duration: 1, ease: "power2.out" }
          )
            .fromTo(
              ".pr-headline-1",
              { yPercent: 110 },
              { yPercent: 0, duration: 0.6, ease: "power2.out" },
              "<0.2"
            )

            // Beat 2: product rotates / new angle, second copy block
            .to(".pr-product", { rotateY: 30, x: 60, duration: 1, ease: "none" }, "+=0.3")
            .fromTo(
              ".pr-copy-2",
              { opacity: 0, x: -30 },
              { opacity: 1, x: 0, duration: 0.7, ease: "power2.out" },
              "<0.2"
            )

            // Beat 3: product back to center, stat numbers count up
            .to(".pr-product", { rotateY: 0, x: 0, duration: 1, ease: "power2.inOut" }, "+=0.3")
            .fromTo(
              ".pr-stat",
              { opacity: 0, y: 20 },
              { opacity: 1, y: 0, stagger: 0.12, duration: 0.5 },
              "<0.3"
            )

            // Beat 4: product scales up hero for exit
            .to(".pr-product", { scale: 1.08, opacity: 0, duration: 0.8, ease: "power3.in" }, "+=0.5")
            .to(".pr-copy-2", { opacity: 0, duration: 0.4 }, "<");

          return () => {
            mm.revert();
          };
        }
      );

      // Mobile: reduced/no pin, simple fade
      mm.add("(max-width: 767px)", () => {
        gsap.from(".pr-product", {
          opacity: 0,
          y: 30,
          scrollTrigger: {
            trigger: wrapperRef.current,
            start: "top 80%",
            toggleActions: "play none none reverse",
          },
        });
      });
    },
    { scope: wrapperRef }
  );

  return (
    // outer wrapper provides scroll distance
    <div ref={wrapperRef} style={{ minHeight: "400vh", position: "relative" }}>
      {/* sticky inner — pins to viewport */}
      <div
        ref={stickyRef}
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
        }}
      >
        <div className="pr-product" style={{ willChange: "transform, opacity" }}>
          {/* product image / 3D / canvas goes here */}
          <img src="/product.png" alt="Product" draggable={false} />
        </div>

        {/* copy layers — absolutely positioned, animated independently */}
        <div style={{ position: "absolute", bottom: "20%", left: "10%" }}>
          <div style={{ overflow: "hidden" }}>
            <h2 className="pr-headline-1">Designed for the extraordinary.</h2>
          </div>
        </div>

        <div className="pr-copy-2" style={{ position: "absolute", bottom: "25%", right: "8%", opacity: 0 }}>
          <p>Up to 40 hours battery.</p>
        </div>

        <div style={{ position: "absolute", bottom: "8%", display: "flex", gap: "3rem" }}>
          {["40hr", "0.2s", "6-mic"].map((s) => (
            <span key={s} className="pr-stat" style={{ opacity: 0 }}>
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Key tuning knobs

| Property | Effect |
|---|---|
| `scrub: 1` | Smooth 1s catch-up. Use `scrub: true` for instant/raw. |
| `anticipatePin: 1` | Eliminates pin jump on fast scroll. Always include. |
| `invalidateOnRefresh: true` | Recalculates distances on window resize. Required. |
| Wrapper `minHeight` | Controls how much scroll distance the story gets. 300-500vh is typical. |
| Timeline label `"+=0.3"` | Gap between beats (in timeline time units). |

---

## 3. Scroll-Scrubbed Image Sequence

Apple's signature. 100–200 frames pre-rendered; canvas drawImage mapped to scroll progress.

### Canvas approach (real assets)

```tsx
"use client";
import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Generate frame URLs: /frames/airpods_001.jpg ... /frames/airpods_147.jpg
function getFrameUrl(index: number) {
  return `/frames/airpods_${String(index + 1).padStart(3, "0")}.jpg`;
}

const FRAME_COUNT = 147;

export function ImageSequence() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<HTMLImageElement[]>([]);
  const frameObj = useRef({ frame: 0 });

  // Preload all frames — start before animation needed
  useEffect(() => {
    const images: HTMLImageElement[] = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = getFrameUrl(i);
      images.push(img);
    }
    framesRef.current = images;

    // Draw first frame immediately to avoid blank canvas flash
    images[0].onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx && images[0]) {
        canvas.width = images[0].naturalWidth;
        canvas.height = images[0].naturalHeight;
        ctx.drawImage(images[0], 0, 0);
      }
    };
  }, []);

  useGSAP(
    () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      function renderFrame(index: number) {
        const img = framesRef.current[Math.round(index)];
        if (!img?.complete) return;
        ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
        ctx!.drawImage(img, 0, 0);
      }

      gsap.to(frameObj.current, {
        frame: FRAME_COUNT - 1,
        snap: "frame",               // always land on whole frame
        ease: "none",
        scrollTrigger: {
          trigger: wrapperRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.5,
          pin: canvas,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: () => renderFrame(frameObj.current.frame),
        },
      });
    },
    { scope: wrapperRef }
  );

  return (
    <div ref={wrapperRef} style={{ minHeight: "300vh" }}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100vh",
          objectFit: "contain",
          willChange: "transform",
        }}
      />
    </div>
  );
}
```

### Lighter CSS alternative (no assets required)

When you don't have a frame sequence, simulate the effect with CSS transforms applied to a high-quality product image. This covers 80% of the visual impact.

```tsx
"use client";
import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function CSSProductReveal() {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // Simulate a 3-beat "sequence" with pure CSS transforms
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: wrapperRef.current,
          start: "top top",
          end: "+=200%",
          scrub: 1,
          pin: true,
          invalidateOnRefresh: true,
        },
      });

      tl
        // Frame 0→33: emerge from below, slight zoom
        .fromTo(
          ".css-product",
          { yPercent: 15, scale: 0.9, opacity: 0 },
          { yPercent: 0, scale: 1, opacity: 1, ease: "none", duration: 1 }
        )
        // Frame 33→66: tilt on Y axis to show depth
        .to(".css-product", { rotateY: 25, x: 80, ease: "none", duration: 1 })
        // Frame 66→100: hero scale, fade out
        .to(".css-product", {
          scale: 1.15,
          rotateY: 0,
          x: 0,
          opacity: 0,
          ease: "none",
          duration: 1,
        });
    },
    { scope: wrapperRef }
  );

  return (
    <div ref={wrapperRef} style={{ minHeight: "300vh" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "grid",
          placeItems: "center",
        }}
      >
        <img
          className="css-product"
          src="/product-hero.png"
          alt="Product"
          style={{ willChange: "transform, opacity", maxHeight: "70vh" }}
        />
      </div>
    </div>
  );
}
```

---

## 4. Horizontal Scroll Section (Inside Vertical Flow)

The page scrolls normally above and below. This section converts vertical scroll to horizontal panning.

```tsx
"use client";
import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const SLIDES = [
  { id: 1, title: "Chapter One", bg: "#0a0a0a" },
  { id: 2, title: "Chapter Two", bg: "#111827" },
  { id: 3, title: "Chapter Three", bg: "#0f172a" },
  { id: 4, title: "Chapter Four", bg: "#1a1a2e" },
];

export function HorizontalScroll() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(min-width: 768px)", () => {
        const track = trackRef.current!;

        // Amount to move = total track width minus one viewport width
        const getScrollAmount = () => -(track.scrollWidth - window.innerWidth);

        gsap.to(track, {
          x: getScrollAmount,              // function-based: recalculates on refresh
          ease: "none",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top top",
            end: () => `+=${track.scrollWidth - window.innerWidth}`, // match px exactly
            scrub: 1,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,    // recompute on resize
          },
        });

        // Nested: animate individual slide content as it enters horizontal view
        track.querySelectorAll<HTMLElement>(".h-slide").forEach((slide) => {
          const heading = slide.querySelector(".h-slide-heading");
          if (!heading) return;

          gsap.from(heading, {
            opacity: 0,
            y: 20,
            duration: 0.6,
            scrollTrigger: {
              trigger: slide,
              containerAnimation: ScrollTrigger.getById("horizontal-main"), // hook into parent
              start: "left center",
              toggleActions: "play none none reverse",
            },
          });
        });
      });

      // Mobile: revert to normal vertical stacking (no horizontal transform)
      mm.add("(max-width: 767px)", () => {
        gsap.set(trackRef.current, { x: 0, clearProps: "all" });
      });
    },
    { scope: sectionRef }
  );

  return (
    <section
      ref={sectionRef}
      style={{ overflow: "hidden", position: "relative" }}
    >
      <div
        ref={trackRef}
        style={{
          display: "flex",
          width: `${SLIDES.length * 100}vw`,
          willChange: "transform",
        }}
      >
        {SLIDES.map((slide) => (
          <div
            key={slide.id}
            className="h-slide"
            style={{
              width: "100vw",
              height: "100vh",
              background: slide.bg,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <h2 className="h-slide-heading">{slide.title}</h2>
          </div>
        ))}
      </div>
    </section>
  );
}
```

Note: To use `containerAnimation`, the parent ScrollTrigger must have an `id`. Add `id: "horizontal-main"` to the parent trigger config.

---

## 5. Layered Parallax Scene (Multi-Depth)

Multiple layers move at different speeds. `quickSetter` bypasses GSAP's normal overhead for 50–250% faster updates on every scroll tick.

```tsx
"use client";
import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Layer config: positive speed = moves up faster than scroll (foreground feel)
// Negative speed = lags behind scroll (background depth)
const LAYERS = [
  { className: "layer-sky",    speed: -0.3 },  // slowest — far background
  { className: "layer-clouds", speed: -0.15 }, // mid background
  { className: "layer-hills",  speed:  0.05 }, // near background
  { className: "layer-ground", speed:  0.2  }, // foreground
];

export function ParallaxScene() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      if (prefersReducedMotion) return;

      LAYERS.forEach(({ className, speed }) => {
        const el = sceneRef.current?.querySelector<HTMLElement>(`.${className}`);
        if (!el) return;

        // quickSetter: cached function, skips string parsing every tick
        const setY = gsap.quickSetter(el, "y", "px");

        ScrollTrigger.create({
          trigger: sceneRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
          onUpdate: (self) => {
            // progress 0→1 mapped to a y offset scaled by speed and height
            const yOffset = self.progress * window.innerHeight * speed * 2;
            setY(yOffset);
          },
          invalidateOnRefresh: true,
        });
      });
    },
    { scope: sceneRef }
  );

  return (
    <div
      ref={sceneRef}
      style={{
        position: "relative",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {LAYERS.map(({ className }) => (
        <div
          key={className}
          className={className}
          style={{
            position: "absolute",
            inset: "-20% 0",        // 20% bleed top/bottom to hide parallax edge
            willChange: "transform",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ))}
    </div>
  );
}
```

### quickSetter + pipe with value clamping

For parallax with skew-on-velocity (Lenis exposes velocity):

```tsx
// Get skew capped at ±20deg, snapped to nearest 0.1
const setSkew = gsap.utils.pipe(
  gsap.utils.clamp(-20, 20),
  gsap.utils.snap(0.1),
  gsap.quickSetter(".layer-ground", "skewY", "deg")
);

// In onUpdate:
setSkew(velocityFromLenis * 0.01);
```

---

## 6. Scroll-Linked Color / Theme Transitions

Sections transition from dark to light (or between brand palettes) as they enter the viewport. The approach: animate CSS custom properties on `:root` or a container, triggered per section.

```tsx
"use client";
import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Each section declares the theme it wants
const SECTIONS = [
  { id: "s1", bg: "#0a0a0a", fg: "#f5f5f5", accent: "#6366f1" }, // dark
  { id: "s2", bg: "#f9fafb", fg: "#111827", accent: "#7c3aed" }, // light
  { id: "s3", bg: "#0f172a", fg: "#e2e8f0", accent: "#38bdf8" }, // dark blue
  { id: "s4", bg: "#fffbf0", fg: "#1c1917", accent: "#f59e0b" }, // warm light
];

export function ThemedSections() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      SECTIONS.forEach((theme) => {
        ScrollTrigger.create({
          trigger: `#${theme.id}`,
          start: "top 60%",        // section reaches 60% from top
          end: "bottom 40%",
          onEnter: () => applyTheme(theme),
          onEnterBack: () => applyTheme(theme),
        });
      });

      function applyTheme(t: (typeof SECTIONS)[0]) {
        gsap.to(document.documentElement, {
          "--color-bg": t.bg,
          "--color-fg": t.fg,
          "--color-accent": t.accent,
          duration: 0.6,
          ease: "power2.out",
          // Animate CSS custom properties — GSAP 3.9+ supports this natively
          overwrite: true,
        });
      }
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef}>
      {SECTIONS.map((s) => (
        <section
          key={s.id}
          id={s.id}
          style={{
            minHeight: "100vh",
            background: "var(--color-bg)",
            color: "var(--color-fg)",
            display: "grid",
            placeItems: "center",
            transition: "background 0.6s ease", // CSS fallback for non-JS
          }}
        >
          <h2>Section {s.id.toUpperCase()}</h2>
        </section>
      ))}
    </div>
  );
}
```

In your global CSS:

```css
:root {
  --color-bg: #0a0a0a;
  --color-fg: #f5f5f5;
  --color-accent: #6366f1;
}

body {
  background-color: var(--color-bg);
  color: var(--color-fg);
  transition: background-color 0.6s ease, color 0.6s ease;
}
```

Avoid animating raw `background-color` values per element — animating the custom property propagates to the whole system and respects theming.

---

## 7. Text Reveal Choreography (Clip + Word/Line Stagger)

The mask technique: each line is wrapped in an `overflow: hidden` container. Text starts at `yPercent: 110` (below the clip boundary) and slides up into view. The clip creates a "curtain raise" with no extra markup.

### With GSAP SplitText (licensed plugin, included in GSAP Club/standard builds):

```tsx
"use client";
import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

export function TextReveal({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          isDesktop: "(min-width: 768px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const { reduceMotion } = ctx.conditions as {
            isDesktop: boolean;
            reduceMotion: boolean;
          };

          const headings = containerRef.current?.querySelectorAll<HTMLElement>(
            "[data-reveal='heading']"
          );
          if (!headings) return;

          headings.forEach((heading) => {
            const split = new SplitText(heading, {
              type: "lines,words",
              mask: "lines",        // auto-wraps each line in overflow:hidden div
              linesClass: "line",
              wordsClass: "word",
            });

            // Re-split on resize to handle reflow
            const onResize = () => {
              split.revert();
              split.split({});
              animateLines(split.lines);
            };

            function animateLines(lines: Element[]) {
              gsap.fromTo(
                lines,
                { yPercent: 110 },
                {
                  yPercent: 0,
                  duration: reduceMotion ? 0 : 0.8,
                  stagger: reduceMotion ? 0 : 0.08,
                  ease: "power3.out",
                  scrollTrigger: {
                    trigger: heading,
                    start: "top 85%",
                    toggleActions: "play none none reverse",
                    once: false,
                  },
                }
              );
            }

            animateLines(split.lines);
            window.addEventListener("resize", onResize);

            return () => window.removeEventListener("resize", onResize);
          });
        }
      );
    },
    { scope: containerRef }
  );

  return <div ref={containerRef}>{children}</div>;
}
```

Usage: `<h1 data-reveal="heading">Your heading text</h1>` inside a `<TextReveal>` wrapper.

### Without SplitText — pure CSS + GSAP:

```tsx
// Manually split lines at build time or via a simpler split utility
function splitByWords(el: HTMLElement) {
  const words = el.innerText.split(" ");
  el.innerHTML = words
    .map((w) => `<span class="word-wrap" style="overflow:hidden;display:inline-block"><span class="word">${w}&nbsp;</span></span>`)
    .join("");
  return el.querySelectorAll(".word");
}
```

Then animate `.word` with `yPercent: 110 → 0`. The `.word-wrap` clip handles masking.

### Character-level reveal (for hero display text only):

```tsx
// Stagger of 0.008s per char feels natural at 60fps
gsap.from(split.chars, {
  opacity: 0,
  yPercent: 60,
  rotateX: -45,
  stagger: 0.008,
  duration: 0.5,
  ease: "back.out(1.2)",
  scrollTrigger: { trigger: heading, start: "top 80%" },
});
```

Do not apply char-level animation to body copy — only display/hero text.

---

## 8. Reduced Motion + matchMedia — Full Pattern

Always wrap animation setup in `gsap.matchMedia()` with a `reduceMotion` condition.

```tsx
useGSAP(() => {
  const mm = gsap.matchMedia();

  mm.add(
    {
      isDesktop: "(min-width: 1024px)",
      isTablet: "(min-width: 768px) and (max-width: 1023px)",
      isMobile: "(max-width: 767px)",
      reduceMotion: "(prefers-reduced-motion: reduce)",
    },
    (ctx) => {
      const { isDesktop, isTablet, isMobile, reduceMotion } =
        ctx.conditions as Record<string, boolean>;

      // Skip all motion-heavy animations for accessibility
      if (reduceMotion) {
        // Still show final states instantly
        gsap.set(".animated-element", { opacity: 1, y: 0 });
        return;
      }

      if (isDesktop) {
        // Full pinned + scrub experience
        gsap.to(".element", {
          scrollTrigger: { trigger: ".section", pin: true, scrub: 1 },
          y: -100,
        });
      }

      if (isTablet || isMobile) {
        // Simplified: no pin, just fade in on scroll
        gsap.from(".element", {
          opacity: 0,
          y: 20,
          scrollTrigger: {
            trigger: ".section",
            start: "top 80%",
            toggleActions: "play none none reverse",
          },
        });
      }

      // matchMedia cleanup runs automatically when breakpoint changes
    }
  );

  return () => mm.revert(); // cleanup on component unmount
}, { scope: containerRef });
```

---

## 9. Performance Non-Negotiables

| Rule | Why |
|---|---|
| Only animate `transform` and `opacity` | These run on the compositor thread — no layout recalc |
| Never animate `width`, `height`, `top`, `left`, `margin` | Triggers layout → jank |
| `willChange: "transform"` on animated elements | Promotes to its own GPU layer |
| `willChange: "auto"` after animation ends | Don't leave permanent promotion |
| Lazy/dynamic import heavy components | `dynamic(() => import(...), { ssr: false })` |
| Preload image sequence frames | `new Image()` before ScrollTrigger starts |
| `invalidateOnRefresh: true` on all function-based values | Prevents stale measurements after resize |
| `ScrollTrigger.refresh()` after font load / layout shifts | CLS-safe |
| Avoid `scrub: true` for very long timelines | Use `scrub: 1` or `scrub: 2` for momentum |

### Preventing CLS (Cumulative Layout Shift)

```tsx
// Reserve space for sticky sections at mount
<div style={{ minHeight: "400vh" }}>       // outer spacer
  <div style={{ position: "sticky", top: 0, height: "100vh" }}> // inner

// Set explicit image dimensions — never let image load shift layout
<img width={1200} height={800} style={{ aspectRatio: "3/2" }} ... />
```

### Dynamic import for heavy components

```tsx
import dynamic from "next/dynamic";

// Prevents SSR for canvas/R3F/WebGL components
const ImageSequence = dynamic(() => import("@/components/ImageSequence"), {
  ssr: false,
  loading: () => <div style={{ height: "300vh", background: "#0a0a0a" }} />,
});
```

---

## 10. Route Change Refresh Pattern

Next.js App Router swaps pages without full reload. ScrollTrigger state accumulates if not cleaned up.

```tsx
// In SmoothScroll.tsx (or a standalone hook)
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function useScrollTriggerRefresh() {
  const pathname = usePathname();

  useEffect(() => {
    // Kill all triggers from previous page
    ScrollTrigger.getAll().forEach((t) => t.kill());
    // Scroll to top (Lenis handles this)
    window.scrollTo(0, 0);
    // Re-measure everything for new page
    ScrollTrigger.refresh();
  }, [pathname]);
}
```

For Lenis route-change scroll-to-top:

```tsx
const lenis = useLenis(); // from lenis/react
const pathname = usePathname();

useEffect(() => {
  lenis?.scrollTo(0, { immediate: true });
}, [pathname, lenis]);
```

---

## Rules for our builder

### Canonical pinned-reveal pattern (copy-paste)

```tsx
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: wrapperRef.current,   // outer spacer div
    start: "top top",
    end: "bottom bottom",
    scrub: 1,
    pin: stickyRef.current,        // inner sticky div
    anticipatePin: 1,
    invalidateOnRefresh: true,
  },
});
// add beats with tl.fromTo / tl.to, use "+=N" for gaps between beats
```

### Canonical parallax pattern (copy-paste)

```tsx
const setY = gsap.quickSetter(layerEl, "y", "px");
ScrollTrigger.create({
  trigger: sceneEl,
  start: "top bottom",
  end: "bottom top",
  scrub: true,
  onUpdate: (self) => setY(self.progress * window.innerHeight * speed * 2),
  invalidateOnRefresh: true,
});
```

### The law

**Every premium build includes ONE scroll-driven storytelling moment.**

This means: at minimum one section uses a pinned timeline scrub (or scroll-mapped parallax) to tell a story about the product, brand, or content — not just reveal content as the user scrolls past. The story has beats: setup, reveal, payoff. The user's scroll is the input; narrative progression is the output. Static scroll-triggered fades are decoration. A scroll story is architecture.

Transform and opacity only. Never scroll-animate layout properties. Every animated element gets `willChange: "transform"`. Reduced motion always gets an immediate-state fallback. Mobile gets simplified motion, never the same scrubbed timeline as desktop. Lenis + GSAP always share one RAF loop — `autoRaf: false` on Lenis, `gsap.ticker.add` drives it. Kill all ScrollTriggers on route change.
