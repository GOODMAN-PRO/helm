// frontend-architecture.mjs — Frontend Architect role for the Helm full-stack builder.
// Establishes the frontend foundation: routing tree, RSC/client strategy, data-fetching
// patterns, global state, typed API client, error/loading boundaries, form conventions,
// and shared providers. Implements scaffolding pieces AND documents patterns.
//
// §1 of CONTRACT.md owns the role schema interface.

import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Role definition
// ---------------------------------------------------------------------------

export const roles = [
  {
    id: 'frontend-architect',
    title: 'Frontend Architect',
    phase: 'frontend',
    deps: ['project-scaffolder', 'design-system-engineer', 'api-designer'],
    model: 'opus',
    produces: ['frontend-architecture'],

    // Rich expert persona — demands RSC correctness, type safety, performance, clear conventions.
    system: `You are a principal frontend architect with 12+ years of React experience and deep
expertise in Next.js App Router, React Server Components (RSC), TypeScript strict mode, and
production-grade frontend systems. You have shipped many large-scale Next.js applications and
you have strong, opinionated views on correctness and conventions.

Your mandate for this build:
- Establish the COMPLETE frontend foundation that every component and feature engineer will
  follow. Every pattern you define becomes law for this project.
- RSC correctness is non-negotiable: async Server Components fetch data directly; Client
  Components are marked 'use client' and kept as leaf nodes. Never put async/await in a
  Client Component for data fetching. Never import a Client Component into a Server Component
  without a boundary. The rule: data down, events up, client components at the leaves.
- Type safety end-to-end: no 'any', no type assertions, no unchecked JSON. Use Zod to
  validate ALL external data (API responses, form inputs, env vars).
- Performance defaults: RSC for data-heavy routes, Suspense + streaming for progressive
  hydration, next/image and next/font everywhere, route groups to co-locate related code.
- Clear, documented conventions so junior engineers can't make wrong choices easily.

Your output MUST be production-quality, fully-wired, NO-STUB code:
- No TODO comments, no "not implemented", no empty functions, no placeholder strings.
- Every import resolves. Every component renders. Every type is correct.
- Write to REAL project files; use the artifact mechanism to record the architecture document.`,

    // task() returns the concrete instruction string for this build, referencing ctx.stack.notes.
    task(ctx) {
      const stackNotes = ctx.stack?.notes ?? 'Next.js App Router, TypeScript, Tailwind, shadcn/ui';
      const brief = ctx.brief ?? '';
      const priorArtifacts = ctx.artifactsDigest?.() ?? '';

      return `
## Build: Frontend Architecture Foundation

### Project brief
${brief}

### Stack conventions (follow these exactly)
${stackNotes}

### Prior artifacts from upstream roles
${priorArtifacts || '(none yet — infer from the brief and stack)'}

---

## What you must implement (all of these, no stubs)

### 1. Root layout with providers  →  \`src/app/layout.tsx\`
Write the root layout. It must:
- Import and apply the global CSS (tailwind directives).
- Wrap children in ALL shared providers (theme, session, react-query) using a single
  \`<Providers>\` Client Component defined in \`src/app/_providers.tsx\`.
- Set correct \`<html lang>\` and \`<body>\` classes.
- Export a \`metadata\` object with title template, description, openGraph basics derived
  from the brief.

### 2. Shared providers  →  \`src/app/_providers.tsx\`
Mark 'use client'. Compose:
- \`ThemeProvider\` from next-themes (defaultTheme 'system', attribute 'class').
- \`SessionProvider\` from next-auth/react wrapping the session from server (accept
  \`session\` prop passed from layout via \`getServerSession\`).
- \`QueryClientProvider\` from @tanstack/react-query with a \`QueryClient\` created once
  via \`useState\` (so it isn't recreated on re-renders).
- \`ReactQueryDevtools\` imported lazily (process.env.NODE_ENV === 'development' guard).

### 3. Typed API client + fetch helper  →  \`src/lib/api.ts\`
Write a typed fetch helper \`apiFetch<T>(path, options?)\` that:
- Prepends the correct base URL (reads NEXT_PUBLIC_API_URL env var, falls back to '').
- Accepts an optional Zod schema parameter \`schema?: z.ZodType<T>\` — if provided,
  parse the response JSON through it and throw a typed error on validation failure.
- Sets default headers (Content-Type, Accept).
- Returns \`Promise<T>\`.
- Has a named export \`api\` object with typed convenience wrappers: \`api.get\`,
  \`api.post\`, \`api.put\`, \`api.patch\`, \`api.delete\`.
All types must be explicit — no \`any\`.

### 4. Error boundary  →  \`src/components/error-boundary.tsx\`
Write a proper React error boundary class component with:
- \`fallback\` prop (\`ReactNode\` or render function \`(error: Error, reset: () => void) => ReactNode\`).
- \`onError\` prop for logging (\`(error: Error, info: ErrorInfo) => void\`).
- A default exported \`ErrorBoundary\` and a named \`withErrorBoundary(Component, options)\` HOC.

### 5. Global error page  →  \`src/app/error.tsx\`
Mark 'use client' (required by Next.js). Accept \`error: Error & { digest?: string }\` and
\`reset: () => void\` props. Render a centered, styled error UI with a "Try again" button.

### 6. Global not-found page  →  \`src/app/not-found.tsx\`
Server Component. Render a clean 404 UI with a "Go home" link.

### 7. Loading skeleton  →  \`src/app/loading.tsx\`
Server Component. Render a full-page skeleton using shadcn/ui Skeleton component or
Tailwind animate-pulse divs that match the approximate layout of typical content pages.

### 8. Route group layout pattern  →  \`src/app/(app)/layout.tsx\`
Demonstrate the authenticated-area route group. This layout:
- Is a Server Component that calls \`getServerSession\` and redirects to /login if null.
- Renders a sidebar/nav shell with a \`<main>\` slot for \`{children}\`.
- Passes the session down to \`_providers.tsx\` (via the root layout pattern).

### 9. Typed env helper  →  \`src/lib/env.ts\`
Use Zod to parse and export all required env vars at import time, so missing vars crash
fast with a clear message. Cover: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL,
NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_API_URL (optional with default).

### 10. Form convention helper  →  \`src/lib/form.ts\`
Export a typed \`useAppForm<TSchema extends z.ZodType>(schema: TSchema, defaults: z.infer<TSchema>)\`
hook that wires react-hook-form's \`useForm\` with the zodResolver, returning the full
\`UseFormReturn<z.infer<TSchema>>\`. Also export a typed \`FormField\` wrapper component
that renders a label + input + error message from react-hook-form's \`Controller\`.

### 11. Suspense wrapper  →  \`src/components/async-boundary.tsx\`
Export \`AsyncBoundary\` — a convenience wrapper that composes \`<Suspense fallback={<LoadingSkeleton/>}>\`
with \`<ErrorBoundary fallback={defaultErrorFallback}>\`. Accept \`loadingFallback\` and
\`errorFallback\` props to override defaults.

---

## Architecture document  →  \`.helm-build/artifacts/frontend-architecture.md\`

After writing all the files above, use ctx.setArtifact('frontend-architecture', content) to
record a concise architecture document covering:

1. **Routing tree** — route groups, nested layouts, which layouts are server vs client.
2. **RSC / Client split rules** — the exact decision tree engineers must follow.
3. **Data-fetching patterns** — when to use Server Component fetch, server actions,
   react-query on client, and when NOT to use each.
4. **Global state** — what goes in react-query cache, what goes in context, what goes in URL params.
5. **Typed API client usage** — examples of \`apiFetch\` with and without Zod schema.
6. **Form convention** — how to wire \`useAppForm\` + \`FormField\` in a new form.
7. **Error / loading / not-found convention** — when to use the global pages vs route-level Suspense.
8. **Provider order** — why providers are ordered the way they are.

Keep it under 600 lines; use markdown headers and short code examples. Component engineers
should be able to implement a complete feature without asking questions after reading this doc.

---

## Hard constraints
- All TypeScript must compile with strict mode. No 'as any', no '!', no @ts-ignore.
- All imports must resolve — add the exact package names that are in package.json for this stack.
- Do NOT create placeholder files. Every file must be complete and working.
- Use the shadcn/ui import path convention ('@/components/ui/...') — do not invent new paths.
- Tailwind classes only — no inline styles, no CSS modules (unless the stack explicitly uses them).
- Every async Server Component that reads data wraps data sections in <Suspense>.
- Client Components that fetch data use react-query hooks, not useEffect + fetch.
`.trim();
    },
  },
];

// ---------------------------------------------------------------------------
// Self-test (run only when executed directly)
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Validate role shape against CONTRACT.md §1 schema.
  const REQUIRED_KEYS = ['id', 'title', 'phase', 'deps', 'model', 'produces', 'system', 'task'];
  const VALID_PHASES  = ['discovery','architecture','design','scaffold','data','backend','auth',
                         'frontend','integration','quality','finalize'];
  const VALID_MODELS  = ['opus', 'sonnet', 'haiku'];

  let passed = 0;
  let failed = 0;

  function assert(label, condition, detail = '') {
    if (condition) {
      console.log(`  PASS  ${label}`);
      passed++;
    } else {
      console.error(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
      failed++;
    }
  }

  console.log('frontend-architecture.mjs — self-test\n');

  // 1. Exactly one role exported.
  assert('roles is an array',   Array.isArray(roles));
  assert('exactly one role',    roles.length === 1, `got ${roles.length}`);

  const role = roles[0];

  // 2. Required keys present.
  for (const key of REQUIRED_KEYS) {
    assert(`role has key '${key}'`, key in role);
  }

  // 3. Field values.
  assert("id = 'frontend-architect'",     role.id      === 'frontend-architect');
  assert("phase = 'frontend'",            role.phase   === 'frontend');
  assert("model = 'opus'",                role.model   === 'opus');
  assert('phase is valid',                VALID_PHASES.includes(role.phase));
  assert('model is valid',                VALID_MODELS.includes(role.model));
  assert('deps is array of strings',      Array.isArray(role.deps) && role.deps.every(d => typeof d === 'string'));
  assert('produces contains frontend-architecture',
    Array.isArray(role.produces) && role.produces.includes('frontend-architecture'));
  assert('system is non-empty string',    typeof role.system === 'string' && role.system.trim().length > 0);
  assert('task is a function',            typeof role.task   === 'function');

  // 4. task(fakeCtx) returns a non-empty string.
  const fakeCtx = {
    brief:           'A task management app with teams and projects',
    stack:           { summary: 'Next.js', notes: 'App Router, RSC, react-hook-form, Zod' },
    artifactsDigest: () => '',
  };

  let taskResult;
  try {
    taskResult = role.task(fakeCtx);
  } catch (err) {
    console.error(`  FAIL  task(fakeCtx) threw: ${err.message}`);
    failed++;
  }

  assert('task(fakeCtx) returns a string',      typeof taskResult === 'string');
  assert('task(fakeCtx) is non-empty',          typeof taskResult === 'string' && taskResult.trim().length > 100,
         `length=${typeof taskResult === 'string' ? taskResult.trim().length : 'N/A'}`);
  assert('task references stack notes',
    typeof taskResult === 'string' && taskResult.includes(fakeCtx.stack.notes));

  // 5. system prompt mentions RSC correctness signals.
  const systemLower = role.system.toLowerCase();
  assert('system mentions RSC',            systemLower.includes('rsc') || systemLower.includes('server component'));
  assert('system mentions type safety',    systemLower.includes('type') || systemLower.includes('zod'));
  assert('system demands no stubs',        systemLower.includes('stub') || systemLower.includes('no-stub'));

  console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
