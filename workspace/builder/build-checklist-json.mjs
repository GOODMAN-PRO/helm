#!/usr/bin/env node
// build-checklist-json.mjs — deterministically merge the nine checklist/*.md "Machine-readable items"
// JSON blocks into one normalized workspace/builder/checklist-items.json. Severity normalized to
// critical|major|minor; `check` (AUTO/VISUAL) mapped to `mode` (auto|visual); deduped by id.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'checklist');
const OUT = path.join(__dirname, 'checklist-items.json');

const sevMap = { critical: 'critical', high: 'major', major: 'major', serious: 'major', medium: 'minor', moderate: 'minor', low: 'minor', minor: 'minor' };
const normSev = s => sevMap[String(s || '').toLowerCase()] || 'minor';
const normMode = (m, item) => {
  const v = String(m ?? item.check ?? item.mode ?? '').toLowerCase();
  return v.startsWith('a') ? 'auto' : 'visual';
};

// Pull every ```json fenced block that follows a "Machine-readable" heading (or the last fenced json block).
function extractItems(src) {
  const idx = src.indexOf('Machine-readable');
  const region = idx >= 0 ? src.slice(idx) : src;
  const out = [];
  const re = /```json\s*([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(region))) {
    try { const arr = JSON.parse(m[1]); if (Array.isArray(arr)) out.push(...arr); } catch (e) { /* skip malformed */ }
  }
  return out;
}

const files = readdirSync(DIR).filter(f => f.endsWith('.md')).sort();
const byId = new Map();
let raw = 0;
for (const f of files) {
  const items = extractItems(readFileSync(path.join(DIR, f), 'utf8'));
  for (const it of items) {
    raw++;
    if (!it || !it.id) continue;
    const norm = {
      id: String(it.id),
      category: String(it.category || f.replace('.md', '')),
      severity: normSev(it.severity),
      mode: normMode(it.mode, it),
      title: String(it.title || it.id),
      verify: String(it.verify || ''),
    };
    if (!byId.has(norm.id)) byId.set(norm.id, norm);   // dedupe by id, first wins
  }
}

const merged = [...byId.values()];
const counts = merged.reduce((a, c) => { a[c.severity] = (a[c.severity] || 0) + 1; a[c.mode] = (a[c.mode] || 0) + 1; return a; }, {});
writeFileSync(OUT, JSON.stringify(merged, null, 2) + '\n');
console.log(`merged ${merged.length} items (${raw} raw, ${raw - merged.length} dup) from ${files.length} files`);
console.log(`  severity: ${counts.critical || 0} critical · ${counts.major || 0} major · ${counts.minor || 0} minor`);
console.log(`  mode: ${counts.auto || 0} auto · ${counts.visual || 0} visual`);
console.log(`  → ${OUT}`);
JSON.parse(readFileSync(OUT, 'utf8'));   // assert valid
console.log('  ✓ valid JSON');
