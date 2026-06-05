#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, '../..');
const WEB_MJS   = path.join(__dirname, 'web.mjs');


const rawArgs = process.argv.slice(2);
const get = k => { const i = rawArgs.indexOf(`--${k}`); return i !== -1 ? rawArgs[i + 1] : null; };

const question = get('question');
const depth    = Math.min(Math.max(parseInt(get('depth') || '2', 10), 1), 3);
const outArg   = get('out');

function die(msg) { console.log(JSON.stringify({ ok: false, error: msg })); process.exit(1); }

if (!question) die('--question is required');




function runClaude(prompt) {
  const r = spawnSync(
    'C:\\Users\\User\\.local\\bin\\claude.exe',
    ['-p', prompt],
    { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }
  );
  if (r.error) throw new Error(`claude spawn: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`claude exit ${r.status}: ${(r.stderr || '').slice(0, 300)}`);
  return (r.stdout || '').trim();
}

/** Run web.mjs search; returns result array (may be empty on failure). */
function webSearch(query, limit) {
  const r = spawnSync(
    process.execPath,   // same node binary
    [WEB_MJS, 'search', '--query', query, '--limit', String(limit)],
    { encoding: 'utf8', timeout: 40_000, maxBuffer: 2 * 1024 * 1024 }
  );
  if (r.status !== 0 || r.error) return [];
  try {
    const parsed = JSON.parse(r.stdout);
    return Array.isArray(parsed.results) ? parsed.results : [];
  } catch { return []; }
}


function webFetch(url, maxChars = 4000) {
  const r = spawnSync(
    process.execPath,
    [WEB_MJS, 'fetch', '--url', url],
    { encoding: 'utf8', timeout: 35_000, maxBuffer: 4 * 1024 * 1024 }
  );
  if (r.status !== 0 || r.error) return '';
  try {
    const parsed = JSON.parse(r.stdout);
    return typeof parsed.text === 'string' ? parsed.text.slice(0, maxChars) : '';
  } catch { return ''; }
}

/** Extract a JSON array from an LLM reply that may have prose around it. */
function extractJsonArray(text) {
  const m = text.match(/\[[\s\S]*?\]/);
  if (!m) throw new Error('no JSON array found in claude reply');
  return JSON.parse(m[0]);
}


function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// ── determine search count from depth ─────────────────────────────────────────
// depth 1 → 3 queries, depth 2 → 4 queries, depth 3 → 5 queries
const queryCount = depth + 2;
// max unique URLs to fetch; cap total content to ~20 000 chars
const maxUrls    = Math.min(depth + 4, 8);
const charPerUrl = 4000;

// ── step 1: generate search queries ───────────────────────────────────────────
const queryPrompt = `You are a research assistant. Given a research question, produce ${queryCount} short, distinct, focused web search queries that together will surface the most relevant and authoritative information.

Respond with ONLY a valid JSON array of strings, no explanation, no markdown, no extra text.

Research question: ${question}`;

let queries;
try {
  const raw = runClaude(queryPrompt);
  queries = extractJsonArray(raw);
  if (!Array.isArray(queries) || queries.length === 0) throw new Error('empty array');
  queries = queries.slice(0, queryCount).map(q => String(q).trim()).filter(Boolean);
} catch (e) {
  die(`Step 1 (query generation) failed: ${e.message}`);
}


const resultsByQuery = [];
const searchLimit = 5;

for (const q of queries) {
  const results = webSearch(q, searchLimit);
  resultsByQuery.push({ query: q, results });
}



const seen  = new Set();
const pool  = [];

for (const { results } of resultsByQuery) {
  for (const r of results) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    pool.push({ title: r.title || r.url, url: r.url, snippet: r.snippet || '' });
    if (pool.length >= maxUrls) break;
  }
  if (pool.length >= maxUrls) break;
}

// Fetch page text for each candidate; skip failures silently.
const fetched = [];   // { title, url, text }
let totalChars = 0;
const totalCap = charPerUrl * maxUrls;   // ~20 000

for (const { title, url } of pool) {
  if (totalChars >= totalCap) break;
  const remaining = totalCap - totalChars;
  const cap       = Math.min(charPerUrl, remaining);
  const text      = webFetch(url, cap);
  if (!text) continue;
  fetched.push({ title, url, text });
  totalChars += text.length;
}

// If fetch got nothing, fall back to using snippets only.
const hasContent = fetched.length > 0;
const sourcesForSynth = hasContent
  ? fetched.map((f, i) => `[${i + 1}] ${f.url}\n${f.title}\n${f.text}`)
  : pool.slice(0, 6).map((p, i) => `[${i + 1}] ${p.url}\n${p.title}\n${p.snippet}`);

const sourcesLabel = hasContent ? fetched : pool.slice(0, 6).map(p => ({ ...p, text: p.snippet }));

// ── step 4: synthesize report ─────────────────────────────────────────────────
const synthPrompt = `You are an expert research analyst. Using ONLY the source material below, write a comprehensive, well-organized research report answering the question.

Requirements:
- Structure with markdown headers (##, ###)
- Cite sources inline as [1], [2], etc. referencing the numbered sources below
- Be factual and accurate; if sources conflict, note it
- Include a "## Sources" section at the END listing all cited sources as:
  [1] Title — URL
  [2] Title — URL
  …
- Do NOT invent facts not in the sources
- Depth level: ${depth}/3 (${depth === 1 ? 'concise overview' : depth === 2 ? 'balanced detail' : 'thorough in-depth'})

Research question: ${question}

--- SOURCE MATERIAL ---
${sourcesForSynth.join('\n\n---\n\n')}`;

let report;
try {
  report = runClaude(synthPrompt);
} catch (e) {
  die(`Step 4 (synthesis) failed: ${e.message}`);
}

// ── extract sources list from report ──────────────────────────────────────────
// Build a canonical sources array from the fetched/pool data we fed to claude.
const sources = sourcesLabel.map((s, i) => ({
  n: i + 1,
  title: s.title || s.url,
  url: s.url,
}));

// ── save report to workspace/research/<slug>.md ───────────────────────────────
const researchDir = path.join(WORKSPACE, 'research');
mkdirSync(researchDir, { recursive: true });

const slug    = slugify(question);
const mdPath  = outArg || path.join(researchDir, `${slug}.md`);
const mdContent = `# Research: ${question}\n\n_Generated ${new Date().toISOString()}_\n\n${report}\n`;

try {
  writeFileSync(mdPath, mdContent, 'utf8');
} catch (e) {
  die(`Could not save report to ${mdPath}: ${e.message}`);
}


console.log(JSON.stringify({
  ok: true,
  question,
  report,
  sources,
  path: mdPath,
}, null, 2));
