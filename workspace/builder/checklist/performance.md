# Performance & Core Web Vitals Checklist
**Scope:** Production Next.js site with GSAP / Three.js / R3F animations  
**Build target:** `next build` output only — no dev-server results accepted  
**Verdict key:** PASS / FAIL | AUTO = scripted | VISUAL = manual/browser  
**Severity:** CRITICAL > HIGH > MEDIUM > LOW

---

## 1. Production Build Size — First Load JS
**AUTO | CRITICAL**

First Load JS for the landing route must be ≤ 300 KB (gzipped).

**Verify:**
1. Run `next build` and capture stdout.
2. Parse the route table printed to stdout — find the row for `/` (or the landing page route).
3. Read the "First Load JS" column value.
4. PASS if value ≤ 300 KB. FAIL if > 300 KB.

Alternatively, parse `.next/build-manifest.json` — sum the sizes of all chunks listed under the landing route key, then cross-reference `.next/static/chunks/` for actual gzip sizes using `find .next/static/chunks -name '*.js' | xargs gzip -l`.

**Script sketch:**
```bash
next build 2>&1 | grep -E "^\s+[○●λ].*First Load" | awk '{print $NF}'
# or read .next/build-manifest.json + measure gzip sizes
```

---

## 2. Heavy Libraries Not in Initial Chunk (GSAP / Three.js / R3F)
**AUTO | CRITICAL**

GSAP, three, @react-three/fiber, @react-three/drei must NOT appear in any statically imported module reachable from `pages/index.tsx` (or `app/page.tsx`) at load time. They must only enter via `dynamic(() => import(...), { ssr: false })`.

**Verify:**
1. Grep source files for static top-level imports of these packages in page/layout files:
```bash
grep -rn "^import.*from ['\"]gsap" src/ app/ pages/ components/ --include="*.tsx" --include="*.ts"
grep -rn "^import.*from ['\"]three" src/ app/ pages/ components/ --include="*.tsx" --include="*.ts"
grep -rn "^import.*from ['\"]@react-three" src/ app/ pages/ components/ --include="*.tsx" --include="*.ts"
```
Any hit in a file that is NOT itself behind a `dynamic(...)` boundary = FAIL.

2. Cross-check `.next/static/chunks/` — no file named `framework` or `main` should contain the string `"three"` or `"gsap"`:
```bash
strings .next/static/chunks/framework-*.js | grep -i "three\|gsap" | head -5
```
PASS if no matches. FAIL if matches found.

---

## 3. Dynamic Import with ssr:false for 3D / Animation Components
**AUTO | CRITICAL**

Every component that imports three/R3F or heavy GSAP plugins must be loaded via `next/dynamic` with `{ ssr: false }`.

**Verify:**
```bash
# Find all dynamic() calls and confirm ssr:false is present
grep -rn "dynamic(" src/ app/ pages/ --include="*.tsx" --include="*.ts" | grep -v "ssr: false"
# Any dynamic() import of a 3D/GSAP component without ssr:false = FAIL
```

Also confirm the corresponding component file does NOT appear in any server-side rendered HTML (check `curl -s http://localhost:3000` for canvas/three artifact strings).

---

## 4. Images — next/image or Explicit Sizing + Modern Format
**AUTO | HIGH**

All `<img>` elements must be replaced by `next/image`, OR must have explicit `width`/`height` attributes and use WebP/AVIF format.

**Verify:**
```bash
# Find raw <img> tags not using next/image
grep -rn "<img " src/ app/ pages/ components/ --include="*.tsx" --include="*.jsx" | grep -v "next/image"
```
Each hit must have `width=` and `height=` attributes set. Any unsized `<img>` = FAIL (CLS risk + no lazy-load).

Check format:
```bash
find public/ -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" | head -20
```
Any hero/large image not in `.webp` or `.avif` = HIGH severity flag. Convert or use next/image `quality` prop.

---

## 5. No Unoptimized Assets > 500 KB
**AUTO | HIGH**

No single image or media asset in `public/` or imported statically should exceed 500 KB uncompressed.

**Verify:**
```bash
find public/ -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.gif" -o -name "*.webp" -o -name "*.avif" -o -name "*.mp4" -o -name "*.webm" \) -size +500k -ls
```
Any result = FAIL. Flag each file with its size.

Also check imported assets:
```bash
find src/ app/ pages/ -name "*.png" -o -name "*.jpg" -size +500k 2>/dev/null
```

---

## 6. next/font — No Render-Blocking External Font CSS
**AUTO | HIGH**

All custom fonts must use `next/font` (Google Fonts or local). No `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` in `_document.tsx`, `layout.tsx`, or any component.

**Verify:**
```bash
grep -rn "fonts.googleapis.com\|fonts.gstatic.com" src/ app/ pages/ --include="*.tsx" --include="*.ts" --include="*.js"
```
Any hit = FAIL. `next/font` inlines font-face declarations at build time, eliminating the render-blocking request.

Also confirm next/font is actually used:
```bash
grep -rn "from 'next/font" src/ app/ pages/ --include="*.tsx" --include="*.ts"
```
PASS if font imports come from `next/font/*` only.

---

## 7. LCP Element — Hero Image / Text Loads Fast
**VISUAL + AUTO | CRITICAL**

The Largest Contentful Paint element (typically a hero image or heading) must not be gated behind slow resources.

**AUTO check (image):**
```bash
# Hero image should be in public/ and small enough
find public/ -name "hero*" -o -name "banner*" -o -name "og-*" | xargs ls -lh 2>/dev/null
```
Hero image > 200 KB = HIGH warning. Use next/image `priority` prop on above-fold images.

**Verify next/image priority on hero:**
```bash
grep -rn "priority" src/ app/ pages/components/ --include="*.tsx" | grep -i "hero\|landing\|above"
```
No `priority` prop on the hero image = FAIL (will lazy-load by default, killing LCP).

**VISUAL:** Open Chrome DevTools → Performance → record page load → inspect LCP element and timing. Target LCP < 2.5 s on a simulated 4G connection (Lighthouse preset).

---

## 8. CLS — No Layout Shift from Fonts, Animations, or Late Content
**VISUAL + AUTO | CRITICAL**

Cumulative Layout Shift must be < 0.1.

**AUTO (Playwright):**
```js
// measure-cls.spec.ts
const cls = await page.evaluate(() => {
  return new Promise(resolve => {
    let total = 0;
    const obs = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) total += entry.value;
      }
    });
    obs.observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => { obs.disconnect(); resolve(total); }, 5000);
  });
});
expect(cls).toBeLessThan(0.1);
```
PASS if CLS < 0.1. FAIL if ≥ 0.1.

**Common causes to audit manually:**
- Fonts swapping in (fix: `next/font` with `display: swap` + `size-adjust`)
- Images without `width`/`height` reflow on load
- Animated elements that appear from outside viewport without reserved space (use `min-height` placeholders or `visibility: hidden` before animation start)
- Skeleton/loading states that change dimensions on resolve

---

## 9. Animations — transform/opacity Only (No Layout Thrash)
**AUTO + VISUAL | HIGH**

Animations must only mutate `transform` and `opacity`. Any animation touching `width`, `height`, `top`, `left`, `margin`, `padding`, `font-size` forces layout recalculation.

**AUTO grep for layout-affecting CSS transitions/animations:**
```bash
grep -rn "transition:.*\(width\|height\|top\|left\|bottom\|right\|margin\|padding\|font-size\)" src/ app/ pages/ --include="*.tsx" --include="*.ts" --include="*.css" --include="*.module.css"
grep -rn "animate.*\(width\|height\|top\|left\|margin\)" src/ app/ pages/ --include="*.tsx" --include="*.ts"
```
Any direct layout-property animation = FAIL.

**GSAP check:**
```bash
grep -rn "gsap.to\|gsap.from\|gsap.fromTo" src/ app/ --include="*.tsx" --include="*.ts" | grep -v "transform\|opacity\|scale\|rotate\|x:\|y:\|xPercent\|yPercent"
```
Review each hit — confirm no width/height/top/left tweens.

**VISUAL:** Chrome DevTools → Rendering → enable "Paint flashing" — green flashes during animation = layout being recalculated. Should be zero during steady-state animation.

---

## 10. Memory Leaks — Animation & Scroll Listeners Cleaned Up
**AUTO | HIGH**

Every `useEffect` that registers GSAP timelines, ScrollTrigger instances, or raw `addEventListener` calls must return a cleanup function that kills them.

**AUTO — missing cleanup patterns:**
```bash
# useEffect with addEventListener but no removeEventListener
grep -rn "addEventListener" src/ app/ pages/ --include="*.tsx" --include="*.ts" -l | \
  xargs grep -L "removeEventListener"
```
Any file that has `addEventListener` without `removeEventListener` = FAIL.

**GSAP context / ScrollTrigger cleanup:**
```bash
# Check for gsap.context() usage (preferred cleanup pattern)
grep -rn "gsap.context\|ScrollTrigger.kill\|tl.kill\|ctx.revert" src/ app/ --include="*.tsx" --include="*.ts"
```
Any file with GSAP animations that has neither `gsap.context(...)` with `.revert()` in cleanup NOR explicit `.kill()` calls = FAIL.

**Pattern to enforce:**
```tsx
useEffect(() => {
  const ctx = gsap.context(() => { /* animations */ }, containerRef);
  return () => ctx.revert();
}, []);
```

---

## 11. Scroll Work — RAF / Throttle, No Synchronous Layout Read in Scroll Handler
**AUTO | HIGH**

Scroll handlers must NOT call `getBoundingClientRect()`, `offsetTop`, `scrollHeight` or other layout-read APIs synchronously. Use `requestAnimationFrame` or a throttled handler. GSAP ScrollTrigger handles this internally.

**AUTO grep:**
```bash
grep -rn "onScroll\|addEventListener.*scroll\|window.scroll" src/ app/ pages/ --include="*.tsx" --include="*.ts" | grep -v "ScrollTrigger\|useScroll"
```
Review each raw scroll handler hit. Any that reads layout properties without RAF wrapping = FAIL.

```bash
# Flag synchronous layout reads inside scroll callbacks
grep -A5 "onScroll\|scroll.*function" src/ app/ pages/ --include="*.tsx" --include="*.ts" | grep "getBoundingClientRect\|offsetTop\|clientHeight\|scrollHeight"
```

---

## 12. Lazy-Load Offscreen / Below-Fold Heavy Content
**AUTO + VISUAL | HIGH**

Sections containing 3D canvases, heavy carousels, video backgrounds, or large image grids that are below the fold must not initialize until they enter the viewport.

**AUTO — check for IntersectionObserver or dynamic import gating:**
```bash
grep -rn "IntersectionObserver\|useInView\|whileInView\|viewport.*once" src/ app/ pages/ --include="*.tsx" --include="*.ts"
```
If heavy below-fold components exist but no IntersectionObserver / Framer `whileInView` / dynamic import is present for them = FAIL.

**VISUAL:** Chrome DevTools → Network → throttle to Slow 4G → load page → confirm 3D canvas / heavy sections do NOT fire network requests until scrolled into view.

---

## 13. Lighthouse Performance Score
**VISUAL | CRITICAL**

Run Lighthouse in CI or DevTools against the production build (`next start` or deployed URL). Target score ≥ 90.

**Verify:**
```bash
# Using lighthouse CLI (npx lighthouse)
npx lighthouse http://localhost:3000 --only-categories=performance --output=json --quiet \
  | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const r=JSON.parse(d); console.log(r.categories.performance.score * 100)"
```
PASS if score ≥ 90. FAIL if < 90.

Key sub-metrics to check:
- LCP < 2.5 s
- FID / INP < 200 ms  
- CLS < 0.1
- TBT < 200 ms
- FCP < 1.8 s

---

## 14. No Unused JavaScript (Tree-Shaking Check)
**AUTO | MEDIUM**

Ensure only used GSAP plugins are registered. Importing all GSAP plugins globally bloats the bundle.

**Verify:**
```bash
grep -rn "gsap.registerPlugin" src/ app/ pages/ --include="*.tsx" --include="*.ts"
```
Cross-check: every registered plugin should have a corresponding `import { PluginName } from 'gsap/PluginName'` — not a blanket `import gsap from 'gsap'` that pulls everything.

```bash
# Flag barrel imports of gsap
grep -rn "^import gsap from 'gsap'$\|^import \* as gsap" src/ app/ --include="*.tsx" --include="*.ts"
```
Blanket gsap import in a non-dynamic file = HIGH warning.

---

## 15. preload / preconnect for Critical Resources
**AUTO | MEDIUM**

The `<head>` should include `<link rel="preconnect">` for any third-party origins (fonts, CDN) and `<link rel="preload">` for the LCP image if it is not handled by next/image's automatic priority.

**Verify:**
```bash
grep -rn "preload\|preconnect" src/ app/ pages/ --include="*.tsx" --include="*.ts" | head -20
```
If external origins are used (analytics, fonts CDN, API) and none are preconnected = MEDIUM warning.

For next/image with `priority`, preload is automatic. For manual `<img>` hero = FAIL if no preload hint.

---

## 16. next.config — Image Domains / Remotes Locked Down (No Wildcard)
**AUTO | MEDIUM**

`next.config.js` image `domains` or `remotePatterns` must not use a wildcard `**` hostname that allows any URL.

**Verify:**
```bash
grep -A 20 "images:" next.config.* 2>/dev/null | grep -E "hostname.*\*\*|domains.*\*"
```
Wildcard domain = FAIL (security + perf: any image URL accepted, defeating optimization caching).

---

## 17. Avoid document.write / Synchronous XHR
**AUTO | MEDIUM**

These block the HTML parser and are flagged by Lighthouse.

**Verify:**
```bash
grep -rn "document.write\|XMLHttpRequest.*open.*false" src/ app/ pages/ --include="*.tsx" --include="*.ts" --include="*.js"
```
Any hit = FAIL.

---

## 18. Video Autoplay — Muted + Lazy Attribute
**AUTO | LOW**

Background videos must have `muted`, `playsInline`, and `preload="none"` (or `loading="lazy"` where supported) to avoid auto-downloading video data on load.

**Verify:**
```bash
grep -rn "<video" src/ app/ pages/ --include="*.tsx" --include="*.jsx"
```
Any `<video>` without `muted` = FAIL (autoplay blocked by browser). Any without `preload="none"` on below-fold video = MEDIUM warning.

---

## Summary Table

| # | Title | Type | Severity |
|---|-------|------|----------|
| 1 | First Load JS ≤ 300 KB | AUTO | CRITICAL |
| 2 | Heavy libs not in initial chunk | AUTO | CRITICAL |
| 3 | Dynamic import ssr:false for 3D | AUTO | CRITICAL |
| 4 | Images via next/image or sized | AUTO | HIGH |
| 5 | No assets > 500 KB | AUTO | HIGH |
| 6 | next/font, no blocking font CSS | AUTO | HIGH |
| 7 | LCP element loads fast + priority | VISUAL+AUTO | CRITICAL |
| 8 | CLS < 0.1 | VISUAL+AUTO | CRITICAL |
| 9 | Animations transform/opacity only | AUTO+VISUAL | HIGH |
| 10 | Listeners/GSAP cleaned up | AUTO | HIGH |
| 11 | Scroll work via RAF/throttle | AUTO | HIGH |
| 12 | Offscreen content lazy-loaded | AUTO+VISUAL | HIGH |
| 13 | Lighthouse score ≥ 90 | VISUAL | CRITICAL |
| 14 | No unused JS / GSAP tree-shaken | AUTO | MEDIUM |
| 15 | preload/preconnect for critical | AUTO | MEDIUM |
| 16 | next.config image domains locked | AUTO | MEDIUM |
| 17 | No document.write / sync XHR | AUTO | MEDIUM |
| 18 | Video muted + preload=none | AUTO | LOW |

---

## Machine-readable items

```json
[
  {
    "id": "perf-01",
    "category": "perf",
    "severity": "CRITICAL",
    "title": "First Load JS ≤ 300 KB (gzipped)",
    "check": "AUTO",
    "verify": "Run `next build` and parse stdout route table for `/` First Load JS column, or sum .next/build-manifest.json chunk sizes and gzip-measure them. PASS if ≤ 300 KB."
  },
  {
    "id": "perf-02",
    "category": "perf",
    "severity": "CRITICAL",
    "title": "GSAP / Three.js / R3F not in initial chunk",
    "check": "AUTO",
    "verify": "grep source for static top-level `import ... from 'gsap'|'three'|'@react-three/*'` in non-dynamic page/layout files. Also `strings .next/static/chunks/framework-*.js | grep -i 'three\\|gsap'` — expect no matches."
  },
  {
    "id": "perf-03",
    "category": "perf",
    "severity": "CRITICAL",
    "title": "3D/animation components use dynamic() with ssr:false",
    "check": "AUTO",
    "verify": "grep -rn 'dynamic(' src/ app/ pages/ --include='*.tsx' | grep -v 'ssr: false' — any dynamic() import of a heavy component without ssr:false = FAIL."
  },
  {
    "id": "perf-04",
    "category": "perf",
    "severity": "HIGH",
    "title": "All images use next/image or have explicit width/height + modern format",
    "check": "AUTO",
    "verify": "grep -rn '<img ' src/ app/ pages/ --include='*.tsx' | grep -v 'next/image' — each hit must have width= and height= attributes. PNG/JPG without WebP/AVIF conversion = HIGH flag."
  },
  {
    "id": "perf-05",
    "category": "perf",
    "severity": "HIGH",
    "title": "No single asset > 500 KB",
    "check": "AUTO",
    "verify": "find public/ -type f \\( -name '*.jpg' -o -name '*.png' -o -name '*.gif' -o -name '*.webp' -o -name '*.mp4' \\) -size +500k -ls — any result = FAIL."
  },
  {
    "id": "perf-06",
    "category": "perf",
    "severity": "HIGH",
    "title": "Fonts loaded via next/font, no render-blocking font CSS",
    "check": "AUTO",
    "verify": "grep -rn 'fonts.googleapis.com' src/ app/ pages/ --include='*.tsx' — any hit = FAIL. Confirm font imports come from 'next/font/*' only."
  },
  {
    "id": "perf-07",
    "category": "perf",
    "severity": "CRITICAL",
    "title": "LCP hero image has next/image priority prop",
    "check": "AUTO",
    "verify": "grep -rn 'priority' components/ app/ pages/ --include='*.tsx' | grep -i 'hero\\|landing' — missing priority on above-fold next/image = FAIL. Hero image should be < 200 KB."
  },
  {
    "id": "perf-08",
    "category": "perf",
    "severity": "CRITICAL",
    "title": "CLS < 0.1",
    "check": "VISUAL+AUTO",
    "verify": "Playwright PerformanceObserver layout-shift: accumulate entry.value where !hadRecentInput over 5 s after navigation. expect(cls).toBeLessThan(0.1). Also visually audit font swap, unsized images, animated reveals."
  },
  {
    "id": "perf-09",
    "category": "perf",
    "severity": "HIGH",
    "title": "Animations use transform/opacity only — no layout thrash",
    "check": "AUTO+VISUAL",
    "verify": "grep -rn 'transition:.*width\\|height\\|top\\|left\\|margin' src/ app/ --include='*.css' and grep gsap.to calls for width/height/top/left tweens — any hit = FAIL. Chrome Rendering > Paint flashing should show no green flashes during animation."
  },
  {
    "id": "perf-10",
    "category": "perf",
    "severity": "HIGH",
    "title": "GSAP / ScrollTrigger / addEventListener cleaned up in useEffect",
    "check": "AUTO",
    "verify": "Files with addEventListener must also contain removeEventListener. Files with gsap animations must use gsap.context().revert() or explicit .kill() in useEffect cleanup. Grep for violations."
  },
  {
    "id": "perf-11",
    "category": "perf",
    "severity": "HIGH",
    "title": "Scroll handlers use RAF / no synchronous layout reads",
    "check": "AUTO",
    "verify": "grep raw scroll handlers (not ScrollTrigger) and check for getBoundingClientRect/offsetTop calls inside without RAF wrapping — any synchronous layout read in a scroll callback = FAIL."
  },
  {
    "id": "perf-12",
    "category": "perf",
    "severity": "HIGH",
    "title": "Offscreen/below-fold heavy content lazy-loaded",
    "check": "AUTO+VISUAL",
    "verify": "grep for IntersectionObserver/useInView/whileInView gating heavy below-fold components. Network tab on Slow 4G — heavy sections must not initiate requests until viewport entry."
  },
  {
    "id": "perf-13",
    "category": "perf",
    "severity": "CRITICAL",
    "title": "Lighthouse performance score ≥ 90",
    "check": "VISUAL",
    "verify": "npx lighthouse <prod-url> --only-categories=performance --output=json | parse .categories.performance.score * 100 >= 90. Sub-metrics: LCP<2.5s, INP<200ms, CLS<0.1, TBT<200ms, FCP<1.8s."
  },
  {
    "id": "perf-14",
    "category": "perf",
    "severity": "MEDIUM",
    "title": "GSAP tree-shaken — only registered plugins imported",
    "check": "AUTO",
    "verify": "grep 'gsap.registerPlugin' — each plugin registered must have a specific named import. Blanket `import gsap from 'gsap'` in non-dynamic files = HIGH warning."
  },
  {
    "id": "perf-15",
    "category": "perf",
    "severity": "MEDIUM",
    "title": "preload/preconnect hints for critical third-party origins",
    "check": "AUTO",
    "verify": "grep -rn 'preload\\|preconnect' src/ app/ pages/ — if external origins used with no preconnect hints = MEDIUM warning. next/image priority handles preload automatically for hero images."
  },
  {
    "id": "perf-16",
    "category": "perf",
    "severity": "MEDIUM",
    "title": "next.config image domains/remotePatterns no wildcard",
    "check": "AUTO",
    "verify": "grep -A 20 'images:' next.config.* | grep -E 'hostname.*\\*\\*|domains.*\\*' — wildcard hostname = FAIL."
  },
  {
    "id": "perf-17",
    "category": "perf",
    "severity": "MEDIUM",
    "title": "No document.write or synchronous XHR",
    "check": "AUTO",
    "verify": "grep -rn 'document.write\\|XMLHttpRequest.*open.*false' src/ app/ pages/ --include='*.tsx' --include='*.ts' — any hit = FAIL."
  },
  {
    "id": "perf-18",
    "category": "perf",
    "severity": "LOW",
    "title": "Background videos are muted with preload=none",
    "check": "AUTO",
    "verify": "grep -rn '<video' src/ app/ pages/ --include='*.tsx' — any <video> without `muted` = FAIL. Below-fold video without preload='none' = MEDIUM warning."
  }
]
```
