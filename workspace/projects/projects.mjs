#!/usr/bin/env node
// projects.mjs — a small structured project tracker the owner manages from chat.
// Store: workspace/projects.json — [{ id, name, status, note, created, updated }]
//   status: active | cancelled | done
// Importable (listProjects/addProject/cancelProject/deleteProject/setStatus) AND a CLI:
//   node projects.mjs list|add|cancel|done|delete <name>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, '..');
const FILE      = path.join(WORKSPACE, 'projects.json');

const nowIso = () => new Date().toISOString();
const slug   = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'project';

function load() { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return []; } }
function save(list) { writeFileSync(FILE, JSON.stringify(list, null, 2)); }

// Match a project by exact id (slug), exact name, or a clear substring of the name.
function match(list, q) {
  const s = String(q || '').trim(); if (!s) return null;
  const ql = s.toLowerCase();
  return list.find(p => p.id === slug(s))
      || list.find(p => p.name.toLowerCase() === ql)
      || list.find(p => ql.length >= 2 && p.name.toLowerCase().includes(ql))
      || null;
}

export function listProjects() { return load(); }

export function addProject(name, note = '') {
  const list = load();
  const id = slug(name);
  const existing = list.find(p => p.id === id);
  if (existing) { if (existing.status !== 'active') { existing.status = 'active'; existing.updated = nowIso(); save(list); } return { ok: true, already: true, project: existing }; }
  const p = { id, name: String(name).trim(), status: 'active', note, created: nowIso(), updated: nowIso() };
  list.push(p); save(list);
  return { ok: true, project: p };
}

export function setStatus(q, status) {
  const list = load();
  const p = match(list, q);
  if (!p) return { ok: false, error: `no project matching "${q}"`, names: list.map(x => x.name) };
  p.status = status; p.updated = nowIso(); save(list);
  return { ok: true, project: p };
}

export const cancelProject = q => setStatus(q, 'cancelled');
export const doneProject   = q => setStatus(q, 'done');

export function deleteProject(q) {
  const list = load();
  const p = match(list, q);
  if (!p) return { ok: false, error: `no project matching "${q}"`, names: list.map(x => x.name) };
  save(list.filter(x => x.id !== p.id));
  return { ok: true, deleted: p.name };
}

// Pretty one-line-per-project summary for chat (active first).
export function renderProjects() {
  const list = load();
  if (!list.length) return 'No projects tracked yet. Add one: `new project <name>`.';
  const order = { active: 0, done: 1, cancelled: 2 };
  const mark = { active: '•', done: '✓', cancelled: '✗' };
  const sorted = [...list].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  return sorted.map(p => `${mark[p.status] || '•'} **${p.name}**${p.status !== 'active' ? ` _(${p.status})_` : ''}${p.note ? ` — ${p.note}` : ''}`).join('\n');
}

// ---- CLI ----
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [verb, ...rest] = process.argv.slice(2);
  const arg = rest.join(' ').trim();
  let out;
  switch (verb) {
    case 'add':    out = addProject(arg); break;
    case 'cancel': out = cancelProject(arg); break;
    case 'done':   out = doneProject(arg); break;
    case 'delete':
    case 'remove': out = deleteProject(arg); break;
    case 'list':
    case undefined: out = { ok: true, projects: listProjects() }; break;
    default: console.error(`unknown verb: ${verb}. Use list|add|cancel|done|delete <name>`); process.exit(1);
  }
  console.log(JSON.stringify(out));
}
