# Accessibility Checklist — WCAG 2.1 AA
**Scope:** Premium animated website (dark theme)  
**Standard:** WCAG 2.1 Level AA  
**Format:** Binary PASS / FAIL · AUTO = automatable via axe-core/Playwright · VISUAL = requires manual review

---

## 1. Semantic Landmarks

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| LM-01 | Page has exactly one `<header>` landmark (or `role="banner"`) | Critical | AUTO | `document.querySelectorAll('header, [role="banner"]').length === 1` | — |
| LM-02 | Page has a `<nav>` landmark (or `role="navigation"`) | Serious | AUTO | `document.querySelector('nav, [role="navigation"]') !== null` | — |
| LM-03 | Page has exactly one `<main>` landmark (or `role="main"`) | Critical | AUTO | `document.querySelectorAll('main, [role="main"]').length === 1` | — |
| LM-04 | Page has a `<footer>` landmark (or `role="contentinfo"`) | Moderate | AUTO | `document.querySelector('footer, [role="contentinfo"]') !== null` | — |
| LM-05 | No landmark is nested inside another landmark of the same type | Serious | AUTO | axe-core rule `landmark-unique` returns 0 violations | — |
| LM-06 | All visible content is contained within a landmark region | Moderate | AUTO | axe-core rule `region` returns 0 violations | — |
| LM-07 | Multiple nav landmarks each have a unique `aria-label` or `aria-labelledby` | Moderate | AUTO | `Array.from(document.querySelectorAll('nav')).every(el => el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'))` when count > 1 | — |

---

## 2. Heading Order

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| HD-01 | Page has exactly one `<h1>` | Critical | AUTO | `document.querySelectorAll('h1').length === 1` | — |
| HD-02 | Heading levels are not skipped (e.g., h2 → h4 without h3) | Serious | AUTO | Extract ordered heading levels; assert no gap > 1 between consecutive levels. axe-core rule `heading-order` returns 0 violations. | — |
| HD-03 | First `<h1>` content matches or describes the page title | Moderate | VISUAL | Compare `<h1>` text against `<title>` content visually | — |
| HD-04 | Headings are not used purely for visual styling (bold text as h-tag) | Moderate | VISUAL | Inspect DOM — heading tags wrap section titles, not decorative copy | — |

---

## 3. Images & Media

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| IM-01 | Every `<img>` element has an `alt` attribute present (value may be empty) | Critical | AUTO | `Array.from(document.querySelectorAll('img')).every(img => img.hasAttribute('alt'))` | — |
| IM-02 | Decorative images have `alt=""` or `aria-hidden="true"` | Serious | AUTO | axe-core rule `image-alt` returns 0 critical violations. For decorative images: `alt === ""` or `aria-hidden === "true"`. | — |
| IM-03 | Informative images have non-empty, descriptive alt text (not "image", "photo", "icon") | Serious | AUTO + VISUAL | axe-core rule `image-alt`; manually review alt values for meaningful description | — |
| IM-04 | CSS background images that convey information have a text alternative in the DOM | Serious | VISUAL | Check backgrounds used as content (hero, product shots) have adjacent visible or sr-only text | — |
| IM-05 | SVG icons used as images have `role="img"` and a `<title>` or `aria-label` | Serious | AUTO | `Array.from(document.querySelectorAll('svg[role="img"]')).every(svg => svg.querySelector('title') || svg.getAttribute('aria-label'))` | — |
| IM-06 | Decorative SVG icons have `aria-hidden="true"` | Moderate | AUTO | `document.querySelectorAll('svg:not([role="img"])')` — each has `aria-hidden="true"` | — |
| IM-07 | Video has captions (auto-generated not sufficient) for all speech/audio | Critical | VISUAL | Play any embedded video; verify synchronized caption track exists and is accurate | — |
| IM-08 | Animated GIFs / autoplay video can be paused/stopped | Serious | AUTO + VISUAL | Control (pause button) exists; respects `prefers-reduced-motion` (see PM section) | — |

---

## 4. Forms

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| FM-01 | Every `<input>`, `<select>`, `<textarea>` has an associated `<label>` (via `for`/`id` or wrapping) | Critical | AUTO | `Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea')).every(el => document.querySelector('label[for="' + el.id + '"]') || el.closest('label'))` · also axe-core rule `label` | — |
| FM-02 | `placeholder` is NOT the only label substitute | Serious | AUTO | axe-core rule `label`; assert no input has `placeholder` and no `<label>` | — |
| FM-03 | Required fields indicated programmatically (`aria-required="true"` or `required`) | Serious | AUTO | `Array.from(document.querySelectorAll('[aria-required],[required]'))` — cross-check with visually marked required fields | — |
| FM-04 | Error messages are associated with their input via `aria-describedby` | Critical | AUTO | Trigger validation; check error element id matches input's `aria-describedby` | — |
| FM-05 | Error messages appear and focus is moved to first error or error summary | Serious | VISUAL | Submit form with errors; verify screen reader announcement (use live region or focus shift) | — |
| FM-06 | Form submission success/failure announced via `aria-live` region | Moderate | AUTO | `document.querySelector('[aria-live]')` exists near status messages; region is populated on submit | — |
| FM-07 | `autocomplete` attributes are set on common fields (name, email, address) | Moderate | AUTO | Check inputs: `name="email"` has `autocomplete="email"` etc. (WCAG 1.3.5) | — |

---

## 5. Icon-only Buttons & Links

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| IB-01 | Every icon-only `<button>` has a non-empty `aria-label` | Critical | AUTO | `Array.from(document.querySelectorAll('button')).filter(btn => !btn.textContent.trim()).every(btn => btn.getAttribute('aria-label') || btn.getAttribute('aria-labelledby'))` · axe-core rule `button-name` | — |
| IB-02 | Every icon-only `<a>` has a non-empty `aria-label` or visible text | Critical | AUTO | `Array.from(document.querySelectorAll('a')).filter(a => !a.textContent.trim() && !a.querySelector('img[alt]')).every(a => a.getAttribute('aria-label') || a.getAttribute('aria-labelledby'))` · axe-core rule `link-name` | — |
| IB-03 | `aria-label` value is meaningful, not just the icon name ("menu" not "hamburger") | Moderate | VISUAL | Review all `aria-label` values on icon buttons for clear purpose description | — |
| IB-04 | Icon inside labeled button has `aria-hidden="true"` to avoid duplication | Moderate | AUTO | Buttons with both visible text label and SVG icon: `svg` has `aria-hidden="true"` | — |

---

## 6. Focus Management & Keyboard

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| FK-01 | A skip-to-main-content link is the first focusable element on each page | Serious | AUTO | `document.querySelector('a[href="#main"], a[href="#content"]')` is the first in tab order; becomes visible on focus | — |
| FK-02 | All interactive elements are reachable via Tab/Shift+Tab | Critical | AUTO + VISUAL | Playwright: `page.keyboard.press('Tab')` repeatedly; assert every button/link/input receives focus. axe-core rule `scrollable-region-focusable`. | — |
| FK-03 | No keyboard focus trap exists outside intentional modal dialogs | Critical | AUTO + VISUAL | Tab through entire page; verify no infinite loop. Playwright: tab 200× from body, assert all landmark elements receive focus at least once. | — |
| FK-04 | No element has `tabindex` value > 0 | Serious | AUTO | `document.querySelectorAll('[tabindex]')` — assert all values are 0 or -1 · axe-core rule `tabindex` | — |
| FK-05 | Focus order matches visual/logical reading order | Serious | VISUAL | Tab through page; verify focus moves left-to-right, top-to-bottom per section | — |
| FK-06 | All functionality achievable with mouse is achievable with keyboard alone | Critical | VISUAL | Test every interactive feature (menus, dropdowns, carousels, modals, drag-sort) using only keyboard | — |
| FK-07 | Custom widgets implement correct keyboard patterns (Arrow keys for radiogroup, menus; Enter/Space for buttons) | Serious | VISUAL | Cross-reference ARIA Authoring Practices Guide patterns for each widget type | — |

---

## 7. Visible Focus Indicator

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| VI-01 | `outline: none` / `outline: 0` is never set without a custom replacement `:focus-visible` style | Critical | AUTO | Parse CSS: every rule removing default outline includes a `:focus-visible` replacement with `outline` or `box-shadow` | — |
| VI-02 | Focus indicator has a contrast ratio ≥ 3:1 against adjacent colors (WCAG 2.2 3.2.4) | Serious | AUTO + VISUAL | Computed focus ring color vs background — check with contrast tool. Playwright: screenshot focused element and measure ring vs background. | — |
| VI-03 | Focus indicator area ≥ the perimeter of the element × 1px (WCAG 2.2 2.4.11 AA) | Moderate | VISUAL | Visually inspect: focus ring is clearly visible, not just a 1px dotted outline buried in dark theme | — |
| VI-04 | `:focus-visible` CSS rule exists in stylesheets (not just `:focus`) | Serious | AUTO | `Array.from(document.styleSheets).some(ss => { try { return Array.from(ss.cssRules).some(r => r.selectorText && r.selectorText.includes(':focus-visible')) } catch(e){} })` | — |
| VI-05 | Focus indicator is not obscured by sticky headers, overlays, or z-index stacking | Serious | VISUAL | Tab to elements near top of viewport; confirm focused element is fully visible, not cut off under sticky nav | — |

---

## 8. Color Contrast

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| CC-01 | Normal text (< 18pt / < 14pt bold) contrast ≥ 4.5:1 | Critical | AUTO | Playwright + `getComputedStyle(el).color` vs background; use `wcag-contrast` library. axe-core rule `color-contrast`. | — |
| CC-02 | Large text (≥ 18pt regular or ≥ 14pt bold) contrast ≥ 3:1 | Serious | AUTO | Same computed-color check with size classification. axe-core rule `color-contrast`. | — |
| CC-03 | UI components and graphical objects contrast ≥ 3:1 against adjacent colors | Serious | AUTO + VISUAL | Check button borders, input borders, icon strokes, focus rings vs background via computed styles. axe-core rule `color-contrast` (UI). | — |
| CC-04 | Text over gradient or image backgrounds meets contrast at all points | Serious | VISUAL | Screenshot hero/card areas with overlaid text; sample multiple points with color picker for darkest and lightest background | — |
| CC-05 | Disabled elements are visually distinguishable without relying on color alone | Moderate | VISUAL | Disabled buttons/inputs: verify opacity/pattern difference, not just color change | — |
| CC-06 | Information is not conveyed by color alone (e.g., required field red border + icon/text) | Serious | VISUAL | Simulate deuteranopia with browser devtools or Sim Daltonism; all status indicators still legible | — |

---

## 9. Motion & Animation

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| PM-01 | CSS `@media (prefers-reduced-motion: reduce)` block exists in stylesheet | Serious | AUTO | `Array.from(document.styleSheets).some(ss => { try { return Array.from(ss.cssRules).some(r => r.conditionText && r.conditionText.includes('prefers-reduced-motion')) } catch(e){} })` | — |
| PM-02 | All `transition` and `animation` properties are overridden to `none` or `duration: 0.001ms` inside the reduce block | Serious | AUTO | In reduced-motion media query block: `* { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }` or equivalent per-property overrides | — |
| PM-03 | JavaScript-driven animations (GSAP, Framer Motion, requestAnimationFrame) check `matchMedia('(prefers-reduced-motion: reduce)').matches` | Serious | AUTO | Search JS bundle for `prefers-reduced-motion` check adjacent to animation init code | — |
| PM-04 | Scroll-triggered / parallax effects are disabled or replaced with instant transitions under reduced-motion | Serious | VISUAL | Enable reduced-motion in OS; verify parallax/scroll animations are static or fade-only | — |
| PM-05 | No content flashes more than 3 times per second (seizure threshold) | Critical | VISUAL | Play all animations at normal speed; verify no rapid strobing. Use PEAT tool on recorded video if unsure. | — |
| PM-06 | Autoplay animations lasting > 5 seconds have a pause/stop mechanism visible without keyboard navigation | Serious | VISUAL | Locate any looping hero animation; confirm pause button is immediately visible | — |

---

## 10. Language & HTML Structure

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| LA-01 | `<html>` element has a valid `lang` attribute (e.g., `lang="en"`) | Critical | AUTO | `document.documentElement.lang` is a non-empty valid BCP 47 language tag · axe-core rule `html-has-lang` | — |
| LA-02 | `lang` attribute value is valid BCP 47 (not `lang="english"` or `lang="en-us"` with wrong case) | Serious | AUTO | axe-core rule `html-lang-valid` returns 0 violations | — |
| LA-03 | Passages in a different language have `lang` attribute on the containing element | Moderate | VISUAL | Inspect any foreign-language text (quotes, terms, UI localization) for correct inline `lang` attribute | — |
| LA-04 | `<title>` element is present and descriptive | Serious | AUTO | `document.title.trim().length > 0` · axe-core rule `document-title` | — |
| LA-05 | Page `<title>` updates on client-side route navigation (SPA) | Serious | AUTO | Playwright: navigate to 3 routes; assert `document.title` changes on each | — |

---

## 11. ARIA Usage

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| AR-01 | axe-core returns 0 critical or serious violations across all pages | Critical | AUTO | `const results = await axe.run(); assert(results.violations.filter(v => ['critical','serious'].includes(v.impact)).length === 0)` | — |
| AR-02 | No ARIA `role` values are invalid (e.g., `role="button button"`, `role="flyout"`) | Critical | AUTO | axe-core rule `aria-valid-attr-value`; `aria-roles` returns 0 violations | — |
| AR-03 | ARIA attributes are valid for the element's role (e.g., no `aria-checked` on a `<div>` without a checkbox role) | Serious | AUTO | axe-core rule `aria-allowed-attr` returns 0 violations | — |
| AR-04 | `aria-expanded` is toggled correctly on disclosure widgets (nav toggles, accordions) | Serious | AUTO | Playwright: click toggle button; assert `aria-expanded` flips between `"true"` and `"false"` | — |
| AR-05 | `aria-live` regions are used for dynamic content updates (toasts, status messages) | Serious | AUTO | `document.querySelector('[aria-live="polite"], [aria-live="assertive"]')` exists where async updates occur | — |
| AR-06 | `aria-hidden="true"` is not applied to elements that contain focusable children | Critical | AUTO | axe-core rule `aria-hidden-focus` returns 0 violations | — |
| AR-07 | `role="presentation"` / `role="none"` is not misused on interactive elements | Serious | AUTO | axe-core rule `presentation-role-conflict` returns 0 violations | — |
| AR-08 | `aria-labelledby` and `aria-describedby` reference IDs that actually exist in the DOM | Serious | AUTO | axe-core rule `aria-valid-attr-value` + custom: for each `aria-labelledby`/`aria-describedby` value, `document.getElementById(id) !== null` | — |

---

## 12. Link Text

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| LT-01 | No links contain only generic text: "click here", "here", "read more", "more", "learn more" without context | Serious | AUTO | `Array.from(document.querySelectorAll('a')).filter(a => /^(click here|here|read more|more|learn more|this)$/i.test(a.textContent.trim())).length === 0` | — |
| LT-02 | Links with identical visible text that point to different URLs are disambiguated via `aria-label` | Serious | AUTO | Group links by visible text; for duplicates, assert `aria-label` or `aria-labelledby` provides unique context | — |
| LT-03 | Links that open in a new tab have a visual indicator and `aria-label` noting "(opens in new tab)" | Moderate | VISUAL + AUTO | `document.querySelectorAll('a[target="_blank"]')` — each has `aria-label` ending in "(opens in new tab)" or equivalent | — |
| LT-04 | Link purpose can be determined from link text alone or link + programmatic context | Serious | VISUAL | Compile list of all link texts; verify each is self-describing in isolation or within its `<p>` / list item context | — |

---

## 13. Dialog & Modal Focus Management

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| DM-01 | When a dialog opens, focus moves to the dialog container or first focusable element inside | Critical | VISUAL + AUTO | Playwright: trigger modal open; assert `document.activeElement` is inside the dialog after open | — |
| DM-02 | Focus is trapped within the open dialog (Tab/Shift+Tab cycle within dialog) | Critical | AUTO | Playwright: open modal; Tab through all focusable children; assert focus does not leave dialog element | — |
| DM-03 | Dialog is closed via Escape key | Serious | AUTO | Playwright: open modal; `page.keyboard.press('Escape')`; assert dialog is removed/hidden | — |
| DM-04 | When a dialog closes, focus returns to the element that triggered it | Serious | AUTO | Playwright: click trigger; close modal; assert `document.activeElement === triggerElement` | — |
| DM-05 | Dialog element has `role="dialog"` or uses `<dialog>` element, with `aria-modal="true"` | Serious | AUTO | `document.querySelector('[role="dialog"], dialog')` — has `aria-modal="true"` · axe-core rule `dialog-name` | — |
| DM-06 | Dialog has an accessible name via `aria-labelledby` (pointing to visible heading) or `aria-label` | Serious | AUTO | `dialog.getAttribute('aria-labelledby') || dialog.getAttribute('aria-label')` is non-empty | — |

---

## 14. Target Size

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| TS-01 | All interactive targets are ≥ 24×24 CSS pixels (WCAG 2.2 2.5.8 AA minimum) | Serious | AUTO | Playwright: `el.getBoundingClientRect()` for all buttons/links/inputs — assert `width >= 24 && height >= 24` | — |
| TS-02 | Targets smaller than 24×24px have sufficient spacing so the total "target offset" area meets 24px minimum | Moderate | VISUAL | For any small inline links, verify surrounding whitespace creates effective 24px touch zone | — |
| TS-03 | Primary CTAs and navigation links are ≥ 44×44 CSS pixels (WCAG 2.5.5 AAA, strongly recommended) | Moderate | AUTO | Playwright `getBoundingClientRect()` on primary action buttons — note any below 44px | — |
| TS-04 | Touch targets on mobile viewport are ≥ 44×44 CSS pixels | Serious | AUTO | Playwright at `viewport: { width: 390, height: 844 }`; repeat TS-01 check | — |

---

## 15. Additional Checks

| ID | Check | Severity | Type | Verification | Status |
|----|-------|----------|------|--------------|--------|
| AD-01 | No content relies on sensory characteristics alone (shape, color, sound, location: "click the red button") | Serious | VISUAL | Audit all instructional copy for sensory-only references | — |
| AD-02 | Page reflows at 400% zoom without horizontal scrolling on 1280px viewport (320 CSS px content width) | Serious | VISUAL | Browser zoom to 400% at 1280px; verify single-column layout, no horizontal scroll | — |
| AD-03 | Text spacing can be changed (line-height 1.5×, letter-spacing 0.12em, word-spacing 0.16em) without loss of content | Serious | AUTO | Inject bookmarklet: `document.body.style.lineHeight='1.5'; document.body.style.letterSpacing='0.12em'`; assert no text clips/overlaps | — |
| AD-04 | Session timeouts warn user with ≥ 20 seconds to extend (if applicable) | Serious | VISUAL | If auth session exists, trigger near-expiry; verify warning dialog with extension option | — |
| AD-05 | On focus or hover, newly revealed content (tooltips, dropdowns) is dismissable (Esc), hoverable, and persistent | Moderate | VISUAL | Trigger all tooltips and hover menus; verify Escape dismisses, mouse can move to revealed content | — |

---

## Machine-readable items

```json
[
  {"id":"LM-01","category":"a11y","severity":"critical","title":"Single banner landmark","check":"document.querySelectorAll('header, [role=\"banner\"]').length === 1","verify":"AUTO"},
  {"id":"LM-02","category":"a11y","severity":"serious","title":"Navigation landmark present","check":"document.querySelector('nav, [role=\"navigation\"]') !== null","verify":"AUTO"},
  {"id":"LM-03","category":"a11y","severity":"critical","title":"Single main landmark","check":"document.querySelectorAll('main, [role=\"main\"]').length === 1","verify":"AUTO"},
  {"id":"LM-04","category":"a11y","severity":"moderate","title":"Footer/contentinfo landmark present","check":"document.querySelector('footer, [role=\"contentinfo\"]') !== null","verify":"AUTO"},
  {"id":"LM-05","category":"a11y","severity":"serious","title":"No duplicate landmark types","check":"axe-core rule landmark-unique returns 0 violations","verify":"AUTO"},
  {"id":"LM-06","category":"a11y","severity":"moderate","title":"All content within landmarks","check":"axe-core rule region returns 0 violations","verify":"AUTO"},
  {"id":"LM-07","category":"a11y","severity":"moderate","title":"Multiple navs uniquely labeled","check":"All nav elements have aria-label or aria-labelledby when count > 1","verify":"AUTO"},
  {"id":"HD-01","category":"a11y","severity":"critical","title":"Exactly one h1","check":"document.querySelectorAll('h1').length === 1","verify":"AUTO"},
  {"id":"HD-02","category":"a11y","severity":"serious","title":"No skipped heading levels","check":"axe-core rule heading-order returns 0 violations; consecutive heading levels differ by at most 1","verify":"AUTO"},
  {"id":"HD-03","category":"a11y","severity":"moderate","title":"h1 matches page title conceptually","check":"Visual comparison of h1 text vs document.title","verify":"VISUAL"},
  {"id":"HD-04","category":"a11y","severity":"moderate","title":"Headings used for structure not style","check":"Heading tags wrap section titles, not decorative copy","verify":"VISUAL"},
  {"id":"IM-01","category":"a11y","severity":"critical","title":"All img have alt attribute","check":"Array.from(document.querySelectorAll('img')).every(img => img.hasAttribute('alt'))","verify":"AUTO"},
  {"id":"IM-02","category":"a11y","severity":"serious","title":"Decorative images alt empty or aria-hidden","check":"axe-core rule image-alt returns 0 critical violations","verify":"AUTO"},
  {"id":"IM-03","category":"a11y","severity":"serious","title":"Informative images have meaningful alt","check":"axe-core image-alt + manual review of alt values","verify":"AUTO+VISUAL"},
  {"id":"IM-04","category":"a11y","severity":"serious","title":"Informative CSS backgrounds have text alternative","check":"Backgrounds used as content have adjacent visible or sr-only text","verify":"VISUAL"},
  {"id":"IM-05","category":"a11y","severity":"serious","title":"Informative SVGs have role=img and accessible name","check":"Array.from(document.querySelectorAll('svg[role=\"img\"]')).every(svg => svg.querySelector('title') || svg.getAttribute('aria-label'))","verify":"AUTO"},
  {"id":"IM-06","category":"a11y","severity":"moderate","title":"Decorative SVGs have aria-hidden","check":"document.querySelectorAll('svg:not([role=\"img\"])') all have aria-hidden=true","verify":"AUTO"},
  {"id":"IM-07","category":"a11y","severity":"critical","title":"Video has accurate captions","check":"Play embedded video; verify synchronized caption track exists and is accurate","verify":"VISUAL"},
  {"id":"IM-08","category":"a11y","severity":"serious","title":"Autoplay animation has pause control","check":"Pause button exists for looping animation; animation stops under prefers-reduced-motion","verify":"AUTO+VISUAL"},
  {"id":"FM-01","category":"a11y","severity":"critical","title":"All form inputs have associated labels","check":"axe-core rule label returns 0 violations; every input/select/textarea has label via for/id or wrapping label","verify":"AUTO"},
  {"id":"FM-02","category":"a11y","severity":"serious","title":"Placeholder not sole label","check":"axe-core rule label; no input has only placeholder and no label","verify":"AUTO"},
  {"id":"FM-03","category":"a11y","severity":"serious","title":"Required fields marked programmatically","check":"Required fields have aria-required=true or required attribute","verify":"AUTO"},
  {"id":"FM-04","category":"a11y","severity":"critical","title":"Error messages linked via aria-describedby","check":"On validation: error element id matches input aria-describedby","verify":"AUTO"},
  {"id":"FM-05","category":"a11y","severity":"serious","title":"Focus moves to first error on submit","check":"Submit invalid form; focus lands on first error or error summary","verify":"VISUAL"},
  {"id":"FM-06","category":"a11y","severity":"moderate","title":"Submit status announced via aria-live","check":"document.querySelector('[aria-live]') exists and is populated on submit response","verify":"AUTO"},
  {"id":"FM-07","category":"a11y","severity":"moderate","title":"Autocomplete attributes on common fields","check":"name/email/address inputs have correct autocomplete attribute values","verify":"AUTO"},
  {"id":"IB-01","category":"a11y","severity":"critical","title":"Icon-only buttons have aria-label","check":"All buttons with no text content have aria-label or aria-labelledby; axe-core rule button-name","verify":"AUTO"},
  {"id":"IB-02","category":"a11y","severity":"critical","title":"Icon-only links have accessible name","check":"All links with no text or alt-text image have aria-label; axe-core rule link-name","verify":"AUTO"},
  {"id":"IB-03","category":"a11y","severity":"moderate","title":"Icon aria-label is meaningful","check":"Review all aria-label values on icon buttons for clear purpose description","verify":"VISUAL"},
  {"id":"IB-04","category":"a11y","severity":"moderate","title":"Icons inside labeled buttons are aria-hidden","check":"SVG icons inside buttons with visible text label have aria-hidden=true","verify":"AUTO"},
  {"id":"FK-01","category":"a11y","severity":"serious","title":"Skip-to-content link is first focusable element","check":"document.querySelector('a[href=\"#main\"], a[href=\"#content\"]') is first in tab order and visible on focus","verify":"AUTO"},
  {"id":"FK-02","category":"a11y","severity":"critical","title":"All interactive elements keyboard reachable","check":"Playwright Tab traversal reaches all buttons/links/inputs; axe-core scrollable-region-focusable","verify":"AUTO+VISUAL"},
  {"id":"FK-03","category":"a11y","severity":"critical","title":"No keyboard trap outside modal","check":"Tab 200× from body; all landmark elements receive focus; no infinite loop","verify":"AUTO+VISUAL"},
  {"id":"FK-04","category":"a11y","severity":"serious","title":"No positive tabindex","check":"document.querySelectorAll('[tabindex]') all have value 0 or -1; axe-core rule tabindex","verify":"AUTO"},
  {"id":"FK-05","category":"a11y","severity":"serious","title":"Focus order matches visual reading order","check":"Tab through page; focus moves in logical visual sequence","verify":"VISUAL"},
  {"id":"FK-06","category":"a11y","severity":"critical","title":"All mouse functionality keyboard accessible","check":"Every interactive feature operable with keyboard alone","verify":"VISUAL"},
  {"id":"FK-07","category":"a11y","severity":"serious","title":"Custom widgets use correct keyboard patterns","check":"Arrow keys for menus/radiogroups; Enter/Space for buttons per ARIA APG","verify":"VISUAL"},
  {"id":"VI-01","category":"a11y","severity":"critical","title":"No outline:none without :focus-visible replacement","check":"CSS: every outline removal has :focus-visible rule with outline or box-shadow replacement","verify":"AUTO"},
  {"id":"VI-02","category":"a11y","severity":"serious","title":"Focus indicator contrast >= 3:1","check":"Computed focus ring color vs background >= 3:1 contrast ratio","verify":"AUTO+VISUAL"},
  {"id":"VI-03","category":"a11y","severity":"moderate","title":"Focus indicator clearly visible on dark theme","check":"Focus ring is visually prominent, not a 1px dotted outline","verify":"VISUAL"},
  {"id":"VI-04","category":"a11y","severity":"serious","title":":focus-visible rule exists in stylesheet","check":"Array.from(document.styleSheets) contains rule with :focus-visible selector","verify":"AUTO"},
  {"id":"VI-05","category":"a11y","severity":"serious","title":"Focus not obscured by sticky elements","check":"Tab near sticky header; focused element fully visible","verify":"VISUAL"},
  {"id":"CC-01","category":"a11y","severity":"critical","title":"Normal text contrast >= 4.5:1","check":"axe-core rule color-contrast returns 0 violations; getComputedStyle color vs background >= 4.5:1","verify":"AUTO"},
  {"id":"CC-02","category":"a11y","severity":"serious","title":"Large text contrast >= 3:1","check":"axe-core rule color-contrast for large text >= 3:1","verify":"AUTO"},
  {"id":"CC-03","category":"a11y","severity":"serious","title":"UI components contrast >= 3:1","check":"Button borders, input borders, icon strokes vs background >= 3:1; axe-core color-contrast UI","verify":"AUTO+VISUAL"},
  {"id":"CC-04","category":"a11y","severity":"serious","title":"Text over gradient/image meets contrast","check":"Screenshot hero areas; sample multiple background points with color picker","verify":"VISUAL"},
  {"id":"CC-05","category":"a11y","severity":"moderate","title":"Disabled states visually distinct without color alone","check":"Disabled elements show opacity/pattern difference, not only color change","verify":"VISUAL"},
  {"id":"CC-06","category":"a11y","severity":"serious","title":"Information not conveyed by color alone","check":"Simulate deuteranopia; all status indicators remain legible","verify":"VISUAL"},
  {"id":"PM-01","category":"a11y","severity":"serious","title":"prefers-reduced-motion media query exists","check":"Stylesheet contains @media (prefers-reduced-motion: reduce) block","verify":"AUTO"},
  {"id":"PM-02","category":"a11y","severity":"serious","title":"All animations disabled under reduced-motion","check":"Reduced-motion block overrides animation-duration and transition-duration to 0.001ms","verify":"AUTO"},
  {"id":"PM-03","category":"a11y","severity":"serious","title":"JS animations check prefers-reduced-motion","check":"JS bundle contains matchMedia('(prefers-reduced-motion: reduce)').matches check near animation init","verify":"AUTO"},
  {"id":"PM-04","category":"a11y","severity":"serious","title":"Parallax disabled under reduced-motion","check":"Enable reduced-motion in OS; parallax/scroll animations are static or fade-only","verify":"VISUAL"},
  {"id":"PM-05","category":"a11y","severity":"critical","title":"No content flashes > 3 times per second","check":"No rapid strobing in any animation; verify with PEAT tool on recorded video","verify":"VISUAL"},
  {"id":"PM-06","category":"a11y","severity":"serious","title":"Autoplay animation has visible pause mechanism","check":"Looping hero animation has immediately visible pause button","verify":"VISUAL"},
  {"id":"LA-01","category":"a11y","severity":"critical","title":"html element has valid lang attribute","check":"document.documentElement.lang is non-empty valid BCP 47 tag; axe-core html-has-lang","verify":"AUTO"},
  {"id":"LA-02","category":"a11y","severity":"serious","title":"lang attribute value is valid BCP 47","check":"axe-core rule html-lang-valid returns 0 violations","verify":"AUTO"},
  {"id":"LA-03","category":"a11y","severity":"moderate","title":"Foreign language passages have lang attribute","check":"Inspect foreign-language text for inline lang attribute","verify":"VISUAL"},
  {"id":"LA-04","category":"a11y","severity":"serious","title":"Page title element is present and descriptive","check":"document.title.trim().length > 0; axe-core rule document-title","verify":"AUTO"},
  {"id":"LA-05","category":"a11y","severity":"serious","title":"Page title updates on SPA navigation","check":"Playwright: navigate 3 routes; assert document.title changes on each","verify":"AUTO"},
  {"id":"AR-01","category":"a11y","severity":"critical","title":"axe-core 0 critical/serious violations","check":"axe.run() violations filtered to critical/serious impact = 0","verify":"AUTO"},
  {"id":"AR-02","category":"a11y","severity":"critical","title":"No invalid ARIA role values","check":"axe-core aria-valid-attr-value and aria-roles return 0 violations","verify":"AUTO"},
  {"id":"AR-03","category":"a11y","severity":"serious","title":"ARIA attributes valid for element role","check":"axe-core aria-allowed-attr returns 0 violations","verify":"AUTO"},
  {"id":"AR-04","category":"a11y","severity":"serious","title":"aria-expanded toggled correctly","check":"Playwright: click toggle; assert aria-expanded flips between true and false","verify":"AUTO"},
  {"id":"AR-05","category":"a11y","severity":"serious","title":"aria-live regions for dynamic updates","check":"document.querySelector('[aria-live]') exists where async updates occur","verify":"AUTO"},
  {"id":"AR-06","category":"a11y","severity":"critical","title":"aria-hidden not applied to focusable children","check":"axe-core aria-hidden-focus returns 0 violations","verify":"AUTO"},
  {"id":"AR-07","category":"a11y","severity":"serious","title":"role=presentation not misused on interactive elements","check":"axe-core presentation-role-conflict returns 0 violations","verify":"AUTO"},
  {"id":"AR-08","category":"a11y","severity":"serious","title":"aria-labelledby/describedby reference valid IDs","check":"For each aria-labelledby/aria-describedby value: document.getElementById(id) !== null","verify":"AUTO"},
  {"id":"LT-01","category":"a11y","severity":"serious","title":"No generic link text (click here / read more)","check":"Array.from(document.querySelectorAll('a')).filter(a => /^(click here|here|read more|more|learn more|this)$/i.test(a.textContent.trim())).length === 0","verify":"AUTO"},
  {"id":"LT-02","category":"a11y","severity":"serious","title":"Identical link texts pointing to different URLs disambiguated","check":"Links with same visible text but different href have unique aria-label","verify":"AUTO"},
  {"id":"LT-03","category":"a11y","severity":"moderate","title":"New-tab links warn users","check":"a[target=_blank] elements have aria-label noting opens in new tab","verify":"AUTO+VISUAL"},
  {"id":"LT-04","category":"a11y","severity":"serious","title":"Link purpose determinable from text or context","check":"Every link text is self-describing in isolation or within surrounding paragraph/list context","verify":"VISUAL"},
  {"id":"DM-01","category":"a11y","severity":"critical","title":"Focus moves to dialog on open","check":"Playwright: trigger modal; assert document.activeElement is inside dialog","verify":"AUTO"},
  {"id":"DM-02","category":"a11y","severity":"critical","title":"Focus trapped within open dialog","check":"Playwright: Tab through modal; focus does not escape dialog element","verify":"AUTO"},
  {"id":"DM-03","category":"a11y","severity":"serious","title":"Dialog closes on Escape key","check":"Playwright: open modal; keyboard.press('Escape'); assert dialog hidden/removed","verify":"AUTO"},
  {"id":"DM-04","category":"a11y","severity":"serious","title":"Focus returns to trigger on dialog close","check":"Playwright: close modal; assert document.activeElement === original trigger element","verify":"AUTO"},
  {"id":"DM-05","category":"a11y","severity":"serious","title":"Dialog has correct role and aria-modal","check":"dialog element has role=dialog or is <dialog>, and aria-modal=true; axe-core dialog-name","verify":"AUTO"},
  {"id":"DM-06","category":"a11y","severity":"serious","title":"Dialog has accessible name","check":"dialog has aria-labelledby pointing to visible heading or non-empty aria-label","verify":"AUTO"},
  {"id":"TS-01","category":"a11y","severity":"serious","title":"All targets >= 24x24 CSS pixels","check":"Playwright: getBoundingClientRect on all buttons/links/inputs; width >= 24 && height >= 24","verify":"AUTO"},
  {"id":"TS-02","category":"a11y","severity":"moderate","title":"Sub-24px targets have sufficient offset spacing","check":"Inline links below 24px have surrounding whitespace creating effective 24px touch zone","verify":"VISUAL"},
  {"id":"TS-03","category":"a11y","severity":"moderate","title":"Primary CTAs >= 44x44 CSS pixels (recommended)","check":"Playwright getBoundingClientRect on primary action buttons; note any below 44px","verify":"AUTO"},
  {"id":"TS-04","category":"a11y","severity":"serious","title":"Mobile touch targets >= 44x44 CSS pixels","check":"Playwright at 390x844 viewport; getBoundingClientRect all interactive elements >= 44x44","verify":"AUTO"},
  {"id":"AD-01","category":"a11y","severity":"serious","title":"No sensory-only instructions","check":"Audit copy for color/shape/location-only references","verify":"VISUAL"},
  {"id":"AD-02","category":"a11y","severity":"serious","title":"Content reflows at 400% zoom","check":"Browser 400% zoom at 1280px; no horizontal scroll, no content loss","verify":"VISUAL"},
  {"id":"AD-03","category":"a11y","severity":"serious","title":"Text spacing overridable without content loss","check":"Inject line-height:1.5, letter-spacing:0.12em, word-spacing:0.16em; assert no clipping","verify":"AUTO"},
  {"id":"AD-04","category":"a11y","severity":"serious","title":"Session timeout warning with extension option","check":"Near-expiry dialog gives >= 20 seconds to extend session","verify":"VISUAL"},
  {"id":"AD-05","category":"a11y","severity":"moderate","title":"Hover/focus content dismissable and persistent","check":"Tooltips and hover menus: Escape dismisses, mouse can enter revealed content","verify":"VISUAL"}
]
```
