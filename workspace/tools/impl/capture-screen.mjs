import { spawnSync } from 'node:child_process';
import { existsSync, statSync, unlinkSync, copyFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleepMs = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} };


export function defaultShotPath(prefix = 'helm-screen') {
  return path.join(os.tmpdir(), `${prefix}.png`);
}


export function safeRoots(workspace) {
  const roots = [os.tmpdir(), workspace];
  if (process.platform === 'darwin') roots.push('/tmp', '/private/tmp');
  return roots;
}





function windowsPsScript(outPath, hideTerminals = true) {
  const safePath = outPath.replace(/'/g, "''");   // single-quote escape for PowerShell literal
  const head = [
    "$ErrorActionPreference='Stop'",
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    'Add-Type @"',
    'using System;using System.Runtime.InteropServices;',
    'public class WHelm{ [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int n); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h); }',
    '"@',
  ];
  const hideStart = hideTerminals ? [
    // Minimize visible terminal/console windows so they don\'t block the screenshot.
    // Common hosts a Claude Code / terminal session runs in (any of these blocking a monitor).
    "$names=@('WindowsTerminal','OpenConsole','cmd','conhost','powershell','pwsh','mintty','bash','ConEmu64','ConEmu','Cmder','Hyper','alacritty','wezterm-gui','Tabby','Code','Cursor','claude')",
    '$minimized=@()',
    'foreach($p in Get-Process -Name $names -ErrorAction SilentlyContinue){ $h=$p.MainWindowHandle; if($h -ne [IntPtr]::Zero -and [WHelm]::IsWindowVisible($h)){ [WHelm]::ShowWindowAsync($h,6) | Out-Null; $minimized+=$h } }',
    'if($minimized.Count -gt 0){ Start-Sleep -Milliseconds 350 }',
  ] : [];
  const capture = [
    '$vs=[System.Windows.Forms.SystemInformation]::VirtualScreen',
    '$bmp=New-Object System.Drawing.Bitmap($vs.Width,$vs.Height)',
    '$g=[System.Drawing.Graphics]::FromImage($bmp)',
    '$g.CopyFromScreen($vs.Left,$vs.Top,0,0,$bmp.Size)',
    `$bmp.Save('${safePath}',[System.Drawing.Imaging.ImageFormat]::Png)`,
    '$g.Dispose();$bmp.Dispose()',
  ];
  const restore = hideTerminals ? [
    'foreach($h in $minimized){ [WHelm]::ShowWindowAsync($h,9) | Out-Null }',   // 9 = SW_RESTORE
  ] : [];
  return [...head, ...hideStart, ...capture, ...restore].join('\n');
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

function winViaTask(out, timeout) {
  const shot = path.join(os.tmpdir(), 'helm-shot-task.png');


  const ps1 = path.join(os.tmpdir(), 'helm-shot.ps1');
  try { writeFileSync(ps1, windowsPsScript(shot)); } catch (e) { return { ok: false, error: 'cannot write capture script: ' + e.message }; }
  const tr = `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${ps1}"`;


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

    if (r.interactive) return winViaTask(out, timeout);
    return { ok: false, error: r.error };
  }

  const candidates = [
    ['scrot', o => ['-o', o]],
    ['import', o => ['-window', 'root', o]],
    ['gnome-screenshot', o => ['-f', o]],
    ['spectacle', o => ['-b', '-n', '-o', o]],
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
