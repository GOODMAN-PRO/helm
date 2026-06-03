#!/usr/bin/env node
// Launch an app, open a file/folder, or open a URL. Windows: Start-Process. macOS: open.
//   app.open --target notepad            (launch an app by name)
//   app.open --target "C:\path\file.txt" (open a file with its default app)
//   app.open --target https://x.com      (open a URL in the default browser)
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
const target = get('target') || get('app') || get('path') || get('url') || args.find((a) => !a.startsWith('--'));
const extra = get('args');
if (!target) { console.error('app.open needs --target (app name, file/folder path, or URL)'); process.exit(1); }

if (process.platform === 'win32') {
  const esc = (s) => String(s).replace(/'/g, "''");
  const ps = `Start-Process -FilePath '${esc(target)}'` + (extra ? ` -ArgumentList '${esc(extra)}'` : '');
  const b64 = Buffer.from(ps, 'utf16le').toString('base64');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8', timeout: 15000 });
  if (r.status !== 0) { console.error((r.stderr || 'open failed').trim().slice(0, 200)); process.exit(1); }
  console.log(JSON.stringify({ ok: true, opened: target }));
} else if (process.platform === 'darwin') {
  const r = spawnSync('open', extra ? ['-a', target, extra] : [target], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr || 'open failed'); process.exit(1); }
  console.log(JSON.stringify({ ok: true, opened: target }));
} else {
  const r = spawnSync('xdg-open', [target], { encoding: 'utf8' });
  if (r.status !== 0) { console.error('app.open not supported on ' + process.platform); process.exit(1); }
  console.log(JSON.stringify({ ok: true, opened: target }));
}
