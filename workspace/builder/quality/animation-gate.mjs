import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';





const MAX_FILES      = 2000;
const MAX_FILE_BYTES = 512 * 1024;

const SKIP_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', '.git', '.helm-build',
  '.turbo', '.vercel', 'out', '.output', '.nuxt', '.svelte-kit',
]);


const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.sass']);


const ANIMATION_LIBS = ['gsap', 'framer-motion', 'lenis', 'three'];



const JANK_PROPS = ['width', 'height', 'top', 'left', 'bottom', 'right', 'margin', 'padding'];




const JANK_RE = new RegExp(
  `(?:animate|transition|gsap\\.(?:to|from|fromTo|set))\\s*[({][^;{]*?\\b(${JANK_PROPS.join('|')})\\s*:`,
  'g',
);





function* walkFiles(dir, exts) {
  const stack = [dir];
  let count = 0;
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); }
    catch { continue; }

    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(full);
        continue;
      }
      if (!e.isFile()) continue;
      if (exts && !exts.has(path.extname(e.name).toLowerCase())) continue;
      if (++count > MAX_FILES) return;
      yield full;
    }
  }
}


function safeRead(filePath) {
  try {
    const st = statSync(filePath);
    if (st.size > MAX_FILE_BYTES) return null;
    return readFileSync(filePath, 'utf8');
  } catch { return null; }
}





function checkAnimationLibs(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) {
    return { present: [], advisory: 'No package.json found — library check skipped.' };
  }

  let pkg;
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); }
  catch (e) { return { present: [], advisory: `package.json parse error: ${e.message}` }; }

  const allDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

  const present = ANIMATION_LIBS.filter(lib => allDeps.some(d => d === lib || d.startsWith(lib + '/')));

  const msg = present.length
    ? `Animation libs present: ${present.join(', ')}.`
    : `No premium animation libs found (${ANIMATION_LIBS.join(', ')} not in package.json) — advisory.`;

  return { present, advisory: msg };
}





function checkReducedMotion(projectDir) {

  const cssRe = /prefers-reduced-motion/;

  const matchMediaRe = /matchMedia\s*\(\s*['"].*prefers-reduced-motion/;
  // Pattern C: hook import — useReducedMotion (framer-motion / custom)
  const hookRe = /useReducedMotion/;

  for (const filePath of walkFiles(projectDir, SOURCE_EXTS)) {
    const content = safeRead(filePath);
    if (!content) continue;
    if (cssRe.test(content) || matchMediaRe.test(content) || hookRe.test(content)) {
      return { honored: true, file: path.relative(projectDir, filePath) };
    }
  }
  return { honored: false };
}

// ---------------------------------------------------------------------------
// Check 3 — smooth scroll / scroll choreography
// ---------------------------------------------------------------------------

function checkScrollChoreography(projectDir) {
  let lenisFound = false;
  let scrollTriggerFound = false;

  for (const filePath of walkFiles(projectDir, SOURCE_EXTS)) {
    const content = safeRead(filePath);
    if (!content) continue;
    // Lenis import or instantiation
    if (!lenisFound && /\blenis\b/i.test(content)) lenisFound = true;
    // GSAP ScrollTrigger registration or usage
    if (!scrollTriggerFound && /ScrollTrigger/i.test(content)) scrollTriggerFound = true;
    // Short-circuit once both found
    if (lenisFound && scrollTriggerFound) break;
  }

  const parts = [];
  if (lenisFound) parts.push('Lenis smooth scroll');
  if (scrollTriggerFound) parts.push('ScrollTrigger');

  return {
    lenisFound,
    scrollTriggerFound,
    advisory: parts.length
      ? `Scroll choreography wired: ${parts.join(' + ')}.`
      : 'No Lenis or ScrollTrigger usage found — advisory (add for premium scroll storytelling).',
  };
}





function checkJankRisk(projectDir) {

  const samples = [];

  outer:
  for (const filePath of walkFiles(projectDir, SOURCE_EXTS)) {

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.css' || ext === '.scss' || ext === '.sass') continue;

    const content = safeRead(filePath);
    if (!content) continue;

    const lines = content.split('\n');
    const rel = path.relative(projectDir, filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (JANK_RE.test(line)) {

        JANK_RE.lastIndex = 0;
        samples.push({ file: rel, line: i + 1, excerpt: line.trim().slice(0, 100) });
        if (samples.length >= 5) break outer;
      }
      JANK_RE.lastIndex = 0;
    }
  }

  const advisory = samples.length
    ? `Jank risk: ${samples.length} location(s) animate layout-affecting props (width/height/top/left/…). ` +
      `Use transform/opacity for 60 fps. Samples: ` +
      samples.map(s => `${s.file}:${s.line}`).join(', ') + '.'
    : 'No layout-prop animation detected.';

  return { samples, advisory };
}





function checkHeavyAssets(projectDir) {


  const heavyLibs = ['three', '@react-three/fiber', '@react-three/drei'];
  const staticImportRe = /^import\s+/;

  const dynamicRe = /dynamic\s*\(\s*\(\s*\)\s*=>|import\s*\(|React\.lazy/;

  const nonLazyFiles = [];

  for (const filePath of walkFiles(projectDir, SOURCE_EXTS)) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.css' || ext === '.scss' || ext === '.sass') continue;

    const content = safeRead(filePath);
    if (!content) continue;

    const hasHeavy = heavyLibs.some(lib => content.includes(`'${lib}'`) || content.includes(`"${lib}"`));
    if (!hasHeavy) continue;


    if (!dynamicRe.test(content)) {

      const lines = content.split('\n');
      for (const line of lines) {
        if (staticImportRe.test(line) && heavyLibs.some(lib => line.includes(lib))) {
          nonLazyFiles.push(path.relative(projectDir, filePath));
          break;
        }
      }
    }
  }

  const advisory = nonLazyFiles.length
    ? `Heavy-asset laziness: ${nonLazyFiles.length} file(s) statically import 3D/heavy libs without dynamic() / React.lazy. ` +
      `Consider code-splitting. Files: ${nonLazyFiles.slice(0, 3).join(', ')}.`
    : 'No heavy 3D assets found, or they are dynamically imported.';

  return { nonLazyFiles, advisory };
}






export function animationGate(projectDir) {
  try {

    const libCheck      = checkAnimationLibs(projectDir);
    const rmCheck       = checkReducedMotion(projectDir);
    const scrollCheck   = checkScrollChoreography(projectDir);
    const jankCheck     = checkJankRisk(projectDir);
    const heavyCheck    = checkHeavyAssets(projectDir);



    const hasCriticalFail = libCheck.present.length > 0 && !rmCheck.honored;


    const lines = [];


    lines.push(`[LIBS] ${libCheck.advisory}`);


    if (rmCheck.honored) {
      lines.push(`[REDUCED-MOTION] Honored (found in ${rmCheck.file}).`);
    } else if (libCheck.present.length > 0) {
      lines.push(`[REDUCED-MOTION] CRITICAL — animation libs present (${libCheck.present.join(', ')}) but no prefers-reduced-motion handling found. Add a CSS media query, matchMedia check, or useReducedMotion hook.`);
    } else {
      lines.push(`[REDUCED-MOTION] Not found — advisory (no animation libs detected).`);
    }


    lines.push(`[SCROLL] ${scrollCheck.advisory}`);


    lines.push(`[JANK] ${jankCheck.advisory}`);


    lines.push(`[HEAVY-ASSETS] ${heavyCheck.advisory}`);

    return {
      name: 'animation',
      ok: !hasCriticalFail,
      details: lines.join('\n'),
    };
  } catch (err) {

    return {
      name: 'animation',
      ok: true,
      details: `[INTERNAL-ERROR] animationGate threw unexpectedly: ${err?.message ?? String(err)}`,
    };
  }
}





if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const os = await import('node:os');

  let pass = true;

  function assert(cond, msg) {
    if (!cond) { console.error(`  FAIL: ${msg}`); pass = false; }
    else        { console.log (`  PASS: ${msg}`); }
  }


  function mkProject(files) {
    const dir = mkdtempSync(path.join(os.default.tmpdir(), 'anim-gate-test-'));
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(dir, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content, 'utf8');
    }
    return dir;
  }




  const dirA = mkProject({
    'package.json': JSON.stringify({
      dependencies: { 'framer-motion': '^11.0.0', react: '^18' },
      scripts: { build: 'next build' },
    }),
    'components/Hero.tsx': `
import { motion } from 'framer-motion';
export function Hero() {
  return <motion.div animate={{ opacity: 1 }}>Hello</motion.div>;
}
`,
    'styles/global.css': `
body { margin: 0; }
.fade-in { opacity: 1; }
`,
  });

  try {
    const resultA = animationGate(dirA);
    assert(resultA.name === 'animation', 'Test A: gate name is "animation"');
    assert(typeof resultA.ok === 'boolean', 'Test A: ok is boolean');
    assert(typeof resultA.details === 'string', 'Test A: details is string');
    assert(resultA.ok === false, 'Test A: ok is false (framer-motion present, no reduced-motion)');
    assert(resultA.details.includes('CRITICAL'), 'Test A: details mentions CRITICAL');
    assert(resultA.details.includes('framer-motion'), 'Test A: details names the lib');
  } finally {
    try { rmSync(dirA, { recursive: true, force: true }); } catch {  }
  }




  const dirB = mkProject({
    'package.json': JSON.stringify({
      dependencies: { 'framer-motion': '^11.0.0', react: '^18' },
      scripts: { build: 'next build' },
    }),
    'components/Hero.tsx': `
import { motion } from 'framer-motion';
export function Hero() {
  return <motion.div animate={{ opacity: 1 }}>Hello</motion.div>;
}
`,
    'styles/global.css': `
body { margin: 0; }
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
`,
  });

  try {
    const resultB = animationGate(dirB);
    assert(resultB.name === 'animation', 'Test B: gate name is "animation"');
    assert(resultB.ok === true, 'Test B: ok is true (reduced-motion honored in CSS)');
    assert(resultB.details.includes('Honored'), 'Test B: details mentions Honored');
  } finally {
    try { rmSync(dirB, { recursive: true, force: true }); } catch {  }
  }




  const dirC = mkProject({
    'package.json': JSON.stringify({
      dependencies: { 'framer-motion': '^11.0.0', react: '^18' },
      scripts: { build: 'next build' },
    }),
    'hooks/useMotion.ts': `
import { useReducedMotion } from 'framer-motion';
export function useMotion() {
  const reduce = useReducedMotion();
  return reduce ? {} : { opacity: 1 };
}
`,
  });

  try {
    const resultC = animationGate(dirC);
    assert(resultC.ok === true, 'Test C: ok is true (useReducedMotion hook found)');
  } finally {
    try { rmSync(dirC, { recursive: true, force: true }); } catch {  }
  }




  const dirD = mkProject({
    'package.json': JSON.stringify({
      dependencies: { react: '^18' },
      scripts: { build: 'next build' },
    }),
    'pages/index.tsx': `export default function Home() { return <h1>Hello</h1>; }`,
  });

  try {
    const resultD = animationGate(dirD);
    assert(resultD.ok === true, 'Test D: ok is true (no animation libs — advisory)');
    assert(!resultD.details.includes('CRITICAL'), 'Test D: no CRITICAL in details');
  } finally {
    try { rmSync(dirD, { recursive: true, force: true }); } catch {  }
  }




  try {
    const resultE = animationGate('/tmp/helm-anim-gate-nonexistent-99xyz');
    assert(typeof resultE.ok === 'boolean', 'Test E: ok is boolean for missing dir');
    assert(typeof resultE.details === 'string', 'Test E: details is string for missing dir');

    assert(resultE.ok === true, 'Test E: ok is true for missing dir (nothing to fail on)');
  } catch {
    assert(false, 'Test E: animationGate must not throw for missing dir');
  }




  const dirF = mkProject({
    'package.json': JSON.stringify({
      dependencies: { gsap: '^3.12.0', lenis: '^1.0.0' },
      scripts: { build: 'vite build' },
    }),
    'src/scroll.ts': `
import Lenis from 'lenis';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
const lenis = new Lenis();
ScrollTrigger.create({ trigger: '.hero', start: 'top top' });
`,
    'src/global.css': `
@media (prefers-reduced-motion: reduce) { * { animation: none; } }
`,
  });

  try {
    const resultF = animationGate(dirF);
    assert(resultF.ok === true, 'Test F: ok is true (gsap+lenis with reduced-motion)');
    assert(resultF.details.includes('Lenis'), 'Test F: Lenis mentioned in details');
    assert(resultF.details.includes('ScrollTrigger'), 'Test F: ScrollTrigger mentioned in details');
  } finally {
    try { rmSync(dirF, { recursive: true, force: true }); } catch {  }
  }

  console.log(`\n${pass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  process.exitCode = pass ? 0 : 1;
}
