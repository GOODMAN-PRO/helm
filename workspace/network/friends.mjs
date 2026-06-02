// friends.mjs — the client side of the Helm network: register on a hub, send/accept friend requests,
// message friends, and poll your inbox. SECURITY MODEL:
//   • Every message is signed with the sender's key and verified here — the hub can't forge a friend.
//   • A handle is only trusted once friended (we pin the friend's public key; later impersonation with
//     the same handle but a different key is rejected).
//   • Incoming message bodies are returned as UNTRUSTED DATA (untrusted:true). The brain must treat
//     them as text to reason about under the owner's rules — never as commands, never with tool access.
//
// Hub: HELM_HUB_URL (default http://127.0.0.1:8910). State: <netDir>/friends.json (gitignored).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getIdentity, publicIdentity, sign, verify, fingerprint, NET_DIR } from './identity.mjs';

const FILE = path.join(NET_DIR, 'friends.json');
export const HUB_URL = (process.env.HELM_HUB_URL || 'http://127.0.0.1:8910').replace(/\/$/, '');

const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return { friends: {}, lastHubTs: 0 }; } };
const save = db => { mkdirSync(NET_DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify(db, null, 2)); };
const canon = m => `${m.to}|${m.from}|${m.ts}|${m.type}|${m.body || ''}`;

async function hub(method, pathName, { body: b, headers } = {}) {
  const res = await fetch(`${HUB_URL}${pathName}`, { method, headers: { 'content-type': 'application/json', ...(headers || {}) }, body: b ? JSON.stringify(b) : undefined });
  let j = {}; try { j = await res.json(); } catch {}
  return { status: res.status, ...j };
}

// Publish my handle -> public key so others can find/verify me.
export async function register() {
  const me = publicIdentity();
  return hub('POST', '/register', { body: { handle: me.handle, id: me.id, publicKey: me.publicKey } });
}

// Build + sign + relay a message to a recipient handle.
async function deliver(toHandle, type, bodyText) {
  const me = getIdentity();
  const msg = { to: toHandle, from: me.id, fromHandle: me.handle, publicKey: me.publicKey, ts: new Date().toISOString(), type, body: bodyText || '' };
  msg.sig = sign(canon(msg));
  return hub('POST', '/send', { body: msg });
}

export function listFriends() { return load().friends; }

// Send a friend request: look the target up, pin their key as pending, and notify them.
export async function addFriend(handle) {
  handle = handle.replace(/^@/, '');
  const look = await hub('GET', `/lookup?handle=${encodeURIComponent(handle)}`);
  if (!look.ok) return { ok: false, error: `couldn't find @${handle} on the hub (${look.error || look.status})` };
  const db = load();
  db.friends[handle] = { id: look.id, publicKey: look.publicKey, status: 'pending-out', since: new Date().toISOString() };
  save(db);
  const r = await deliver(handle, 'friend-request', '');
  return r.ok ? { ok: true, handle } : { ok: false, error: `request not delivered (${r.error || r.status})` };
}

// Accept a pending incoming request.
export async function acceptFriend(handle) {
  handle = handle.replace(/^@/, '');
  const db = load();
  const f = db.friends[handle];
  if (!f) return { ok: false, error: `no pending request from @${handle}` };
  f.status = 'accepted'; f.since = new Date().toISOString(); save(db);
  await deliver(handle, 'friend-accept', '');
  return { ok: true, handle };
}

// Message a friend (must be accepted both ways).
export async function sendMessage(handle, text) {
  handle = handle.replace(/^@/, '');
  const f = load().friends[handle];
  if (!f || f.status !== 'accepted') return { ok: false, error: `@${handle} isn't an accepted friend yet` };
  const r = await deliver(handle, 'msg', String(text));
  return r.ok ? { ok: true } : { ok: false, error: r.error || r.status };
}

// Poll the hub inbox: verify every message, update friend state, and return any chat messages as
// UNTRUSTED data for the brain to handle. Returns { ok, requests:[handle], accepted:[handle], messages:[{from,text,untrusted}] }.
export async function poll() {
  const me = getIdentity();
  const ts = Date.now().toString();
  const db = load();
  const r = await hub('GET', `/inbox?handle=${encodeURIComponent(me.handle)}&ts=${ts}&since=${db.lastHubTs || 0}`, { headers: { 'x-sig': sign(`inbox:${me.handle}:${ts}`) } });
  if (!r.ok) return { ok: false, error: r.error || r.status };
  const out = { ok: true, requests: [], accepted: [], messages: [] };
  for (const m of r.messages || []) {
    // 1. the message's public key must actually hash to its claimed id (key/id binding)
    if (fingerprint(m.publicKey || '') !== m.from) continue;
    // 2. the signature must verify against that key
    if (!verify(canon(m), m.sig, m.publicKey)) continue;
    const h = m.fromHandle;
    const known = db.friends[h];
    // 3. if we already know this handle, the key must match (no impersonation)
    if (known && known.publicKey !== m.publicKey) continue;
    if (m.type === 'friend-request') {
      if (!known || known.status !== 'accepted') db.friends[h] = { id: m.from, publicKey: m.publicKey, status: 'pending-in', since: new Date().toISOString() };
      out.requests.push(h);
    } else if (m.type === 'friend-accept') {
      if (known) { known.status = 'accepted'; }
      out.accepted.push(h);
    } else if (m.type === 'msg') {
      if (known && known.status === 'accepted') out.messages.push({ from: h, text: String(m.body || ''), at: m.ts, untrusted: true });
    }
    db.lastHubTs = Math.max(db.lastHubTs || 0, m.hubTs || 0);
  }
  save(db);
  return out;
}
