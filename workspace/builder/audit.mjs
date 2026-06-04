#!/usr/bin/env node
// audit.mjs — automated website auditor for the checklist-driven builder.
//
// Builds + serves a generated Next.js project, then runs Playwright against it to verify the high-value
// AUTO checklist items — the ones that catch the real defects we keep hitting: broken images, 404s,
// console errors / React hydration mismatches, horizontal scroll, text cut off the viewport edge (desktop
// AND mobile), raw HTML entities, lorem/placeholder text, missing SEO/meta, missing alt/lang, AND the two
// that matter most for animated sites: a <canvas> that renders BLANK (the invisible-3D bug) and reveal
// targets stuck invisible (the never-fired-ScrollTrigger bug).
//
// auditSite(projectDir, opts) -> { ok, checks:[{id,category,severity,pass,detail}], summary, screenshots }
// Never throws — a check that errors is reported as a fail with the error text.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SEV = { critical: 3, major: 2, minor: 1 };

function sh(cmd, args, opts = {}) {
  try { return spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts }); }
  catch (e) { return { status: 1, stdout: '', stderr: String(e?.message ?? e) }; }
}

// Wait until an HTTP server answers on the port (or timeout).
async function waitForServer(port, ms = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`http://localhost:${port}`, { method: 'GET' }); if (r.status) return true; }
    catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

// Recursively read source files (capped) for static (grep-style) checks.
function readSources(dir, exts = ['.ts', '.tsx', '.js', '.jsx', '.css'], cap = 1500) {
  const out = [];
  const skip = new Set(['node_modules', '.next', 'dist', 'build', '.git']);
  (function walk(d) {
    if (out.length >= cap) return;
    let ents = []; try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= cap) return;
      if (e.name.startsWith('.') && e.name !== '.') { if (skip.has(e.name)) continue; }
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!skip.has(e.name)) walk(p); }
      else if (exts.includes(path.extname(e.name))) { try { out.push({ p, src: readFileSync(p, 'utf8').slice(0, 400_000) }); } catch {} }
    }
  })(path.join(dir, 'src'));
  return out;
}

// ── the browser-side check battery (runs inside the page via evaluate) ──────────────────────────────
// Returns a plain object of measurements; the Node side turns those into pass/fail checks.
async function measure(page) {
  return await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const isMarquee = el => el.closest('[data-marquee],[data-noscroll],marquee') || /marquee|ticker|carousel|slider|track/i.test(el.className || '');
    // Is this element's overflow CLIPPED by some ancestor? If so, content past the viewport edge is hidden
    // by design (marquees, carousels, scroll tracks) — not a real "text bleeding off the page" bug.
    const clippedByAncestor = el => {
      for (let a = el.parentElement, hops = 0; a && hops < 8; a = a.parentElement, hops++) {
        const cs = getComputedStyle(a);
        if (/hidden|clip|auto|scroll/.test(cs.overflowX) || /hidden|clip/.test(cs.overflow)) return true;
      }
      return false;
    };
    // overflow / cutoff text — only flag text that is BOTH outside the viewport AND not clipped away.
    const cut = [];
    document.querySelectorAll('h1,h2,h3,h4,p,span,a,li,button').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.overflow === 'hidden') return;
      const r = el.getBoundingClientRect();
      const txt = (el.textContent || '').trim();
      if (!txt || r.width <= 0 || isMarquee(el)) return;
      // far off-screen (|left| or right beyond a full viewport) is always a moving track / clipped content
      if (r.left < -vw || r.right > vw * 2) return;
      if ((r.right > vw + 3 || r.left < -3) && !clippedByAncestor(el)) cut.push(`${el.tagName} "${txt.slice(0, 30)}" L${Math.round(r.left)} R${Math.round(r.right)}/${vw}`);
    });
    // images
    const imgs = Array.from(document.images);
    const broken = imgs.filter(i => !i.complete || i.naturalWidth === 0).map(i => (i.currentSrc || i.src).slice(0, 80));
    // canvas pixel check (the 3D-renders-something test)
    let canvas = { present: false, visiblePixels: null };
    const c = document.querySelector('canvas');
    if (c) {
      canvas.present = true;
      try {
        const off = document.createElement('canvas'); off.width = 80; off.height = 50;
        const ctx = off.getContext('2d'); ctx.drawImage(c, 0, 0, 80, 50);
        const d = ctx.getImageData(0, 0, 80, 50).data; let nonblank = 0, lum = 0;
        for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; if (a > 8 && (d[i] + d[i + 1] + d[i + 2]) > 24) nonblank++; lum += (d[i] + d[i + 1] + d[i + 2]); }
        canvas.visiblePixels = nonblank;            // >some threshold => the canvas drew something visible
        canvas.avgLum = lum / (d.length / 4);
      } catch (e) { canvas.error = String(e).slice(0, 60); }
    }
    // reveal visibility — elements that look like reveal targets but are stuck invisible/clipped
    const stuck = [];
    document.querySelectorAll('[data-reveal],[class*="reveal"],section h2,section p').forEach(el => {
      const r = el.getBoundingClientRect();
      const inView = r.top < innerHeight * 1.2 && r.bottom > 0;   // near/in viewport
      if (!inView) return;
      const cs = getComputedStyle(el);
      const op = parseFloat(cs.opacity);
      const clipped = cs.clipPath && /inset\(\s*(?:100%|[^0].*100%)/.test(cs.clipPath);
      if ((op < 0.05 || clipped) && (el.textContent || '').trim().length > 1) stuck.push(`${el.tagName} "${(el.textContent || '').trim().slice(0, 24)}" op${op}`);
    });
    const txt = (document.body.innerText || '');
    return {
      vw, cut: [...new Set(cut)].slice(0, 20), broken, canvas,
      stuck: [...new Set(stuck)].slice(0, 20),
      hScroll: document.body.scrollWidth > vw + 2,
      title: document.title || '',
      lang: document.documentElement.lang || '',
      metaDesc: document.querySelector('meta[name="description"]')?.content || '',
      ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
      ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
      h1Count: document.querySelectorAll('h1').length,
      imgNoAlt: imgs.filter(i => !i.hasAttribute('alt')).length,
      h1Font: (() => { const h = document.querySelector('h1'); return h ? getComputedStyle(h).fontFamily : ''; })(),
      rawEntities: /&(amp|lt|gt|quot|#x?\d);/i.test(txt),
      placeholder: /lorem ipsum|placeholder text|coming soon|your company|acme corp|dummy text|\bdolor sit\b/i.test(txt),
      bodyTextLen: txt.length,
    };
  });
}

export async function auditSite(projectDir, opts = {}) {
  const { port = 4555, build = true, requireCanvas = false, screenshotDir } = opts;
  const checks = [];
  const add = (id, category, severity, pass, detail = '') => checks.push({ id, category, severity, pass: !!pass, detail: String(detail).slice(0, 300) });
  const screenshots = [];

  if (!existsSync(path.join(projectDir, 'package.json'))) {
    add('project.exists', 'build', 'critical', false, 'no package.json');
    return finalize(checks, screenshots);
  }

  // 1) BUILD
  let buildOut = '';
  if (build) {
    const r = sh('npm', ['run', 'build'], { cwd: projectDir, env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' }, timeout: 300_000 });
    buildOut = ((r.stdout || '') + (r.stderr || ''));
    add('build.passes', 'build', 'critical', r.status === 0, r.status === 0 ? 'next build ok' : buildOut.slice(-400));
    if (r.status !== 0) return finalize(checks, screenshots);   // can't serve a broken build
    // first-load JS budget (rough, from build output)
    const m = buildOut.match(/First Load JS shared by all\s+([\d.]+)\s*(kB|MB)/i) || buildOut.match(/([\d.]+)\s*kB\s+First Load JS/i);
    if (m) { const kb = parseFloat(m[1]) * (/, *MB/i.test(m[2] || '') ? 1024 : 1); add('perf.firstLoadJs', 'perf', 'minor', kb <= 400, `${m[1]}${m[2] || 'kB'} shared first-load`); }
  }

  // static source checks (grep)
  const srcs = readSources(projectDir);
  const allSrc = srcs.map(s => s.src).join('\n');
  add('content.noStubs', 'content', 'major', !/\bTODO\b|FIXME|not implemented|coming soon/i.test(allSrc), 'no TODO/FIXME/not-implemented/coming-soon in source');
  add('perf.threeCodeSplit', 'perf', 'minor', !/^import .*from ['"]three['"]/m.test(allSrc) || /dynamic\(/.test(allSrc), 'three not statically imported into a page (or dynamic used)');
  add('design.focusVisible', 'a11y', 'minor', /:focus-visible/.test(allSrc), 'uses :focus-visible focus styles');
  add('anim.cleanup', 'animation', 'minor', !/ScrollTrigger|gsap/.test(allSrc) || /(ScrollTrigger\.kill|\.revert\(|removeEventListener)/.test(allSrc), 'animation listeners/triggers cleaned up');

  // 2) SERVE (production) + PLAYWRIGHT
  let server = null;
  try {
    server = spawn('npx', ['next', 'start', '-p', String(port)], { cwd: projectDir, env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'ignore' });
  } catch (e) { add('serve.start', 'build', 'critical', false, String(e?.message ?? e)); return finalize(checks, screenshots); }
  const up = await waitForServer(port, 90_000);
  if (!up) { add('serve.start', 'build', 'critical', false, 'next start did not become reachable'); try { server.kill('SIGTERM'); } catch {} return finalize(checks, screenshots); }

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    try {
      // ---- desktop pass (with console + network capture) ----
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const consoleErrors = [], consoleWarnings = [], pageErrors = [], badResponses = [];
      page.on('console', m => { const t = m.type(); if (t === 'error') consoleErrors.push(m.text().slice(0, 160)); else if (t === 'warning') consoleWarnings.push(m.text().slice(0, 160)); });
      page.on('pageerror', e => pageErrors.push(String(e).slice(0, 160)));
      page.on('response', r => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().slice(0, 80)}`); });
      await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {});
      await page.waitForTimeout(5000);
      // scroll the whole page so reveals fire + lazy content loads, then settle
      await page.evaluate(async () => { for (let y = 0; y <= document.body.scrollHeight; y += window.innerHeight) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 350)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(2500);

      const d = await measure(page);
      if (screenshotDir) { try { const sp = path.join(screenshotDir, 'audit-desktop.png'); await page.screenshot({ path: sp, fullPage: false }); screenshots.push(sp); } catch {} }

      const hydration = consoleErrors.filter(e => /hydrat/i.test(e));
      add('runtime.noConsoleErrors', 'build', 'critical', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'clean');
      add('runtime.noHydration', 'build', 'critical', hydration.length === 0, hydration[0] || 'no hydration mismatch');
      add('runtime.noPageErrors', 'build', 'critical', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || 'clean');
      add('runtime.noConsoleWarnings', 'build', 'minor', consoleWarnings.length === 0, consoleWarnings.slice(0, 3).join(' | ') || 'clean');
      add('assets.no404', 'assets', 'critical', badResponses.length === 0, badResponses.slice(0, 4).join(' | ') || 'no failed requests');
      add('assets.noBrokenImages', 'assets', 'critical', d.broken.length === 0, d.broken.slice(0, 4).join(' | ') || 'all images load');
      add('layout.noHScrollDesktop', 'layout', 'major', !d.hScroll, d.hScroll ? 'page scrolls horizontally at 1440' : 'ok');
      add('layout.noCutoffDesktop', 'layout', 'major', d.cut.length === 0, d.cut.slice(0, 4).join(' ; ') || 'no clipped/overflowing text at 1440');
      add('content.noRawEntities', 'content', 'major', !d.rawEntities, d.rawEntities ? 'raw HTML entity (&amp; etc.) visible in text' : 'ok');
      add('content.noPlaceholder', 'content', 'major', !d.placeholder, d.placeholder ? 'lorem/placeholder/coming-soon text present' : 'ok');
      add('content.hasContent', 'content', 'major', d.bodyTextLen > 400, `body text length ${d.bodyTextLen}`);
      add('seo.title', 'seo', 'major', d.title && !/^create next app$/i.test(d.title), `title: "${d.title.slice(0, 60)}"`);
      add('seo.metaDescription', 'seo', 'major', d.metaDesc.length >= 30, d.metaDesc ? `len ${d.metaDesc.length}` : 'missing meta description');
      add('seo.ogImage', 'seo', 'minor', !!d.ogImage, d.ogImage ? 'present' : 'no og:image');
      add('seo.ogTitle', 'seo', 'minor', !!d.ogTitle, d.ogTitle ? 'present' : 'no og:title');
      add('a11y.lang', 'a11y', 'major', !!d.lang, d.lang ? `lang=${d.lang}` : 'html missing lang attribute');
      add('a11y.imgAlt', 'a11y', 'major', d.imgNoAlt === 0, d.imgNoAlt ? `${d.imgNoAlt} <img> without alt` : 'all images have alt');
      add('a11y.singleH1', 'a11y', 'minor', d.h1Count >= 1, `${d.h1Count} <h1>`);
      add('design.customDisplayFont', 'design', 'major', !!d.h1Font && !/^\s*(Inter|Arial|Helvetica|system-ui|-apple-system|sans-serif)/i.test(d.h1Font.replace(/['"]/g, '')), `h1 font: ${d.h1Font.slice(0, 50)}`);
      // animation / feature
      const stuckReal = d.stuck.filter(Boolean);
      add('anim.revealsVisible', 'animation', 'major', stuckReal.length === 0, stuckReal.length ? `content stuck invisible after scroll: ${stuckReal.slice(0, 3).join(' ; ')}` : 'reveal targets visible after scroll');
      if (d.canvas.present || requireCanvas) {
        const vis = d.canvas.present && (d.canvas.visiblePixels || 0) > 25;   // canvas drew clearly-visible pixels
        const hint = d.canvas.present && !vis ? ' (blank read — ensure the WebGL canvas sets gl={{ preserveDrawingBuffer: true }} so it can be sampled, AND that the scene is lit, on-camera and not black-on-black / gated off by reduced-motion)' : '';
        add('anim.canvasRenders', 'animation', requireCanvas ? 'critical' : 'major', vis, (d.canvas.present ? `canvas visiblePixels=${d.canvas.visiblePixels} avgLum=${Math.round(d.canvas.avgLum || 0)}` : 'no <canvas> present') + hint);
      }
      await ctx.close();

      // ---- mobile pass (overflow / cutoff at 375) ----
      const mctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
      const mpage = await mctx.newPage();
      await mpage.goto(`http://localhost:${port}`, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {});
      await mpage.waitForTimeout(4000);
      await mpage.evaluate(async () => { for (let y = 0; y <= document.body.scrollHeight; y += window.innerHeight) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 250)); } window.scrollTo(0, 0); });
      await mpage.waitForTimeout(1500);
      const m = await measure(mpage);
      if (screenshotDir) { try { const sp = path.join(screenshotDir, 'audit-mobile.png'); await mpage.screenshot({ path: sp, fullPage: false }); screenshots.push(sp); } catch {} }
      add('layout.noHScrollMobile', 'layout', 'critical', !m.hScroll, m.hScroll ? 'page scrolls horizontally at 375' : 'ok');
      add('layout.noCutoffMobile', 'layout', 'major', m.cut.length === 0, m.cut.slice(0, 4).join(' ; ') || 'no clipped/overflowing text at 375');
      add('assets.noBrokenImagesMobile', 'assets', 'major', m.broken.length === 0, m.broken.slice(0, 3).join(' | ') || 'ok');
      await mctx.close();
    } finally { await browser.close(); }
  } catch (e) {
    add('audit.playwright', 'build', 'major', false, `playwright error: ${String(e?.message ?? e).slice(0, 160)}`);
  } finally {
    try { server.kill('SIGTERM'); } catch {}
  }

  return finalize(checks, screenshots);
}

function finalize(checks, screenshots) {
  const fails = checks.filter(c => !c.pass);
  const criticalFails = fails.filter(c => c.severity === 'critical');
  const majorFails = fails.filter(c => c.severity === 'major');
  return {
    ok: criticalFails.length === 0 && majorFails.length === 0,
    checks, screenshots,
    summary: {
      total: checks.length, passed: checks.length - fails.length, failed: fails.length,
      critical: criticalFails.length, major: majorFails.length, minor: fails.filter(c => c.severity === 'minor').length,
    },
    fails,
  };
}

// Format a report's failing items as a directive list a fix-agent can act on.
export function failuresForAgent(report) {
  const order = c => -SEV[c.severity];
  return report.fails.slice().sort((a, b) => order(a) - order(b))
    .map(c => `- [${c.severity.toUpperCase()}] (${c.category}) ${c.id}: ${c.detail}`).join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node audit.mjs <projectDir>'); process.exit(1); }
  auditSite(path.resolve(dir), { screenshotDir: path.resolve(dir) }).then(r => {
    console.log(`\nAUDIT — ${r.summary.passed}/${r.summary.total} passed · ${r.summary.critical} critical · ${r.summary.major} major · ${r.summary.minor} minor failing`);
    for (const c of r.checks) console.log(`  ${c.pass ? '✓' : '✗'} [${c.severity}] ${c.id} — ${c.detail}`);
    console.log(r.ok ? '\n✅ ALL CRITICAL + MAJOR CHECKS PASS' : '\n⚠️ failures remain');
    process.exit(r.ok ? 0 : 1);
  }).catch(e => { console.error('audit failed:', e); process.exit(1); });
}
