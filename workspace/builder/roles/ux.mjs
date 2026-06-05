import { fileURLToPath } from 'node:url';

export const roles = [
  {
    id: 'ux-designer',
    title: 'UX Designer',
    phase: 'design',
    deps: ['requirements-analyst'],
    model: 'opus',
    produces: ['ux-flows'],

    system: `You are a senior product designer with 12+ years experience shipping user-centered
digital products. Your expertise: information architecture, interaction design, flow
mapping, accessibility (WCAG 2.1 AA), and turning fuzzy requirements into airtight
structural blueprints that engineering teams can implement without guessing.

Principles you never compromise on:
- Users should never be confused about where they are, what they can do, or what just
  happened. Every screen has a clear purpose and a clear next action.
- Minimum friction: every required step earns its place. If a step doesn't serve the
  user, cut it.
- Accessibility first: flows must work for keyboard-only navigation, screen readers,
  and low-vision users. Note ARIA roles and focus order where they matter.
- Edge states are not afterthoughts. Loading, empty, error, and success states are
  designed explicitly — not left to the engineer's imagination.
- Mobile is not a reduced version of desktop. Navigation models and touch targets are
  considered from the start.

Your deliverables are precise and engineering-ready:
- Every screen is named, scoped, and described with its key components and all states.
- Every flow is step-by-step, with branch conditions named.
- Every navigation model is explicit (who can reach what, and how).
- NO wireframe images, NO visual styling, NO color/font decisions — that is the visual
  designer's domain. Your output is structure, content, and behavior.

Write in clear, direct language. Use numbered steps for flows, markdown tables for
screen inventories, and nested lists for component/state breakdowns. Be concrete:
"user sees a list of their habits sorted by streak, descending" beats "display habits".`,

    task(ctx) {

      const priorArtifacts = ctx.artifactsDigest();
      const stackInfo = ctx.stack
        ? `Stack: ${ctx.stack.summary || ctx.stack.id || 'unknown'}${ctx.stack.notes ? `\nStack notes: ${ctx.stack.notes}` : ''}`
        : '';

      return `## Your task: UX Design

**App brief:** ${ctx.brief}
${stackInfo}

### Prior artifacts (requirements, PRD, etc.)
${priorArtifacts || '(no prior artifacts — infer requirements from the brief)'}

---

Design the complete user experience for this app. Your deliverable is a single Markdown
file written to \`.helm-build/artifacts/ux-flows.md\` in the project directory.

The file MUST cover every section below. Be thorough — this is the single source of
truth that frontend engineers build from. No TODOs, no "TBD", no placeholders.

---

### Section 1 — Information Architecture
List every logical section/module of the app (e.g. Auth, Dashboard, Settings) and
the content it owns. One or two sentences per section explaining its purpose.

### Section 2 — User Types & Permissions
List every distinct user type (anonymous, authenticated, admin, etc.) and what they
can and cannot do. If there is only one type, say so and describe their permissions.

### Section 3 — Navigation Model
Describe the top-level navigation structure:
- Navigation pattern (tabs, sidebar, top nav, bottom nav, drawer — and why it fits this app)
- Primary navigation items and what they map to
- Secondary / contextual navigation (back, breadcrumbs, modals, drawers)
- How navigation changes between user types
- Mobile vs desktop considerations (responsive breakpoints, collapsed nav, etc.)

### Section 4 — Screen / Route Inventory
A markdown table with columns:
  Route | Screen Name | Purpose | Key Components | States (loading / empty / error / success / other)

Cover EVERY screen and modal in the app. Do not skip edge screens (onboarding, 404,
empty states, confirmation dialogs). For complex screens, add a sub-list after the
table row expanding the key components and their behavior.

### Section 5 — Primary User Flows
For each core task a user performs, write a numbered step-by-step flow. Include:
- Flow name and the user goal it serves
- Preconditions (what state the user is in before starting)
- Every step, including system responses and UI feedback
- Branch conditions (what happens on error, on cancellation, on edge input)
- Postcondition (what state the user is in after completing)

Required flows to cover (add more if the app demands it):
1. **Auth flows** — sign-up, log-in, password reset, log-out (and OAuth if relevant)
2. **Primary task flow** — the core action the app exists for (e.g. "create a habit",
   "submit an order", "write a note") — full happy path + error branches
3. **Secondary task flows** — at least 2 more flows for supporting features
4. **Settings / profile flow** — how users manage their account

### Section 6 — Key Interaction Patterns
List reusable interaction patterns the app relies on (e.g. infinite scroll, optimistic
updates, drag-to-reorder, swipe-to-delete, inline editing). For each, describe:
- The pattern name
- Where it is used (which screens / components)
- The behavior on mobile vs desktop
- Accessibility notes (keyboard equivalent, ARIA role, focus management)

### Section 7 — Responsive & Mobile Considerations
For each major screen category, describe what changes at mobile breakpoints:
- Layout shifts (stacked vs side-by-side, hidden vs visible panels)
- Navigation model changes (e.g. bottom tab bar on mobile, sidebar on desktop)
- Touch-specific patterns (swipe gestures, bottom sheets, tap targets ≥ 44px)
- Any screens that are mobile-only or desktop-only, and why

### Section 8 — Accessibility Checklist
A checklist of the non-negotiable accessibility requirements for this app:
- Keyboard navigation path through each primary flow
- Screen-reader landmark structure (main, nav, aside, etc.)
- Focus management on modal open/close and page transitions
- Color-independence requirements (do not rely on color alone to convey meaning)
- Form labeling and error announcement requirements

---

After writing the full document to \`.helm-build/artifacts/ux-flows.md\`, also call
\`ctx.setArtifact('ux-flows', <content>)\` so the orchestrator can pass it to downstream
agents. (In practice: write the file yourself at the path above; the orchestrator reads
it from disk automatically.)

Do not produce any visual mockups, wireframe images, or styling decisions. Structure,
flow, and content only.`;
    },
  },
];

// Self-test — only runs when executed directly: node roles/ux.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let passed = 0;
  let failed = 0;

  function assert(label, condition) {
    if (condition) {
      console.log(`  PASS  ${label}`);
      passed++;
    } else {
      console.error(`  FAIL  ${label}`);
      failed++;
    }
  }

  console.log('--- ux.mjs self-test ---');

  // Shape assertions
  assert('roles is an array', Array.isArray(roles));
  assert('roles has exactly one entry', roles.length === 1);

  const role = roles[0];
  assert('id is ux-designer', role.id === 'ux-designer');
  assert('title is UX Designer', role.title === 'UX Designer');
  assert('phase is design', role.phase === 'design');
  assert('deps is an array', Array.isArray(role.deps));
  assert('deps contains requirements-analyst', role.deps.includes('requirements-analyst'));
  assert('model is opus', role.model === 'opus');
  assert('produces is an array', Array.isArray(role.produces));
  assert('produces contains ux-flows', role.produces.includes('ux-flows'));
  assert('system is a non-empty string', typeof role.system === 'string' && role.system.length > 0);
  assert('task is a function', typeof role.task === 'function');

  // task(ctx) — mock ctx, must return non-empty string referencing the brief
  const fakeCtx = {
    brief: 'a habit tracker',
    stack: { summary: 'Next.js', notes: '' },
    artifactsDigest: () => '',
  };

  const taskOutput = role.task(fakeCtx);
  assert('task returns a string', typeof taskOutput === 'string');
  assert('task output is non-empty', taskOutput.length > 0);
  assert('task output references the brief', taskOutput.includes('a habit tracker'));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
