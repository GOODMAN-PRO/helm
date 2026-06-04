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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLAYBOOK_PATH = path.join(__dirname, 'WEBSITE_PLAYBOOK.md');

const slugify = s => String(s || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'site';
const tsNow = () => new Date().toISOString().replace(/[:.tz]/gi, '-').slice(0, 19);   // npm-name-safe (no 'T')

function readPlaybook() {
  try { return readFileSync(PLAYBOOK_PATH, 'utf8'); } catch { return ''; }
}

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

const SYSTEM = `You are an award-winning senior frontend + design engineer. You build websites at the level of
apple.com / Stripe / Linear / Awwwards Site of the Day: striking, cohesive, polished, and genuinely
high-craft — never generic or template-looking. You write complete, real, production code (no stubs, no
lorem, no "coming soon"), and you VERIFY your work compiles before you finish.`;

function buildPrompt({ brief, stack, playbook }) {
  return [
    SYSTEM, '',
    '# YOUR TASK: build a complete, premium website',
    `## What to build\n${brief}`, '',
    `## Stack (already scaffolded in this directory)\n${stack.summary}\n${stack.notes || ''}`,
    'The project is already created (Next.js App Router + TypeScript + Tailwind, with gsap, lenis, framer-motion, three, @react-three/fiber, @react-three/drei installed). You are working INSIDE the project root. Build the real site here.', '',
    '## THE DESIGN PLAYBOOK — follow it precisely (this is how you hit the quality bar)',
    playbook || '(playbook unavailable — apply apple/stripe/linear-grade craft: cohesive dark design tokens, a fluid display type scale, generous whitespace, Lenis smooth scroll + GSAP ScrollTrigger reveals, Framer Motion micro-interactions, a striking hero, prefers-reduced-motion support, and impeccable polish.)', '',
    '## Deliverables (do ALL of this, coherently, in one cohesive design language)',
    '1. **Design system first:** implement the playbook tokens — color (dark theme, surfaces, ONE accent + glow), the fluid type scale (Tailwind fontSize + clamp), spacing/container, radius/shadow, motion tokens — in tailwind config + globals.css + a motion-tokens module + app/fonts.ts (next/font). Everything else uses these tokens.',
    '2. **Real brand + copy:** invent a fitting brand name and write real, specific, premium marketing copy throughout. No placeholders, no lorem.',
    '3. **A striking hero** (pick the right pattern from the playbook for this product) with real motion — a reliable CSS animated-gradient or kinetic-type or scroll-scrub hero. It must look expensive.',
    '4. **All the sections** a great landing page needs for THIS product, well-sequenced and each visually distinct (hero → proof → features → showcase → specs/details → CTA → footer). Real content.',
    '5. **Scroll choreography:** Lenis smooth scroll synced with GSAP ScrollTrigger; reveal-on-scroll, a pinned/scrubbed or parallax moment. SSR-safe, cleaned up.',
    '6. **Micro-interactions:** Framer Motion — button springs, magnetic CTA, scroll-aware nav, hover states on every interactive element.',
    '7. **Polish & correctness:** responsive (re-tune motion on mobile, don\'t just shrink), full prefers-reduced-motion fallback, WCAG AA + keyboard + semantics + alt text, 60fps (transform/opacity only).', '',
    '## HARD RULES (non-negotiable)',
    '- Do NOT enable `exactOptionalPropertyTypes` or `noUncheckedIndexedAccess` in tsconfig — they break builds. Keep the scaffold\'s sane tsconfig.',
    '- Use high-quality placeholder media that always loads (CSS/gradients/SVG art, or stable Unsplash URLs) — NEVER broken images.',
    '- Code-split heavy 3D (`dynamic(() => import(...), { ssr: false })`); keep initial JS lean.',
    '- **It MUST `npm run build` with ZERO errors.** When you finish writing the site, RUN `npm run build` yourself, read the errors, FIX them, and repeat until it builds cleanly. Do not declare done until `npm run build` passes.',
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

export async function buildSolo(options = {}) {
  const { brief = '', stack: stackHint, outDir, onProgress, maxFixRounds = 4, model = 'sonnet', dryRun = false } = options;
  const stack = stackHint && typeof stackHint === 'object' ? stackHint : resolveStack(stackHint || brief);
  const projectDir = outDir || path.join(REPO_ROOT, 'workspace', 'builder', 'out', `${slugify(brief)}-${tsNow()}`);
  const log = [];
  const emit = (phase, status, extra = {}) => { onProgress?.({ phase, status, ...extra }); log.push(`[${phase}] ${status}`); };

  if (dryRun) {
    return { ok: true, projectDir, mode: 'solo', report: `# Solo build (dry-run)\nBrief: ${brief}\nStack: ${stack.id}\nWould: scaffold → 1 build agent (${model}) → build-until-green loop (≤${maxFixRounds}).`, dryRun: true };
  }

  // 1. Scaffold (create-next-app + animation libs; guaranteed-buildable base via stack.scaffold)
  emit('scaffold', 'start');
  let scaffold = { ok: true };
  try { if (stack.scaffold) scaffold = await stack.scaffold(projectDir); } catch (e) { scaffold = { ok: false, error: String(e?.message ?? e) }; }
  if (!existsSync(path.join(projectDir, 'package.json'))) {
    return { ok: false, projectDir, mode: 'solo', error: `scaffold failed: ${scaffold.error || 'no package.json produced'}`, report: '' };
  }
  emit('scaffold', scaffold.fallback ? 'done (fallback)' : 'done');

  // 2. ONE agent builds the whole site, guided by the research playbook.
  const playbook = readPlaybook();
  emit('build', 'start', { model, playbook: playbook ? `${playbook.length} chars` : 'missing' });
  const built = await runAgent(buildPrompt({ brief, stack, playbook }), projectDir, { model, timeoutMs: 2_700_000, onProgress: e => emit('build', `working ${e.elapsed}s`) });
  emit('build', built.ok ? 'agent done' : `agent exited (${built.output.slice(0, 80)})`);

  // 3. Build-until-green loop — deterministic guarantee that it compiles.
  let verify = quickBuild(projectDir);
  let rounds = 0;
  while (!verify.ok && rounds < maxFixRounds) {
    rounds++;
    emit('fix', `round ${rounds} — build failing, repairing`);
    const fixed = await runAgent(fixPrompt(verify.errors), projectDir, { model: 'sonnet', timeoutMs: 1_500_000, onProgress: e => emit('fix', `round ${rounds} working ${e.elapsed}s`) });
    if (!fixed.ok && !existsSync(path.join(projectDir, 'package.json'))) break;
    verify = quickBuild(projectDir);
  }
  emit('verify', verify.ok ? 'BUILD PASSES ✓' : `build still failing after ${rounds} fix round(s)`);

  // 4. Final full verify (typecheck/lint/build/test) for the report.
  let full = null;
  try { full = await verifyProject(projectDir); } catch {}

  const report = [
    '# Helm Website Build (solo mode)', '',
    `**Brief:** ${brief}`,
    `**Stack:** ${stack.id} · **Build agent:** 1 (${model}) + ${rounds} fix round(s)`,
    `**Project:** \`${projectDir}\``,
    `**Compiles:** ${verify.ok ? '✓ npm run build passes' : '✗ still failing'}`,
    full ? `**Verify:** ${full.steps.map(s => `${s.name}:${s.ok ? '✓' : '✗'}`).join('  ')}` : '',
    '', '## How it was built',
    '- One cohesive agent built the entire site from the research-distilled design playbook (no swarm).',
    '- A deterministic build-until-green loop fixed any compile errors before finishing.',
    verify.ok ? '\nRun it: `cd ' + projectDir + ' && npm run dev`' : '\n(Build still has errors — see verify output.)',
  ].filter(Boolean).join('\n');

  return { ok: verify.ok, projectDir, mode: 'solo', report, verify: full, compiles: verify.ok, fixRounds: rounds };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const brief = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ');
  const dry = process.argv.includes('--dry-run');
  buildSolo({ brief: brief || 'a premium product landing site', dryRun: dry, onProgress: e => console.error(`  · [${e.phase}] ${e.status}`) })
    .then(r => { console.log('\n' + r.report); console.log(`\n${r.ok ? '✅ builds' : '⚠️ build issues'} — ${r.projectDir}`); })
    .catch(e => { console.error('solo build failed:', e?.stack || e); process.exit(1); });
}
