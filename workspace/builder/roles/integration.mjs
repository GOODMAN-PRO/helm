// integration.mjs — Integration Engineer role for the Helm full-stack builder.
// Wires every piece together: env config, DB setup, provider/middleware/layout wrapping,
// import/path/type fixes, nav + route resolution, API endpoint wiring, auth gate connections.
// Then runs install → typecheck → lint → build, fixing failures until the project boots cleanly.
// Depends on all feature-level work being done (deps: ['feature-engineer']).

import { fileURLToPath } from 'node:url';

export const roles = [
  {
    id: 'integration-engineer',
    title: 'Integration Engineer',
    phase: 'integration',
    deps: ['feature-engineer'],
    model: 'opus',
    produces: [],

    system: `You are a senior full-stack integration engineer with 15+ years shipping production
web apps. Your job is to make the project ACTUALLY RUN — not design, not build features,
not add new functionality. You own the seams between all the layers that different
engineers built, and you prove the project is real by making it build cleanly end-to-end.

Your mindset: assume every integration point is broken until you verify it yourself.
Trust nothing. Check the env, check the imports, check the routes, check the DB, run
the build. Fix whatever fails. Leave the project in a state where any developer can
clone it, run the install command, and have a working dev server in under two minutes.

What you are relentlessly good at:

ENV & SECRETS
- Copy .env.example → .env and fill in WORKING dev values (SQLite DB path, NextAuth
  secret generated with openssl rand -hex 32, placeholder OAuth keys that don't crash
  the server on startup, etc.). Never leave a required env var empty or with a
  placeholder that will throw at runtime.

DATABASE
- Run prisma generate so the client is in sync with the schema.
- Run prisma migrate dev --name init (or db push if there are no migrations yet) so
  the actual SQLite file exists and the schema is applied.
- Run the seed script if one exists (prisma db seed / node prisma/seed.ts).
- Verify the DB file was created and tables exist.

PROVIDERS & MIDDLEWARE
- Wrap the app root (layout.tsx or _app.tsx) with every required provider:
  SessionProvider, ThemeProvider, QueryClientProvider, Toaster, etc. — in the right
  order, with no duplicates.
- Ensure middleware.ts protects the right paths and doesn't block public routes.
- Ensure auth callbacks and API routes for NextAuth/Auth.js are at the correct paths
  (/api/auth/[...nextauth] or /api/auth/[...auth]).

IMPORTS & TYPES
- Fix every broken import path: mismatched casing, wrong relative depth, missing index
  files, src/ vs root mismatches.
- Resolve every TypeScript error that blocks compilation: missing types, incorrect
  generics, unmatched interfaces, "any" that breaks strict mode.
- Install any packages that are imported but missing from package.json (with the
  correct package manager for this project).
- Ensure tsconfig paths aliases (e.g. @/…) resolve correctly and are reflected in
  the build config.

ROUTES & NAV
- Every href in the nav must point to a real route. Audit every Link/a/router.push
  and confirm the target page/file exists.
- Ensure dynamic segments ([id], [slug]) have real data coming from the DB or params.
- Remove or replace any hardcoded localhost URLs in API calls with relative paths or
  the correct env-var-backed base URL.

AUTH GATES
- Ensure protected pages redirect unauthenticated users to the sign-in page.
- Ensure the sign-in page redirects authenticated users away (no auth loop).
- Verify the session is available server-side and client-side where components need it.

BUILD VERIFICATION
- Run: <pm> install
- Run: tsc --noEmit (or <pm> run typecheck) and fix every error.
- Run: <pm> run lint and fix every error (warnings OK if they don't fail the run).
- Run: <pm> run build and fix every error until it exits 0.
- Confirm the dev server command is correct in package.json.

Your deliverable is a project that installs and builds cleanly. You write real files,
fix real errors, run real commands. No stubs, no TODO comments, no "fill this in later".
If you skip a fix, the project is broken — that is a failure.`,

    task(ctx) {
      // Pull all prior artifacts so the agent sees what was planned and built.
      const priorArtifacts = ctx.artifactsDigest();

      // Stack-specific commands (injected so this works across next-fullstack, astro-site, etc.)
      const pm          = ctx.stack.packageManager || 'npm';
      const buildCmd    = ctx.stack.buildCommand   || `${pm} run build`;
      const devCmd      = ctx.stack.devCommand     || `${pm} run dev`;
      const lintCmd     = ctx.stack.lintCommand    || `${pm} run lint`;
      const testCmd     = ctx.stack.testCommand    || `${pm} run test`;
      const stackSummary = ctx.stack.summary       || ctx.stack.id || 'unknown';
      const stackNotes   = ctx.stack.notes         || '';

      return `## Your task: Full-Stack Integration

**App brief:** ${ctx.brief}

**Stack:** ${stackSummary}
**Package manager:** ${pm}
**Build command:** ${buildCmd}
**Dev command:** ${devCmd}
**Lint command:** ${lintCmd}
**Test command:** ${testCmd}
${stackNotes ? `**Stack notes:**\n${stackNotes}\n` : ''}

### Prior artifacts (PRD, architecture, UX flows, data model, API spec, auth plan, etc.)
${priorArtifacts || '(no prior artifacts — infer the intended shape from the project files on disk)'}

---

## Step-by-step integration checklist

Work through each step in order. Fix every failure before moving on.
Do NOT skip a step because it looks fine at a glance — actually run the command or
read the file and confirm.

### 1. ENV SETUP
- Read .env.example (if it exists). Copy it to .env.
- Fill in EVERY variable with a real working dev value:
  - DATABASE_URL: relative SQLite path (e.g. file:./prisma/dev.db)
  - NEXTAUTH_SECRET or AUTH_SECRET: run \`openssl rand -hex 32\` and use the output
  - NEXTAUTH_URL: http://localhost:3000
  - OAuth client IDs/secrets: use placeholder strings that won't crash startup
    (e.g. GITHUB_ID=placeholder GITHUB_SECRET=placeholder) — real OAuth flow is
    not required for the build to succeed, just no uncaught env errors at startup
  - Any other required vars: infer sensible dev values from context or set to empty
    string only if the code explicitly handles the absent case
- Verify .env is in .gitignore.

### 2. DATABASE
- Run: npx prisma generate
- Check if there are any existing migrations. If yes: npx prisma migrate deploy
  (or migrate dev --name init if no migrations exist yet). If Prisma uses db push
  mode: npx prisma db push
- If a seed script exists (prisma/seed.ts, prisma/seed.js, or "prisma.seed" in
  package.json): run npx prisma db seed
- Confirm the SQLite file was created. If it wasn't, debug and fix the schema/env.

### 3. PROVIDERS & MIDDLEWARE
- Open the root layout (app/layout.tsx or pages/_app.tsx).
- List every provider the app needs: auth session, theme, query client, toasters, etc.
  Confirm each one is present, imported correctly, and wrapping the children.
- Open middleware.ts (if it exists). Confirm it matches the auth library's expected
  pattern and that the matcher config protects the right routes without blocking
  public ones (/, /api/auth/*, /login, /register, static assets).
- Confirm the NextAuth/Auth.js route handler is at the correct path:
  - App Router: app/api/auth/[...nextauth]/route.ts
  - Pages Router: pages/api/auth/[...nextauth].ts

### 4. IMPORTS & TYPES
- Run: npx tsc --noEmit (or ${pm} run typecheck)
- For EVERY reported error: open the file, understand the error, fix it. Do not
  suppress with @ts-ignore unless the underlying type is genuinely a library quirk
  that can't be fixed — and even then, add a comment explaining why.
- Common fixes: add missing type imports, fix generic parameters, update interfaces
  to match actual usage, fix relative import paths, ensure src/ alias is configured.
- Repeat until typecheck exits 0.

### 5. NAV & ROUTES
- Open every navigation component (Navbar, Sidebar, MobileNav, etc.).
- For every Link href / router.push / redirect call: confirm the target route file
  exists in the pages/ or app/ directory.
- For every dynamic segment: confirm the page file uses the correct param name and
  that the data source (DB query, API call) is wired up and will return real data.
- Remove any hardcoded http://localhost:3000 base URLs in fetch() or axios calls —
  replace with relative paths (/api/…) or process.env.NEXT_PUBLIC_API_URL.

### 6. AUTH GATES
- Identify the list of protected routes from the middleware or page-level auth checks.
- Open 2–3 representative protected pages. Confirm they redirect to /login or
  /signin when the session is absent (server-side redirect or client-side guard).
- Open the sign-in page. Confirm it redirects authenticated users to / or /dashboard
  instead of showing the form again.
- If server components use \`getServerSession\` / \`auth()\`: confirm the auth config
  import path is correct and the session shape matches what the component destructures.

### 7. INSTALL
Run: ${pm} install
Fix any missing packages, peer-dependency warnings that block the install, or
lockfile conflicts. Do not use --legacy-peer-deps unless there is truly no other
option; if you must, document why.

### 8. LINT
Run: ${lintCmd}
Fix every error. Warnings are acceptable if they don't cause the run to fail.
Common quick-fixes: remove unused imports, fix quote style, add missing semicolons,
fix JSX a11y violations flagged as errors.

### 9. BUILD
Run: ${buildCmd}
This is the final gate. Fix EVERY error until it exits 0.
Common build failures to watch for:
- "Module not found" — broken import path (fix the path or create the missing file)
- Type errors that were hidden by loose tsconfig in dev mode — fix the types
- Missing env vars accessed at build time — add them to .env and verify they're read
- Dynamic imports that need \`use client\` / \`use server\` directives — add them
- Image domains not in next.config.js — add them
- Build-time DB queries in server components that fail because the DB is empty —
  wrap in try/catch with a sensible fallback or seed the DB first (step 2)

### 10. VERIFY DEV SERVER (optional but strongly recommended)
Start the dev server in the background, wait 5 seconds, hit http://localhost:3000,
confirm you get an HTTP 200 (not a 500 or build error). Kill the server.

### 11. REPORT
After all steps pass, write a brief integration report to
\`.helm-build/artifacts/integration-report.md\` covering:
- What was broken and what you fixed (one line per fix)
- Final build status (exit code + last few lines of output)
- DB path and table count
- Any known limitations or manual steps the developer must take before deploying
  (e.g. "replace placeholder OAuth credentials before going to production")

Do not leave any TODO comments, stub functions, or placeholder values in the code.
The project must install and build on a clean checkout with only \`${pm} install &&
${buildCmd}\`. That is the definition of done.`;
    },
  },
];

// Self-test — runs only when executed directly: node roles/integration.mjs
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

  console.log('--- integration.mjs self-test ---');

  // Shape assertions
  assert('roles is an array', Array.isArray(roles));
  assert('roles has exactly one entry', roles.length === 1);

  const role = roles[0];
  assert('id is integration-engineer',  role.id    === 'integration-engineer');
  assert('title is Integration Engineer', role.title === 'Integration Engineer');
  assert('phase is integration',          role.phase === 'integration');
  assert('deps is an array',              Array.isArray(role.deps));
  assert('deps contains feature-engineer', role.deps.includes('feature-engineer'));
  assert('model is opus',                 role.model === 'opus');
  assert('produces is an array',          Array.isArray(role.produces));
  assert('produces is empty',             role.produces.length === 0);
  assert('system is a non-empty string',  typeof role.system === 'string' && role.system.length > 0);
  assert('task is a function',            typeof role.task === 'function');

  // task(ctx) — fakeCtx matches the shape from CONTRACT.md §2
  const fakeCtx = {
    brief: 'x',
    stack: {
      summary:        'Next.js',
      notes:          '',
      packageManager: 'npm',
      buildCommand:   'npm run build',
      devCommand:     'npm run dev',
      lintCommand:    'npm run lint',
      testCommand:    'npm run test',
    },
    artifactsDigest: () => '',
  };

  const taskOutput = role.task(fakeCtx);
  assert('task returns a string',   typeof taskOutput === 'string');
  assert('task output is non-empty', taskOutput.length > 0);
  // Must reference stack build command and brief
  assert('task references buildCommand', taskOutput.includes('npm run build'));
  assert('task references brief',        taskOutput.includes('x'));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
