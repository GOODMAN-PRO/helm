# Responsive Design & Layout Integrity Checklist

**Category:** layout  
**Version:** 1.0  
**Breakpoints:** 375, 768, 1024, 1440, 1920 (px width)

---

## Legend

- **AUTO** — can be asserted programmatically in Playwright  
- **VISUAL** — requires human eye or screenshot diff  
- **CRITICAL** — layout broken / content inaccessible  
- **HIGH** — UX severely degraded  
- **MEDIUM** — polish/edge-case failure  
- **LOW** — minor cosmetic drift

---

## RL-01 · No Horizontal Page Scroll

**Severity:** CRITICAL  
**Verify:** AUTO

The page body must never produce a horizontal scrollbar. Body scroll-width must not exceed client-width (tolerance: 1 px for sub-pixel rounding).

**Playwright check (all breakpoints):**
```js
for (const [w, h] of [[375,812],[768,1024],[1024,768],[1440,900],[1920,1080]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForLoadState('networkidle');
  const overflow = await page.evaluate(() =>
    document.body.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `horizontal overflow at ${w}px`).toBeLessThanOrEqual(1);
}
```

PASS: scrollWidth − clientWidth ≤ 1  
FAIL: any positive value > 1

---

## RL-02 · No Element Overflowing Viewport Edge (Left / Right)

**Severity:** CRITICAL  
**Verify:** AUTO

Every rendered DOM element's bounding box must sit within the horizontal viewport. Exemptions: elements with `[data-marquee]`, `[data-overflow-track]`, or `overflow: hidden` ancestors that clip intentionally.

**Playwright check:**
```js
for (const [w, h] of [[375,812],[768,1024],[1024,768],[1440,900],[1920,1080]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForLoadState('networkidle');
  const offenders = await page.evaluate((vw) => {
    const TOLERANCE = 2;
    const exempt = (el) => {
      let cur = el;
      while (cur && cur !== document.body) {
        if (cur.dataset.marquee !== undefined || cur.dataset.overflowTrack !== undefined) return true;
        const style = getComputedStyle(cur);
        if ((style.overflow === 'hidden' || style.overflowX === 'hidden') && cur !== el) return true;
        cur = cur.parentElement;
      }
      return false;
    };
    return Array.from(document.querySelectorAll('*'))
      .filter(el => el.offsetParent !== null || el.tagName === 'BODY')
      .map(el => ({ tag: el.tagName, id: el.id, cls: el.className.toString().slice(0,60), r: el.getBoundingClientRect() }))
      .filter(({ r, tag }) => tag !== 'HTML' && (r.right > vw + TOLERANCE || r.left < -TOLERANCE))
      .filter(({ r }) => r.width > 0 && r.height > 0)
      .filter(item => !exempt(document.querySelector(`#${item.id}`) || document.body))
      .map(({ tag, id, cls, r }) => `${tag}#${id}.${cls} left=${r.left.toFixed(1)} right=${r.right.toFixed(1)}`);
  }, w);
  expect(offenders, `overflow elements at ${w}px`).toHaveLength(0);
}
```

PASS: offenders array empty at every breakpoint  
FAIL: any element with right > viewport+2 or left < −2

---

## RL-03 · No Element Wider Than Viewport (Non-Intentional)

**Severity:** HIGH  
**Verify:** AUTO

No element's rendered width should exceed the viewport width unless it sits inside a container that explicitly clips it (overflow hidden / clip).

**Playwright check:**
```js
const offenders = await page.evaluate((vw) => {
  return Array.from(document.querySelectorAll('*'))
    .filter(el => {
      const r = el.getBoundingClientRect();
      if (r.width <= vw + 2) return false;
      let cur = el.parentElement;
      while (cur && cur !== document.documentElement) {
        const s = getComputedStyle(cur);
        if (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.overflowX === 'clip') return false;
        cur = cur.parentElement;
      }
      return true;
    })
    .map(el => `${el.tagName} w=${el.getBoundingClientRect().width.toFixed(0)}`);
}, viewportWidth);
expect(offenders).toHaveLength(0);
```

PASS: no element > viewport width outside a clipping container  
FAIL: any unconstrained element wider than viewport

---

## RL-04 · No Unintentional Content Overlap

**Severity:** HIGH  
**Verify:** VISUAL + AUTO (heuristic)

No two sibling content blocks (cards, sections, nav items, form fields, headings + body copy) should have intersecting bounding rects unless one is an intentional overlay (modal, tooltip, badge, sticky nav).

**Playwright check (heuristic — flag candidates for visual review):**
```js
const rects = await page.evaluate(() => {
  const OVERLAY_ROLES = new Set(['dialog','tooltip','menu','listbox','option']);
  return Array.from(document.querySelectorAll('section, article, [class*="card"], [class*="block"], h1, h2, p'))
    .filter(el => !OVERLAY_ROLES.has(el.getAttribute('role')))
    .map(el => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    })
    .filter(r => r.bottom > 0 && r.top < window.innerHeight);
});
// Check that no two rects from different parents fully overlap
// Flag if intersection area > 20% of the smaller rect
const overlaps = [];
for (let i = 0; i < rects.length; i++) {
  for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const ia = ix * iy;
    const smallerArea = Math.min((a.right-a.left)*(a.bottom-a.top), (b.right-b.left)*(b.bottom-b.top));
    if (smallerArea > 0 && ia / smallerArea > 0.2) overlaps.push({ a, b, ratio: (ia/smallerArea).toFixed(2) });
  }
}
// All flagged pairs must be manually confirmed as intentional
```

PASS: zero overlap pairs, or all flagged pairs confirmed as intentional overlays  
FAIL: unintentional content block intersection > 20% area

---

## RL-05 · Text Not Clipped by Fixed-Height Containers

**Severity:** HIGH  
**Verify:** AUTO

Containers with explicit `height` or `max-height` in px/rem and `overflow: hidden` must not have `scrollHeight > clientHeight` by more than 2 px (which would mean text is silently cut off).

**Playwright check:**
```js
const clipped = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('*'))
    .filter(el => {
      const s = getComputedStyle(el);
      const hasFixedHeight = s.height !== 'auto' && s.maxHeight !== 'none' && s.overflow === 'hidden';
      if (!hasFixedHeight) return false;
      return el.scrollHeight > el.clientHeight + 2;
    })
    .map(el => ({
      tag: el.tagName,
      cls: el.className.toString().slice(0, 60),
      scrollH: el.scrollHeight,
      clientH: el.clientHeight
    }));
});
expect(clipped).toHaveLength(0);
```

PASS: no fixed-height overflow-hidden container clips its content  
FAIL: scrollHeight exceeds clientHeight + 2 in any such container

---

## RL-06 · Navigation Usable at All Breakpoints

**Severity:** CRITICAL  
**Verify:** AUTO + VISUAL

At 375 px: a hamburger / mobile menu button must be present and clickable, revealing all nav links. At 768 px+: nav links or a nav component must be visible without interaction. No nav items must be hidden without a disclosure mechanism.

**Playwright check:**
```js
// Mobile — hamburger must exist and be interactive
await page.setViewportSize({ width: 375, height: 812 });
const menuBtn = page.locator('[aria-label*="menu" i], [aria-label*="nav" i], button[class*="hamburger" i], button[class*="burger" i]').first();
await expect(menuBtn).toBeVisible();
await menuBtn.click();
const navLinks = page.locator('nav a, [role="navigation"] a');
await expect(navLinks.first()).toBeVisible();

// Desktop — nav links directly visible, no click required
await page.setViewportSize({ width: 1440, height: 900 });
const desktopNav = page.locator('nav a, header a').first();
await expect(desktopNav).toBeVisible();
```

PASS: mobile menu button visible + opens nav; desktop nav directly visible  
FAIL: no menu button at 375 px, nav links hidden with no trigger, or desktop nav absent

---

## RL-07 · Mobile Menu Opens and Closes Correctly

**Severity:** HIGH  
**Verify:** AUTO

After opening the mobile menu, all primary navigation links must be visible. After closing (button re-click or pressing Escape), the menu must be hidden and body scroll must be restored.

**Playwright check:**
```js
await page.setViewportSize({ width: 375, height: 812 });
const menuBtn = page.locator('[aria-label*="menu" i], button[class*="hamburger" i]').first();
await menuBtn.click();
const navLinks = page.locator('nav a, [role="navigation"] a');
const count = await navLinks.count();
expect(count, 'nav links after open').toBeGreaterThan(0);

await menuBtn.click(); // close
const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
expect(bodyOverflow, 'body scroll restored').not.toBe('hidden');
```

PASS: menu opens with links, closes cleanly  
FAIL: menu fails to open, links not visible, or body scroll locked after close

---

## RL-08 · Images Scale Within Viewport, No Overflow

**Severity:** HIGH  
**Verify:** AUTO

All `<img>` and `<picture>` elements must have rendered width ≤ their parent container width (tolerance 1 px). `max-width: 100%` must be in effect.

**Playwright check:**
```js
const overflowImages = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('img, picture'))
    .filter(img => {
      const r = img.getBoundingClientRect();
      const p = img.parentElement?.getBoundingClientRect();
      if (!p) return false;
      return r.width > p.width + 1;
    })
    .map(img => ({ src: img.src?.slice(-40), w: img.getBoundingClientRect().width, pw: img.parentElement?.getBoundingClientRect().width }));
});
expect(overflowImages).toHaveLength(0);
```

PASS: all images constrained within parent  
FAIL: any image wider than its parent + 1 px

---

## RL-09 · Tap Targets ≥ 44 × 44 px on Mobile

**Severity:** HIGH  
**Verify:** AUTO

All interactive elements (buttons, links, inputs, selects, [role="button"]) must have a bounding box with both width and height ≥ 44 px at 375 px viewport. Tolerance: 40 px minimum (below 40 is a hard fail; 40–43 is flagged for review).

**Playwright check:**
```js
await page.setViewportSize({ width: 375, height: 812 });
const smallTargets = await page.evaluate(() => {
  const HARD_MIN = 40;
  const WARN_MIN = 44;
  const sel = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="menuitem"]';
  return Array.from(document.querySelectorAll(sel))
    .filter(el => el.offsetParent !== null)
    .map(el => { const r = el.getBoundingClientRect(); return { tag: el.tagName, text: el.textContent?.trim().slice(0,30), w: r.width, h: r.height }; })
    .filter(({ w, h }) => w < WARN_MIN || h < WARN_MIN)
    .map(t => ({ ...t, severity: (t.w < HARD_MIN || t.h < HARD_MIN) ? 'FAIL' : 'WARN' }));
});
const hardFails = smallTargets.filter(t => t.severity === 'FAIL');
expect(hardFails, 'tap targets below 40px').toHaveLength(0);
// Log warns for review: smallTargets.filter(t => t.severity === 'WARN')
```

PASS: all interactive elements ≥ 44×44 px (warns logged for 40–43 px)  
FAIL: any interactive element < 40×40 px

---

## RL-10 · No Unreadably Small Text on Mobile

**Severity:** HIGH  
**Verify:** AUTO

At 375 px viewport, no visible text node must have a computed font-size below 11 px. Body / paragraph text should be ≥ 14 px. Labels / captions ≥ 11 px.

**Playwright check:**
```js
await page.setViewportSize({ width: 375, height: 812 });
const tinyText = await page.evaluate(() => {
  const HARD_MIN = 11;
  const results = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const el = node.parentElement;
    if (!el || el.offsetParent === null) continue;
    const text = node.textContent?.trim();
    if (!text || text.length < 2) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < HARD_MIN) results.push({ text: text.slice(0, 40), fontSize: fs, tag: el.tagName });
  }
  return results;
});
expect(tinyText, 'text below 11px font-size').toHaveLength(0);
```

PASS: all visible text ≥ 11 px computed font-size  
FAIL: any text < 11 px

---

## RL-11 · Sections Stack Correctly (No Grid/Flex Overflow)

**Severity:** HIGH  
**Verify:** VISUAL + AUTO (structural)

At 375 px and 768 px, multi-column grid or flex layouts must collapse to single column OR a column count appropriate for the breakpoint. Side-by-side columns must not be present at mobile if combined width would exceed viewport.

**Playwright check (structural heuristic):**
```js
await page.setViewportSize({ width: 375, height: 812 });
const multiColOverflows = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[class*="grid"], [class*="flex"], [class*="columns"]'))
    .filter(el => {
      const s = getComputedStyle(el);
      const children = Array.from(el.children).filter(c => c.offsetParent !== null);
      if (children.length < 2) return false;
      const rects = children.map(c => c.getBoundingClientRect());
      // Check if any two children are side-by-side (same vertical band) and combined width > vw
      for (let i = 0; i < rects.length; i++) {
        for (let j = i+1; j < rects.length; j++) {
          const vertOverlap = Math.min(rects[i].bottom, rects[j].bottom) - Math.max(rects[i].top, rects[j].top);
          if (vertOverlap > 10) {
            const combined = rects[i].width + rects[j].width;
            if (combined > window.innerWidth + 4) return true;
          }
        }
      }
      return false;
    })
    .map(el => el.className.toString().slice(0, 60));
});
expect(multiColOverflows).toHaveLength(0);
```

PASS: no multi-column overflow at mobile  
FAIL: side-by-side columns whose combined width exceeds viewport

---

## RL-12 · Sticky / Fixed Elements Do Not Obscure Content

**Severity:** HIGH  
**Verify:** AUTO + VISUAL

Sticky headers, fixed CTAs, cookie banners, and bottom bars must not permanently cover meaningful body content. The content area must have sufficient offset (padding/margin) so that no important element is hidden beneath a fixed overlay.

**Playwright check:**
```js
const fixedEls = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('*'))
    .filter(el => {
      const s = getComputedStyle(el);
      return (s.position === 'fixed' || s.position === 'sticky') && el.offsetParent !== null;
    })
    .map(el => { const r = el.getBoundingClientRect(); return { tag: el.tagName, cls: el.className.toString().slice(0,40), top: r.top, bottom: r.bottom, height: r.height }; });
});
// Each fixed/sticky element at top: first non-fixed section top must be >= its bottom
const firstSection = await page.locator('main, [class*="hero"], section').first().boundingBox();
for (const fixed of fixedEls.filter(f => f.top < 100 && f.height > 0)) {
  expect(firstSection?.y ?? 0, `content hidden under fixed el ${fixed.cls}`).toBeGreaterThanOrEqual(fixed.bottom - 4);
}
```

PASS: all content starts below (or accounts for) fixed/sticky overlays  
FAIL: meaningful content rect overlaps a fixed element's rect

---

## RL-13 · No Empty / Unexplained Large Gaps

**Severity:** MEDIUM  
**Verify:** VISUAL + AUTO (heuristic)

No vertical gap between two consecutive visible sections should exceed 240 px (at 1440 px viewport) or 160 px (at 375 px viewport) unless it is a deliberate full-screen spacer section with visible content (e.g., a parallax panel).

**Playwright check (heuristic):**
```js
const GAP_LIMIT = viewport.width >= 1024 ? 240 : 160;
const sections = await page.locator('section, [class*="section"], [class*="block"]').all();
const boxes = await Promise.all(sections.map(s => s.boundingBox()));
const visible = boxes.filter(b => b && b.height > 0);
for (let i = 1; i < visible.length; i++) {
  const gap = visible[i].y - (visible[i-1].y + visible[i-1].height);
  expect(gap, `gap between sections ${i-1} and ${i}`).toBeLessThanOrEqual(GAP_LIMIT);
}
```

PASS: all inter-section gaps within threshold or confirmed as intentional full-screen spacers  
FAIL: gap > 240 px at desktop or > 160 px at mobile without intentional content

---

## RL-14 · Layout Holds at 320 px Minimum Width

**Severity:** HIGH  
**Verify:** AUTO

At 320×568 px (iPhone SE 1st gen — minimum baseline), no horizontal overflow, no clipped text, no overlapping elements. Same RL-01 and RL-02 checks applied at 320 px.

**Playwright check:**
```js
await page.setViewportSize({ width: 320, height: 568 });
await page.waitForLoadState('networkidle');
const overflow = await page.evaluate(() =>
  document.body.scrollWidth - document.documentElement.clientWidth
);
expect(overflow, 'horizontal overflow at 320px').toBeLessThanOrEqual(1);
```

PASS: scrollWidth − clientWidth ≤ 1 at 320 px  
FAIL: any horizontal overflow at 320 px

---

## RL-15 · Correct Viewport Meta Tag

**Severity:** CRITICAL  
**Verify:** AUTO

The page must have `<meta name="viewport" content="width=device-width, initial-scale=1">`. `user-scalable=no` or `maximum-scale=1` must NOT be present (WCAG 1.4.4 violation — blocks zoom for low-vision users).

**Playwright check:**
```js
const meta = await page.evaluate(() => {
  const el = document.querySelector('meta[name="viewport"]');
  return el ? el.getAttribute('content') : null;
});
expect(meta, 'viewport meta must exist').toBeTruthy();
expect(meta, 'viewport meta must include width=device-width').toContain('width=device-width');
expect(meta, 'viewport meta must include initial-scale=1').toMatch(/initial-scale=1(\.0)?/);
expect(meta, 'must not lock zoom').not.toMatch(/user-scalable\s*=\s*no/i);
expect(meta, 'must not cap scale at 1').not.toMatch(/maximum-scale\s*=\s*1(\.0)?(?!\d)/);
```

PASS: viewport meta is `width=device-width, initial-scale=1` with no zoom lock  
FAIL: meta absent, missing width=device-width, or zoom locked

---

## RL-16 · Page Not Visually Zoomed or Scaled Abnormally

**Severity:** HIGH  
**Verify:** AUTO

`window.devicePixelRatio` must match the expected system DPR. The effective CSS pixel width must equal the viewport width (i.e., no layout-level zoom applied via CSS `zoom` or `transform: scale` on the root).

**Playwright check:**
```js
const rootZoom = await page.evaluate(() => {
  const bodyZoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
  const htmlZoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const bodyTransform = getComputedStyle(document.body).transform;
  const scaleMatch = bodyTransform?.match(/matrix\(([^,]+)/);
  const bodyScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
  return { bodyZoom, htmlZoom, bodyScale };
});
expect(rootZoom.bodyZoom, 'body zoom must be 1').toBeCloseTo(1, 1);
expect(rootZoom.htmlZoom, 'html zoom must be 1').toBeCloseTo(1, 1);
expect(rootZoom.bodyScale, 'body transform scale must be 1').toBeCloseTo(1, 1);
```

PASS: no CSS zoom or scale on html/body  
FAIL: root zoom or scale not equal to 1

---

## RL-17 · Font Rendering — Text Visible Across All Breakpoints

**Severity:** MEDIUM  
**Verify:** VISUAL

At every breakpoint, heading and body text must be legible. Color contrast between text and background must meet WCAG AA (4.5:1 for body text, 3:1 for large text ≥ 18 px). This check flags text that would become invisible due to same-color-as-background or zero opacity after responsive CSS changes.

**Playwright check (contrast approximation):**
```js
const hiddenText = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('h1,h2,h3,h4,p,span,a,li'))
    .filter(el => el.offsetParent !== null && (el.textContent?.trim().length ?? 0) > 0)
    .filter(el => {
      const s = getComputedStyle(el);
      return parseFloat(s.opacity) < 0.15 || s.color === s.backgroundColor || s.visibility === 'hidden';
    })
    .map(el => ({ tag: el.tagName, text: el.textContent?.trim().slice(0,30), opacity: getComputedStyle(el).opacity }));
});
expect(hiddenText).toHaveLength(0);
```

PASS: no text elements invisible due to opacity < 0.15 or same color as background  
FAIL: any text element effectively invisible after responsive CSS

---

## RL-18 · Interactive Elements Reachable by Keyboard at All Sizes

**Severity:** HIGH  
**Verify:** AUTO

At 375 px and 1440 px, Tab key must cycle through all interactive elements in DOM order with no skipped focusable elements (no `tabindex="-1"` placed on elements that are the only access point). All focusable elements must have a visible focus ring.

**Playwright check:**
```js
// Verify focus ring visible on first focusable element
await page.keyboard.press('Tab');
const focusedOutline = await page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  return getComputedStyle(el).outlineStyle;
});
expect(focusedOutline, 'focused element must have outline').not.toBe('none');
```

PASS: focused element has non-none outline style  
FAIL: focus ring absent or all-none on first tab stop

---

## RL-19 · Form Fields Usable and Not Clipped on Mobile

**Severity:** HIGH  
**Verify:** AUTO + VISUAL

At 375 px, all `<input>`, `<textarea>`, `<select>` fields must have width ≥ 200 px and height ≥ 40 px. Labels must be visible and not overlapping the input.

**Playwright check:**
```js
await page.setViewportSize({ width: 375, height: 812 });
const badFields = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select'))
    .filter(el => el.offsetParent !== null)
    .map(el => { const r = el.getBoundingClientRect(); return { tag: el.tagName, type: el.type, w: r.width, h: r.height }; })
    .filter(({ w, h }) => w < 200 || h < 40);
});
expect(badFields).toHaveLength(0);
```

PASS: all visible form fields ≥ 200×40 px at 375 px  
FAIL: any input/textarea/select below minimum size

---

## RL-20 · Hero / Banner Section Scales Correctly — No Cropped Art

**Severity:** MEDIUM  
**Verify:** VISUAL

At 375 px, the hero section must show the full intended focal content (headline visible, CTA button visible, background image not cropped in a way that removes the subject). This is a visual check; confirm with screenshot diff against design spec.

**Playwright check (structural):**
```js
await page.setViewportSize({ width: 375, height: 812 });
const hero = page.locator('[class*="hero"], [class*="banner"], section').first();
const heroBox = await hero.boundingBox();
expect(heroBox?.height ?? 0, 'hero must have meaningful height at mobile').toBeGreaterThan(200);
const heroCTA = hero.locator('a, button').first();
await expect(heroCTA).toBeVisible();
```

PASS: hero section has height > 200 px and CTA is visible at 375 px  
FAIL: hero collapsed to 0 or CTA hidden at mobile

---

## RL-21 · No Z-Index Wars — Dropdowns / Tooltips Above Content

**Severity:** MEDIUM  
**Verify:** VISUAL + AUTO

Open dropdown menus, tooltips, and autocomplete panels must appear above all sibling content. Computed z-index of popup elements must be > z-index of any content element in the same stacking context.

**Playwright check:**
```js
// Trigger first dropdown if present
const dropdown = page.locator('[class*="dropdown"] button, [data-dropdown], select + ul').first();
if (await dropdown.count() > 0) {
  await dropdown.click();
  const panel = page.locator('[class*="dropdown-menu"], [class*="popover"], [role="listbox"], [role="menu"]').first();
  const panelZ = await panel.evaluate(el => parseInt(getComputedStyle(el).zIndex) || 0);
  const heroZ = await page.locator('[class*="hero"], section').first().evaluate(el => parseInt(getComputedStyle(el).zIndex) || 0);
  expect(panelZ, 'dropdown z-index above content').toBeGreaterThan(heroZ);
}
```

PASS: popup z-index above sibling content, visually confirmed overlay  
FAIL: dropdown panel renders behind page content

---

## RL-22 · Animations / Transitions Do Not Break Layout Mid-Play

**Severity:** MEDIUM  
**Verify:** VISUAL

CSS transitions and JS animations must not cause layout thrash (elements temporarily overflowing viewport or overlapping during transition). Checked by scrolling through the page and observing no layout shift artifacts. CLS (Cumulative Layout Shift) ≤ 0.1.

**Playwright check (CLS via PerformanceObserver):**
```js
const cls = await page.evaluate(() => new Promise(resolve => {
  let score = 0;
  const ob = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) score += entry.value;
    }
  });
  ob.observe({ type: 'layout-shift', buffered: true });
  setTimeout(() => { ob.disconnect(); resolve(score); }, 3000);
}));
expect(cls, 'CLS must be <= 0.1').toBeLessThanOrEqual(0.1);
```

PASS: CLS ≤ 0.1 over 3-second page load window  
FAIL: CLS > 0.1

---

## RL-23 · Print Media Query Does Not Destroy Screen Layout

**Severity:** LOW  
**Verify:** VISUAL

Viewing the page with `@media print` active must not cause any element to disappear that the user would need in a screen context. Screen layout must be unaffected by print styles loading. (Print output quality is out of scope here; only verify print styles do not bleed into screen rendering.)

**Playwright check:**
```js
// Verify page renders normally at 1440px with print emulation OFF
await page.emulateMedia({ media: 'screen' });
const screenEls = await page.locator('nav, header, footer, main').count();
await page.emulateMedia({ media: 'print' });
const printEls = await page.locator('nav, header, footer, main').count();
await page.emulateMedia({ media: 'screen' }); // restore
// Note: print may legitimately hide nav — flag for review, not hard fail
expect(printEls, 'main structural elements survive print media').toBeGreaterThanOrEqual(1);
```

PASS: main content element survives in print media; no screen regressions  
FAIL: print styles remove `main` or break screen layout on restore

---

## RL-24 · 1920 px Ultra-Wide — No Stretched / Orphaned Content

**Severity:** MEDIUM  
**Verify:** VISUAL + AUTO

At 1920 px, content must be constrained within a max-width container. Full-bleed background is acceptable; text/card content lines must not exceed ~90 ch readable width. No single centered heading marooned with vast empty space on both sides beyond 120 px each side.

**Playwright check:**
```js
await page.setViewportSize({ width: 1920, height: 1080 });
const contentWidth = await page.evaluate(() => {
  const main = document.querySelector('main, [class*="container"], [class*="wrapper"]');
  return main ? main.getBoundingClientRect().width : document.body.getBoundingClientRect().width;
});
expect(contentWidth, 'content container must be <= 1440px at 1920px viewport').toBeLessThanOrEqual(1440);
```

PASS: primary content container ≤ 1440 px wide at 1920 px viewport  
FAIL: content stretches beyond 1440 px at ultra-wide, causing unreadable line lengths

---

---

## Machine-readable items

```json
[
  {
    "id": "RL-01",
    "category": "layout",
    "severity": "critical",
    "verify": "auto",
    "title": "No horizontal page scroll",
    "check": "set viewport to each breakpoint; assert document.body.scrollWidth - document.documentElement.clientWidth <= 1"
  },
  {
    "id": "RL-02",
    "category": "layout",
    "severity": "critical",
    "verify": "auto",
    "title": "No element overflowing viewport edge",
    "check": "for each visible element, assert getBoundingClientRect().right <= viewportWidth + 2 and left >= -2, excluding [data-marquee] and overflow-hidden-ancestor elements"
  },
  {
    "id": "RL-03",
    "category": "layout",
    "severity": "high",
    "verify": "auto",
    "title": "No element wider than viewport without clipping parent",
    "check": "for each element, assert getBoundingClientRect().width <= viewportWidth + 2, unless ancestor has overflow hidden/clip"
  },
  {
    "id": "RL-04",
    "category": "layout",
    "severity": "high",
    "verify": "visual",
    "title": "No unintentional content overlap",
    "check": "compute intersection area of sibling content blocks; flag pairs where intersection > 20% of smaller block area; confirm intentional overlays (modal, tooltip, badge)"
  },
  {
    "id": "RL-05",
    "category": "layout",
    "severity": "high",
    "verify": "auto",
    "title": "Text not clipped by fixed-height containers",
    "check": "for each element with explicit height and overflow hidden, assert scrollHeight <= clientHeight + 2"
  },
  {
    "id": "RL-06",
    "category": "layout",
    "severity": "critical",
    "verify": "auto",
    "title": "Navigation usable at all breakpoints",
    "check": "at 375px: hamburger button visible and clickable, opens nav links; at 1440px: nav links directly visible without interaction"
  },
  {
    "id": "RL-07",
    "category": "layout",
    "severity": "high",
    "verify": "auto",
    "title": "Mobile menu opens and closes correctly",
    "check": "click menu button: nav links visible; click again: menu hidden, body overflow not 'hidden'"
  },
  {
    "id": "RL-08",
    "category": "layout",
    "severity": "high",
    "verify": "auto",
    "title": "Images scale within viewport, no overflow",
    "check": "for each img/picture, assert getBoundingClientRect().width <= parentElement.getBoundingClientRect().width + 1"
  },
  {
    "id": "RL-09",
    "category": "layout",
    "severity": "high",
    "verify": "auto",
    "title": "Tap targets >= 44x44px on mobile",
    "check": "at 375px: for each a, button, input, select, [role=button], assert getBoundingClientRect().width >= 44 and height >= 44; hard fail at < 40px"
  },
  {
    "id": "RL-10",
    "category": "layout",
    "severity": "high",
    "verify": "auto",
    "title": "No unreadably small text on mobile",
    "check": "at 375px: for each visible text node, assert parseFloat(getComputedStyle(parentElement).fontSize) >= 11"
  },
  {
    "id": "RL-11",
    "category": "layout",
    "severity": "high",
    "verify": "visual",
    "title": "Sections stack correctly on mobile",
    "check": "at 375px and 768px: no two sibling flex/grid children in same row whose combined width exceeds viewportWidth + 4"
  },
  {
    "id": "RL-12",
    "category": "layout",
    "severity": "high",
    "verify": "auto",
    "title": "Sticky/fixed elements do not obscure content",
    "check": "first non-fixed section top edge must be >= bottom edge of any fixed/sticky header element, tolerance 4px"
  },
  {
    "id": "RL-13",
    "category": "layout",
    "severity": "medium",
    "verify": "visual",
    "title": "No empty large gaps between sections",
    "check": "consecutive visible sections: gap <= 240px at desktop, <= 160px at mobile, unless confirmed intentional full-screen spacer"
  },
  {
    "id": "RL-14",
    "category": "layout",
    "severity": "high",
    "verify": "auto",
    "title": "Layout holds at 320px minimum width",
    "check": "set viewport 320x568; assert document.body.scrollWidth - document.documentElement.clientWidth <= 1"
  },
  {
    "id": "RL-15",
    "category": "layout",
    "severity": "critical",
    "verify": "auto",
    "title": "Correct viewport meta tag present, no zoom lock",
    "check": "meta[name=viewport] content must contain 'width=device-width' and 'initial-scale=1'; must NOT contain 'user-scalable=no' or 'maximum-scale=1'"
  },
  {
    "id": "RL-16",
    "category": "layout",
    "severity": "high",
    "verify": "auto",
    "title": "Page not visually zoomed or scaled abnormally",
    "check": "getComputedStyle(document.body).zoom == 1, getComputedStyle(document.documentElement).zoom == 1, body transform matrix scale == 1 (tolerance 0.05)"
  },
  {
    "id": "RL-17",
    "category": "layout",
    "severity": "medium",
    "verify": "visual",
    "title": "Text visible and not invisible after responsive CSS",
    "check": "at each breakpoint: for each text element, opacity >= 0.15, color !== backgroundColor, visibility !== hidden"
  },
  {
    "id": "RL-18",
    "category": "layout",
    "severity": "high",
    "verify": "auto",
    "title": "Interactive elements reachable by keyboard",
    "check": "Tab through page; assert document.activeElement has getComputedStyle().outlineStyle !== 'none' at first focus stop"
  },
  {
    "id": "RL-19",
    "category": "layout",
    "severity": "high",
    "verify": "auto",
    "title": "Form fields usable and not clipped on mobile",
    "check": "at 375px: for each input (not hidden/checkbox/radio), textarea, select: assert getBoundingClientRect().width >= 200 and height >= 40"
  },
  {
    "id": "RL-20",
    "category": "layout",
    "severity": "medium",
    "verify": "visual",
    "title": "Hero/banner section scales correctly on mobile",
    "check": "at 375px: first section/hero has height >= 200px and contains at least one visible a or button element"
  },
  {
    "id": "RL-21",
    "category": "layout",
    "severity": "medium",
    "verify": "visual",
    "title": "Dropdowns and tooltips appear above content",
    "check": "open first dropdown/popover; assert popup element z-index > z-index of main content sibling in same stacking context"
  },
  {
    "id": "RL-22",
    "category": "layout",
    "severity": "medium",
    "verify": "auto",
    "title": "Animations do not cause layout shift (CLS <= 0.1)",
    "check": "PerformanceObserver layout-shift entries summed over 3s after load; assert total CLS <= 0.1"
  },
  {
    "id": "RL-23",
    "category": "layout",
    "severity": "low",
    "verify": "visual",
    "title": "Print media query does not destroy screen layout",
    "check": "emulateMedia print then screen; assert main structural elements (main, nav, header) still present; no screen regressions after restore"
  },
  {
    "id": "RL-24",
    "category": "layout",
    "severity": "medium",
    "verify": "visual",
    "title": "1920px ultra-wide: content constrained, not stretched",
    "check": "at 1920px: primary content container (main, .container, .wrapper) getBoundingClientRect().width <= 1440"
  }
]
```
