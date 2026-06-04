# Assets & Media Checklist

Scope: every loadable resource on a production Next.js site.  
Two verdicts only: **PASS** or **FAIL**.  
`AUTO` = can be verified with Playwright/code. `VISUAL` = requires a human eye.

---

## AM-01 · No broken `<img>` or `next/image` elements
**Severity:** CRITICAL  
**Mode:** AUTO  

Every `<img>` in the DOM (including those rendered by `next/image` as `<img>`) must have loaded successfully.

**Exact check:**
```js
// Playwright
const broken = await page.evaluate(() =>
  Array.from(document.images).filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src)
);
expect(broken).toHaveLength(0);
```

**PASS:** `broken` array is empty.  
**FAIL:** Any image returns with `naturalWidth === 0` or `complete === false`.

---

## AM-02 · No 404 / network errors for any resource
**Severity:** CRITICAL  
**Mode:** AUTO  

Collect all network responses during page load. No request should return HTTP 4xx or 5xx.

**Exact check:**
```js
// Playwright
const failures = [];
page.on('response', res => {
  if (res.status() >= 400) failures.push({ url: res.url(), status: res.status() });
});
await page.goto(URL, { waitUntil: 'networkidle' });
expect(failures).toHaveLength(0);
```

**PASS:** `failures` is empty.  
**FAIL:** Any resource (image, font, script, CSS, video, .glb, .gltf, .hdr, .json, etc.) returns 400+.

---

## AM-03 · No broken CSS background-images
**Severity:** HIGH  
**Mode:** AUTO + VISUAL  

Background images defined in `background-image` CSS rules must resolve and render.

**Exact check (AUTO — detects 404 via network log, see AM-02):**
```js
// Playwright — extract all background-image URLs from computed styles
const bgUrls = await page.evaluate(() => {
  const urls = [];
  document.querySelectorAll('*').forEach(el => {
    const bg = getComputedStyle(el).backgroundImage;
    const match = bg.match(/url\(["']?([^"')]+)["']?\)/g);
    if (match) match.forEach(m => urls.push(m.replace(/url\(["']?|["']?\)/g, '')));
  });
  return [...new Set(urls)];
});
// Then fetch each URL and expect status < 400
for (const url of bgUrls) {
  const res = await page.request.get(url);
  expect(res.status()).toBeLessThan(400);
}
```

**PASS:** All `background-image` URLs resolve with status < 400.  
**FAIL:** Any URL returns 400+, or VISUAL: background area renders as a blank/missing region.

---

## AM-04 · Fonts actually load — no FOIT / fallback-only text
**Severity:** HIGH  
**Mode:** AUTO + VISUAL  

`document.fonts.ready` must resolve and every font family declared in CSS must appear in the loaded set.

**Exact check:**
```js
// Playwright
const fontStatus = await page.evaluate(async () => {
  await document.fonts.ready;
  return Array.from(document.fonts).map(f => ({ family: f.family, status: f.status }));
});
const notLoaded = fontStatus.filter(f => f.status !== 'loaded');
expect(notLoaded).toHaveLength(0);
```

**PASS:** Every `FontFace` entry has `status === 'loaded'`.  
**FAIL:** Any entry has `status === 'error'` or `'unloaded'`; or VISUAL: text renders in system fallback (e.g. Times New Roman where a sans-serif was intended).

---

## AM-05 · `next/font` used for all custom fonts (no layout shift)
**Severity:** HIGH  
**Mode:** AUTO  

Font definitions must go through `next/font` (or equivalent font-display strategy) to prevent CLS. Verify no raw `@font-face` with `font-display: auto` or missing `font-display` in loaded stylesheets.

**Exact check:**
```js
// Playwright
const badFontFaces = await page.evaluate(() => {
  const issues = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.type === CSSRule.FONT_FACE_RULE) {
          const display = rule.style.getPropertyValue('font-display');
          if (!display || display === 'auto') issues.push(rule.cssText.slice(0, 100));
        }
      }
    } catch (_) {}
  }
  return issues;
});
expect(badFontFaces).toHaveLength(0);
```

**PASS:** All `@font-face` rules include `font-display: swap` (or `optional`/`block` where intentional).  
**FAIL:** Any `@font-face` without an explicit `font-display`, indicating raw font injection outside `next/font`.

---

## AM-06 · `<video>` elements load and have a poster
**Severity:** HIGH  
**Mode:** AUTO + VISUAL  

Every `<video>` must have a `poster` attribute and its `src` (or first `<source>`) must return HTTP 200.

**Exact check:**
```js
// Playwright
const videoIssues = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('video')).map(v => ({
    hasPoster: !!v.poster,
    src: v.src || v.querySelector('source')?.src || '',
    readyState: v.readyState,
    error: v.error?.code ?? null
  }));
});
const broken = videoIssues.filter(v => !v.hasPoster || v.error !== null);
expect(broken).toHaveLength(0);
// Also covered by AM-02 network log for 404s on video src
```

**PASS:** Every `<video>` has a non-empty `poster`, `error` is `null`, and video src returns 200.  
**FAIL:** Missing poster; `video.error` is set; or video src 404s.

---

## AM-07 · 3D assets (.glb / .gltf / .hdr) load without 404 or CORS errors
**Severity:** HIGH  
**Mode:** AUTO  

Any 3D scene assets must load. CORS errors appear in `page.on('console')` as errors or in failed preflight responses.

**Exact check:**
```js
// Playwright
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
const networkFails = [];
page.on('response', res => { if (res.status() >= 400) networkFails.push(res.url()); });

await page.goto(URL, { waitUntil: 'networkidle' });

const glbErrors = networkFails.filter(u => /\.(glb|gltf|hdr|bin)$/i.test(u));
expect(glbErrors).toHaveLength(0);

const corsErrors = consoleErrors.filter(e => /cors|cross.?origin|no.?access.?control/i.test(e));
expect(corsErrors).toHaveLength(0);
```

**PASS:** No .glb/.gltf/.hdr/.bin 404s; no CORS console errors.  
**FAIL:** Any 3D asset returns 400+ or triggers a CORS policy error in console.

---

## AM-08 · Favicon loads (all required sizes)
**Severity:** MEDIUM  
**Mode:** AUTO  

`/favicon.ico`, and any `<link rel="icon">` / `<link rel="apple-touch-icon">` hrefs must return HTTP 200.

**Exact check:**
```js
// Playwright
const faviconLinks = await page.evaluate(() => {
  const links = Array.from(document.querySelectorAll('link[rel*="icon"]')).map(l => l.href);
  return links;
});
faviconLinks.push(new URL('/favicon.ico', page.url()).href);

for (const url of [...new Set(faviconLinks)]) {
  const res = await page.request.get(url);
  expect(res.status()).toBeLessThan(400);
}
```

**PASS:** `/favicon.ico` + all `<link rel="icon">` + all `<link rel="apple-touch-icon">` hrefs return 200.  
**FAIL:** Any favicon URL returns 404; or `<link rel="apple-touch-icon">` is missing entirely from `<head>`.

---

## AM-09 · Images have explicit `width` / `height` or a `sizes` prop (no CLS)
**Severity:** HIGH  
**Mode:** AUTO  

Every `<img>` must have intrinsic dimensions declared (either HTML `width`/`height` or `sizes` for responsive images) to prevent cumulative layout shift.

**Exact check:**
```js
// Playwright
const clsCandidates = await page.evaluate(() =>
  Array.from(document.images).filter(img => {
    const hasWH = img.hasAttribute('width') && img.hasAttribute('height');
    const hasSizes = img.hasAttribute('sizes');
    const hasAspectRatio = getComputedStyle(img).aspectRatio !== 'auto';
    return !hasWH && !hasSizes && !hasAspectRatio;
  }).map(img => img.src)
);
expect(clsCandidates).toHaveLength(0);
```

**PASS:** All `<img>` elements have `width` + `height`, or `sizes`, or a CSS `aspect-ratio`.  
**FAIL:** Any image lacking intrinsic size hints — causes layout shift on load.

---

## AM-10 · SVGs render visibly
**Severity:** MEDIUM  
**Mode:** AUTO + VISUAL  

Inline SVGs and `<img src="*.svg">` must have non-zero rendered dimensions.

**Exact check:**
```js
// Playwright
const brokenSvgs = await page.evaluate(() => {
  const inlineSvgs = Array.from(document.querySelectorAll('svg')).filter(s => {
    const r = s.getBoundingClientRect();
    return r.width === 0 || r.height === 0;
  }).map(s => s.outerHTML.slice(0, 80));

  const imgSvgs = Array.from(document.images)
    .filter(i => i.src.endsWith('.svg') && (i.naturalWidth === 0 || !i.complete))
    .map(i => i.src);

  return [...inlineSvgs, ...imgSvgs];
});
expect(brokenSvgs).toHaveLength(0);
```

**PASS:** All SVG elements have non-zero bounding rect; all `<img src="*.svg">` are complete with `naturalWidth > 0`.  
**FAIL:** Any SVG renders as a zero-size box or fails to load.

---

## AM-11 · No placeholder / unverified external image URLs (e.g. random Unsplash IDs)
**Severity:** HIGH  
**Mode:** AUTO + VISUAL  

Placeholder services (`picsum.photos`, `via.placeholder.com`, `loremflickr.com`, `placeimg.com`) or random Unsplash photo IDs (`images.unsplash.com/photo-<random>`) must not appear in production. Self-hosted images or verified CDN slugs are required.

**Exact check:**
```js
// Playwright
const PLACEHOLDER_PATTERNS = [
  /picsum\.photos/,
  /via\.placeholder\.com/,
  /loremflickr\.com/,
  /placeimg\.com/,
  /dummyimage\.com/,
  /images\.unsplash\.com\/photo-[a-f0-9]{10,}/,
];

const suspiciousSrcs = await page.evaluate(() =>
  [
    ...Array.from(document.images).map(i => i.src),
    ...Array.from(document.querySelectorAll('[style]'))
      .map(el => getComputedStyle(el).backgroundImage)
      .filter(bg => bg !== 'none')
  ]
);

const hits = suspiciousSrcs.filter(src =>
  PLACEHOLDER_PATTERNS.some(re => re.test(src))
);
expect(hits).toHaveLength(0);
```

**PASS:** No placeholder service URLs found in image srcs or background-image values.  
**FAIL:** Any placeholder URL detected — these can change or 404 without warning.

---

## AM-12 · All images have a non-empty `alt` attribute
**Severity:** MEDIUM  
**Mode:** AUTO  

(Full a11y audit is separate; this item only gates whether `alt` is present.)

**Exact check:**
```js
// Playwright
const missingAlt = await page.evaluate(() =>
  Array.from(document.images)
    .filter(i => !i.hasAttribute('alt'))
    .map(i => i.src)
);
expect(missingAlt).toHaveLength(0);
```

**PASS:** Every `<img>` has an `alt` attribute (empty string `alt=""` is acceptable for decorative images).  
**FAIL:** Any `<img>` has no `alt` attribute at all.

---

## AM-13 · No console errors from media / asset loading
**Severity:** HIGH  
**Mode:** AUTO  

Console `error` messages caused by failed resource loads, decode errors, or WebGL failures indicate broken assets.

**Exact check:**
```js
// Playwright
const assetErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') {
    const text = msg.text();
    if (/failed to load|net::err|decode error|not found|404|webgl|three\.js|texture/i.test(text)) {
      assetErrors.push(text);
    }
  }
});
await page.goto(URL, { waitUntil: 'networkidle' });
expect(assetErrors).toHaveLength(0);
```

**PASS:** Zero asset-related console errors after full page load.  
**FAIL:** Any `console.error` matching asset/network/WebGL failure patterns.

---

## AM-14 · JSON data files load (no 404)
**Severity:** HIGH  
**Mode:** AUTO  

All `.json` files fetched at runtime (config, content, i18n, etc.) must return HTTP 200 with valid JSON.

**Exact check:**
```js
// Playwright — covered by AM-02 for 404s; additionally validate content-type
const jsonFails = [];
page.on('response', async res => {
  const url = res.url();
  if (url.endsWith('.json') || res.headers()['content-type']?.includes('application/json')) {
    try {
      await res.json(); // throws if not valid JSON
    } catch {
      jsonFails.push(url);
    }
    if (res.status() >= 400) jsonFails.push(url);
  }
});
await page.goto(URL, { waitUntil: 'networkidle' });
expect(jsonFails).toHaveLength(0);
```

**PASS:** Every JSON request returns 200 and is parseable.  
**FAIL:** Any JSON request 404s or returns unparseable body.

---

## AM-15 · Open Graph / meta image loads
**Severity:** MEDIUM  
**Mode:** AUTO  

The `og:image` and `twitter:image` meta tags must point to a resolvable URL.

**Exact check:**
```js
// Playwright
const ogImage = await page.$eval(
  'meta[property="og:image"]',
  el => el.content
).catch(() => null);

if (ogImage) {
  const res = await page.request.get(ogImage);
  expect(res.status()).toBeLessThan(400);
}

const twitterImage = await page.$eval(
  'meta[name="twitter:image"]',
  el => el.content
).catch(() => null);

if (twitterImage) {
  const res = await page.request.get(twitterImage);
  expect(res.status()).toBeLessThan(400);
}
```

**PASS:** Both `og:image` and `twitter:image` (if present) resolve with status < 400.  
**FAIL:** Either meta image URL returns 404 or is absent when it should be present.

---

## AM-16 · Image formats are modern (WebP / AVIF) — no unoptimized PNGs/JPEGs for hero/large images
**Severity:** LOW  
**Mode:** AUTO  

`next/image` auto-converts to WebP/AVIF by default. Verify the actual network responses for image requests deliver WebP or AVIF content-type for images above 10 KB.

**Exact check:**
```js
// Playwright
const unoptimizedLargeImages = [];
page.on('response', async res => {
  const url = res.url();
  const ct = res.headers()['content-type'] || '';
  const isImg = ct.startsWith('image/') || /\.(png|jpg|jpeg)$/i.test(url);
  if (isImg && !ct.includes('webp') && !ct.includes('avif')) {
    const buf = await res.body().catch(() => null);
    if (buf && buf.length > 10_000) {
      unoptimizedLargeImages.push({ url, ct, size: buf.length });
    }
  }
});
await page.goto(URL, { waitUntil: 'networkidle' });
expect(unoptimizedLargeImages).toHaveLength(0);
```

**PASS:** All images > 10 KB are served as WebP or AVIF.  
**FAIL:** Large images served as raw PNG or JPEG — missed `next/image` optimization.

---

## AM-17 · No mixed-content (HTTP resources on HTTPS page)
**Severity:** CRITICAL  
**Mode:** AUTO  

All assets on an HTTPS page must also be HTTPS. Mixed content is blocked by browsers and causes silent asset failure.

**Exact check:**
```js
// Playwright
const mixedContent = [];
page.on('request', req => {
  if (page.url().startsWith('https://') && req.url().startsWith('http://')) {
    mixedContent.push(req.url());
  }
});
await page.goto(URL, { waitUntil: 'networkidle' });
expect(mixedContent).toHaveLength(0);
```

**PASS:** No HTTP requests on an HTTPS page.  
**FAIL:** Any asset loaded over plain HTTP — blocked or degraded by browsers.

---

## AM-18 · Asset CDN/origin responds within acceptable latency
**Severity:** MEDIUM  
**Mode:** AUTO  

Key assets (LCP image, primary font, hero video poster) should respond with TTFB < 600 ms. Slower assets degrade perceived load.

**Exact check:**
```js
// Playwright — use CDP performance timing or response timing
const slowAssets = [];
page.on('response', async res => {
  const timing = res.timing();
  if (timing && timing.responseStart - timing.requestStart > 600) {
    const ct = res.headers()['content-type'] || '';
    if (/image|font|video/.test(ct)) {
      slowAssets.push({ url: res.url(), ttfb: timing.responseStart - timing.requestStart });
    }
  }
});
await page.goto(URL, { waitUntil: 'networkidle' });
expect(slowAssets).toHaveLength(0);
```

**PASS:** All image/font/video assets have TTFB < 600 ms.  
**FAIL:** Any key media asset TTFB > 600 ms — investigate CDN caching or origin latency.

---

## Machine-readable items

```json
[
  {
    "id": "AM-01",
    "category": "assets",
    "severity": "critical",
    "title": "No broken <img> or next/image elements",
    "check": "AUTO",
    "verify": "Array.from(document.images).filter(i => !i.complete || i.naturalWidth === 0) — expect empty array"
  },
  {
    "id": "AM-02",
    "category": "assets",
    "severity": "critical",
    "title": "No 404 / network errors for any resource",
    "check": "AUTO",
    "verify": "page.on('response') collect status >= 400 — expect empty array after networkidle"
  },
  {
    "id": "AM-03",
    "category": "assets",
    "severity": "high",
    "title": "No broken CSS background-images",
    "check": "AUTO+VISUAL",
    "verify": "Extract all background-image URLs from computed styles, fetch each, expect status < 400; visual check for blank background areas"
  },
  {
    "id": "AM-04",
    "category": "assets",
    "severity": "high",
    "title": "Fonts actually load — no FOIT / fallback-only text",
    "check": "AUTO+VISUAL",
    "verify": "await document.fonts.ready; Array.from(document.fonts).every(f => f.status === 'loaded') — expect true"
  },
  {
    "id": "AM-05",
    "category": "assets",
    "severity": "high",
    "title": "next/font used — no raw @font-face without font-display",
    "check": "AUTO",
    "verify": "Iterate cssRules for CSSFontFaceRule; expect every rule has explicit font-display: swap/optional/block"
  },
  {
    "id": "AM-06",
    "category": "assets",
    "severity": "high",
    "title": "<video> elements load and have poster attribute",
    "check": "AUTO+VISUAL",
    "verify": "document.querySelectorAll('video') — each must have .poster non-empty and .error === null"
  },
  {
    "id": "AM-07",
    "category": "assets",
    "severity": "high",
    "title": "3D assets (.glb/.gltf/.hdr) load — no 404 or CORS errors",
    "check": "AUTO",
    "verify": "Network failures filtered for /\\.(glb|gltf|hdr|bin)$/i must be empty; console errors matching /cors|cross.?origin/ must be empty"
  },
  {
    "id": "AM-08",
    "category": "assets",
    "severity": "medium",
    "title": "Favicon and apple-touch-icon load",
    "check": "AUTO",
    "verify": "GET /favicon.ico + all <link rel='icon'> hrefs + all <link rel='apple-touch-icon'> hrefs — expect status < 400"
  },
  {
    "id": "AM-09",
    "category": "assets",
    "severity": "high",
    "title": "Images have explicit width/height or sizes (no CLS)",
    "check": "AUTO",
    "verify": "document.images — each must have width+height attributes, or sizes attribute, or CSS aspect-ratio set"
  },
  {
    "id": "AM-10",
    "category": "assets",
    "severity": "medium",
    "title": "SVGs render visibly with non-zero dimensions",
    "check": "AUTO+VISUAL",
    "verify": "document.querySelectorAll('svg') — each getBoundingClientRect() must have width > 0 and height > 0"
  },
  {
    "id": "AM-11",
    "category": "assets",
    "severity": "high",
    "title": "No placeholder or unverified external image URLs",
    "check": "AUTO+VISUAL",
    "verify": "All image srcs and background-image values must not match picsum.photos|via.placeholder.com|loremflickr.com|placeimg.com|images.unsplash.com/photo-<random>"
  },
  {
    "id": "AM-12",
    "category": "assets",
    "severity": "medium",
    "title": "All images have a non-empty alt attribute",
    "check": "AUTO",
    "verify": "document.images — every img must have hasAttribute('alt') === true (empty string allowed for decorative)"
  },
  {
    "id": "AM-13",
    "category": "assets",
    "severity": "high",
    "title": "No console errors from media or asset loading",
    "check": "AUTO",
    "verify": "page.on('console') collect type==='error'; filter for /failed to load|net::err|decode error|not found|404|webgl|texture/i — expect empty"
  },
  {
    "id": "AM-14",
    "category": "assets",
    "severity": "high",
    "title": "JSON data files load and are valid",
    "check": "AUTO",
    "verify": "All .json responses must return status 200 and parse without throwing — res.json() must not throw"
  },
  {
    "id": "AM-15",
    "category": "assets",
    "severity": "medium",
    "title": "Open Graph and Twitter meta images resolve",
    "check": "AUTO",
    "verify": "GET meta[property='og:image'] content + meta[name='twitter:image'] content — expect status < 400"
  },
  {
    "id": "AM-16",
    "category": "assets",
    "severity": "low",
    "title": "Large images served as WebP or AVIF (next/image optimization active)",
    "check": "AUTO",
    "verify": "All image responses > 10 KB must have content-type containing 'webp' or 'avif'"
  },
  {
    "id": "AM-17",
    "category": "assets",
    "severity": "critical",
    "title": "No mixed-content (HTTP assets on HTTPS page)",
    "check": "AUTO",
    "verify": "page.on('request') — if page URL is https://, no request URL may start with http:// — expect empty array"
  },
  {
    "id": "AM-18",
    "category": "assets",
    "severity": "medium",
    "title": "Asset CDN/origin TTFB < 600 ms for image/font/video",
    "check": "AUTO",
    "verify": "res.timing().responseStart - res.timing().requestStart < 600 for all image/font/video responses"
  }
]
```
