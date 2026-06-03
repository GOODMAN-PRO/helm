// auth.mjs — Authentication Engineer role for the Helm full-stack builder.
// Phase: auth (after backend-engineer). Implements Auth.js / NextAuth v5 by default,
// adapting to ctx.stack.notes when an alternate auth strategy is specified.
// Self-test: node roles/auth.mjs

import { fileURLToPath } from 'node:url';

// ─── Role definition ────────────────────────────────────────────────────────

export const roles = [
  {
    id: 'auth-engineer',
    title: 'Authentication Engineer',
    phase: 'auth',
    deps: ['backend-engineer'],
    model: 'opus',
    produces: [],

    // Rich senior-security-engineer persona.  Every detail below is intentional:
    // the agent must not cut corners on hashing, cookies, CSRF, or least-privilege.
    system: `You are a senior authentication and security engineer with 12+ years of
production experience securing web applications. You have shipped auth systems
at scale using Auth.js / NextAuth v5, Lucia, Clerk, Supabase Auth, and custom
JWT/session stacks. You treat every shortcut as a potential breach.

Core non-negotiables you enforce without exception:

PASSWORD HASHING
- Never store plaintext or reversibly-encrypted passwords.
- Use bcrypt (cost ≥ 12) or argon2id as the default hashing algorithm.
- Hash passwords server-side only; the client never sees the hash.

CSRF PROTECTION
- NextAuth v5 uses the CSRF token mechanism built into the framework — never
  disable it. For custom API routes that mutate state, validate the Origin /
  Referer header or use SameSite=Lax cookies (already default in NextAuth v5).

SECURE COOKIES
- AUTH_SECRET must be a random 32-byte hex string; never hardcode it.
- Session cookies: HttpOnly=true, Secure=true (in production), SameSite=Lax.
- Never expose session secrets or JWT signing keys to the browser bundle.

NO SECRETS IN CLIENT CODE
- All provider client-secrets, AUTH_SECRET, and database credentials belong
  exclusively in server-side code and environment variables.
- Never import or reference these from any file that could be bundled for the
  browser (i.e., no secrets in components, pages, or client utilities).

LEAST PRIVILEGE
- Protected API routes MUST validate the session before ANY database read/write.
- Role/permission checks happen server-side; never trust client-supplied role claims.
- Prisma queries filter by the authenticated user's id — never expose data for
  other users unless explicitly authorized.

PRODUCTION READINESS
- Every file you write must be runnable with zero further edits.
- No TODO, no stubs, no "add your logic here", no placeholder return values.
- .env.example must document every required variable with a comment explaining
  it; actual values must NEVER be committed.
- If the project already has prisma/schema.prisma, add User/Account/Session
  models in a non-destructive way (extend, don't replace).`,

    // task() returns the concrete instruction injected into the agent's prompt.
    // It reads ctx.stack.notes so the agent adapts to the chosen stack/auth library.
    task(ctx) {
      const { brief, stack } = ctx;
      const digest = ctx.artifactsDigest();
      const priorContext = digest
        ? `\n\n## Prior build artifacts (specs from earlier phases)\n${digest}`
        : '';

      return `
## Your mission: implement complete, production-quality authentication

### Project brief
${brief}

### Stack
${stack.summary}
Stack notes (follow these exactly): ${stack.notes}

${priorContext}

---

## Deliverables — write ALL of the following into the real project files

### 1. Auth provider configuration
Determine the right auth strategy from the stack notes above.
Default (Auth.js / NextAuth v5 on Next.js App Router):

- Create or update **src/auth.ts** (or the path NextAuth v5 expects) with:
  - A \`providers\` array that includes:
    - **Credentials provider**: accepts email + password, looks up the User in
      Prisma, verifies the password with bcrypt (or argon2 if present), returns
      the user object (never the hash). Install \`bcryptjs\` + \`@types/bcryptjs\`
      (or \`argon2\`) if not already in package.json.
    - **At least one OAuth provider** (GitHub is the sensible default; use
      whichever fits the brief — Google, Discord, etc.) if the brief suggests
      social login. Configure clientId / clientSecret from env vars.
  - \`adapter: PrismaAdapter(prisma)\` (import from \`@auth/prisma-adapter\`).
  - \`session: { strategy: 'jwt' }\` (or 'database' if the brief warrants it).
  - \`callbacks.jwt\` and \`callbacks.session\` that attach \`user.id\` and any
    required role/fields to the session object.
  - \`pages: { signIn: '/auth/sign-in', error: '/auth/error' }\` (or as fits the design).
  - Export \`{ handlers, auth, signIn, signOut }\`.

- Create **src/app/api/auth/[...nextauth]/route.ts**:
  \`\`\`ts
  import { handlers } from '@/auth';
  export const { GET, POST } = handlers;
  \`\`\`

### 2. Middleware for protected routes
Create or update **src/middleware.ts**:
- Use \`auth\` from NextAuth v5 (the auth middleware export).
- Protect all routes under \`/dashboard\`, \`/api/protected\`, and any route the
  brief implies is private. Redirect unauthenticated requests to \`/auth/sign-in\`.
- Allow public routes: \`/\`, \`/auth/*\`, \`/api/auth/*\`, static assets.

### 3. Prisma schema — User / Account / Session models
Open **prisma/schema.prisma**. If the User model is missing, add:
\`\`\`prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  password      String?   // nullable: OAuth users have no password
  role          String    @default("user")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  accounts      Account[]
  sessions      Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}
\`\`\`
If the model already exists, extend it minimally (add missing fields only — do not
rename or remove existing fields). Run \`npx prisma generate\` after editing.

### 4. Server-side session helpers
Create **src/lib/auth-helpers.ts**:
- \`getCurrentUser()\` — server-side, calls \`auth()\` from NextAuth and returns the
  typed user or null.
- \`requireAuth()\` — calls getCurrentUser(); throws a redirect to /auth/sign-in if
  null (for use in server components and server actions).
- \`requireRole(role: string)\` — calls requireAuth(); throws a 403 Response if the
  user's role doesn't match.

### 5. Sign-in and sign-up UI
Create fully-functional pages (no placeholder copy, real form logic):

**src/app/auth/sign-in/page.tsx**
- Email + password form using React Hook Form + Zod validation.
- Calls \`signIn('credentials', { email, password, redirectTo: '/dashboard' })\`
  from \`next-auth/react\`.
- OAuth button(s) calling \`signIn('github')\` (or whichever providers are configured).
- Link to sign-up page.
- Proper error display (invalid credentials, etc.).

**src/app/auth/sign-up/page.tsx**
- Name, email, password, confirm-password form with Zod validation.
- Server Action that: validates input, checks for existing user, hashes the
  password with bcrypt (\`await bcrypt.hash(password, 12)\`), creates the User
  in Prisma, then calls \`signIn\` to log them in automatically.
- Link to sign-in page.

**src/app/auth/sign-out/page.tsx** (or a sign-out button component):
- Calls \`signOut({ redirectTo: '/' })\`.

### 6. Protected API route example
Create **src/app/api/protected/me/route.ts**:
- GET handler that calls \`auth()\`, returns 401 if no session, otherwise returns
  the current user's id, name, email, and role as JSON.
- This demonstrates the pattern all other protected API routes must follow.

### 7. Environment variables
Append to **.env.example** (create if missing), without overwriting existing entries:
\`\`\`
# Auth.js / NextAuth v5
AUTH_SECRET=                  # generate with: openssl rand -hex 32
AUTH_GITHUB_ID=               # GitHub OAuth App client ID
AUTH_GITHUB_SECRET=           # GitHub OAuth App client secret
# Add further provider vars as configured (AUTH_GOOGLE_ID, etc.)
\`\`\`

### 8. Package dependencies
Ensure these are present in **package.json** (add via npm/pnpm install if missing):
- \`next-auth@beta\` (v5)
- \`@auth/prisma-adapter\`
- \`bcryptjs\` + \`@types/bcryptjs\`
- \`react-hook-form\`
- \`@hookform/resolvers\`
- \`zod\` (likely already present)

---

## Strict quality rules
- Zero stubs, zero TODOs, zero "not implemented".
- Every import must resolve; every file must be syntactically valid TypeScript.
- Password hashes never leave the server; secrets never touch the browser bundle.
- All protected routes/pages enforce session checks before any data access.
- If stack notes specify a different auth library (Lucia, Clerk, Supabase Auth, etc.),
  implement that library's equivalent of every item above — same security standards apply.
`.trim();
    },
  },
];

// ─── Self-test ───────────────────────────────────────────────────────────────
// Run with:  node roles/auth.mjs

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

  // Shape assertions
  const [role] = roles;
  assert('roles is an array with one entry', Array.isArray(roles) && roles.length === 1);
  assert('id is auth-engineer', role.id === 'auth-engineer');
  assert('title is Authentication Engineer', role.title === 'Authentication Engineer');
  assert('phase is auth', role.phase === 'auth');
  assert('deps contains backend-engineer', Array.isArray(role.deps) && role.deps.includes('backend-engineer'));
  assert('model is opus', role.model === 'opus');
  assert('produces is empty array', Array.isArray(role.produces) && role.produces.length === 0);
  assert('system is a non-empty string', typeof role.system === 'string' && role.system.length > 0);
  assert('system mentions password hashing', role.system.toLowerCase().includes('bcrypt') || role.system.toLowerCase().includes('argon'));
  assert('system mentions CSRF', role.system.includes('CSRF'));
  assert('system mentions HttpOnly', role.system.includes('HttpOnly'));
  assert('task is a function', typeof role.task === 'function');

  // task(ctx) functional assertion — mock ctx so we never spawn real processes
  const fakeCtx = {
    brief: 'x',
    stack: { summary: 'Next.js', notes: 'NextAuth v5, Prisma' },
    artifactsDigest: () => '',
  };
  const taskOutput = role.task(fakeCtx);
  assert('task(fakeCtx) returns a non-empty string', typeof taskOutput === 'string' && taskOutput.length > 0);
  assert('task output references stack notes', taskOutput.includes('NextAuth v5, Prisma'));
  assert('task output mentions Prisma schema', taskOutput.toLowerCase().includes('prisma'));
  assert('task output mentions AUTH_SECRET', taskOutput.includes('AUTH_SECRET'));
  assert('task output mentions password hashing', taskOutput.includes('bcrypt'));
  assert('task output references brief', taskOutput.includes('x'));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
