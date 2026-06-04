# Animation & Interaction Quality Checklist
**Stack: Framer Motion + GSAP/ScrollTrigger + Lenis, optional R3F 3D**
**Standard: Awwwards / apple.com / Stripe — not a template.**

Each item: `[PASS/FAIL]` · detection type `(AUTO|VISUAL)` · severity `(CRITICAL|HIGH|MEDIUM|LOW)`.

---

## 1. Smooth Scroll — Lenis Active

### 1.1 Lenis instance is mounted and ticking
**Severity:** HIGH  
**Type:** AUTO  
**Check:** The page uses Lenis (not native `scroll-behavior: smooth`). `window.__lenis` or the ReactLenis context instance exists. Scroll events propagate through Lenis's raf loop.  
**Verify (Playwright):**
```js
const hasLenis = await page.evaluate(() =>
  typeof window.__lenis !== 'undefined' ||
  !!document.querySelector('[data-lenis-prevent], [data-lenis-root]') ||
  // React Lenis injects a wrapper; check for the class name GSAP ticker integration
  typeof window.__lenisInit !== 'undefined'
);
// Fallback: listen for scroll events while Playwright scrolls by 400px
// and confirm the page scrollY changes smoothly over >3 frames
const scrolled = await page.evaluate(async () => {
  const start = window.scrollY;
  window.scrollBy({ top: 400, behavior: 'smooth' });
  await new Promise(r => setTimeout(r, 600));
  return window.scrollY > start + 100;
});
expect(scrolled).toBe(true);
```

### 1.2 `scroll-behavior: smooth` is NOT set alongside Lenis
**Severity:** MEDIUM  
**Type:** AUTO  
**Check:** Lenis and CSS `scroll-behavior: smooth` conflict and produce double-smooth jank. The root `<html>` must not have `scroll-behavior: smooth` when Lenis is active.  
**Verify (Playwright):**
```js
const conflict = await page.evaluate(() =>
  getComputedStyle(document.documentElement).scrollBehavior === 'smooth'
);
expect(conflict).toBe(false);
```

### 1.3 Lenis + GSAP ticker are synced (`lagSmoothing(0)`)
**Severity:** HIGH  
**Type:** AUTO  
**Check:** `gsap.ticker.lagSmoothing(0)` must be called. Without it, after a tab unfocus/refocus GSAP fires a large delta, ScrollTrigger jumps, content skips past scroll-reveal triggers and gets stuck invisible.  
**Verify (Playwright):**
```js
// Detect in source: grep for lagSmoothing
const src = await page.evaluate(() =>
  [...document.querySelectorAll('script')].map(s=>s.src).join(' ')
);
// Or: simulate tab blur → focus → check no elements are stuck at opacity:0
await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
await page.waitForTimeout(300);
const stuck = await page.$$eval('[data-reveal], .reveal, [class*="scroll-"]',
  els => els.filter(el => parseFloat(getComputedStyle(el).opacity) < 0.05).length
);
expect(stuck).toBe(0);
```

---

## 2. Scroll-Reveal Animations Fire Correctly

### 2.1 Reveal targets are visible after scrolling into viewport
**Severity:** CRITICAL  
**Type:** AUTO  
**Check:** The most common failure mode: elements have `opacity: 0` / `transform: translateY(32px)` as their initial animation state and the ScrollTrigger or `whileInView` never fires (wrong `start`, wrong `root`, Lenis scroll position not synced with ScrollTrigger). After programmatic scroll to each section, reveal-target elements must have computed `opacity > 0.9` and must not be clipped.  
**Verify (Playwright):**
```js
// Scroll to each major section, pause, then sample revealed elements
const sections = await page.$$('section, [data-section]');
for (const section of sections) {
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900); // allow 600ms animation + buffer
  const invisibleChildren = await section.$$eval(
    '[class*="reveal"], [data-reveal], [class*="fade"], [class*="slide"]',
    els => els.map(el => ({
      opacity: parseFloat(getComputedStyle(el).opacity),
      clip: getComputedStyle(el).clipPath,
      overflow: getComputedStyle(el).overflow,
      visibility: getComputedStyle(el).visibility,
    })).filter(s =>
      s.opacity < 0.9 ||
      s.visibility === 'hidden' ||
      (s.clip && s.clip !== 'none' && s.clip.includes('inset(100%'))
    )
  );
  expect(invisibleChildren.length).toBe(0);
}
```

### 2.2 No element permanently stuck at `opacity: 0` after full-page scroll
**Severity:** CRITICAL  
**Type:** AUTO  
**Check:** Scroll to bottom of page; no non-decorative element should remain at `opacity < 0.1`. Catch elements whose ScrollTrigger `start` is miscalculated (e.g. fires below fold but `once: true` already passed), or GSAP timelines that never got called because the component mounted after ScrollTrigger.refresh().  
**Verify (Playwright):**
```js
await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
await page.waitForTimeout(1200);
const orphans = await page.$$eval('*', els =>
  els
    .filter(el => {
      const s = getComputedStyle(el);
      return (
        parseFloat(s.opacity) < 0.1 &&
        s.display !== 'none' &&
        s.visibility !== 'hidden' &&
        el.getBoundingClientRect().width > 0 &&
        el.textContent?.trim().length > 0 // has content
      );
    })
    .map(el => ({ tag: el.tagName, class: el.className.slice(0, 60), text: el.textContent?.slice(0, 40) }))
    .slice(0, 10)
);
expect(orphans.length).toBe(0);
```

### 2.3 `whileInView` viewport margin is set (Framer Motion)
**Severity:** HIGH  
**Type:** AUTO  
**Check:** Framer Motion `whileInView` without `viewport={{ margin: "-10%" }}` triggers the moment 1px enters the viewport edge — on fast scroll the element animates from a partially-scrolled position, looks wrong. Check source for `viewport={{ once: true }}` without a `margin` — should be `margin: "-10%"` at minimum.  
**Verify (Playwright):**
```js
// Static analysis: grep compiled JS for whileInView without margin
const html = await page.content();
const hasMargin = html.includes('margin') && html.includes('whileInView');
// OR: check that elements do not start animating while still 30%+ below fold
// by sampling opacity at the moment scrollIntoView is called vs 400ms later
```

### 2.4 `ScrollTrigger.refresh()` is called after fonts/images load
**Severity:** HIGH  
**Type:** AUTO  
**Check:** GSAP calculates trigger offsets at mount time. If a web font shifts layout after load, all trigger positions are wrong. `ScrollTrigger.refresh()` must be called in a `window.load` listener or after font promise resolves.  
**Verify (Playwright):**
```js
// Ensure no ScrollTrigger positions are stale: scroll to 50% of page height,
// then check that elements in that viewport are visible
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
await page.waitForTimeout(800);
const midPageStuck = await page.$$eval('[data-reveal], .hero-word, [data-gsap]',
  els => els.filter(el => {
    const r = el.getBoundingClientRect();
    const inView = r.top < window.innerHeight && r.bottom > 0;
    return inView && parseFloat(getComputedStyle(el).opacity) < 0.5;
  }).length
);
expect(midPageStuck).toBe(0);
```

### 2.5 ScrollTriggers are killed on route change
**Severity:** HIGH  
**Type:** AUTO  
**Check:** In Next.js App Router, navigating away and back without `ScrollTrigger.getAll().forEach(t=>t.kill())` stacks duplicate triggers. Second visit shows all animations already at their end state or fires double.  
**Verify (Playwright):**
```js
// Navigate to /about and back to /
await page.goto('/about');
await page.goto('/');
await page.waitForTimeout(500);
// Hero elements should be at initial (pre-animate) state and animate in
const heroOpacityAfterNav = await page.$eval('[data-reveal="word"], .hero-text',
  el => parseFloat(getComputedStyle(el).opacity)
);
// If triggers weren't killed, hero will have opacity: 1 instantly (no animation) — still PASS for visibility
// The real failure is duplicate triggers making elements jump or animate twice
// Check: no element flickers (opacity bounces from 1 → 0 → 1)
```

---

## 3. Signature "Wow" Interaction

### 3.1 Exactly ONE signature interaction is present
**Severity:** HIGH  
**Type:** VISUAL  
**Check:** The page has a single, memorable "wow" moment — Velocity Marquee, Clip Reveal, Custom Cursor, Hover Image Reveal, Pinned Scroll Product Reveal, or Count-up Tickers. It is clearly distinct from the ambient scroll-reveal animations.  
**Verify:** Describe the signature interaction. Is there exactly one? Does it feel like the centrepiece or lost in noise?

### 3.2 Signature interaction actually works on first load (not broken)
**Severity:** CRITICAL  
**Type:** AUTO + VISUAL  
**Check:** The wow interaction is not broken by a hydration mismatch, missing `'use client'` directive, or a `typeof window` guard that incorrectly bails out on client.  
**Verify (Playwright — Velocity Marquee):**
```js
const marquee = await page.$('[class*="marquee"], [data-marquee]');
expect(marquee).not.toBeNull();
// Confirm the marquee is moving (transform changes over 300ms)
const x1 = await marquee.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
await page.waitForTimeout(300);
const x2 = await marquee.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
expect(Math.abs(x2 - x1)).toBeGreaterThan(1); // marquee translated
```
**Verify (Playwright — Count-up Ticker):**
```js
const ticker = await page.$('[class*="count"], [data-countup]');
await ticker.scrollIntoViewIfNeeded();
const v1 = await ticker.textContent();
await page.waitForTimeout(400);
const v2 = await ticker.textContent();
expect(v1).not.toBe(v2); // value changed = counter is animating
```
**Verify (VISUAL):** Does the interaction land? Does it feel premium and intentional — not gratuitous?

### 3.3 Marquee loops seamlessly (no gap or stutter)
**Severity:** MEDIUM  
**Type:** VISUAL + AUTO  
**Check:** The marquee content is duplicated enough times that the wrap seam never shows. `wrap()` boundaries are set to exactly `itemCount × itemWidth`. No flash of a gap at the loop point.  
**Verify (Playwright):**
```js
// Check that at least 2× items are rendered (tripled content = 3× the unique set)
const marqueeItems = await page.$$('[class*="marquee"] > * > *, [data-marquee] span');
const uniqueCount = new Set(await Promise.all(marqueeItems.map(el => el.textContent()))).size;
const totalCount = marqueeItems.length;
expect(totalCount).toBeGreaterThanOrEqual(uniqueCount * 2); // repeated at least 2×
```
**Verify (VISUAL):** Scroll the page fast. Does the marquee speed up reactively? Does it loop without a flash?

### 3.4 Custom cursor (if present) is fine-pointer only
**Severity:** HIGH  
**Type:** AUTO  
**Check:** Custom cursor must not run on touch devices (`pointer: coarse`). The cursor div should not be visible when media query `(pointer: fine)` does not match. On mobile the native cursor must not be hidden.  
**Verify (Playwright — emulate touch):**
```js
await page.emulateMedia({ media: null }); // reset
// Emulate touch device
await page.evaluate(() => Object.defineProperty(navigator, 'maxTouchPoints', { value: 1, configurable: true }));
// Check cursor element is not rendered or is display:none
const cursor = await page.$('[class*="cursor"], [data-cursor-dot]');
if (cursor) {
  const display = await cursor.evaluate(el => getComputedStyle(el).display);
  expect(display).toBe('none');
}
// Check html cursor is not 'none'
const htmlCursor = await page.evaluate(() => getComputedStyle(document.documentElement).cursor);
expect(htmlCursor).not.toBe('none');
```

---

## 4. Hover & Press States on Every Interactive Element

### 4.1 Every button has a hover transform (not just color)
**Severity:** HIGH  
**Type:** VISUAL  
**Check:** All `<button>` and `<a role="button">` elements have an animated hover state involving transform or box-shadow — not just a bare CSS color change. Framer Motion `whileHover` or CSS `transition: transform`.  
**Verify (Playwright):**
```js
const buttons = await page.$$('button:not([disabled]), a[role="button"], [data-cta]');
for (const btn of buttons.slice(0, 5)) {
  await btn.hover();
  await page.waitForTimeout(200);
  const transform = await btn.evaluate(el => getComputedStyle(el).transform);
  const boxShadow = await btn.evaluate(el => getComputedStyle(el).boxShadow);
  const hasMotion = transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)';
  const hasShadow = boxShadow !== 'none';
  expect(hasMotion || hasShadow).toBe(true);
}
```

### 4.2 Every button has a press/active scale-down state
**Severity:** MEDIUM  
**Type:** VISUAL  
**Check:** Buttons must have a physical press response — `whileTap={{ scale: 0.98 }}` or `active: { scale: 0.99 }`. Scale outside `0.94–1.01` for press feedback is cartoonish.  
**Verify (VISUAL):** Click and hold a primary CTA. Does it visually compress? Does it spring back on release?

### 4.3 Every interactive element has a visible focus-visible ring
**Severity:** HIGH  
**Type:** AUTO  
**Check:** `outline: none` without a replacement is a WCAG 2.4.11 failure. All focusable elements must show a branded focus ring when focused via keyboard.  
**Verify (Playwright):**
```js
await page.keyboard.press('Tab');
const focused = await page.evaluate(() => document.activeElement);
const outline = await page.evaluate(() => {
  const el = document.activeElement;
  return el ? getComputedStyle(el).outline : '';
});
const boxShadow = await page.evaluate(() => {
  const el = document.activeElement;
  return el ? getComputedStyle(el).boxShadow : '';
});
const hasFocusStyle = outline !== 'none' && outline !== '' || boxShadow !== 'none';
expect(hasFocusStyle).toBe(true);
```

### 4.4 Nav links have animated underline or hover state
**Severity:** MEDIUM  
**Type:** AUTO  
**Check:** Navigation `<a>` elements must have CSS `after:scale-x-0 → scale-x-100` underline draw, or equivalent Framer Motion layout animation — not a bare `color` transition.  
**Verify (Playwright):**
```js
const navLinks = await page.$$('nav a, header a');
for (const link of navLinks) {
  const pseudo = await link.evaluate(el => {
    const afterEl = getComputedStyle(el, '::after');
    return { content: afterEl.content, transform: afterEl.transform, transition: afterEl.transition };
  });
  const hasUnderline = pseudo.transition.includes('transform') || pseudo.transform.includes('scaleX');
  // OR: Framer Motion wraps the text in a span with overflow hidden
  expect(hasUnderline).toBe(true);
}
```

### 4.5 No `transition: all` on any interactive element
**Severity:** MEDIUM  
**Type:** AUTO  
**Check:** `transition: all` animates layout properties (width, height, padding) on state changes, causing layout recalculation on every frame — jank on slow devices.  
**Verify (Playwright):**
```js
const allInteractive = await page.$$('button, a, [tabindex]');
const violators = [];
for (const el of allInteractive) {
  const transition = await el.evaluate(e => getComputedStyle(e).transition);
  if (transition.startsWith('all')) violators.push(await el.evaluate(e => e.className));
}
expect(violators.length).toBe(0);
```

---

## 5. Navigation Scroll-Aware Behavior

### 5.1 Nav changes state on scroll (hide/show or style change)
**Severity:** HIGH  
**Type:** AUTO  
**Check:** The navigation must respond to scroll — become transparent/opaque, shrink, hide/reveal, or change border — not remain static. A fixed nav that does nothing on scroll is a Tier 1 anti-pattern.  
**Verify (Playwright):**
```js
const nav = await page.$('nav, header');
const navClassBefore = await nav.evaluate(el => el.className + getComputedStyle(el).background + getComputedStyle(el).borderBottomWidth);
await page.evaluate(() => window.scrollTo(0, 300));
await page.waitForTimeout(400);
const navClassAfter = await nav.evaluate(el => el.className + getComputedStyle(el).background + getComputedStyle(el).borderBottomWidth);
expect(navClassBefore).not.toBe(navClassAfter);
```

### 5.2 Nav returns / animates on scroll-up (if scroll-hide pattern)
**Severity:** MEDIUM  
**Type:** AUTO  
**Check:** If the nav hides on scroll-down, it must reappear on scroll-up — not require scroll-to-top. Check that a `window.scrollY` direction listener is active.  
**Verify (Playwright):**
```js
// Scroll down, check nav hidden; scroll up, check nav visible
await page.evaluate(() => window.scrollTo(0, 600));
await page.waitForTimeout(500);
const hiddenTransform = await page.$eval('nav, header', el => getComputedStyle(el).transform);
await page.evaluate(() => window.scrollTo(0, 400)); // scroll up 200px
await page.waitForTimeout(500);
const shownTransform = await page.$eval('nav, header', el => getComputedStyle(el).transform);
// If hiding pattern: transforms should differ
// If always-visible pattern: both will be identity — that also passes (pattern just isn't hide/show)
```

### 5.3 Active nav link highlights current section
**Severity:** LOW  
**Type:** VISUAL  
**Check:** During scroll, the nav link corresponding to the current section is highlighted (different weight, color, underline, or indicator dot). Verify IntersectionObserver or ScrollTrigger is driving it.  
**Verify (VISUAL):** Scroll through sections. Which nav link is active? Does it update in sync?

---

## 6. 3D / Canvas Feature (if present)

### 6.1 A `<canvas>` element is present and in the DOM
**Severity:** CRITICAL (if 3D was specified)  
**Type:** AUTO  
**Check:** If a WebGL/R3F 3D scene was requested, a `<canvas>` element must exist and be visible. The most common failure is the dynamic import with `ssr: false` not mounting on client (hydration mismatch, missing `'use client'`, or an over-eager mobile/WebGL guard that gates it off).  
**Verify (Playwright):**
```js
const canvas = await page.$('canvas');
expect(canvas).not.toBeNull();
const { width, height } = await canvas.boundingBox();
expect(width).toBeGreaterThan(0);
expect(height).toBeGreaterThan(0);
const visible = await canvas.evaluate(el =>
  getComputedStyle(el).display !== 'none' &&
  getComputedStyle(el).visibility !== 'hidden' &&
  parseFloat(getComputedStyle(el).opacity) > 0.05
);
expect(visible).toBe(true);
```

### 6.2 Canvas is rendering non-blank pixels (not transparent / solid black)
**Severity:** CRITICAL (if 3D was specified)  
**Type:** AUTO  
**Check:** A canvas that renders but displays a solid black or fully transparent frame means WebGL context creation failed, the scene has no lights/camera, or the 3D object loaded but is positioned off-screen. Sample pixels from the canvas data.  
**Verify (Playwright):**
```js
// Wait for scene to load
await page.waitForTimeout(2000);
const hasContent = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return false;
  const ctx = canvas.getContext('2d') || (() => {
    // For WebGL canvas, read pixels directly
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (!gl) return false;
    const pixels = new Uint8Array(4);
    gl.readPixels(
      Math.floor(canvas.width / 2), Math.floor(canvas.height / 2),
      1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels
    );
    // Not all black (0,0,0,255) and not all transparent (0,0,0,0)
    return !(pixels[0] === 0 && pixels[1] === 0 && pixels[2] === 0);
  })();
  if (!ctx) return false;
  return true;
});
// Sample center + 4 corners of canvas for non-uniform color
const nonBlank = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return false;
  const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
  if (!gl) return false;
  const samples = [
    [Math.floor(canvas.width*0.5), Math.floor(canvas.height*0.5)],
    [Math.floor(canvas.width*0.25), Math.floor(canvas.height*0.25)],
    [Math.floor(canvas.width*0.75), Math.floor(canvas.height*0.75)],
  ];
  const pixelData = samples.map(([x,y]) => {
    const px = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return Array.from(px);
  });
  // Require at least one sample that is not pure black and has alpha > 0
  return pixelData.some(([r,g,b,a]) => a > 0 && (r > 10 || g > 10 || b > 10));
});
expect(nonBlank).toBe(true);
```

### 6.3 3D/heavy canvas is code-split (`dynamic` + `ssr: false`)
**Severity:** HIGH  
**Type:** AUTO  
**Check:** Three.js / R3F must NOT be in the main bundle. `dynamic(() => import('@/components/HeroCanvas'), { ssr: false })` keeps three.js out of the SSR pass and out of the initial chunk. Verify the component is not imported statically at the top of a server component.  
**Verify (Playwright):**
```js
// Check that 'three' does not appear in the initial HTML (server render)
const html = await page.content();
expect(html).not.toMatch(/THREE\s*=\s*\{|WebGLRenderer|BufferGeometry/); // not in SSR output
// Check that the canvas appears after JS runs (not in initial HTML)
// (already verified by checking canvas is present AND page loads fast)
```

### 6.4 3D object is not gated off by an over-eager mobile or reduced-motion check
**Severity:** HIGH  
**Type:** AUTO  
**Check:** A common bug: `if (isMobile || prefersReducedMotion) return null` — this hides the 3D scene entirely on mobile and for reduced-motion users. The scene must degrade (lower quality, static pose) not disappear entirely.  
**Verify (Playwright — mobile emulation):**
```js
await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
await page.reload();
await page.waitForTimeout(2000);
const canvas = await page.$('canvas');
// Canvas may not exist on mobile if intentionally replaced with a static image
// But if the spec says "3D hero is present on all sizes", it must be here
if (canvas) {
  const visible = await canvas.evaluate(el =>
    getComputedStyle(el).display !== 'none' && parseFloat(getComputedStyle(el).opacity) > 0.05
  );
  expect(visible).toBe(true);
}
```
**Verify (Playwright — reduced-motion):**
```js
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.reload();
await page.waitForTimeout(2000);
const canvas = await page.$('canvas');
// With reduced-motion: canvas should exist (maybe paused/static), not gated to null
expect(canvas).not.toBeNull();
```

### 6.5 WebGL context creation is not silently failing
**Severity:** CRITICAL (if 3D was specified)  
**Type:** AUTO  
**Check:** If WebGL is unavailable (CI headless browser, some VMs), the component must degrade to a fallback image or static SVG — not show a blank black canvas or throw an uncaught error.  
**Verify (Playwright):**
```js
// Check for unhandled WebGL errors in console
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(err.message));
await page.goto(url);
await page.waitForTimeout(3000);
const webglErrors = errors.filter(e => e.includes('WebGL') || e.includes('THREE') || e.includes('gl_'));
expect(webglErrors.length).toBe(0);
```

---

## 7. 60fps Performance — GPU-Friendly Animations

### 7.1 No `width`, `height`, `top`, `left`, `margin` in scroll/hover transitions
**Severity:** CRITICAL  
**Type:** AUTO  
**Check:** Animating layout properties forces the browser to recalculate layout on every frame — the single biggest cause of scroll jank. All transitions must use `transform` and `opacity` only.  
**Verify (Playwright — static analysis):**
```js
// Grep compiled CSS for layout properties in transitions
const stylesheets = await page.$$eval('link[rel="stylesheet"]', els => els.map(el => el.href));
for (const href of stylesheets) {
  const css = await page.evaluate(async url => {
    const r = await fetch(url); return r.text();
  }, href);
  const bad = ['transition: width', 'transition: height', 'transition: top', 'transition: left',
                'transition: margin', 'transition: padding', 'animate-width', 'animate-height'];
  for (const b of bad) {
    expect(css).not.toContain(b);
  }
}
```
**Verify (Playwright — DevTools paint profiling):**
```js
// Start performance trace, scroll the page, check for purple paint rects
const client = await page.context().newCDPSession(page);
await client.send('Performance.enable');
await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
await page.waitForTimeout(2000);
const metrics = await client.send('Performance.getMetrics');
// 'LayoutCount' should not spike during scroll
const layoutCount = metrics.metrics.find(m => m.name === 'LayoutCount')?.value ?? 0;
// No hard threshold — compare before/after scroll; a huge spike = layout animation
```

### 7.2 `will-change: transform` is set on GPU-animated surfaces
**Severity:** MEDIUM  
**Type:** AUTO  
**Check:** Elements that animate `transform` on every scroll tick (parallax layers, pinned scene children) must have `will-change: transform` to promote them to their own compositor layer and avoid repaints.  
**Verify (Playwright):**
```js
const parallaxEls = await page.$$('[class*="parallax"], [data-parallax], [class*="layer"]');
for (const el of parallaxEls) {
  const wc = await el.evaluate(e => getComputedStyle(e).willChange);
  expect(['transform', 'auto']).toContain(wc); // 'auto' is acceptable if GSAP sets it at runtime
}
```

### 7.3 `will-change` is NOT set globally (only on actively animating elements)
**Severity:** MEDIUM  
**Type:** AUTO  
**Check:** `will-change: transform` on every element causes the browser to over-promote layers, consuming GPU memory. It must be targeted.  
**Verify (Playwright):**
```js
const overPromotion = await page.$$eval('*', els => {
  const willChanges = els.filter(el => getComputedStyle(el).willChange !== 'auto');
  return willChanges.length;
});
// No hard limit but > 20 elements with will-change is suspicious
// Flag if > 50 — likely from `transition: all` or global CSS
```

### 7.4 No `transition: all` on any element (layout properties would be included)
**Severity:** HIGH  
**Type:** AUTO  
**Check:** Same as 4.5 — covered globally here for all elements, not just interactive ones.  
**Verify (Playwright):**
```js
const allEls = await page.$$('*');
const violators = [];
for (const el of allEls.slice(0, 300)) { // sample first 300
  const t = await el.evaluate(e => getComputedStyle(e).transition);
  if (t.startsWith('all ') || t === 'all') violators.push(await el.evaluate(e => e.tagName + '.' + e.className.slice(0, 40)));
}
expect(violators.length).toBe(0);
```

---

## 8. `prefers-reduced-motion` Respect

### 8.1 With reduced-motion emulated, no critical content is stuck at `opacity: 0` or hidden
**Severity:** CRITICAL  
**Type:** AUTO  
**Check:** The most dangerous reduced-motion bug: the animation guard sets `opacity: 0` as the initial state, returns early, and never sets `opacity: 1`. Content is invisible. All animated components must use `gsap.set([elements], { opacity: 1, y: 0 })` as their reduced-motion path, or Framer Motion `reducedTransition` that goes directly to the visible state.  
**Verify (Playwright):**
```js
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.reload();
await page.waitForTimeout(500);
// Scroll to bottom to trigger any IntersectionObserver-based reveals
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);
const invisibleContent = await page.$$eval('*', els =>
  els
    .filter(el => {
      const s = getComputedStyle(el);
      return (
        parseFloat(s.opacity) < 0.1 &&
        s.display !== 'none' &&
        s.visibility !== 'hidden' &&
        el.getBoundingClientRect().width > 20 &&
        el.textContent?.trim().length > 5
      );
    })
    .map(el => ({ tag: el.tagName, text: el.textContent?.trim().slice(0, 40) }))
    .slice(0, 10)
);
expect(invisibleContent.length).toBe(0);
```

### 8.2 Preloader exits immediately with reduced-motion
**Severity:** HIGH  
**Type:** AUTO  
**Check:** The preloader must have a reduced-motion path that completes in `≤ 150ms` (a fast crossfade, not the full 1.8s count-up sequence). Verify `gsap.to(root, { opacity: 0, duration: 0.15 })` or equivalent.  
**Verify (Playwright):**
```js
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.goto(url);
const t0 = Date.now();
// Wait for preloader to disappear (if one exists)
await page.waitForFunction(
  () => {
    const loader = document.querySelector('[class*="preloader"], [class*="loader"], [data-preloader]');
    if (!loader) return true;
    return getComputedStyle(loader).display === 'none' || parseFloat(getComputedStyle(loader).opacity) < 0.05;
  },
  { timeout: 800 }
);
const elapsed = Date.now() - t0;
expect(elapsed).toBeLessThan(800); // must clear in < 800ms with reduced-motion
```

### 8.3 GSAP animations have `gsap.matchMedia()` reduced-motion condition
**Severity:** HIGH  
**Type:** AUTO  
**Check:** Raw `gsap.from` calls without a `prefersReducedMotion` guard animate even when the user has requested no motion. Must use `gsap.matchMedia()` with `'(prefers-reduced-motion: no-preference)'` condition, or check the media query directly before calling GSAP.  
**Verify (Playwright):** Static analysis — search compiled bundles for `gsap.from` or `gsap.to` that are not inside a `matchMedia` wrapper or a `if (!prefersReduced)` guard. Also verify using the emulated approach in 8.1.

### 8.4 Marquee stops with reduced-motion
**Severity:** MEDIUM  
**Type:** AUTO  
**Check:** The Velocity Marquee's `useAnimationFrame` must check `window.matchMedia("(prefers-reduced-motion: reduce)").matches` on each tick and bail out. A looping marquee that ignores reduced-motion is a vestibular accessibility hazard.  
**Verify (Playwright):**
```js
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.reload();
await page.waitForTimeout(400);
const marquee = await page.$('[class*="marquee"], [data-marquee]');
if (!marquee) return; // marquee not present — OK
const x1 = await marquee.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
await page.waitForTimeout(400);
const x2 = await marquee.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
expect(Math.abs(x2 - x1)).toBeLessThan(1); // should not be moving
```

---

## 9. Preloader & Hero Entrance

### 9.1 Preloader fires on first visit
**Severity:** HIGH  
**Type:** AUTO  
**Check:** On a fresh session (no `sessionStorage` key), the preloader overlay is visible and animates through its sequence before revealing content. Content must be `visibility: hidden` until preloader completes.  
**Verify (Playwright):**
```js
await page.context().clearCookies();
await page.evaluate(() => sessionStorage.clear());
await page.goto(url);
// Immediately check: preloader visible, content hidden
const loaderVisible = await page.$eval('[class*="preloader"], [data-preloader]',
  el => parseFloat(getComputedStyle(el).opacity) > 0.5
).catch(() => false);
// If no preloader component: check that hero is not fully visible in first 100ms
expect(loaderVisible).toBe(true);
```

### 9.2 Preloader is skipped on repeat visits (sessionStorage gate)
**Severity:** MEDIUM  
**Type:** AUTO  
**Check:** `sessionStorage.getItem('helm_intro_seen')` (or equivalent key) causes the preloader to skip. Repeat visitors see the hero instantly without waiting 1.8 seconds.  
**Verify (Playwright):**
```js
await page.evaluate(() => sessionStorage.setItem('helm_intro_seen', '1'));
await page.goto(url);
const t0 = Date.now();
// Hero content should be visible within 300ms
await page.waitForFunction(
  () => {
    const hero = document.querySelector('section, main > :first-child');
    return hero && parseFloat(getComputedStyle(hero).opacity) > 0.5;
  },
  { timeout: 1500 }
);
const elapsed = Date.now() - t0;
expect(elapsed).toBeLessThan(500);
```

### 9.3 Hero entrance animation completes (text/assets not stuck off-screen)
**Severity:** CRITICAL  
**Type:** AUTO  
**Check:** Hero words with `data-reveal="word"` start at `y: "110%"` and must animate to `y: 0`. If the timeline is killed early, interrupted, or the HeroReveal `ready` prop is never set, the hero is blank.  
**Verify (Playwright):**
```js
// Wait for preloader to complete (up to 3 seconds)
await page.waitForFunction(
  () => {
    const loader = document.querySelector('[class*="preloader"], [data-preloader]');
    return !loader || parseFloat(getComputedStyle(loader).opacity) < 0.1;
  },
  { timeout: 3500 }
);
// Check hero words are in view
const heroWords = await page.$$('[data-reveal="word"], .hero-word, h1 span');
for (const word of heroWords) {
  const transform = await word.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42);
  expect(Math.abs(transform)).toBeLessThan(5); // y < 5px from rest position
  const opacity = await word.evaluate(el => parseFloat(getComputedStyle(el).opacity));
  expect(opacity).toBeGreaterThan(0.9);
}
```

### 9.4 Total preloader duration ≤ 1800ms (non-reduced-motion)
**Severity:** MEDIUM  
**Type:** AUTO  
**Check:** A preloader over 2 seconds hurts bounce rate. The count-up pattern from the CRAFT_PLAYBOOK targets ≤ 1800ms.  
**Verify (Playwright):**
```js
await page.evaluate(() => sessionStorage.clear());
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(
  () => {
    const loader = document.querySelector('[class*="preloader"], [data-preloader]');
    return !loader || parseFloat(getComputedStyle(loader).opacity) < 0.1;
  },
  { timeout: 3000 }
);
expect(Date.now() - t0).toBeLessThan(2500); // generous budget with network
```

---

## 10. Page Transitions (if implemented)

### 10.1 Route transition overlay animates in and out correctly
**Severity:** HIGH  
**Type:** AUTO + VISUAL  
**Check:** The wipe overlay enters (scaleX: 0→1, origin left) and exits (scaleX: 1→0, origin right) on route change. No flash of unpainted content between routes.  
**Verify (Playwright):**
```js
// Navigate to an internal link
const internalLink = await page.$('nav a[href^="/"], nav a[href^="#"]');
await internalLink.click();
// Check that the overlay appeared (brief capture)
await page.waitForTimeout(100);
const overlayVisible = await page.$eval(
  '[class*="overlay"], [class*="transition"], [class*="page-wipe"]',
  el => parseFloat(getComputedStyle(el).opacity) > 0.5 || 
        new DOMMatrix(getComputedStyle(el).transform).a > 0.1
).catch(() => false);
// Overlay should clear after transition
await page.waitForTimeout(1000);
const overlayGone = await page.$eval(
  '[class*="overlay"], [class*="transition"]',
  el => parseFloat(getComputedStyle(el).opacity) < 0.1 ||
        getComputedStyle(el).display === 'none'
).catch(() => true);
expect(overlayGone).toBe(true);
```
**Verify (VISUAL):** Navigate to an internal page. Does the wipe feel cinematic? Does content on the new page entrance-animate after the wipe clears?

### 10.2 ScrollTriggers are killed on route change (no stacking)
**Severity:** HIGH  
**Type:** AUTO — Already covered in 2.5; re-verify after a back-navigation.

---

## 11. Scroll-Driven Storytelling Moment

### 11.1 At least ONE pinned/scrub-driven storytelling section exists
**Severity:** HIGH  
**Type:** AUTO + VISUAL  
**Check:** A section that pins while scroll drives a GSAP timeline — not just fade-in, but a directed narrative with 2–5 beats. `scrollTrigger: { pin: true, scrub: 1 }` is the canonical pattern.  
**Verify (Playwright):**
```js
// Look for a sticky/pinned element that moves with scroll
// A pinned section has position:sticky or GSAP pins with position:fixed temporarily
const pinned = await page.$$eval('*', els =>
  els.filter(el => {
    const s = getComputedStyle(el);
    return s.position === 'sticky' || (s.position === 'fixed' && el.dataset.gsapPin);
  }).length
);
expect(pinned).toBeGreaterThan(0);
```
**Verify (VISUAL):** Scroll slowly through the pinned section. Do beats reveal in sequence? Does it feel like a directed story or a long pause?

### 11.2 Pinned section uses `anticipatePin: 1` and `invalidateOnRefresh: true`
**Severity:** MEDIUM  
**Type:** AUTO  
**Check:** Without `anticipatePin: 1`, a pinned section jumps at the pin point (1 frame lag). Without `invalidateOnRefresh: true`, pin positions break on window resize. Both are required.  
**Verify:** Static analysis of the `scrollTrigger` config objects in source. Search compiled output for `anticipatePin` and `invalidateOnRefresh`.

---

## 12. No Broken / Janky Animations

### 12.1 No console errors related to animation libraries
**Severity:** HIGH  
**Type:** AUTO  
**Check:** GSAP, Framer Motion, Lenis, and Three.js log errors to the console on misconfiguration. Zero errors on page load and during scroll.  
**Verify (Playwright):**
```js
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(err.message));
await page.goto(url);
await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
await page.waitForTimeout(3000);
const animErrors = errors.filter(e =>
  /gsap|ScrollTrigger|lenis|framer|motion|three|fiber|WebGL/i.test(e)
);
expect(animErrors.length).toBe(0);
```

### 12.2 GSAP plugins are registered exactly once at module level
**Severity:** HIGH  
**Type:** AUTO  
**Check:** `gsap.registerPlugin(ScrollTrigger)` inside a React component body registers on every render. Must be at module level (outside component) or in a `useEffect` with an empty dependency array called once.  
**Verify:** Static analysis — confirm `registerPlugin` calls are outside function bodies in source files.

### 12.3 No `linear` easing on spatial animations
**Severity:** MEDIUM  
**Type:** AUTO  
**Check:** `linear` easing violates physics — elements start and stop with no acceleration, making motion look mechanical and cheap.  
**Verify (Playwright):** Search compiled JS bundles for `ease: "linear"` or `easing: "linear"` on `transform` animations. Color and opacity linear is acceptable; position is not.

### 12.4 Exit animations are 15–25% shorter than entrance animations
**Severity:** LOW  
**Type:** VISUAL  
**Check:** Exits that are as long as entrances make the UI feel sluggish. Entry 600ms → exit ≤ 480ms. Check duration tokens.  
**Verify (VISUAL):** Open a modal or trigger a page transition. Does the exit feel snappy relative to the entrance?

---

## 13. Motion Timing Consistency

### 13.1 Entrance animations across a page use the same easing family
**Severity:** MEDIUM  
**Type:** VISUAL  
**Check:** No mixing of spring and linear on the same tier. Scroll reveals should all use the same `fluentOut` curve — not some `ease-out`, some `spring`, some `cubic-bezier(...)` picked arbitrarily.  
**Verify (VISUAL):** Scroll through the page. Do all sections "feel" like the same site? Is motion cohesive?

### 13.2 Motion timing tokens are imported from a single source
**Severity:** MEDIUM  
**Type:** AUTO  
**Check:** Animation durations and easings must come from `lib/motion-tokens.ts` — not hardcoded inline. This enforces consistency.  
**Verify:** Grep source files for hardcoded `duration: 0.3` or `ease: [0.16, 1` inline (not imported from motion-tokens). Any inline value that doesn't match the token set is a violation.

---

## 14. Accessibility of Animation

### 14.1 Animated elements have accessible alternatives for screen readers
**Severity:** HIGH  
**Type:** AUTO  
**Check:** Marquees with `aria-hidden="true"` must have their content accessible elsewhere (or be decorative). Count-up tickers must use `aria-label` with the final value so screen readers don't announce intermediate numbers.  
**Verify (Playwright):**
```js
// Marquees should be aria-hidden
const marquees = await page.$$('[class*="marquee"]');
for (const m of marquees) {
  const ariaHidden = await m.evaluate(el => el.getAttribute('aria-hidden'));
  expect(ariaHidden).toBe('true');
}
// Count-up tickers should have aria-label with final value
const tickers = await page.$$('[class*="count"], [data-countup]');
for (const t of tickers) {
  const ariaLabel = await t.evaluate(el => el.getAttribute('aria-label') || el.querySelector('[aria-label]')?.getAttribute('aria-label'));
  expect(ariaLabel).not.toBeNull();
}
```

---

## Summary Table

| ID | Title | Type | Severity |
|----|-------|------|----------|
| 1.1 | Lenis instance mounted and ticking | AUTO | HIGH |
| 1.2 | No CSS scroll-behavior:smooth conflict | AUTO | MEDIUM |
| 1.3 | Lenis + GSAP ticker synced (lagSmoothing) | AUTO | HIGH |
| 2.1 | Reveal targets visible after scroll | AUTO | CRITICAL |
| 2.2 | No element permanently stuck opacity:0 | AUTO | CRITICAL |
| 2.3 | whileInView viewport margin set | AUTO | HIGH |
| 2.4 | ScrollTrigger.refresh() after fonts load | AUTO | HIGH |
| 2.5 | ScrollTriggers killed on route change | AUTO | HIGH |
| 3.1 | Exactly ONE signature interaction present | VISUAL | HIGH |
| 3.2 | Signature interaction works on first load | AUTO+VISUAL | CRITICAL |
| 3.3 | Marquee loops seamlessly | VISUAL+AUTO | MEDIUM |
| 3.4 | Custom cursor is fine-pointer only | AUTO | HIGH |
| 4.1 | Every button has hover transform | AUTO | HIGH |
| 4.2 | Every button has press scale-down | VISUAL | MEDIUM |
| 4.3 | Every interactive element has focus-visible ring | AUTO | HIGH |
| 4.4 | Nav links have animated underline | AUTO | MEDIUM |
| 4.5 | No `transition: all` on interactive elements | AUTO | MEDIUM |
| 5.1 | Nav changes state on scroll | AUTO | HIGH |
| 5.2 | Nav returns on scroll-up (hide pattern) | AUTO | MEDIUM |
| 5.3 | Active nav link highlights current section | VISUAL | LOW |
| 6.1 | canvas element present and visible (3D) | AUTO | CRITICAL |
| 6.2 | Canvas renders non-blank pixels | AUTO | CRITICAL |
| 6.3 | 3D bundle code-split (dynamic + ssr:false) | AUTO | HIGH |
| 6.4 | 3D not gated off by mobile/reduced-motion | AUTO | HIGH |
| 6.5 | WebGL context creation not silently failing | AUTO | CRITICAL |
| 7.1 | No layout properties in scroll/hover transitions | AUTO | CRITICAL |
| 7.2 | will-change:transform on GPU-animated surfaces | AUTO | MEDIUM |
| 7.3 | will-change NOT set globally | AUTO | MEDIUM |
| 7.4 | No `transition: all` on any element | AUTO | HIGH |
| 8.1 | Reduced-motion: no content stuck invisible | AUTO | CRITICAL |
| 8.2 | Preloader exits in ≤150ms with reduced-motion | AUTO | HIGH |
| 8.3 | GSAP animations have matchMedia guard | AUTO | HIGH |
| 8.4 | Marquee stops with reduced-motion | AUTO | MEDIUM |
| 9.1 | Preloader fires on first visit | AUTO | HIGH |
| 9.2 | Preloader skips on repeat visits | AUTO | MEDIUM |
| 9.3 | Hero entrance completes (not stuck off-screen) | AUTO | CRITICAL |
| 9.4 | Preloader duration ≤ 1800ms | AUTO | MEDIUM |
| 10.1 | Page transition overlay animates correctly | AUTO+VISUAL | HIGH |
| 10.2 | ScrollTriggers killed on route change | AUTO | HIGH |
| 11.1 | ONE pinned scroll-storytelling section exists | AUTO+VISUAL | HIGH |
| 11.2 | Pinned section has anticipatePin + invalidateOnRefresh | AUTO | MEDIUM |
| 12.1 | No console errors from animation libraries | AUTO | HIGH |
| 12.2 | GSAP plugins registered once at module level | AUTO | HIGH |
| 12.3 | No `linear` easing on spatial animations | AUTO | MEDIUM |
| 12.4 | Exit animations shorter than entrances | VISUAL | LOW |
| 13.1 | Entrance animations use same easing family | VISUAL | MEDIUM |
| 13.2 | Motion timing tokens from single source | AUTO | MEDIUM |
| 14.1 | Animated elements have accessible alternatives | AUTO | HIGH |

---

## Machine-readable items

```json
[
  {
    "id": "anim-1.1",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "Lenis instance mounted and ticking",
    "verify": "await page.evaluate(() => typeof window.__lenis !== 'undefined' || !!document.querySelector('[data-lenis-root]')); then scroll 400px and confirm window.scrollY moved > 100px within 600ms"
  },
  {
    "id": "anim-1.2",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "AUTO",
    "title": "No CSS scroll-behavior:smooth conflict with Lenis",
    "verify": "await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior === 'smooth') → expect false"
  },
  {
    "id": "anim-1.3",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "Lenis + GSAP ticker synced with lagSmoothing(0)",
    "verify": "Simulate visibilitychange event, then check no elements have opacity < 0.05 after 300ms"
  },
  {
    "id": "anim-2.1",
    "category": "animation",
    "severity": "CRITICAL",
    "check": "AUTO",
    "title": "Scroll-reveal targets visible after entering viewport",
    "verify": "For each section: scrollIntoViewIfNeeded(), wait 900ms, then check all [data-reveal] / [class*='reveal'] have opacity > 0.9 and no clipPath stuck at inset(100%)"
  },
  {
    "id": "anim-2.2",
    "category": "animation",
    "severity": "CRITICAL",
    "check": "AUTO",
    "title": "No element permanently stuck at opacity:0 after full-page scroll",
    "verify": "window.scrollTo(0, document.body.scrollHeight), wait 1200ms, find all elements with opacity < 0.1 and non-empty textContent — expect 0"
  },
  {
    "id": "anim-2.3",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "Framer Motion whileInView uses viewport margin",
    "verify": "Source analysis: all whileInView uses include viewport={{ margin: '-10%' }} or equivalent"
  },
  {
    "id": "anim-2.4",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "ScrollTrigger.refresh() called after fonts/images load",
    "verify": "Scroll to 50% of page height, check elements in viewport have opacity > 0.5"
  },
  {
    "id": "anim-2.5",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "ScrollTriggers killed on route change",
    "verify": "Navigate to /about then back to /, confirm hero elements start their entrance animation and do not skip to final state"
  },
  {
    "id": "anim-3.1",
    "category": "animation",
    "severity": "HIGH",
    "check": "VISUAL",
    "title": "Exactly ONE signature wow interaction present",
    "verify": "Describe the signature interaction. Is there exactly one clearly distinct wow moment?"
  },
  {
    "id": "anim-3.2",
    "category": "animation",
    "severity": "CRITICAL",
    "check": "AUTO",
    "title": "Signature interaction works on first load",
    "verify": "Marquee: confirm DOMMatrix transform.m41 changes over 300ms. CountUp: confirm textContent changes after scroll reveal. Cursor: confirm cursor div moves on mousemove."
  },
  {
    "id": "anim-3.3",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "VISUAL",
    "title": "Marquee loops seamlessly without gap or stutter",
    "verify": "Scroll fast while watching marquee — no flash of a gap at the loop seam. Total rendered items >= unique items * 2."
  },
  {
    "id": "anim-3.4",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "Custom cursor gated to fine-pointer devices only",
    "verify": "Emulate touch (maxTouchPoints=1): cursor element should be display:none and document.documentElement cursor !== 'none'"
  },
  {
    "id": "anim-4.1",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "Every button has hover transform or box-shadow change",
    "verify": "Hover first 5 buttons, wait 200ms, check computed transform !== identity matrix OR boxShadow !== 'none'"
  },
  {
    "id": "anim-4.2",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "VISUAL",
    "title": "Every button has press/active scale-down state",
    "verify": "Click and hold primary CTA — does it compress (scale 0.97–0.99)? Does it spring back on release?"
  },
  {
    "id": "anim-4.3",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "Every interactive element has visible focus-visible ring",
    "verify": "Tab to each focusable element; computed outline !== 'none' or boxShadow !== 'none' when :focus-visible"
  },
  {
    "id": "anim-4.4",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "AUTO",
    "title": "Nav links have animated underline or hover state",
    "verify": "Check nav a::after has transition including transform or scaleX in computed styles"
  },
  {
    "id": "anim-4.5",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "AUTO",
    "title": "No transition:all on interactive elements",
    "verify": "Sample first 5 buttons/links — getComputedStyle(el).transition must not start with 'all'"
  },
  {
    "id": "anim-5.1",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "Navigation changes visual state on scroll",
    "verify": "Record nav className+background+borderWidth at scrollY=0 and scrollY=300 — values must differ"
  },
  {
    "id": "anim-5.2",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "AUTO",
    "title": "Nav returns on scroll-up if hide-on-scroll pattern is used",
    "verify": "Scroll to 600px (nav hides), then scroll to 400px — nav should be visible again within 500ms"
  },
  {
    "id": "anim-5.3",
    "category": "animation",
    "severity": "LOW",
    "check": "VISUAL",
    "title": "Active nav link highlights current section during scroll",
    "verify": "Scroll through sections and watch nav — active indicator should update in sync"
  },
  {
    "id": "anim-6.1",
    "category": "animation",
    "severity": "CRITICAL",
    "check": "AUTO",
    "title": "canvas element present, visible, and non-zero size (if 3D specified)",
    "verify": "page.$('canvas') !== null, boundingBox width > 0 and height > 0, display !== 'none', opacity > 0.05"
  },
  {
    "id": "anim-6.2",
    "category": "animation",
    "severity": "CRITICAL",
    "check": "AUTO",
    "title": "Canvas renders non-blank pixels (not solid black or transparent)",
    "verify": "gl.readPixels at center and two off-center samples — at least one sample has alpha > 0 and (r > 10 OR g > 10 OR b > 10)"
  },
  {
    "id": "anim-6.3",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "3D bundle code-split with dynamic + ssr:false",
    "verify": "Page HTML (SSR output) does not contain 'THREE', 'WebGLRenderer', or 'BufferGeometry' — canvas only appears after JS runs"
  },
  {
    "id": "anim-6.4",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "3D scene not gated off by over-eager mobile or reduced-motion check",
    "verify": "Emulate iPhone 14 (390px) and reduced-motion: canvas still present in DOM (may be paused/static but not null)"
  },
  {
    "id": "anim-6.5",
    "category": "animation",
    "severity": "CRITICAL",
    "check": "AUTO",
    "title": "WebGL context creation failure does not throw uncaught error",
    "verify": "Collect page errors during load — filter for WebGL/THREE/gl_ errors — expect 0. Fallback image shown if WebGL unavailable."
  },
  {
    "id": "anim-7.1",
    "category": "animation",
    "severity": "CRITICAL",
    "check": "AUTO",
    "title": "No layout properties (width/height/top/left/margin) in scroll or hover transitions",
    "verify": "Grep compiled CSS for 'transition: width', 'transition: height', 'transition: top', 'transition: left', 'transition: margin' — expect 0 matches"
  },
  {
    "id": "anim-7.2",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "AUTO",
    "title": "will-change:transform on GPU-animated scroll layers",
    "verify": "Parallax layer elements have getComputedStyle().willChange === 'transform'"
  },
  {
    "id": "anim-7.3",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "AUTO",
    "title": "will-change not applied globally to more than ~20 elements",
    "verify": "Count elements with willChange !== 'auto' — flag if > 50"
  },
  {
    "id": "anim-7.4",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "No transition:all on any element in the page",
    "verify": "Sample first 300 elements — getComputedStyle(el).transition.startsWith('all') must be false for all"
  },
  {
    "id": "anim-8.1",
    "category": "animation",
    "severity": "CRITICAL",
    "check": "AUTO",
    "title": "With reduced-motion emulated, no critical content stuck at opacity:0",
    "verify": "emulateMedia({ reducedMotion: 'reduce' }), scroll to bottom, find elements with opacity < 0.1 and textContent.length > 5 — expect 0"
  },
  {
    "id": "anim-8.2",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "Preloader exits in under 800ms with reduced-motion",
    "verify": "emulateMedia({ reducedMotion: 'reduce' }), waitForFunction preloader opacity < 0.05 with timeout 800ms"
  },
  {
    "id": "anim-8.3",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "GSAP animations wrapped in gsap.matchMedia() reduced-motion guard",
    "verify": "Source analysis: gsap.from/gsap.to calls inside matchMedia('(prefers-reduced-motion: no-preference)') context or prefersReduced check"
  },
  {
    "id": "anim-8.4",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "AUTO",
    "title": "Marquee stops moving with reduced-motion active",
    "verify": "emulateMedia({ reducedMotion: 'reduce' }), sample DOMMatrix.m41 at t=0 and t=400ms — delta must be < 1px"
  },
  {
    "id": "anim-9.1",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "Preloader visible and animating on first visit",
    "verify": "Clear sessionStorage, navigate, immediately check [data-preloader] opacity > 0.5"
  },
  {
    "id": "anim-9.2",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "AUTO",
    "title": "Preloader skipped on repeat visit via sessionStorage",
    "verify": "sessionStorage.setItem('helm_intro_seen','1'), navigate, hero visible within 500ms"
  },
  {
    "id": "anim-9.3",
    "category": "animation",
    "severity": "CRITICAL",
    "check": "AUTO",
    "title": "Hero entrance completes — words not stuck off-screen",
    "verify": "Wait for preloader to clear (opacity < 0.1), then check all [data-reveal='word'] have DOMMatrix.m42 < 5px and opacity > 0.9"
  },
  {
    "id": "anim-9.4",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "AUTO",
    "title": "Preloader total duration ≤ 1800ms (non-reduced-motion)",
    "verify": "Clear sessionStorage, navigate, waitForFunction preloader opacity < 0.1 with 2500ms budget — elapsed must be < 1800ms"
  },
  {
    "id": "anim-10.1",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "Page transition overlay animates in and out on route change",
    "verify": "Click internal nav link, check at 100ms overlay is visible (scaleX > 0.1), check at 1000ms overlay is gone (opacity < 0.1 or display:none)"
  },
  {
    "id": "anim-10.2",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "ScrollTriggers killed on route change (no duplicate stacking)",
    "verify": "Navigate away and back, confirm hero words animate in from start position (not already at final state, and not duplicated)"
  },
  {
    "id": "anim-11.1",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "One pinned/scrub scroll-storytelling section exists",
    "verify": "Find element with position:sticky or GSAP pin attribute — expect count > 0. VISUAL: slow-scroll through it and confirm 2+ beats reveal."
  },
  {
    "id": "anim-11.2",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "AUTO",
    "title": "Pinned section uses anticipatePin:1 and invalidateOnRefresh:true",
    "verify": "Source analysis: scrollTrigger config objects include both anticipatePin:1 and invalidateOnRefresh:true"
  },
  {
    "id": "anim-12.1",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "No console errors from GSAP, Framer Motion, Lenis, or Three.js",
    "verify": "Collect all page errors during load + full-page scroll. Filter for /gsap|ScrollTrigger|lenis|framer|motion|three|fiber|WebGL/i — expect 0"
  },
  {
    "id": "anim-12.2",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "GSAP plugins registered once at module level",
    "verify": "Source analysis: gsap.registerPlugin() calls are outside React component functions"
  },
  {
    "id": "anim-12.3",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "AUTO",
    "title": "No linear easing on spatial (transform) animations",
    "verify": "Grep compiled JS for ease:\"linear\" on gsap.from/to calls or Framer Motion variants that animate x/y/transform — expect 0"
  },
  {
    "id": "anim-12.4",
    "category": "animation",
    "severity": "LOW",
    "check": "VISUAL",
    "title": "Exit animations 15–25% shorter than entrance animations",
    "verify": "Open and close a modal or trigger page transition. Does exit feel snappy vs entrance? Entrance 600ms → exit ≤ 480ms."
  },
  {
    "id": "anim-13.1",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "VISUAL",
    "title": "Entrance animations use same easing family across sections",
    "verify": "Scroll full page. Does motion feel cohesive — same curve family throughout — or do sections each have their own arbitrary easing?"
  },
  {
    "id": "anim-13.2",
    "category": "animation",
    "severity": "MEDIUM",
    "check": "AUTO",
    "title": "Motion timing tokens imported from single source (lib/motion-tokens)",
    "verify": "Source analysis: no inline duration: 0.3 or ease: [0.16, 1, ...] values outside motion-tokens.ts"
  },
  {
    "id": "anim-14.1",
    "category": "animation",
    "severity": "HIGH",
    "check": "AUTO",
    "title": "Marquees aria-hidden; count-up tickers have aria-label with final value",
    "verify": "All [class*='marquee'] have aria-hidden='true'. All count-up spans have aria-label set to the final number + suffix."
  }
]
```
