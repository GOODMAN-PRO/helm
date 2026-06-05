#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, unlinkSync } from 'node:fs';
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



const CS_VAULT = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredentialVault {
    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite(ref CREDENTIAL userCredential, uint flags);
    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string targetName, uint type, uint reservedFlag, out IntPtr credentialPtr);
    [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredDelete(string targetName, uint type, uint flags);
    [DllImport("advapi32.dll", EntryPoint = "CredFree", SetLastError = false)]
    public static extern void CredFree(IntPtr credentialPtr);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }
    public static bool WriteSecret(string target, string userName, string password) {
        byte[] blob = Encoding.Unicode.GetBytes(password);
        IntPtr blobPtr = Marshal.AllocCoTaskMem(blob.Length);
        Marshal.Copy(blob, 0, blobPtr, blob.Length);
        CREDENTIAL cred = new CREDENTIAL();
        cred.Type = 1;
        cred.TargetName = target;
        cred.UserName = userName;
        cred.CredentialBlobSize = (uint)blob.Length;
        cred.CredentialBlob = blobPtr;
        cred.Persist = 3;
        bool ok = CredWrite(ref cred, 0);
        Marshal.FreeCoTaskMem(blobPtr);
        return ok;
    }
    public static string ReadSecret(string target) {
        IntPtr credPtr;
        if (!CredRead(target, 1, 0, out credPtr)) return null;
        CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));
        byte[] blob = new byte[cred.CredentialBlobSize];
        Marshal.Copy(cred.CredentialBlob, blob, 0, blob.Length);
        CredFree(credPtr);
        return Encoding.Unicode.GetString(blob);
    }
    public static bool DeleteSecret(string target) {
        return CredDelete(target, 1, 0);
    }
}
'@
`;

function ps(script) {
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', '-'], {
    input: script,
    encoding: 'utf8'
  });
  if (r.status !== 0) throw new Error((r.stderr || 'powershell failed').trim());
  return r.stdout.trim();
}
const dpapiProtect   = hex => ps(`Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes('${hex}'),$null,'CurrentUser'))`);
const dpapiUnprotect = b64 => ps(`Add-Type -AssemblyName System.Security; [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String('${b64}'),$null,'CurrentUser'))`);


function keychainGet() {
  if (IS_MAC) {
    const r = spawnSync('/usr/bin/security', ['find-generic-password', '-a', KC_ACCOUNT, '-s', KC_SERVICE, '-w'], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  }
  if (IS_WIN) {
    if (existsSync(KEYFILE)) {
      const stored = readFileSync(KEYFILE, 'utf8').trim();
      if (stored) {
        try {
          const hex = dpapiUnprotect(stored);
          if (hex) {
            keychainSet(hex);
            try { unlinkSync(KEYFILE); } catch {}
            return hex;
          }
        } catch {}
      }
    }
    try {
      const script = `${CS_VAULT}\n[CredentialVault]::ReadSecret("helm-vault-key")`;
      const val = ps(script);
      return val || null;
    } catch {
      return null;
    }
  }
  if (!existsSync(KEYFILE)) return null;
  const stored = readFileSync(KEYFILE, 'utf8').trim();
  return stored || null;
}
function keychainSet(hex) {
  if (IS_MAC) {

    const r = spawnSync('/usr/bin/security', ['add-generic-password', '-a', KC_ACCOUNT, '-s', KC_SERVICE, '-w', hex, '-U'], { encoding: 'utf8' });
    if (r.status !== 0) die('keychain write failed: ' + (r.stderr || '').trim());
    return;
  }
  if (IS_WIN) {
    try {
      const script = `${CS_VAULT}\n[CredentialVault]::WriteSecret("helm-vault-key", "helm", "${hex}")`;
      ps(script);
      return;
    } catch (e) {
      die('Windows Credential Manager key write failed: ' + e.message);
    }
  }
  mkdirSync(path.dirname(KEYFILE), { recursive: true });
  writeFileSync(KEYFILE, hex);
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
    if (keychainGet()) {
      console.log(IS_MAC ? 'vault key already present in the macOS Keychain'
        : IS_WIN ? 'vault key already present in Windows Credential Manager'
        : 'vault key already present (0600 file)');
      break;
    }
    keychainSet(crypto.randomBytes(32).toString('hex'));
    console.log(IS_MAC ? 'vault key created and stored in the macOS Keychain'
      : IS_WIN ? 'vault key created and stored in Windows Credential Manager'
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
