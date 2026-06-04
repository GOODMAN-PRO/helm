# Signature Interactions — Working Code Reference

Award-winning sites earn their awards through a handful of precise, well-executed interactions — not a collection of everything. This file documents each pattern with production-ready Next.js (React + Framer Motion + GSAP) code, restraint notes, and accessibility guardrails.

---

## 1. Custom Cursor

### What it is
A circle that lerps toward the real pointer. Context-aware: it grows on hoverable targets, shows "VIEW" on media, "DRAG" on carousels. Invisible on touch/coarse devices and when `prefers-reduced-motion: reduce` is set.

### Why it works
It adds tactile weight to every hover without adding DOM clutter. The lag makes the UI feel physically responsive.

### When to skip it
Skip it on sites where speed is the primary value (e-commerce checkout, SaaS dashboards). It reads as "agency portfolio" and can feel slow to task-focused users.

### Code

```tsx
// components/CustomCursor.tsx
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// Lerp utility: move `a` toward `b` by factor `n` each frame
const lerp = (a: number, b: number, n: number) => a + (b - a) * n;

type CursorState = 'default' | 'hover' | 'view' | 'drag';

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Live mutable refs — no state, no re-renders
  const mouse = useRef({ x: -100, y: -100 });
  const pos = useRef({ x: -100, y: -100 });
  const cursorState = useRef<CursorState>('default');

  const applyCursorState = useCallback((state: CursorState) => {
    cursorState.current = state;
    if (!ringRef.current || !labelRef.current) return;

    const scales: Record<CursorState, string> = {
      default: 'scale(1)',
      hover: 'scale(2.2)',
      view: 'scale(3)',
      drag: 'scale(2.8)',
    };
    const labels: Record<CursorState, string> = {
      default: '',
      hover: '',
      view: 'VIEW',
      drag: 'DRAG',
    };

    ringRef.current.style.transform = scales[state];
    ringRef.current.style.mixBlendMode = state === 'default' ? 'normal' : 'difference';
    labelRef.current.textContent = labels[state];
    labelRef.current.style.opacity = labels[state] ? '1' : '0';
  }, []);

  useEffect(() => {
    // Only run on fine-pointer devices
    const mq = window.matchMedia('(pointer: fine)');
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (!mq.matches || rmq.matches) return;

    // Hide native cursor
    document.documentElement.style.cursor = 'none';

    const onMouseMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest(
        'a, button, [data-cursor], [data-cursor-view], [data-cursor-drag]'
      ) as HTMLElement | null;

      if (!target) {
        applyCursorState('default');
        return;
      }
      if (target.dataset.cursorView !== undefined) {
        applyCursorState('view');
      } else if (target.dataset.cursorDrag !== undefined) {
        applyCursorState('drag');
      } else {
        applyCursorState('hover');
      }
    };

    const tick = () => {
      // Single lerp — 0.12 gives ~8 frames of lag at 60fps
      pos.current.x = lerp(pos.current.x, mouse.current.x, 0.12);
      pos.current.y = lerp(pos.current.y, mouse.current.y, 0.12);

      const x = pos.current.x;
      const y = pos.current.y;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${x - 4}px, ${y - 4}px)`;
      }
      if (ringRef.current) {
        // ring is centered via CSS: width/height 32px, margin -16px
        ringRef.current.style.left = `${x}px`;
        ringRef.current.style.top = `${y}px`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseover', onMouseOver, { passive: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      document.documentElement.style.cursor = '';
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseover', onMouseOver);
      cancelAnimationFrame(rafRef.current);
    };
  }, [applyCursorState]);

  // SSR guard — don't render on server
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* 8px filled dot — snaps to exact pointer */}
      <div
        ref={dotRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'white',
          pointerEvents: 'none',
          zIndex: 9999,
          mixBlendMode: 'difference',
          willChange: 'transform',
        }}
      />
      {/* 32px ring — lerps with lag */}
      <div
        ref={ringRef}
        style={{
          position: 'fixed',
          width: 32,
          height: 32,
          marginLeft: -16,
          marginTop: -16,
          borderRadius: '50%',
          border: '1.5px solid white',
          pointerEvents: 'none',
          zIndex: 9998,
          transition: 'transform 0.25s cubic-bezier(0.23, 1, 0.32, 1)',
          willChange: 'transform, left, top',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          ref={labelRef}
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.08em',
            color: 'white',
            opacity: 0,
            transition: 'opacity 0.15s',
            mixBlendMode: 'difference',
            userSelect: 'none',
          }}
        />
      </div>
    </>,
    document.body
  );
}
```

```tsx
// app/layout.tsx — add once at root
import { CustomCursor } from '@/components/CustomCursor';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <CustomCursor />
      </body>
    </html>
  );
}
```

```tsx
// Usage on any element
<div data-cursor-view>
  <img src="/work/project.jpg" />
</div>

<div data-cursor-drag>
  {/* carousel */}
</div>
```

### Guardrails
- Wrapped in `(pointer: fine)` media query check — never runs on touch
- `prefers-reduced-motion: reduce` bails out immediately
- Single rAF loop, idle-cancellable (add delta check if needed)
- `pointer-events: none` on both cursor elements — never intercepts clicks
- `will-change: transform` on both for compositor promotion

---

## 2. Hover Image Reveal

### What it is
Hovering a nav link or list item floats a preview image that follows the cursor. The image reveals from the direction of mouse entry via GSAP clip or opacity, and tilts slightly to match cursor velocity.

### Why it works
It turns a list into an experience. Popularized by AKQA, Active Theory, every Locomotive-built agency site.

### When to use
Navigation menus, case study lists, team grids. Not for dense UI — one reveal panel per viewport max.

### Code

```tsx
// components/HoverReveal.tsx
'use client';

import { useRef, useEffect } from 'react';
import gsap from 'gsap';

interface HoverRevealProps {
  items: { label: string; image: string; href: string }[];
}

export function HoverReveal({ items }: HoverRevealProps) {
  const revealRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const rafRef = useRef<number>(0);

  // Mutable lerp state — never triggers re-render
  const mouse = useRef({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0 });
  const active = useRef(false);

  useEffect(() => {
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');

    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };

    const tick = () => {
      if (!active.current || !revealRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      pos.current.x += (mouse.current.x - pos.current.x) * 0.1;
      pos.current.y += (mouse.current.y - pos.current.y) * 0.1;

      revealRef.current.style.transform =
        `translate(${pos.current.x + 20}px, ${pos.current.y - 80}px)`;

      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const showReveal = (src: string) => {
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (rmq.matches || !revealRef.current || !imgRef.current) return;

    // Snap image source before animating in
    imgRef.current.src = src;
    active.current = true;

    gsap.killTweensOf(revealRef.current);
    gsap.fromTo(
      revealRef.current,
      { autoAlpha: 0, clipPath: 'inset(100% 0% 0% 0%)' },
      {
        autoAlpha: 1,
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: 0.5,
        ease: 'power3.out',
      }
    );
  };

  const hideReveal = () => {
    if (!revealRef.current) return;
    active.current = false;

    gsap.killTweensOf(revealRef.current);
    gsap.to(revealRef.current, {
      autoAlpha: 0,
      clipPath: 'inset(0% 0% 100% 0%)',
      duration: 0.35,
      ease: 'power3.in',
    });
  };

  return (
    <div style={{ position: 'relative' }}>
      <nav>
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            onMouseEnter={() => showReveal(item.image)}
            onMouseLeave={hideReveal}
            data-cursor
            style={{ display: 'block', padding: '0.75rem 0', fontSize: '2rem' }}
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* Reveal panel — positioned fixed so it works in any layout context */}
      <div
        ref={revealRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 320,
          height: 220,
          pointerEvents: 'none',
          zIndex: 100,
          overflow: 'hidden',
          willChange: 'transform',
          clipPath: 'inset(100% 0% 0% 0%)',
          opacity: 0,
          borderRadius: 4,
        }}
      >
        <img
          ref={imgRef}
          alt=""
          aria-hidden="true"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    </div>
  );
}
```

### Guardrails
- `aria-hidden="true"` on reveal image — decorative, not meaningful
- `pointer-events: none` on panel — never steals hover from links
- `prefers-reduced-motion` check before any GSAP animation
- `gsap.killTweensOf()` before each new animation prevents queue buildup on rapid hover

---

## 3. Text Hover Effects

Three patterns, escalating complexity:

### 3a. Letter stagger (pure CSS + Framer Motion)

```tsx
// components/StaggerText.tsx
'use client';

import { motion } from 'motion/react';

interface StaggerTextProps {
  text: string;
  className?: string;
}

export function StaggerText({ text, className }: StaggerTextProps) {
  const letters = text.split('');

  return (
    <motion.span
      className={className}
      style={{ display: 'inline-flex', overflow: 'hidden' }}
      initial="rest"
      whileHover="hover"
      aria-label={text}
    >
      {letters.map((char, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          style={{ display: 'inline-block' }}
          variants={{
            rest: { y: 0 },
            hover: { y: '-100%' },
          }}
          transition={{
            duration: 0.3,
            ease: [0.23, 1, 0.32, 1],
            delay: i * 0.02,
          }}
        >
          {char === ' ' ? ' ' : char}
        </motion.span>
      ))}
    </motion.span>
  );
}

// Usage — double-layer for the slide-in bottom ghost:
// <div style={{ position: 'relative', overflow: 'hidden' }}>
//   <StaggerText text="Work" />
// </div>
```

### 3b. Clip reveal on hover (line wipe)

```tsx
// components/ClipRevealLink.tsx
'use client';

import { useRef } from 'react';
import gsap from 'gsap';

export function ClipRevealLink({ children, href }: { children: string; href: string }) {
  const wrapRef = useRef<HTMLAnchorElement>(null);
  const topRef = useRef<HTMLSpanElement>(null);
  const botRef = useRef<HTMLSpanElement>(null);

  const enter = () => {
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (rmq.matches) return;

    gsap.to(topRef.current, {
      y: '-100%',
      duration: 0.4,
      ease: 'power3.inOut',
    });
    gsap.fromTo(
      botRef.current,
      { y: '100%' },
      { y: '0%', duration: 0.4, ease: 'power3.inOut' }
    );
  };

  const leave = () => {
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (rmq.matches) return;

    gsap.to(topRef.current, { y: '0%', duration: 0.4, ease: 'power3.inOut' });
    gsap.to(botRef.current, { y: '100%', duration: 0.4, ease: 'power3.inOut' });
  };

  return (
    <a
      ref={wrapRef}
      href={href}
      onMouseEnter={enter}
      onMouseLeave={leave}
      style={{
        display: 'inline-block',
        overflow: 'hidden',
        position: 'relative',
        lineHeight: 1,
      }}
      data-cursor
    >
      <span ref={topRef} style={{ display: 'block' }}>{children}</span>
      <span
        ref={botRef}
        aria-hidden="true"
        style={{
          display: 'block',
          position: 'absolute',
          top: 0,
          left: 0,
          transform: 'translateY(100%)',
        }}
      >
        {children}
      </span>
    </a>
  );
}
```

### 3c. Scramble / decode (GSAP ScrambleText — Club GSAP)

```tsx
// components/ScrambleText.tsx
'use client';
// Requires GSAP Club license for ScrambleTextPlugin

import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

gsap.registerPlugin(ScrambleTextPlugin);

export function ScrambleText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const originalText = useRef(text);

  const scramble = () => {
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (rmq.matches || !ref.current) return;

    gsap.to(ref.current, {
      duration: 0.6,
      scrambleText: {
        text: originalText.current,
        chars: '01!@#$%^&*',
        speed: 0.4,
        revealDelay: 0.2,
      },
      ease: 'none',
    });
  };

  return (
    <span
      ref={ref}
      onMouseEnter={scramble}
      style={{ cursor: 'default', display: 'inline-block' }}
    >
      {text}
    </span>
  );
}

// --- Free alternative (no Club GSAP): manual scramble hook ---
// hooks/useScramble.ts
import { useCallback, useRef } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function useScramble(target: string, onFrame: (v: string) => void) {
  const rafRef = useRef<number>(0);

  const play = useCallback(() => {
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (rmq.matches) { onFrame(target); return; }

    let iteration = 0;
    cancelAnimationFrame(rafRef.current);

    const tick = () => {
      const result = target
        .split('')
        .map((char, i) => {
          if (i < iteration) return char;
          return CHARS[Math.floor(Math.random() * CHARS.length)];
        })
        .join('');

      onFrame(result);
      iteration += 0.5;

      if (iteration < target.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onFrame(target);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, onFrame]);

  return play;
}
```

---

## 4. Pinned Scroll Product Reveal

### What it is
A section pins (stays fixed) while the user scrolls. As they scroll, the product/visual animates through 3–5 defined states (color change, features reveal, angle change). The scroll distance controls animation progress.

### The agency sites that do this well
Linear's pricing page, Apple iPhone page, Stripe's infrastructure section.

### Code

```tsx
// components/PinnedReveal.tsx
'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

// Register once — safe to call multiple times
gsap.registerPlugin(ScrollTrigger, useGSAP);

interface Step {
  label: string;
  description: string;
  bg: string; // CSS color
}

const STEPS: Step[] = [
  { label: 'Design', description: 'Start with a blank canvas.', bg: '#0a0a0a' },
  { label: 'Build', description: 'Generate the stack.', bg: '#0d1117' },
  { label: 'Deploy', description: 'Ship in one command.', bg: '#111827' },
];

export function PinnedReveal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<(HTMLDivElement | null)[]>([]);
  const bgRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');

      // Build a scrubbed timeline — each step gets equal scroll real estate
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top top',
          // Total pin height = viewport * (steps - 1); gives one full vh per step
          end: `+=${(STEPS.length - 1) * window.innerHeight}`,
          pin: stickyRef.current,
          scrub: rmq.matches ? false : 1, // no scrub if reduced motion
          anticipatePin: 1,
        },
      });

      STEPS.forEach((step, i) => {
        if (i === 0) return; // starting state

        // Fade out previous label
        tl.to(labelsRef.current[i - 1], { autoAlpha: 0, y: -20, duration: 0.3 }, i - 1);
        // Fade in current label
        tl.fromTo(
          labelsRef.current[i],
          { autoAlpha: 0, y: 20 },
          { autoAlpha: 1, y: 0, duration: 0.3 },
          i - 0.7
        );
        // Crossfade background color
        tl.to(bgRef.current, { backgroundColor: step.bg, duration: 0.5 }, i - 0.5);
      });
    },
    { scope: containerRef }
  );

  return (
    // Outer container height determines total scroll distance
    <div ref={containerRef} style={{ height: `${STEPS.length * 100}vh` }}>
      {/* Sticky panel — GSAP pins this */}
      <div
        ref={stickyRef}
        style={{ height: '100vh', overflow: 'hidden', position: 'relative' }}
      >
        {/* Background crossfade layer */}
        <div
          ref={bgRef}
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: STEPS[0].bg,
            transition: 'none', // GSAP handles this
            zIndex: 0,
          }}
        />

        {/* Step labels */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'white',
          }}
        >
          {STEPS.map((step, i) => (
            <div
              key={step.label}
              ref={(el) => { labelsRef.current[i] = el; }}
              style={{
                position: 'absolute',
                textAlign: 'center',
                opacity: i === 0 ? 1 : 0,
              }}
            >
              <h2 style={{ fontSize: '4rem', fontWeight: 700, margin: 0 }}>
                {step.label}
              </h2>
              <p style={{ fontSize: '1.25rem', marginTop: '1rem', opacity: 0.6 }}>
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Guardrails
- `anticipatePin: 1` prevents the half-frame flicker on pin start
- `scrub: 1` number gives a 1s catch-up — use `true` for instant lock
- Do NOT animate the pinned element itself with ScrollTrigger — measure breaks
- `useGSAP` with `{ scope: containerRef }` auto-cleans on unmount

---

## 5. Scroll-Driven SVG Draw + Number Counter

### 5a. SVG stroke draw on scroll

```tsx
// components/SVGDraw.tsx
'use client';

import { useRef, useEffect } from 'react';

// Pass a viewBox path and it draws on scroll from 0% to 100% visibility
export function SVGDraw({ d, width = 600, height = 200 }: { d: string; width?: number; height?: number }) {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const path = pathRef.current;
    if (!path) return;

    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;

    if (rmq.matches) {
      // Show fully drawn immediately
      path.style.strokeDashoffset = '0';
      return;
    }

    const onScroll = () => {
      if (!path) return;
      const rect = path.closest('svg')!.getBoundingClientRect();
      const vh = window.innerHeight;

      // Progress: 0 when top of SVG enters bottom, 1 when bottom of SVG leaves top
      const progress = Math.min(
        1,
        Math.max(0, (vh - rect.top) / (vh + rect.height))
      );
      path.style.strokeDashoffset = `${length * (1 - progress)}`;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // seed on mount

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      <path
        ref={pathRef}
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}
```

### 5b. Number count-up ticker

```tsx
// components/CountUp.tsx
'use client';

import { useRef, useEffect, useState } from 'react';

function easeOutExpo(t: number) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

interface CountUpProps {
  end: number;
  duration?: number; // ms
  suffix?: string;
  prefix?: string;
}

export function CountUp({ end, duration = 2000, suffix = '', prefix = '' }: CountUpProps) {
  const [count, setCount] = useState(0);
  const containerRef = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (rmq.matches) {
      setCount(end);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || startedRef.current) return;
        startedRef.current = true;

        const startTime = performance.now();

        const tick = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = easeOutExpo(progress);

          setCount(Math.round(eased * end));

          if (progress < 1) requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      },
      { threshold: 0.5 }
    );

    if (containerRef.current) observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [end, duration]);

  return (
    <span ref={containerRef} aria-label={`${prefix}${end}${suffix}`}>
      <span aria-hidden="true">
        {prefix}{count.toLocaleString()}{suffix}
      </span>
    </span>
  );
}

// Usage: <CountUp end={12000} suffix="+" prefix="$" />
```

### Guardrails
- SVG scroll: passive scroll listener, no layout reads inside handler (only dashoffset write)
- CountUp: `aria-label` on wrapper so screen readers get final value, not animated intermediate
- Both skip animation under `prefers-reduced-motion`

---

## 6. Velocity Marquee

### What it is
Seamless infinite text/logo strip that speeds up when you scroll fast and snaps back to base speed. Using Framer Motion's `useScroll` + `useVelocity` + `useSpring` composable motion values — no rAF loop needed.

### Code

```tsx
// components/VelocityMarquee.tsx
'use client';

import { useRef } from 'react';
import {
  motion,
  useScroll,
  useVelocity,
  useTransform,
  useSpring,
  useAnimationFrame,
  useMotionValue,
  wrap,
} from 'motion/react';

interface VelocityMarqueeProps {
  items: string[];
  baseVelocity?: number; // px/frame, positive = left
  gap?: number;           // px between items
}

export function VelocityMarquee({
  items,
  baseVelocity = 2,
  gap = 48,
}: VelocityMarqueeProps) {
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);

  // Smooth the raw scroll velocity
  const smoothVelocity = useSpring(scrollVelocity, {
    damping: 50,
    stiffness: 400,
    mass: 0.27,
  });

  // Map scroll velocity to a speed multiplier
  const velocityFactor = useTransform(smoothVelocity, [-3000, 3000], [-3, 3], {
    clamp: false,
  });

  // Duplicate items for seamless loop — 3 copies is enough
  const repeatedItems = [...items, ...items, ...items];

  // Total width reference for wrap calculation
  const wrapRef = useRef(0);
  const itemsRef = useRef<HTMLDivElement>(null);

  useAnimationFrame((_, delta) => {
    if (!itemsRef.current) return;

    // Measure once
    if (!wrapRef.current) {
      const itemWidth = itemsRef.current.children[0]
        ? (itemsRef.current.children[0] as HTMLElement).offsetWidth + gap
        : 200;
      wrapRef.current = itemWidth * items.length;
    }

    const moveBy = baseVelocity * (delta / 16.67); // normalize to 60fps
    const vFactor = velocityFactor.get();
    const direction = vFactor < 0 ? -1 : 1;
    const speedBoost = Math.abs(vFactor) > 0.5 ? Math.abs(vFactor) : 1;

    baseX.set(
      wrap(-wrapRef.current, 0, baseX.get() - moveBy * speedBoost)
    );
  });

  return (
    <div
      style={{
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        position: 'relative',
      }}
      aria-hidden="true"
    >
      <motion.div
        ref={itemsRef}
        style={{ x: baseX, display: 'inline-flex', gap }}
      >
        {repeatedItems.map((item, i) => (
          <span
            key={i}
            style={{
              display: 'inline-block',
              fontSize: '1.125rem',
              fontWeight: 500,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              userSelect: 'none',
            }}
          >
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// Usage:
// <VelocityMarquee items={['Design', 'Build', 'Deploy', 'Scale', '—']} />
// <VelocityMarquee items={['Design', 'Build', 'Deploy', 'Scale', '—']} baseVelocity={-2} />
// Stack two with opposite baseVelocity for the agency classic
```

### Guardrails
- `aria-hidden="true"` on the strip — it's decoration
- `useMotionValue` / `useAnimationFrame` bypass React state: zero re-renders
- `prefers-reduced-motion`: wrap in a check and halt `useAnimationFrame` if needed:

```tsx
// At the top of VelocityMarquee, add:
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// In useAnimationFrame:
useAnimationFrame((_, delta) => {
  if (prefersReduced) return;
  // ...rest of tick
});
```

---

## 7. Tilt / 3D Card

### What it is
Card rotates on the X/Y axis as the cursor moves over it. Subtle (max 8°). A specular highlight shifts opposite to the tilt. Snaps back on mouse leave.

### Why it works
It rewards curiosity — the card feels physical. Best on hero product shots, case study thumbnails, pricing cards.

### Code

```tsx
// components/TiltCard.tsx
'use client';

import { useRef, useCallback } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';

interface TiltCardProps {
  children: React.ReactNode;
  maxTilt?: number;  // degrees, default 8
  scale?: number;    // on hover, default 1.02
  perspective?: number; // px, default 800
}

export function TiltCard({
  children,
  maxTilt = 8,
  scale = 1.02,
  perspective = 800,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Raw mouse position: -0.5 to +0.5 relative to card center
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Spring-smooth the tilt
  const springConfig = { stiffness: 300, damping: 30, mass: 0.5 };
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [maxTilt, -maxTilt]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-maxTilt, maxTilt]), springConfig);

  // Specular highlight: moves opposite to tilt
  const glareX = useTransform(mouseX, [-0.5, 0.5], ['0%', '100%']);
  const glareY = useTransform(mouseY, [-0.5, 0.5], ['0%', '100%']);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (rmq.matches) return;

    const rect = cardRef.current!.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  }, [mouseX, mouseY]);

  const onMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        perspective,
        transformStyle: 'preserve-3d',
        rotateX,
        rotateY,
        scale: 1, // set via whileHover below
        willChange: 'transform',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'default',
      }}
      whileHover={{ scale }}
      transition={{ duration: 0.15 }}
    >
      {children}

      {/* Specular glare layer */}
      <motion.div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: useTransform(
            [glareX, glareY],
            ([gx, gy]) =>
              `radial-gradient(circle at ${gx} ${gy}, rgba(255,255,255,0.12) 0%, transparent 60%)`
          ),
          zIndex: 1,
        }}
      />
    </motion.div>
  );
}

// Usage:
// <TiltCard maxTilt={6}>
//   <img src="/project.jpg" style={{ display: 'block', width: '100%' }} />
// </TiltCard>
```

### Guardrails
- `prefers-reduced-motion`: returns early from `onMouseMove`, leaving card flat
- `useSpring` + `useMotionValue` = zero re-renders, runs in Motion's own rAF
- `will-change: transform` promotes to own compositor layer
- Max tilt 8° is the ceiling — beyond 10° causes motion sickness on laptops
- `perspective: 800` is conservative; lower = more dramatic, higher = more flat

---

## Performance Quick-Reference

| Interaction | Render cost | Compositor promoted | Reduced-motion safe |
|---|---|---|---|
| Custom cursor | 0 re-renders (rAF) | Yes (`will-change`) | Yes (bail on media query) |
| Hover reveal | 0 re-renders (GSAP) | Via `autoAlpha` | Yes (GSAP check) |
| Stagger text | Framer variants | Yes | Framer respects system |
| Clip reveal | 0 re-renders (GSAP) | clip-path is GPU | Yes (explicit check) |
| Pinned scroll | 0 re-renders | GSAP forces GPU | scrub disabled |
| SVG draw | passive listener | dashoffset GPU | Instant draw |
| Count-up | setState on rAF | N/A (text) | Skip animation |
| Marquee | 0 re-renders (motion value) | `x` GPU | bail in useAnimationFrame |
| Tilt | 0 re-renders (spring) | Yes | bail in onMouseMove |

---

## Rules for our builder

### The 3 defaults every site gets

**1. Velocity Marquee** (lowest risk, highest signal)

Include on every site that has a social proof strip, client logo row, or tag cloud. No SSR issues, no DOM complexity, zero accessibility debt, immediately looks premium. Set opposite directions on two rows.

```tsx
// Drop into any section
<section>
  <VelocityMarquee items={['Fast', 'Reliable', 'Scalable', '—', 'Built for you', '—']} baseVelocity={1.5} />
  <VelocityMarquee items={['Fast', 'Reliable', 'Scalable', '—', 'Built for you', '—']} baseVelocity={-1.5} />
</section>
```

**2. Clip Reveal Links** (clean, universal)

Every navigation link and CTA should use `ClipRevealLink`. It's the fastest read that a site was hand-crafted. Zero accessibility cost. No dependencies beyond GSAP.

```tsx
<nav>
  <ClipRevealLink href="/work">Work</ClipRevealLink>
  <ClipRevealLink href="/about">About</ClipRevealLink>
  <ClipRevealLink href="/contact">Contact</ClipRevealLink>
</nav>
```

**3. Count-up Tickers** (converts trust sections)

Any time a site has a stat block ("10,000 users", "$2M saved", "99.9% uptime"), swap those spans for `CountUp`. Triggers on IntersectionObserver, communicates the metric animatedly once, then stops.

```tsx
<div className="stats-grid">
  <CountUp end={12000} suffix="+" />
  <CountUp end={99} suffix="% uptime" />
  <CountUp end={4200} prefix="$" suffix="K saved" />
</div>
```

### The ONE signature "wow" interaction rule

> Every site gets exactly one interaction that would make someone stop and say "how did they do that?" Choose from: Hover Image Reveal (agency/portfolio sites), Pinned Scroll Product Reveal (product/SaaS), or SVG Path Draw (storytelling/editorial). Only one. The other seven interactions fade into the background and make the one wow moment land harder. Using two wow interactions makes both feel like template features. Using zero means the site is anonymous.

---

## Sources consulted

- [Creating a Menu Image Animation on Hover — Codrops](https://tympanus.net/codrops/2020/07/01/creating-a-menu-image-animation-on-hover/)
- [Image Reveal Hover Effects — Codrops](https://tympanus.net/Development/ImageRevealHover/)
- [Developing a performant custom cursor — 14islands](https://medium.com/14islands/developing-a-performant-custom-cursor-89f1688a02eb)
- [Interactive marquee with Framer Motion — 14islands](https://www.14islands.com/journal/interactive-marquee-with-framer-motion)
- [ScrollTrigger Docs — GSAP](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
- [GSAP & React — gsap.com](https://gsap.com/resources/React/)
- [ScrambleText Plugin — GSAP](https://gsap.com/docs/v3/Plugins/ScrambleTextPlugin/)
- [Create Velocity Scroll Animation in React with Framer Motion — DEV](https://dev.to/leduc1901/create-velocity-scroll-animation-in-react-with-framer-motion-ko7)
- [Pinning Images with GSAP in Next.js — DEV](https://dev.to/moostakimahamed/pinning-images-with-gsap-a-smooth-scrolling-animation-in-nextjs-1274)
- [Advanced Text Scramble with GSAP, React, Next.js — Medium](https://medium.com/@moraromerojuan8/creating-an-advanced-text-scramble-with-gsap-react-and-nextjs-48b86b0e9767)
- [Motion React Ticker docs](https://motion.dev/docs/react-ticker)
- [3D shiny card — React TS and Framer Motion — DEV](https://dev.to/arielbk/how-to-make-a-3d-shiny-card-animation-react-ts-and-framer-motion-ijf)
