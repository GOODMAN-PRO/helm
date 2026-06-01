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
import { existsSync, statSync, unlinkSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleepMs = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} };

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

// Direct Windows capture (System.Drawing). Works in an interactive desktop session.
function winDirect(out, timeout) {
  const b64 = Buffer.from(windowsPsScript(out), 'utf16le').toString('base64');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8', timeout });
  if (r.status === 0) return { ok: true };
  const raw = (r.stderr || '') + (r.stdout || '') + ((r.error && r.error.message) || '');
  const interactive = /handle is invalid|CopyFromScreen|Win32Exception/i.test(raw);
  return { ok: false, interactive, error: raw.trim().slice(0, 300) || 'powershell capture failed' };
}

// Fallback for a non-interactive session (SSH / Session 0): CopyFromScreen can't reach the desktop
// directly, but a scheduled task launched with `schtasks /Run` executes in the user's INTERACTIVE
// session and CAN capture. We register a one-shot "HelmShot" task that runs this same tool in
// --direct mode to a fixed file, trigger it, then read the file back.
function winViaTask(out, timeout) {
  const node = process.execPath;
  const script = path.join(__dirname, 'screencap.mjs');
  const shot = path.join(os.tmpdir(), 'helm-shot-task.png');   // same user → same tmpdir as the task
  const tr = `"${node}" "${script}" --out "${shot}" --direct`;
  // (Re)register idempotently so it always points at our script + shot path. /IT = run in the
  // logged-on user's session; /SC ONCE with a past/placeholder time means it only runs on /Run.
  spawnSync('schtasks', ['/Create', '/TN', 'HelmShot', '/TR', tr, '/SC', 'ONCE', '/ST', '00:00', '/RL', 'LIMITED', '/IT', '/F'], { encoding: 'utf8', timeout: 15_000 });
  try { unlinkSync(shot); } catch {}
  const run = spawnSync('schtasks', ['/Run', '/TN', 'HelmShot'], { encoding: 'utf8', timeout: 15_000 });
  if (run.status !== 0) return { ok: false, error: 'could not run HelmShot scheduled task: ' + (run.stderr || '').trim().slice(0, 160) };
  const deadline = Date.now() + Math.max(timeout, 12_000);
  while (Date.now() < deadline) {
    try { if (statSync(shot).size > 100) { copyFileSync(shot, out); return { ok: true }; } } catch {}
    sleepMs(500);
  }
  return { ok: false, error: 'Windows screenshot timed out — the scheduled task ran but produced no image. Make sure you are logged in at the Windows machine with the screen unlocked.' };
}

// Returns { ok, error? } — captures the screen of the machine this process runs on.
// `direct: true` forces the raw capture only (used by the HelmShot task itself to avoid recursion).
export function captureScreen(out, { timeout = 15_000, direct = false } = {}) {
  if (process.platform === 'darwin') {
    const r = spawnSync('/usr/sbin/screencapture', ['-x', out], { encoding: 'utf8', timeout });
    return r.status === 0 ? { ok: true } : { ok: false, error: r.stderr || (r.error && r.error.message) || 'screencapture failed' };
  }
  if (process.platform === 'win32') {
    const r = winDirect(out, timeout);
    if (r.ok || direct) return r;
    // Non-interactive session → capture via a scheduled task running in the interactive desktop.
    if (r.interactive) return winViaTask(out, timeout);
    return { ok: false, error: r.error };
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
