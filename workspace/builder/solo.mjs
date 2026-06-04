#!/usr/bin/env node
// solo.mjs — single-agent website builder (the "one agent builds it" mode).
//
// Why this exists: the 40-agent swarm produced incoherent, average sites and failed under rate limits.
// Quality and coherence come from ONE capable agent with a great design system + research playbook, not
// from many agents improvising. So: ONE agent builds the whole site, guided by WEBSITE_PLAYBOOK.md
// (distilled from research into apple/awwwards/stripe/linear craft). Then a deterministic build-until-green
// loop guarantees it actually compiles — no more shipping broken code.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveStack } from './stack.mjs';
import { resolveClaudeBin, ANTI_STUB_RULES } from './agent-runner.mjs';
import { verifyProject } from './verify.mjs';
import { auditSite, failuresForAgent } from './audit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLAYBOOK_PATH = path.join(__dirname, 'WEBSITE_PLAYBOOK.md');
const CRAFT_PATH = path.join(__dirname, 'CRAFT_PLAYBOOK.md');
const CHECKLIST_PATH = path.join(__dirname, 'CHECKLIST.md');

const slugify = s => String(s || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'site';
const tsNow = () => new Date().toISOString().replace(/[:.tz]/gi, '-').slice(0, 19);   // npm-name-safe (no 'T')

function readFileSafe(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }
function readPlaybook() { return readFileSafe(PLAYBOOK_PATH); }
function readCraft() { return readFileSafe(CRAFT_PATH); }
function readChecklist() { return readFileSafe(CHECKLIST_PATH); }

// Run one agentic `claude -p` session in the project dir. Returns { ok, output, durationMs }.
function runAgent(prompt, projectDir, { model = 'sonnet', timeoutMs = 2_700_000, onProgress } = {}) {
  return new Promise(resolve => {
    const t0 = Date.now();
    let bin; try { bin = resolveClaudeBin(); } catch { bin = 'claude'; }
    const args = ['-p', '--model', model, '--permission-mode', 'bypassPermissions', '--add-dir', projectDir];
    let child;
    try {
      child = spawn(bin, args, { cwd: projectDir, windowsHide: true, env: process.env });
    } catch (e) { return resolve({ ok: false, output: String(e?.message ?? e), durationMs: 0 }); }
    let out = '';
    const cap = 8 * 1024 * 1024;
    child.stdout?.on('data', d => { if (out.length < cap) out += d.toString(); });
    child.stderr?.on('data', () => {});
    const timer = setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, timeoutMs);
    const tick = setInterval(() => { onProgress?.({ status: 'working', elapsed: Math.round((Date.now() - t0) / 1000) }); }, 15_000);
    child.on('error', e => { clearTimeout(timer); clearInterval(tick); resolve({ ok: false, output: String(e?.message ?? e), durationMs: Date.now() - t0 }); });
    child.on('close', code => { clearTimeout(timer); clearInterval(tick); resolve({ ok: code === 0, output: out, durationMs: Date.now() - t0 }); });
    try { child.stdin?.write(prompt); child.stdin?.end(); } catch {}
  });
}

// Run `npm run build` and return { ok, errors } (last chunk of output on failure). Fast-ish gate for the loop.
function quickBuild(projectDir) {
  try {
    const r = spawnSync('npm', ['run', 'build'], { cwd: projectDir, encoding: 'utf8', timeout: 300_000, env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' }, maxBuffer: 24 * 1024 * 1024 });
    const out = ((r.stdout || '') + '\n' + (r.stderr || '')).trim();
    const ok = r.status === 0;
    return { ok, errors: ok ? '' : out.slice(-6000) };
  } catch (e) { return { ok: false, errors: String(e?.message ?? e) }; }
}

const SYSTEM = `You are an award-winning senior frontend + design engineer from a top studio (think Obys / Active
Theory / Locomotive). You build BESPOKE websites at Awwwards Site-of-the-Day level — not generic, never
template-looking, and never "AI-generated"-looking. You have strong art-directed taste: a distinctive
visual identity, custom interactions, real craft and texture, and confident composition. You write
complete, real, production code (no stubs, no lorem), and you VERIFY it compiles before finishing.`;

function buildPrompt({ brief, stack, playbook, craft, checklist }) {
  return [
    SYSTEM, '',
    '# YOUR TASK: design + build a BESPOKE, award-tier website (not a generic AI landing page)',
    `## What to build\n${brief}`, '',
    `## Stack (already scaffolded here)\n${stack.summary}\n${stack.notes || ''}`,
    'The project is already created (Next.js App Router + TS + Tailwind, with gsap, lenis, framer-motion, three, @react-three/fiber, @react-three/drei installed). Work INSIDE the project root. Build the real site here.', '',
    '## PLAYBOOK 1 — design foundation (tokens, scroll/motion code patterns). Use it.',
    playbook || '(foundation playbook unavailable)', '',
    '## PLAYBOOK 2 — CRAFT: how to look BESPOKE, not AI-generated. OBEY the ANTI-AI BAN LIST.',
    craft || '(craft playbook unavailable — at minimum: pick a DISTINCTIVE identity (NOT Inter + navy→purple gradient), use a display typeface with personality + an owned non-blue accent, add grain/texture, build CUSTOM buttons with real hover/press/focus, include ONE signature interaction, and use art-directed asymmetric layouts — never centered-hero + even 3-column emoji cards.)', '',
    ...(checklist ? [
      '## DEFINITION OF DONE — the quality checklist this site will be AUTO-AUDITED against',
      'An automated auditor (build + Playwright at 1440 & 375) will FAIL the build on any unmet critical/major item below, and you will be sent back to fix them. Satisfy them the FIRST time. Pay special attention to the things auto-audits catch: zero console/hydration/page errors, no 404s, no broken images, no horizontal scroll, no text clipped past the viewport edge, no raw HTML entities (&amp; etc.), no lorem/placeholder, real <title>+meta description+og tags, html lang + img alt, a custom display font (not Inter/Arial), and — for animated/3D sites — the <canvas> must render VISIBLE pixels (not black-on-black) and reveal targets must NOT be stuck at opacity:0 after scroll. If you use an R3F/WebGL <canvas>, set `gl={{ preserveDrawingBuffer: true }}` so the auditor can sample it, and make the scene LIT + on-camera (never gated off under reduced-motion — show a static pose instead).',
      checklist, '',
    ] : []),
    '## Deliverables (one cohesive, art-directed design language)',
    '1. **Pick a DISTINCTIVE identity** from the craft playbook that fits THIS product — a non-Inter type pairing (a display face with character) + an OWNED color identity that is NOT the default navy/indigo→purple gradient. Implement it as tokens (tailwind + globals.css + app/fonts.ts via next/font).',
    '2. **Real brand + premium copy** throughout (invent a fitting brand; specific, confident, no lorem).',
    '3. **A striking, art-directed hero** — asymmetric/editorial composition with oversized type and a real focal visual; NOT a centered headline on a glowing gradient. Add a first-visit intro/hero entrance choreography.',
    '4. **Custom components:** ship the craft playbook\'s custom buttons (magnetic/spotlight CTA, text-slide button, animated nav link) — every interactive element has a custom hover/press/focus state. No browser/shadcn defaults.',
    '5. **ONE signature "wow" interaction** (pick one from the craft playbook: velocity marquee / clip-reveal links / count-up tickers / hover-image-reveal / custom cursor) — done well.',
    '6. **Texture + detail:** a grain/noise overlay, the 1px top-highlight border trick, custom animated underlines, monospace eyebrows/section counters — at least 5 craft micro-details.',
    '7. **Art-directed sections:** vary the layout per section (use the craft layout kit — asymmetric, full-bleed, overlap, scale-contrast, alternating rows, big numbered list, sticky-scroll). NO two adjacent sections share the same layout. Each section feels different.',
    '8. **Scroll storytelling:** Lenis + GSAP ScrollTrigger — ONE pinned/scrubbed or layered-parallax moment + tasteful reveals. SSR-safe, cleaned up.',
    '9. **Expensive motion:** use the craft motion tokens (custom easings + springs); fast snappy UI, choreographed reveals — never linear/uniform/everything-fades-at-once.',
    '10. **Polish & correctness:** responsive (re-tune motion on mobile), full prefers-reduced-motion fallback, WCAG AA + keyboard + semantics + alt, 60fps (transform/opacity only).', '',
    '## HARD RULES (non-negotiable)',
    '- Do NOT enable `exactOptionalPropertyTypes` or `noUncheckedIndexedAccess` in tsconfig — they break builds. Keep the scaffold\'s sane tsconfig.',
    '- Use art-directed media that always loads (CSS/SVG art, gradients, or stable Unsplash URLs with params) — NEVER broken images.',
    '- Code-split heavy 3D (`dynamic(() => import(...), { ssr: false })`); keep initial JS lean.',
    '- It must NOT look like a generic AI/template site — re-read the ANTI-AI BAN LIST and make sure you violate none of it.',
    '- **It MUST `npm run build` with ZERO errors.** When done, RUN `npm run build` yourself, fix every error, and repeat until it builds cleanly. Do not finish until it passes.',
    ANTI_STUB_RULES,
  ].join('\n');
}

// De-AI craft elevation pass: a fresh critical look that hunts the generic tells and elevates the site.
function polishPrompt({ brief, craft }) {
  return [
    SYSTEM, '',
    '# CRAFT REVIEW + ELEVATION PASS',
    `The website in this directory (a "${brief}") is built and compiles. Your job: critically review it like an Awwwards judge and ELEVATE it so it looks BESPOKE and hand-crafted — not AI-generated. Actually edit the files.`, '',
    '## Use this CRAFT playbook — especially the ANTI-AI BAN LIST',
    craft || '(craft playbook unavailable)', '',
    '## Do this',
    '1. Open the site\'s pages/components and judge them against the ANTI-AI BAN LIST. For EVERY tell present, fix it: replace any generic navy/indigo→purple gradient + soft-glow background with the owned identity; ensure the typeface has personality (not plain Inter); break any centered-hero / even-3-column-emoji-card cliché into art-directed asymmetric layouts; add grain/texture if missing.',
    '2. Ensure CUSTOM buttons + a custom state on every interactive element; ensure ONE strong signature interaction exists and works; add craft micro-details (animated underlines, mono eyebrows, section counters, 1px highlight borders).',
    '3. Upgrade the motion to the craft tokens (custom easings/springs, choreographed — not uniform fades).',
    '4. Make adjacent sections visually distinct (vary layouts).',
    'Keep all real content/sections — elevate, don\'t delete. Keep it responsive + reduced-motion + accessible.', '',
    '## HARD RULE: when finished, RUN `npm run build` and confirm it still passes with ZERO errors. Fix anything you broke. Do not finish until it builds.',
    ANTI_STUB_RULES,
  ].join('\n');
}

function fixPrompt(errors) {
  return [
    SYSTEM, '',
    '# FIX THE BUILD',
    'The website in this directory does not compile. Here is the `npm run build` output:', '',
    '```', String(errors || '').slice(-6000), '```', '',
    'Fix every error so `npm run build` passes with ZERO errors. Prefer correct fixes (proper types, imports, props) over deleting features. If a tsconfig flag like `exactOptionalPropertyTypes`/`noUncheckedIndexedAccess` is causing noise, you may relax THOSE two flags (keep `strict`). Do not remove real sections or content. When done, RUN `npm run build` and confirm it passes before finishing.',
    ANTI_STUB_RULES,
  ].join('\n');
}

// Audit-fix pass: the site builds, but the automated auditor found real defects (broken images, console
// errors, cutoff text, invisible canvas, stuck reveals, missing meta…). Send the agent the exact failures.
function auditPrompt({ brief, failures, craft }) {
  return [
    SYSTEM, '',
    '# FIX AUDIT FAILURES',
    `The website in this directory (a "${brief}") compiles, but an automated auditor (a real build + a headless Chromium walkthrough at 1440px and 375px, scrolling the whole page) found defects that a top studio would never ship. Fix EVERY item below at its ROOT CAUSE — actually edit the files. These are real, observed problems, not style opinions.`, '',
    '## Auditor failures (severity · category · check-id: detail)',
    failures || '(none)', '',
    '## How to fix the high-signal ones',
    '- **anim.canvasRenders (canvas blank / visiblePixels low):** the 3D/canvas is rendering but invisible — almost always black-on-black material, an unlit scene, an object off-camera/too small, a never-loading external HDR (drei <Environment preset> that fetches and suspends), or the component gated off (e.g. returns null under prefers-reduced-motion). Give it a LIGHT material + real lights, frame it on-camera, drop external-HDR dependencies, and on reduced-motion render a STATIC visible pose (do not hide it). ALSO set `gl={{ preserveDrawingBuffer: true }}` on the R3F <Canvas> (or the WebGLRenderer) so the canvas pixels can be verified — without it a perfectly-rendering canvas reads as blank.',
    '- **anim.revealsVisible (content stuck invisible after scroll):** a ScrollTrigger/IntersectionObserver reveal set opacity:0 (or clip-path inset 100%) and never fired. Ensure triggers actually run (correct start/trigger, refresh on load, SSR-safe), and that the final state is opacity:1. Never let content be permanently hidden.',
    '- **layout.noCutoff / noHScroll:** text or boxes spill past the viewport edge — fix with clamp() type, min-w-0, flex/grid wrapping, overflow management, and responsive sizing. Re-check at BOTH 1440 and 375.',
    '- **assets.noBrokenImages / no404:** replace any failing image/URL with art that always loads (CSS/SVG/gradient or a stable Unsplash URL with sizing params). Remove requests that 404.',
    '- **runtime.noConsoleErrors / noHydration / noPageErrors:** eliminate the cause (SSR/client mismatch, undefined access, bad hook deps) — do not suppress.',
    '- **content.noRawEntities:** render real characters in JSX ("Care & recycle", not "Care &amp; recycle").',
    '- **seo.* / a11y.* / design.customDisplayFont:** add real <title>+meta description+og tags via Next metadata, html lang, img alt; ensure the display font is a real custom face (not Inter/Arial/system).',
    craft ? '\n(Keep within the craft language already established — elevate, do not blandify.)' : '',
    '\n## HARD RULE: when finished, RUN `npm run build` and confirm it still passes with ZERO errors. Fix anything you broke. Do not remove real sections — fix them.',
    ANTI_STUB_RULES,
  ].join('\n');
}

export async function buildSolo(options = {}) {
  const { brief = '', stack: stackHint, outDir, onProgress, maxFixRounds = 4, model = 'sonnet', dryRun = false, polish = true,
          audit = true, maxAuditRounds = 3 } = options;
  const stack = stackHint && typeof stackHint === 'object' ? stackHint : resolveStack(stackHint || brief);
  const projectDir = outDir || path.join(REPO_ROOT, 'workspace', 'builder', 'out', `${slugify(brief)}-${tsNow()}`);
  const log = [];
  const emit = (phase, status, extra = {}) => { onProgress?.({ phase, status, ...extra }); log.push(`[${phase}] ${status}`); };

  if (dryRun) {
    return { ok: true, projectDir, mode: 'solo', report: `# Solo build (dry-run)\nBrief: ${brief}\nStack: ${stack.id}\nWould: scaffold → 1 build agent (${model}, playbook+craft+checklist) → build-green → ${polish ? 'de-AI polish pass → build-green → ' : ''}${audit ? `audit→fix loop (≤${maxAuditRounds} rounds) until the auto-checklist is green` : '(no audit)'} (≤${maxFixRounds} build fixes).`, dryRun: true };
  }

  const playbook = readPlaybook();
  const craft = readCraft();
  const checklist = readChecklist();

  // 1. Scaffold (create-next-app + animation libs; guaranteed-buildable base)
  emit('scaffold', 'start');
  let scaffold = { ok: true };
  try { if (stack.scaffold) scaffold = await stack.scaffold(projectDir); } catch (e) { scaffold = { ok: false, error: String(e?.message ?? e) }; }
  if (!existsSync(path.join(projectDir, 'package.json'))) {
    return { ok: false, projectDir, mode: 'solo', error: `scaffold failed: ${scaffold.error || 'no package.json produced'}`, report: '' };
  }
  emit('scaffold', scaffold.fallback ? 'done (fallback)' : 'done');

  // deterministic build-until-green loop — guarantees it compiles.
  let rounds = 0;
  const buildGreen = async () => {
    let v = quickBuild(projectDir);
    while (!v.ok && rounds < maxFixRounds) {
      rounds++;
      emit('fix', `round ${rounds} — build failing, repairing`);
      const fixed = await runAgent(fixPrompt(v.errors), projectDir, { model: 'sonnet', timeoutMs: 1_500_000, onProgress: e => emit('fix', `round ${rounds} working ${e.elapsed}s`) });
      if (!fixed.ok && !existsSync(path.join(projectDir, 'package.json'))) break;
      v = quickBuild(projectDir);
    }
    return v;
  };

  // 2. ONE agent designs + builds the whole bespoke site (foundation + craft + checklist).
  emit('build', 'start', { model, playbook: playbook ? `${playbook.length}c` : 'missing', craft: craft ? `${craft.length}c` : 'missing', checklist: checklist ? `${checklist.length}c` : 'missing' });
  const built = await runAgent(buildPrompt({ brief, stack, playbook, craft, checklist }), projectDir, { model, timeoutMs: 2_700_000, onProgress: e => emit('build', `working ${e.elapsed}s`) });
  emit('build', built.ok ? 'agent done' : `agent exited (${(built.output || '').slice(0, 80)})`);
  let verify = await buildGreen();
  emit('verify', verify.ok ? 'build passes ✓' : `build failing after ${rounds} fix(es)`);

  // 3. De-AI craft polish pass — elevate against the anti-AI ban list, then re-green.
  if (polish && verify.ok && craft) {
    emit('polish', 'start (de-AI craft elevation)');
    await runAgent(polishPrompt({ brief, craft }), projectDir, { model, timeoutMs: 2_100_000, onProgress: e => emit('polish', `working ${e.elapsed}s`) });
    verify = await buildGreen();
    emit('polish', verify.ok ? 'polished + builds ✓' : 'polished but build failing');
  }

  // 4. AUDIT → FIX loop — the deterministic "follow the checklist until done" gate. Build + Playwright
  //    walkthrough at 1440 & 375; feed the exact failures to a fix agent; re-green; re-audit; repeat.
  let auditReport = null;
  let auditRounds = 0;
  if (audit && verify.ok) {
    const wantCanvas = /\b(3d|webgl|three|shoe|model|scene|canvas|particle)\b/i.test(brief);
    emit('audit', 'start (build + headless walkthrough at 1440 & 375)');
    auditReport = await auditSite(projectDir, { screenshotDir: projectDir, requireCanvas: wantCanvas }).catch(e => ({ ok: false, fails: [{ severity: 'major', category: 'audit', id: 'audit.error', detail: String(e?.message ?? e), pass: false }], checks: [], summary: { total: 0, passed: 0, failed: 1, critical: 0, major: 1, minor: 0 }, screenshots: [] }));
    emit('audit', `round 0 — ${auditReport.summary.passed}/${auditReport.summary.total} pass · ${auditReport.summary.critical}C/${auditReport.summary.major}M failing`);
    while (!auditReport.ok && auditRounds < maxAuditRounds) {
      auditRounds++;
      const failures = failuresForAgent(auditReport);
      emit('audit', `round ${auditRounds} — fixing ${auditReport.summary.critical + auditReport.summary.major} blocking issue(s)`);
      await runAgent(auditPrompt({ brief, failures, craft }), projectDir, { model, timeoutMs: 2_100_000, onProgress: e => emit('audit', `round ${auditRounds} working ${e.elapsed}s`) });
      verify = await buildGreen();                       // they may have touched code; keep it compiling
      if (!verify.ok) { emit('audit', `round ${auditRounds} — build broke during fixes; repairing`); }
      auditReport = await auditSite(projectDir, { screenshotDir: projectDir, requireCanvas: wantCanvas }).catch(e => auditReport);
      emit('audit', `round ${auditRounds} — ${auditReport.summary.passed}/${auditReport.summary.total} pass · ${auditReport.summary.critical}C/${auditReport.summary.major}M failing`);
    }
    emit('audit', auditReport.ok ? `green ✓ (${auditRounds} round(s))` : `${auditReport.summary.critical}C/${auditReport.summary.major}M still failing after ${auditRounds} round(s)`);
  }

  // 5. Final full verify for the report.
  let full = null;
  try { full = await verifyProject(projectDir); } catch {}

  const auditGreen = !audit || (auditReport ? auditReport.ok : false);
  const failList = auditReport ? failuresForAgent(auditReport) : '';
  const report = [
    '# Helm Website Build (solo mode)', '',
    `**Brief:** ${brief}`,
    `**Stack:** ${stack.id} · **Build:** 1 agent (${model}) + ${polish ? 'de-AI polish pass + ' : ''}${rounds} build fix(es)${audit ? ` + ${auditRounds} audit round(s)` : ''}`,
    `**Playbooks:** foundation ${playbook ? '✓' : '✗'} · craft ${craft ? '✓' : '✗'} · checklist ${checklist ? '✓' : '✗'}`,
    `**Project:** \`${projectDir}\``,
    `**Compiles:** ${verify.ok ? '✓ npm run build passes' : '✗ still failing'}`,
    audit && auditReport ? `**Audit:** ${auditReport.ok ? '✓ all critical + major checks pass' : '⚠️ failures remain'} — ${auditReport.summary.passed}/${auditReport.summary.total} pass (${auditReport.summary.critical} critical, ${auditReport.summary.major} major, ${auditReport.summary.minor} minor failing)` : '',
    full ? `**Verify:** ${full.steps.map(s => `${s.name}:${s.ok ? '✓' : '✗'}`).join('  ')}` : '',
    '', '## How it was built',
    '- ONE cohesive agent designed + built the whole site from the foundation + craft (anti-AI) playbooks + the quality checklist (definition of done).',
    '- A de-AI polish pass elevated it against the anti-AI ban list (bespoke identity, custom buttons, a signature interaction, texture, art-directed layouts).',
    '- A deterministic build-until-green loop guaranteed it compiles.',
    audit ? '- An automated auditor (real build + headless Chromium walkthrough at 1440 & 375) checked the auto-verifiable checklist items and looped a fix agent until the critical + major items were green.' : '',
    audit && auditReport && !auditReport.ok ? `\n## Remaining audit failures\n${failList}` : '',
    (verify.ok && auditGreen) ? '\nRun it: `cd ' + projectDir + ' && npm run dev`' : '\n(Issues remain — see above.)',
  ].filter(Boolean).join('\n');

  return { ok: verify.ok && auditGreen, projectDir, mode: 'solo', report, verify: full, compiles: verify.ok,
           fixRounds: rounds, audit: auditReport, auditRounds };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const brief = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ');
  const dry = process.argv.includes('--dry-run');
  buildSolo({ brief: brief || 'a premium product landing site', dryRun: dry, onProgress: e => console.error(`  · [${e.phase}] ${e.status}`) })
    .then(r => { console.log('\n' + r.report); console.log(`\n${r.ok ? '✅ builds' : '⚠️ build issues'} — ${r.projectDir}`); })
    .catch(e => { console.error('solo build failed:', e?.stack || e); process.exit(1); });
}
