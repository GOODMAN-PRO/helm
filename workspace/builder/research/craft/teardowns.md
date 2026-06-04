# Award Site Teardowns

Code-level analysis of 6 award-winning studio sites. Goal: extract what makes them feel tier-1 and map each technique to what a Next.js + Tailwind + Framer + GSAP + light-R3F build can realistically ship.

---

## 1. Lusion — lusion.co

**One signature thing:** Real-time generative WebGL with cloth simulation and procedural noise — the site *is* the demo reel.

**Visual identity:**
- Near-black background (#0a0a0a range), white type, accent colors injected per project
- Compressed grotesque display face (custom/Variable), editorial grid
- Long vertical scroll with scroll-jacked pacing between sections
- Sound design layer synced to animations

**Signature technique: Noise-driven vertex displacement + post-process displacement cursor**

The curly tubes and cloth effects use Three.js with custom GLSL vertex shaders. Curl noise (a divergence-free 3D noise field derived from Simplex noise) drives per-vertex position offsets each frame, creating organic, never-repeating movement. The cursor interaction applies a 2D displacement map as a post-processing pass on the rendered frame — not on the DOM — so the warping effect hits all underlying 3D content simultaneously.

Key shader sketch for curl noise on a tube geometry:
```glsl
// vertex shader
uniform float uTime;
uniform float uMouseInfluence;
uniform vec2 uMouse;

vec3 curlNoise(vec3 p) {
  // partial derivatives of simplex noise in each axis
  float eps = 0.0001;
  vec3 dx = vec3(eps, 0.0, 0.0);
  vec3 dy = vec3(0.0, eps, 0.0);
  vec3 dz = vec3(0.0, 0.0, eps);
  // curl = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
  ...
}

void main() {
  vec3 newPos = position + curlNoise(position * 0.5 + uTime * 0.1) * 0.3;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
}
```

Post-process cursor displacement (EffectComposer + custom ShaderPass):
```js
const displacementPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uMouse: { value: new THREE.Vector2() } },
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uMouse;
    varying vec2 vUv;
    void main() {
      float dist = distance(vUv, uMouse);
      float strength = smoothstep(0.2, 0.0, dist);
      vec2 offset = (vUv - uMouse) * strength * 0.05;
      gl_FragColor = texture2D(tDiffuse, vUv + offset);
    }
  `
});
composer.addPass(displacementPass);
```

**Borrowable for a non-WebGL-heavy build:**
- The *scroll pacing* logic: pin sections with `ScrollTrigger.pin()`, use `scrub: 1.5` for weighted feel
- Minimal 2-color palette per section with sharp color transitions at scroll markers
- Sound cues triggered by `ScrollTrigger` `onEnter` callbacks (Web Audio API, short .ogg clips)

---

## 2. Active Theory — activetheory.net

**One signature thing:** A fully navigable 3D office environment as the portfolio itself — you walk through their LA/Amsterdam studio rendered in WebGL to discover projects.

**Visual identity:**
- Deep space black, neon cyan/magenta/amber accent glows
- Alien-condensed display type (distressed, high tracking), monospace body
- Scene-based navigation replacing traditional routing
- Flickering neon light shader on geometry

**Signature technique: Scene-graph portfolio (Hydra engine) + GPU particle systems**

Active Theory built their own framework (Hydra) rather than vanilla Three.js. The key idea: each portfolio "page" is a 3D scene, and navigation triggers a cross-fade or camera-path tween between scenes. No browser routing — scene state *is* the URL.

Particle system architecture: CPU determines spawn point and lifespan (control), GPU executes physics (GPGPU — positions stored in a FloatRenderTarget, updated via ping-pong FBO shader each frame). This lets them run millions of particles at 60fps.

Neon glow on geometry is achieved with additive blending + bloom post-process:
```js
const neonMaterial = new THREE.MeshBasicMaterial({
  color: 0x00ffcc,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
// Unreal bloom pass on composer
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5,  // strength
  0.4,  // radius
  0.85  // threshold
);
```

AI navigation: they use Claude/GPT with a structured project manifest. The chat parses intent ("show me something for Nike") and calls a `navigateTo(sceneId)` function — entirely decoupled from the 3D engine.

**Borrowable:**
- Additive blending + UnrealBloomPass for neon glow on any R3F element — 4 lines of code with `@react-three/postprocessing`
- Camera-path scene transitions: tween `camera.position` and `camera.lookAt` target with GSAP along a CatmullRomCurve3 spline
- Dark neon color palette works perfectly without any 3D — just CSS `text-shadow: 0 0 20px #00ffcc` on display type

---

## 3. Obys Agency — obys.agency

**One signature thing:** Maximalist typographic kinetics — text is the animation, every headline is in motion, the cursor is a first-class UI element.

**Visual identity:**
- Stark black/white (#000 / #fff), no midtones
- Oversized serif + grotesque pairings, extreme weight contrast
- Counter-scrolling marquees, staggered grid reveals
- Custom dot cursor with magnetic pull on interactive elements

**Signature technique: Marquee + SplitText stagger + locomotive scroll + Shery.js cursor distortion**

The marquee is pure CSS + GSAP, no library:
```js
// Infinite scroll ticker
gsap.to('.marquee-inner', {
  xPercent: -50,
  ease: 'none',
  duration: 12,
  repeat: -1
});
// Speed up on scroll using lenis velocity
lenis.on('scroll', ({ velocity }) => {
  gsap.to('.marquee-inner', { timeScale: 1 + Math.abs(velocity) * 0.5 });
});
```

SplitText word-by-word reveal (the pattern spotted on nearly every award site):
```js
const split = SplitText.create('.headline', { type: 'words,lines' });
// Mask each line — the "coming up from under" effect
gsap.set(split.lines, { overflow: 'hidden' });
gsap.from(split.words, {
  yPercent: 110,
  opacity: 0,
  duration: 0.9,
  ease: 'power4.out',
  stagger: 0.06,
  scrollTrigger: { trigger: '.headline', start: 'top 85%' }
});
```

Cursor magnet effect — the core technique:
```js
document.querySelectorAll('[data-magnetic]').forEach(el => {
  el.addEventListener('mousemove', e => {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    gsap.to(el, { x: x * 0.35, y: y * 0.35, duration: 0.4, ease: 'power2.out' });
  });
  el.addEventListener('mouseleave', () => {
    gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.3)' });
  });
});
```

Shery.js `.makeScene()` applies a WebGL displacement shader to hovered images using Three.js under the hood — a canvas overlay synced to `getBoundingClientRect` of each DOM image, with simplex noise driving UV offset on hover.

Locomotive Scroll → Lenis migration: Locomotive Scroll v5 is now a thin wrapper around Lenis. The canonical Next.js setup:
```js
// providers/LenisProvider.tsx
'use client';
import Lenis from 'lenis';
import { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function LenisProvider({ children }) {
  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(time => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    return () => { lenis.destroy(); };
  }, []);
  return children;
}
```

**Borrowable:**
- The entire cursor + magnetic system above — works in Next.js with zero dependencies beyond GSAP
- Marquee with velocity-scaled speed
- SplitText stagger is the single highest-ROI animation technique from this list

---

## 4. Igloo Inc — igloo.inc (Awwwards Site of the Year 2025)

**One signature thing:** UI rendered entirely in WebGL — text, buttons, transitions — so every element can carry a shader effect (glitch, SDF scramble, ice displacement).

**Visual identity:**
- Ice-brand: deep navy + Arctic white + electric blue
- All type in WebGL for shader control; uses SDF (Signed Distance Field) fonts for crisp text at any size inside canvas
- Procedurally grown ice crystal geometry per project card
- Particle swarm in the links section, color/glow shifts by particle velocity

**Signature technique: SDF text in WebGL + procedural ice generation + GPGPU particles**

SDF text rendering lets them apply any shader to text directly — the glitch effect shuffles the SDF texture offset rather than manipulating DOM:
```glsl
// fragment: SDF text with glitch
uniform sampler2D tSDF;
uniform float uGlitch;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  uv.x += sin(uv.y * 80.0 + uTime) * uGlitch * 0.01;
  float sdf = texture2D(tSDF, uv).r;
  float alpha = smoothstep(0.48, 0.52, sdf);
  gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
}
```

Ice block generation: start with a base mesh (cube/cylinder), then iteratively add vertices displaced along surface normals with noise, constrained to stay inside the original volume bounds. Runs in Houdini for asset creation; exported as compressed glTF.

Scene transitions combine three passes simultaneously:
1. Chromatic aberration (RGB channel offset by `(uProgress - 0.5) * 0.02`)
2. Displacement using a frost/noise texture
3. Fade via `uProgress` uniform

Stack: Three.js + Svelte + GSAP + Vite. No React — they chose Svelte for reactive uniform bindings with minimal overhead.

**Borrowable:**
- Chromatic aberration on route transitions: a 3-line post-processing pass is achievable with `@react-three/postprocessing`'s `ChromaticAberration` effect
- Velocity-colored particles: color as `mix(colorA, colorB, smoothstep(0.0, 5.0, speed))`
- The "all-in-WebGL" approach is not borrowable without committing to it fully — skip for a hybrid DOM build

---

## 5. Cyd Stumpel Portfolio 2025 — cydstumpel.nl (Awwwards SOTD)

**One signature thing:** Proves native CSS (View Transitions API + scroll-driven animations) can win SOTD without any JS animation library.

**Visual identity:**
- Two-color palette: periwinkle purple (#8082F8) + seashell cream (#FFF5EE)
- Generous whitespace, restrained typography, motion as the primary differentiator
- No heavy 3D — pure layout and transition craft

**Signature technique: CSS View Transitions + scroll-driven animations**

View Transitions for page navigation (zero GSAP):
```css
/* In global CSS */
::view-transition-old(root) {
  animation: slide-out 0.4s ease-in;
}
::view-transition-new(root) {
  animation: slide-in 0.4s ease-out;
}

/* Per-element named transitions */
.hero-image { view-transition-name: hero; }
```
```js
// In Next.js link handler
document.startViewTransition(() => router.push(href));
```

Scroll-driven text reveal without JS:
```css
@keyframes reveal {
  from { opacity: 0; transform: translateY(1em); clip-path: inset(0 0 100% 0); }
  to   { opacity: 1; transform: translateY(0);   clip-path: inset(0 0 0% 0); }
}
.reveal-on-scroll {
  animation: reveal linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 30%;
}
```

The `animation-timeline: view()` API ties the animation progress directly to the element's scroll position through the viewport — no JS listener, no ScrollTrigger, just CSS.

**Borrowable:**
- `view-transition-name` on shared elements (hero image, page title) creates `magic move` transitions with ~5 lines of CSS + the `startViewTransition` wrapper — works today in Chromium, graceful fallback elsewhere
- `animation-timeline: view()` for any simple entrance reveal — replace 80% of "element enters viewport" ScrollTrigger animations with zero JS
- Two-color restrained palette + motion-as-differentiator is a viable strategy when the build can't afford full WebGL

---

## 6. Unseen Studio 2025 Wrapped — 2025.unseen.co (Awwwards SOTD)

**One signature thing:** Scroll-driven z-axis camera travel through a 3D scene — a cinematic "fly-through" timeline synced to vertical scroll.

**Visual identity:**
- Deep black (#010101) + gold (#E4B504) — maximum contrast, zero decoration
- Spaced letterforms (`l e t t e r - s p a c i n g`) as a typographic signature
- Bracketed reference labels `[US_01_25]` — systematic, editorial
- ASCII liquid sim as a hero element: a 2D character grid fed by a fluid simulation shader

**Signature technique: Scroll-synced camera path through Three.js scene + ASCII fluid shader**

Camera path tied to scroll:
```js
// CatmullRomCurve3 defined through scene keypoints
const path = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 10),
  new THREE.Vector3(2, 1, 5),
  new THREE.Vector3(-1, 0, 0),
]);

ScrollTrigger.create({
  trigger: '.scroll-container',
  start: 'top top',
  end: 'bottom bottom',
  scrub: 2,
  onUpdate: self => {
    const point = path.getPointAt(self.progress);
    const tangent = path.getTangentAt(self.progress);
    gsap.set(camera.position, { x: point.x, y: point.y, z: point.z });
    camera.lookAt(point.clone().add(tangent));
  }
});
```

ASCII fluid sim: run a Navier-Stokes solver on a low-res grid (64x64) in a fragment shader (ping-pong FBO), sample density at each grid cell, map density to character brightness using a ramp string `' .:-=+*#@'`, render as a `<pre>` or canvas 2D text grid updated each frame. Can be done without Three.js — pure canvas 2D.

```js
const chars = ' .:-=+*#@';
function renderASCII(densityBuffer) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const d = densityBuffer[y * GRID_W + x];
      const c = chars[Math.floor(d * (chars.length - 1))];
      ctx.fillText(c, x * CHAR_W, y * CHAR_H);
    }
  }
}
```

**Borrowable:**
- The scroll-to-camera-path pattern is 40 lines of code with Three.js + GSAP ScrollTrigger — highly achievable in R3F
- ASCII fluid as a hero section works with a canvas2D fallback, no WebGL required
- The typographic conventions (spaced letters, bracket labels, two-color) are pure CSS and carry the aesthetic

---

## Common DNA of Award Sites

After tearing down these six, the same patterns repeat across every winner:

**1. Scroll as a first-class input.** Every site uses scroll not just for navigation but as an animation timeline parameter. `scrub: true` (GSAP) or `animation-timeline: view()` (CSS) is the substrate. Nothing is on a timer — everything is driven by position.

**2. Text is kinetic, not static.** Every above-the-fold headline either splits into words/chars and staggers in, or is already in motion (marquee, counter, live typing). SplitText + `yPercent` from behind a clip container is the universal pattern.

**3. A single high-craft moment defines the page.** Each site has *one* thing that stops you: the Lusion cloth, Active Theory's 3D office, Igloo's particle swarm, Unseen's ASCII fluid. Everything else is purposefully quiet around it. The mistake is trying to have six wow-moments.

**4. Smooth scroll with velocity data.** Every site uses Lenis or Locomotive Scroll. The velocity value drives secondary effects (marquee speed, shader distortion intensity, cursor trail) — this is what creates the *weighted*, physical feel vs. a site that just fades things in.

**5. Constrained palette + obsessive detail in motion.** The winning color palettes are almost all 2-3 colors maximum. The creative energy goes into *how things move*, not into color complexity.

**6. Custom cursor as commitment signal.** A lagging dot-follower + magnetic pull on CTAs signals to the user they're in a crafted environment. It costs ~40 lines of GSAP and changes the perceived quality of everything around it.

---

## Rules for our builder

These are the four techniques a single build agent can implement in a Next.js + Tailwind + Framer + GSAP + light-R3F stack that will push the site toward award tier.

---

### Rule 1: Lenis + GSAP ScrollTrigger as the scroll foundation (non-negotiable)

Install: `lenis`, `gsap` (with `@gsap/react` for the `useGSAP` hook).

Wire them together once in a root provider:

```tsx
// app/providers/SmoothScroll.tsx
'use client';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect } from 'react';
gsap.registerPlugin(ScrollTrigger);

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    return () => lenis.destroy();
  }, []);
  return <>{children}</>;
}
```

Every animation from here references `lenis.velocity` for secondary effects. This gives the physical weight that separates tier-1 from tier-2.

---

### Rule 2: SplitText word-stagger on every above-the-fold headline

This is the single technique spotted on nearly every SOTD winner. The visual contract: words come up from behind a clipping container, staggered, with a power4 ease.

```tsx
// components/SplitHeadline.tsx
'use client';
import { useGSAP } from '@gsap/react';
import { SplitText } from 'gsap/SplitText';
import { gsap } from 'gsap';
import { useRef } from 'react';
gsap.registerPlugin(SplitText);

export function SplitHeadline({ children, className }: { children: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useGSAP(() => {
    const split = SplitText.create(ref.current, { type: 'words,lines', linesClass: 'line-mask' });
    // CSS for .line-mask: overflow: hidden; display: block;
    gsap.from(split.words, {
      yPercent: 110,
      opacity: 0,
      duration: 0.85,
      ease: 'power4.out',
      stagger: 0.055,
      scrollTrigger: { trigger: ref.current, start: 'top 88%', once: true },
    });
    return () => split.revert();
  }, { scope: ref });

  return <h2 ref={ref} className={className}>{children}</h2>;
}
```

Add `overflow: hidden` to `.line-mask` in global CSS. Apply to every H1, H2, pull quote.

---

### Rule 3: Magnetic cursor + custom cursor follower

40 lines, zero dependencies beyond GSAP. Changes how the entire site *feels*.

```tsx
// components/Cursor.tsx  — rendered once in root layout
'use client';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      gsap.to(dot.current,  { x: e.clientX, y: e.clientY, duration: 0.1 });
      gsap.to(ring.current, { x: e.clientX, y: e.clientY, duration: 0.45, ease: 'power2.out' });
    };
    window.addEventListener('mousemove', move);

    // Magnetic pull on [data-magnetic] elements
    document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach(el => {
      el.addEventListener('mousemove', (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        gsap.to(el, { x: x * 0.4, y: y * 0.4, duration: 0.4, ease: 'power2.out' });
        gsap.to(ring.current, { scale: 2.5, duration: 0.3 });
      });
      el.addEventListener('mouseleave', () => {
        gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.3)' });
        gsap.to(ring.current, { scale: 1, duration: 0.3 });
      });
    });

    return () => window.removeEventListener('mousemove', move);
  }, []);

  return (
    <>
      {/* dot: 8px circle, pointer-events:none, fixed, mix-blend-mode:difference */}
      <div ref={dot}  className="fixed top-0 left-0 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white mix-blend-difference pointer-events-none z-[9999]" />
      {/* ring: 32px circle outline, trails behind */}
      <div ref={ring} className="fixed top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 pointer-events-none z-[9999]" />
    </>
  );
}
```

Add `data-magnetic` to every button and nav link. Add `cursor-none` to `body`.

---

### Rule 4: Scroll-velocity marquee as a breathing element

Used by Obys, Locomotive, and dozens of SOTD winners. A marquee that accelerates with scroll velocity makes the page feel alive.

```tsx
// components/Marquee.tsx
'use client';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

export function Marquee({ text, speed = 14 }: { text: string; speed?: number }) {
  const inner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Duplicate content for seamless loop
    const anim = gsap.to(inner.current, {
      xPercent: -50,
      ease: 'none',
      duration: speed,
      repeat: -1,
    });

    // Tie speed to Lenis scroll velocity
    // Access via window.__lenis if exported globally, or use a Zustand/context store
    let raf: number;
    const tick = () => {
      const vel = (window as any).__lenis?.velocity ?? 0;
      anim.timeScale(1 + Math.abs(vel) * 0.4);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  const repeated = Array(6).fill(text).join(' — ');

  return (
    <div className="overflow-hidden whitespace-nowrap">
      <div ref={inner} className="inline-block">
        <span className="inline-block pr-8">{repeated}</span>
        <span className="inline-block pr-8" aria-hidden>{repeated}</span>
      </div>
    </div>
  );
}
```

Export the Lenis instance on `window.__lenis` in the SmoothScroll provider for cross-component velocity access.

---

**Bonus — not a rule but a 20-minute add that punches above its weight:**

Animated film-grain overlay (static, no WebGL needed):

```css
/* global.css */
body::after {
  content: '';
  position: fixed; inset: 0;
  z-index: 1000;
  pointer-events: none;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
  animation: grain 0.2s steps(1) infinite;
}
@keyframes grain {
  0%, 100% { background-position: 0 0; }
  10%  { background-position: -5% -10%; }
  20%  { background-position: -15% 5%; }
  30%  { background-position: 7% -25%; }
  40%  { background-position: -5% 25%; }
  50%  { background-position: -15% 10%; }
  60%  { background-position: 15% 0%; }
  70%  { background-position: 0% 15%; }
  80%  { background-position: 3% 35%; }
  90%  { background-position: -10% 10%; }
}
```

This replicates the film-grain texture present on Lusion, Igloo, Unseen Studio, and a majority of SOTD winners. Costs 20 lines of CSS. Adds tactile depth to flat backgrounds and makes photography feel premium.
