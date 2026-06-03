#!/usr/bin/env node
// scaffold-util.mjs — shared, hardened Next.js scaffolding for the builder's stacks.
//
// Two jobs:
//  1. nextCreateArgs() — the CORRECT, non-interactive create-next-app argv. (The old command passed
//     `--no-import-alias`/`--no-turbopack`, which aren't valid flags → create-next-app errored instantly
//     and produced nothing. The fix: real flags + `--yes` so any unprovided option, e.g. Turbopack,
//     takes a default instead of prompting.)
//  2. ensureNextScaffold() — a GUARANTEE: after create-next-app runs, if there's still no package.json
//     (network down, npx missing, future flag drift), write a minimal but fully buildable Next.js + TS
//     project from scratch. A build then ALWAYS starts from a valid base — never an empty folder.
//
// Used by both stack.mjs (next-fullstack) and stack-showcase.mjs so there's one source of truth.

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Correct, fully-specified, non-interactive create-next-app args (runs via `npx`).
// `pm` is 'npm' | 'pnpm'.
export function nextCreateArgs(projectDir, pm = 'npm') {
  return [
    '--yes',                       // npx: auto-confirm the create-next-app install
    'create-next-app@latest',
    projectDir,
    '--ts', '--tailwind', '--eslint', '--app', '--src-dir',
    pm === 'pnpm' ? '--use-pnpm' : '--use-npm',
    '--yes',                       // create-next-app: use defaults for anything not specified (no prompts)
    '--disable-git',               // we manage git ourselves
    '--import-alias', '@/*',       // valid form (the old `--no-import-alias` does not exist)
  ];
}

// Minimal, dependency-light Next.js (App Router) + TypeScript project that `npm install && npm run build`
// succeeds on. The design/feature agents layer Tailwind/components on top. This is the safety FLOOR.
export function writeMinimalNext(projectDir) {
  const w = (rel, content) => { mkdirSync(path.dirname(path.join(projectDir, rel)), { recursive: true }); writeFileSync(path.join(projectDir, rel), content); };
  w('package.json', JSON.stringify({
    name: 'app', version: '0.1.0', private: true,
    scripts: { dev: 'next dev', build: 'next build', start: 'next start', lint: 'next lint', typecheck: 'tsc --noEmit' },
    dependencies: { next: '^15.1.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
    devDependencies: { typescript: '^5.7.0', '@types/node': '^22', '@types/react': '^19', '@types/react-dom': '^19' },
  }, null, 2) + '\n');
  w('next.config.mjs', '/** @type {import("next").NextConfig} */\nconst nextConfig = {};\nexport default nextConfig;\n');
  w('tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true, strict: true,
      noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true,
      isolatedModules: true, jsx: 'preserve', incremental: true, plugins: [{ name: 'next' }], paths: { '@/*': ['./src/*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2) + '\n');
  w('next-env.d.ts', '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n');
  w('src/app/layout.tsx', `import type { Metadata } from 'next';\n\nexport const metadata: Metadata = { title: 'App', description: 'Built with Helm' };\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`);
  w('src/app/page.tsx', `export default function Home() {\n  return (\n    <main style={{ padding: 48, fontFamily: 'system-ui, sans-serif' }}>\n      <h1>Helm starter</h1>\n      <p>Base project scaffolded. The build agents replace this with the real site.</p>\n    </main>\n  );\n}\n`);
  w('.gitignore', 'node_modules\n.next\nout\nbuild\n.env*\n*.log\n');
  w('.env.example', '# Add environment variables here\n');
}

// Run after create-next-app. If a valid project exists, pass through; otherwise write the minimal base so
// the pipeline is never handed an empty directory. Never throws.
export function ensureNextScaffold(projectDir, runResult = {}) {
  try {
    if (existsSync(path.join(projectDir, 'package.json'))) {
      return { ok: true, output: runResult.output || 'create-next-app: ok' };
    }
    mkdirSync(projectDir, { recursive: true });
    writeMinimalNext(projectDir);
    return {
      ok: true, fallback: true,
      output: `${runResult.output || ''}\n[scaffold-fallback] create-next-app produced no project (${runResult.error || 'unknown'}) — wrote a minimal buildable Next.js base instead.`.trim(),
    };
  } catch (e) {
    return { ok: false, output: runResult.output || '', error: `scaffold + fallback failed: ${e?.message ?? e}` };
  }
}
