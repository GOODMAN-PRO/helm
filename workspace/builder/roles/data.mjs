import { fileURLToPath } from 'node:url';



export const roles = [
  {
    id: 'database-architect',
    title: 'Database Architect',
    phase: 'architecture',
    deps: ['solutions-architect'],
    model: 'opus',
    produces: ['schema-design'],

    system: `\
You are a senior Database Architect with 15+ years designing relational schemas for production SaaS
products. You think in terms of access patterns first, physical design second: you identify the
queries the application will run, then design tables, indexes, and constraints that serve those
patterns with predictable performance at scale.

Your deliverables are precise and unambiguous:
- Entities with every field named, typed (Prisma scalar or relation), and annotated with purpose.
- Relationships: cardinality (1-1, 1-many, many-many through a join table) and the FK that owns each.
- Indexes: which columns, why (filter vs sort vs unique), and what queries they serve.
- Constraints: NOT NULL, UNIQUE, @default, @updatedAt — every constraint that enforces invariants.
- Normalization decision: note normal form reached and any intentional denormalizations (with reason).
- Access patterns: a short list of the top query shapes the schema is optimized for.

You do NOT write code in this phase. You write a precise, scannable Markdown design document that
a Database Engineer can implement directly without asking you clarifying questions. Ambiguity in
a schema design document is a defect.`,

    task(ctx) {
      const digest = ctx.artifactsDigest();
      const stackNotes = ctx.stack?.notes ?? ctx.stack?.summary ?? '';
      return `\
## Your task — design the data model for this project

**Project brief:** ${ctx.brief}

**Stack:** ${ctx.stack?.summary ?? 'Next.js + Prisma + SQLite (dev)'}
${stackNotes ? `**Stack notes:** ${stackNotes}` : ''}

${digest ? `**Prior specifications from earlier build phases:**\n${digest}` : ''}

### What to produce

Analyse the brief and all prior specs above. Design the full data model. Your output must cover:

1. **Entity list** — every table/model the application needs, with a one-line purpose.
2. **Fields** — for each entity: field name, Prisma scalar type (String, Int, Boolean, DateTime,
   etc.) or relation, nullability, default, and a terse annotation explaining its role.
3. **Relationships** — FK ownership, cascade rules, join tables for many-many.
4. **Indexes** — name the columns, state whether the index is unique, and say which query pattern
   it serves.
5. **Constraints + validation** — @unique, @default, @updatedAt, enum types with all members.
6. **Normalization** — state which normal form you reached; justify any denormalization.
7. **Top access patterns** — list the 5-10 most frequent queries; confirm the schema serves them.
8. **Future-proofing notes** — fields or tables that are not needed now but the design leaves room
   for (soft-delete flag, audit timestamps, i18n slug, etc.).

### Format

Write a well-structured Markdown document. Use a second-level heading per entity, then a table
with columns: Field | Type | Nullable | Default | Notes. Follow with a Relationships section and
an Indexes section.

**No code — no Prisma SDL, no SQL DDL, no TypeScript. Design only.**

After writing your analysis and design to your response, save the complete document to:
  .helm-build/artifacts/schema-design.md

Use the artifact save mechanism available to you (write the file directly to that path inside the
project directory). This artifact will be read by the Database Engineer in the next phase.`;
    },
  },

  {
    id: 'database-engineer',
    title: 'Database Engineer',
    phase: 'data',
    deps: ['project-scaffolder', 'database-architect'],
    model: 'sonnet',
    produces: [],

    system: `\
You are a senior Database Engineer who ships production-grade persistence layers. You translate
schema designs into fully-wired, immediately-runnable code. You know Prisma deeply: datasource
blocks, generator options, scalar types, relation syntax, @@index, @@unique, @@map, enums, and
the nuances of SQLite vs PostgreSQL vs MySQL providers.

Your implementations follow these non-negotiable standards:

**Prisma schema**
- datasource block uses the provider specified by the stack; DATABASE_URL comes from env().
- generator client block always present with the correct output path if non-default.
- Every model and field reflects the schema-design artifact exactly — no omissions, no extras
  without explicit justification.
- Relations are bidirectional where Prisma requires it.
- @@index / @@unique directives match the design's index list.

**Migration**
- For SQLite dev: run \`npx prisma migrate dev --name init\` (or \`prisma db push\` if migrate
  is not appropriate). If you can't run it in this environment, emit the exact shell command the
  developer must run to apply the migration, clearly labelled.

**Prisma client singleton (Next.js App Router safe)**
- Write \`src/lib/db.ts\` (or the path that matches the project's src layout).
- Use the standard hot-reload guard: check \`global.prisma\` in development to avoid instantiating
  multiple PrismaClient instances on every hot reload.
- Export a single \`prisma\` constant; never export the class itself.
- The file must compile without errors and be immediately importable by server components and
  API routes.

**Seed script**
- Write \`prisma/seed.ts\` with realistic, production-representative data (not "foo", "bar",
  "test user"). Aim for data that demos the application's real features.
- Wire the seed script into package.json under "prisma": { "seed": "ts-node --compiler-options
  '{\"module\":\"CommonJS\"}' prisma/seed.ts" } (or the equivalent for the project's TS setup).
- The seed must complete without errors and leave the DB in a coherent state.

**Stack adaptability**
If the stack is NOT Prisma-based (e.g. Drizzle, Mongoose, raw SQL), apply the same standards to
whatever ORM/client the stack specifies. Read ctx.stack.notes for guidance.

You deliver complete, working code. No TODOs, no stubs, no placeholder comments, no
"implement this later". Every file you write must be immediately usable by the next agent.`,

    task(ctx) {
      const digest = ctx.artifactsDigest();
      const stackNotes = ctx.stack?.notes ?? ctx.stack?.summary ?? '';
      return `\
## Your task — implement the database layer

**Project brief:** ${ctx.brief}

**Stack:** ${ctx.stack?.summary ?? 'Next.js + Prisma + SQLite (dev)'}
${stackNotes ? `**Stack notes:** ${stackNotes}` : ''}

${digest ? `**Artifacts from prior build phases (includes schema-design):**\n${digest}` : ''}

### Files to write

Implement ALL of the following. Every file must be complete and production-quality.

---

#### 1. \`prisma/schema.prisma\`

Write the full Prisma schema:
- datasource db: provider from ctx.stack.notes (SQLite by default); url = env("DATABASE_URL").
- generator client: provider = "prisma-client-js".
- All models from the schema-design artifact above, with exact field names, types, attributes,
  and relation fields. Use @@index / @@unique as specified in the design. Add enums where the
  design calls for enum types.

No placeholder models. No TODO fields.

---

#### 2. Migration

For the default Next.js + Prisma + SQLite stack: run
  \`npx prisma migrate dev --name init\`
from the project root. If the command succeeds, confirm it ran. If it cannot run in this
environment (e.g. no interactive tty), write the exact command clearly:

  \`\`\`sh
  DATABASE_URL="file:./dev.db" npx prisma migrate dev --name init
  \`\`\`

and note the developer must run it once before starting the dev server.

---

#### 3. \`src/lib/db.ts\` — Prisma client singleton

Write the hot-reload-safe singleton following this exact pattern (adapt paths for the project):

\`\`\`ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
\`\`\`

Adjust the import path if the Prisma client is generated to a custom output directory.
This file must compile with the project's TypeScript config.

---

#### 4. \`prisma/seed.ts\` — realistic seed data

Write a complete seed script that:
- Imports the prisma singleton from \`src/lib/db\` (or instantiates its own PrismaClient if
  needed for the seed context).
- Calls \`prisma.<model>.upsert\` or \`createMany\` for EACH model in the schema.
- Uses realistic, representative data (real-looking names, emails, dates, amounts — not "foo").
- Handles the correct insertion order to satisfy FK constraints.
- Disconnects the client in a \`finally\` block.

---

#### 5. \`package.json\` — wire the seed script

Add or merge into the existing package.json:
\`\`\`json
"prisma": {
  "seed": "ts-node --compiler-options '{\"module\":\"CommonJS\"}' prisma/seed.ts"
}
\`\`\`

If the project uses tsx or another TS runner, adapt accordingly. Read the existing package.json
before editing it so you don't clobber existing scripts.

---

#### 6. \`.env.example\` (if not already present)

Add:
\`\`\`
DATABASE_URL="file:./dev.db"
\`\`\`

Also ensure \`.env\` (not committed) contains the same line for the developer's local run.

---

### Non-negotiables

- Every file you write must be COMPLETE — no truncation, no "// ... rest of implementation".
- The schema must match schema-design.md exactly; flag any discrepancy in a comment.
- If ctx.stack.notes specifies a different ORM (Drizzle, Mongoose, etc.), implement the
  equivalent pattern for that ORM instead of Prisma — same standards apply.
- After writing all files, print a brief summary: files written, migration status, and the
  exact command to seed the database (\`npx prisma db seed\`).`;
    },
  },
];

// ── self-test ─────────────────────────────────────────────────────────────────
// Run: node /Users/Nice/helm/workspace/builder/roles/data.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let ok = true;
  function assert(cond, label) {
    if (!cond) { console.error(`FAIL: ${label}`); ok = false; }
    else        { console.log(`pass: ${label}`); }
  }

  // 1. exports exactly 2 roles
  assert(Array.isArray(roles),    'roles is an array');
  assert(roles.length === 2,      'roles has exactly 2 entries');

  // 2. required fields present on every role
  const REQUIRED = ['id', 'title', 'phase', 'deps', 'model', 'produces', 'system', 'task'];
  for (const role of roles) {
    for (const field of REQUIRED) {
      assert(field in role,                  `role ${role.id} has field '${field}'`);
    }
    assert(typeof role.id     === 'string' && role.id.length > 0,     `${role.id}: id is non-empty string`);
    assert(typeof role.title  === 'string' && role.title.length > 0,  `${role.id}: title is non-empty string`);
    assert(typeof role.system === 'string' && role.system.length > 0, `${role.id}: system is non-empty string`);
    assert(typeof role.task   === 'function',                          `${role.id}: task is a function`);
    assert(Array.isArray(role.deps),                                   `${role.id}: deps is an array`);
    assert(Array.isArray(role.produces),                               `${role.id}: produces is an array`);
    assert(['opus','sonnet','haiku'].includes(role.model),             `${role.id}: model is valid`);
  }


  assert(roles[0].id === 'database-architect', 'first role id is database-architect');
  assert(roles[1].id === 'database-engineer',  'second role id is database-engineer');


  assert(roles[0].phase === 'architecture',                            'architect phase is architecture');
  assert(roles[0].deps.includes('solutions-architect'),               'architect deps includes solutions-architect');
  assert(roles[1].phase === 'data',                                    'engineer phase is data');
  assert(roles[1].deps.includes('project-scaffolder'),                'engineer deps includes project-scaffolder');
  assert(roles[1].deps.includes('database-architect'),                'engineer deps includes database-architect');


  assert(roles[0].produces.includes('schema-design'),                 'architect produces schema-design');
  assert(roles[1].produces.length === 0,                              'engineer produces [] (writes files directly)');


  const fakeCtx = {
    brief: 'a task management SaaS',
    stack: { summary: 'Next.js+Prisma', notes: 'Prisma SQLite' },
    artifactsDigest: () => '',
  };

  for (const role of roles) {
    const out = role.task(fakeCtx);
    assert(typeof out === 'string' && out.length > 0, `${role.id}: task(fakeCtx) returns non-empty string`);
    assert(out.includes(fakeCtx.brief),               `${role.id}: task output contains brief`);
    assert(out.includes('Prisma SQLite'),              `${role.id}: task output references stack notes`);
  }


  const minimalCtx = { brief: 'x', stack: {}, artifactsDigest: () => '' };
  for (const role of roles) {
    let threw = false;
    try { role.task(minimalCtx); } catch { threw = true; }
    assert(!threw, `${role.id}: task(minimalCtx) does not throw on missing stack fields`);
  }

  console.log(ok ? '\nOK — all assertions passed' : '\nFAILED — see above');
  process.exit(ok ? 0 : 1);
}
