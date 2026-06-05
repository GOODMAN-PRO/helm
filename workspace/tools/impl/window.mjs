#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const verb = args[0];
const get = (k) => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
const runPs = (script) => {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8', timeout: 15000 });
};



const parseJsonLine = (stdout) => {
  const line = (stdout || '').split('\n').map(l => l.trim()).find(l => l.startsWith('{'));
  if (!line) return null;
  try { return JSON.parse(line); } catch { return null; }
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
} else if (verb === 'state') {
  // Returns info about the current foreground window using P/Invoke into user32.dll.
  // Note: $pid is a PowerShell reserved automatic variable — use $winPid instead.
  // $ProgressPreference = 'SilentlyContinue' suppresses CLIXML progress noise on the output stream.
  const script = `
$ProgressPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinState {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$hwnd = [WinState]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) { Write-Output '{"ok":false,"error":"no foreground window"}'; exit }
$len = [WinState]::GetWindowTextLength($hwnd)
$sb = New-Object System.Text.StringBuilder($len + 1)
[WinState]::GetWindowText($hwnd, $sb, $sb.Capacity) | Out-Null
$winTitle = $sb.ToString()
$winPid = [uint32]0
[WinState]::GetWindowThreadProcessId($hwnd, [ref]$winPid) | Out-Null
$proc = Get-Process -Id $winPid -ErrorAction SilentlyContinue
$winApp = if ($proc) { $proc.ProcessName } else { '' }
$rect = New-Object WinState+RECT
[WinState]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$maximized = [WinState]::IsZoomed($hwnd)
$minimized = [WinState]::IsIconic($hwnd)
$x = $rect.Left; $y = $rect.Top; $w = $rect.Right - $rect.Left; $h = $rect.Bottom - $rect.Top
$obj = [PSCustomObject]@{ ok=$true; title=$winTitle; pid=[int]$winPid; app=$winApp; rect=[PSCustomObject]@{x=$x;y=$y;w=$w;h=$h}; maximized=$maximized; minimized=$minimized }
Write-Output ($obj | ConvertTo-Json -Compress)
`;
  const r = runPs(script);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed) {
    console.log(JSON.stringify({ ok: false, error: 'state query produced no JSON (status=' + r.status + '): ' + (r.stderr || '').trim().slice(0, 200) }));
    process.exit(1);
  }
  console.log(JSON.stringify(parsed));
} else if (verb === 'move' || verb === 'resize' || verb === 'rect') {
  const title = get('title');
  if (!title) { console.error(verb + ' needs --title <substring>'); process.exit(1); }
  const esc = title.replace(/'/g, "''");

  // Collect provided dimensions; for move only x/y matter; for resize only w/h; for rect all four.
  const xArg = get('x');
  const yArg = get('y');
  const wArg = get('w');
  const hArg = get('h');

  if (verb === 'move'   && (xArg === null || yArg === null)) { console.error('move needs --x and --y'); process.exit(1); }
  if (verb === 'resize' && (wArg === null || hArg === null)) { console.error('resize needs --w and --h'); process.exit(1); }
  if (verb === 'rect'   && (xArg === null || yArg === null || wArg === null || hArg === null)) { console.error('rect needs --x --y --w --h'); process.exit(1); }


  const nxLine = xArg !== null ? `$nx = ${parseInt(xArg)}` : '$nx = $cx';
  const nyLine = yArg !== null ? `$ny = ${parseInt(yArg)}` : '$ny = $cy';
  const nwLine = wArg !== null ? `$nw = ${parseInt(wArg)}` : '$nw = $cw';
  const nhLine = hArg !== null ? `$nh = ${parseInt(hArg)}` : '$nh = $ch';


  const script = `
$ProgressPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinMove {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$winTarget = $null
$winTargetTitle = ''
[WinMove]::EnumWindows({
  param($h,$l)
  if (-not [WinMove]::IsWindowVisible($h)) { return $true }
  $tlen = [WinMove]::GetWindowTextLength($h)
  if ($tlen -eq 0) { return $true }
  $tsb = New-Object System.Text.StringBuilder($tlen + 1)
  [WinMove]::GetWindowText($h, $tsb, $tsb.Capacity) | Out-Null
  $t = $tsb.ToString()
  if ($t -like '*${esc}*') { $script:winTarget = $h; $script:winTargetTitle = $t; return $false }
  return $true
}, [IntPtr]::Zero) | Out-Null
if ($null -eq $winTarget) { Write-Output '{"ok":false,"error":"no window matched"}'; exit }
$rect = New-Object WinMove+RECT
[WinMove]::GetWindowRect($winTarget, [ref]$rect) | Out-Null
$cx = $rect.Left; $cy = $rect.Top
$cw = $rect.Right - $rect.Left; $ch = $rect.Bottom - $rect.Top
${nxLine}
${nyLine}
${nwLine}
${nhLine}
[WinMove]::MoveWindow($winTarget, $nx, $ny, $nw, $nh, $true) | Out-Null
[WinMove]::GetWindowRect($winTarget, [ref]$rect) | Out-Null
$fx = $rect.Left; $fy = $rect.Top; $fw = $rect.Right - $rect.Left; $fh = $rect.Bottom - $rect.Top
$obj = [PSCustomObject]@{ ok=$true; title=$winTargetTitle; rect=[PSCustomObject]@{x=$fx;y=$fy;w=$fw;h=$fh} }
Write-Output ($obj | ConvertTo-Json -Compress)
`;
  const r = runPs(script);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed) { console.log(JSON.stringify({ ok: false, error: verb + ' failed: ' + (r.stderr || '').trim().slice(0, 200) })); process.exit(1); }
  console.log(JSON.stringify(parsed));
} else if (verb === 'snap') {
  const title = get('title');
  const side  = get('side');
  if (!title) { console.error('snap needs --title <substring>'); process.exit(1); }
  if (!side)  { console.error('snap needs --side <left|right|top|bottom|max|min|restore|center>'); process.exit(1); }
  const validSides = ['left','right','top','bottom','max','min','restore','center'];
  if (!validSides.includes(side)) { console.error('snap --side must be one of: ' + validSides.join('|')); process.exit(1); }
  const esc = title.replace(/'/g, "''");

  const script = `
$ProgressPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinSnap {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint dwFlags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
  public struct MONITORINFO {
    public uint cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
  }
}
"@
$winTarget = $null
$winTargetTitle = ''
[WinSnap]::EnumWindows({
  param($h,$l)
  if (-not [WinSnap]::IsWindowVisible($h)) { return $true }
  $tlen = [WinSnap]::GetWindowTextLength($h)
  if ($tlen -eq 0) { return $true }
  $tsb = New-Object System.Text.StringBuilder($tlen + 1)
  [WinSnap]::GetWindowText($h, $tsb, $tsb.Capacity) | Out-Null
  $t = $tsb.ToString()
  if ($t -like '*${esc}*') { $script:winTarget = $h; $script:winTargetTitle = $t; return $false }
  return $true
}, [IntPtr]::Zero) | Out-Null
if ($null -eq $winTarget) { Write-Output '{"ok":false,"error":"no window matched"}'; exit }
$snapSide = '${side}'
if ($snapSide -eq 'max') {
  [WinSnap]::ShowWindow($winTarget, 3) | Out-Null
  $obj = [PSCustomObject]@{ ok=$true; title=$winTargetTitle; action='maximized' }
  Write-Output ($obj | ConvertTo-Json -Compress); exit
}
if ($snapSide -eq 'min') {
  [WinSnap]::ShowWindow($winTarget, 6) | Out-Null
  $obj = [PSCustomObject]@{ ok=$true; title=$winTargetTitle; action='minimized' }
  Write-Output ($obj | ConvertTo-Json -Compress); exit
}
if ($snapSide -eq 'restore') {
  [WinSnap]::ShowWindow($winTarget, 9) | Out-Null
  $obj = [PSCustomObject]@{ ok=$true; title=$winTargetTitle; action='restored' }
  Write-Output ($obj | ConvertTo-Json -Compress); exit
}
# For positional snaps restore first so MoveWindow works reliably on maximized windows
[WinSnap]::ShowWindow($winTarget, 9) | Out-Null
$hMon = [WinSnap]::MonitorFromWindow($winTarget, 2)
$mi = New-Object WinSnap+MONITORINFO
$mi.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($mi)
[WinSnap]::GetMonitorInfo($hMon, [ref]$mi) | Out-Null
$wa = $mi.rcWork
$wx = $wa.Left; $wy = $wa.Top; $ww = $wa.Right - $wa.Left; $wh = $wa.Bottom - $wa.Top
$hw = [int]($ww / 2); $hh = [int]($wh / 2)
$cx70 = [int]($ww * 0.7); $cy70 = [int]($wh * 0.7)
$nx = $wx; $ny = $wy; $nw = $ww; $nh = $wh
if ($snapSide -eq 'left')   { $nx = $wx;                             $ny = $wy;       $nw = $hw;       $nh = $wh }
if ($snapSide -eq 'right')  { $nx = $wx + $hw;                       $ny = $wy;       $nw = $ww - $hw; $nh = $wh }
if ($snapSide -eq 'top')    { $nx = $wx;                             $ny = $wy;       $nw = $ww;       $nh = $hh }
if ($snapSide -eq 'bottom') { $nx = $wx;                             $ny = $wy + $hh; $nw = $ww;       $nh = $wh - $hh }
if ($snapSide -eq 'center') { $nx = $wx + [int](($ww - $cx70) / 2); $ny = $wy + [int](($wh - $cy70) / 2); $nw = $cx70; $nh = $cy70 }
[WinSnap]::MoveWindow($winTarget, $nx, $ny, $nw, $nh, $true) | Out-Null
$rect2 = New-Object WinSnap+RECT
[WinSnap]::GetWindowRect($winTarget, [ref]$rect2) | Out-Null
$fx = $rect2.Left; $fy = $rect2.Top; $fw = $rect2.Right - $rect2.Left; $fh = $rect2.Bottom - $rect2.Top
$obj = [PSCustomObject]@{ ok=$true; title=$winTargetTitle; action=$snapSide; rect=[PSCustomObject]@{x=$fx;y=$fy;w=$fw;h=$fh} }
Write-Output ($obj | ConvertTo-Json -Compress)
`;
  const r = runPs(script);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed) { console.log(JSON.stringify({ ok: false, error: 'snap failed: ' + (r.stderr || '').trim().slice(0, 200) })); process.exit(1); }
  console.log(JSON.stringify(parsed));
} else if (verb === 'close') {
  const title = get('title');
  if (!title) { console.error('close needs --title <substring>'); process.exit(1); }
  const esc = title.replace(/'/g, "''");

  const script = `
$ProgressPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinClose {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@
$winTarget = $null
$winTargetTitle = ''
[WinClose]::EnumWindows({
  param($h,$l)
  if (-not [WinClose]::IsWindowVisible($h)) { return $true }
  $tlen = [WinClose]::GetWindowTextLength($h)
  if ($tlen -eq 0) { return $true }
  $tsb = New-Object System.Text.StringBuilder($tlen + 1)
  [WinClose]::GetWindowText($h, $tsb, $tsb.Capacity) | Out-Null
  $t = $tsb.ToString()
  if ($t -like '*${esc}*') { $script:winTarget = $h; $script:winTargetTitle = $t; return $false }
  return $true
}, [IntPtr]::Zero) | Out-Null
if ($null -eq $winTarget) { Write-Output '{"ok":false,"error":"no window matched"}'; exit }
$WM_CLOSE = 0x0010
[WinClose]::PostMessage($winTarget, $WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
$obj = [PSCustomObject]@{ ok=$true; title=$winTargetTitle; closed=$true }
Write-Output ($obj | ConvertTo-Json -Compress)
`;
  const r = runPs(script);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed) { console.log(JSON.stringify({ ok: false, error: 'close failed: ' + (r.stderr || '').trim().slice(0, 200) })); process.exit(1); }
  console.log(JSON.stringify(parsed));
} else {
  console.error('verbs: list | focus --title <substring> | state | move --title --x --y | resize --title --w --h | rect --title --x --y --w --h | snap --title --side <left|right|top|bottom|max|min|restore|center> | close --title'); process.exit(1);
}
