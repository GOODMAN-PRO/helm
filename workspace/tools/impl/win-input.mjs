#!/usr/bin/env node
// Windows mouse/keyboard control for Helm — the Windows counterpart to bin/guicontrol (macOS).
//
// Injecting input only works from a process attached to the INTERACTIVE desktop. An SSH-driven
// process (use windows) runs in a non-interactive session, so SetCursorPos/SendKeys silently no-op.
// So, like screenshots, we route input through a one-shot scheduled task ("HelmInput") that runs in
// the logged-on user's session. Flow: write the action to a fixed JSON file, trigger HelmInput, which
// runs `win-input.mjs --task-run`, reads the file, performs the action, and writes a .done marker we
// read back. Run locally on Windows it still works (the task runs in the same interactive session).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ACTION_FILE = path.join(os.tmpdir(), 'helm-input.json');
const DONE_FILE   = path.join(os.tmpdir(), 'helm-input.done');
const sleepMs = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} };

// SendKeys escaping: special chars must be wrapped in braces to be sent literally.
function escSendKeys(t) {
  return String(t).replace(/[+^%~(){}\[\]]/g, c => (c === '{' ? '{{}' : c === '}' ? '{}}' : `{${c}}`));
}
const KEYMAP = {
  enter: '{ENTER}', return: '{ENTER}', esc: '{ESC}', escape: '{ESC}', tab: '{TAB}', space: ' ',
  backspace: '{BACKSPACE}', bksp: '{BACKSPACE}', delete: '{DELETE}', del: '{DELETE}',
  up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}', home: '{HOME}', end: '{END}',
  pageup: '{PGUP}', pagedown: '{PGDN}', f1: '{F1}', f2: '{F2}', f3: '{F3}', f4: '{F4}', f5: '{F5}',
};
// Virtual-key codes for hotkey combos (keybd_event). Letters A-Z and digits 0-9 are computed in vkFor.
const VK = {
  ctrl: 0x11, control: 0x11, alt: 0x12, shift: 0x10, win: 0x5B, cmd: 0x5B, meta: 0x5B, super: 0x5B,
  enter: 0x0D, return: 0x0D, esc: 0x1B, escape: 0x1B, tab: 0x09, space: 0x20, backspace: 0x08,
  delete: 0x2E, del: 0x2E, up: 0x26, down: 0x28, left: 0x25, right: 0x27, home: 0x24, end: 0x23,
  pageup: 0x21, pagedown: 0x22, insert: 0x2D,
  f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75, f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7A, f12: 0x7B,
};
function vkFor(tok) {
  tok = String(tok).toLowerCase();
  if (VK[tok] != null) return VK[tok];
  if (/^[a-z]$/.test(tok)) return tok.toUpperCase().charCodeAt(0); // A-Z = 0x41-0x5A
  if (/^[0-9]$/.test(tok)) return tok.charCodeAt(0);               // 0-9 = 0x30-0x39
  return null;
}

// Build the PowerShell that performs one action in THIS session, then prints the cursor position.
function psFor(action) {
  const head = [
    "$ErrorActionPreference='Stop'",
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type @"',
    'using System;using System.Runtime.InteropServices;',
    'public class HelmIn{',
    ' [DllImport("user32.dll")] public static extern bool SetCursorPos(int X,int Y);',
    ' [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,int e);',
    ' [DllImport("user32.dll")] public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,int dwExtraInfo);',
    ' [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);',
    '}',
    'public struct POINT{public int X;public int Y;}',
    '"@',
  ];
  const body = [];
  const { verb, x, y, x2, y2, text, code, combo, amount, horizontal } = action;
  if (['click', 'doubleclick', 'rightclick', 'move'].includes(verb)) {
    body.push(`[HelmIn]::SetCursorPos(${x | 0},${y | 0}); Start-Sleep -Milliseconds 40`);
    if (verb === 'click') body.push('[HelmIn]::mouse_event(2,0,0,0,0);[HelmIn]::mouse_event(4,0,0,0,0)');
    else if (verb === 'rightclick') body.push('[HelmIn]::mouse_event(8,0,0,0,0);[HelmIn]::mouse_event(16,0,0,0,0)');
    else if (verb === 'doubleclick') body.push('[HelmIn]::mouse_event(2,0,0,0,0);[HelmIn]::mouse_event(4,0,0,0,0);Start-Sleep -Milliseconds 60;[HelmIn]::mouse_event(2,0,0,0,0);[HelmIn]::mouse_event(4,0,0,0,0)');
  } else if (verb === 'scroll') {
    // amount: notches; positive = up/right, negative = down/left. Each notch = 120.
    const n = Math.round(Number(amount) || 0);
    const data = n >= 0 ? n * 120 : (0x100000000 + n * 120); // signed wheel delta packed as uint
    const flag = horizontal ? '0x01000' : '0x0800';          // MOUSEEVENTF_HWHEEL / MOUSEEVENTF_WHEEL
    if (x != null && y != null) body.push(`[HelmIn]::SetCursorPos(${x | 0},${y | 0}); Start-Sleep -Milliseconds 30`);
    body.push(`[HelmIn]::mouse_event(${flag},0,0,${data},0)`);
  } else if (verb === 'drag') {
    const sx = x | 0, sy = y | 0, ex = x2 | 0, ey = y2 | 0, steps = 14;
    body.push(`[HelmIn]::SetCursorPos(${sx},${sy}); Start-Sleep -Milliseconds 50`);
    body.push('[HelmIn]::mouse_event(2,0,0,0,0); Start-Sleep -Milliseconds 60'); // left down
    for (let i = 1; i <= steps; i++) {
      const ix = Math.round(sx + (ex - sx) * i / steps), iy = Math.round(sy + (ey - sy) * i / steps);
      body.push(`[HelmIn]::SetCursorPos(${ix},${iy}); Start-Sleep -Milliseconds 12`);
    }
    body.push('Start-Sleep -Milliseconds 40; [HelmIn]::mouse_event(4,0,0,0,0)');  // left up
  } else if (verb === 'hotkey') {
    const vks = String(combo).split('+').map((s) => vkFor(s.trim()));
    if (!vks.length || vks.some((v) => v == null)) body.push(`Write-Error 'bad hotkey: ${String(combo).replace(/[^a-zA-Z0-9+ ]/g, '')}'`);
    else {
      for (const v of vks) body.push(`[HelmIn]::keybd_event(${v},0,0,0); Start-Sleep -Milliseconds 25`);
      for (const v of [...vks].reverse()) body.push(`[HelmIn]::keybd_event(${v},0,2,0); Start-Sleep -Milliseconds 15`);
    }
  } else if (verb === 'type') {
    const lit = escSendKeys(text).replace(/'/g, "''");
    body.push(`[System.Windows.Forms.SendKeys]::SendWait('${lit}')`);
  } else if (verb === 'key') {
    const tok = KEYMAP[String(code).toLowerCase()] || escSendKeys(code);
    body.push(`[System.Windows.Forms.SendKeys]::SendWait('${tok.replace(/'/g, "''")}')`);
  } else {
    body.push(`Write-Error 'unknown verb ${verb}'`);
  }
  const tail = ['$p=New-Object POINT;[HelmIn]::GetCursorPos([ref]$p);Write-Output ("CURSOR="+$p.X+","+$p.Y)'];
  return [...head, ...body, ...tail].join('\n');
}

// Perform the action in THIS process's session (works only if interactive).
export function doInput(action) {
  const b64 = Buffer.from(psFor(action), 'utf16le').toString('base64');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8', timeout: 15_000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) return { ok: false, error: out.trim().slice(0, 200) || 'powershell input failed' };
  const m = out.match(/CURSOR=(-?\d+),(-?\d+)/);
  return { ok: true, cursor: m ? { x: +m[1], y: +m[2] } : null };
}

// Run the action via the HelmInput scheduled task so it executes in the interactive desktop session
// (required when driven over SSH). Returns { ok, error?, cursor? }.
export function winInput(action, { timeout = 20_000 } = {}) {
  // Fast path: when we're already in an interactive desktop session (the normal local case — the bot
  // started via the Startup launcher / `helm` / Start-Process in the logged-on session), inject input
  // directly in-process. It's instant and reliable; the scheduled-task path below has high, variable
  // latency and was timing out (~20s) for keyboard combos. Only fall back to HelmInput when the direct
  // call genuinely fails (headless / SSH / Session 0, where it can't reach the desktop).
  try {
    const direct = doInput(action);
    if (direct && direct.ok) return direct;
  } catch {}
  try { writeFileSync(ACTION_FILE, JSON.stringify(action)); } catch (e) { return { ok: false, error: 'cannot write action file: ' + e.message }; }
  try { unlinkSync(DONE_FILE); } catch {}
  // Launch node HIDDEN (no console window) so input never flashes a terminal or steals focus from the
  // window we're typing into. A hidden PowerShell starts node with -WindowStyle Hidden and waits.
  const ps1 = path.join(os.tmpdir(), 'helm-input-run.ps1');
  const esc = s => s.replace(/'/g, "''");
  try { writeFileSync(ps1, `Start-Process -WindowStyle Hidden -Wait -FilePath '${esc(process.execPath)}' -ArgumentList '"${esc(__filename)}" --task-run'`); }
  catch (e) { return { ok: false, error: 'cannot write input runner: ' + e.message }; }
  const tr = `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${ps1}"`;
  spawnSync('schtasks', ['/Create', '/TN', 'HelmInput', '/TR', tr, '/SC', 'ONCE', '/ST', '00:00', '/RL', 'LIMITED', '/IT', '/F'], { encoding: 'utf8', timeout: 15_000 });
  const run = spawnSync('schtasks', ['/Run', '/TN', 'HelmInput'], { encoding: 'utf8', timeout: 15_000 });
  if (run.status !== 0) return { ok: false, error: 'could not run HelmInput task: ' + (run.stderr || '').trim().slice(0, 160) };
  const deadline = Date.now() + Math.max(timeout, 8_000);
  while (Date.now() < deadline) {
    try { if (statSync(DONE_FILE).size > 0) return JSON.parse(readFileSync(DONE_FILE, 'utf8')); } catch {}
    sleepMs(300);
  }
  return { ok: false, error: 'HelmInput timed out — ensure you are logged in at the Windows machine with the screen unlocked.' };
}

// Screen geometry of the whole virtual desktop (all monitors). Read-only, so it runs locally with a
// quick PowerShell call — no interactive scheduled task needed. Returns { ok, left, top, width, height }.
export function screenBounds() {
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$v=[System.Windows.Forms.SystemInformation]::VirtualScreen',
    'Write-Output ("BOUNDS="+$v.Left+","+$v.Top+","+$v.Width+","+$v.Height)',
  ].join('\n');
  const b64 = Buffer.from(ps, 'utf16le').toString('base64');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8', timeout: 10_000 });
  const m = ((r.stdout || '') + (r.stderr || '')).match(/BOUNDS=(-?\d+),(-?\d+),(\d+),(\d+)/);
  if (!m) return { ok: false, error: 'could not read screen size' };
  return { ok: true, left: +m[1], top: +m[2], width: +m[3], height: +m[4] };
}

// Resolve a named anchor (e.g. "top-right", "center") to absolute screen coords given bounds.
// `inset` nudges off the exact edge so corners stay clickable. Returns [x, y] or null.
export function resolveAnchor(at, b, inset = 1) {
  const l = b.left + inset, t = b.top + inset;
  const r = b.left + b.width - 1 - inset, btm = b.top + b.height - 1 - inset;
  const cx = b.left + Math.floor(b.width / 2), cy = b.top + Math.floor(b.height / 2);
  const map = {
    'top-left': [l, t], 'top-right': [r, t], 'bottom-left': [l, btm], 'bottom-right': [r, btm],
    'center': [cx, cy], 'middle': [cx, cy], 'top': [cx, t], 'bottom': [cx, btm], 'left': [l, cy], 'right': [r, cy],
  };
  return map[String(at).toLowerCase().replace(/\s+/g, '-')] || null;
}

// --task-run: executed by the HelmInput scheduled task inside the interactive session.
if (process.argv.includes('--task-run')) {
  let action = {};
  try { action = JSON.parse(readFileSync(ACTION_FILE, 'utf8')); } catch {}
  const res = doInput(action);
  try { writeFileSync(DONE_FILE, JSON.stringify(res)); } catch {}
  process.exit(0);
}
