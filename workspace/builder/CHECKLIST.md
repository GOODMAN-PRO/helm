# Definition of Done — Premium Website

> Injected into the build agent's prompt. Binary PASS/FAIL per item.
> Severity: **critical** = blocks ship | **major** = blocks review | **minor** = polish pass
> Mode: AUTO = scriptable | VISUAL = agent/judge judgment

---

## Build & Runtime

- [ ] (critical) `npm run build` exits with code 0 — verify: `npm run build; echo "EXIT:$?"` → assert `EXIT:0`
- [ ] (critical) TypeScript clean: `npx tsc --noEmit` produces zero output — verify: output file must be 0 bytes
- [ ] (critical) `.next/static` and `.next/server` both exist post-build — verify: `[ -d .next/static ] && [ -d .next/server ]`
- [ ] (critical) No secrets or API keys in client bundle — verify: `grep -r 'sk-\|sk_live\|secret_key' .next/static/chunks/ | wc -l` → expect 0
- [ ] (critical) `next.config.*` has no syntax errors — verify: covered by build; also `node -e "require('./next.config.js')"` → 0 lines output
- [ ] (critical) Dev server starts cleanly and `localhost:3000` returns HTTP 200 — verify: `timeout 30 npx next dev` prints "Ready"; `curl -w "%{http_code}" http://localhost:3000` → 200
- [ ] (critical) `next start` (production) serves HTTP 200 on `/` — verify: `npx next start &` then curl `/` → 200
- [ ] (critical) All app routes return HTTP 200 — verify: enumerate `app/**/page.tsx`, curl each route → all 200
- [ ] (critical) Zero browser console errors at runtime — verify: Playwright `page.on('console')` type==='error' → 0 per route
- [ ] (critical) No React hydration mismatch — verify: Playwright console scan for `/hydrat|did not match/i` → 0
- [ ] (critical) No uncaught runtime exceptions or unhandled promise rejections — verify: `page.on('pageerror')` → 0 per route
- [ ] (critical) All primary nav links resolve (no dead hrefs) — verify: Playwright HEAD each `nav a[href^="/"]` → status < 400
- [ ] (major) ESLint 0 errors — verify: `npx next lint --max-warnings 0; echo "EXIT:$?"` → `EXIT:0`
- [ ] (major) No `console.log` in production source — verify: `grep -rn 'console\.log' src/ app/ | grep -v '\.test\.' | wc -l` → 0
- [ ] (major) No TODO/FIXME/placeholder strings shipped — verify: `grep -rni 'TODO\|FIXME\|lorem ipsum\|coming soon' src/ app/ | grep -v '\.test\.' | wc -l` → 0
- [ ] (major) Env vars match `.env.example` documented requirements — verify: diff NEXT_PUBLIC_ keys in example vs source refs → empty diff
- [ ] (major) `/favicon.ico` returns HTTP 200 — verify: `curl -w "%{http_code}" http://localhost:3000/favicon.ico` → 200
- [ ] (major) Zero browser console warnings at runtime — verify: Playwright console type==='warning' → 0
- [ ] (major) No missing React `key` prop warnings — verify: Playwright console scan for "Each child in a list should have a unique key" → 0
- [ ] (major) No `href="#"` stub links on nav/primary CTAs — verify: `grep -rn 'href="#"' src/ app/ components/ | wc -l` → 0
- [ ] (major) All internal body links resolve (no 404/500) — verify: Playwright HEAD each `a[href^="/"]` on every route → all status < 400
- [ ] (major) No broken images on any page — verify: Playwright `document.images.filter(i => !i.complete || i.naturalWidth === 0)` → empty array
- [ ] (major) No layout overflow at 1440px or 375px — verify: Playwright `document.body.scrollWidth > window.innerWidth` at both viewports → false
- [ ] (major) No failed network requests (4xx/5xx) during page load — verify: Playwright `page.on('response')` collect status ≥ 400 → empty
- [ ] (major) No mixed content (HTTP assets on HTTPS pages) — verify: Playwright `page.on('request')` filter http:// on https page → empty
- [ ] (major) Each page has a non-empty `<title>` — verify: Playwright `await page.title()` → non-empty, not "Untitled"

---

## Assets & Media

- [ ] (critical) No 404 / network errors for any resource — verify: Playwright `page.on('response')` status ≥ 400 after networkidle → empty
- [ ] (critical) No mixed-content HTTP assets on HTTPS page — verify: `page.on('request')` intercept HTTP requests on HTTPS origin → empty
- [ ] (major) All CSS background-image URLs resolve — verify: extract all `background-image` URLs from computed styles; fetch each → status < 400
- [ ] (major) Fonts actually load — no FOIT — verify: `await document.fonts.ready; Array.from(document.fonts).every(f => f.status === 'loaded')` → true
- [ ] (major) `next/font` used — no raw `@font-face` without `font-display` — verify: iterate cssRules for CSSFontFaceRule; every rule has explicit `font-display: swap/optional/block`
- [ ] (major) `<video>` elements have poster attribute and no load error — verify: `video.poster` non-empty and `video.error === null` for each
- [ ] (major) 3D assets (.glb/.gltf/.hdr) load — no 404 or CORS errors — verify: network failures filtered for `.glb|.gltf|.hdr` → empty; console CORS errors → 0
- [ ] (major) Images have explicit width/height or sizes prop (no CLS) — verify: `document.images` — each has `width+height` or `sizes` or CSS `aspect-ratio`
- [ ] (major) No placeholder image URLs (picsum, via.placeholder.com, random Unsplash) — verify: scan all `img.src` and `background-image` values for placeholder service patterns → 0
- [ ] (major) No console errors from media or asset loading — verify: Playwright console errors matching `/failed to load|net::err|decode error|webgl|texture/i` → 0
- [ ] (major) JSON data files load and parse correctly — verify: all `.json` responses return 200 and `res.json()` does not throw
- [ ] (major) All images have a non-empty `alt` attribute — verify: `document.querySelectorAll('img:not([alt])').length === 0`
- [ ] (minor) Open Graph and Twitter meta images resolve — verify: GET `og:image` and `twitter:image` content URLs → status < 400
- [ ] (minor) SVGs render with non-zero dimensions — verify: `svg.getBoundingClientRect()` width > 0 and height > 0 for all inline SVGs
- [ ] (minor) Large images (> 10 KB) served as WebP or AVIF — verify: image responses > 10 KB have content-type containing `webp` or `avif`
- [ ] (minor) Favicon and apple-touch-icon all load — verify: GET `/favicon.ico` + all `link[rel=icon]` + `link[rel=apple-touch-icon]` hrefs → status < 400
- [ ] (minor) Asset CDN TTFB < 600 ms for image/font/video — verify: `res.timing().responseStart - res.timing().requestStart < 600` for all image/font/video responses

---

## Responsive & Layout

- [ ] (critical) No horizontal page scroll at any breakpoint (375, 768, 1024, 1440, 1920) — verify: `document.body.scrollWidth - clientWidth ≤ 1` at each viewport
- [ ] (critical) No element overflowing viewport edge (left/right) — verify: all visible elements have `getBoundingClientRect().right ≤ viewportWidth + 2` and `left ≥ -2`
- [ ] (critical) Navigation usable at all breakpoints — verify: at 375px hamburger visible and clickable; at 1440px nav links directly visible
- [ ] (critical) Correct viewport meta tag, no zoom lock — verify: `meta[name=viewport]` includes `width=device-width` and `initial-scale=1`; must NOT contain `user-scalable=no`
- [ ] (major) No element wider than viewport without clipping parent — verify: element `getBoundingClientRect().width ≤ viewportWidth + 2`, unless ancestor has `overflow: hidden/clip`
- [ ] (major) No unintentional content overlap — verify: sibling content block intersection > 20% of smaller block flags for visual review; confirm all overlaps are intentional
- [ ] (major) Text not clipped by fixed-height containers — verify: `scrollHeight ≤ clientHeight + 2` for all elements with explicit height and `overflow: hidden`
- [ ] (major) Mobile menu opens and closes correctly — verify: click opens nav links; re-click closes; `body overflow` not `hidden` after close
- [ ] (major) Images scale within viewport — verify: `img.getBoundingClientRect().width ≤ parentElement.getBoundingClientRect().width + 1`
- [ ] (major) Tap targets ≥ 44×44 px on mobile — verify: at 375px, all `a/button/input/[role=button]` `getBoundingClientRect()` ≥ 44×44; hard fail at < 40px
- [ ] (major) No unreadably small text on mobile — verify: at 375px all visible text nodes `parseFloat(fontSize) ≥ 11`
- [ ] (major) Sections stack correctly on mobile (no 2-col overflow) — verify: at 375px no two sibling flex/grid children side-by-side whose combined width > viewportWidth + 4
- [ ] (major) Sticky/fixed elements do not obscure content — verify: first non-fixed section top edge ≥ fixed header bottom edge, tolerance 4px
- [ ] (major) Layout holds at 320px minimum width — verify: `document.body.scrollWidth - clientWidth ≤ 1` at 320×568
- [ ] (major) Page not visually zoomed or scaled abnormally — verify: `getComputedStyle(document.body).zoom == 1` and transform matrix scale == 1
- [ ] (major) Interactive elements reachable by keyboard — verify: Tab to first focusable element; `getComputedStyle(activeElement).outlineStyle !== 'none'`
- [ ] (major) Form fields usable on mobile — verify: at 375px all `input/textarea/select` have `getBoundingClientRect()` ≥ 200×40
- [ ] (major) Animations do not cause layout shift (CLS ≤ 0.1) — verify: PerformanceObserver `layout-shift` entries summed over 3s after load ≤ 0.1
- [ ] (minor) No empty large gaps between sections (> 240px desktop / 160px mobile) — verify: consecutive section gap ≤ threshold, unless confirmed intentional
- [ ] (minor) Hero/banner scales correctly on mobile — verify: at 375px hero height ≥ 200px and contains a visible CTA
- [ ] (minor) Dropdowns and tooltips appear above content — verify: popup z-index > content z-index in same stacking context
- [ ] (minor) 1920px ultra-wide: content constrained to ≤ 1440px — verify: `main/.container getBoundingClientRect().width ≤ 1440` at 1920px viewport
- [ ] (minor) Text visible after responsive CSS at all breakpoints — verify: opacity ≥ 0.15, `color !== backgroundColor`, `visibility !== hidden` at each breakpoint

---

## Design & Craft (Anti-AI)

- [ ] (critical) Not the default AI palette — verify: site does NOT use navy/indigo→purple gradient + soft white glow as primary brand expression
- [ ] (critical) Display face is not Inter/Arial/system default — verify: `getComputedStyle(h1).fontFamily` not in `[Inter, Arial, Helvetica, system-ui, -apple-system, Roboto, Geist]`
- [ ] (critical) Body text contrast ≥ 4.5:1 — verify: contrast ratio of primary body text vs background ≥ 4.5:1 (WCAG AA)
- [ ] (critical) Hero is not centered-headline-on-gradient cliché — verify: layout is NOT centered headline + subline + CTA pair on gradient with glow blob
- [ ] (critical) No even 3-column emoji/icon feature grid — verify: no section uses 3 equal-width columns each with centered emoji/icon + short title + 1–2 lines
- [ ] (critical) Every button has custom `:hover` style — verify: every `<button>` and `<a class~=btn>` has `:hover` rule setting bg/transform/shadow beyond `cursor:pointer`; 100% coverage
- [ ] (critical) Every button has `:focus-visible` ring — verify: `:focus-visible` rule sets `outline` or `box-shadow` ring; `outline:none` without replacement = FAIL
- [ ] (critical) No broken or placeholder images — verify: all `img.naturalWidth > 0`; `img.src` does not contain `placeholder|lorem|picsum`
- [ ] (critical) No lorem ipsum or "coming soon" copy — verify: `document.body.innerText` does not contain `lorem ipsum|coming soon|placeholder|TODO|your text here`
- [ ] (critical) Holistic: looks hand-crafted, not generated — verify: 10-second screenshot test — built by a specific designer with a point of view, not a generic SaaS template
- [ ] (major) Exactly one accent hue used in ≥ 4 CSS rules — verify: count distinct hue values (±15°) in interactive CSS → must equal 1; accent var in ≥ 4 rule locations
- [ ] (major) Identity is deliberate, not defaulted — verify: palette + typeface pairing reflects a deliberate decision; swapping brand name for competitor would require redesign
- [ ] (major) Display typeface has visual personality — verify: heading face has distinctive character — not a perfectly neutral grotesque at default weight
- [ ] (major) 4× type scale contrast minimum per section — verify: in any section, largest-to-smallest font-size ratio ≥ 4:1
- [ ] (major) No two adjacent sections share the same layout shape — verify: every consecutive section pair differs in column count, alignment, or density
- [ ] (major) Asymmetric layout present (5/7, 7/5, 60/40, or off-axis) — verify: at least one section uses off-axis layout or column bleeding past container
- [ ] (major) At least one full-bleed element — verify: at least one element stretches to viewport edge (100vw), breaking the container
- [ ] (major) Primary CTA has press/active state — verify: `:active` with `transform:scale(<1)` or `translateY(+n)`, OR Framer Motion `whileTap`
- [ ] (major) Nav links have custom hover treatment beyond color — verify: `nav a:hover` rule includes underline draw, pseudo-element, opacity shift, or translateX — not bare color change
- [ ] (major) Button design is custom — not browser/shadcn default — verify: primary CTA border-radius, padding, weight, and color reflect site identity tokens
- [ ] (major) Grain overlay is present — verify: fixed overlay with SVG feTurbulence or noise texture, opacity 0.03–0.12, `pointer-events:none`, z-index > 100
- [ ] (major) At least 5 craft micro-details present — verify: ≥ 5 of: mono eyebrows, section counters, animated link underlines, 1px inset highlight border, em-dash list markers, custom dividers, card hover-reveal, consistent 11–12px caption scale
- [ ] (major) No aurora blob / stacked blur circles in hero — verify: hero does NOT use > 3 elements with `filter:blur(≥60px)` as decoration
- [ ] (major) Hero headline is a visual object ≥ 56px with intentional leading — verify: headline ≥ 56px, non-default font, commands page as image-like object
- [ ] (major) Exactly ONE signature wow interaction — verify: exactly one clearly memorable interaction (marquee, custom cursor, hover reveal, count-up, clip-reveal, pinned scroll)
- [ ] (major) Scroll-driven storytelling moment present — verify: at least one section uses scroll position to drive narrative (not just fade-once on intersection)
- [ ] (major) No stock photo with watermark or generic business imagery — verify: all images are product screenshots, custom illustration, or intentional photography
- [ ] (major) Site could only be for THIS product — verify: swapping logo + product name for a competitor would require visual redesign
- [ ] (major) Generous intentional whitespace (≥ 35% void per viewport) — verify: in any viewport screenshot ≥ 35% is negative space
- [ ] (major) Asymmetry is the default — < 40% of sections use centered/symmetric composition — verify: count all content sections; fewer than 40% centered
- [ ] (minor) Negative letter-spacing on display sizes — verify: elements ≥ 40px have `letter-spacing ≤ -0.01em`; elements ≥ 64px have `letter-spacing ≤ -0.025em`
- [ ] (minor) Radius is from a token system (≤ 4 distinct values) — verify: border-radius on buttons/cards/inputs/badges derives from ≤ 4 distinct token values
- [ ] (minor) No uniform default box-shadow on all cards — verify: if > 60% of cards share exact `0 4px 24px rgba(0,0,0,0.08)` → FAIL
- [ ] (minor) No pure `#000000` or `#ffffff` backgrounds — verify: `background-color` of `html`, `body`, and first full-bleed section ≠ `rgb(0,0,0)` or `rgb(255,255,255)`
- [ ] (minor) No generic hero badge with emoji and gradient border — verify: no gradient-border pill badge with emoji above hero headline
- [ ] (minor) Hero visual is not a perspective-tilted product screenshot — verify: no `perspective() + rotateX/rotateY` on hero images
- [ ] (minor) Preloader fires first visit, skips repeat — verify: on first visit preloader visible; `sessionStorage` key set after; on second visit preloader skipped
- [ ] (minor) No plain horizontal logo strip directly under hero — verify: social proof section is NOT a plain row of grayscale logos with "Trusted by teams at..."
- [ ] (minor) Nav is not all-glass sticky bar from scroll=0 — verify: `backdrop-filter:blur` on `header/nav` at scroll=0 → flag for review
- [ ] (minor) Footer is not a dense 4-column link grid — verify: footer has personality (minimal copyright, editorial, or interactive element)

---

## Animation & Interaction

- [ ] (critical) Scroll-reveal targets visible after entering viewport — verify: for each section, `scrollIntoViewIfNeeded()`, wait 900ms, all `[data-reveal]` have opacity > 0.9
- [ ] (critical) No element permanently stuck at opacity:0 after full-page scroll — verify: `window.scrollTo(0, scrollHeight)`, wait 1200ms, elements with opacity < 0.1 and textContent → 0
- [ ] (critical) Signature interaction works on first load — verify: marquee transform changes over 300ms; count-up value changes; cursor tracks pointer
- [ ] (critical) No layout properties (width/height/top/left/margin) in scroll or hover transitions — verify: grep compiled CSS for `transition: width|height|top|left|margin` → 0
- [ ] (critical) With reduced-motion emulated, no critical content stuck at opacity:0 — verify: `emulateMedia({ reducedMotion: 'reduce' })`, scroll to bottom, elements with opacity < 0.1 and textContent > 5 → 0
- [ ] (critical) Hero entrance animation completes — words not stuck off-screen — verify: wait for preloader to clear; all `[data-reveal="word"]` have `DOMMatrix.m42 < 5px` and opacity > 0.9
- [ ] (critical) No console errors from GSAP, Framer Motion, Lenis, or Three.js — verify: collect all page errors during load + full-page scroll; filter for `/gsap|lenis|framer|three|fiber/i` → 0
- [ ] (major) Lenis instance mounted and ticking — verify: `typeof window.__lenis !== 'undefined'` OR `document.querySelector('[data-lenis-root]')` exists
- [ ] (major) Lenis + GSAP ticker synced with `lagSmoothing(0)` — verify: simulate `visibilitychange`, check no elements stuck at opacity < 0.05 after 300ms
- [ ] (major) `whileInView` uses viewport margin — verify: source analysis — all `whileInView` uses include `viewport={{ margin: '-10%' }}`
- [ ] (major) `ScrollTrigger.refresh()` called after fonts/images load — verify: scroll to 50% page height; elements in viewport have opacity > 0.5
- [ ] (major) ScrollTriggers killed on route change — verify: navigate away and back; hero elements animate in from start position, not skipped to final state
- [ ] (major) Exactly ONE signature wow interaction present — verify: one clearly distinct wow moment describable in a sentence
- [ ] (major) Custom cursor gated to fine-pointer devices only — verify: emulate touch (maxTouchPoints=1); cursor element `display:none`; `document.documentElement.cursor !== 'none'`
- [ ] (major) Every button has hover transform or box-shadow change — verify: hover first 5 buttons; computed `transform !== identity` OR `boxShadow !== none`
- [ ] (major) Every interactive element has visible `:focus-visible` ring — verify: Tab to each focusable element; `outline !== 'none'` or `boxShadow !== 'none'` when `:focus-visible`
- [ ] (major) Navigation changes visual state on scroll — verify: record nav className+background at scrollY=0 and scrollY=300 → values must differ
- [ ] (major) GSAP animations wrapped in `gsap.matchMedia()` reduced-motion guard — verify: source analysis; `gsap.from/to` calls inside `matchMedia('(prefers-reduced-motion: no-preference)')` context
- [ ] (major) Preloader exits in under 800ms with reduced-motion — verify: `emulateMedia({ reducedMotion: 'reduce' })`; preloader opacity < 0.05 within 800ms
- [ ] (major) Preloader visible and animating on first visit — verify: clear sessionStorage, navigate, `[data-preloader]` opacity > 0.5 immediately
- [ ] (major) Page transition overlay animates in and out on route change — verify: click internal link; at 100ms overlay visible; at 1000ms overlay gone
- [ ] (major) ScrollTriggers killed on route change (no duplicate stacking) — verify: navigate away and back, confirm no duplicate trigger stacking
- [ ] (major) One pinned/scrub scroll-storytelling section exists — verify: find element with `position:sticky` or GSAP pin attribute → count > 0
- [ ] (major) `transition:all` not used on any element — verify: sample first 300 elements; `getComputedStyle(el).transition.startsWith('all')` → false for all
- [ ] (major) Animated elements have accessible alternatives — verify: `[class*='marquee']` have `aria-hidden='true'`; count-up spans have `aria-label` with final value
- [ ] (major) GSAP plugins registered once at module level — verify: source analysis; `gsap.registerPlugin()` calls outside React component functions
- [ ] (minor) No CSS `scroll-behavior: smooth` conflict with Lenis — verify: `getComputedStyle(document.documentElement).scrollBehavior === 'smooth'` → false
- [ ] (minor) `will-change:transform` on GPU-animated scroll layers — verify: parallax layer elements have `getComputedStyle().willChange === 'transform'`
- [ ] (minor) `will-change` not applied globally (> 50 elements) — verify: count elements with `willChange !== 'auto'`; flag if > 50
- [ ] (minor) Marquee loops seamlessly — verify: total rendered items ≥ unique items × 2; visual check for no gap at loop seam
- [ ] (minor) Nav returns on scroll-up if hide-on-scroll pattern is used — verify: scroll to 600px (nav hides), scroll to 400px → nav visible again
- [ ] (minor) Preloader skipped on repeat visit via sessionStorage — verify: `sessionStorage.setItem('helm_intro_seen','1')`, navigate, hero visible within 500ms
- [ ] (minor) Preloader total duration ≤ 1800ms (non-reduced-motion) — verify: clear sessionStorage, navigate, preloader opacity < 0.1; elapsed < 1800ms
- [ ] (minor) Pinned section uses `anticipatePin:1` and `invalidateOnRefresh:true` — verify: source analysis of scrollTrigger config objects
- [ ] (minor) Motion timing tokens imported from single source (lib/motion-tokens) — verify: no inline `duration: 0.3` or hardcoded easings outside motion-tokens.ts
- [ ] (minor) No `linear` easing on spatial (transform) animations — verify: grep compiled JS for `ease:"linear"` on gsap.from/to or Framer Motion `x/y/transform` animations → 0

---

## Accessibility (WCAG 2.1 AA)

- [ ] (critical) axe-core 0 critical/serious violations across all pages — verify: `axe.run()` violations filtered to critical/serious impact === 0
- [ ] (critical) Exactly one `<h1>` per page — verify: `document.querySelectorAll('h1').length === 1`
- [ ] (critical) All `<img>` have `alt` attribute — verify: `document.querySelectorAll('img:not([alt])').length === 0`
- [ ] (critical) All form inputs have associated labels — verify: axe-core rule `label` returns 0 violations
- [ ] (critical) Error messages linked via `aria-describedby` — verify: on validation, error element id matches input `aria-describedby`
- [ ] (critical) Icon-only buttons have `aria-label` — verify: axe-core rule `button-name` returns 0 violations
- [ ] (critical) Icon-only links have accessible name — verify: axe-core rule `link-name` returns 0 violations
- [ ] (critical) All interactive elements keyboard reachable — verify: Playwright Tab traversal reaches all buttons/links/inputs
- [ ] (critical) No keyboard trap outside modal — verify: Tab 200× from body; all landmark elements receive focus; no infinite loop
- [ ] (critical) No `outline:none` without `:focus-visible` replacement — verify: every CSS outline removal has `:focus-visible` rule with outline or box-shadow replacement
- [ ] (critical) Normal text contrast ≥ 4.5:1 — verify: axe-core rule `color-contrast` returns 0 violations
- [ ] (critical) `html` element has valid `lang` attribute — verify: `document.documentElement.lang` is non-empty valid BCP 47 tag
- [ ] (critical) No content flashes > 3 times per second — verify: no rapid strobing in any animation; use PEAT tool on recorded video
- [ ] (critical) Dialog focus management: focus moves in on open, traps inside, returns to trigger on close — verify: Playwright modal open/close sequence
- [ ] (critical) No invalid ARIA role values — verify: axe-core rules `aria-valid-attr-value` and `aria-roles` return 0 violations
- [ ] (critical) `aria-hidden` not applied to focusable children — verify: axe-core rule `aria-hidden-focus` returns 0 violations
- [ ] (major) Page has `<header>`, `<nav>`, `<main>`, and `<footer>` landmarks — verify: one each of `header/[role=banner]`, `nav`, `main/[role=main]`; footer present
- [ ] (major) No skipped heading levels — verify: axe-core rule `heading-order` returns 0 violations
- [ ] (major) Decorative images have `alt=""` or `aria-hidden="true"` — verify: axe-core rule `image-alt` returns 0 critical violations
- [ ] (major) Informative SVGs have `role="img"` and accessible name — verify: `svg[role="img"]` each has `querySelector('title')` or `aria-label`
- [ ] (major) Video has accurate captions — verify: play embedded video; synchronized caption track exists and is accurate
- [ ] (major) Autoplay animation has pause control and stops under reduced-motion — verify: pause button exists; animation stops when `prefers-reduced-motion: reduce`
- [ ] (major) Placeholder not sole label substitute — verify: axe-core rule `label`; no input has only `placeholder` and no `<label>`
- [ ] (major) Required fields marked programmatically — verify: required fields have `aria-required=true` or `required` attribute
- [ ] (major) Skip-to-main-content link is first focusable element — verify: `a[href="#main"]` or `a[href="#content"]` is first in tab order and visible on focus
- [ ] (major) No positive tabindex — verify: all `[tabindex]` values are 0 or -1; axe-core rule `tabindex`
- [ ] (major) All mouse functionality keyboard accessible — verify: every interactive feature operable with keyboard alone
- [ ] (major) Focus indicator contrast ≥ 3:1 — verify: computed focus ring color vs background ≥ 3:1
- [ ] (major) `:focus-visible` CSS rule exists in stylesheet — verify: stylesheet contains `:focus-visible` selector
- [ ] (major) Large text contrast ≥ 3:1 — verify: axe-core rule `color-contrast` for large text
- [ ] (major) UI components contrast ≥ 3:1 — verify: button borders, input borders, icon strokes vs background
- [ ] (major) `prefers-reduced-motion` media query block exists — verify: stylesheet contains `@media (prefers-reduced-motion: reduce)` block
- [ ] (major) All animations disabled under reduced-motion CSS block — verify: reduced-motion block overrides `animation-duration` and `transition-duration` to 0.001ms
- [ ] (major) JS animations check `prefers-reduced-motion` — verify: JS bundle contains `matchMedia('(prefers-reduced-motion: reduce)').matches` check near animation init
- [ ] (major) Page title updates on SPA navigation — verify: Playwright navigate 3 routes; `document.title` changes on each
- [ ] (major) `aria-expanded` toggled correctly on disclosure widgets — verify: Playwright click toggle; assert `aria-expanded` flips between `true` and `false`
- [ ] (major) `aria-live` regions for dynamic content updates — verify: `document.querySelector('[aria-live]')` exists where async updates occur
- [ ] (major) `aria-labelledby`/`aria-describedby` reference valid IDs — verify: for each value, `document.getElementById(id) !== null`
- [ ] (major) No generic link text ("click here", "read more") — verify: `Array.from(document.querySelectorAll('a')).filter(a => /^(click here|here|read more|more)$/i.test(a.textContent.trim())).length === 0`
- [ ] (major) All interactive targets ≥ 24×24 CSS px — verify: Playwright `getBoundingClientRect` all buttons/links/inputs → `width ≥ 24 && height ≥ 24`
- [ ] (major) Mobile touch targets ≥ 44×44 CSS px — verify: Playwright at 390×844; repeat target size check
- [ ] (major) Content reflows at 400% zoom — verify: browser 400% zoom at 1280px; no horizontal scroll, no content loss
- [ ] (major) Text spacing overridable without content loss — verify: inject `line-height:1.5, letter-spacing:0.12em`; assert no clipping
- [ ] (minor) Multiple navs uniquely labeled — verify: all `nav` elements have `aria-label` or `aria-labelledby` when count > 1
- [ ] (minor) Foreign language passages have `lang` attribute — verify: inspect foreign-language text for inline `lang` attribute
- [ ] (minor) Hover/focus content dismissable and persistent — verify: tooltips and hover menus dismiss on Escape; mouse can enter revealed content

---

## Performance

- [ ] (critical) First Load JS ≤ 300 KB (gzipped) — verify: `next build` stdout route table `/` First Load JS column ≤ 300 KB
- [ ] (critical) GSAP / Three.js / R3F not in initial chunk — verify: `strings .next/static/chunks/framework-*.js | grep -i 'three\|gsap'` → no matches
- [ ] (critical) 3D/animation components use `dynamic()` with `ssr:false` — verify: `grep -rn 'dynamic(' src/ app/ | grep -v 'ssr: false'` → no 3D/animation imports without `ssr:false`
- [ ] (critical) LCP hero image has `next/image` `priority` prop — verify: grep `priority` in hero/landing components; missing `priority` on above-fold image → FAIL; hero image < 200 KB
- [ ] (critical) CLS < 0.1 — verify: Playwright PerformanceObserver layout-shift entries summed over 5s → < 0.1; audit font swap, unsized images, animated reveals
- [ ] (critical) Lighthouse performance score ≥ 90 — verify: `npx lighthouse <url> --only-categories=performance` score × 100 ≥ 90; sub-metrics: LCP < 2.5s, INP < 200ms, TBT < 200ms, FCP < 1.8s
- [ ] (major) All images use `next/image` or have explicit `width`/`height` + modern format — verify: grep `<img ` not using next/image; each must have `width=` and `height=`; PNG/JPG without WebP/AVIF = flag
- [ ] (major) No single asset > 500 KB — verify: `find public/ -size +500k` → any result = FAIL
- [ ] (major) Fonts loaded via `next/font`, no render-blocking font CSS — verify: `grep -rn 'fonts.googleapis.com' src/ app/` → any hit = FAIL
- [ ] (major) Animations use `transform`/`opacity` only — verify: grep CSS for `transition: width|height|top|left|margin`; Chrome Rendering > Paint flashing shows no green flashes during animation
- [ ] (major) GSAP/ScrollTrigger/addEventListener cleaned up in `useEffect` — verify: files with `addEventListener` also contain `removeEventListener`; GSAP files use `gsap.context().revert()` or `.kill()` in cleanup
- [ ] (major) Scroll handlers use RAF, no synchronous layout reads — verify: grep raw scroll handlers for `getBoundingClientRect/offsetTop` without RAF wrapping → 0
- [ ] (major) Offscreen/below-fold heavy content lazy-loaded — verify: `IntersectionObserver/useInView/whileInView` gating heavy below-fold components; Network Slow 4G confirms no early requests
- [ ] (minor) GSAP tree-shaken — only registered plugins imported — verify: each `gsap.registerPlugin()` call has specific named import; no blanket `import gsap from 'gsap'` in non-dynamic files
- [ ] (minor) `preload`/`preconnect` hints for critical third-party origins — verify: `grep -rn 'preload\|preconnect' src/ app/`; external origins used without preconnect → flag
- [ ] (minor) `next.config` image domains/remotePatterns no wildcard — verify: `grep -A20 'images:' next.config.*` | `grep 'hostname.*\*\*'` → 0
- [ ] (minor) No `document.write` or synchronous XHR — verify: `grep -rn 'document.write\|XMLHttpRequest.*open.*false' src/ app/` → 0

---

## SEO

- [ ] (critical) Page title non-default and meaningful (10–60 chars) — verify: `document.title` non-empty, not "Create Next App", length between 10 and 60
- [ ] (critical) Meta description present (50–160 chars) — verify: `meta[name='description'].content.length` between 50 and 160
- [ ] (critical) `og:image` present and URL returns HTTP 200 — verify: `meta[property='og:image']` exists; curl URL → 200 with image MIME type
- [ ] (critical) Canonical URL present, absolute HTTPS, no localhost — verify: `link[rel='canonical'].href` matches `/^https:\/\//` and does not include `localhost`
- [ ] (critical) `meta[name='viewport']` has `width=device-width` and `initial-scale=1` — verify: both tokens present; no `user-scalable=no`
- [ ] (critical) Exactly one H1 with meaningful content (≥ 5 chars) — verify: `document.querySelectorAll('h1').length === 1`; text not "Home", "Welcome", "Heading"
- [ ] (critical) `/robots.txt` returns 200 and contains `User-agent` — verify: fetch `/robots.txt` → 200; contains `User-agent:`; `Sitemap:` directive present; production not `Disallow: /`
- [ ] (critical) `/sitemap.xml` returns 200 with valid XML and ≥ 1 `<url>` — verify: fetch `/sitemap.xml` → 200; valid XML; ≥ 1 `<url><loc>` entry
- [ ] (critical) No accidental `noindex` in meta robots or `X-Robots-Tag` header — verify: `meta[name='robots']` does not include `noindex`; `curl -I` response header does not include `noindex`
- [ ] (major) `og:title` and `og:description` present and non-empty — verify: `meta[property='og:title']` and `meta[property='og:description']` present; description length 50–200
- [ ] (major) `og:url` is absolute HTTPS — verify: `meta[property='og:url'].content` matches `/^https:\/\/.+/`
- [ ] (major) All four Twitter card meta tags present — verify: `meta[name='twitter:card/title/description/image']` all present and non-empty
- [ ] (major) Twitter image URL returns HTTP 200 — verify: curl `meta[name='twitter:image']` content URL → 200 with image MIME type
- [ ] (major) `html lang` attribute is valid BCP 47 — verify: `document.documentElement.lang` matches `/^[a-z]{2}(-[A-Z]{2})?$/`
- [ ] (major) Favicon `link` tag present and `/favicon.ico` returns 200 — verify: `link[rel='icon']` present; fetch `/favicon.ico` → 200
- [ ] (major) All `<img>` have `alt` attribute — verify: `document.querySelectorAll('img:not([alt])').length === 0`
- [ ] (major) `generateMetadata` used; no scaffold boilerplate — verify: `grep -r 'generateMetadata\|export const metadata' app/` ≥ 1 result; no "Create Next App" in metadata
- [ ] (major) OG image ≥ 600×315 px, aspect ratio ~1.91:1, ≤ 5 MB — verify: download og:image; check dimensions and file size
- [ ] (major) OG image contains brand identity and readable text — verify: open og:image URL; brand name/logo visible; text legible at thumbnail scale
- [ ] (minor) `og:type` set to a valid Open Graph type — verify: `meta[property='og:type'].content` in `['website','article','product']`
- [ ] (minor) `apple-touch-icon` link present and href returns 200 — verify: `link[rel='apple-touch-icon']` present; curl href → 200
- [ ] (minor) At least one valid JSON-LD structured data block — verify: `document.querySelectorAll('script[type="application/ld+json"]').length ≥ 1`; each parses as valid JSON with `@context` and `@type`

---

## Content

- [ ] (critical) No lorem ipsum in rendered text — verify: `document.body.innerText` does NOT match `/lorem\s*ipsum/i`
- [ ] (critical) No "placeholder", "TODO", "FIXME", "sample text", "dummy text" visible — verify: Playwright innerText scan for banned strings → 0 matches
- [ ] (critical) No generic brand placeholders ("Brand", "Your Company") — verify: `document.body.innerText` does NOT match standalone `/\bBrand\b/` or `/your company/i`
- [ ] (critical) Hero section with headline + sub-headline above fold — verify: at 1440×900 viewport, headline + sub-headline visible within first 100vh
- [ ] (critical) Value proposition and features section present (≥ 3 capabilities) — verify: dedicated features section exists with real content
- [ ] (critical) Pricing or CTA section present above footer — verify: clear pricing tier or primary conversion CTA exists
- [ ] (critical) Footer with nav links, legal links, and social link — verify: footer contains nav links, `/privacy/i` link, `/terms/i` link, at least one social link
- [ ] (critical) Primary CTA `href` is a real destination (not `#` or `javascript:void(0)`) — verify: `page.$$eval('.hero a', els => els.map(el => el.getAttribute('href')))` → no `#` or empty
- [ ] (critical) No XX%/NNN placeholder stats — verify: `document.body.innerText` does NOT match `/\bXX%|NNN|###/`
- [ ] (critical) No `$0` or `$000` in pricing — verify: pricing section text does NOT match `/\$0{2,}|\$X+/i`
- [ ] (critical) Forms have real input fields and non-dead action — verify: `<form action>` is NOT `#` or `javascript:void(0)`; form contains `input[type=email/text]` + submit
- [ ] (critical) All brief sections exist — verify: cross-reference creative brief line-by-line against live page
- [ ] (major) `<title>` and `<h1>` contain real brand name — verify: `document.title` does NOT match `/brand|your company|untitled/i`; `h1` not "Home"/"Page Title"/"Heading"
- [ ] (major) Brand name spelling consistent across all pages — verify: all instances of brand name use identical capitalisation
- [ ] (major) Primary CTA text is specific, not generic — verify: CTA text NOT "Click here"/"Submit"/"Button"/"Learn More" alone
- [ ] (major) Footer nav links resolve (< 20% dead hrefs) — verify: `footer a[href='#']` count / total footer links < 0.2; Privacy and Terms links present
- [ ] (major) No raw HTML entities in visible text (`&amp;`, `&lt;`, `&gt;`) — verify: `document.body.innerText` does NOT contain `&amp;`, `&lt;`, or `&gt;`
- [ ] (major) No spelling errors in `<h1>`–`<h3>` — verify: extract all headings; run spell-check tool or manual read
- [ ] (major) No verbatim duplicated sections (> 50 chars) — verify: all section innerText blocks are unique
- [ ] (major) Feature cards have unique descriptions — verify: feature card body text strings are all distinct
- [ ] (major) Stats use real numbers — verify: all numeric claims are specific and plausible
- [ ] (major) No date placeholders ("Month DD, YYYY") — verify: `document.body.innerText` does NOT match `/Month DD, YYYY|MM\/DD\/YYYY/i`
- [ ] (major) Form submit button not disabled by default — verify: `form button[type=submit].disabled === false`
- [ ] (major) Form has success/error feedback state — verify: trigger form submission; confirm feedback state appears
- [ ] (major) Requested integrations/platforms mentioned in copy — verify: integrations named in brief appear in features or compatibility section
- [ ] (major) Screenshots are real product UI (no wireframe stubs) — verify: inspect all product screenshots for real UI content
- [ ] (minor) Copyright year is current — verify: footer text contains `2026` or `new Date().getFullYear()`
- [ ] (minor) Testimonials are unique and person-specific — verify: each testimonial quote is distinct
- [ ] (minor) Consistent tone throughout (no formal↔casual shifts) — verify: read page top-to-bottom for tone consistency
- [ ] (minor) Consistent brand voice (first-person or third-person, not both) — verify: grep "we"/"our" vs brand-name-only references
