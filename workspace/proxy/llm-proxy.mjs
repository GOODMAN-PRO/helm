#!/usr/bin/env node
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
    const content = []; const toolCalls = []; const toolResults = [];
    for (const b of m.content || []) {
      if (b.type === 'text') {
        content.push({ type: 'text', text: b.text });
      } else if (b.type === 'image') {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` }
        });
      } else if (b.type === 'tool_use') {
        toolCalls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) } });
      } else if (b.type === 'tool_result') {
        toolResults.push({ tool_call_id: b.tool_use_id, content: blocksText(b.content) || '' });
      }
    }
    const hasImage = content.some(b => b.type === 'image_url');
    const textVal = content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const finalContent = hasImage ? content : (textVal || null);

    if (m.role === 'assistant') {
      const msg = { role: 'assistant', content: finalContent };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      messages.push(msg);
    } else {
      if (finalContent) messages.push({ role: m.role, content: finalContent });
      for (const tr of toolResults) messages.push({ role: 'tool', tool_call_id: tr.tool_call_id, content: tr.content });
    }
  }
  const req = { model: MODEL, messages, stream: a.stream ?? false, max_tokens: a.max_tokens || 8192 };
  if (req.stream) {
    req.stream_options = { include_usage: true };
  }
  if (typeof a.temperature === 'number') req.temperature = a.temperature;



  const mode = (process.env.PROXY_TOOLS || 'core').toLowerCase();
  if (mode !== 'none' && mode !== '0' && Array.isArray(a.tools) && a.tools.length) {
    const CORE = new Set(['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'LS', 'TodoWrite']);
    const picked = (mode === 'all' || mode === '1') ? a.tools : a.tools.filter(t => CORE.has(t.name));
    if (picked.length) req.tools = picked.map(t => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} } } }));
  }
  return req;
}


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

  if (req.method === 'GET' || req.method === 'HEAD') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
  if (req.method !== 'POST') { res.writeHead(404).end('not found'); return; }
  const raw = await readBody(req);

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
        ? `Provider rejected the API key (HTTP ${up.status}). OPENAI_API_KEY for ${BASE} is wrong/expired — run \`helm setup\` and paste a valid key.`
        : up.status === 404
        ? `Provider 404 — model "${MODEL}" may not exist at ${BASE}. Run \`helm doctor\` to list valid models.`
        : `${up.status}: ${t.slice(0, 600)}`;


      const code = [400, 401, 403, 404, 429].includes(up.status) ? up.status : 502;
      const etype = code === 401 ? 'authentication_error' : code === 403 ? 'permission_error' : code === 400 ? 'invalid_request_error' : code === 404 ? 'not_found_error' : code === 429 ? 'rate_limit_error' : 'api_error';
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: etype, message: hint } }));
      return;
    }
    const id = 'msg_' + Math.random().toString(36).slice(2);
    if (body.stream === false) {
      const oai = await up.json();
      const { blocks, stop, usage } = toBlocks(oai);
      const inTok = usage.prompt_tokens || 0, outTok = usage.completion_tokens || 0;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id, type: 'message', role: 'assistant', model: MODEL, content: blocks, stop_reason: stop, stop_sequence: null, usage: { input_tokens: inTok, output_tokens: outTok } }));
      return;
    }


    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive'
    });

    const estInTok = Math.ceil((raw || '').length / 4);
    sse(res, 'message_start', {
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        model: MODEL,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: estInTok, output_tokens: 0 }
      }
    });

    let textActive = false;
    let textStopped = false;
    const textBlockIdx = 0;
    let nextBlockIdx = 1;
    const toolCalls = {};
    let finishReason = null;
    let finalUsage = null;

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    for await (const chunk of up.body) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      let lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6);
          try {
            const dataObj = JSON.parse(dataStr);
            if (dataObj.usage) {
              finalUsage = dataObj.usage;
            }
            const choice = dataObj.choices && dataObj.choices[0];
            if (choice) {
              if (choice.finish_reason) {
                finishReason = choice.finish_reason;
              }
              const delta = choice.delta;
              if (delta) {
                if (delta.content) {
                  if (!textActive) {
                    textActive = true;
                    sse(res, 'content_block_start', {
                      type: 'content_block_start',
                      index: textBlockIdx,
                      content_block: { type: 'text', text: '' }
                    });
                  }
                  sse(res, 'content_block_delta', {
                    type: 'content_block_delta',
                    index: textBlockIdx,
                    delta: { type: 'text_delta', text: delta.content }
                  });
                }
                if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index;
                    if (idx === undefined) continue;
                    if (!toolCalls[idx]) {
                      toolCalls[idx] = {
                        id: tc.id || '',
                        name: tc.function?.name || '',
                        argsBuffer: tc.function?.arguments || '',
                        started: false,
                        blockIdx: nextBlockIdx++
                      };
                    } else {
                      if (tc.id) toolCalls[idx].id = tc.id;
                      if (tc.function?.name) toolCalls[idx].name = tc.function.name;
                      if (tc.function?.arguments) toolCalls[idx].argsBuffer += tc.function.arguments;
                    }

                    if (toolCalls[idx].name && !toolCalls[idx].started) {
                      if (textActive && !textStopped) {
                        sse(res, 'content_block_stop', { type: 'content_block_stop', index: textBlockIdx });
                        textStopped = true;
                      }
                      if (!toolCalls[idx].id) {
                        toolCalls[idx].id = 'toolu_' + Math.random().toString(36).slice(2);
                      }
                      sse(res, 'content_block_start', {
                        type: 'content_block_start',
                        index: toolCalls[idx].blockIdx,
                        content_block: {
                          type: 'tool_use',
                          id: toolCalls[idx].id,
                          name: toolCalls[idx].name,
                          input: {}
                        }
                      });
                      toolCalls[idx].started = true;
                      if (toolCalls[idx].argsBuffer) {
                        sse(res, 'content_block_delta', {
                          type: 'content_block_delta',
                          index: toolCalls[idx].blockIdx,
                          delta: {
                            type: 'input_json_delta',
                            partial_json: toolCalls[idx].argsBuffer
                          }
                        });
                        toolCalls[idx].argsBuffer = '';
                      }
                    } else if (toolCalls[idx].started && tc.function?.arguments) {
                      sse(res, 'content_block_delta', {
                        type: 'content_block_delta',
                        index: toolCalls[idx].blockIdx,
                        delta: {
                          type: 'input_json_delta',
                          partial_json: tc.function.arguments
                        }
                      });
                    }
                  }
                }
              }
            }
          } catch (e) {

          }
        }
      }
    }

    if (buffer) {
      const trimmed = buffer.trim();
      if (trimmed && trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
        try {
          const dataObj = JSON.parse(trimmed.slice(6));
          if (dataObj.usage) finalUsage = dataObj.usage;
        } catch {}
      }
    }

    if (textActive && !textStopped) {
      sse(res, 'content_block_stop', { type: 'content_block_stop', index: textBlockIdx });
      textStopped = true;
    }
    for (const idx of Object.keys(toolCalls)) {
      const tc = toolCalls[idx];
      if (tc.started) {
        sse(res, 'content_block_stop', { type: 'content_block_stop', index: tc.blockIdx });
      }
    }

    const stop = (Object.keys(toolCalls).length > 0) ? 'tool_use' : finishReason === 'length' ? 'max_tokens' : 'end_turn';
    const inTok = (finalUsage && finalUsage.prompt_tokens) || estInTok;
    const outTok = (finalUsage && finalUsage.completion_tokens) || 0;

    sse(res, 'message_delta', {
      type: 'message_delta',
      delta: { stop_reason: stop, stop_sequence: null },
      usage: { output_tokens: outTok }
    });
    sse(res, 'message_stop', { type: 'message_stop' });
    res.end();
    console.error(`[helm-proxy][res] streamed end-to-end, stop=${stop}`);
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
