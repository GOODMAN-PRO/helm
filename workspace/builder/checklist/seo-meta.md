# SEO & Metadata Checklist — Next.js App Router (Marketing/Product Site)

**Scope:** Premium Next.js App Router marketing/product sites.  
**Format:** Binary PASS/FAIL. Each item carries AUTO (checkable in rendered HTML/network) or VISUAL (requires human judgment), plus severity.

**Severity tiers:**
- `critical` — will tank rankings or social previews; must fix before launch
- `high` — significant SEO/CTR impact; fix before launch
- `medium` — meaningful but not launch-blocking
- `low` — polish / best practice

---

## 1. Page Title

**ID:** `seo-title`  
**Type:** AUTO  
**Severity:** critical

**Check:**
```js
const t = document.title;
t.length > 0
&& t !== 'Create Next App'
&& t !== 'My App'
&& t !== 'Next.js App'
&& t.length >= 10
&& t.length <= 60
```

**Verify:** In a headless browser (or DevTools console), run the check above.  
Page title must be non-empty, not a Next.js/Vercel default boilerplate string, between 10 and 60 characters, and ideally contains the brand name and a keyword clause (e.g., `"Helm — AI Fleet Control Plane"`).

**PASS criteria:** All five conditions true.  
**FAIL criteria:** Any condition false — includes empty title, default scaffold text, or title > 60 chars.

---

## 2. Meta Description

**ID:** `seo-meta-description`  
**Type:** AUTO  
**Severity:** critical

**Check:**
```js
const el = document.querySelector('meta[name="description"]');
el !== null
&& el.content.trim().length >= 50
&& el.content.trim().length <= 160
```

**Verify:** `document.querySelector('meta[name="description"]').content.length` must be between 50 and 160.

**PASS criteria:** Tag present; content length in [50, 160].  
**FAIL criteria:** Tag missing, empty, < 50 chars (too terse), or > 160 chars (truncated in SERPs).

---

## 3. Open Graph — og:title

**ID:** `seo-og-title`  
**Type:** AUTO  
**Severity:** high

**Check:**
```js
const el = document.querySelector('meta[property="og:title"]');
el !== null && el.content.trim().length > 0
```

**Verify:** DevTools console or `curl -s <url> | grep og:title`.

**PASS criteria:** Tag present and non-empty.  
**FAIL criteria:** Tag absent or empty content.

---

## 4. Open Graph — og:description

**ID:** `seo-og-description`  
**Type:** AUTO  
**Severity:** high

**Check:**
```js
const el = document.querySelector('meta[property="og:description"]');
el !== null
&& el.content.trim().length >= 50
&& el.content.trim().length <= 200
```

**Verify:** Same as og:title approach.

**PASS criteria:** Tag present; length in [50, 200].  
**FAIL criteria:** Tag absent, too short, or too long.

---

## 5. Open Graph — og:image

**ID:** `seo-og-image`  
**Type:** AUTO  
**Severity:** critical

**Check (two-step):**
1. Tag present:
   ```js
   const el = document.querySelector('meta[property="og:image"]');
   el !== null && el.content.trim().length > 0
   ```
2. Image URL returns HTTP 200:
   ```bash
   curl -o /dev/null -s -w "%{http_code}" "<og:image content value>"
   # expect: 200
   ```

**Verify:** Extract `el.content`, then `fetch(el.content)` or `curl` it; confirm status 200 and a real image MIME type (`image/png`, `image/jpeg`, `image/webp`). Recommended size: 1200×630 px, ≤ 5 MB.

**PASS criteria:** Tag present, URL non-empty, URL returns 200 with image MIME type.  
**FAIL criteria:** Tag missing, broken URL, non-200 response, or wrong content type.

---

## 6. Open Graph — og:type

**ID:** `seo-og-type`  
**Type:** AUTO  
**Severity:** medium

**Check:**
```js
const el = document.querySelector('meta[property="og:type"]');
el !== null && ['website','article','product'].includes(el.content.trim())
```

**Verify:** DevTools console.

**PASS criteria:** Tag present with a recognised OG type value.  
**FAIL criteria:** Tag absent or value is empty/nonstandard.

---

## 7. Open Graph — og:url

**ID:** `seo-og-url`  
**Type:** AUTO  
**Severity:** high

**Check:**
```js
const el = document.querySelector('meta[property="og:url"]');
el !== null
&& /^https?:\/\/.+/.test(el.content.trim())
```

**Verify:** DevTools console. Value should match the page's canonical URL exactly.

**PASS criteria:** Tag present; value is a valid absolute HTTPS URL.  
**FAIL criteria:** Tag absent, empty, or relative path.

---

## 8. Twitter Card Tags

**ID:** `seo-twitter-card`  
**Type:** AUTO  
**Severity:** high

**Check (all four required):**
```js
const card  = document.querySelector('meta[name="twitter:card"]');
const title = document.querySelector('meta[name="twitter:title"]');
const desc  = document.querySelector('meta[name="twitter:description"]');
const img   = document.querySelector('meta[name="twitter:image"]');

card  !== null && ['summary','summary_large_image'].includes(card.content)
&& title !== null && title.content.trim().length > 0
&& desc  !== null && desc.content.trim().length > 0
&& img   !== null && img.content.trim().length > 0
```

**Verify:** All four selectors return non-null elements with non-empty content. For marketing sites `summary_large_image` is strongly preferred.

**PASS criteria:** All four tags present with valid values.  
**FAIL criteria:** Any tag missing or empty; `twitter:card` set to unknown value.

---

## 9. Twitter Image Loads

**ID:** `seo-twitter-image-loads`  
**Type:** AUTO  
**Severity:** high

**Check:**
```bash
curl -o /dev/null -s -w "%{http_code}" "$(document.querySelector('meta[name=\"twitter:image\"]').content)"
# expect: 200
```

**Verify:** Same pattern as og:image load check.

**PASS criteria:** HTTP 200 with image MIME type.  
**FAIL criteria:** 4xx, 5xx, or wrong content type.

---

## 10. Canonical URL

**ID:** `seo-canonical`  
**Type:** AUTO  
**Severity:** critical

**Check:**
```js
const el = document.querySelector('link[rel="canonical"]');
el !== null
&& /^https:\/\/.+/.test(el.href.trim())
&& !el.href.includes('localhost')
```

**Verify:** DevTools console. Canonical must be absolute HTTPS, point to the page's authoritative URL, and not contain localhost or staging domains in production.

**PASS criteria:** Tag present, href is absolute HTTPS, no localhost.  
**FAIL criteria:** Tag absent, relative href, HTTP scheme, or pointing to wrong domain.

---

## 11. Meta Viewport

**ID:** `seo-viewport`  
**Type:** AUTO  
**Severity:** critical

**Check:**
```js
const el = document.querySelector('meta[name="viewport"]');
el !== null
&& el.content.includes('width=device-width')
&& el.content.includes('initial-scale=1')
```

**Verify:** DevTools console.

**PASS criteria:** Tag present with `width=device-width` and `initial-scale=1`.  
**FAIL criteria:** Tag absent, missing either token, or sets `user-scalable=no` without accessibility justification.

---

## 12. html lang Attribute

**ID:** `seo-html-lang`  
**Type:** AUTO  
**Severity:** high

**Check:**
```js
const lang = document.documentElement.lang;
lang.trim().length >= 2
&& /^[a-z]{2}(-[A-Z]{2})?$/.test(lang.trim())
```

**Verify:** `document.documentElement.lang` — e.g. `"en"` or `"en-US"`.  
In Next.js App Router set via `export const metadata = { ... }` or `<html lang="en">` in the root `layout.tsx`.

**PASS criteria:** `lang` attribute present and matches a valid BCP 47 tag.  
**FAIL criteria:** Attribute absent, empty, or invalid value.

---

## 13. Favicon

**ID:** `seo-favicon`  
**Type:** AUTO  
**Severity:** high

**Check (two-step):**
1. Link tag present:
   ```js
   document.querySelector('link[rel="icon"]') !== null
   || document.querySelector('link[rel="shortcut icon"]') !== null
   ```
2. Favicon URL returns 200:
   ```bash
   curl -o /dev/null -s -w "%{http_code}" "<origin>/favicon.ico"
   # expect: 200
   ```

**Verify:** Both conditions. Next.js App Router auto-serves `app/favicon.ico`; also accept SVG favicon via `link[rel="icon"][type="image/svg+xml"]`.

**PASS criteria:** Link tag present AND /favicon.ico (or linked href) returns 200.  
**FAIL criteria:** Tag absent or URL 404s.

---

## 14. Apple Touch Icon

**ID:** `seo-apple-touch-icon`  
**Type:** AUTO  
**Severity:** medium

**Check:**
```js
const el = document.querySelector('link[rel="apple-touch-icon"]');
el !== null && el.href.trim().length > 0
```

**Verify:** DevTools console + `curl` the href returns 200. Recommended size: 180×180 px PNG.

**PASS criteria:** Tag present with valid href that returns 200.  
**FAIL criteria:** Tag absent or broken href.

---

## 15. Single H1 With Real Content

**ID:** `seo-h1`  
**Type:** AUTO  
**Severity:** critical

**Check:**
```js
const h1s = document.querySelectorAll('h1');
h1s.length === 1
&& h1s[0].textContent.trim().length >= 5
&& h1s[0].textContent.trim() !== 'Hello World'
&& h1s[0].textContent.trim() !== 'Welcome'
```

**Verify:** DevTools — `document.querySelectorAll('h1').length` must equal 1; text must be meaningful (≥ 5 chars, not a generic placeholder).

**PASS criteria:** Exactly one H1, non-empty, non-placeholder content.  
**FAIL criteria:** Zero H1s, more than one H1, or clearly placeholder text.

---

## 16. Semantic Heading Structure

**ID:** `seo-heading-hierarchy`  
**Type:** VISUAL  
**Severity:** medium

**Check (semi-AUTO):**
```js
const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
  .map(h => parseInt(h.tagName[1]));
// No level should skip more than 1 step upward
// e.g., h1→h3 with no h2 in between is a fail
```

**Verify:** Export heading levels array; manually confirm no skipped levels (h1 → h3 with no h2 is a fail). The automated check above can flag candidate violations; human judgment confirms.

**PASS criteria:** Heading levels increment by 1 (no skips); content reflects document outline.  
**FAIL criteria:** H1 → H3 gap, multiple unrelated H1s disguised as other levels, or headings used purely for styling.

---

## 17. robots.txt Present and Valid

**ID:** `seo-robots-txt`  
**Type:** AUTO  
**Severity:** critical

**Check:**
```bash
curl -s -o /dev/null -w "%{http_code}" https://<domain>/robots.txt
# expect: 200

curl -s https://<domain>/robots.txt | grep -i "user-agent"
# expect: at least one User-agent line present
```

**Verify:** `/robots.txt` must return HTTP 200 and contain at least one `User-agent:` directive. In Next.js App Router implement via `app/robots.ts` exporting a `MetadataRoute.Robots` object.

**PASS criteria:** 200 response, `User-agent` present, `Sitemap:` directive pointing to sitemap URL.  
**FAIL criteria:** 404, 500, or file that disallows all crawlers (`Disallow: /` for `User-agent: *`) on a production site.

---

## 18. sitemap.xml Present and Valid

**ID:** `seo-sitemap`  
**Type:** AUTO  
**Severity:** critical

**Check:**
```bash
curl -s -o /dev/null -w "%{http_code}" https://<domain>/sitemap.xml
# expect: 200

curl -s https://<domain>/sitemap.xml | grep -c "<url>"
# expect: >= 1
```

**Verify:** `GET /sitemap.xml` returns 200 with valid XML containing at least one `<url>` entry. In Next.js App Router implement via `app/sitemap.ts` returning a `MetadataRoute.Sitemap` array.

**PASS criteria:** 200 response, valid XML, ≥ 1 `<url>` entry with `<loc>` child.  
**FAIL criteria:** 404, malformed XML, or empty sitemap.

---

## 19. Structured Data / JSON-LD Present

**ID:** `seo-jsonld`  
**Type:** AUTO  
**Severity:** medium

**Check:**
```js
const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
scripts.length >= 1
&& scripts.every(s => {
  try { JSON.parse(s.textContent); return true; }
  catch { return false; }
})
```

**Verify:** DevTools console — at least one valid JSON-LD script block must exist. For marketing/product sites minimum recommended schema: `WebSite` or `Organization`. Validate at https://validator.schema.org.

**PASS criteria:** ≥ 1 `<script type="application/ld+json">` present, parses as valid JSON, contains `@context` and `@type`.  
**FAIL criteria:** No JSON-LD blocks, or blocks that fail JSON.parse.

---

## 20. No Accidental noindex

**ID:** `seo-noindex`  
**Type:** AUTO  
**Severity:** critical

**Check (two vectors):**
```js
// 1. Meta robots tag
const el = document.querySelector('meta[name="robots"]');
const hasNoindex = el && el.content.toLowerCase().includes('noindex');
hasNoindex === false

// 2. X-Robots-Tag response header
// Run: curl -I https://<domain>/ | grep -i x-robots-tag
// Must NOT contain "noindex"
```

**Verify:** Both checks. Catch cases where `noindex` is set globally via `generateMetadata` defaults or middleware headers.

**PASS criteria:** No `noindex` in meta robots and no `noindex` in X-Robots-Tag header.  
**FAIL criteria:** Either vector contains `noindex` on a page intended to be indexed.

---

## 21. Images Have Alt Text

**ID:** `seo-img-alt`  
**Type:** AUTO  
**Severity:** high

**Check:**
```js
const imgs = [...document.querySelectorAll('img')];
const missing = imgs.filter(img =>
  img.getAttribute('alt') === null          // attr absent
  // Note: alt="" is valid for decorative images; only flag null
);
missing.length === 0
```

**Verify:** `document.querySelectorAll('img:not([alt])')` must return zero elements. Decorative images must have `alt=""` (empty string); informational images must have descriptive text.

**PASS criteria:** Every `<img>` has an `alt` attribute (may be empty for decorative).  
**FAIL criteria:** Any `<img>` missing the `alt` attribute entirely.

---

## 22. Alt Text Is Descriptive (Not Generic)

**ID:** `seo-img-alt-quality`  
**Type:** VISUAL  
**Severity:** medium

**Check (semi-AUTO):**
```js
const imgs = [...document.querySelectorAll('img[alt]')];
const generic = imgs.filter(img =>
  ['image','photo','picture','img','graphic','icon','logo','banner','hero','untitled']
    .includes(img.alt.trim().toLowerCase())
);
generic.length === 0
```

**Verify:** The automated check flags obvious generic alt text; human review confirms remaining alts are contextually meaningful.

**PASS criteria:** No obviously generic alt text; image alts describe purpose or content.  
**FAIL criteria:** Alt text is a filename, "image", "photo", or other non-descriptive filler.

---

## 23. Descriptive Link Text

**ID:** `seo-link-text`  
**Type:** VISUAL  
**Severity:** medium

**Check (semi-AUTO):**
```js
const links = [...document.querySelectorAll('a')];
const bad = links.filter(a => {
  const t = a.textContent.trim().toLowerCase();
  return ['click here','here','read more','more','learn more','this','link'].includes(t);
});
bad.length === 0
```

**Verify:** Zero links with purely generic anchor text. Some "Learn more" instances are acceptable if paired with an `aria-label` that disambiguates.

**PASS criteria:** No links with exclusively generic text without accompanying accessible label.  
**FAIL criteria:** Multiple bare "click here" or "read more" anchors with no `aria-label`.

---

## 24. generateMetadata Used (Not Hardcoded Defaults)

**ID:** `seo-generate-metadata`  
**Type:** AUTO  
**Severity:** high

**Check:**
```bash
# In codebase (not runtime HTML):
grep -r "generateMetadata\|export const metadata" app/ --include="*.ts" --include="*.tsx" | wc -l
# expect: >= 1 (at minimum in app/layout.tsx or app/page.tsx)

grep -r "Create Next App\|create-next-app" app/ --include="*.ts" --include="*.tsx"
# expect: 0 matches (boilerplate not present)
```

**Verify:** At least one `export const metadata` or `export async function generateMetadata` exists in the app directory. No scaffold boilerplate strings remain in metadata objects.

**PASS criteria:** `generateMetadata` or `metadata` export found; zero boilerplate strings in metadata.  
**FAIL criteria:** Only `<Head>` tags (Pages Router pattern), no metadata export, or boilerplate strings present.

---

## 25. Social Preview Image Dimensions & File Size

**ID:** `seo-og-image-dimensions`  
**Type:** AUTO  
**Severity:** high

**Check:**
```bash
# Download og:image and check dimensions
OG_URL=$(curl -s <page-url> | grep -oP '(?<=og:image" content=")[^"]+')
curl -s "$OG_URL" -o /tmp/og-check.img
file /tmp/og-check.img   # confirm image type
identify /tmp/og-check.img  # ImageMagick: confirm 1200x630 (or min 600x315)
wc -c /tmp/og-check.img  # confirm < 5242880 bytes (5 MB)
```

**Verify:** Image is at minimum 600×315 px (recommended 1200×630), aspect ratio ~1.91:1, and ≤ 5 MB. Twitter requires ≤ 5 MB for `summary_large_image`.

**PASS criteria:** Width ≥ 600, height ≥ 315, ratio ≈ 1.91:1, size ≤ 5 MB.  
**FAIL criteria:** Image too small (will be letterboxed or rejected), wrong aspect ratio, or over 5 MB.

---

## 26. Social Preview Image Visual Quality

**ID:** `seo-og-image-visual`  
**Type:** VISUAL  
**Severity:** high

**Check:** Open the OG image URL directly in a browser and evaluate:
- Contains brand name or logo
- Contains meaningful title text (not just a blank gradient)
- Text is legible at thumbnail scale (test in Twitter Card Validator)
- No obviously broken layout or missing assets

**Verify:** Use [Twitter Card Validator](https://cards-dev.twitter.com/validator) or [OpenGraph.xyz](https://www.opengraph.xyz) to preview exactly how the card renders on social platforms.

**PASS criteria:** Image renders with brand identity, readable text, no broken elements.  
**FAIL criteria:** Blank image, placeholder text, unreadable text, or missing brand elements.

---

## Summary Table

| # | ID | Severity | Type | Description |
|---|-----|----------|------|-------------|
| 1 | seo-title | critical | AUTO | Page title non-default, 10–60 chars |
| 2 | seo-meta-description | critical | AUTO | Meta description 50–160 chars |
| 3 | seo-og-title | high | AUTO | og:title present and non-empty |
| 4 | seo-og-description | high | AUTO | og:description 50–200 chars |
| 5 | seo-og-image | critical | AUTO | og:image present and URL returns 200 |
| 6 | seo-og-type | medium | AUTO | og:type has valid value |
| 7 | seo-og-url | high | AUTO | og:url absolute HTTPS URL |
| 8 | seo-twitter-card | high | AUTO | All four twitter: tags present |
| 9 | seo-twitter-image-loads | high | AUTO | twitter:image URL returns 200 |
| 10 | seo-canonical | critical | AUTO | Canonical HTTPS, no localhost |
| 11 | seo-viewport | critical | AUTO | viewport has width=device-width + initial-scale=1 |
| 12 | seo-html-lang | high | AUTO | html lang is valid BCP 47 |
| 13 | seo-favicon | high | AUTO | Favicon link tag + /favicon.ico returns 200 |
| 14 | seo-apple-touch-icon | medium | AUTO | apple-touch-icon link present and loads |
| 15 | seo-h1 | critical | AUTO | Exactly one H1, meaningful content |
| 16 | seo-heading-hierarchy | medium | VISUAL | No skipped heading levels |
| 17 | seo-robots-txt | critical | AUTO | /robots.txt returns 200, has User-agent |
| 18 | seo-sitemap | critical | AUTO | /sitemap.xml returns 200, has <url> |
| 19 | seo-jsonld | medium | AUTO | JSON-LD script block present and valid |
| 20 | seo-noindex | critical | AUTO | No noindex in meta or X-Robots-Tag |
| 21 | seo-img-alt | high | AUTO | All <img> have alt attribute |
| 22 | seo-img-alt-quality | medium | VISUAL | Alt text not generic |
| 23 | seo-link-text | medium | VISUAL | No bare "click here" anchors |
| 24 | seo-generate-metadata | high | AUTO | generateMetadata used, no boilerplate |
| 25 | seo-og-image-dimensions | high | AUTO | OG image ≥ 600×315, ≤ 5 MB |
| 26 | seo-og-image-visual | high | VISUAL | OG image has brand + readable text |

**Totals:** 26 items — 21 AUTO, 5 VISUAL. Critical: 9 | High: 11 | Medium: 6 | Low: 0.

---

## Machine-readable items

```json
[
  {
    "id": "seo-title",
    "category": "seo",
    "severity": "critical",
    "title": "Page title is non-default and meaningful",
    "check": "AUTO",
    "verify": "document.title is non-empty, != 'Create Next App', length between 10 and 60"
  },
  {
    "id": "seo-meta-description",
    "category": "seo",
    "severity": "critical",
    "title": "Meta description present with valid length",
    "check": "AUTO",
    "verify": "document.querySelector('meta[name=\"description\"]').content.length between 50 and 160"
  },
  {
    "id": "seo-og-title",
    "category": "seo",
    "severity": "high",
    "title": "og:title present and non-empty",
    "check": "AUTO",
    "verify": "document.querySelector('meta[property=\"og:title\"]') !== null and content.trim().length > 0"
  },
  {
    "id": "seo-og-description",
    "category": "seo",
    "severity": "high",
    "title": "og:description present with valid length",
    "check": "AUTO",
    "verify": "document.querySelector('meta[property=\"og:description\"]').content.length between 50 and 200"
  },
  {
    "id": "seo-og-image",
    "category": "seo",
    "severity": "critical",
    "title": "og:image present and URL returns HTTP 200",
    "check": "AUTO",
    "verify": "meta[property='og:image'] exists and non-empty; curl og:image URL returns 200 with image MIME type"
  },
  {
    "id": "seo-og-type",
    "category": "seo",
    "severity": "medium",
    "title": "og:type set to a valid Open Graph type",
    "check": "AUTO",
    "verify": "document.querySelector('meta[property=\"og:type\"]').content in ['website','article','product']"
  },
  {
    "id": "seo-og-url",
    "category": "seo",
    "severity": "high",
    "title": "og:url is an absolute HTTPS URL",
    "check": "AUTO",
    "verify": "document.querySelector('meta[property=\"og:url\"]').content matches /^https:\\/\\/.+/"
  },
  {
    "id": "seo-twitter-card",
    "category": "seo",
    "severity": "high",
    "title": "All four twitter: card meta tags present",
    "check": "AUTO",
    "verify": "meta[name='twitter:card'], meta[name='twitter:title'], meta[name='twitter:description'], meta[name='twitter:image'] all present and non-empty"
  },
  {
    "id": "seo-twitter-image-loads",
    "category": "seo",
    "severity": "high",
    "title": "twitter:image URL returns HTTP 200",
    "check": "AUTO",
    "verify": "curl meta[name='twitter:image'] content URL returns 200 with image MIME type"
  },
  {
    "id": "seo-canonical",
    "category": "seo",
    "severity": "critical",
    "title": "Canonical URL present, absolute HTTPS, no localhost",
    "check": "AUTO",
    "verify": "document.querySelector('link[rel=\"canonical\"]').href matches /^https:\\/\\// and does not include 'localhost'"
  },
  {
    "id": "seo-viewport",
    "category": "seo",
    "severity": "critical",
    "title": "Meta viewport has width=device-width and initial-scale=1",
    "check": "AUTO",
    "verify": "document.querySelector('meta[name=\"viewport\"]').content includes 'width=device-width' and 'initial-scale=1'"
  },
  {
    "id": "seo-html-lang",
    "category": "seo",
    "severity": "high",
    "title": "html lang attribute is a valid BCP 47 tag",
    "check": "AUTO",
    "verify": "document.documentElement.lang matches /^[a-z]{2}(-[A-Z]{2})?$/ and length >= 2"
  },
  {
    "id": "seo-favicon",
    "category": "seo",
    "severity": "high",
    "title": "Favicon link tag present and /favicon.ico returns 200",
    "check": "AUTO",
    "verify": "link[rel='icon'] or link[rel='shortcut icon'] present; fetch /favicon.ico returns 200"
  },
  {
    "id": "seo-apple-touch-icon",
    "category": "seo",
    "severity": "medium",
    "title": "apple-touch-icon link present and href returns 200",
    "check": "AUTO",
    "verify": "document.querySelector('link[rel=\"apple-touch-icon\"]') !== null; curl href returns 200"
  },
  {
    "id": "seo-h1",
    "category": "seo",
    "severity": "critical",
    "title": "Exactly one H1 with meaningful content",
    "check": "AUTO",
    "verify": "document.querySelectorAll('h1').length === 1 and textContent.trim().length >= 5 and not a placeholder string"
  },
  {
    "id": "seo-heading-hierarchy",
    "category": "seo",
    "severity": "medium",
    "title": "Semantic heading hierarchy with no skipped levels",
    "check": "VISUAL",
    "verify": "Extract heading level sequence from DOM; confirm no level skips > 1 step (e.g., h1 directly to h3)"
  },
  {
    "id": "seo-robots-txt",
    "category": "seo",
    "severity": "critical",
    "title": "/robots.txt returns 200 and contains User-agent directive",
    "check": "AUTO",
    "verify": "fetch /robots.txt returns 200; response body contains 'User-agent:'; Sitemap: directive present; production does not have Disallow: / for *"
  },
  {
    "id": "seo-sitemap",
    "category": "seo",
    "severity": "critical",
    "title": "/sitemap.xml returns 200 with valid XML and at least one <url>",
    "check": "AUTO",
    "verify": "fetch /sitemap.xml returns 200; XML parses successfully; contains >= 1 <url><loc> entry"
  },
  {
    "id": "seo-jsonld",
    "category": "seo",
    "severity": "medium",
    "title": "At least one valid JSON-LD structured data block present",
    "check": "AUTO",
    "verify": "document.querySelectorAll('script[type=\"application/ld+json\"]').length >= 1; each block parses as valid JSON with @context and @type"
  },
  {
    "id": "seo-noindex",
    "category": "seo",
    "severity": "critical",
    "title": "No accidental noindex in meta robots or X-Robots-Tag header",
    "check": "AUTO",
    "verify": "meta[name='robots'].content does not include 'noindex'; curl -I response X-Robots-Tag header does not include 'noindex'"
  },
  {
    "id": "seo-img-alt",
    "category": "seo",
    "severity": "high",
    "title": "All <img> elements have an alt attribute",
    "check": "AUTO",
    "verify": "document.querySelectorAll('img:not([alt])').length === 0"
  },
  {
    "id": "seo-img-alt-quality",
    "category": "seo",
    "severity": "medium",
    "title": "Image alt text is descriptive (not generic)",
    "check": "VISUAL",
    "verify": "No img alt equals 'image', 'photo', 'picture', 'img', 'graphic', 'icon', 'logo', 'banner', 'hero', 'untitled', or a bare filename"
  },
  {
    "id": "seo-link-text",
    "category": "seo",
    "severity": "medium",
    "title": "Links use descriptive anchor text (no bare 'click here')",
    "check": "VISUAL",
    "verify": "No <a> with textContent in ['click here','here','read more','more','learn more','this','link'] without an aria-label override"
  },
  {
    "id": "seo-generate-metadata",
    "category": "seo",
    "severity": "high",
    "title": "Next.js generateMetadata used; no scaffold boilerplate in metadata",
    "check": "AUTO",
    "verify": "grep -r 'generateMetadata|export const metadata' app/ returns >= 1 result; grep for 'Create Next App' returns 0 results"
  },
  {
    "id": "seo-og-image-dimensions",
    "category": "seo",
    "severity": "high",
    "title": "OG image is ≥ 600×315 px, aspect ratio ~1.91:1, and ≤ 5 MB",
    "check": "AUTO",
    "verify": "Download og:image; confirm width >= 600, height >= 315, file size <= 5242880 bytes, aspect ratio ~1.91:1"
  },
  {
    "id": "seo-og-image-visual",
    "category": "seo",
    "severity": "high",
    "title": "OG image contains brand identity and readable text",
    "check": "VISUAL",
    "verify": "Open og:image URL directly; confirm brand name/logo visible, title text legible at thumbnail scale; validate via Twitter Card Validator or opengraph.xyz"
  }
]
```
