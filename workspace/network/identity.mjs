// identity.mjs — every Helm has a cryptographic identity: an ed25519 keypair + a friendly handle.
// The keypair IS the identity (the handle is just a human alias). Messages between Helms are signed with
// it, so a friend can PROVE a message really came from you — even though the relay hub is untrusted.
//
// State: <netDir>/identity.json  (contains the PRIVATE key — gitignored, never shared).
// netDir defaults to workspace/network, overridable via HELM_NET_DIR (so tests can isolate identities).

import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const NET_DIR = process.env.HELM_NET_DIR || __dirname;
const FILE = path.join(NET_DIR, 'identity.json');

// Short, stable fingerprint of a public key (PEM) — the globally-unique ID, even if handles collide.
export function fingerprint(publicKeyPem) {
  return createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
}

// Load this Helm's identity, creating one on first use.
export function getIdentity() {
  if (!existsSync(FILE)) {
    mkdirSync(NET_DIR, { recursive: true });
    const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const id = fingerprint(publicKey);
    const obj = { handle: `helm-${id.slice(0, 6)}`, id, publicKey, privateKey, created: new Date().toISOString() };
    writeFileSync(FILE, JSON.stringify(obj, null, 2));
  }
  return JSON.parse(readFileSync(FILE, 'utf8'));
}

// Public view — safe to share / publish to a hub (NO private key).
export function publicIdentity() {
  const me = getIdentity();
  return { handle: me.handle, id: me.id, publicKey: me.publicKey };
}

export function setHandle(handle) {
  const me = getIdentity();
  me.handle = String(handle).trim().replace(/^@/, '').slice(0, 32);
  writeFileSync(FILE, JSON.stringify(me, null, 2));
  return me.handle;
}

// Sign arbitrary data with this Helm's private key → base64 signature.
export function sign(data) {
  const me = getIdentity();
  return cryptoSign(null, Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)), me.privateKey).toString('base64');
}

// Verify a signature against a given public key (PEM). Returns true/false, never throws.
export function verify(data, sigB64, publicKeyPem) {
  try {
    return cryptoVerify(null, Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)), publicKeyPem, Buffer.from(sigB64, 'base64'));
  } catch { return false; }
}
