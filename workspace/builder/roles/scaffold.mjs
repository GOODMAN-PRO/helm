// scaffold.mjs — project-scaffolder role.
// Hardens the foundation the stack scaffolder laid: strict configs, directory layout,
// core library installs, .env.example, package.json scripts, and a conventions doc.
// Exported as a roles array so the aggregator (roles.mjs) can concat without ceremony.
//
// CONTRACT §1: id, title, phase, deps, model, produces, system, task(ctx).
// CONTRACT §2: task receives a ctx with brief, stack.notes, artifactsDigest(), etc.

import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Role definition
// ---------------------------------------------------------------------------

/** @type {import('../context.mjs').Role} */
const projectScaffolder = {
  id: 'project-scaffolder',
  title: 'Project Scaffolder',
  phase: 'scaffold',
  deps: ['solutions-architect'],
  model: 'sonnet',
  produces: ['project-conventions'],

  // -------------------------------------------------------------------------
  // system — who this agent IS for the whole session
  // -------------------------------------------------------------------------
  system: `You are a senior platform engineer with 15 years of production Next.js experience.
Your obsession: zero-friction developer experience, reproducible builds, and strict TypeScript
that catches bugs before they ship. You treat every scaffolding decision as a contract the rest
of the team must rely on.

Principles you never compromise on:
- TypeScript strict mode, no implicit any, no "as any" escape hatches.
- ESLint + Prettier are enforced, not optional. Configs go in the repo, not in individual heads.
- .env.example is the living documentation of the deployment surface. It MUST be complete.
- .gitignore MUST exclude .env and .env.local before the first commit.
- All package.json scripts are real, runnable commands — no "TODO: add script" stubs.
- The directory structure mirrors the architecture. No dumping files in root.
- After you run installs, you verify them — don't assume npx succeeded silently.
- You write for the next engineer, not just for today. Comments explain WHY, not WHAT.
- Every file you create is production-ready. No placeholder content, no lorem ipsum,
  no TODO comments, no "not implemented" stubs, no commented-out code blocks.

You have full file-write access to the project directory. Act on it — don't describe what you
would do, actually do it.`,

  // -------------------------------------------------------------------------
  // task — concrete instruction built from live build context
  // -------------------------------------------------------------------------
  task(ctx) {
    const notes = ctx.stack?.notes ?? '(no stack notes available)';
    const summary = ctx.stack?.summary ?? 'Next.js full-stack';
    const artifacts = ctx.artifactsDigest();

    return `## Your task: harden the project foundation

Stack: ${summary}
Stack conventions:
${notes}

${artifacts ? `Prior build artifacts (architecture decisions, data model, etc.):\n${artifacts}\n` : ''}
Brief: ${ctx.brief}

---

### Step 1 — detect project state
Check whether package.json exists at the project root. If it does NOT exist, create-next-app
did not run. In that case, bootstrap a complete Next.js 14 project yourself:
- Create src/app/layout.tsx, src/app/page.tsx with correct App Router boilerplate.
- Create tsconfig.json with strict mode and the paths listed below.
- Create tailwind.config.ts, postcss.config.js.
- Create package.json with all fields listed in Step 4.
Do NOT skip this step — check the filesystem before assuming anything.

### Step 2 — verify/repair TypeScript config
Ensure tsconfig.json has ALL of:
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "moduleResolution": "bundler",
  "paths": { "@/*": ["./src/*"] }
If the file exists but is missing any of these, add them. If it does not exist, create it from scratch.

### Step 3 — ESLint + Prettier + EditorConfig
ESLint (.eslintrc.json or eslint.config.mjs):
  - Extend "next/core-web-vitals" and "next/typescript".
  - Add rule: "no-console": ["warn", { allow: ["warn", "error"] }]
  - Add rule: "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
  - Add rule: "@typescript-eslint/consistent-type-imports": "error"

Prettier (.prettierrc):
  {
    "semi": true,
    "singleQuote": true,
    "tabWidth": 2,
    "trailingComma": "all",
    "printWidth": 100,
    "plugins": ["prettier-plugin-tailwindcss"]
  }

.prettierignore: add .next, out, node_modules, prisma/migrations, public.

.editorconfig:
  root = true
  [*]
  indent_style = space
  indent_size = 2
  end_of_line = lf
  charset = utf-8
  trim_trailing_whitespace = true
  insert_final_newline = true
  [*.md]
  trim_trailing_whitespace = false

Install missing config packages:
  npm install --save-dev prettier prettier-plugin-tailwindcss eslint-config-next
(skip any that are already in package.json)

### Step 4 — directory structure
Create the following directories and seed them with an index barrel (index.ts that re-exports)
or a .gitkeep so they appear in git:
  src/app/           (App Router — already exists if scaffold ran)
  src/components/    (shared React components)
  src/components/ui/ (shadcn/ui generated components)
  src/lib/           (utilities, helpers, constants)
  src/lib/validators/ (zod schemas)
  src/server/        (server-only code: DB queries, auth helpers)
  src/server/db/     (prisma client singleton)
  src/types/         (shared TypeScript types/interfaces)
  src/__tests__/     (Vitest unit + integration tests)
  prisma/            (Prisma schema + migrations + seed script)
  tests/             (Playwright e2e tests)
  public/            (static assets)

Create src/lib/utils.ts with the standard clsx + tailwind-merge helper:
  import { clsx, type ClassValue } from 'clsx';
  import { twMerge } from 'tailwind-merge';
  export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

Create src/server/db/index.ts with a Prisma Client singleton (dev-safe re-use pattern):
  import { PrismaClient } from '@prisma/client';
  const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
  export const db = globalForPrisma.prisma ?? new PrismaClient();
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

Create prisma/schema.prisma if it does not exist:
  generator client { provider = "prisma-client-js" }
  datasource db { provider = "sqlite" url = env("DATABASE_URL") }
  // Domain models will be added by the data-modeler role.

Create prisma/seed.ts (skeleton — data-modeler will fill it):
  import { db } from '../src/server/db';
  async function main() {
    console.log('Seeding...');
    // Seed data added by data-modeler role.
  }
  main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });

Create tests/e2e/.gitkeep so Playwright has a home.

Create src/__tests__/smoke.test.ts:
  import { describe, it, expect } from 'vitest';
  describe('smoke', () => {
    it('true is true', () => { expect(true).toBe(true); });
  });

### Step 5 — install core libraries
Run EXACTLY these install commands (use npm; fall back if pnpm is unavailable):

Production dependencies:
  npm install prisma @prisma/client next-auth@beta zod bcryptjs clsx tailwind-merge

Dev dependencies:
  npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom @playwright/test

After install, run:
  npx prisma generate

If any install command fails (non-zero exit), log the error and continue — do not abort the
whole task. Record which packages failed in the conventions doc so the next engineer knows.

### Step 6 — .env files
Create .env.example at the project root with ALL variables the app will need. Every line must
have a real comment. Minimum:
  # Application
  NEXT_PUBLIC_APP_URL=http://localhost:3000

  # Database (SQLite for local dev; swap to postgres:// for production)
  DATABASE_URL="file:./dev.db"

  # Auth.js / NextAuth v5
  AUTH_SECRET=           # generate with: openssl rand -base64 32
  AUTH_URL=http://localhost:3000

  # OAuth providers (add the ones the app uses)
  # AUTH_GOOGLE_ID=
  # AUTH_GOOGLE_SECRET=
  # AUTH_GITHUB_ID=
  # AUTH_GITHUB_SECRET=

Ensure .gitignore exists and contains at minimum:
  .env
  .env.local
  .env.*.local
  .next/
  out/
  node_modules/
  prisma/*.db
  prisma/*.db-journal

If .gitignore already exists, check that .env lines are present; add them if not.

Do NOT create a .env file — only .env.example. The developer creates their own .env.

### Step 7 — package.json scripts
Ensure package.json has ALL of these scripts (add or overwrite each key):
  "dev":        "next dev",
  "build":      "next build",
  "start":      "next start",
  "lint":       "next lint",
  "typecheck":  "tsc --noEmit",
  "test":       "vitest run",
  "test:watch": "vitest",
  "test:e2e":   "playwright test",
  "db:generate":"prisma generate",
  "db:push":    "prisma db push",
  "db:migrate": "prisma migrate dev",
  "db:seed":    "tsx prisma/seed.ts",
  "db:studio":  "prisma studio"

Also add to package.json:
  "prisma": { "seed": "tsx prisma/seed.ts" }

Install tsx as a dev dep if not present: npm install --save-dev tsx

### Step 8 — Vitest config
Create vitest.config.ts at the project root:
  import { defineConfig } from 'vitest/config';
  import react from '@vitejs/plugin-react';
  import { resolve } from 'node:path';
  export default defineConfig({
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/__tests__/setup.ts'],
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      coverage: { reporter: ['text', 'lcov'], exclude: ['node_modules', '.next'] },
    },
    resolve: { alias: { '@': resolve(__dirname, './src') } },
  });

Create src/__tests__/setup.ts:
  import '@testing-library/jest-dom';

Create playwright.config.ts if it does not exist:
  import { defineConfig, devices } from '@playwright/test';
  export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: { baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000', trace: 'on-first-retry' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  });

### Step 9 — write the conventions artifact
Write the file .helm-build/artifacts/project-conventions.md (create parent dirs if needed).
This document is the contract all subsequent engineers read. It MUST include:

1. **Stack identity** — exact versions of Next.js, React, TypeScript, Tailwind, Prisma, Auth.js.
   Read these from package.json after install.
2. **Directory map** — a tree of src/ and the top-level dirs, with a one-line purpose for each.
3. **Key patterns** — import alias (@/ = src/), cn() utility, db singleton, zod schema location.
4. **Env var reference** — every variable from .env.example, explained.
5. **Script reference** — every package.json script and when to run it.
6. **Constraints** — strict TS, no implicit any, no console.log in app code (use logger),
   no raw fetch (use a typed wrapper in src/lib/api.ts), shadcn/ui for all UI primitives.
7. **Outstanding install failures** — list any packages that failed to install in Step 5.

Write this file using the ctx artifact mechanism if available, AND directly to the filesystem
at .helm-build/artifacts/project-conventions.md — belt and suspenders.

---

### Completion check
After all steps, verify:
- [ ] package.json has all scripts from Step 7.
- [ ] tsconfig.json has "strict": true.
- [ ] .env.example exists and .env does NOT.
- [ ] .gitignore has .env lines.
- [ ] prisma/schema.prisma exists.
- [ ] src/lib/utils.ts exports cn().
- [ ] src/server/db/index.ts exports db.
- [ ] vitest.config.ts exists.
- [ ] .helm-build/artifacts/project-conventions.md is written.

If any check fails, fix it before finishing. Report the final checklist state in your output.`;
  },
};

// ---------------------------------------------------------------------------
// Named export (CONTRACT §1)
// ---------------------------------------------------------------------------

export const roles = [projectScaffolder];

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Minimal fake context — matches CONTRACT §2 shape; never spawns claude.
  const fakeCtx = {
    brief: 'x',
    stack: {
      summary: 'Next.js full-stack',
      notes: 'src-dir, app router, Prisma, NextAuth, Tailwind',
    },
    artifactsDigest: () => '',
  };

  let passed = 0;
  let failed = 0;

  function assert(label, condition, detail = '') {
    if (condition) {
      console.log(`  PASS  ${label}`);
      passed++;
    } else {
      console.error(`  FAIL  ${label}${detail ? ': ' + detail : ''}`);
      failed++;
    }
  }

  console.log('\n--- scaffold.mjs self-test ---\n');

  // 1. Export shape
  assert('roles is array', Array.isArray(roles));
  assert('roles has one entry', roles.length === 1);

  const role = roles[0];
  assert('role is object', role !== null && typeof role === 'object');

  // 2. Required fields — CONTRACT §1
  assert('id is project-scaffolder', role.id === 'project-scaffolder');
  assert('title is Project Scaffolder', role.title === 'Project Scaffolder');
  assert('phase is scaffold', role.phase === 'scaffold');
  assert('deps contains solutions-architect', Array.isArray(role.deps) && role.deps.includes('solutions-architect'));
  assert('model is sonnet', role.model === 'sonnet');
  assert('produces contains project-conventions',
    Array.isArray(role.produces) && role.produces.includes('project-conventions'));
  assert('system is non-empty string', typeof role.system === 'string' && role.system.length > 0);
  assert('task is function', typeof role.task === 'function');

  // 3. task(ctx) returns a non-empty string and embeds stack notes
  const taskOutput = role.task(fakeCtx);
  assert('task returns string', typeof taskOutput === 'string');
  assert('task output is non-empty', taskOutput.length > 0, `length=${taskOutput.length}`);
  assert('task embeds stack.notes', taskOutput.includes(fakeCtx.stack.notes));
  assert('task embeds stack.summary', taskOutput.includes(fakeCtx.stack.summary));
  assert('task embeds brief', taskOutput.includes(fakeCtx.brief));

  // 4. task works with missing optional fields (defensive)
  const minCtx = { brief: 'minimal', stack: null, artifactsDigest: () => '' };
  let minOutput;
  try {
    minOutput = role.task(minCtx);
  } catch (e) {
    assert('task handles null stack', false, String(e));
    minOutput = '';
  }
  assert('task handles null stack gracefully', typeof minOutput === 'string' && minOutput.length > 0);

  // Summary
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}
