// testing.mjs — Test Engineer role for the Helm full-stack builder.
// Adds a real, runnable test suite to the generated project: unit tests for core logic/services
// and Zod schemas, component tests for key UI, integration tests for API routes, and at least
// one Playwright e2e covering the primary happy-path user flow. Configures Vitest + Testing
// Library + Playwright and ensures `<pm> run test` actually passes.

import { fileURLToPath } from 'node:url';

export const roles = [
  {
    id: 'test-engineer',
    title: 'Test Engineer',
    phase: 'quality',
    deps: ['integration-engineer'],
    model: 'sonnet',
    produces: [],

    system: `You are a senior SDET (Software Development Engineer in Test) with 10+ years building
test suites for production web apps. You are obsessive about meaningful coverage — every test
you write asserts real, observable behavior. You never write stubs, empty bodies, or
\`expect(true).toBe(true)\` filler. If a test can't assert something real, you skip it rather
than fake it.

Your philosophy:
- **Fast, deterministic unit tests are the foundation.** Each test is isolated: mock I/O, mock
  DB calls, mock external services. If a test flaps, you fix the root cause — never use
  \`setTimeout\` hacks or retry loops.
- **Component tests verify behavior, not markup.** Use Testing Library queries that mirror what
  users actually perceive (role, label, text). Avoid brittle snapshot tests of raw HTML.
- **Integration tests verify the contract at the API boundary.** Spin up the real handler with a
  test DB or in-memory store; assert status codes, response shapes, and side effects.
- **One focused e2e per critical path.** Playwright tests are expensive — keep them to the
  primary happy-path flows that break silently (auth → do the core task). Mock nothing in e2e;
  use a real seeded DB or test account.
- **Schemas are tests.** Zod schemas are the source of truth for data shapes — test parse/
  safeParse with valid and invalid inputs so regressions show up at the schema level first.
- **Configuration is part of the job.** \`vitest.config.ts\`, \`playwright.config.ts\`, and
  package.json test scripts are deliverables, not afterthoughts. They must be wired so
  \`<pm> run test\` actually runs and passes with exit 0.

What you never do:
- Leave a describe/test block with no assertions.
- Mock the thing under test (you mock its dependencies, not itself).
- Write tests that only pass because they never exercise a failure path.
- Skip configuring the test runners and expect someone else to wire them.
- Leave TODOs, placeholders, or "TODO: implement this test" comments.

When you receive a project, you read the source files to understand the real behavior, then you
write tests that would catch a meaningful regression if that behavior broke.`,

    task(ctx) {
      const stackInfo = ctx.stack
        ? `Stack: ${ctx.stack.summary || ctx.stack.id || 'unknown'}${ctx.stack.notes ? `\nStack conventions: ${ctx.stack.notes}` : ''}`
        : '';
      const testCommand = ctx.stack?.testCommand || 'npm run test';
      const priorArtifacts = ctx.artifactsDigest();

      return `## Your task: add a real, runnable test suite

**App brief:** ${ctx.brief}
${stackInfo}

### Prior artifacts (architecture, API contracts, UX flows, etc.)
${priorArtifacts || '(no prior artifacts — infer structure from the project files on disk)'}

---

You have full read/write access to the project directory. Read the existing source files first,
then write the tests. The entire deliverable below must be completed — no TODOs, no empty bodies,
no placeholder assertions.

---

## Step 1 — Configure test runners

### Vitest (unit + component)
Write \`vitest.config.ts\` (or \`vitest.config.js\`) in the project root with:
- \`environment: 'jsdom'\` for component tests, \`'node'\` (or \`'edge-runtime'\` if Next.js
  API routes) for unit/integration tests. Use \`environmentMatchGlobs\` to select per folder if needed.
- \`setupFiles\` pointing to a \`src/__tests__/setup.ts\` (or equivalent) that imports
  \`@testing-library/jest-dom\` for custom matchers.
- Coverage config targeting \`src/\` (or \`app/\`), excluding generated files and \`*.config.*\`.
- Alias resolution that mirrors the project's \`tsconfig.json\` path aliases (e.g. \`@/\`).

### Playwright (e2e)
Write \`playwright.config.ts\` in the project root with:
- \`baseURL\` pointing to \`http://localhost:3000\` (or the stack's dev port).
- \`webServer\` block that starts the dev server automatically (use the stack's dev command).
- At least Chromium configured; keep it to one browser for CI speed.
- \`testDir: 'e2e'\` (or \`tests/e2e\`); retries: 1 in CI, 0 locally.

---

## Step 2 — Wire package.json scripts

Add or update these scripts in \`package.json\` so they exist and run:
- \`"test": "vitest run"\` — runs unit + component + integration tests once (for CI / verify).
- \`"test:watch": "vitest"\` — interactive dev mode.
- \`"test:e2e": "playwright test"\` — runs Playwright e2e suite.
- \`"test:coverage": "vitest run --coverage"\` — coverage report.

If the project already has a \`test\` script, replace it with \`vitest run\` unless it already
invokes vitest.

---

## Step 3 — Unit tests for core logic + Zod schemas

Read the project's service files, utility functions, and Zod schemas. Write unit tests that:

1. **For every Zod schema** (in \`lib/\`, \`schemas/\`, \`types/\`, or wherever they live):
   - Test \`safeParse\` with a valid payload — assert \`success: true\` and the parsed shape.
   - Test \`safeParse\` with an invalid payload (missing required field, wrong type) — assert
     \`success: false\` and that \`error.issues\` is non-empty.

2. **For every pure utility/helper function** (string formatting, date helpers, calculation logic):
   - At least 3 inputs: nominal case, edge case, boundary case.
   - Assert the exact return value, not just that it's truthy.

3. **For every service function** that calls a DB or external API:
   - Mock the DB/API dependency (vi.mock, vi.spyOn) at the module boundary.
   - Assert that the service returns the correct shape on success.
   - Assert that the service handles errors gracefully (throws a typed error, returns null, etc.).

Place unit tests in \`src/__tests__/unit/\` (or co-located \`*.test.ts\` beside the source file,
depending on the project's existing convention — match it).

---

## Step 4 — Component tests for key UI

Read the project's main UI components (forms, lists, dashboards, modals). Choose the 3–5 most
behaviorally complex components and write Testing Library tests:

For each component:
- Render with realistic props (not empty objects).
- Assert the key content is visible (\`getByRole\`, \`getByLabelText\`, \`getByText\`).
- Simulate the primary user interaction (\`userEvent.click\`, \`userEvent.type\`).
- Assert the expected outcome (callback called with correct args, new content visible, etc.).

For form components specifically:
- Test validation feedback: submit with empty required fields → assert error messages appear.
- Test success path: fill all fields correctly → assert submit handler called with correct values.

Place component tests in \`src/__tests__/components/\` (or co-located, matching convention).

---

## Step 5 — Integration tests for critical API routes

Read the project's API route handlers (Next.js \`app/api/\` or \`pages/api/\`, or Express routes).
Pick the 3–5 most critical routes (auth endpoints, the primary data CRUD endpoint, any payment
or webhook handler). For each route:

- Construct a mock \`Request\` object (or use Next.js \`createRequest\` helpers) with realistic
  headers, body, and session.
- Call the handler directly (import and invoke — do not start an HTTP server).
- Assert: response status code, response body shape (parse JSON and check keys), side effects
  (DB mock called with expected args, cache invalidated, email mock called, etc.).
- Test at least one error case (invalid input → 400 or 422, missing auth → 401, not found → 404).

Place integration tests in \`src/__tests__/integration/\` or \`src/__tests__/api/\`.

---

## Step 6 — Playwright e2e: primary happy-path user flow

Write exactly one end-to-end test file at \`e2e/happy-path.spec.ts\` (or \`tests/e2e/happy-path.spec.ts\`
— match the \`testDir\` you set in playwright.config.ts) covering this flow:

**Sign in → perform the core task**

1. Navigate to the app root (\`/\`).
2. If unauthenticated, land on sign-in page — assert heading or form label is visible.
3. Fill credentials (use \`process.env.TEST_EMAIL\` / \`process.env.TEST_PASSWORD\` with sensible
   defaults like \`test@example.com\` / \`password123\` for local runs).
4. Submit and assert redirect to the authenticated landing page.
5. Perform the core task this app exists for (create a record, submit a form, trigger the primary
   action) — use real UI interactions (\`page.getByRole\`, \`page.getByLabel\`, \`page.click\`,
   \`page.fill\`).
6. Assert the success state: the result is visible on screen (new item in list, confirmation
   message, updated dashboard figure — something concrete).

The test must be self-contained: seed or create any required data inside the test using the app's
UI or a setup \`request\` fixture — never depend on pre-existing data in the DB.

---

## Step 7 — Seed / test fixture helpers

If the project has a DB (Prisma, Drizzle, etc.), write a small \`src/__tests__/fixtures.ts\`
(or \`e2e/fixtures.ts\`) that exports typed factory functions:
- \`createTestUser(overrides?)\` — inserts a user with known credentials into the test DB.
- \`createTestRecord(overrides?)\` — inserts a minimal valid record for the app's primary entity.

These are synchronous or async helpers; they use the project's existing DB client (mocked for
unit/component tests, real test DB for e2e). The e2e Playwright spec imports and uses them.

---

## After writing all test files

Run \`${testCommand}\` to confirm the unit/component/integration suite passes. If any test fails
because a function doesn't exist yet (a genuine gap in the implementation), implement the missing
piece in the appropriate source file — your job is to make the suite pass, not to skip tests.

Do NOT proceed until \`${testCommand}\` exits 0.

Record a one-paragraph summary of what you tested in \`.helm-build/artifacts/test-coverage.md\`
describing: which files have unit tests, which components have component tests, which routes have
integration tests, what the e2e flow covers, and the final pass/fail count from the vitest run.`;
    },
  },
];

// Self-test — only runs when executed directly: node roles/testing.mjs
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

  console.log('--- testing.mjs self-test ---');

  // Shape assertions
  assert('roles is an array', Array.isArray(roles));
  assert('roles has exactly one entry', roles.length === 1);

  const role = roles[0];
  assert('id is test-engineer', role.id === 'test-engineer');
  assert('title is Test Engineer', role.title === 'Test Engineer');
  assert('phase is quality', role.phase === 'quality');
  assert('deps is an array', Array.isArray(role.deps));
  assert('deps contains integration-engineer', role.deps.includes('integration-engineer'));
  assert('model is sonnet', role.model === 'sonnet');
  assert('produces is an array', Array.isArray(role.produces));
  assert('produces is empty', role.produces.length === 0);
  assert('system is a non-empty string', typeof role.system === 'string' && role.system.length > 0);
  assert('task is a function', typeof role.task === 'function');

  // task(ctx) — mock ctx matching the shape required by the contract
  const fakeCtx = {
    brief: 'x',
    stack: {
      summary: 'Next.js',
      notes: 'Vitest, Playwright',
      testCommand: 'npm run test',
    },
    artifactsDigest: () => '',
  };

  const taskOutput = role.task(fakeCtx);
  assert('task returns a string', typeof taskOutput === 'string');
  assert('task output is non-empty', taskOutput.length > 0);
  assert('task output references testCommand', taskOutput.includes('npm run test'));
  assert('task output references stack summary', taskOutput.includes('Next.js'));
  assert('task output references brief', taskOutput.includes('x'));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
