import { fileURLToPath } from 'node:url';





const VISUAL_DESIGNER_SYSTEM = `\
You are a principal visual designer with 15+ years shipping award-winning digital products.
Your taste is informed by Figma's own design system, Linear's typography discipline, Vercel's
restrained palette, and Stripe's obsessive token consistency. You do NOT produce generic Bootstrap
themes or Material clones.

Core beliefs:
- Every color decision needs a semantic reason, not just "it looks nice".
- Type scale is the skeleton of a UI — every step must create clear hierarchy.
- Spacing is a rhythm: base-4 or base-8 grids, never arbitrary pixel values.
- Dark mode is first-class, not an afterthought: design tokens define both modes in lockstep.
- WCAG AA contrast is a floor, not a ceiling. Aim for AAA on body text.
- Motion must earn its place: entrance animations that orient, micro-interactions that confirm.
- Components should feel cohesive without being templated. Personality lives in the details —
  radius, shadow depth, icon weight, button padding.

Your job is to produce a design-system.md artifact that a senior engineer can implement without
asking a single clarifying question. Leave nothing to interpretation. No lorem ipsum, no
"TBD", no "pick a color". Every token has a concrete value.`;

const DESIGN_SYSTEM_ENGINEER_SYSTEM = `\
You are a senior design-system engineer who bridges Figma specs and production code.
You have deep expertise in Tailwind CSS (v3+), shadcn/ui, CSS custom properties, and
the Next.js App Router styling pipeline.

You implement design tokens with zero drift from the spec. Your standards:
- tailwind.config.ts: extend (never replace) the default scale; add every semantic color,
  spacing step, font family, radius, and box-shadow token from the design-system artifact.
- globals.css: declare matching CSS variables for every token so non-Tailwind code and
  shadcn components inherit them. Include :root (light) and .dark blocks.
- The typography base (font-family, font-size, line-height, letter-spacing) is applied via
  @layer base so it cascades automatically.
- shadcn/ui is initialized with \`npx shadcn@latest init\` in non-interactive mode, then
  every config option (baseColor, cssVariables, tailwindConfig path) is patched to match
  the design tokens.
- No placeholder values. No "TODO: add shadow". Every token from the spec appears in the
  output exactly once, correctly named.
- After writing config files, verify the project still type-checks (tsc --noEmit) and that
  the dev server starts (next dev -- dry check or build).

Produce fully working, wired styles — if shadcn needs a components.json, write it; if
globals.css needs @font-face, write it. Complete means complete.`;





export const roles = [
  {
    id: 'ui-visual-designer',
    title: 'UI / Visual Designer',
    phase: 'design',
    deps: ['ux-designer'],
    model: 'opus',
    produces: ['design-system'],

    system: VISUAL_DESIGNER_SYSTEM,

    task(ctx) {

      const digest = ctx.artifactsDigest();
      const stackNote = ctx.stack?.notes ?? ctx.stack?.summary ?? '(stack not yet resolved)';

      return `\
## Your assignment: define the visual design system

**Product brief:**
${ctx.brief}

**Stack context:**
${stackNote}

**Artifacts from prior phases (UX flows, PRD, etc.):**
${digest || '(none yet — derive from the brief)'}

---

### What you must produce

Write a comprehensive design system specification to \`.helm-build/artifacts/design-system.md\`.
Use the following exact top-level sections. Be concrete — every value must be a real value.

#### 1. Brand direction & mood
Two to three sentences capturing the product's visual personality. Name the emotional register
(e.g. "confident, focused, data-dense but not anxious"), the genre (SaaS dashboard / consumer
app / editorial), and the influences (name real reference products if helpful).

#### 2. Color palette
Define every semantic token. Format each as a table with columns:
| Token | Light value (hex) | Dark value (hex) | Usage |

Required tokens (add more as needed for the product):
- \`--color-bg\`, \`--color-bg-subtle\`, \`--color-bg-emphasis\`
- \`--color-surface\`, \`--color-surface-raised\`, \`--color-surface-overlay\`
- \`--color-border\`, \`--color-border-strong\`
- \`--color-text\`, \`--color-text-muted\`, \`--color-text-inverted\`
- \`--color-brand\`, \`--color-brand-hover\`, \`--color-brand-muted\`
- \`--color-accent\`, \`--color-accent-hover\`
- \`--color-success\`, \`--color-warning\`, \`--color-error\`, \`--color-info\`
- \`--color-focus-ring\`

For each token pair verify WCAG AA contrast against the surface it will sit on. State the
contrast ratio (e.g. "4.8:1 AA ✓").

#### 3. Typography
Specify:
- **Font choices**: primary (UI text), secondary (headings/display), monospace (code). Name the
  exact font and its import source (Google Fonts URL, system stack, etc.).
- **Type scale**: a table with columns | Step | Size (rem) | Line-height | Weight | Letter-spacing | Use |
  Minimum 7 steps: xs, sm, base, md, lg, xl, 2xl, 3xl.
- **Body text** defaults (size, line-height, color token, max-width for readable columns).
- **Heading styles** for h1–h4.

#### 4. Spacing, radius & shadow scale
Three tables:
- **Spacing**: | Token | Value (rem/px) | Usage hint | — at least 8 steps (0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16 × base).
- **Border radius**: | Token | Value | Usage |
- **Box shadow**: | Token | Value | Usage |

#### 5. Component visual specs
For each component below, specify: background, border, text color, padding, radius, focus ring,
and every relevant state (default, hover, active, disabled, error). Use the token names from §2–4.

Components to spec:
- Button (primary, secondary, ghost, destructive variants)
- Text input & textarea (default, focus, error, disabled)
- Card / panel (flat, raised, interactive)
- Navigation bar (desktop + mobile breakpoints)
- Badge / pill (status colors from semantic palette)
- Modal / dialog overlay

#### 6. Motion & interaction principles
- **Duration scale**: tokens for instant (0ms), fast (100ms), normal (200ms), slow (350ms), slower (500ms).
- **Easing curves**: at least enter, exit, and spring curves (cubic-bezier values).
- **Principles**: 2–4 rules governing when to animate, what to animate, and what to never animate.
- **Specific interactions**: hover lift on cards, button press feedback, focus ring appearance.

---

After writing the artifact, call \`ctx.setArtifact('design-system', <content>)\` so downstream
roles can read it. Then confirm with a one-line summary of the key design decisions made.

Aim for "best of the best" polish. This spec will be implemented verbatim — write it like you
care about the product.`;
    },
  },

  {
    id: 'design-system-engineer',
    title: 'Design System Engineer',
    phase: 'design',
    deps: ['ui-visual-designer'],
    model: 'sonnet',
    produces: [],

    system: DESIGN_SYSTEM_ENGINEER_SYSTEM,

    task(ctx) {

      const designSystem = ctx.getArtifact('design-system') ?? ctx.artifactsDigest();
      const stackNote = ctx.stack?.notes ?? ctx.stack?.summary ?? '';

      return `\
## Your assignment: implement the design system in the project

**Product brief:**
${ctx.brief}

**Stack:**
${stackNote}

**Design system spec (from the UI Visual Designer):**
${designSystem || '(read from .helm-build/artifacts/design-system.md)'}

---

### Implementation checklist — complete EVERY item; no skipping, no placeholders

#### Step 1 — Tailwind theme configuration
Open (or create) \`tailwind.config.ts\` at the project root.
- Extend \`theme.extend.colors\` with every \`--color-*\` token from the spec,
  using CSS variable references: \`{ brand: 'hsl(var(--color-brand) / <alpha-value>)' }\`.
- Extend \`theme.extend.fontFamily\` for primary, secondary, and monospace fonts.
- Extend \`theme.extend.fontSize\` for every type-scale step (xs → 3xl).
- Extend \`theme.extend.spacing\` for every spacing token.
- Extend \`theme.extend.borderRadius\` for every radius token.
- Extend \`theme.extend.boxShadow\` for every shadow token.
- Extend \`theme.extend.transitionDuration\` and \`theme.extend.transitionTimingFunction\`
  for the motion scale.
- Ensure \`darkMode: 'class'\` is set.
- Keep all default Tailwind utilities intact (extend, do not replace).

#### Step 2 — Global CSS & CSS custom properties
Open (or create) \`src/app/globals.css\` (App Router path).
- In \`@layer base\`, declare two blocks:
  - \`:root\` — light-mode values for every \`--color-*\`, \`--radius-*\`, \`--shadow-*\`,
    \`--duration-*\`, \`--ease-*\` token.
  - \`.dark\` — dark-mode overrides for all color tokens.
- Apply font-family, font-size, line-height, and text color defaults to \`html\` and \`body\`.
- If the fonts are from Google Fonts, add the \`@import url(...)\` at the very top of the file.
  If they are variable fonts, add \`@font-face\` declarations.
- Ensure \`*\` has \`box-sizing: border-box\` and \`0\` margin/padding reset in \`@layer base\`.

#### Step 3 — Initialize shadcn/ui (if stack uses it)
Check \`ctx.stack.notes\` / the brief for "shadcn" — if present:
1. Run: \`npx shadcn@latest init --yes --base-color neutral --css-variables\`
   (non-interactive; answer yes to all prompts via --yes flag or stdin echo).
2. Patch the generated \`components.json\` so \`tailwind.config\` points to the correct path
   and \`cssVariables\` is true.
3. Add the Button, Input, Card, Badge, and Dialog components:
   \`npx shadcn@latest add button input card badge dialog --yes\`
4. Verify \`components/ui/button.tsx\` references your \`--color-brand\` token correctly.
   Patch if shadcn defaulted to a different variable name.

#### Step 4 — Base typography component
Create \`src/components/Typography.tsx\` (or \`.jsx\`) exporting named components:
\`Display\`, \`H1\`, \`H2\`, \`H3\`, \`H4\`, \`Body\`, \`BodySm\`, \`Label\`, \`Code\`.
Each applies the correct Tailwind classes from the type scale. No inline styles.

#### Step 5 — Smoke check
After writing all files, run:
\`\`\`
npx tsc --noEmit 2>&1 | tail -20
\`\`\`
If there are errors, fix them. Do not leave type errors. If the project has a \`package.json\`
lint script, run it too.

---

### Output contract
Write every file directly to the project directory. Do not write placeholders.
When done, print a summary: files written, shadcn components installed (if applicable),
and one sentence confirming the smoke check passed.`;
    },
  },
];

// ---------------------------------------------------------------------------
// Self-test (never spawns claude; mocks everything)
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let pass = true;
  const fail = (msg) => { console.error(`FAIL: ${msg}`); pass = false; };

  // 1. Correct number of roles
  if (!Array.isArray(roles) || roles.length !== 2) {
    fail(`expected 2 roles, got ${Array.isArray(roles) ? roles.length : typeof roles}`);
  }

  // 2. Each role has required keys with correct types
  const REQUIRED_KEYS = ['id', 'title', 'phase', 'deps', 'model', 'produces', 'system', 'task'];
  for (const role of roles) {
    for (const key of REQUIRED_KEYS) {
      if (!(key in role)) fail(`role ${role.id ?? '?'} missing key: ${key}`);
    }
    if (typeof role.task !== 'function') fail(`role ${role.id} task is not a function`);
    if (typeof role.system !== 'string' || role.system.length < 50) {
      fail(`role ${role.id} system prompt too short or not a string`);
    }
  }


  const ids = roles.map(r => r.id);
  if (!ids.includes('ui-visual-designer'))   fail('missing role id: ui-visual-designer');
  if (!ids.includes('design-system-engineer')) fail('missing role id: design-system-engineer');


  const [vd, dse] = roles;
  if (vd.phase !== 'design')          fail(`ui-visual-designer phase: expected 'design', got '${vd.phase}'`);
  if (vd.model !== 'opus')            fail(`ui-visual-designer model: expected 'opus', got '${vd.model}'`);
  if (!vd.deps.includes('ux-designer')) fail('ui-visual-designer deps must include ux-designer');
  if (!vd.produces.includes('design-system')) fail('ui-visual-designer must produce design-system');

  if (dse.phase !== 'design')         fail(`design-system-engineer phase: expected 'design', got '${dse.phase}'`);
  if (dse.model !== 'sonnet')         fail(`design-system-engineer model: expected 'sonnet', got '${dse.model}'`);
  if (!dse.deps.includes('ui-visual-designer')) fail('design-system-engineer deps must include ui-visual-designer');


  const fakeCtx = {
    brief: 'a fintech dashboard',
    stack: { summary: 'Next.js+Tailwind', notes: 'Tailwind, shadcn/ui' },
    artifactsDigest: () => '',
    getArtifact: () => null,
  };

  for (const role of roles) {
    let result;
    try {
      result = role.task(fakeCtx);
    } catch (e) {
      fail(`role ${role.id} task() threw: ${e.message}`);
      continue;
    }
    if (typeof result !== 'string' || result.trim().length === 0) {
      fail(`role ${role.id} task() returned empty or non-string`);
    }

    if (!result.includes('fintech')) {
      fail(`role ${role.id} task() does not interpolate ctx.brief`);
    }
  }

  if (pass) {
    console.log('PASS: visual-design.mjs — 2 roles valid, task(fakeCtx) non-empty for both');
  } else {
    process.exit(1);
  }
}
