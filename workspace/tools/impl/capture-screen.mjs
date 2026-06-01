// Cross-platform screen capture for Helm.
// macOS  -> /usr/sbin/screencapture (built in)
// Windows -> PowerShell + System.Drawing (built in; captures the whole virtual desktop)
// Linux  -> first of scrot / ImageMagick `import` / gnome-screenshot that is installed
//
// Why this exists: Helm's brain can run on either machine in the fleet (`use windows`). The old
// capture path shelled out to the macOS-only `screencapture`, so a "screenshot" taken while the
// brain was on Windows had no local tool and failed. This makes capture work on the machine the
// brain is actually running on.
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

// Default output file in the OS temp dir (works on every platform — /tmp doesn't exist on Windows).
export function defaultShotPath(prefix = 'helm-screen') {
  return path.join(os.tmpdir(), `${prefix}.png`);
}

// Roots an --out path is allowed to resolve under (prevents clobbering arbitrary files).
export function safeRoots(workspace) {
  const roots = [os.tmpdir(), workspace];
  if (process.platform === 'darwin') roots.push('/tmp', '/private/tmp');  // common Mac convention
  return roots;
}

// PowerShell script (run via -EncodedCommand so paths/quotes never need escaping) that grabs the
// full virtual screen — all monitors — and saves it as PNG.
function windowsPsScript(outPath) {
  const safePath = outPath.replace(/'/g, "''");   // single-quote escape for PowerShell literal
  return [
    "$ErrorActionPreference='Stop'",
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '$vs=[System.Windows.Forms.SystemInformation]::VirtualScreen',
    '$bmp=New-Object System.Drawing.Bitmap($vs.Width,$vs.Height)',
    '$g=[System.Drawing.Graphics]::FromImage($bmp)',
    '$g.CopyFromScreen($vs.Left,$vs.Top,0,0,$bmp.Size)',
    `$bmp.Save('${safePath}',[System.Drawing.Imaging.ImageFormat]::Png)`,
    '$g.Dispose();$bmp.Dispose()',
  ].join('\n');
}

// Returns { ok, error? } — captures the screen of the machine this process runs on.
export function captureScreen(out, { timeout = 15_000 } = {}) {
  if (process.platform === 'darwin') {
    const r = spawnSync('/usr/sbin/screencapture', ['-x', out], { encoding: 'utf8', timeout });
    return r.status === 0 ? { ok: true } : { ok: false, error: r.stderr || (r.error && r.error.message) || 'screencapture failed' };
  }
  if (process.platform === 'win32') {
    const b64 = Buffer.from(windowsPsScript(out), 'utf16le').toString('base64');
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8', timeout });
    return r.status === 0 ? { ok: true } : { ok: false, error: r.stderr || (r.error && r.error.message) || 'powershell capture failed' };
  }
  // Linux: try the common CLI screenshot tools in order; ENOENT means "not installed", keep trying.
  const candidates = [
    ['scrot', o => ['-o', o]],
    ['import', o => ['-window', 'root', o]],         // ImageMagick
    ['gnome-screenshot', o => ['-f', o]],
    ['spectacle', o => ['-b', '-n', '-o', o]],        // KDE
  ];
  let lastErr = '';
  for (const [cmd, mkArgs] of candidates) {
    const r = spawnSync(cmd, mkArgs(out), { encoding: 'utf8', timeout });
    if (r.status === 0) return { ok: true };
    if (r.error && r.error.code === 'ENOENT') { lastErr = `${cmd} not installed`; continue; }
    lastErr = r.stderr || (r.error && r.error.message) || `${cmd} failed`;
  }
  return { ok: false, error: `no usable screenshot tool (tried scrot, imagemagick import, gnome-screenshot, spectacle): ${lastErr}` };
}
