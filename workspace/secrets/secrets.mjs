#!/usr/bin/env node
// Helm secrets vault — share sensitive info with Helm WITHOUT putting it in chat or git.
//
// Secrets are encrypted at rest (AES-256-GCM). The master key lives in the macOS Keychain, or on
// Windows a DPAPI-encrypted key file (Linux: a 0600 key file) — never in the repo. The owner adds
// secrets locally via stdin (never as a CLI arg, so they
// don't leak into shell history or the process list). Helm reads them with `get` when it needs
// a credential — the plaintext never touches Discord/iMessage logs or git.
//
// Usage:
//   node secrets.mjs init                 # one-time: create+store the master key in Keychain
//   node secrets.mjs set <NAME>           # reads the value from STDIN, encrypts, stores
//   echo -n "sk-..." | node secrets.mjs set OPENAI_KEY
//   node secrets.mjs get <NAME>           # prints the plaintext (use sparingly)
//   node secrets.mjs list                 # names only, never values
//   node secrets.mjs rm <NAME>
//
// Key resolution: env HELM_VAULT_KEY (64 hex chars) overrides Keychain (used by tests).
// Vault file: env HELM_VAULT_FILE overrides the default workspace/secrets/vault.json.

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT = process.env.HELM_VAULT_FILE || path.join(__dirname, 'vault.json');
const KC_ACCOUNT = 'helm', KC_SERVICE = 'helm-vault-key';
const KEYFILE = process.env.HELM_VAULT_KEYFILE || path.join(__dirname, 'master.key');
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

const die = m => { console.error(m); process.exit(1); };
const out = o => console.log(JSON.stringify(o, null, 2));

// Windows DPAPI: encrypt/decrypt bound to the current Windows user — the key never sits in plaintext
// at rest (the CurrentUser scope ties it to this account, like the Keychain does on macOS).
function ps(script) {
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || 'powershell failed').trim());
  return r.stdout.trim();
}
const dpapiProtect   = hex => ps(`Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes('${hex}'),$null,'CurrentUser'))`);
const dpapiUnprotect = b64 => ps(`Add-Type -AssemblyName System.Security; [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String('${b64}'),$null,'CurrentUser'))`);

// Master-key store, per platform. macOS -> Keychain. Windows -> DPAPI-wrapped key file. Linux -> 0600 file.
function keychainGet() {
  if (IS_MAC) {
    const r = spawnSync('/usr/bin/security', ['find-generic-password', '-a', KC_ACCOUNT, '-s', KC_SERVICE, '-w'], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  }
  if (!existsSync(KEYFILE)) return null;
  const stored = readFileSync(KEYFILE, 'utf8').trim();
  if (!stored) return null;
  try { return IS_WIN ? dpapiUnprotect(stored) : stored; } catch { return null; }
}
function keychainSet(hex) {
  if (IS_MAC) {
    // -U updates if it already exists
    const r = spawnSync('/usr/bin/security', ['add-generic-password', '-a', KC_ACCOUNT, '-s', KC_SERVICE, '-w', hex, '-U'], { encoding: 'utf8' });
    if (r.status !== 0) die('keychain write failed: ' + (r.stderr || '').trim());
    return;
  }
  mkdirSync(path.dirname(KEYFILE), { recursive: true });
  let toStore = hex;
  if (IS_WIN) { try { toStore = dpapiProtect(hex); } catch (e) { die('DPAPI key encryption failed: ' + e.message); } }
  writeFileSync(KEYFILE, toStore);
  try { chmodSync(KEYFILE, 0o600); } catch {}
}
function getKey() {
  const env = process.env.HELM_VAULT_KEY;
  if (env) { if (!/^[0-9a-fA-F]{64}$/.test(env)) die('HELM_VAULT_KEY must be 64 hex chars'); return Buffer.from(env, 'hex'); }
  const kc = keychainGet();
  if (!kc) die('no vault key — run: node workspace/secrets/secrets.mjs init  (or set HELM_VAULT_KEY=<64 hex> in the environment)');
  return Buffer.from(kc, 'hex');
}
function loadVault() { try { return JSON.parse(readFileSync(VAULT, 'utf8')); } catch { return {}; } }
function saveVault(v) {
  mkdirSync(path.dirname(VAULT), { recursive: true });
  writeFileSync(VAULT, JSON.stringify(v, null, 2));
  try { chmodSync(VAULT, 0o600); } catch {}
}
function encrypt(key, plaintext) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return { iv: iv.toString('hex'), tag: c.getAuthTag().toString('hex'), ct: ct.toString('hex') };
}
function decrypt(key, rec) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(rec.iv, 'hex'));
  d.setAuthTag(Buffer.from(rec.tag, 'hex'));
  return Buffer.concat([d.update(Buffer.from(rec.ct, 'hex')), d.final()]).toString('utf8');
}
function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

const [, , verb, name] = process.argv;
switch (verb) {
  case 'init': {
    if (process.env.HELM_VAULT_KEY) { console.log('using HELM_VAULT_KEY from env; nothing to do'); break; }
    if (keychainGet()) { console.log('vault key already present in Keychain'); break; }
    keychainSet(crypto.randomBytes(32).toString('hex'));
    console.log(IS_MAC ? 'vault key created and stored in the macOS Keychain'
      : IS_WIN ? `vault key created and stored DPAPI-encrypted at ${KEYFILE}`
      : `vault key created and stored (0600 file) at ${KEYFILE}`);
    break;
  }
  case 'set': {
    if (!name) die('usage: set <NAME>  (value is read from stdin)');
    const value = readStdin().replace(/\r?\n$/, '');
    if (!value) die('no value on stdin. e.g.  echo -n "secret" | secrets.mjs set ' + name);
    const v = loadVault(); v[name] = encrypt(getKey(), value); saveVault(v);
    out({ action: 'stored', name, bytes: value.length });
    break;
  }
  case 'get': {
    if (!name) die('usage: get <NAME>');
    const v = loadVault();
    if (!v[name]) die('no such secret: ' + name);
    process.stdout.write(decrypt(getKey(), v[name]));
    break;
  }
  case 'list': out(Object.keys(loadVault()).sort()); break;
  case 'rm': {
    if (!name) die('usage: rm <NAME>');
    const v = loadVault(); const had = !!v[name]; delete v[name]; saveVault(v);
    out({ removed: had, name });
    break;
  }
  default: die('verbs: init | set <NAME> | get <NAME> | list | rm <NAME>');
}
