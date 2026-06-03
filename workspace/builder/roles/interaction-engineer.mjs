// interaction-engineer.mjs — Micro-Interaction Engineer role.
// Adds polished Framer Motion micro-interactions to every component and page:
// hover/press springs, magnetic CTAs, animated nav, gesture feedback, staggered
// reveals, toast/dialog enter-exit, and input focus motion.
// CONTRACT: §1 Role schema, §2 BuildContext, §8 Award-grade web standard.

import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// System prompt — expert persona
// ---------------------------------------------------------------------------

const SYSTEM = `\
You are a principal micro-interaction engineer whose entire craft is making UIs feel alive, tactile,
and effortless. You are the person teams call when a product looks beautiful but feels "flat" — you
add the layer of physicality that makes every tap, hover, and transition feel intentional.

Your tool of choice is Framer Motion. You know its internals: spring physics, layout animations,
AnimatePresence, useReducedMotion, useMotionValue, useTransform, useScroll, useSpring. You write
motion code that is GPU-friendly (only transform + opacity — never animating layout-triggering
properties like width, height, padding, or top/left). You never reach for CSS transitions when
Framer Motion provides a cleaner API; you never reach for Framer Motion when a CSS transition is
sufficient.

Your motion philosophy:
- Spring > tween for interactive elements. Springs feel physical; tweens feel programmatic.
- Restraint is quality. One extra animation is noise; the right animation is signal.
- Stagger is narrative. When items enter together they compete; when they stagger they tell a story.
- Never animate for decoration — every motion must confirm, orient, or delight the user.
- prefers-reduced-motion is non-negotiable: provide a calm, instant fallback for every motion.
  Use Framer Motion's \`useReducedMotion()\` hook globally and pass it to every variant.
- Performance first: \`will-change: transform\` only where genuinely needed, never spray it.

Motion token system (read from the motion-system artifact; default to these if absent):
\`\`\`
durations : instant 0ms | fast 100ms | normal 200ms | slow 350ms | slower 500ms
easings   : enter  cubic-bezier(0.22, 1, 0.36, 1)   (ease-out-expo — snappy reveal)
            exit   cubic-bezier(0.55, 0, 1, 0.45)   (ease-in-quint — quick dismiss)
            spring { type:'spring', stiffness:400, damping:30 }         (interactive)
            springGentle { type:'spring', stiffness:200, damping:25 }   (layout shifts)
\`\`\`

Interaction catalogue you MUST implement (install framer-motion if it is missing):

1. HOVER / PRESS SPRINGS on buttons + interactive cards
   - Buttons: scale 1→0.97 on tap (whileTap), slight lift (scale 1.02, translateY -1px) on hover.
   - Cards: subtle scale 1→1.015 + shadow elevation on hover; spring physics, not linear.

2. MAGNETIC CTA
   - The primary call-to-action button follows the cursor with a bounded magnetic pull
     (useMotionValue + useSpring + onMouseMove). Magnitude ~20% of button size; eases to rest on leave.

3. ANIMATED HEADER / NAV
   - Show/hide on scroll: header hides on scroll-down (translateY -100%), reveals on scroll-up.
     Use useScroll + useMotionValue + motion.header; add a backdrop-blur fade-in on reveal.
   - Active nav link: underline indicator slides between links with layoutId (shared layout animation).

4. ANIMATED MOBILE MENU
   - Drawer/overlay enters with a spring (x: -100%→0 or y: -20px→0, opacity 0→1, AnimatePresence).
   - Menu items stagger in (staggerChildren 0.04s, delayChildren 0.1s) and stagger out in reverse.

5. INPUT FOCUS MOTION
   - On focus: border/outline scales in (scaleX 0→1) from the left, spring transition.
   - Label floats upward (translateY + scale) if using a floating-label pattern.

6. TOAST / DIALOG ENTER-EXIT
   - Toasts: slide in from the edge (x or y) + fade; stack with layout animation; exit with AnimatePresence.
   - Dialogs: backdrop fades (opacity 0→1); panel enters with scale 0.95→1 + opacity, spring physics;
     exits with scale 1→0.97 + opacity fade, ease-in curve; focus trap remains intact.

7. whileInView STAGGERED REVEALS
   - Section headings: fade-up (y: 24→0, opacity 0→1, once:true, margin '-10% 0px').
   - Card / list grids: stagger children with staggerChildren 0.06s; each child: y:20→0, opacity 0→1.
   - Consistent with the scroll-animation-engineer's choreography — do NOT duplicate GSAP/ScrollTrigger
     logic; Framer Motion handles component-level reveals, GSAP handles scroll-driven scene transitions.

All code must:
- Be production-quality TypeScript with strict types.
- Import \`useReducedMotion\` and short-circuit all motion to instant when it returns true.
- Use framer-motion v11+ API (\`motion\`, \`AnimatePresence\`, hooks from 'framer-motion').
- Wire into the EXISTING component files — do not create parallel "animated" copies.
- Leave no TODO, no stub, no placeholder, no console.log.`;

// ---------------------------------------------------------------------------
// Role definition
// ---------------------------------------------------------------------------

export const roles = [
  {
    id: 'interaction-engineer',
    title: 'Micro-Interaction Engineer',
    phase: 'frontend',
    deps: ['scroll-animation-engineer'],
    model: 'sonnet',
    produces: [],

    system: SYSTEM,

    task(ctx) {
      // Pull motion-system artifact so this role stays in sync with design tokens.
      const motionSystem = ctx.getArtifact?.('motion-system') ?? null;
      const digest = ctx.artifactsDigest();
      const stackNotes = ctx.stack?.notes ?? ctx.stack?.summary ?? '(stack notes unavailable)';

      const motionSection = motionSystem
        ? `\n## Motion-system tokens (from design phase — FOLLOW EXACTLY)\n${motionSystem}\n`
        : `\n## Motion-system tokens\n(No motion-system artifact found — use the defaults from your system prompt.)\n`;

      const digestSection = digest
        ? `\n## Prior specs (component library, design system, scroll system, etc.)\n${digest}\n`
        : '';

      return `\
## Your assignment: add polished micro-interactions across the entire UI

**Product brief:**
${ctx.brief}

**Stack conventions:**
${stackNotes}
${motionSection}${digestSection}
---

### Step 0 — Install framer-motion if missing

Check \`package.json\`. If \`framer-motion\` is absent, install it:
\`\`\`
npm install framer-motion
\`\`\`
(or the project's package manager — check for pnpm-lock.yaml / yarn.lock / bun.lockb first).
After installing, verify the project still type-checks: \`npx tsc --noEmit\`.

---

### Step 1 — Motion utility module

Create \`src/lib/motion.ts\` (or \`src/utils/motion.ts\` — match the existing utils directory):

\`\`\`ts
// Shared motion variants and spring configs derived from the design system tokens.
// Import from here — never hardcode easing/duration values in components.

import { useReducedMotion } from 'framer-motion';

export const springs = {
  interactive : { type: 'spring', stiffness: 400, damping: 30  } as const,
  gentle      : { type: 'spring', stiffness: 200, damping: 25  } as const,
  slow        : { type: 'spring', stiffness: 120, damping: 20  } as const,
};

export const easings = {
  enter : [0.22, 1, 0.36, 1]   as [number,number,number,number],
  exit  : [0.55, 0, 1, 0.45]   as [number,number,number,number],
};

export const durations = { fast: 0.1, normal: 0.2, slow: 0.35, slower: 0.5 };

// Fade-up reveal: for whileInView staggered sections.
export const fadeUp = {
  hidden  : { opacity: 0, y: 24 },
  visible : (reducedMotion: boolean) =>
    reducedMotion ? { opacity: 1, y: 0, transition: { duration: 0 } }
                  : { opacity: 1, y: 0, transition: { ...springs.gentle } },
};

// Stagger container: wrap a grid/list to stagger children.
export const staggerContainer = (reducedMotion: boolean) => ({
  hidden  : {},
  visible : {
    transition: reducedMotion
      ? {}
      : { staggerChildren: 0.06, delayChildren: 0.05 },
  },
});

// Hook: returns motion-safe variants (instant if prefers-reduced-motion).
export function useMotionSafe() {
  const reduced = useReducedMotion();
  return {
    reduced,
    springs,
    easings,
    durations,
    fadeUp,
    staggerContainer: staggerContainer(!!reduced),
  };
}
\`\`\`

Adjust token values to match the motion-system artifact if one exists.

---

### Step 2 — Button & card hover/press springs

Open the project's Button component (\`src/components/ui/button.tsx\` or equivalent).

Wrap the root element with \`motion.button\` (or \`motion(Button)\` if shadcn uses asChild):
- \`whileHover={{ scale: 1.02, y: -1 }}\`
- \`whileTap={{ scale: 0.97 }}\`
- \`transition={springs.interactive}\`
- Gate all motion values behind \`useReducedMotion()\` — when true, pass \`{}\` to whileHover/whileTap.

Open the Card component (\`src/components/ui/card.tsx\` or equivalent).
If the card is interactive (has an onClick or href):
- Wrap root with \`motion.div\`
- \`whileHover={{ scale: 1.015, transition: springs.gentle }}\`
- On reduced motion, skip the scale and only allow opacity transitions.

---

### Step 3 — Magnetic CTA

Find the PRIMARY call-to-action button used in hero/landing sections (look for the largest or most
prominent Button usage in the page files under \`src/app/\`).

Create a \`MagneticButton\` wrapper at \`src/components/ui/magnetic-button.tsx\`:
\`\`\`tsx
// Wraps any button/child element with a bounded magnetic cursor-follow effect.
// Uses useMotionValue + useSpring; falls back to a plain wrapper on reduced motion.
\`\`\`

Implement:
- Track cursor position relative to button centre with \`onMouseMove\`.
- Map cursor offset to x/y motion values (magnitude capped at ±20% of element dimension).
- Smooth with \`useSpring(x, { stiffness: 200, damping: 20 })\`.
- Reset to 0 on \`onMouseLeave\` with spring.
- Wire up with \`useReducedMotion()\` — render children unwrapped when reduced motion is on.
- Replace the hero/landing CTA Button with \`<MagneticButton><Button ...>...</Button></MagneticButton>\`.

---

### Step 4 — Animated header / nav

Open the Header component (\`src/components/ui/navigation/header.tsx\` or layout equivalent).

Show/hide on scroll:
\`\`\`tsx
const { scrollY } = useScroll();
const lastY = useRef(0);
const [hidden, setHidden] = useState(false);
useMotionValueEvent(scrollY, 'change', (y) => {
  setHidden(y > lastY.current && y > 80);
  lastY.current = y;
});
\`\`\`
Wrap the header \`<header>\` in \`<motion.header animate={{ y: hidden ? '-100%' : '0%' }} transition={springs.gentle}>\`.

Active nav link indicator:
- Find the nav link list. Add a \`<motion.span layoutId="nav-indicator"\`/> underline beneath the
  active link. Framer Motion's shared layout animation slides it smoothly between links.
- Gate layoutId-based animation behind \`useReducedMotion()\` — skip layoutId when reduced.

---

### Step 5 — Animated mobile menu

Open the mobile menu component (hamburger + drawer). Wrap the drawer content with \`AnimatePresence\`:
\`\`\`tsx
<AnimatePresence>
  {isOpen && (
    <motion.nav
      initial={{ x: '-100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '-100%', opacity: 0 }}
      transition={springs.gentle}
    >
      <motion.ul
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        exit="hidden"
      >
        {items.map((item) => (
          <motion.li key={item.href} variants={fadeUpItem}>...</motion.li>
        ))}
      </motion.ul>
    </motion.nav>
  )}
</AnimatePresence>
\`\`\`
Provide \`fadeUpItem\` variant (y: 12→0, opacity 0→1). On reduced motion: no translate, instant opacity.

---

### Step 6 — Input focus motion

Open the Input component (\`src/components/ui/forms/input.tsx\` or equivalent).

Add a focus-line underline:
- Render a \`<motion.span\` absolutely positioned at the bottom of the input.
- Use \`useMotionValue\` + \`animate\` driven by a focus boolean state:
  \`scaleX: focused ? 1 : 0\`, \`transformOrigin: 'left'\`, \`transition: springs.interactive\`.
- Color: \`--color-brand\` (from design tokens).
- On reduced motion: instant transition (duration 0).

If the project uses floating labels, animate the label:
- \`animate={{ y: hasValue || focused ? -20 : 0, scale: hasValue || focused ? 0.8 : 1 }}\`
- \`transition={springs.gentle}\`
- \`transformOrigin: 'left'\`

---

### Step 7 — Toast + Dialog enter-exit

**Toast** (open \`src/components/ui/feedback/toast.tsx\` or Sonner config):
Wrap each toast with \`AnimatePresence\`. Each toast item:
\`\`\`tsx
<motion.div
  layout
  initial={{ opacity: 0, y: 20, scale: 0.95 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  exit={{ opacity: 0, y: -10, scale: 0.97, transition: { duration: durations.fast, ease: easings.exit } }}
  transition={springs.interactive}
/>
\`\`\`
On reduced motion: skip y/scale, animate only opacity.

**Dialog** (open \`src/components/ui/feedback/dialog.tsx\` or Radix Dialog):
Backdrop:
\`\`\`tsx
<motion.div
  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
  transition={{ duration: durations.normal, ease: easings.enter }}
/>
\`\`\`
Panel:
\`\`\`tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1, transition: springs.gentle }}
  exit={{ opacity: 0, scale: 0.97, transition: { duration: durations.fast, ease: easings.exit } }}
/>
\`\`\`
Ensure Radix's \`forceMount\` prop is set so AnimatePresence controls visibility, not Radix.
On reduced motion: opacity transitions only.

---

### Step 8 — whileInView staggered reveals

For EACH major page section that contains a heading + content grid (look in \`src/app/\` page files and
any \`src/components/sections/\` directory):

Section heading:
\`\`\`tsx
<motion.h2
  variants={fadeUp}
  initial="hidden"
  whileInView="visible"
  viewport={{ once: true, margin: '-10% 0px' }}
/>
\`\`\`

Card / item grids: wrap the grid container in a motion.div with \`staggerContainer\` variants
(\`initial="hidden" whileInView="visible" viewport={{ once: true }}\`).
Each child card/item uses \`fadeUp\` variants so they enter in sequence.

These reveals must NOT duplicate any GSAP ScrollTrigger animations from scroll-animation-engineer —
if a section already has a GSAP entrance, skip the Framer Motion \`whileInView\` on that element and
only add it to other elements in the section that are not covered by GSAP.

---

### Step 9 — Final verification

After touching every component:
1. Run \`npx tsc --noEmit\` — fix any type errors before finishing.
2. Search for \`TODO\`, \`FIXME\`, \`placeholder\`, \`stub\` in files you touched — remove or implement all.
3. Confirm \`useReducedMotion()\` is guarding every motion in the files you edited.
4. Confirm no layout-triggering CSS properties (width, height, top, left, padding, margin)
   are being animated — only \`transform\` (scale, translate, rotate) and \`opacity\`.

Print a summary: which files were modified, which interactions were added, and confirmation
that the type-check passed.`;
    },
  },
];

// ---------------------------------------------------------------------------
// Self-test (never spawns claude; mocks ctx)
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let ok = true;
  const fail = (msg) => { console.error('FAIL:', msg); ok = false; };

  // 1. Export shape
  if (!Array.isArray(roles))     fail('roles must be an array');
  if (roles.length !== 1)        fail('expected exactly one role');

  const r = roles[0];

  // 2. Required keys
  const REQUIRED = ['id', 'title', 'phase', 'deps', 'model', 'produces', 'system', 'task'];
  for (const key of REQUIRED) {
    if (!(key in r)) fail(`missing key: ${key}`);
  }

  // 3. Correct field values
  if (r.id      !== 'interaction-engineer')   fail(`id wrong: ${r.id}`);
  if (r.title   !== 'Micro-Interaction Engineer') fail(`title wrong: ${r.title}`);
  if (r.phase   !== 'frontend')               fail(`phase wrong: ${r.phase}`);
  if (r.model   !== 'sonnet')                 fail(`model wrong: ${r.model}`);
  if (!Array.isArray(r.deps))                 fail('deps must be an array');
  if (!r.deps.includes('scroll-animation-engineer')) fail('missing dep: scroll-animation-engineer');
  if (!Array.isArray(r.produces))             fail('produces must be an array');
  if (r.produces.length !== 0)                fail('produces must be empty []');

  // 4. System prompt is a rich string
  if (typeof r.system !== 'string' || r.system.length < 200)
    fail('system prompt too short or not a string');

  // 5. task is a function returning a non-empty string
  if (typeof r.task !== 'function') fail('task must be a function');

  const fakeCtx = {
    brief: 'x',
    stack: { summary: 'Next.js', notes: 'framer-motion' },
    artifactsDigest: () => '',
    getArtifact: () => null,
  };

  let taskResult;
  try {
    taskResult = r.task(fakeCtx);
  } catch (e) {
    fail(`task(fakeCtx) threw: ${e.message}`);
  }

  if (typeof taskResult !== 'string' || taskResult.trim().length === 0)
    fail('task(fakeCtx) returned empty or non-string');

  if (ok) {
    console.log('PASS — role id:', r.id);
  } else {
    process.exit(1);
  }
}
