# Build & Runtime Correctness Checklist
## Next.js (App Router, TypeScript, Tailwind)
_Definitive QA checklist — every item is a binary PASS/FAIL._

Legend: **AUTO** = machine-checkable | **VISUAL** = requires human/agent judgment
Severity: **critical** | **major** | **minor**

---

## 1. Build Pipeline

### BC-001 — `npm run build` exits with code 0
- Severity: **critical**
- Check: **AUTO**
- Verify: `npm run build; echo "EXIT:$?"` — assert the printed exit code is `EXIT:0`. Any non-zero means build failure.

### BC-002 — No TypeScript errors (`tsc --noEmit`)
- Severity: **critical**
- Check: **AUTO**
- Verify: `npx tsc --noEmit 2>&1 | tee /tmp/tsc.out; [ ! -s /tmp/tsc.out ] && echo PASS || echo FAIL` — output file must be empty (0 bytes / 0 lines). Any `error TS` line is a FAIL.

### BC-003 — ESLint clean (0 errors)
- Severity: **major**
- Check: **AUTO**
- Verify: `npx next lint 2>&1 | grep -E "^.*Error|[0-9]+ error" | wc -l` — expect count `0`. Alternatively, `npx next lint --max-warnings 0; echo "EXIT:$?"` — expect `EXIT:0`.

### BC-004 — ESLint 0 warnings
- Severity: **minor**
- Check: **AUTO**
- Verify: `npx next lint 2>&1 | grep -c "Warning"` — expect `0`. A non-zero count is a FAIL.

### BC-005 — No `console.log` in production source
- Severity: **major**
- Check: **AUTO**
- Verify: `grep -rn "console\.log" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" src/ app/ components/ lib/ 2>/dev/null | grep -v "\.test\." | grep -v "\.spec\." | wc -l` — expect `0`. Each match is a FAIL.

### BC-006 — No `console.warn` or `console.error` in production source
- Severity: **minor**
- Check: **AUTO**
- Verify: `grep -rn "console\.\(warn\|error\|debug\|info\)" --include="*.ts" --include="*.tsx" src/ app/ components/ lib/ 2>/dev/null | grep -v "\.test\." | grep -v "\.spec\." | wc -l` — expect `0`.

### BC-007 — No TODO / FIXME / placeholder strings shipped
- Severity: **major**
- Check: **AUTO**
- Verify: `grep -rni "TODO\|FIXME\|not implemented\|placeholder\|lorem ipsum\|coming soon\|under construction" --include="*.ts" --include="*.tsx" --include="*.mdx" src/ app/ components/ content/ 2>/dev/null | grep -v "\.test\." | wc -l` — expect `0`.

### BC-008 — Build output `.next/` directory exists and is non-empty
- Severity: **critical**
- Check: **AUTO**
- Verify: `[ -d .next/static ] && [ -d .next/server ] && echo PASS || echo FAIL` — both subdirs must exist post-build.

---

## 2. Type & Config Sanity

### BC-009 — No secrets or API keys in client bundle
- Severity: **critical**
- Check: **AUTO**
- Verify: `grep -r "NEXT_PUBLIC_" .next/static/chunks/ 2>/dev/null | grep -Eo "NEXT_PUBLIC_[A-Z_]+=\S+" | grep -v "NEXT_PUBLIC_SITE_URL\|NEXT_PUBLIC_APP_URL" | wc -l` — expect `0`. Additionally: `grep -rn "sk-\|sk_live\|secret_key\|api_secret" .next/static/chunks/ 2>/dev/null | wc -l` — expect `0`.

### BC-010 — `NEXT_PUBLIC_*` env vars match `.env.example` / documented requirements
- Severity: **major**
- Check: **AUTO**
- Verify: Compare keys in `.env.example` (or `.env.local.example`) against `process.env` references in source: `grep -rho "process\.env\.[A-Z_]*" src/ app/ lib/ 2>/dev/null | sort -u > /tmp/used_env.txt; diff <(grep "NEXT_PUBLIC_" .env.example | cut -d= -f1 | sort) <(grep "NEXT_PUBLIC_" /tmp/used_env.txt | cut -d. -f3 | sort)` — expect empty diff.

### BC-011 — `next.config.*` has no syntax errors
- Severity: **critical**
- Check: **AUTO**
- Verify: Included in `npm run build` exit code (BC-001). Also independently: `node -e "require('./next.config.js')" 2>&1 | wc -l` — expect `0` lines of output.

---

## 3. Dev Server Boot

### BC-012 — Dev server starts without errors
- Severity: **critical**
- Check: **AUTO**
- Verify: `timeout 30 npx next dev 2>&1 | head -40 | grep -iE "error|failed|cannot find" | wc -l` — expect `0`. Server must print `Ready` within 30s.

### BC-013 — Dev server `localhost:3000` returns HTTP 200
- Severity: **critical**
- Check: **AUTO**
- Verify: Start dev server in background, then: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` — expect `200`.

---

## 4. Production Server

### BC-014 — `next start` serves HTTP 200 on `/`
- Severity: **critical**
- Check: **AUTO**
- Verify: After `npm run build`, run `npx next start &` then `sleep 3 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` — expect `200`. Kill server after check.

### BC-015 — All statically defined app routes return HTTP 200 (no 404s)
- Severity: **critical**
- Check: **AUTO**
- Verify: Enumerate routes from `app/` directory: `find app -name "page.tsx" -o -name "page.ts" | sed 's|app||; s|/page\.\(tsx\|ts\)||; s|^$|/|' | sort -u > /tmp/routes.txt`. Then Playwright or curl loop: for each route, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000$ROUTE` — expect all `200`. Any `404` or `500` is a FAIL.

### BC-016 — No 404 on `GET /favicon.ico`
- Severity: **major**
- Check: **AUTO**
- Verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/favicon.ico` — expect `200`. Check `public/favicon.ico` or `app/favicon.ico` exists: `[ -f public/favicon.ico ] || [ -f app/favicon.ico ] && echo PASS || echo FAIL`.

---

## 5. Browser Console & Runtime Errors

### BC-017 — Zero browser console errors at runtime
- Severity: **critical**
- Check: **AUTO**
- Verify: Playwright script — collect all console messages per page:
  ```js
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('http://localhost:3000');
  expect(errors).toHaveLength(0);
  ```
  Run against every app route. Any `console.error` message is a FAIL.

### BC-018 — Zero browser console warnings at runtime
- Severity: **major**
- Check: **AUTO**
- Verify: Same Playwright pattern as BC-017 but filter `msg.type() === 'warning'`. Any warning is a FAIL.

### BC-019 — No React hydration mismatch warning
- Severity: **critical**
- Check: **AUTO**
- Verify: Playwright — scan console messages for the string `"Hydration"` or `"did not match"` or `"There was an error while hydrating"`:
  ```js
  page.on('console', msg => {
    const text = msg.text();
    if (/hydrat|did not match|server.*client/i.test(text)) hydrationErrors.push(text);
  });
  ```
  Any match is a FAIL. Also scan `page.on('pageerror', ...)` for the same strings.

### BC-020 — No uncaught runtime exceptions
- Severity: **critical**
- Check: **AUTO**
- Verify: Playwright — attach `page.on('pageerror', err => uncaught.push(err.message))` before navigation. After full page load + any client-side transitions, `expect(uncaught).toHaveLength(0)`. Run for every route.

### BC-021 — No unhandled promise rejections
- Severity: **critical**
- Check: **AUTO**
- Verify: Playwright — attach `page.on('pageerror', ...)` and filter for `"UnhandledPromiseRejection"` or `"Promise rejection"`. Additionally monitor `page.on('console', msg => msg.type() === 'error')` for rejection messages. Expect 0 across all routes.

### BC-022 — No missing React `key` prop warnings
- Severity: **major**
- Check: **AUTO**
- Verify: Playwright console listener — scan for `"Each child in a list should have a unique key"` or `"Warning: Each child"`. Any match is a FAIL. Run across all routes that render lists/tables.

---

## 6. Navigation & Links

### BC-023 — All primary nav links resolve (no dead hrefs)
- Severity: **critical**
- Check: **AUTO**
- Verify: Playwright — extract all `<a href>` from the nav/header element. For each internal href (starts with `/`), fetch and assert HTTP < 400:
  ```js
  const links = await page.$$eval('nav a[href], header a[href]', els =>
    els.map(el => el.getAttribute('href')).filter(h => h && h.startsWith('/'))
  );
  for (const href of links) {
    const res = await page.request.get(`http://localhost:3000${href}`);
    expect(res.status()).toBeLessThan(400);
  }
  ```

### BC-024 — No `href="#"` stub links on primary CTAs or nav
- Severity: **major**
- Check: **AUTO**
- Verify: Playwright — `await page.$$eval('nav a, header a, [data-cta] a, .cta a', els => els.filter(el => el.getAttribute('href') === '#').map(el => el.textContent))` — expect empty array. Also static grep: `grep -rn 'href="#"' src/ app/ components/ 2>/dev/null | wc -l` — expect `0`.

### BC-025 — All internal `<Link>` / `<a>` hrefs in page body resolve
- Severity: **major**
- Check: **AUTO**
- Verify: Playwright full-page scan per route — collect all `<a href>` where href starts with `/`, deduplicate, then HEAD request each: `const res = await request.head('http://localhost:3000' + href)` — expect `res.status() < 400`. Flag any 404/500.

### BC-026 — External links use `target="_blank"` with `rel="noopener noreferrer"`
- Severity: **minor**
- Check: **AUTO**
- Verify: `grep -rn 'target="_blank"' src/ app/ components/ 2>/dev/null | grep -v 'noopener' | wc -l` — expect `0`.

---

## 7. Visual & UI Correctness

### BC-027 — No visible placeholder / lorem ipsum text on any page
- Severity: **major**
- Check: **VISUAL**
- Verify: Load each route in browser; scan page body for strings like "Lorem ipsum", "Placeholder", "Coming soon", "TODO", "[Name]", "[Description]", "Sample text". Any visible match is a FAIL.

### BC-028 — Favicon renders correctly in browser tab
- Severity: **minor**
- Check: **VISUAL**
- Verify: Open `http://localhost:3000` in browser. Confirm the correct favicon appears in the tab, not the default Next.js favicon or a broken icon.

### BC-029 — No broken images (0 failed `<img>` loads)
- Severity: **major**
- Check: **AUTO**
- Verify: Playwright — after page load, check all images loaded:
  ```js
  const brokenImages = await page.$$eval('img', imgs =>
    imgs.filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src)
  );
  expect(brokenImages).toHaveLength(0);
  ```
  Run per route.

### BC-030 — No layout overflow / horizontal scrollbar on desktop viewport
- Severity: **major**
- Check: **VISUAL**
- Verify: At 1440×900 viewport, inspect each route. No horizontal scrollbar should appear. Also AUTO partial check: Playwright `await page.evaluate(() => document.body.scrollWidth > window.innerWidth)` — expect `false`.

### BC-031 — No layout overflow on mobile viewport (375px wide)
- Severity: **major**
- Check: **VISUAL**
- Verify: Playwright with `viewport: { width: 375, height: 812 }` — same `scrollWidth > innerWidth` check. Expect `false`.

---

## 8. Network & Performance Sanity

### BC-032 — No failed network requests (4xx/5xx) during page load
- Severity: **major**
- Check: **AUTO**
- Verify: Playwright — `page.on('response', res => { if (res.status() >= 400) failures.push({ url: res.url(), status: res.status() }) })` — after full page load, expect `failures` to be empty. Run per route.

### BC-033 — No mixed content (HTTP assets on HTTPS pages)
- Severity: **major**
- Check: **AUTO**
- Verify: In production/staging where site is HTTPS, Playwright console listener — scan for `"Mixed Content"` messages. Expect 0. Also static grep: `grep -rn "http://" --include="*.ts" --include="*.tsx" src/ app/ 2>/dev/null | grep -v "localhost\|127\.0\.0\.1\|example\.com\|comment\|//" | wc -l` — review any matches.

---

## 9. `<head>` / SEO / Meta

### BC-034 — Each page has a non-empty `<title>`
- Severity: **major**
- Check: **AUTO**
- Verify: Playwright per route — `await page.title()` — expect non-empty string and not the literal `"Untitled"` or `"My App"` default.

### BC-035 — Each page has a `<meta name="description">` tag
- Severity: **minor**
- Check: **AUTO**
- Verify: Playwright per route — `await page.$eval('meta[name="description"]', el => el.getAttribute('content'))` — expect non-empty string. Missing element throws, which is a FAIL.

---

## Summary Table

| ID | Title | Severity | Check |
|----|-------|----------|-------|
| BC-001 | `npm run build` exits 0 | critical | AUTO |
| BC-002 | `tsc --noEmit` clean | critical | AUTO |
| BC-003 | ESLint 0 errors | major | AUTO |
| BC-004 | ESLint 0 warnings | minor | AUTO |
| BC-005 | No `console.log` in source | major | AUTO |
| BC-006 | No `console.warn/error/debug` in source | minor | AUTO |
| BC-007 | No TODO/FIXME/placeholder strings | major | AUTO |
| BC-008 | `.next/` output exists | critical | AUTO |
| BC-009 | No secrets in client bundle | critical | AUTO |
| BC-010 | Env vars match documented requirements | major | AUTO |
| BC-011 | `next.config.*` no syntax errors | critical | AUTO |
| BC-012 | Dev server boots without errors | critical | AUTO |
| BC-013 | Dev server returns HTTP 200 on `/` | critical | AUTO |
| BC-014 | `next start` serves HTTP 200 on `/` | critical | AUTO |
| BC-015 | All app routes return HTTP 200 | critical | AUTO |
| BC-016 | `/favicon.ico` returns 200 | major | AUTO |
| BC-017 | Zero browser console errors | critical | AUTO |
| BC-018 | Zero browser console warnings | major | AUTO |
| BC-019 | No React hydration mismatch | critical | AUTO |
| BC-020 | No uncaught runtime exceptions | critical | AUTO |
| BC-021 | No unhandled promise rejections | critical | AUTO |
| BC-022 | No missing React `key` prop warnings | major | AUTO |
| BC-023 | All primary nav links resolve | critical | AUTO |
| BC-024 | No `href="#"` stub links on nav/CTAs | major | AUTO |
| BC-025 | All internal body links resolve | major | AUTO |
| BC-026 | External links have `noopener noreferrer` | minor | AUTO |
| BC-027 | No placeholder text visible on any page | major | VISUAL |
| BC-028 | Favicon renders correctly in tab | minor | VISUAL |
| BC-029 | No broken images | major | AUTO |
| BC-030 | No horizontal overflow at 1440px | major | VISUAL |
| BC-031 | No horizontal overflow at 375px | major | VISUAL |
| BC-032 | No failed network requests during load | major | AUTO |
| BC-033 | No mixed content (HTTP on HTTPS) | major | AUTO |
| BC-034 | Each page has non-empty `<title>` | major | AUTO |
| BC-035 | Each page has `<meta description>` | minor | AUTO |

**Total: 35 items — 31 AUTO, 4 VISUAL**
**Critical: 14 | Major: 15 | Minor: 6**

---

## Machine-readable items

```json
[
  {
    "id": "BC-001",
    "category": "build",
    "severity": "critical",
    "check": "auto",
    "title": "npm run build exits with code 0",
    "verify": "npm run build; echo \"EXIT:$?\" — assert printed exit code is EXIT:0"
  },
  {
    "id": "BC-002",
    "category": "build",
    "severity": "critical",
    "check": "auto",
    "title": "tsc --noEmit clean (no TypeScript errors)",
    "verify": "npx tsc --noEmit 2>&1 | tee /tmp/tsc.out; [ ! -s /tmp/tsc.out ] && echo PASS || echo FAIL — output file must be 0 bytes"
  },
  {
    "id": "BC-003",
    "category": "build",
    "severity": "major",
    "check": "auto",
    "title": "ESLint 0 errors",
    "verify": "npx next lint --max-warnings 0; echo \"EXIT:$?\" — expect EXIT:0"
  },
  {
    "id": "BC-004",
    "category": "build",
    "severity": "minor",
    "check": "auto",
    "title": "ESLint 0 warnings",
    "verify": "npx next lint 2>&1 | grep -c 'Warning' — expect 0"
  },
  {
    "id": "BC-005",
    "category": "build",
    "severity": "major",
    "check": "auto",
    "title": "No console.log in production source",
    "verify": "grep -rn 'console\\.log' --include='*.ts' --include='*.tsx' src/ app/ components/ lib/ | grep -v '\\.test\\.' | grep -v '\\.spec\\.' | wc -l — expect 0"
  },
  {
    "id": "BC-006",
    "category": "build",
    "severity": "minor",
    "check": "auto",
    "title": "No console.warn/error/debug in production source",
    "verify": "grep -rn 'console\\.\\(warn\\|error\\|debug\\|info\\)' --include='*.ts' --include='*.tsx' src/ app/ components/ lib/ | grep -v '\\.test\\.' | grep -v '\\.spec\\.' | wc -l — expect 0"
  },
  {
    "id": "BC-007",
    "category": "build",
    "severity": "major",
    "check": "auto",
    "title": "No TODO/FIXME/placeholder strings shipped",
    "verify": "grep -rni 'TODO\\|FIXME\\|not implemented\\|placeholder\\|lorem ipsum\\|coming soon\\|under construction' --include='*.ts' --include='*.tsx' --include='*.mdx' src/ app/ components/ | grep -v '\\.test\\.' | wc -l — expect 0"
  },
  {
    "id": "BC-008",
    "category": "build",
    "severity": "critical",
    "check": "auto",
    "title": ".next/ output directory exists post-build",
    "verify": "[ -d .next/static ] && [ -d .next/server ] && echo PASS || echo FAIL — both subdirs must exist"
  },
  {
    "id": "BC-009",
    "category": "build",
    "severity": "critical",
    "check": "auto",
    "title": "No secrets or API keys in client bundle",
    "verify": "grep -r 'sk-\\|sk_live\\|secret_key\\|api_secret' .next/static/chunks/ 2>/dev/null | wc -l — expect 0; also grep NEXT_PUBLIC_ .next/static/chunks/ for unintended secret vars"
  },
  {
    "id": "BC-010",
    "category": "build",
    "severity": "major",
    "check": "auto",
    "title": "Env vars match documented requirements in .env.example",
    "verify": "diff <(grep 'NEXT_PUBLIC_' .env.example | cut -d= -f1 | sort) <(grep -rho 'process\\.env\\.[A-Z_]*' src/ app/ lib/ | grep 'NEXT_PUBLIC_' | cut -d. -f3 | sort -u) — expect empty diff"
  },
  {
    "id": "BC-011",
    "category": "build",
    "severity": "critical",
    "check": "auto",
    "title": "next.config.* has no syntax errors",
    "verify": "node -e \"require('./next.config.js')\" 2>&1 | wc -l — expect 0 lines; also covered by BC-001 build exit code"
  },
  {
    "id": "BC-012",
    "category": "build",
    "severity": "critical",
    "check": "auto",
    "title": "Dev server starts without errors",
    "verify": "timeout 30 npx next dev 2>&1 | head -40 | grep -iE 'error|failed|cannot find' | wc -l — expect 0; server must print 'Ready' within 30s"
  },
  {
    "id": "BC-013",
    "category": "build",
    "severity": "critical",
    "check": "auto",
    "title": "Dev server localhost:3000 returns HTTP 200",
    "verify": "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 — expect 200"
  },
  {
    "id": "BC-014",
    "category": "build",
    "severity": "critical",
    "check": "auto",
    "title": "next start (production) serves HTTP 200 on /",
    "verify": "npm run build && npx next start & sleep 3 && curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 — expect 200"
  },
  {
    "id": "BC-015",
    "category": "build",
    "severity": "critical",
    "check": "auto",
    "title": "All app routes return HTTP 200 (no 404s)",
    "verify": "Enumerate routes: find app -name 'page.tsx' | sed 's|app||; s|/page\\.tsx||; s|^$|/|'. For each route, curl -s -o /dev/null -w '%{http_code}' http://localhost:3000$ROUTE — expect all 200"
  },
  {
    "id": "BC-016",
    "category": "build",
    "severity": "major",
    "check": "auto",
    "title": "favicon.ico present and returns HTTP 200",
    "verify": "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/favicon.ico — expect 200; also [ -f public/favicon.ico ] || [ -f app/favicon.ico ] && echo PASS || echo FAIL"
  },
  {
    "id": "BC-017",
    "category": "runtime",
    "severity": "critical",
    "check": "auto",
    "title": "Zero browser console errors at runtime",
    "verify": "Playwright: const errors=[]; page.on('console', msg => { if (msg.type()==='error') errors.push(msg.text()); }); await page.goto(url); expect(errors).toHaveLength(0) — run per route"
  },
  {
    "id": "BC-018",
    "category": "runtime",
    "severity": "major",
    "check": "auto",
    "title": "Zero browser console warnings at runtime",
    "verify": "Playwright: same as BC-017 but filter msg.type()==='warning' — expect 0 per route"
  },
  {
    "id": "BC-019",
    "category": "runtime",
    "severity": "critical",
    "check": "auto",
    "title": "No React hydration mismatch warning",
    "verify": "Playwright console listener — scan msg.text() for /hydrat|did not match|server.*client/i — any match is FAIL; also page.on('pageerror') for same pattern"
  },
  {
    "id": "BC-020",
    "category": "runtime",
    "severity": "critical",
    "check": "auto",
    "title": "No uncaught runtime exceptions",
    "verify": "Playwright: const uncaught=[]; page.on('pageerror', err => uncaught.push(err.message)); await page.goto(url); expect(uncaught).toHaveLength(0) — run per route"
  },
  {
    "id": "BC-021",
    "category": "runtime",
    "severity": "critical",
    "check": "auto",
    "title": "No unhandled promise rejections",
    "verify": "Playwright: page.on('pageerror') filter for 'UnhandledPromiseRejection' or 'Promise rejection'; page.on('console') filter for same — expect 0 per route"
  },
  {
    "id": "BC-022",
    "category": "runtime",
    "severity": "major",
    "check": "auto",
    "title": "No missing React key prop warnings",
    "verify": "Playwright console listener: scan for 'Each child in a list should have a unique key' or 'Warning: Each child' — any match is FAIL across all list-rendering routes"
  },
  {
    "id": "BC-023",
    "category": "navigation",
    "severity": "critical",
    "check": "auto",
    "title": "All primary nav links resolve (no dead hrefs)",
    "verify": "Playwright: page.$$eval('nav a[href], header a[href]', els => els.map(el=>el.getAttribute('href')).filter(h=>h&&h.startsWith('/'))) — for each href, request.get(url) expect status < 400"
  },
  {
    "id": "BC-024",
    "category": "navigation",
    "severity": "major",
    "check": "auto",
    "title": "No href='#' stub links on primary CTAs or nav",
    "verify": "grep -rn 'href=\"#\"' src/ app/ components/ | wc -l — expect 0; also Playwright page.$$eval('nav a, header a', els => els.filter(el=>el.getAttribute('href')==='#').length) — expect 0"
  },
  {
    "id": "BC-025",
    "category": "navigation",
    "severity": "major",
    "check": "auto",
    "title": "All internal body links resolve (no 404/500)",
    "verify": "Playwright per route: collect all a[href] starting with /, deduplicate, HEAD each: request.head('http://localhost:3000'+href) expect status < 400"
  },
  {
    "id": "BC-026",
    "category": "navigation",
    "severity": "minor",
    "check": "auto",
    "title": "External links use rel='noopener noreferrer'",
    "verify": "grep -rn 'target=\"_blank\"' src/ app/ components/ | grep -v 'noopener' | wc -l — expect 0"
  },
  {
    "id": "BC-027",
    "category": "visual",
    "severity": "major",
    "check": "visual",
    "title": "No visible placeholder or lorem ipsum text on any page",
    "verify": "Load each route in browser; scan page body for 'Lorem ipsum', 'Placeholder', 'Coming soon', 'TODO', '[Name]', '[Description]', 'Sample text' — any visible match is FAIL"
  },
  {
    "id": "BC-028",
    "category": "visual",
    "severity": "minor",
    "check": "visual",
    "title": "Favicon renders correctly in browser tab",
    "verify": "Open http://localhost:3000 in browser — confirm correct favicon appears in tab, not default Next.js globe or broken icon"
  },
  {
    "id": "BC-029",
    "category": "visual",
    "severity": "major",
    "check": "auto",
    "title": "No broken images on any page",
    "verify": "Playwright per route: page.$$eval('img', imgs => imgs.filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src)) — expect empty array"
  },
  {
    "id": "BC-030",
    "category": "visual",
    "severity": "major",
    "check": "visual",
    "title": "No layout overflow or horizontal scrollbar at 1440px",
    "verify": "Playwright viewport {width:1440,height:900}: page.evaluate(() => document.body.scrollWidth > window.innerWidth) — expect false; confirm visually no scrollbar appears"
  },
  {
    "id": "BC-031",
    "category": "visual",
    "severity": "major",
    "check": "visual",
    "title": "No layout overflow at 375px mobile viewport",
    "verify": "Playwright viewport {width:375,height:812}: page.evaluate(() => document.body.scrollWidth > window.innerWidth) — expect false; confirm visually"
  },
  {
    "id": "BC-032",
    "category": "runtime",
    "severity": "major",
    "check": "auto",
    "title": "No failed network requests (4xx/5xx) during page load",
    "verify": "Playwright: const failures=[]; page.on('response', res => { if(res.status()>=400) failures.push({url:res.url(),status:res.status()}); }); await page.goto(url); expect(failures).toHaveLength(0) — run per route"
  },
  {
    "id": "BC-033",
    "category": "runtime",
    "severity": "major",
    "check": "auto",
    "title": "No mixed content (HTTP assets on HTTPS pages)",
    "verify": "Playwright console listener for 'Mixed Content' messages — expect 0; grep -rn 'http://' src/ app/ | grep -v 'localhost\\|127\\.0\\.0\\.1\\|example\\.com\\|//' for static review"
  },
  {
    "id": "BC-034",
    "category": "seo",
    "severity": "major",
    "check": "auto",
    "title": "Each page has a non-empty <title>",
    "verify": "Playwright per route: await page.title() — expect non-empty string, not 'Untitled' or default fallback"
  },
  {
    "id": "BC-035",
    "category": "seo",
    "severity": "minor",
    "check": "auto",
    "title": "Each page has a <meta name='description'> tag",
    "verify": "Playwright per route: page.$eval('meta[name=\"description\"]', el => el.getAttribute('content')) — expect non-empty string; missing element throws = FAIL"
  }
]
```
