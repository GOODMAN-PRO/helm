# Design Quality & Bespoke Craft Checklist
> Anti-AI, premium, hand-crafted bar. Binary PASS/FAIL. Run before shipping any site.
> AUTO = scriptable check. VISUAL = agent/judge judgment call.
> Severity: CRITICAL (blocks ship) | HIGH (blocks review) | MEDIUM (polish pass)

---

## 1. VISUAL IDENTITY — Distinctive & Owned

### 1.1 Not the default AI palette
**Severity:** CRITICAL | **Type:** VISUAL
PASS if the site does NOT use the combination of navy/indigo→purple gradient + soft white glow as the primary brand expression. One is allowed in isolation; the full combination is the AI cliché. Judge: "Does this feel like a template built for any product, or for THIS specific product?"

### 1.2 No Inter/Arial/system-ui as the display face
**Severity:** CRITICAL | **Type:** AUTO
```
Check: computed font-family of the first <h1> (or largest heading on the page)
must NOT resolve to Inter, Arial, Helvetica, system-ui, -apple-system, Roboto, or Geist alone.
Command: document.querySelector('h1') → getComputedStyle → fontFamily → assert not in ban list.
```
PASS if the display/heading typeface is a named font with clear personality distinct from the ban list.

### 1.3 Exactly one accent color, used consistently
**Severity:** HIGH | **Type:** AUTO
```
Check: count unique hue values (±15° tolerance) used in CSS custom properties for interactive
and highlight elements. Count of distinct accent hues must equal 1.
Also: the accent CSS variable (e.g. --accent, --color-accent) must appear in at least 4 distinct
CSS rule locations (buttons, links, focus rings, active states).
```
PASS if exactly one hue rules all interactive emphasis and it appears in ≥ 4 rules.

### 1.4 An identity has been CHOSEN from a known system (not defaulted)
**Severity:** HIGH | **Type:** VISUAL
PASS if the color palette, typeface pairing, and texture reflect a deliberate identity decision — e.g. "editorial warm," "technical dark," "brutalist yellow/black" — and every token traces back to that decision. FAIL if you could swap the brand name for a competitor and nothing would change.

---

## 2. TYPOGRAPHY — Personality & Hierarchy

### 2.1 Display typeface has visual personality
**Severity:** CRITICAL | **Type:** VISUAL + AUTO
AUTO part: `document.querySelector('h1') fontFamily` must not be in the ban list (see 1.2).
VISUAL part: PASS if the heading face has a distinctive character — optical size variation, a serif terminal, unusual weight contrast, or variable axis personality. FAIL if it is a perfectly neutral grotesque used at the default weight.

### 2.2 Strong typographic hierarchy — 4× scale contrast minimum
**Severity:** HIGH | **Type:** VISUAL
Pick any section on the page. PASS if the ratio of the largest text element to the smallest text element in that section is at least 4:1 in font-size (e.g. 72px headline + 16px body = 4.5×). FAIL if every text block is within 2× of each other.

### 2.3 Tight negative tracking on display sizes
**Severity:** MEDIUM | **Type:** AUTO
```
Check: all elements with font-size >= 40px must have letter-spacing <= -0.01em.
Elements at >= 64px must have letter-spacing <= -0.025em.
```
PASS if large display text is tracked in; FAIL if it uses default (0) or positive letter-spacing at display scale.

### 2.4 Body text is readable — contrast 4.5:1 minimum
**Severity:** CRITICAL | **Type:** AUTO
```
Check: compute contrast ratio of primary body text color vs. its immediate background.
Must be >= 4.5:1 (WCAG AA). Tool: axe-core, Lighthouse, or manual OKLCH/lab computation.
```

### 2.5 No decorative text below 11px
**Severity:** MEDIUM | **Type:** AUTO
```
Check: all visible text nodes must have computed font-size >= 11px.
Exception: disabled/placeholder states only.
```

---

## 3. LAYOUT — Asymmetric & Art-Directed

### 3.1 Hero is NOT the centered-headline-on-gradient cliché
**Severity:** CRITICAL | **Type:** VISUAL
PASS if the hero layout is NOT: centered headline + centered subline + centered CTA button pair, all on a gradient background with a soft glow blob behind the text. This is the single most common AI site pattern. PASS if the layout is offset, editorial, full-bleed image, or typographically dominant.

### 3.2 No even 3-column emoji/icon feature grid
**Severity:** CRITICAL | **Type:** VISUAL
PASS if the features section does NOT use: 3 equal-width columns, each with a centered emoji or icon at top, a short title, and 1–2 lines of copy. FAIL if ANY section uses this exact pattern. Acceptable alternatives: asymmetric bento, sticky-scroll split, alternating rows, big numbered list.

### 3.3 No two adjacent sections share the same layout shape
**Severity:** HIGH | **Type:** VISUAL
Inspect every consecutive pair of sections. PASS if no two neighbors share the same structural pattern (both centered, both 2-col split, both equal-grid, both full-bleed dark). Each adjacent pair must differ in column count, alignment, or density.

### 3.4 Art-directed asymmetry is present
**Severity:** HIGH | **Type:** VISUAL
PASS if at least one section uses an off-axis layout: 5/7, 7/5, 60/40, or 70/30 grid split; or a column that bleeds past the container edge; or an element overlapping a section boundary. FAIL if every section is either 100% centered or 50/50 split.

### 3.5 At least one full-bleed element
**Severity:** HIGH | **Type:** VISUAL + AUTO
VISUAL: PASS if at least one element stretches to the viewport edge (100vw), breaking the container. AUTO hint: `document.querySelectorAll('section, [class*=bleed], [class*=full]')` — find an element with `width: 100vw` or `margin: 0 calc(-1 * var(--gutter))`.

### 3.6 Background weight alternates across sections
**Severity:** MEDIUM | **Type:** VISUAL
Scroll through all sections. PASS if no three consecutive sections share the same background luminance band (all-light or all-dark). At minimum: light→dark→light or dark→light→dark rhythm must be present.

### 3.7 Sections have varied vertical rhythm (not all the same padding)
**Severity:** MEDIUM | **Type:** AUTO
```
Check: measure padding-top of each <section> element (or equivalent block-level section wrappers).
At least 3 distinct values must appear across sections on the page (e.g. 64px, 96px, 160px).
FAIL if all sections use identical padding (e.g. py-24 = 96px everywhere).
```

---

## 4. BUTTONS & INTERACTIVE STATES — Custom, Not Default

### 4.1 Every button has a custom :hover style
**Severity:** CRITICAL | **Type:** AUTO
```
Check: for every <button> and every <a> with a class containing "btn" or "button":
- Inspect the element's CSS rules for a :hover selector.
- The :hover rule must include at least one of: background-color change, transform, box-shadow change,
  color change, or opacity change — that is NOT the browser default (i.e., not just cursor:pointer).
- Count of buttons/CTAs with a qualifying :hover rule divided by total buttons >= 1.0 (100%).
FAIL if any button/CTA has no :hover rule or only cursor:pointer.
```

### 4.2 Every button has a :focus-visible style
**Severity:** CRITICAL | **Type:** AUTO
```
Check: for every <button> and <a class~=btn>:
- A :focus-visible CSS rule must exist that sets outline, outline-offset, or box-shadow ring.
- The outline must NOT be "none" or "0" without a replacement.
- The ring must be visually distinct from the button's rest state.
FAIL if any interactive element has outline:none without a custom focus-visible ring.
```

### 4.3 Primary CTA has a press/active state
**Severity:** HIGH | **Type:** AUTO
```
Check: the primary CTA button (first <button> with type="submit" or [data-cta], or largest/most
prominent button) must have either:
- A :active CSS rule with transform: scale(<1) or translateY(+n), OR
- A Framer Motion whileTap or GSAP onPress handler visible in source.
FAIL if no active/press state is defined.
```

### 4.4 Nav links have custom hover treatment
**Severity:** HIGH | **Type:** AUTO
```
Check: <nav> anchor elements must have a :hover rule that goes beyond color change.
Acceptable: underline draw (background-size transition), translateX shift, opacity change on
a pseudo-element indicator, or clip-path reveal. Browser underline default = FAIL.
```

### 4.5 Button design is custom — not browser/shadcn default
**Severity:** HIGH | **Type:** VISUAL
PASS if the primary CTA button has a border-radius, padding, weight, and color scheme that clearly reflects the site's identity tokens. FAIL if it looks like an unstyled `<button>`, a shadcn default (gray with border), or a generic Tailwind `bg-blue-500 rounded` with no further craft.

---

## 5. TEXTURE & MICRO-DETAIL

### 5.1 Grain overlay is present
**Severity:** HIGH | **Type:** AUTO
```
Check: body::after or a fixed overlay element must have:
- background-image containing an SVG feTurbulence filter or a noise texture URL, AND
- opacity between 0.03 and 0.12, AND
- pointer-events: none, AND
- position: fixed and z-index > 100.
FAIL if no grain overlay element is found, or opacity is 0 or > 0.15 (too heavy).
```

### 5.2 At least 5 craft micro-details are present
**Severity:** HIGH | **Type:** VISUAL
Check for at least 5 of these on the page:
- [ ] Monospace eyebrow labels (11px, tracked-out, uppercase) above section headlines
- [ ] Section counters (01 / 02 / 03) in mono type
- [ ] Custom animated underline on text links (draw-on, bidirectional, or clip-path)
- [ ] 1px inset top-highlight border on elevated cards/panels (inset 0 1px 0 rgba(255,255,255,0.10))
- [ ] Em-dash or square bullet as a custom list marker
- [ ] Custom divider element (gradient fade, dotted mono, or decorative rule)
- [ ] Hover-reveal detail on cards (glow border, subtle lift, background shift)
- [ ] Consistent caption/label size (11–12px) with tracked-out letter-spacing

PASS if ≥ 5 are present and feel deliberate, not decorative noise.

### 5.3 Radius is consistent — a single token, not ad-hoc
**Severity:** MEDIUM | **Type:** AUTO
```
Check: collect all border-radius values used on interactive elements (buttons, cards, inputs, badges).
They must derive from a small set (≤ 4 distinct values, e.g. 4px, 8px, 12px, 9999px).
FAIL if more than 5 distinct border-radius values appear, suggesting no token system.
```

### 5.4 No default box-shadow on every card (uniform 0 4px 24px rgba(0,0,0,0.08))
**Severity:** MEDIUM | **Type:** AUTO
```
Check: collect box-shadow values from all card-like elements ([class*=card], [class*=tile], li > div).
FAIL if > 60% share the exact value "0 4px 24px rgba(0,0,0,0.08)" or "0 4px 6px -1px rgba(0,0,0,0.1)"
(Tailwind shadow-md default). Expected: either no shadow (flat), a directional shadow, or an inset
highlight + directional shadow combination.
```

### 5.5 No pure #000000 or #ffffff backgrounds
**Severity:** MEDIUM | **Type:** AUTO
```
Check: computed background-color of <html> and <body> and the first full-bleed section
must not equal rgb(0,0,0) exactly or rgb(255,255,255) exactly.
Off-black (e.g. #0a0a0a, #0e0e0e) and off-white (e.g. #f5f5f0, #f9f9fc) pass.
```

---

## 6. HERO & COMPOSITION

### 6.1 No aurora blob / mesh gradient / stacked blur circles
**Severity:** HIGH | **Type:** VISUAL + AUTO
VISUAL: PASS if the hero background does NOT use multiple overlapping blur(80px–200px) circles or div blobs producing a "mesh gradient" or "aurora" effect. This is the #2 most-common AI site pattern.
AUTO hint: `document.querySelectorAll('[class*=blur], [style*="blur"]')` — count elements with `filter: blur(>= 60px)`. More than 3 such decorative blur elements = FAIL.

### 6.2 Hero headline is a visual object, not a label
**Severity:** HIGH | **Type:** VISUAL
PASS if the hero headline is treated as a designed element: it has a distinctive size (>= 56px), a non-default font, intentional leading, and commands the page as an image-like object. FAIL if it looks like a `<p>` with a slightly larger font — a label floating above a gradient, not a designed statement.

### 6.3 No generic hero badge ("✨ New — AI-powered features")
**Severity:** MEDIUM | **Type:** VISUAL
PASS if there is no gradient-border pill badge above the hero headline promoting "new" features with an emoji, OR if such a badge has been replaced with a datestamped editorial flag or plain-text copy. The glowing pill badge is a pattern worn out by every AI product launched since 2023.

### 6.4 Hero visual is not a perspective-tilted product screenshot
**Severity:** MEDIUM | **Type:** VISUAL + AUTO
VISUAL: PASS if the hero does NOT use `transform: perspective(...)  rotateX(5deg)` or similar 3D tilt on a product screenshot floating on a gradient. This is the #3 most-common AI landing page cliché.
AUTO hint: check inline styles and CSS rules for `perspective` + `rotateX` or `rotateY` on images in the hero section.

---

## 7. SIGNATURE MOMENT

### 7.1 Exactly ONE "wow" signature interaction is present
**Severity:** HIGH | **Type:** VISUAL
PASS if there is exactly one interaction that is memorable and describable — a velocity marquee, a custom cursor, a hover image reveal, a count-up ticker block, a clip-reveal link list, or a pinned scroll product reveal. FAIL if there are zero (site feels static/dead) or more than two (attention is diluted, feels like a demo reel). The bar: "Could you describe this interaction to a friend?"

### 7.2 Scroll-driven storytelling moment is present
**Severity:** HIGH | **Type:** VISUAL
PASS if at least one section uses scroll position to drive a narrative — pinned section with beat-by-beat reveal, sticky product panel that changes as you scroll through a list of features, or a parallax composition with foreground/background separation. Simple fade-on-scroll alone does not count. FAIL if all animations trigger once on intersection and play once with no further relationship to scroll position.

### 7.3 Preloader fires on first visit, skips on repeat
**Severity:** MEDIUM | **Type:** AUTO
```
Check: on first visit (no sessionStorage key), a loading screen or number-count preloader
must appear before hero content is visible.
Check: sessionStorage key (any key containing "intro", "seen", "loaded", or "preloader")
is set after the preloader completes.
Check: on second visit (key present), the preloader is skipped and hero is visible immediately.
FAIL if preloader runs on repeat visits (annoying) or is missing entirely on first visit.
```

---

## 8. IMAGES & CONTENT

### 8.1 No broken or placeholder images
**Severity:** CRITICAL | **Type:** AUTO
```
Check: document.querySelectorAll('img') — for each image:
- naturalWidth > 0 (image loaded successfully)
- src does not contain "placeholder", "lorem", "picsum", "via.placeholder.com", "dummyimage.com"
FAIL if any image has naturalWidth === 0 or a placeholder src.
```

### 8.2 No stock photo with watermark or generic business imagery
**Severity:** HIGH | **Type:** VISUAL
PASS if all images are: product screenshots, custom illustration, abstract graphic treatments, or photography that feels intentional and owned. FAIL if images show generic "diverse team smiling at laptop," "lightbulb on dark gradient," or have a Getty/Shutterstock watermark.

### 8.3 No lorem ipsum or "coming soon" copy
**Severity:** CRITICAL | **Type:** AUTO
```
Check: document.body.innerText — must not contain "lorem ipsum", "coming soon", "placeholder",
"TODO", "your text here", or any string of 5+ repeated words.
FAIL immediately if any such string is found.
```

---

## 9. OVERALL CRAFT IMPRESSION

### 9.1 The site could only be for THIS product
**Severity:** HIGH | **Type:** VISUAL
PASS if swapping the logo and product name for a competitor's would require redesigning at least one section to make it fit. The visual identity, tone, and composition should be specific to the product brief. FAIL if it reads as a template that could serve any B2B SaaS.

### 9.2 Generous, intentional whitespace
**Severity:** HIGH | **Type:** VISUAL
PASS if at least 35% of any viewport screenshot is negative space (background color with no content). Generous whitespace signals confidence. FAIL if the page feels packed, cramped, or if every section fills edge-to-edge with content.

### 9.3 Symmetric layout is the exception, not the default
**Severity:** HIGH | **Type:** VISUAL
Count every content section. PASS if fewer than 40% use centered/symmetric composition. Asymmetry should be the default; centering used only for deliberate moments (CTA callouts, stat bands).

### 9.4 No "Trusted by teams at ___" horizontal logo strip under hero
**Severity:** MEDIUM | **Type:** VISUAL
PASS if the social proof section is NOT a plain horizontal row of grayscale logos directly below the hero with the text "Trusted by teams at [Company] [Company] [Company]." Acceptable alternatives: single customer story, logos in a designed bento, velocity marquee, editorial mention.

### 9.5 Nav is not a generic all-glass sticky bar
**Severity:** MEDIUM | **Type:** VISUAL + AUTO
VISUAL: PASS if the nav is NOT: full-width, `backdrop-blur` from scroll position 0, with the logo on the left + links in center + CTA on the right at all times. Acceptable alternatives: invisible-until-scroll, editorial type-only nav, sidebar nav, hidden-until-gesture.
AUTO hint: check for `backdrop-filter: blur(...)` on `<header>` or `<nav>` at scroll position 0. If present at rest (not only on scroll), flag for review.

### 9.6 Footer is NOT a dense link grid
**Severity:** MEDIUM | **Type:** VISUAL
PASS if the footer has personality: minimal one-line copyright, display-type editorial footer, or interactive/animated element. FAIL if it is a standard 4-column link grid that could belong to any enterprise product.

### 9.7 "It looks hand-crafted, not generated" — the holistic test
**Severity:** CRITICAL | **Type:** VISUAL
This is the master gate. Take a 10-second screenshot of the page. Ask: "Does this look like it was built by a specific human designer with a specific point of view, or does it look like it was generated by an AI given a generic SaaS brief?" PASS only if the answer is clearly the former. If any doubt exists, identify which items from sections 1–8 are responsible and address them.

---

## Machine-readable items

```json
[
  {
    "id": "dc-01",
    "category": "design",
    "severity": "CRITICAL",
    "title": "Not the default AI palette",
    "check": "VISUAL",
    "verify": "Does the site use the navy/indigo→purple gradient + soft white glow combination as its primary brand expression? PASS if it does NOT."
  },
  {
    "id": "dc-02",
    "category": "design",
    "severity": "CRITICAL",
    "title": "Display face is not Inter/Arial/system default",
    "check": "AUTO",
    "verify": "computed font-family of h1 must not match: Inter, Arial, Helvetica, system-ui, -apple-system, Roboto, Geist (as sole display face)."
  },
  {
    "id": "dc-03",
    "category": "design",
    "severity": "HIGH",
    "title": "Exactly one accent hue, used in ≥4 rules",
    "check": "AUTO",
    "verify": "Count distinct hue values (±15° tolerance) in interactive CSS. Must equal 1. Accent CSS var must appear in ≥ 4 CSS rule locations."
  },
  {
    "id": "dc-04",
    "category": "design",
    "severity": "HIGH",
    "title": "Identity is deliberate, not defaulted",
    "check": "VISUAL",
    "verify": "Does the palette + typeface pairing reflect a deliberate identity decision? Could you swap the brand name for a competitor and nothing would change? PASS if it is product-specific."
  },
  {
    "id": "dc-05",
    "category": "design",
    "severity": "CRITICAL",
    "title": "Display typeface has visual personality",
    "check": "VISUAL+AUTO",
    "verify": "AUTO: h1 font-family not in ban list. VISUAL: heading face has distinctive character — not a perfectly neutral grotesque at default weight. PASS if both pass."
  },
  {
    "id": "dc-06",
    "category": "design",
    "severity": "HIGH",
    "title": "4× type scale contrast minimum per section",
    "check": "VISUAL",
    "verify": "In any section, largest-to-smallest font-size ratio must be ≥ 4:1. PASS if TRUE."
  },
  {
    "id": "dc-07",
    "category": "design",
    "severity": "MEDIUM",
    "title": "Display text has negative letter-spacing",
    "check": "AUTO",
    "verify": "Elements with font-size >= 40px: letter-spacing <= -0.01em. Elements with font-size >= 64px: letter-spacing <= -0.025em."
  },
  {
    "id": "dc-08",
    "category": "design",
    "severity": "CRITICAL",
    "title": "Body text contrast ≥ 4.5:1",
    "check": "AUTO",
    "verify": "Contrast ratio of primary body text color vs immediate background must be >= 4.5:1 (WCAG AA)."
  },
  {
    "id": "dc-09",
    "category": "design",
    "severity": "MEDIUM",
    "title": "No decorative text below 11px",
    "check": "AUTO",
    "verify": "All visible text nodes must have computed font-size >= 11px. Exception: disabled/placeholder states."
  },
  {
    "id": "dc-10",
    "category": "design",
    "severity": "CRITICAL",
    "title": "Hero is not centered-headline-on-gradient cliché",
    "check": "VISUAL",
    "verify": "Hero layout must NOT be: centered headline + centered subline + centered CTA pair on a gradient background with glow blob. PASS if layout is offset, editorial, full-bleed image, or typographically dominant."
  },
  {
    "id": "dc-11",
    "category": "design",
    "severity": "CRITICAL",
    "title": "No even 3-column emoji/icon feature grid",
    "check": "VISUAL",
    "verify": "No section may use 3 equal-width columns each with a centered emoji/icon, short title, and 1–2 lines of copy. PASS if this pattern is absent from every section."
  },
  {
    "id": "dc-12",
    "category": "design",
    "severity": "HIGH",
    "title": "No two adjacent sections share the same layout shape",
    "check": "VISUAL",
    "verify": "Inspect every consecutive section pair. PASS if no two neighbors share the same structural pattern (column count, alignment, and density must differ)."
  },
  {
    "id": "dc-13",
    "category": "design",
    "severity": "HIGH",
    "title": "Asymmetric layout present (5/7, 7/5, 60/40, or off-axis)",
    "check": "VISUAL",
    "verify": "At least one section must use an off-axis layout or a column that bleeds past the container. PASS if TRUE."
  },
  {
    "id": "dc-14",
    "category": "design",
    "severity": "HIGH",
    "title": "At least one full-bleed element",
    "check": "VISUAL+AUTO",
    "verify": "VISUAL: at least one element stretches to viewport edge. AUTO hint: find element with width:100vw or negative margin equal to gutter."
  },
  {
    "id": "dc-15",
    "category": "design",
    "severity": "MEDIUM",
    "title": "Background weight alternates across sections",
    "check": "VISUAL",
    "verify": "No three consecutive sections may share the same luminance band (all-light or all-dark). PASS if light↔dark rhythm exists."
  },
  {
    "id": "dc-16",
    "category": "design",
    "severity": "MEDIUM",
    "title": "Section vertical rhythm is varied",
    "check": "AUTO",
    "verify": "padding-top values across all <section> elements must include at least 3 distinct values. FAIL if all sections share identical padding."
  },
  {
    "id": "dc-17",
    "category": "design",
    "severity": "CRITICAL",
    "title": "Every button has custom :hover style",
    "check": "AUTO",
    "verify": "For every <button> and <a class~=btn>: a :hover rule must set background, transform, box-shadow, or color change beyond browser default cursor:pointer. 100% coverage required."
  },
  {
    "id": "dc-18",
    "category": "design",
    "severity": "CRITICAL",
    "title": "Every button has :focus-visible ring",
    "check": "AUTO",
    "verify": "For every <button> and <a class~=btn>: a :focus-visible rule must set outline or box-shadow ring. outline:none without replacement = FAIL."
  },
  {
    "id": "dc-19",
    "category": "design",
    "severity": "HIGH",
    "title": "Primary CTA has press/active state",
    "check": "AUTO",
    "verify": "Primary CTA must have :active CSS rule with transform:scale(<1) or translateY(+n), OR a Framer Motion whileTap / GSAP press handler in source."
  },
  {
    "id": "dc-20",
    "category": "design",
    "severity": "HIGH",
    "title": "Nav links have custom hover treatment beyond color",
    "check": "AUTO",
    "verify": "<nav> anchor :hover rules must go beyond color change: underline draw, pseudo-element indicator, opacity shift, or translateX. Browser underline default = FAIL."
  },
  {
    "id": "dc-21",
    "category": "design",
    "severity": "HIGH",
    "title": "Button design is custom — not browser/shadcn default",
    "check": "VISUAL",
    "verify": "Primary CTA must have a border-radius, padding, weight, and color that reflect the site's identity tokens. Generic gray-border or unstyled = FAIL."
  },
  {
    "id": "dc-22",
    "category": "design",
    "severity": "HIGH",
    "title": "Grain overlay is present",
    "check": "AUTO",
    "verify": "body::after or a fixed overlay must have: SVG feTurbulence or noise texture background-image, opacity 0.03–0.12, pointer-events:none, position:fixed, z-index > 100."
  },
  {
    "id": "dc-23",
    "category": "design",
    "severity": "HIGH",
    "title": "At least 5 craft micro-details present",
    "check": "VISUAL",
    "verify": "PASS if ≥ 5 of: mono eyebrows, section counters, animated underlines on links, 1px inset highlight border, em-dash list markers, custom dividers, card hover-reveal, consistent caption scale (11–12px tracked-out)."
  },
  {
    "id": "dc-24",
    "category": "design",
    "severity": "MEDIUM",
    "title": "Radius is from a token system (≤4 distinct values)",
    "check": "AUTO",
    "verify": "border-radius values on buttons, cards, inputs, badges must derive from ≤ 4 distinct token values. More than 5 distinct values = no token system = FAIL."
  },
  {
    "id": "dc-25",
    "category": "design",
    "severity": "MEDIUM",
    "title": "No uniform default box-shadow on all cards",
    "check": "AUTO",
    "verify": "If > 60% of card elements share the exact value '0 4px 24px rgba(0,0,0,0.08)' or Tailwind shadow-md default, FAIL. Expected: flat, directional, or inset-highlight + directional."
  },
  {
    "id": "dc-26",
    "category": "design",
    "severity": "MEDIUM",
    "title": "No pure #000000 or #ffffff backgrounds",
    "check": "AUTO",
    "verify": "computed background-color of <html>, <body>, and first full-bleed section must not equal rgb(0,0,0) or rgb(255,255,255) exactly."
  },
  {
    "id": "dc-27",
    "category": "design",
    "severity": "HIGH",
    "title": "No aurora blob / stacked blur circles in hero",
    "check": "VISUAL+AUTO",
    "verify": "VISUAL: hero must not use multiple overlapping blur(80px+) divs producing mesh-gradient effect. AUTO: elements with filter:blur(>=60px) — more than 3 decorative blur elements = FAIL."
  },
  {
    "id": "dc-28",
    "category": "design",
    "severity": "HIGH",
    "title": "Hero headline is a visual object, not a label",
    "check": "VISUAL",
    "verify": "Hero headline must be >= 56px, use a non-default font, intentional leading, and command the page like an image. A <p> with bigger font floating on a gradient = FAIL."
  },
  {
    "id": "dc-29",
    "category": "design",
    "severity": "MEDIUM",
    "title": "No generic hero badge with emoji and gradient border",
    "check": "VISUAL",
    "verify": "No gradient-border pill badge with emoji above hero headline. PASS if absent or replaced with a plain editorial flag."
  },
  {
    "id": "dc-30",
    "category": "design",
    "severity": "MEDIUM",
    "title": "Hero visual is not a perspective-tilted screenshot",
    "check": "VISUAL+AUTO",
    "verify": "VISUAL: hero does not use perspective() rotateX(5deg) product screenshot on gradient. AUTO: no inline style or CSS rule with perspective + rotateX/rotateY on images in hero section."
  },
  {
    "id": "dc-31",
    "category": "design",
    "severity": "HIGH",
    "title": "Exactly ONE signature wow interaction",
    "check": "VISUAL",
    "verify": "Exactly one memorable interaction describable in a sentence (marquee, custom cursor, hover reveal, count-up tickers, clip-reveal links, or pinned scroll reveal). Zero = static/dead. Two+ = diluted. PASS if exactly one."
  },
  {
    "id": "dc-32",
    "category": "design",
    "severity": "HIGH",
    "title": "Scroll-driven storytelling moment present",
    "check": "VISUAL",
    "verify": "At least one section must use scroll position to drive a narrative (pinned beats, sticky product panel, compositional parallax). Simple intersection fade-once does NOT count."
  },
  {
    "id": "dc-33",
    "category": "design",
    "severity": "MEDIUM",
    "title": "Preloader fires first visit, skips repeat",
    "check": "AUTO",
    "verify": "On first visit (no sessionStorage intro key): loading screen appears before hero. After preloader: sessionStorage key set. On second visit: preloader skipped, hero visible immediately."
  },
  {
    "id": "dc-34",
    "category": "design",
    "severity": "CRITICAL",
    "title": "No broken or placeholder images",
    "check": "AUTO",
    "verify": "All <img> elements: naturalWidth > 0. src must not contain: placeholder, lorem, picsum, via.placeholder.com, dummyimage.com."
  },
  {
    "id": "dc-35",
    "category": "design",
    "severity": "HIGH",
    "title": "No stock photo with watermark or generic business imagery",
    "check": "VISUAL",
    "verify": "All images are product screenshots, custom illustration, abstract graphic treatment, or intentional photography. Generic stock business imagery = FAIL."
  },
  {
    "id": "dc-36",
    "category": "design",
    "severity": "CRITICAL",
    "title": "No lorem ipsum or 'coming soon' copy",
    "check": "AUTO",
    "verify": "document.body.innerText must not contain: 'lorem ipsum', 'coming soon', 'placeholder', 'TODO', 'your text here', or any 5+ repeated-word sequence."
  },
  {
    "id": "dc-37",
    "category": "design",
    "severity": "HIGH",
    "title": "Site could only be for THIS product",
    "check": "VISUAL",
    "verify": "Could you swap the logo and product name for a competitor and nothing need redesigning? PASS if swapping would require layout/visual redesign — identity is product-specific."
  },
  {
    "id": "dc-38",
    "category": "design",
    "severity": "HIGH",
    "title": "Generous intentional whitespace (≥35% void per viewport)",
    "check": "VISUAL",
    "verify": "In any viewport screenshot, at least 35% is negative space (background with no content). Packed/cramped = FAIL."
  },
  {
    "id": "dc-39",
    "category": "design",
    "severity": "HIGH",
    "title": "Asymmetry is the default — centered sections < 40%",
    "check": "VISUAL",
    "verify": "Count all content sections. Fewer than 40% may use centered/symmetric composition. PASS if asymmetry dominates."
  },
  {
    "id": "dc-40",
    "category": "design",
    "severity": "MEDIUM",
    "title": "No plain horizontal logo strip under hero",
    "check": "VISUAL",
    "verify": "Social proof section is NOT a plain row of grayscale logos with 'Trusted by teams at...' directly below the hero. PASS if absent or replaced with designed alternative."
  },
  {
    "id": "dc-41",
    "category": "design",
    "severity": "MEDIUM",
    "title": "Nav is not all-glass sticky bar from scroll position 0",
    "check": "VISUAL+AUTO",
    "verify": "VISUAL: nav must not be a full-width backdrop-blur bar visible from the very top. AUTO: check backdrop-filter:blur on <header>/<nav> at scroll=0. If present at rest (not only after scroll), flag."
  },
  {
    "id": "dc-42",
    "category": "design",
    "severity": "MEDIUM",
    "title": "Footer is not a dense link grid",
    "check": "VISUAL",
    "verify": "Footer has personality: minimal one-line copyright, display-type editorial footer, or interactive element. Standard 4-column enterprise link grid = FAIL."
  },
  {
    "id": "dc-43",
    "category": "design",
    "severity": "CRITICAL",
    "title": "Holistic: looks hand-crafted, not generated",
    "check": "VISUAL",
    "verify": "10-second screenshot test: 'Was this built by a specific designer with a point of view, or generated for a generic SaaS brief?' PASS only if the answer is clearly the former. Any doubt = identify failing items and fix."
  }
]
```
