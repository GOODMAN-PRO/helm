#!/usr/bin/env node
// Read or write the system clipboard (text). Useful for pasting long text reliably (set, then
// gui.hotkey ctrl+v) and for reading what the owner copied.
//   clipboard.mjs get            -> { text }
//   clipboard.mjs set --text ".."-> writes text to the clipboard
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const verb = args[0];
const get = (k) => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
const runPs = (script) => {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', b64], { encoding: 'utf8', timeout: 15000 });
};

if (process.platform === 'win32') {
  if (verb === 'get') {
    const r = runPs('Get-Clipboard -Raw');
    if (r.status !== 0) { console.error((r.stderr || 'clipboard get failed').trim().slice(0, 200)); process.exit(1); }
    console.log(JSON.stringify({ ok: true, text: (r.stdout || '').replace(/\r?\n$/, '') }));
  } else if (verb === 'set') {
    const text = get('text');
    if (text == null) { console.error('set needs --text'); process.exit(1); }
    const r = runPs(`Set-Clipboard -Value '${text.replace(/'/g, "''")}'`);
    if (r.status !== 0) { console.error((r.stderr || 'clipboard set failed').trim().slice(0, 200)); process.exit(1); }
    console.log(JSON.stringify({ ok: true, set: true, bytes: text.length }));
  } else { console.error('verbs: get | set --text "..."'); process.exit(1); }
} else if (process.platform === 'darwin') {
  if (verb === 'get') {
    const r = spawnSync('pbpaste', [], { encoding: 'utf8' });
    console.log(JSON.stringify({ ok: true, text: r.stdout || '' }));
  } else if (verb === 'set') {
    const text = get('text'); if (text == null) { console.error('set needs --text'); process.exit(1); }
    const r = spawnSync('pbcopy', [], { input: text, encoding: 'utf8' });
    if (r.status !== 0) { console.error('clipboard set failed'); process.exit(1); }
    console.log(JSON.stringify({ ok: true, set: true, bytes: text.length }));
  } else { console.error('verbs: get | set --text "..."'); process.exit(1); }
} else { console.error('clipboard not supported on ' + process.platform); process.exit(1); }
