#!/usr/bin/env node
// cortex — Helm's bridge to the local CORTEX app (AI-first memory layer / networked notes brain).
// CORTEX is an Express server on http://127.0.0.1:7002 (workspace/cortex/server.mjs). This tool lets
// Helm capture, search, recall (by meaning), and inspect the knowledge base from one CLI verb.
//
// Usage:
//   node cortex.mjs capture  --text "..." [--tags a,b,c]
//   node cortex.mjs new      --title "..." [--content "..."] [--tags a,b]
//   node cortex.mjs search   --q "..."        (keyword / FTS5)
//   node cortex.mjs recall   --q "..."        (semantic, by meaning)
//   node cortex.mjs recent   [--limit N]
//   node cortex.mjs get      --id "..."
//   node cortex.mjs related  --id "..."
//   node cortex.mjs ask      --q "..."
//   node cortex.mjs projects
//   node cortex.mjs tasks
//   node cortex.mjs layers
//
// Conventions (match the other Helm tools): flags are `--key value`; a flag with no value (or one
// immediately followed by another --flag) is boolean true; `--tags a,b,c` becomes an array. Prints
// EXACTLY ONE compact JSON object to stdout for every code path and exits 0 (never crashes) — on a
// network failure it returns {ok:false,error:"CORTEX not running ..."} so Helm can react gracefully.

const BASE = 'http://127.0.0.1:7002';
const TIMEOUT_MS = 20_000;

// ---- arg parsing: `--flag value`, bare/`--flag --next` => true, repeated flags collected ----
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    let val;
    if (next === undefined || next.startsWith('--')) {
      val = true;            // boolean flag (no following value)
    } else {
      val = next;
      i++;                   // consume the value
    }
    if (key in out) {
      out[key] = Array.isArray(out[key]) ? [...out[key], val] : [out[key], val];
    } else {
      out[key] = val;
    }
  }
  return out;
}

const print = obj => { process.stdout.write(JSON.stringify(obj) + '\n'); };
const fail  = msg => { print({ ok: false, error: msg }); process.exit(0); };

// Split `--tags a,b,c` (or a repeated flag) into a clean string array; undefined stays undefined.
function toTags(v) {
  if (v === undefined) return undefined;
  const parts = (Array.isArray(v) ? v : [v])
    .flatMap(x => String(x).split(','))
    .map(s => s.trim())
    .filter(Boolean);
  return parts;
}

// Require a string flag (boolean-true / missing both rejected) — returns the value or never returns.
function reqStr(args, key, verb) {
  const v = args[key];
  if (v === undefined || v === true || v === '') fail(`${verb} requires --${key} "..."`);
  return String(v);
}

const NETWORK_ERR =
  `CORTEX not running at ${BASE} (start it: node workspace/cortex/server.mjs)`;

// One HTTP request with a 20s AbortController timeout. Returns the parsed JSON body (or text), or
// throws {network:true} on connection failure / timeout so callers map it to the friendly message.
async function api(method, path, body) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let res;
  try {
    const opts = { method, signal: ac.signal, headers: { accept: 'application/json' } };
    if (body !== undefined) {
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    res = await fetch(BASE + path, opts);
  } catch (e) {
    clearTimeout(timer);
    const err = new Error(e && e.name === 'AbortError' ? `CORTEX request timed out after ${TIMEOUT_MS / 1000}s` : NETWORK_ERR);
    err.network = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text().catch(() => '');
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const detail = data && typeof data === 'object' && data.error ? data.error : (typeof data === 'string' ? data.slice(0, 200) : `HTTP ${res.status}`);
    const err = new Error(`CORTEX ${method} ${path} -> ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function qs(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function run() {
  const argv = process.argv.slice(2);
  const verb = argv[0];
  if (!verb || verb.startsWith('--')) {
    return fail('usage: cortex <capture|new|search|recall|recent|get|related|ask|projects|tasks|layers> --flag value');
  }
  const args = parseArgs(argv.slice(1));

  switch (verb) {
    case 'capture': {
      const text = reqStr(args, 'text', 'capture');
      const tags = toTags(args.tags);
      const note = await api('POST', '/api/capture', { text, tags: tags ?? [] });
      return print({ ok: true, note });
    }

    case 'new': {
      const title = reqStr(args, 'title', 'new');
      const content = args.content === undefined || args.content === true ? '' : String(args.content);
      const tags = toTags(args.tags);
      const id = `note-${Date.now()}`;
      const note = await api('POST', '/api/notes', { id, title, content, tags: tags ?? [] });
      return print({ ok: true, note });
    }

    case 'search': {
      const q = reqStr(args, 'q', 'search');
      const results = await api('GET', `/api/notes/search${qs({ q })}`);
      return print({ ok: true, query: q, count: Array.isArray(results) ? results.length : undefined, results });
    }

    case 'recall': {
      const q = reqStr(args, 'q', 'recall');
      const results = await api('GET', `/api/notes/semantic${qs({ q })}`);
      return print({ ok: true, query: q, count: Array.isArray(results) ? results.length : undefined, results });
    }

    case 'recent': {
      const limit = args.limit === undefined || args.limit === true ? undefined : parseInt(args.limit, 10) || undefined;
      const results = await api('GET', `/api/notes/recent${qs({ limit })}`);
      return print({ ok: true, count: Array.isArray(results) ? results.length : undefined, results });
    }

    case 'get': {
      const id = reqStr(args, 'id', 'get');
      const note = await api('GET', `/api/notes/${encodeURIComponent(id)}`);
      return print({ ok: true, note });
    }

    case 'related': {
      const id = reqStr(args, 'id', 'related');
      const results = await api('GET', `/api/notes/${encodeURIComponent(id)}/related`);
      return print({ ok: true, id, count: Array.isArray(results) ? results.length : undefined, results });
    }

    case 'ask': {
      const q = reqStr(args, 'q', 'ask');
      const data = await api('POST', '/api/ai/ask', { query: q });
      // Server already returns {ok, query, sources, context, instruction}; surface the useful bits.
      return print({
        ok: true,
        query: q,
        sources: (data && data.sources) || [],
        context: (data && data.context) || '',
      });
    }

    case 'projects': {
      const projects = await api('GET', '/api/projects');
      return print({ ok: true, count: Array.isArray(projects) ? projects.length : undefined, projects });
    }

    case 'tasks': {
      const tasks = await api('GET', `/api/tasks${qs({ status: 'open' })}`);
      return print({ ok: true, count: Array.isArray(tasks) ? tasks.length : undefined, tasks });
    }

    case 'layers': {
      const layers = await api('GET', '/api/layers');
      return print({ ok: true, layers });
    }

    default:
      return fail(`unknown verb "${verb}" (expected: capture, new, search, recall, recent, get, related, ask, projects, tasks, layers)`);
  }
}

run().catch(err => {
  // Network/timeout failures get the friendly "start it" message; everything else its own message.
  // Either way: exactly one JSON object, exit 0 (Helm tools print JSON, they don't crash).
  if (err && err.network) fail(err.message);
  fail(String((err && err.message) || err));
});
