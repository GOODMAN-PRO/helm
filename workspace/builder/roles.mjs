#!/usr/bin/env node
// roles.mjs — aggregates every specialist role module under ./roles/ into one roster.
// Each ./roles/*.mjs exports `roles` (an array of Role objects per CONTRACT.md §1). The orchestrator
// imports getAllRoles() to schedule the full pipeline. Adding a new role file + listing it here is all
// it takes to extend the builder.

import { fileURLToPath } from 'node:url';

import { roles as discovery } from './roles/discovery.mjs';
import { roles as data } from './roles/data.mjs';
import { roles as api } from './roles/api.mjs';
import { roles as auth } from './roles/auth.mjs';
import { roles as ux } from './roles/ux.mjs';
import { roles as visualDesign } from './roles/visual-design.mjs';
import { roles as scaffold } from './roles/scaffold.mjs';
import { roles as frontendArch } from './roles/frontend-architecture.mjs';
import { roles as components } from './roles/components.mjs';
import { roles as features } from './roles/features.mjs';
import { roles as integration } from './roles/integration.mjs';
import { roles as testing } from './roles/testing.mjs';
import { roles as security } from './roles/security.mjs';
import { roles as accessibility } from './roles/accessibility.mjs';
import { roles as performance } from './roles/performance.mjs';
import { roles as finalize } from './roles/finalize.mjs';

const MODULES = [
  discovery, data, api, auth, ux, visualDesign, scaffold, frontendArch,
  components, features, integration, testing, security, accessibility, performance, finalize,
];

export function getAllRoles() {
  const out = [];
  for (const mod of MODULES) if (Array.isArray(mod)) out.push(...mod);
  return out;
}

// Validate the roster: unique ids, valid phases, deps that resolve, and a callable task(). Returns
// { ok, count, errors } — used by the smoke test and the CLI's --check.
const VALID_PHASES = ['discovery', 'architecture', 'design', 'scaffold', 'data', 'backend', 'auth', 'frontend', 'integration', 'quality', 'finalize'];
export function validateRoles(roles = getAllRoles()) {
  const errors = [];
  const ids = new Set();
  for (const r of roles) {
    if (!r || !r.id) { errors.push('role with no id'); continue; }
    if (ids.has(r.id)) errors.push(`duplicate id: ${r.id}`);
    ids.add(r.id);
    if (!VALID_PHASES.includes(r.phase)) errors.push(`${r.id}: invalid phase "${r.phase}"`);
    if (typeof r.task !== 'function') errors.push(`${r.id}: task is not a function`);
    if (typeof r.system !== 'string' || !r.system.trim()) errors.push(`${r.id}: missing system prompt`);
    if (!['opus', 'sonnet', 'haiku'].includes(r.model)) errors.push(`${r.id}: invalid model "${r.model}"`);
  }
  for (const r of roles) for (const d of (r.deps || [])) if (!ids.has(d)) errors.push(`${r.id}: unknown dep "${d}"`);
  return { ok: errors.length === 0, count: roles.length, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const roles = getAllRoles();
  const v = validateRoles(roles);
  console.log(`roles: ${v.count}`);
  for (const r of roles) console.log(`  [${r.phase}] ${r.id} (${r.model})${r.deps && r.deps.length ? ' ← ' + r.deps.join(', ') : ''}`);
  if (!v.ok) { console.error('VALIDATION ERRORS:\n' + v.errors.map(e => '  - ' + e).join('\n')); process.exit(1); }
  console.log('validation OK');
}
