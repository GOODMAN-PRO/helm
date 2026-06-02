// hub.mjs — a tiny relay/registry so Helms on different machines (and different owners) can find and
// message each other over the internet. It is the "web" the devices ride on. The hub is UNTRUSTED for
// message CONTENT: every message is end-to-end signed by the sender, so a malicious hub can drop or
// reorder but cannot forge a message from your friend. The only thing the hub enforces is access
// control — you must prove (via a signature) that you hold a handle's key before reading its inbox.
//
// Run it (anyone can host one): node workspace/network/hub.mjs [--port 8910]
// State: <netDir>/hub-data.json  { handles:{h:{id,publicKey}}, inbox:{h:[msg]} }   (gitignored)

import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { verify } from './identity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.HELM_HUB_DIR || __dirname;
const STORE = path.join(DIR, 'hub-data.json');
const PORT = parseInt(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : (process.env.HELM_HUB_PORT || '8910'), 10);

const load = () => { try { return JSON.parse(readFileSync(STORE, 'utf8')); } catch { return { handles: {}, inbox: {} }; } };
const save = db => { mkdirSync(DIR, { recursive: true }); writeFileSync(STORE, JSON.stringify(db, null, 2)); };

function body(req) {
  return new Promise(resolve => { let b = ''; req.on('data', c => { b += c; if (b.length > 256_000) req.destroy(); }); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } }); });
}
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

export function startHub(port = PORT) {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const db = load();
    try {
      if (req.method === 'GET' && u.pathname === '/') return json(res, 200, { ok: true, service: 'helm-hub', handles: Object.keys(db.handles).length });

      // Register (or refresh) a handle -> public key. First-come owns a handle; the same key can re-register.
      if (req.method === 'POST' && u.pathname === '/register') {
        const { handle, id, publicKey } = await body(req);
        if (!handle || !publicKey) return json(res, 400, { ok: false, error: 'handle + publicKey required' });
        const existing = db.handles[handle];
        if (existing && existing.publicKey !== publicKey) return json(res, 409, { ok: false, error: 'handle taken by a different key' });
        db.handles[handle] = { id, publicKey }; save(db);
        return json(res, 200, { ok: true, handle });
      }

      // Look up a handle's public key (so a friend can verify your signatures / address you).
      if (req.method === 'GET' && u.pathname === '/lookup') {
        const h = u.searchParams.get('handle');
        const rec = db.handles[h];
        return rec ? json(res, 200, { ok: true, handle: h, ...rec }) : json(res, 404, { ok: false, error: 'unknown handle' });
      }

      // Send: store-and-forward into the recipient's inbox. Hub does NOT trust/verify content — the
      // recipient verifies the sender's signature end-to-end.
      if (req.method === 'POST' && u.pathname === '/send') {
        const msg = await body(req);
        if (!msg.to || !msg.from || !msg.sig) return json(res, 400, { ok: false, error: 'to, from, sig required' });
        (db.inbox[msg.to] ||= []).push({ ...msg, hubTs: Date.now() });
        if (db.inbox[msg.to].length > 500) db.inbox[msg.to] = db.inbox[msg.to].slice(-500);
        save(db);
        return json(res, 200, { ok: true });
      }

      // Inbox read — gated: you must SIGN "inbox:<handle>:<ts>" with the key registered for that handle.
      if (req.method === 'GET' && u.pathname === '/inbox') {
        const h = u.searchParams.get('handle'); const ts = u.searchParams.get('ts'); const sig = req.headers['x-sig'];
        const since = parseInt(u.searchParams.get('since') || '0', 10);
        const rec = db.handles[h];
        if (!rec) return json(res, 404, { ok: false, error: 'unknown handle' });
        if (!sig || !ts || Math.abs(Date.now() - parseInt(ts, 10)) > 120_000) return json(res, 401, { ok: false, error: 'stale/missing signature' });
        if (!verify(`inbox:${h}:${ts}`, sig, rec.publicKey)) return json(res, 401, { ok: false, error: 'bad signature' });
        const msgs = (db.inbox[h] || []).filter(m => m.hubTs > since);
        return json(res, 200, { ok: true, messages: msgs, now: Date.now() });
      }

      json(res, 404, { ok: false, error: 'not found' });
    } catch (e) { json(res, 500, { ok: false, error: String(e.message || e) }); }
  });
  server.listen(port, () => console.log(`helm-hub listening on :${port}  (store: ${STORE})`));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startHub();
