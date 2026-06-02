#!/usr/bin/env node
// Helm LLM proxy — lets Claude Code (Helm's engine) run on ANY OpenAI-compatible model, including
// free online ones (Groq, OpenRouter, Cerebras, Together, ...) and local Ollama.
//
// Claude Code only speaks Anthropic's /v1/messages API. This proxy accepts those requests and
// translates them to /v1/chat/completions on an OpenAI-compatible provider, then translates the
// reply back. Point Claude Code at it with  ANTHROPIC_BASE_URL=http://localhost:<PORT>.
//
// Config (env):
//   PROXY_PORT       default 8787
//   OPENAI_BASE_URL  e.g. https://api.groq.com/openai/v1  ·  https://openrouter.ai/api/v1  ·  http://localhost:11434/v1
//   OPENAI_API_KEY   the provider's (free) key  ·  for Ollama use "ollama"
//   OPENAI_MODEL     e.g. llama-3.3-70b-versatile (Groq)  ·  a free OpenRouter model id
import http from 'node:http';

const PORT = parseInt(process.env.PROXY_PORT || '8787', 10);
const BASE = (process.env.OPENAI_BASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || '';
if (!BASE || !MODEL) { console.error('[helm-proxy] OPENAI_BASE_URL and OPENAI_MODEL are required'); process.exit(1); }

const readBody = req => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => r(b)); });
const blocksText = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => x.text || (x.type === 'text' ? x.text : '')).filter(Boolean).join('\n') : '';

// ---- Anthropic request -> OpenAI request ----
function toOpenAI(a) {
  const messages = [];
  if (a.system) { const s = blocksText(a.system); if (s) messages.push({ role: 'system', content: s }); }
  for (const m of a.messages || []) {
    if (typeof m.content === 'string') { messages.push({ role: m.role, content: m.content }); continue; }
    const text = []; const toolCalls = []; const toolResults = [];
    for (const b of m.content || []) {
      if (b.type === 'text') text.push(b.text);
      else if (b.type === 'tool_use') toolCalls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) } });
      else if (b.type === 'tool_result') toolResults.push({ tool_call_id: b.tool_use_id, content: blocksText(b.content) || '' });
    }
    if (m.role === 'assistant') {
      const msg = { role: 'assistant', content: text.join('\n') || null };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      messages.push(msg);
    } else {
      if (text.length) messages.push({ role: 'user', content: text.join('\n') });
      for (const tr of toolResults) messages.push({ role: 'tool', tool_call_id: tr.tool_call_id, content: tr.content });
    }
  }
  const req = { model: MODEL, messages, stream: false, max_tokens: a.max_tokens || 8192 };
  if (typeof a.temperature === 'number') req.temperature = a.temperature;
  // Claude Code sends its full tool suite (dozens). Forwarding ALL overwhelms weak free models;
  // forwarding NONE makes Helm a chatbot that only *claims* to act. Default = a curated CORE set so the
  // free model is a real (if smaller) agent. PROXY_TOOLS=all forwards everything; =none/0 forwards none.
  const mode = (process.env.PROXY_TOOLS || 'core').toLowerCase();
  if (mode !== 'none' && mode !== '0' && Array.isArray(a.tools) && a.tools.length) {
    const CORE = new Set(['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'LS', 'TodoWrite']);
    const picked = (mode === 'all' || mode === '1') ? a.tools : a.tools.filter(t => CORE.has(t.name));
    if (picked.length) req.tools = picked.map(t => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} } } }));
  }
  return req;
}

// ---- OpenAI response -> Anthropic content blocks + stop reason ----
function toBlocks(oai) {
  const msg = (oai.choices && oai.choices[0] && oai.choices[0].message) || {};
  const blocks = [];
  if (msg.content) blocks.push({ type: 'text', text: msg.content });
  for (const tc of msg.tool_calls || []) {
    let input = {}; try { input = JSON.parse(tc.function.arguments || '{}'); } catch {}
    blocks.push({ type: 'tool_use', id: tc.id || ('toolu_' + Math.random().toString(36).slice(2)), name: tc.function.name, input });
  }
  if (!blocks.length) blocks.push({ type: 'text', text: '' });
  const fr = oai.choices && oai.choices[0] && oai.choices[0].finish_reason;
  const stop = (msg.tool_calls && msg.tool_calls.length) ? 'tool_use' : fr === 'length' ? 'max_tokens' : 'end_turn';
  return { blocks, stop, usage: oai.usage || {} };
}

function sse(res, event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }

const server = http.createServer(async (req, res) => {
  // Claude Code probes the base URL (HEAD/GET) before using it — answer 200 so it proceeds.
  if (req.method === 'GET' || req.method === 'HEAD') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
  if (req.method !== 'POST') { res.writeHead(404).end('not found'); return; }
  const raw = await readBody(req);
  // token-count endpoint Claude Code may call — return a rough estimate
  if (req.url.includes('count_tokens')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ input_tokens: Math.ceil((raw || '').length / 4) })); return;
  }
  if (!req.url.includes('/v1/messages')) { res.writeHead(404).end('not found'); return; }
  let body; try { body = JSON.parse(raw || '{}'); } catch { res.writeHead(400).end('bad json'); return; }
  console.error(`[helm-proxy][req] /v1/messages stream=${body.stream} msgs=${(body.messages || []).length} tools=${(body.tools || []).length}`);
  try {
    const up = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify(toOpenAI(body)),
    });
    console.error(`[helm-proxy][upstream] ${up.status}`);
    if (!up.ok) {
      const t = await up.text();
      console.error(`[helm-proxy][upstream-err] ${up.status} ${t.slice(0, 300)}`);
      const hint = (up.status === 401 || up.status === 403)
        ? `Provider rejected the API key (HTTP ${up.status}). Check OPENAI_API_KEY for ${BASE} — run \`helm doctor\`.`
        : up.status === 404
        ? `Provider 404 — model "${MODEL}" may not exist at ${BASE}. Run \`helm doctor\` to list valid models.`
        : `${up.status}: ${t.slice(0, 600)}`;
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'upstream_error', message: hint } }));
      return;
    }
    const oai = await up.json();
    const { blocks, stop, usage } = toBlocks(oai);
    const id = 'msg_' + Math.random().toString(36).slice(2);
    const inTok = usage.prompt_tokens || 0, outTok = usage.completion_tokens || 0;

    if (body.stream === false) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id, type: 'message', role: 'assistant', model: MODEL, content: blocks, stop_reason: stop, stop_sequence: null, usage: { input_tokens: inTok, output_tokens: outTok } }));
      return;
    }
    // streaming: synthesize the Anthropic SSE event sequence from the full reply
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    sse(res, 'message_start', { type: 'message_start', message: { id, type: 'message', role: 'assistant', model: MODEL, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: inTok, output_tokens: 0 } } });
    blocks.forEach((blk, i) => {
      if (blk.type === 'text') {
        sse(res, 'content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } });
        sse(res, 'content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: blk.text } });
      } else {
        sse(res, 'content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: blk.id, name: blk.name, input: {} } });
        sse(res, 'content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(blk.input || {}) } });
      }
      sse(res, 'content_block_stop', { type: 'content_block_stop', index: i });
    });
    sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: outTok } });
    sse(res, 'message_stop', { type: 'message_stop' });
    res.end();
    console.error(`[helm-proxy][res] streamed ${blocks.length} block(s), stop=${stop}`);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', error: { type: 'proxy_error', message: String(e.message || e) } }));
  }
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`[helm-proxy] port ${PORT} is already in use — set PROXY_PORT to a free port in .env (run \`helm doctor\`).`);
  else console.error('[helm-proxy] server error:', e.message);
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => console.log(`[helm-proxy] Anthropic -> OpenAI on http://localhost:${PORT}  ->  ${BASE} (${MODEL})`));
