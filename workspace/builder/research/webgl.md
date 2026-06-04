# WebGL / 3D Visual Accents Playbook

> Stack: React Three Fiber v9 (`@react-three/fiber`), `@react-three/drei`, `three`, Next.js 15 App Router.  
> All Canvas components must be dynamically imported with `{ ssr: false }`.

---

## 1. When 3D Is Worth It vs. Overkill

### The taste rule

3D earns its keep when it communicates something that flat design cannot — physical weight, spatial depth, responsive material. It becomes overkill when it is decoration that slows the page without adding meaning.

### Decision matrix

| Product type | Right effect | Skip 3D if |
|---|---|---|
| AI / infra / devtools | Subtle shader gradient bg, particle field | Heavy model loads, orbit controls |
| Hardware / physical product | Orbiting product model, scroll-linked rotation | More than 1 product mesh on hero |
| Creative agency / portfolio | Full-bleed WebGL scene, custom shaders | Client is b2b SaaS with conversion goal |
| B2B SaaS landing | CSS animated gradient, maybe a soft glow plane | Any effect > 80 KB extra JS |
| E-commerce | Product viewer (drei `<PresentationControls>`) | Particle fields (irrelevant to product) |
| Data / analytics | Canvas 2D chart accents, no 3D | Any GPU-heavy scene |

### Performance budget — hard limits

- **Initial JS budget for visual accent: 80 KB gzipped.** Three + R3F + drei minified is ~180 KB gzipped total — acceptable only if lazy-loaded behind a dynamic import.
- **Low-end device target:** Pixel 4a / iPhone 11 / Intel HD 620 laptop. Target 30 fps minimum on these.
- **DPR cap:** `[1, 1.5]` always. Never let retina devices render at native 3x — that is 9x the fragment work.
- **Draw calls:** stay under 10 for a hero accent. Use `instancedMesh` the moment you have > 1 repeated object.
- **Total triangles:** under 50k for a background effect.
- **Frame budget:** GPU frame time < 8ms at 1.5 DPR on the target device.

### The offscreen rule

If the canvas is not in the viewport, stop rendering. Full stop. Do this with `IntersectionObserver` + `frameloop="never"`.

---

## 2. Animated Gradient-Mesh Hero — 3 Ways

### 2a. Pure CSS animated gradient (reliable everywhere, ship this first)

This is the Stripe-style look done in CSS. Works with zero JS, zero GPU, no fallback needed. Ships on every device.

```tsx
// components/GradientHero.tsx
// No imports needed — pure CSS via Tailwind/inline styles.

export function GradientHero({ children }: { children: React.ReactNode }) {
  return (
    <section className="gradient-hero">
      {children}
    </section>
  );
}
```

```css
/* globals.css  —  add these */

.gradient-hero {
  position: relative;
  min-height: 100vh;
  background: #0a0a0f;
  overflow: hidden;
}

/* The mesh: 4–6 radial gradients animating their positions */
.gradient-hero::before {
  content: "";
  position: absolute;
  inset: -50%;          /* oversized so edges don't clip when positions animate */
  width: 200%;
  height: 200%;
  background:
    radial-gradient(ellipse 80% 60% at 20% 30%, hsla(258, 80%, 55%, 0.55) 0%, transparent 65%),
    radial-gradient(ellipse 60% 80% at 80% 20%, hsla(200, 90%, 60%, 0.45) 0%, transparent 60%),
    radial-gradient(ellipse 70% 50% at 50% 80%, hsla(280, 70%, 50%, 0.40) 0%, transparent 55%),
    radial-gradient(ellipse 50% 70% at 10% 70%, hsla(220, 85%, 55%, 0.35) 0%, transparent 60%),
    radial-gradient(ellipse 90% 40% at 90% 90%, hsla(240, 75%, 45%, 0.30) 0%, transparent 65%);
  animation: gradient-shift 18s ease-in-out infinite alternate;
  will-change: transform;   /* promotes to compositor layer — no layout/paint cost */
}

@keyframes gradient-shift {
  0%   { transform: translate(0%, 0%) rotate(0deg); }
  25%  { transform: translate(-3%, 4%) rotate(1.5deg); }
  50%  { transform: translate(4%, -2%) rotate(-1deg); }
  75%  { transform: translate(-2%, -4%) rotate(2deg); }
  100% { transform: translate(3%, 3%) rotate(-0.5deg); }
}

/* Reduced-motion: freeze the animation, keep the color */
@media (prefers-reduced-motion: reduce) {
  .gradient-hero::before {
    animation: none;
  }
}

/* Noise texture overlay — kills the banding, makes it look shader-grade */
.gradient-hero::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px 256px;
  pointer-events: none;
  opacity: 0.5;
}
```

Key points:
- `transform` on `::before` is GPU-composited — zero repaint cost.
- The SVG noise overlay eliminates gradient banding without any JS.
- Animation runs at 18s — slow enough to feel alive, not distracting.
- `prefers-reduced-motion` degrades gracefully.

---

### 2b. Canvas 2D animated gradient

Use when you need JS-driven interactivity (mouse tracking) but don't want the R3F bundle.

```tsx
// components/CanvasGradient.tsx
"use client";

import { useEffect, useRef } from "react";

export function CanvasGradient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isVisible = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Pause when offscreen
    observerRef.current = new IntersectionObserver(([entry]) => {
      isVisible.current = entry.isIntersecting;
    });
    observerRef.current.observe(canvas);

    // Resize handler
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Orbs: each has a position, velocity, radius, and color
    const orbs = [
      { x: 0.2, y: 0.3, vx: 0.0003, vy: 0.0002, r: 0.6, color: "hsla(258,80%,55%,0.55)" },
      { x: 0.8, y: 0.2, vx: -0.0002, vy: 0.0003, r: 0.5, color: "hsla(200,90%,60%,0.45)" },
      { x: 0.5, y: 0.8, vx: 0.0002, vy: -0.0003, r: 0.55, color: "hsla(280,70%,50%,0.40)" },
      { x: 0.1, y: 0.7, vx: 0.0003, vy: -0.0002, r: 0.45, color: "hsla(220,85%,55%,0.35)" },
    ];

    const draw = () => {
      if (!isVisible.current) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, width, height);

      for (const orb of orbs) {
        orb.x += orb.vx;
        orb.y += orb.vy;
        // Bounce
        if (orb.x < 0 || orb.x > 1) orb.vx *= -1;
        if (orb.y < 0 || orb.y > 1) orb.vy *= -1;

        const grd = ctx.createRadialGradient(
          orb.x * width, orb.y * height, 0,
          orb.x * width, orb.y * height, orb.r * Math.max(width, height) * 0.6
        );
        grd.addColorStop(0, orb.color);
        grd.addColorStop(1, "transparent");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, width, height);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    // Respect reduced-motion
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      rafRef.current = requestAnimationFrame(draw);
    } else {
      // Static single frame
      draw();
      cancelAnimationFrame(rafRef.current);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      observerRef.current?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
      }}
    />
  );
}
```

---

### 2c. R3F shader plane (Stripe-grade moving mesh gradient)

This is the full GPU path. Only use it when the CSS version isn't rich enough — e.g. you need 3D noise distortion or mouse-reactive warping.

```glsl
// shaders/gradient.vert.glsl
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

```glsl
// shaders/gradient.frag.glsl
uniform float uTime;
uniform vec2  uResolution;
varying vec2  vUv;

// Value noise — lightweight, no trig
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x),
    u.y
  );
}

// 3 octaves of fbm
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p  = p * 2.2 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  float t = uTime * 0.18;

  // Warp the UV by fbm twice for the mesh-like distortion
  vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(1.0)));
  vec2 r = vec2(fbm(uv + 1.5 * q + vec2(1.7, 9.2) + 0.15 * t),
                fbm(uv + 1.5 * q + vec2(8.3, 2.8) + 0.126 * t));
  float f = fbm(uv + 1.8 * r);

  // Color ramp: dark purple → electric indigo → sky
  vec3 col = mix(
    vec3(0.04, 0.02, 0.12),          // near-black purple
    vec3(0.15, 0.08, 0.65),          // indigo
    clamp(f * f * 3.0, 0.0, 1.0)
  );
  col = mix(col, vec3(0.10, 0.40, 0.90), clamp(f * 2.5, 0.0, 1.0)); // sky blue highlight

  // Subtle vignette
  float vig = 1.0 - 0.6 * length(uv - 0.5);
  col *= vig;

  gl_FragColor = vec4(col, 1.0);
}
```

```tsx
// components/GradientPlane.tsx  — the R3F scene component
"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import vertGlsl from "@/shaders/gradient.vert.glsl";
import fragGlsl from "@/shaders/gradient.frag.glsl";

export function GradientPlane() {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    }),
    []
  );

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
  });

  return (
    // 2 × 2 world-space plane fills the viewport when camera z = 1 and fov ~60
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertGlsl}
        fragmentShader={fragGlsl}
        uniforms={uniforms}
      />
    </mesh>
  );
}
```

```tsx
// components/GradientCanvas.tsx  — Next.js wrapper with ALL guardrails
"use client";

import { useRef, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { GradientPlane } from "./GradientPlane";

// Detect WebGL support
function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

export function GradientCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [frameloop, setFrameloop] = useState<"always" | "never">("always");
  const [dpr, setDpr] = useState<[number, number]>([1, 1.5]);
  const [supported, setSupported] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // WebGL check
    if (!hasWebGL()) { setSupported(false); return; }

    // Reduced-motion check
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) { setReducedMotion(true); return; }
    mq.addEventListener("change", (e) => setReducedMotion(e.matches));

    // Pause when offscreen
    const observer = new IntersectionObserver(
      ([entry]) => setFrameloop(entry.isIntersecting ? "always" : "never"),
      { threshold: 0.01 }
    );
    if (containerRef.current) observer.observe(containerRef.current);

    // Pause when tab is hidden
    const onVisibility = () =>
      setFrameloop(document.hidden ? "never" : "always");
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Fallback: CSS gradient (same visual intent, zero JS cost)
  if (!supported || reducedMotion) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 60% at 20% 30%, hsla(258,80%,55%,0.55), transparent 65%)," +
            "radial-gradient(ellipse 60% 80% at 80% 20%, hsla(200,90%,60%,0.45), transparent 60%)," +
            "#0a0a0f",
        }}
      />
    );
  }

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      <Canvas
        dpr={dpr}
        frameloop={frameloop}
        camera={{ position: [0, 0, 1], fov: 60 }}
        gl={{ antialias: false, powerPreference: "low-power" }}
        style={{ background: "#0a0a0f" }}
      >
        <PerformanceMonitor
          onDecline={() => setDpr([1, 1])}   // floor DPR on struggling devices
          onIncline={() => setDpr([1, 1.5])} // restore if headroom returns
        >
          <GradientPlane />
        </PerformanceMonitor>
      </Canvas>
    </div>
  );
}
```

```tsx
// app/page.tsx  (or any page)  — dynamic import is MANDATORY
import dynamic from "next/dynamic";

const GradientCanvas = dynamic(
  () => import("@/components/GradientCanvas").then((m) => m.GradientCanvas),
  {
    ssr: false,                           // WebGL does not exist in Node
    loading: () => (                      // instant CSS placeholder while JS loads
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 60% at 20% 30%, hsla(258,80%,55%,0.40), transparent 65%)," +
            "#0a0a0f",
        }}
      />
    ),
  }
);

export default function Home() {
  return (
    <section style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>
      <GradientCanvas />
      {/* Content sits above the canvas via z-index */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <h1>Your headline</h1>
      </div>
    </section>
  );
}
```

> Note: to import `.glsl` files in Next.js, add `raw-loader` or use `webpack` config:
> ```js
> // next.config.ts
> config.module.rules.push({ test: /\.glsl$/, use: "raw-loader" });
> ```
> Or inline the shader strings directly in the component to avoid the loader dependency.

---

## 3. Particle Field Hero

Floating points in space — tasteful for AI, infra, and data products. 1,500–3,000 points is the sweet spot: dense enough to read as a field, light enough to run on mobile.

```tsx
// components/ParticleField.tsx
"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const VERTEX = `
  uniform float uTime;
  attribute float aOffset;
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    // Gentle vertical drift + subtle wave
    pos.y += mod(aOffset + uTime * 0.06, 4.0) - 2.0;
    pos.x += sin(uTime * 0.3 + aOffset * 2.1) * 0.04;

    vec4 mvp = modelViewMatrix * vec4(pos, 1.0);
    gl_Position  = projectionMatrix * mvp;
    gl_PointSize = (1.2 / -mvp.z) * 300.0;  // perspective size

    // Fade near clip planes
    vAlpha = smoothstep(3.5, 2.0, -mvp.z) * smoothstep(0.2, 1.0, mod(aOffset + uTime * 0.06, 4.0) / 4.0);
  }
`;

const FRAGMENT = `
  varying float vAlpha;

  void main() {
    // Soft disc — discard square corners
    float d = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;
    float alpha = (1.0 - d * 2.0) * vAlpha * 0.8;
    gl_FragColor = vec4(0.55, 0.65, 1.0, alpha);
  }
`;

export function ParticleField({ count = 2000 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, offsets } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const offsets   = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 8;   // x: spread
      positions[i * 3 + 1] = (Math.random() - 0.5) * 4;   // y: height band
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;   // z: depth
      offsets[i] = Math.random() * 4;                       // phase offset
    }
    return { positions, offsets };
  }, [count]);

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame(({ clock }) => {
    if (pointsRef.current) {
      (pointsRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value =
        clock.elapsedTime;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-aOffset"
          args={[offsets, 1]}
        />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
```

```tsx
// components/ParticleHero.tsx  — full Canvas with guardrails
"use client";

import { useRef, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { ParticleField } from "./ParticleField";

export function ParticleHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [frameloop, setFrameloop] = useState<"always" | "never">("always");
  const [count, setCount] = useState(2000);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setFrameloop(entry.isIntersecting ? "always" : "never"),
      { threshold: 0.01 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    const onVis = () => setFrameloop(document.hidden ? "never" : "always");
    document.addEventListener("visibilitychange", onVis);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      <Canvas
        dpr={[1, 1.5]}
        frameloop={frameloop}
        camera={{ position: [0, 0, 4], fov: 55 }}
        gl={{ antialias: false, powerPreference: "low-power" }}
      >
        <PerformanceMonitor onDecline={() => setCount(800)}>
          <ParticleField count={count} />
        </PerformanceMonitor>
      </Canvas>
    </div>
  );
}
```

Page usage — same pattern as above:
```tsx
const ParticleHero = dynamic(
  () => import("@/components/ParticleHero").then((m) => m.ParticleHero),
  { ssr: false }
);
```

---

## 4. Scroll-Linked 3D

### Option A: drei `ScrollControls` + `useScroll` (self-contained, no external scroll library)

```tsx
// components/ScrollScene.tsx
"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ScrollControls, Scroll, useScroll } from "@react-three/drei";
import * as THREE from "three";

function RotatingOrb() {
  const meshRef = useRef<THREE.Mesh>(null);
  const { offset, range } = useScroll();

  useFrame(() => {
    if (!meshRef.current) return;
    // Full Y rotation over the scroll range
    meshRef.current.rotation.y = offset * Math.PI * 2;
    // Rise from below on entry
    meshRef.current.position.y = THREE.MathUtils.lerp(-1.5, 0, range(0, 0.4));
    // Fade out (scale) on exit
    const exit = 1 - range(0.7, 0.3);
    meshRef.current.scale.setScalar(exit);
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1, 4]} />
      <meshStandardMaterial color="#6644ff" wireframe />
    </mesh>
  );
}

export function ScrollScene() {
  return (
    // pages={3}: scroll area = 3 × 100vh
    <ScrollControls pages={3} damping={0.15}>
      {/* DOM content that scrolls */}
      <Scroll html>
        <section style={{ height: "100vh", display: "flex", alignItems: "center", paddingLeft: "10vw" }}>
          <h1 style={{ color: "#fff", fontSize: "clamp(2rem,6vw,5rem)" }}>Section one</h1>
        </section>
        <section style={{ height: "100vh" }} />
        <section style={{ height: "100vh", display: "flex", alignItems: "center", paddingLeft: "10vw" }}>
          <h2 style={{ color: "#fff", fontSize: "clamp(1.5rem,4vw,3rem)" }}>Section three</h2>
        </section>
      </Scroll>
      {/* 3D content — lives inside ScrollControls, reads scroll via useScroll */}
      <RotatingOrb />
    </ScrollControls>
  );
}
```

### Option B: native scroll + `useScroll` window listener (when R3F Canvas is a background layer, not full-page)

```tsx
// hooks/useWindowScroll.ts
import { useEffect, useRef } from "react";

export function useWindowScroll(callback: (progress: number) => void) {
  const cb = useRef(callback);
  cb.current = callback;

  useEffect(() => {
    const handler = () => {
      const doc = document.documentElement;
      const progress = window.scrollY / (doc.scrollHeight - doc.clientHeight);
      cb.current(Math.min(1, Math.max(0, progress)));
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);
}
```

```tsx
// inside a component that uses useFrame
const scrollProgress = useRef(0);
useWindowScroll((p) => { scrollProgress.current = p; });

useFrame(() => {
  if (!meshRef.current) return;
  meshRef.current.rotation.y = scrollProgress.current * Math.PI * 4;
});
```

### Option C: GSAP ScrollTrigger (when you also have GSAP on the page already)

```tsx
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

useGSAP(() => {
  const obj = { rotation: 0 };
  gsap.to(obj, {
    rotation: Math.PI * 2,
    ease: "none",
    scrollTrigger: { scrub: true, start: "top top", end: "bottom bottom" },
    onUpdate: () => {
      if (meshRef.current) meshRef.current.rotation.y = obj.rotation;
    },
  });
});
```

---

## 5. Non-Negotiables Checklist

Every R3F canvas accent must satisfy all of these before shipping.

### 5.1 Dynamic import — mandatory

```tsx
// ALWAYS wrap R3F components in dynamic import with ssr:false
const HeroCanvas = dynamic(
  () => import("@/components/HeroCanvas").then((m) => m.HeroCanvas),
  {
    ssr: false,
    loading: () => <div className="hero-fallback" />,  // instant CSS placeholder
  }
);
```

Three.js references `window` and `WebGLRenderingContext` at import time. SSR will hard-crash without this.

### 5.2 DPR cap

```tsx
<Canvas dpr={[1, 1.5]}>
```

Never omit `dpr`. Retina MacBook Pro is 2x, iPhone 15 Pro is 3x. Without a cap, fragment shader runs 4–9x harder than you tested.

### 5.3 Pause when offscreen

```tsx
// In every canvas wrapper useEffect:
const observer = new IntersectionObserver(
  ([e]) => setFrameloop(e.isIntersecting ? "always" : "never"),
  { threshold: 0.01 }
);
observer.observe(containerRef.current);

document.addEventListener("visibilitychange", () =>
  setFrameloop(document.hidden ? "never" : "always")
);
```

### 5.4 PerformanceMonitor with fallback

```tsx
<PerformanceMonitor
  onDecline={() => {
    setDpr([1, 1]);      // drop to 1x DPR
    setCount((n) => Math.floor(n * 0.4));  // kill 60% of particles
  }}
>
  <YourScene />
</PerformanceMonitor>
```

### 5.5 WebGL + reduced-motion fallback

```tsx
// Always render a CSS version when WebGL is unavailable or motion is reduced
if (!hasWebGL() || prefersReducedMotion) {
  return <div className="gradient-hero" />;  // pure CSS, see section 2a
}
```

### 5.6 gl flags for efficiency

```tsx
<Canvas
  gl={{
    antialias: false,          // biggest single perf win; use FXAA in post if needed
    powerPreference: "low-power",  // hints GPU to use integrated on dual-GPU MacBooks
    depth: false,              // for full-screen 2D shader planes — no depth needed
    stencil: false,
  }}
>
```

### 5.7 Dispose geometry and material

```tsx
useEffect(() => {
  return () => {
    geometry.dispose();
    material.dispose();
    texture?.dispose();
  };
}, []);
```

### 5.8 Lazy load so it never bloats initial JS

The dynamic import in 5.1 handles this. Verify in bundle analyzer that `three` is not in the initial chunk. Target: zero Three.js bytes in first paint JS.

---

## 6. Effect–Product Decision Rule

```
Product makes / sells a physical thing?
  → Use <PresentationControls> product viewer or scroll-linked model rotation.
  → Skip particle fields.

Product is AI / software / infrastructure?
  → Shader gradient OR particle field hero.
  → Pick gradient if color/brand is the story.
  → Pick particles if "data in motion" or "network" is the metaphor.

Product is creative agency or portfolio?
  → Full WebGL scene is justified. Hire a WebGL specialist or use R3F + custom shaders.
  → Performance audit is still required.

B2B SaaS / conversion-focused landing?
  → CSS animated gradient (section 2a). No R3F unless you have a specific 3D product story.
  → Every 100ms of LCP cost loses conversion. Don't gamble it on aesthetics.

Mobile-first or emerging-market audience?
  → CSS animated gradient only.
  → Cap canvas to desktop breakpoint: `if (window.innerWidth < 768) return <CSSFallback />`.

Data / analytics dashboard?
  → Canvas 2D chart motion. No WebGL.

Scroll depth > 3 pages with storytelling?
  → ScrollControls + useScroll is the clean path.
  → GSAP ScrollTrigger if the rest of the page already uses GSAP.
```

---

## Rules for our builder

These rules apply to every component the builder generates that touches visual hero effects.

**1. Default to CSS gradient (section 2a).** Unless the user explicitly asks for 3D or WebGL, generate the CSS animated gradient. It works everywhere, ships in the initial HTML, and costs nothing.

**2. Every R3F component gets the full guardrail set from section 5** — no exceptions. The template must include: `dynamic({ ssr: false })`, `dpr={[1, 1.5]}`, IntersectionObserver pause, `PerformanceMonitor`, WebGL fallback, `powerPreference: "low-power"`, `antialias: false`.

**3. No R3F on mobile without explicit opt-in.** Wrap the Canvas render in a desktop-only guard:
```tsx
const [isMobile, setIsMobile] = useState(false);
useEffect(() => setIsMobile(window.innerWidth < 768), []);
if (isMobile) return <CSSGradientFallback />;
```

**4. Never ship Three.js in the initial JS bundle.** Verify via `next build --analyze` that the `three` chunk is not in the initial payload. Dynamic import handles this; don't undo it by importing three in a shared layout file.

**5. The CSS animated gradient hero (section 2a) is the safe, copy-pasteable default.** It covers 95% of premium hero needs: animated, smooth, looks shader-grade with the noise overlay, respects reduced-motion, runs at 0% GPU. Use it until a specific requirement forces a heavier solution.

**6. Particle count budget:** 2,000 default, 800 on PerformanceMonitor decline, 0 (CSS fallback) on mobile. Do not let the user configure it above 4,000 without a warning.

**7. Shader planes for gradient effects need `depth: false` and `stencil: false`** on the Canvas gl config. These are 2D effects rendered on a single quad — depth buffer is dead weight.

**8. When in doubt, the CSS version is not a compromise — it is the right answer.** The goal is premium feel, not technical complexity. The CSS gradient + SVG noise overlay (section 2a) is indistinguishable from a shader to most users, loads instantly, and works on every device ever made.
