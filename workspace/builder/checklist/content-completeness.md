# Content & Completeness Checklist

**Scope:** Premium product/marketing website — pre-launch or post-build QA pass.
**Method key:** AUTO = scriptable check; VISUAL = human eye required.
**Severity:** CRITICAL = blocks launch; HIGH = ships same day; MEDIUM = next sprint; LOW = polish pass.

---

## 1. No Dummy / Placeholder Text

| ID | Check | Method | Severity | Pass criteria |
|----|-------|--------|----------|---------------|
| CC-001 | No "lorem ipsum" anywhere in rendered text | AUTO | CRITICAL | `document.body.innerText` does NOT match `/lorem\s*ipsum/i` |
| CC-002 | No "placeholder" used as content | AUTO | CRITICAL | `document.body.innerText` does NOT match `/\bplaceholder\b/i` (exclude `<input placeholder>` attributes) |
| CC-003 | No "coming soon" left in shipped sections | AUTO | HIGH | `document.body.innerText` does NOT match `/coming soon/i` |
| CC-004 | No raw TODO / FIXME visible to users | AUTO | CRITICAL | `document.body.innerText` does NOT match `/\b(TODO|FIXME|TBD|PLACEHOLDER)\b/i` |
| CC-005 | No "sample text" / "dummy text" visible | AUTO | CRITICAL | `document.body.innerText` does NOT match `/sample text\|dummy text/i` |
| CC-006 | No "insert [noun] here" patterns | AUTO | HIGH | `document.body.innerText` does NOT match `/insert .{1,30} here/i` |
| CC-007 | No "your text here" or "type here" | AUTO | HIGH | `document.body.innerText` does NOT match `/your text here\|type here/i` |

**Playwright snippet:**
```js
const bodyText = await page.evaluate(() => document.body.innerText);
const banned = /lorem\s*ipsum|placeholder|coming soon|\bTODO\b|\bFIXME\b|\bTBD\b|sample text|dummy text|insert .{1,30} here|your text here|type here/i;
expect(banned.test(bodyText)).toBe(false);
```

---

## 2. Real, Consistent Brand Name

| ID | Check | Method | Severity | Pass criteria |
|----|-------|--------|----------|---------------|
| CC-010 | No generic "Brand" used as the brand name | AUTO | CRITICAL | `document.body.innerText` does NOT match `/\bBrand\b/` (case-sensitive standalone word) |
| CC-011 | No "Your Company" in rendered text | AUTO | CRITICAL | `document.body.innerText` does NOT match `/your company/i` |
| CC-012 | No "Acme" / "Acme Corp" used as placeholder | AUTO | HIGH | `document.body.innerText` does NOT match `/\bAcme\b/i` |
| CC-013 | Brand name spelling is consistent across all pages | VISUAL | HIGH | Every instance of the brand name uses identical capitalisation and spelling — no "Helm" vs "HELM" vs "helm" inconsistency |
| CC-014 | Logo alt text matches real brand name | AUTO | MEDIUM | `document.querySelector('img[alt]')` alt attributes do NOT contain "logo placeholder" / "your logo" and DO contain the real brand name |
| CC-015 | `<title>` tags contain real brand name, not generic | AUTO | HIGH | `document.title` matches real brand name; does NOT match `/brand\|your company\|untitled/i` |
| CC-016 | `<meta name="description">` is real, brand-specific copy | VISUAL | MEDIUM | Meta description is specific, on-brand, 120–160 chars; not a filler sentence |

---

## 3. Required Sections Present

| ID | Check | Method | Severity | Pass criteria |
|----|-------|--------|----------|---------------|
| CC-020 | Hero section exists above fold | VISUAL | CRITICAL | Viewport at 1440×900 shows a hero with headline + sub-headline within first 100vh |
| CC-021 | Value proposition / proof block present | VISUAL | CRITICAL | At least one section clearly answers "why this product?" — feature grid, benefit list, or mission statement |
| CC-022 | Features section present | VISUAL | CRITICAL | Dedicated features section enumerates ≥3 distinct product capabilities |
| CC-023 | Product detail / specs present | VISUAL | HIGH | Specs, screenshots, or deep-dive section exists; not just marketing bullets |
| CC-024 | Social proof / testimonials (if relevant) | VISUAL | HIGH | At least one testimonial, press quote, case study, or trust logo present if the site warrants it |
| CC-025 | Pricing or CTA section present | VISUAL | CRITICAL | Clear pricing tier(s) or a primary conversion CTA exists above the footer |
| CC-026 | FAQ section present (if relevant) | VISUAL | MEDIUM | If complexity warrants FAQ, it exists with real Q&A, not "Question goes here" |
| CC-027 | Footer present with real content | VISUAL | CRITICAL | Footer exists and contains nav links, legal links, and at least one social link — not just copyright year |

---

## 4. Clear Primary CTA Above the Fold

| ID | Check | Method | Severity | Pass criteria |
|----|-------|--------|----------|---------------|
| CC-030 | Primary CTA button/link visible in hero | VISUAL | CRITICAL | At 1440×900 and 390×844, a primary CTA button is visible without scrolling |
| CC-031 | CTA button text is specific, not generic | VISUAL | HIGH | CTA text is NOT "Click here", "Submit", "Button", "Learn More" alone — must state the value (e.g. "Start free trial", "Download for Mac") |
| CC-032 | CTA `href` points to a real destination | AUTO | CRITICAL | Primary CTA `<a>` href is NOT `#`, `javascript:void(0)`, or empty; it resolves to a real URL or valid anchor |

**Playwright snippet:**
```js
// count bare "#" hrefs on primary CTA elements
const ctaLinks = await page.$$eval('a.cta, a[data-cta], .hero a', els =>
  els.map(el => el.getAttribute('href'))
);
const deadLinks = ctaLinks.filter(h => h === '#' || h === '' || h === null);
expect(deadLinks.length).toBe(0);
```

---

## 5. Footer Completeness

| ID | Check | Method | Severity | Pass criteria |
|----|-------|--------|----------|---------------|
| CC-040 | Footer nav links resolve (not all `href="#"`) | AUTO | HIGH | `footer a[href]` — fewer than 20% of footer links have `href="#"` |
| CC-041 | Privacy Policy link present in footer | VISUAL | HIGH | Footer contains a link with text matching `/privacy/i` |
| CC-042 | Terms / Terms of Service link present | VISUAL | HIGH | Footer contains a link with text matching `/terms/i` |
| CC-043 | Copyright year is correct (current year) | AUTO | MEDIUM | Footer text contains current calendar year (2026 or dynamic `new Date().getFullYear()`) |
| CC-044 | Social media links present (if brand has accounts) | VISUAL | MEDIUM | At least one social icon/link visible in footer or header |
| CC-045 | No `href="#"` on every single footer nav link | AUTO | HIGH | `document.querySelectorAll('footer a[href="#"]').length < document.querySelectorAll('footer a').length * 0.2` |

**Playwright snippet:**
```js
const footerLinks = await page.$$eval('footer a', els => els.map(el => el.getAttribute('href')));
const dead = footerLinks.filter(h => h === '#');
expect(dead.length / footerLinks.length).toBeLessThan(0.2);
```

---

## 6. No Raw HTML Entities in Visible Text

| ID | Check | Method | Severity | Pass criteria |
|----|-------|--------|----------|---------------|
| CC-050 | No `&amp;` visible in rendered copy | AUTO | HIGH | `document.body.innerText` does NOT contain `&amp;` |
| CC-051 | No `&lt;` or `&gt;` visible in rendered copy | AUTO | HIGH | `document.body.innerText` does NOT contain `&lt;` or `&gt;` |
| CC-052 | No `&#x27;` or `&#039;` visible as apostrophe | AUTO | MEDIUM | `document.body.innerText` does NOT match `/&#x?[0-9a-f]+;/i` |
| CC-053 | No `&nbsp;` visible as literal text | AUTO | MEDIUM | `document.body.innerHTML` does NOT contain literal `&amp;nbsp;` rendered as text |

**Playwright snippet:**
```js
const bodyText = await page.evaluate(() => document.body.innerText);
expect(bodyText).not.toMatch(/&amp;|&lt;|&gt;|&#x?[0-9a-fA-F]+;/);
```

---

## 7. Spelling & Heading Quality

| ID | Check | Method | Severity | Pass criteria |
|----|-------|--------|----------|---------------|
| CC-060 | No obvious spelling errors in `<h1>` – `<h3>` | VISUAL | HIGH | All heading text read and confirmed free of typos; run through spell-check tool on extracted headings |
| CC-061 | No ALL-CAPS entire paragraphs | VISUAL | LOW | Body paragraphs are NOT set in all-caps (decorative headings exempt) |
| CC-062 | No `<h1>` reading "Home" or "Page Title" or "Heading" | AUTO | HIGH | `document.querySelectorAll('h1')` text does NOT match `/^(home|page title|heading|title goes here)$/i` |
| CC-063 | Subheadings are not just repeating the same phrase | VISUAL | MEDIUM | Feature subheadings are each distinct; no three consecutive identical strings |

---

## 8. Consistent Terminology & Brand Voice

| ID | Check | Method | Severity | Pass criteria |
|----|-------|--------|----------|---------------|
| CC-070 | Product name not inconsistently capitalised | VISUAL | HIGH | All instances of the product name use the same form (e.g., always "Helm", never "HELM" or "helm") |
| CC-071 | No mixed US/UK spelling of the same word in headings | VISUAL | LOW | "colour"/"color" and similar variants are not mixed within the same region-targeted page |
| CC-072 | Tone is consistent (formal vs casual) | VISUAL | MEDIUM | Body copy tone does not randomly shift from conversational to formal mid-page |
| CC-073 | No third-person/first-person voice switching (e.g., "we"/"they" for the same brand) | VISUAL | MEDIUM | Brand is consistently referred to in first-person ("we", "our") or third-person, not both |

---

## 9. No Duplicated Filler Sections

| ID | Check | Method | Severity | Pass criteria |
|----|-------|--------|----------|---------------|
| CC-080 | No section repeated verbatim | AUTO | HIGH | No two adjacent `<section>` or `<div>` blocks share identical `innerText` (>50 chars) |
| CC-081 | Feature cards do not all have the same placeholder description | AUTO | HIGH | Feature card body text strings are all distinct; no duplicate strings >20 chars |
| CC-082 | Testimonials are not copy-pasted with names changed | VISUAL | MEDIUM | Each testimonial quote is unique and specific to that person |

**Playwright snippet:**
```js
const sections = await page.$$eval('section, [class*="feature"], [class*="card"]',
  els => els.map(el => el.innerText.trim().slice(0, 100))
);
const unique = new Set(sections);
expect(unique.size).toBe(sections.length); // no duplicate blocks
```

---

## 10. Concrete Numbers / Stats

| ID | Check | Method | Severity | Pass criteria |
|----|-------|--------|----------|---------------|
| CC-090 | No "XX%" placeholder in stat callouts | AUTO | CRITICAL | `document.body.innerText` does NOT match `/\bXX%|\b0{3,}\b|NNN|###/` |
| CC-091 | No "$0" or "$000" in pricing | AUTO | CRITICAL | Pricing section text does NOT match `/\$0{2,}|\$X+/i` |
| CC-092 | Stats reference real numbers | VISUAL | HIGH | All numeric claims (e.g. "10,000 users", "99.9% uptime") are specific and plausible |
| CC-093 | Dates are real, not "Month DD, YYYY" | AUTO | HIGH | `document.body.innerText` does NOT match `/Month DD, YYYY|MM\/DD\/YYYY/i` |

---

## 11. Forms Are Functional

| ID | Check | Method | Severity | Pass criteria |
|----|-------|--------|----------|---------------|
| CC-100 | Contact / newsletter form has real input fields | VISUAL | CRITICAL | Any contact or email-capture form contains at least an `<input type="email">` or `<input type="text">` and a submit button |
| CC-101 | Form submit button is not disabled by default | AUTO | HIGH | `document.querySelector('form button[type="submit"]').disabled === false` |
| CC-102 | Form does not submit to `#` or `void` | AUTO | CRITICAL | `<form action>` is NOT `#` or `javascript:void(0)` — must point to a real endpoint or have a JS handler |
| CC-103 | Success / error feedback state exists | VISUAL | HIGH | After form submission (or simulated), a success message or error state is shown — not silent |

---

## 12. Brief Match (Requested Features Present)

| ID | Check | Method | Severity | Pass criteria |
|----|-------|--------|----------|---------------|
| CC-110 | All sections listed in the creative brief exist | VISUAL | CRITICAL | Brief is cross-referenced line-by-line; each requested section/feature is accounted for |
| CC-111 | Requested integrations / platforms mentioned in copy | VISUAL | HIGH | If brief named specific integrations (e.g., "iOS + Mac + Windows"), those appear in features or compatibility section |
| CC-112 | Requested screenshots / mockups are real product UI | VISUAL | HIGH | No wireframe stubs, Figma frames, or grey-box mockups shipped as final product screenshots |
| CC-113 | Any requested demo/video embed is present | VISUAL | MEDIUM | If brief called for a demo video or explainer, a real `<video>` or embed exists (not a static grey box) |

---

## Summary table

| Severity | Count |
|----------|-------|
| CRITICAL | 15 |
| HIGH | 23 |
| MEDIUM | 10 |
| LOW | 3 |
| **Total** | **51** |

---

## Machine-readable items

```json
[
  {"id":"CC-001","category":"content","severity":"CRITICAL","title":"No lorem ipsum","check":"document.body.innerText does NOT match /lorem\\s*ipsum/i","verify":"AUTO: Playwright grep rendered innerText"},
  {"id":"CC-002","category":"content","severity":"CRITICAL","title":"No 'placeholder' as content","check":"document.body.innerText does NOT match /\\bplaceholder\\b/i (exclude input placeholder attributes)","verify":"AUTO: Playwright grep rendered innerText, skip input attrs"},
  {"id":"CC-003","category":"content","severity":"HIGH","title":"No 'coming soon' in shipped sections","check":"document.body.innerText does NOT match /coming soon/i","verify":"AUTO: Playwright grep rendered innerText"},
  {"id":"CC-004","category":"content","severity":"CRITICAL","title":"No raw TODO/FIXME/TBD visible","check":"document.body.innerText does NOT match /\\b(TODO|FIXME|TBD|PLACEHOLDER)\\b/i","verify":"AUTO: Playwright grep rendered innerText"},
  {"id":"CC-005","category":"content","severity":"CRITICAL","title":"No 'sample text'/'dummy text'","check":"document.body.innerText does NOT match /sample text|dummy text/i","verify":"AUTO: Playwright grep rendered innerText"},
  {"id":"CC-006","category":"content","severity":"HIGH","title":"No 'insert X here' patterns","check":"document.body.innerText does NOT match /insert .{1,30} here/i","verify":"AUTO: Playwright grep rendered innerText"},
  {"id":"CC-007","category":"content","severity":"HIGH","title":"No 'your text here'/'type here'","check":"document.body.innerText does NOT match /your text here|type here/i","verify":"AUTO: Playwright grep rendered innerText"},
  {"id":"CC-010","category":"content","severity":"CRITICAL","title":"No generic 'Brand' as brand name","check":"document.body.innerText does NOT match standalone /\\bBrand\\b/ (case-sensitive)","verify":"AUTO: Playwright exact word match"},
  {"id":"CC-011","category":"content","severity":"CRITICAL","title":"No 'Your Company' in rendered text","check":"document.body.innerText does NOT match /your company/i","verify":"AUTO: Playwright grep rendered innerText"},
  {"id":"CC-012","category":"content","severity":"HIGH","title":"No 'Acme' placeholder brand","check":"document.body.innerText does NOT match /\\bAcme\\b/i","verify":"AUTO: Playwright grep rendered innerText"},
  {"id":"CC-013","category":"content","severity":"HIGH","title":"Brand name spelling consistent","check":"All instances of brand name use identical capitalisation","verify":"VISUAL: Read every heading and nav element for consistent casing"},
  {"id":"CC-014","category":"content","severity":"MEDIUM","title":"Logo alt text contains real brand name","check":"img alt attrs do NOT contain 'logo placeholder'/'your logo'; DO contain real brand name","verify":"AUTO: document.querySelectorAll('img[alt]') scan"},
  {"id":"CC-015","category":"content","severity":"HIGH","title":"<title> contains real brand name","check":"document.title does NOT match /brand|your company|untitled/i","verify":"AUTO: document.title check"},
  {"id":"CC-016","category":"content","severity":"MEDIUM","title":"Meta description is real, brand-specific","check":"<meta name='description'> is 120–160 chars, on-brand, not filler","verify":"VISUAL: Read meta description; confirm specificity"},
  {"id":"CC-020","category":"content","severity":"CRITICAL","title":"Hero section above fold","check":"Viewport 1440×900: headline + sub-headline visible within first 100vh","verify":"VISUAL: Screenshot at 1440×900 viewport"},
  {"id":"CC-021","category":"content","severity":"CRITICAL","title":"Value proposition section present","check":"At least one section answers 'why this product?'","verify":"VISUAL: Scroll page; identify explicit value prop block"},
  {"id":"CC-022","category":"content","severity":"CRITICAL","title":"Features section present","check":"Dedicated features section with ≥3 distinct capabilities","verify":"VISUAL: Confirm features section with real content"},
  {"id":"CC-023","category":"content","severity":"HIGH","title":"Product detail/specs present","check":"Specs, screenshots, or deep-dive section beyond marketing bullets","verify":"VISUAL: Identify section with concrete product detail"},
  {"id":"CC-024","category":"content","severity":"HIGH","title":"Social proof present (if relevant)","check":"At least one testimonial, press quote, case study, or trust logo","verify":"VISUAL: Confirm at least one real trust signal"},
  {"id":"CC-025","category":"content","severity":"CRITICAL","title":"Pricing or CTA section present","check":"Clear pricing tier(s) or primary conversion CTA above footer","verify":"VISUAL: Confirm pricing/CTA section exists"},
  {"id":"CC-026","category":"content","severity":"MEDIUM","title":"FAQ section present (if relevant)","check":"If complexity warrants FAQ, it exists with real Q&A","verify":"VISUAL: Confirm FAQ exists with real questions and answers"},
  {"id":"CC-027","category":"content","severity":"CRITICAL","title":"Footer with real content","check":"Footer contains nav links, legal links, at least one social link","verify":"VISUAL: Inspect footer for all required link types"},
  {"id":"CC-030","category":"content","severity":"CRITICAL","title":"Primary CTA visible in hero","check":"At 1440×900 and 390×844 a primary CTA button visible without scrolling","verify":"VISUAL: Screenshot both viewports; confirm CTA presence"},
  {"id":"CC-031","category":"content","severity":"HIGH","title":"CTA text is specific, not generic","check":"CTA text is NOT 'Click here'/'Submit'/'Button'/'Learn More' alone","verify":"VISUAL: Read every primary CTA button label"},
  {"id":"CC-032","category":"content","severity":"CRITICAL","title":"CTA href is a real destination","check":"Primary CTA href is NOT '#', 'javascript:void(0)', or empty","verify":"AUTO: page.$$eval('.hero a', els => els.map(el => el.getAttribute('href')))"},
  {"id":"CC-040","category":"content","severity":"HIGH","title":"Footer nav links resolve","check":"<20% of footer links have href='#'","verify":"AUTO: footerDeadLinks / footerTotalLinks < 0.2"},
  {"id":"CC-041","category":"content","severity":"HIGH","title":"Privacy Policy link in footer","check":"footer a[href] text matches /privacy/i","verify":"AUTO: document.querySelectorAll('footer a') text scan"},
  {"id":"CC-042","category":"content","severity":"HIGH","title":"Terms link in footer","check":"footer a[href] text matches /terms/i","verify":"AUTO: document.querySelectorAll('footer a') text scan"},
  {"id":"CC-043","category":"content","severity":"MEDIUM","title":"Copyright year is current","check":"Footer text contains 2026 or dynamic new Date().getFullYear()","verify":"AUTO: grep footer innerText for current year"},
  {"id":"CC-044","category":"content","severity":"MEDIUM","title":"Social media links present","check":"At least one social icon/link visible in footer or header","verify":"VISUAL: Confirm at least one social link exists"},
  {"id":"CC-045","category":"content","severity":"HIGH","title":"Not all footer links dead","check":"footer dead-href ratio < 20%","verify":"AUTO: document.querySelectorAll('footer a[href=\"#\"]').length / document.querySelectorAll('footer a').length < 0.2"},
  {"id":"CC-050","category":"content","severity":"HIGH","title":"No &amp; in rendered text","check":"document.body.innerText does NOT contain '&amp;'","verify":"AUTO: Playwright innerText includes check"},
  {"id":"CC-051","category":"content","severity":"HIGH","title":"No &lt;/&gt; in rendered text","check":"document.body.innerText does NOT contain '&lt;' or '&gt;'","verify":"AUTO: Playwright innerText includes check"},
  {"id":"CC-052","category":"content","severity":"MEDIUM","title":"No numeric HTML entities visible","check":"document.body.innerText does NOT match /&#x?[0-9a-f]+;/i","verify":"AUTO: Playwright regex match on innerText"},
  {"id":"CC-053","category":"content","severity":"MEDIUM","title":"No literal &nbsp; rendered as text","check":"document.body.innerHTML does NOT contain literal '&amp;nbsp;' as visible text","verify":"AUTO: innerHTML scan for double-encoded entity"},
  {"id":"CC-060","category":"content","severity":"HIGH","title":"No spelling errors in h1–h3","check":"All h1–h3 text passes spell-check; no obvious typos","verify":"VISUAL: Extract all headings; run spell-check tool or manual read"},
  {"id":"CC-061","category":"content","severity":"LOW","title":"No full-paragraph ALL-CAPS","check":"Body paragraphs not set in all-caps","verify":"VISUAL: Scan body copy for all-caps paragraphs"},
  {"id":"CC-062","category":"content","severity":"HIGH","title":"h1 not generic","check":"h1 text does NOT match /^(home|page title|heading|title goes here)$/i","verify":"AUTO: document.querySelectorAll('h1') text check"},
  {"id":"CC-063","category":"content","severity":"MEDIUM","title":"Subheadings are distinct","check":"No three consecutive identical subheading strings","verify":"VISUAL: Read all h2/h3 elements for uniqueness"},
  {"id":"CC-070","category":"content","severity":"HIGH","title":"Product name capitalisation consistent","check":"All instances use same capitalisation form","verify":"VISUAL: Text search for all product name variants"},
  {"id":"CC-071","category":"content","severity":"LOW","title":"No mixed US/UK spelling","check":"Spelling variant is consistent with target region","verify":"VISUAL: Check colour/color, centre/center etc. in headings"},
  {"id":"CC-072","category":"content","severity":"MEDIUM","title":"Consistent tone throughout","check":"Body copy tone does not shift randomly formal↔casual","verify":"VISUAL: Read page top-to-bottom for tone consistency"},
  {"id":"CC-073","category":"content","severity":"MEDIUM","title":"Consistent brand voice (we/they)","check":"Brand referred to consistently in first or third person, not both","verify":"VISUAL: Grep for 'we'/'our' vs brand-name-only references"},
  {"id":"CC-080","category":"content","severity":"HIGH","title":"No verbatim duplicated sections","check":"No two section innerText blocks >50 chars are identical","verify":"AUTO: Map all sections to text; check Set size === array length"},
  {"id":"CC-081","category":"content","severity":"HIGH","title":"Feature cards have unique descriptions","check":"Feature card body text strings are all distinct (>20 chars)","verify":"AUTO: Extract card text; confirm all unique"},
  {"id":"CC-082","category":"content","severity":"MEDIUM","title":"Testimonials are unique","check":"Each testimonial quote is distinct and person-specific","verify":"VISUAL: Read all testimonials for uniqueness"},
  {"id":"CC-090","category":"content","severity":"CRITICAL","title":"No XX%/NNN placeholder stats","check":"document.body.innerText does NOT match /\\bXX%|\\b0{3,}\\b|NNN|###/","verify":"AUTO: Playwright regex on innerText"},
  {"id":"CC-091","category":"content","severity":"CRITICAL","title":"No $0 or $000 in pricing","check":"Pricing section text does NOT match /\\$0{2,}|\\$X+/i","verify":"AUTO: Pricing section innerText scan"},
  {"id":"CC-092","category":"content","severity":"HIGH","title":"Stats use real numbers","check":"All numeric claims are specific and plausible","verify":"VISUAL: Read all stat callouts; confirm real values"},
  {"id":"CC-093","category":"content","severity":"HIGH","title":"No date placeholders","check":"document.body.innerText does NOT match /Month DD, YYYY|MM\\/DD\\/YYYY/i","verify":"AUTO: Playwright regex on innerText"},
  {"id":"CC-100","category":"content","severity":"CRITICAL","title":"Contact/newsletter form has real fields","check":"Form contains at least input[type=email] or input[type=text] + submit button","verify":"VISUAL: Inspect any form present on page"},
  {"id":"CC-101","category":"content","severity":"HIGH","title":"Form submit not disabled by default","check":"form button[type=submit].disabled === false on page load","verify":"AUTO: document.querySelector('form button[type=submit]').disabled"},
  {"id":"CC-102","category":"content","severity":"CRITICAL","title":"Form action is real endpoint","check":"<form action> is NOT '#' or 'javascript:void(0)'","verify":"AUTO: document.querySelectorAll('form') action attribute check"},
  {"id":"CC-103","category":"content","severity":"HIGH","title":"Form has success/error feedback","check":"After submit, a success message or error state is shown","verify":"VISUAL: Trigger form submission; confirm feedback state appears"},
  {"id":"CC-110","category":"content","severity":"CRITICAL","title":"All brief sections exist","check":"Every section/feature listed in the creative brief is present on the page","verify":"VISUAL: Cross-reference brief line-by-line against live page"},
  {"id":"CC-111","category":"content","severity":"HIGH","title":"Requested integrations mentioned","check":"Named integrations/platforms from brief appear in features or compatibility section","verify":"VISUAL: Search page for each integration named in brief"},
  {"id":"CC-112","category":"content","severity":"HIGH","title":"Screenshots are real product UI","check":"No wireframe stubs, Figma frames, or grey-box mockups shipped as final","verify":"VISUAL: Inspect all product screenshots for real UI content"},
  {"id":"CC-113","category":"content","severity":"MEDIUM","title":"Demo/video embed present (if requested)","check":"If brief called for demo video, real <video> or embed exists","verify":"VISUAL: Confirm video element or embed is present and plays"}
]
```
