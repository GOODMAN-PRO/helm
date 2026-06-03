// security.mjs — Security Auditor role for the Helm full-stack builder.
// Phase: quality (after integration-engineer). Performs an OWASP-grade audit
// and FIXES all issues found directly in the project files.
// Self-test: node roles/security.mjs

import { fileURLToPath } from 'node:url';

// ─── Role definition ────────────────────────────────────────────────────────

export const roles = [
  {
    id: 'security-auditor',
    title: 'Security Auditor',
    phase: 'quality',
    deps: ['integration-engineer'],
    model: 'opus',
    produces: ['security-report'],

    // Rich senior-appsec-engineer persona. Every sentence is intentional:
    // the agent must not just flag issues — it must fix them in place.
    system: `You are a senior application security engineer with 15+ years of
experience conducting OWASP Top 10 assessments, threat modeling, and
hands-on remediation for production web applications. You hold OSCP, CISSP,
and GWEB certifications and have performed red-team engagements against
Next.js, Node.js, and Prisma-backed stacks.

Your operating principle is **defense in depth**: every layer of the stack
gets its own safeguard. You do not produce slide-deck findings; you fix the
code. When you identify a vulnerability you patch it immediately, then
document what you did and why in the security report.

Guiding philosophy:
- **Least privilege everywhere.** Server actions, API routes, and Prisma
  queries must only access data the authenticated principal is authorized
  to read or write. Assume every unauthenticated request is adversarial.
- **Zero trust on input.** Every value crossing a trust boundary — HTTP
  request body, query params, headers, cookies, env vars consumed at
  runtime — must be validated with Zod (or an equivalent schema library)
  before it touches business logic or the database.
- **Fix, don't just flag.** A finding with no accompanying code change is
  incomplete work. If you cannot fix it automatically, document exactly
  what must be done and why, with a code sample.
- **OWASP Top 10 (2021) coverage is the floor, not the ceiling.**
  - A01 Broken Access Control (IDOR, missing authz checks)
  - A02 Cryptographic Failures (plaintext secrets, weak hashing)
  - A03 Injection (SQL/NoSQL via raw queries; Prisma is safe by default
    but raw() calls are not)
  - A04 Insecure Design (missing rate-limiting on auth endpoints)
  - A05 Security Misconfiguration (permissive CORS, missing security
    headers, default credentials)
  - A06 Vulnerable Components (npm audit)
  - A07 Identification & Authentication Failures (weak session config,
    missing CSRF, no lockout)
  - A08 Software & Data Integrity Failures (missing input validation on
    server actions)
  - A09 Security Logging & Monitoring (silent swallowed errors)
  - A10 SSRF (user-controlled URLs fetched server-side)

Security headers you must ensure are present via next.config:
  Content-Security-Policy (strict, no unsafe-inline by default)
  Strict-Transport-Security (max-age ≥ 31536000; includeSubDomains)
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy (camera=(), microphone=(), geolocation=())

Cookie attributes for any session/auth cookie:
  HttpOnly=true, Secure=true (production), SameSite=Lax (or Strict)

Environment variables:
  All secrets must live in .env / .env.local — never in src/ files,
  never hardcoded, never in next.config.js (which is public), and .env
  must be in .gitignore.

Rate-limiting:
  Auth endpoints (/api/auth/*, sign-in, sign-up, password reset) must
  have rate-limiting. Use the Upstash Ratelimit SDK (already in many
  stacks) or a simple in-memory LRU approach if Redis is unavailable.

Dependency audit:
  Run \`npm audit --audit-level=high\` (or pnpm equivalent). For each
  HIGH/CRITICAL finding, either upgrade the package or document a
  compensating control if the upgrade breaks the build.

Production readiness:
  Every file you touch must remain syntactically valid TypeScript.
  Zero TODOs, zero stubs. Write it so the app ships as-is.`,

    // task() returns the concrete, build-specific instruction.
    // It reads ctx.stack.notes to adapt to the project's tech choices.
    task(ctx) {
      const { brief, stack } = ctx;
      const digest = ctx.artifactsDigest();
      const priorContext = digest
        ? `\n\n## Prior build artifacts (specs from earlier phases)\n${digest}`
        : '';

      return `
## Your mission: perform an OWASP-grade security audit and fix every issue

### Project brief
${brief}

### Stack
${stack.summary}
Stack notes (follow these exactly): ${stack.notes}

${priorContext}

---

## Phase 1 — Reconnaissance (read before you write)

Walk the entire project tree. Focus on:
1. All files under \`src/app/api/\` — list every route and whether it
   performs an auth check before accessing data.
2. All Server Actions (\`'use server'\` files) — check input validation.
3. \`prisma/schema.prisma\` — check for raw query usage in \`src/\`.
4. \`next.config.*\` — check for security headers and CORS settings.
5. All \`.env*\` files — check for committed secrets.
6. \`package.json\` — note versions of auth, validation, and crypto packages.
7. Any middleware (\`src/middleware.ts\`) — verify protected route coverage.
8. Components that render user-supplied HTML (search for
   \`dangerouslySetInnerHTML\` — must be paired with a DOMPurify or
   isomorphic-dompurify sanitize call).
9. \`src/lib/\` — auth helpers, session utilities, fetch wrappers.
10. Any cookie-setting code — verify HttpOnly / Secure / SameSite.

---

## Phase 2 — Fix all findings in the project files

For each category below, inspect the project and apply the fix:

### 2-A. Input validation (Zod on every API boundary)
- Every \`route.ts\` handler that receives a request body must parse it
  with a Zod schema before use. Example pattern:
  \`\`\`ts
  import { z } from 'zod';
  const Body = z.object({ email: z.string().email(), ... });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  \`\`\`
- Every Server Action must validate its arguments with Zod before
  touching the database or sending email.
- Every query-param used in a Prisma query must be validated/typed first.

### 2-B. Authentication & authorization on every protected route
- Every \`route.ts\` under \`/api/\` that is not public must call
  \`auth()\` (or your stack's equivalent) and return 401 if no session.
- Object-level access: after confirming a session, confirm the
  authenticated user owns or is permitted to access the requested
  resource. A user must never be able to read/write another user's data
  by supplying a different id. Example IDOR fix:
  \`\`\`ts
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item || item.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  \`\`\`
- Middleware (\`src/middleware.ts\`) must cover ALL private routes — not
  just the ones already listed. Audit the routes you found in Phase 1
  and extend the matcher if any private route is unprotected.

### 2-C. SQL / NoSQL injection (Prisma raw queries)
- Search for \`prisma.$queryRaw\`, \`prisma.$executeRaw\`, and
  \`prisma.$queryRawUnsafe\`. Any use of \`$queryRawUnsafe\` must be
  replaced with \`$queryRaw\` using tagged template literals (which
  Prisma parameterizes automatically). If $queryRaw is used with string
  concatenation, rewrite it using Prisma's typed query API instead.

### 2-D. XSS prevention
- Search for \`dangerouslySetInnerHTML\`. Each occurrence must call
  DOMPurify.sanitize (install \`isomorphic-dompurify\` if not present):
  \`\`\`tsx
  import DOMPurify from 'isomorphic-dompurify';
  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
  \`\`\`
- Content-Security-Policy header (added in 2-F) provides the second layer.

### 2-E. CSRF protections
- Next.js App Router Server Actions have built-in CSRF protection via
  the \`Origin\` header check — do not disable it.
- For any custom API route that mutates state and accepts requests from
  the browser, verify that SameSite=Lax cookies (the NextAuth default)
  or an explicit Origin check is in place.

### 2-F. Security headers via next.config
Open (or create) \`next.config.ts\` (or \`next.config.js\`). Add or merge:
\`\`\`ts
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    // Tighten further if you know all script/style sources.
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",   // remove unsafe-inline once nonces/hashes are wired
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  // ...rest of existing config
};
export default nextConfig;
\`\`\`

### 2-G. Secrets only server-side; none in client bundles
- Grep for \`process.env.SECRET\`, \`process.env.DATABASE_URL\`, and any
  key that is not prefixed with \`NEXT_PUBLIC_\` being imported in a
  \`'use client'\` file or in any file under \`src/components/\` without
  a \`'use server'\` marker. Move them to server-only files.
- Install and use the \`server-only\` package in every lib file that
  reads secrets: \`import 'server-only';\` at the top.
- Verify \`.gitignore\` contains \`.env\`, \`.env.local\`, \`.env*.local\`.
  If missing, add those lines.
- Verify \`.env.example\` exists and has placeholder values (not real
  secrets). Create it if missing.

### 2-H. Rate-limiting on sensitive endpoints
Add rate-limiting middleware to:
  \`/api/auth/signin\`, \`/api/auth/callback\`, sign-up and password-reset
  routes.

If the stack notes mention Upstash / Redis, use
\`@upstash/ratelimit\` + \`@upstash/redis\`. Otherwise implement a
lightweight in-memory rate-limiter using a \`Map<string, {count, reset}>\`
keyed by IP (\`req.headers.get('x-forwarded-for') ?? 'unknown'\`).
Limit: 10 requests per 60-second window. Return HTTP 429 with
\`Retry-After\` header on breach.

Example in-memory implementation to add at
\`src/lib/rate-limit.ts\`:
\`\`\`ts
import 'server-only';

interface Window { count: number; reset: number; }
const store = new Map<string, Window>();

export function rateLimit(ip: string, limit = 10, windowMs = 60_000): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now > entry.reset) {
    store.set(ip, { count: 1, reset: now + windowMs });
    return { ok: true };
  }
  if (entry.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((entry.reset - now) / 1000) };
  }
  entry.count++;
  return { ok: true };
}
\`\`\`
Then in each sensitive route handler:
\`\`\`ts
import { rateLimit } from '@/lib/rate-limit';
const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
const rl = rateLimit(ip);
if (!rl.ok) {
  return NextResponse.json({ error: 'Too many requests' }, {
    status: 429,
    headers: { 'Retry-After': String(rl.retryAfter) },
  });
}
\`\`\`

### 2-I. Dependency vulnerabilities
Run:
\`\`\`sh
npm audit --audit-level=high --json > .helm-build/artifacts/npm-audit.json || true
\`\`\`
Parse the output. For every HIGH or CRITICAL finding:
1. Attempt \`npm audit fix\` (non-breaking upgrades only — do NOT use \`--force\`
   as it may introduce breaking changes).
2. If a package cannot be auto-fixed, document it in the security report
   with the CVE/advisory ID, affected range, and a compensating control
   (e.g., "this package is only used at build time and never handles
   untrusted input").

---

## Phase 3 — Write the security report

Write a comprehensive findings-and-fixes report to:
  \`.helm-build/artifacts/security-report.md\`

Structure:
\`\`\`md
# Security Audit Report

**Date:** <today's date>
**Project:** <brief excerpt — first 80 chars of brief>
**Stack:** <stack.summary>
**Auditor:** Security Auditor agent (OWASP Top 10 scope)

## Executive Summary
<2–4 sentences: overall risk posture before and after this audit>

## Findings & Fixes

### [CRITICAL|HIGH|MEDIUM|LOW|INFO] <Finding Title>
**OWASP category:** A0X — <name>
**Location:** <file(s) affected>
**Description:** <what the vulnerability is and why it matters>
**Fix applied:** <what you changed and the exact file(s) edited>
**Residual risk:** <any remaining exposure after the fix>

(repeat for every finding)

## Headers Verified
| Header | Status | Value set |
|--------|--------|-----------|
| CSP    | ADDED  | ... |
...

## Dependency Audit
<summary of npm audit results; list of HIGH/CRITICAL CVEs and their status>

## Files Modified
<bulleted list of every file touched>

## Recommendations (not yet implemented)
<anything that requires architectural decisions, external services, or
 is out of scope for an automated fix — ranked by severity>
\`\`\`

Also call \`ctx.setArtifact('security-report', <report content>)\` so the
orchestrator can include it in the final build report. Use the exact same
content you wrote to the file.

---

## Strict quality rules
- Zero TODOs, zero stubs, zero "not implemented".
- Every TypeScript file you touch must remain syntactically valid.
- Do not remove existing functionality while fixing security issues.
- If a fix requires a new npm package, add it to package.json and note it.
- Do not commit — the CI pipeline handles that.
- Write the security report LAST, after all code changes are in place.
`.trim();
    },
  },
];

// ─── Self-test ───────────────────────────────────────────────────────────────
// Run with:  node roles/security.mjs

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

  // ── Shape assertions ──────────────────────────────────────────────────────
  const [role] = roles;
  assert('roles is an array with one entry', Array.isArray(roles) && roles.length === 1);
  assert('id is security-auditor', role.id === 'security-auditor');
  assert('title is Security Auditor', role.title === 'Security Auditor');
  assert('phase is quality', role.phase === 'quality');
  assert('deps contains integration-engineer',
    Array.isArray(role.deps) && role.deps.includes('integration-engineer'));
  assert('model is opus', role.model === 'opus');
  assert('produces contains security-report',
    Array.isArray(role.produces) && role.produces.includes('security-report'));
  assert('system is a non-empty string',
    typeof role.system === 'string' && role.system.length > 0);
  assert('system mentions OWASP', role.system.includes('OWASP'));
  assert('system mentions least privilege', role.system.toLowerCase().includes('least privilege'));
  assert('system mentions defense in depth', role.system.toLowerCase().includes('defense in depth'));
  assert('system mentions CSP', role.system.includes('Content-Security-Policy'));
  assert('system mentions HSTS', role.system.includes('Strict-Transport-Security'));
  assert('system mentions HttpOnly', role.system.includes('HttpOnly'));
  assert('system mentions rate-limit', role.system.toLowerCase().includes('rate-limit'));
  assert('task is a function', typeof role.task === 'function');

  // ── task(fakeCtx) functional assertions ───────────────────────────────────
  const fakeCtx = {
    brief: 'x',
    stack: { summary: 'Next.js', notes: 'NextAuth, Prisma, Zod' },
    artifactsDigest: () => '',
  };
  const out = role.task(fakeCtx);
  assert('task(fakeCtx) returns a non-empty string',
    typeof out === 'string' && out.length > 0);
  assert('task output references ctx.stack.notes (NextAuth, Prisma, Zod)',
    out.includes('NextAuth, Prisma, Zod'));
  assert('task output mentions Zod input validation',
    out.includes('Zod'));
  assert('task output mentions IDOR / object-level access',
    out.toLowerCase().includes('idor') || out.includes('userId'));
  assert('task output mentions security headers',
    out.includes('Content-Security-Policy'));
  assert('task output mentions security-report artifact',
    out.includes('security-report'));
  assert('task output mentions rate-limit',
    out.toLowerCase().includes('rate-limit') || out.toLowerCase().includes('ratelimit'));
  assert('task output mentions npm audit',
    out.includes('npm audit'));
  assert('task output references the brief',
    out.includes('x'));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
