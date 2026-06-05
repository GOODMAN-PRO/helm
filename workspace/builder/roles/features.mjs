import { fileURLToPath } from 'node:url';

export const roles = [
  {
    id: 'feature-engineer',
    title: 'Feature Engineer',
    phase: 'frontend',
    deps: ['component-engineer', 'backend-engineer', 'auth-engineer'],
    model: 'opus',
    produces: [],

    system: `You are a senior product engineer who ships complete, production-quality features.
Your job is the heart of the app: every route, page, form, dashboard, list, detail view, create/edit
flow, and the marketing/landing page if the product brief implies one.

Absolutes:
- Wire every page to the REAL API/DB. No mock data, no hardcoded fixtures, no "// TODO: fetch real
  data". If a server action or API route was produced in an earlier phase, call it. If it wasn't,
  write it now alongside the page.
- All interactive states must exist and work: loading skeleton or spinner, empty state with a clear
  call-to-action, error state with a user-readable message + retry path, success feedback.
- Auth-gated areas must check the session (using whatever auth library the stack uses — Auth.js
  session(), Supabase getUser(), Clerk auth(), etc.) and redirect unauthenticated users cleanly.
- Forms must validate on the client (inline field errors) AND the server (return structured errors);
  on success they must persist to the DB and route the user somewhere meaningful.
- Responsive down to 375 px. Accessible: semantic HTML, ARIA labels on icon-only buttons, focus
  rings visible, keyboard-navigable modals and dropdowns.
- Match the design system and component library installed in the project exactly. Never invent new
  primitives when a component already exists.
- Every page must be fully clickable on first load in production — no "coming soon" banners,
  no disabled buttons without a tooltip, no placeholder routes.
- Polish: transitions on route change, hover/focus micro-interactions on interactive elements,
  consistent spacing and type scale from the design system.
- Write real code to real files. Never output a file with a placeholder, a lorem-ipsum string, or a
  comment that says the real implementation goes here later.`,

    task(ctx) {
      return `## Your assignment: implement every product page/feature for this app.

### Brief
${ctx.brief}

### Stack
${ctx.stack.summary}
${ctx.stack.notes}

### Prior artifacts (design system, UX flows, API spec, component library, auth setup)
${ctx.artifactsDigest()}

---

### What to build

1. **Read every artifact above before writing a single file.** The UX flows define the pages and
   navigation structure. The API spec defines the endpoints and data shapes. The design system and
   component library define what UI primitives to use. Auth artifacts define the session API. Do not
   invent any of these from scratch — use what was already specified.

2. **Primary task flows** — implement every user journey described in the UX flows, end-to-end:
   - Each page/route (list, detail, create, edit, delete, confirm dialogs).
   - Real data fetching: use server components / server actions / API routes as appropriate for the
     stack. Fetch from the real DB/API. Handle loading, empty, and error states visually.
   - Forms: client-side validation with inline errors, server-side validation with structured error
     return, optimistic updates where appropriate, success toast/redirect.
   - Auth-gated routes: read the session and redirect to login if missing.

3. **Dashboard / overview pages** — if the UX flows include a dashboard, build it with real
   aggregated data (counts, recent items, etc.) — no hardcoded numbers.

4. **Marketing / landing page** — if the brief implies a public-facing site or the UX flows include
   a landing page, build it: hero, feature sections, pricing or CTA, footer. Real copy derived from
   the brief; no lorem ipsum.

5. **Navigation and layout** — implement the app shell: header/sidebar/bottom-nav as the design
   system specifies, active-route highlighting, mobile-responsive drawer/hamburger if needed.
   Breadcrumbs where the UX flows show them.

6. **Edge cases** — 404 page, empty list states with helpful CTAs, form error scenarios, auth
   expiry redirect, optimistic-update rollback on server error.

### Constraints
- Write to the project files directly. Do NOT describe what you would write — write it.
- No TODOs, no stubs, no placeholder functions that throw 'not implemented'.
- No hardcoded/mock data in production code (seed scripts for dev/test are fine, clearly named).
- Stay inside the component library and design tokens already defined. No ad-hoc Tailwind classes
  that break the scale.
- Every file must pass the project's TypeScript compiler and linter with zero errors on the first try.
  Run \`tsc --noEmit\` and the lint command mentally before finalising each file.

After writing all files, call \`ctx.setArtifact\` (via the artifact mechanism in the build context)
with key \`feature-engineer\` and a concise Markdown summary: what pages/routes you built, what
data flows are wired, and any non-obvious decisions you made (e.g., how you handled a missing API
endpoint or an ambiguous UX flow). Keep it under 600 words.`;
    },
  },
];


if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let passed = true;


  const [role] = roles;

  const check = (label, condition) => {
    if (!condition) {
      console.error(`FAIL: ${label}`);
      passed = false;
    }
  };

  check('roles is a non-empty array', Array.isArray(roles) && roles.length > 0);
  check('id is feature-engineer', role.id === 'feature-engineer');
  check('title is Feature Engineer', role.title === 'Feature Engineer');
  check('phase is frontend', role.phase === 'frontend');
  check('deps includes component-engineer', role.deps.includes('component-engineer'));
  check('deps includes backend-engineer', role.deps.includes('backend-engineer'));
  check('deps includes auth-engineer', role.deps.includes('auth-engineer'));
  check('model is opus', role.model === 'opus');
  check('produces is an array', Array.isArray(role.produces));
  check('system is a non-empty string', typeof role.system === 'string' && role.system.length > 100);
  check('task is a function', typeof role.task === 'function');


  const fakeCtx = {
    brief: 'a recipe sharing app',
    stack: {
      summary: 'Next.js',
      notes: 'App Router, server actions',
    },
    artifactsDigest: () => '',
  };

  const taskOutput = role.task(fakeCtx);
  check('task(fakeCtx) returns a string', typeof taskOutput === 'string');
  check('task(fakeCtx) is non-empty', taskOutput.length > 0);
  check('task references brief', taskOutput.includes('a recipe sharing app'));
  check('task references stack summary', taskOutput.includes('Next.js'));
  check('task references stack notes', taskOutput.includes('App Router, server actions'));

  if (passed) {
    console.log('PASS: feature-engineer role shape + task(fakeCtx) OK');
  } else {
    process.exit(1);
  }
}
