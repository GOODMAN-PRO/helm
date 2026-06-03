#!/usr/bin/env node
// List visible windows or focus one by title substring.
//   window.mjs list                     -> { windows: [{pid, app, title}] }
//   window.mjs focus --title "Chrome"   -> brings the first matching window to the front
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const verb = args[0];
const get = (k) => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
const runPs = (script) => {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8', timeout: 15000 });
};

if (process.platform !== 'win32') { console.error('window.* is Windows-only here'); process.exit(1); }

if (verb === 'list') {
  const r = runPs("Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json -Compress");
  if (r.status !== 0) { console.error((r.stderr || 'list failed').trim().slice(0, 200)); process.exit(1); }
  let arr = [];
  try { arr = JSON.parse(r.stdout || '[]'); if (!Array.isArray(arr)) arr = [arr]; } catch {}
  console.log(JSON.stringify({ ok: true, windows: arr.map((w) => ({ pid: w.Id, app: w.ProcessName, title: w.MainWindowTitle })) }));
} else if (verb === 'focus') {
  const title = get('title') || args.slice(1).find((a) => !a.startsWith('--'));
  if (!title) { console.error('focus needs --title <substring>'); process.exit(1); }
  const esc = title.replace(/'/g, "''");
  // Find a process whose window title contains the substring, then activate it via its PID.
  const script = [
    `$p = Get-Process | Where-Object { $_.MainWindowTitle -like '*${esc}*' } | Select-Object -First 1`,
    "if (-not $p) { Write-Output 'NOMATCH'; exit }",
    '$ws = New-Object -ComObject WScript.Shell',
    '$ok = $ws.AppActivate($p.Id)',
    "Write-Output (\"OK:\" + $p.MainWindowTitle)",
  ].join('\n');
  const r = runPs(script);
  const out = (r.stdout || '').trim();
  if (out.startsWith('OK:')) console.log(JSON.stringify({ ok: true, focused: out.slice(3) }));
  else console.log(JSON.stringify({ ok: false, error: 'no window matched "' + title + '" — run window.mjs list for exact titles' }));
} else {
  console.error('verbs: list | focus --title <substring>'); process.exit(1);
}
