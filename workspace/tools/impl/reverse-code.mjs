// reverse-code.mjs — static CODE analysis for the `reverse web` command.
//
// This is the part that makes the report actual reverse engineering instead of a network dump: it
// parses the JavaScript the site SERVES TO THE BROWSER (already public to anyone who loads the page),
// enumerates functions with an AST, builds a call graph, detects the module system, recovers original
// file structure from source maps when present, and does best-effort data-flow from a captured request's
// parameters back to the functions that reference them.
//
// SCOPE / ETHICS: it READS and EXPLAINS publicly-served code. It does NOT defeat anti-bot, forge signed
// requests, or circumvent access controls — it identifies where such logic lives so an AUTHORIZED owner
// can understand their own (or an authorized) target. Use only on targets you own or may analyze.

import * as acorn from 'acorn';
import * as acornLoose from 'acorn-loose';
import * as walk from 'acorn-walk';
import { createHash } from 'node:crypto';

const FUNC_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const sha1 = s => createHash('sha1').update(s).digest('hex').slice(0, 12);

// Tolerant parse: strict script → module → acorn-loose (never throws). Real bundles use every feature
// and are often truncated/obfuscated, so we degrade instead of failing the whole analysis.
function parse(code) {
  const opts = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowImportExportEverywhere: true, allowHashBang: true };
  try { return { ast: acorn.parse(code, { ...opts, sourceType: 'script' }), loose: false }; }
  catch { /* try module */ }
  try { return { ast: acorn.parse(code, { ...opts, sourceType: 'module' }), loose: false }; }
  catch { /* fall back to loose */ }
  try { return { ast: acornLoose.parse(code, { ecmaVersion: 'latest' }), loose: true }; }
  catch { return { ast: null, loose: true }; }
}

// Name a function: its own id, else infer from the binding it's attached to.
function inferName(node, ancestors) {
  if (node.id && node.id.name) return node.id.name;
  const parent = ancestors[ancestors.length - 2];
  if (!parent) return null;
  if (parent.type === 'VariableDeclarator' && parent.id && parent.id.name) return parent.id.name;
  if (parent.type === 'AssignmentExpression') return memberName(parent.left);
  if ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && parent.key)
    return parent.key.name || parent.key.value || null;
  return null;
}
function memberName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return node.property && (node.property.name || node.property.value) || null;
  return null;
}
function calleeName(callee) {
  if (!callee) return null;
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed) return callee.property && (callee.property.name || null);
  return null;
}

// Detect the module/loader system from telltale tokens (cheap, high-signal).
function detectModuleSystem(code) {
  const sys = [];
  if (/\b__d\(|requireLazy\(|\bBootloader\b/.test(code)) sys.push('Meta Haste (__d / requireLazy)');
  if (/webpackJsonp|__webpack_require__|webpackChunk|\bself\.webpackChunk/.test(code)) sys.push('webpack');
  if (/\bSystem\.register\(/.test(code)) sys.push('SystemJS');
  if (/\bdefine\.amd\b|\bdefine\(\[/.test(code)) sys.push('AMD');
  if (/(^|[\s;])(import|export)\s|import\s*\(/.test(code)) sys.push('ES modules');
  if (/\b__turbopack__|\b__next_f\b/.test(code)) sys.push('Next.js / Turbopack');
  if (/\b__vite__|\/@vite\/|import\.meta\.hot/.test(code)) sys.push('Vite');
  return [...new Set(sys)];
}

const ENDPOINT_RE = /["'`](\/(?:api|graphql|gql|ajax|v\d+|rest|_next\/data)\/[^"'`\s<>]{1,120})["'`]/g;
function extractEndpoints(code) {
  const out = new Set();
  const clean = s => s.replace(/\\/g, '').replace(/[`'"]+$/, '');   // drop escaped slashes + stray quotes
  for (const m of code.matchAll(ENDPOINT_RE)) out.add(clean(m[1]));
  for (const m of code.matchAll(/["'`](https?:\/\/[^"'`\s<>]{0,80}\/(?:api|graphql|gql)[^"'`\s<>]{0,80})["'`]/g)) out.add(clean(m[1]));
  return [...out].filter(Boolean).slice(0, 60);
}

// Parse ONE bundle's code into functions + call graph + flags.
export function analyzeBundle(code, name = 'inline') {
  const { ast, loose } = parse(code);
  const result = { name, bytes: code.length, hash: sha1(code), loose, parsed: !!ast,
    functions: [], moduleSystem: detectModuleSystem(code), endpoints: extractEndpoints(code) };
  if (!ast) return result;

  const funcs = [];
  const byNode = new Map();
  const onFunc = (node, _st, ancestors) => {
    if (byNode.has(node)) return;
    const f = {
      name: inferName(node, ancestors),
      start: node.start, end: node.end, size: (node.end - node.start) || 0,
      params: (node.params || []).map(p => p.name || p.type).slice(0, 10),
      async: !!node.async, generator: !!node.generator, calls: new Set(),
    };
    byNode.set(node, f); funcs.push(f);
  };
  // PASS 1 — register every function first. (acorn-walk's ancestor visitor fires AFTER recursing into
  // children, so a function isn't in `byNode` yet while its own body is being walked — hence two passes.)
  try {
    walk.ancestor(ast, { FunctionDeclaration: onFunc, FunctionExpression: onFunc, ArrowFunctionExpression: onFunc });
  } catch { /* partial AST */ }
  // PASS 2 — attribute each call to its nearest enclosing function (now all functions are registered).
  try {
    walk.ancestor(ast, {
      CallExpression(node, _st, ancestors) {
        let owner = null;
        for (let i = ancestors.length - 2; i >= 0; i--) { if (FUNC_TYPES.has(ancestors[i].type)) { owner = ancestors[i]; break; } }
        const cn = calleeName(node.callee);
        if (owner && cn) { const f = byNode.get(owner); if (f && f.calls.size < 200) f.calls.add(cn); }
      },
    });
  } catch { /* partial AST */ }

  // How many functions call each named function (a proxy for "importance").
  const callerCount = {};
  for (const f of funcs) for (const c of f.calls) callerCount[c] = (callerCount[c] || 0) + 1;

  for (const f of funcs) {
    const src = code.slice(f.start, f.end);
    f.snippet = src.slice(0, 160).replace(/\s+/g, ' ').trim();
    f.flags = [];
    if (/\bfetch\s*\(|XMLHttpRequest|\.graphql\b|\bdoc_id\b|sendBeacon|\.ajax\(|new WebSocket/.test(src)) f.flags.push('network');
    // REAL crypto only — actual primitives, not the presence of a param name (that was tautological:
    // we search for `lsd` then flag the function "crypto" because it contains `lsd`).
    if (/crypto\.subtle|subtle\.digest|\bbtoa\(|\batob\(|\bhmac\b|sha-?(1|256|512)|createHash|\bsign\s*\(|\bsignature\b|encrypt|decrypt/i.test(src)) f.flags.push('crypto');
    // Separate, honest signal: this function TOUCHES the signed/request params (where they're assembled).
    if (/jazoest|__dyn\b|__csr\b|\blsd\b|__hsdp|__sjsp|__comet_req|__spin_|fb_dtsg/.test(src)) f.flags.push('req-params');
    if (/addEventListener|\bon[A-Z]\w+\s*[:=]|handle[A-Z]\w+|Listener\b/.test(src) || (f.name && /^(on[A-Z]|handle[A-Z])|Listener$/.test(f.name))) f.flags.push('handler');
    if (/JSON\.parse|JSON\.stringify|localStorage|sessionStorage|document\.cookie/.test(src)) f.flags.push('state/io');
    f.callers = f.name ? (callerCount[f.name] || 0) : 0;
    // IMPORTANCE, not popularity: behavior dominates; fan-in and size are small tiebreakers (capped) so
    // a 360-caller logging utility can't outrank the function that builds a signed request.
    const sig = f.flags;
    f.score = (sig.includes('crypto') ? 55 : 0)
      + (sig.includes('network') ? 45 : 0)
      + (sig.includes('req-params') ? 35 : 0)
      + (sig.includes('state/io') ? 8 : 0)
      + (sig.includes('handler') ? 5 : 0)
      + Math.min(f.size / 80, 25) + Math.min(f.callers, 8) + (f.name && f.name.length > 2 ? 3 : 0);
    f.calls = [...f.calls];
  }
  result.functions = funcs;
  result.functionCount = funcs.length;
  return result;
}

// Decode inline <script> blocks from HTML; dedupe identical blobs (the requireLazy stub repeated 25×
// collapses to one), and base64-decode blocks that are clearly an encoded payload.
export function decodeInlineScripts(html) {
  const blocks = [];
  for (const m of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    let body = m[1].trim();
    if (!body || body.length < 16) continue;
    // JSON/LD or config blobs aren't code — skip type=application/json
    if (/type=["']application\/(ld\+)?json["']/i.test(m[0])) continue;
    // Looks like a pure base64 payload → decode (this is what FB inlines and evals).
    if (/^[A-Za-z0-9+/=\s]{24,}$/.test(body) && body.replace(/\s+/g, '').length % 4 === 0) {
      try { const dec = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8'); if (/[;(){}=]/.test(dec)) body = dec; } catch { /* keep raw */ }
    }
    blocks.push(body);
  }
  // dedupe by content hash
  const seen = new Map();
  for (const b of blocks) { const h = sha1(b); if (!seen.has(h)) seen.set(h, { code: b, count: 1 }); else seen.get(h).count++; }
  return [...seen.values()];
}

// Find a sourceMappingURL ref in a bundle (inline data: or external URL).
export function findSourceMapRef(code) {
  const m = code.match(/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m);
  return m ? m[1] : null;
}
// Parse a source-map JSON: recover original file list + symbol names (+ original source if embedded).
export function parseSourceMap(json) {
  let map; try { map = typeof json === 'string' ? JSON.parse(json) : json; } catch { return null; }
  const sources = Array.isArray(map.sources) ? map.sources : [];
  return {
    file: map.file || null,
    sources: sources.slice(0, 200),
    sourceCount: sources.length,
    names: Array.isArray(map.names) ? map.names.slice(0, 200) : [],
    hasContent: Array.isArray(map.sourcesContent) && map.sourcesContent.some(Boolean),
    sourcesContent: Array.isArray(map.sourcesContent) ? map.sourcesContent : null,
  };
}

// Best-effort data-flow: given parameter names / doc_ids captured from a live request, find the
// functions across all bundles that REFERENCE them. Honest: this shows where the value is touched, not
// a proof of construction — but it points you straight at the relevant code.
export function traceTerms(bundles, terms) {
  const hits = [];
  const uniq = [...new Set(terms.filter(t => t && String(t).length >= 3))].slice(0, 40);
  for (const t of uniq) {
    const term = String(t);
    const found = [];
    const seen = new Set();
    for (const b of bundles) {
      for (const f of b.functions || []) {
        const src = b.code ? b.code.slice(f.start, f.end) : '';
        if (!src.includes(term)) continue;
        const fn = f.name || '(anonymous)';
        const key = `${fn}|${b.name}|${(f.flags || []).join(',')}`;
        if (seen.has(key)) continue;            // collapse repeats (e.g. many anonymous in one bundle)
        seen.add(key);
        found.push({ bundle: b.name, fn, size: f.size, flags: f.flags });
        if (found.length >= 5) break;
      }
      if (found.length >= 5) break;
    }
    if (found.length) hits.push({ term, refs: found });
  }
  return hits;
}

// Top-level: analyze a set of {name, code} bundles. Returns aggregate + per-bundle results, and the
// global key-function ranking. `bundles` code is retained on each result for traceTerms.
export function analyzeSources(sources, { maxBytesPerBundle = 4_000_000, maxFunctions = 25 } = {}) {
  const results = [];
  for (const s of sources) {
    const code = (s.code || '').slice(0, maxBytesPerBundle);
    if (code.length < 16) continue;
    const r = analyzeBundle(code, s.name || 'inline');
    r.code = code;                 // kept for traceTerms; caller drops before serializing
    r.dupCount = s.count || 1;
    results.push(r);
  }
  const allFns = [];
  for (const r of results) for (const f of r.functions) allFns.push({ ...f, bundle: r.name });
  allFns.sort((a, b) => b.score - a.score);
  const moduleSystems = [...new Set(results.flatMap(r => r.moduleSystem))];
  const endpoints = [...new Set(results.flatMap(r => r.endpoints))].slice(0, 60);
  return {
    bundles: results,
    bundleCount: results.length,
    totalBytes: results.reduce((n, r) => n + r.bytes, 0),
    totalFunctions: results.reduce((n, r) => n + (r.functionCount || 0), 0),
    moduleSystems,
    endpoints,
    keyFunctions: allFns.slice(0, maxFunctions),
  };
}
