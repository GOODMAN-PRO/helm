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
    ' [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);',
    '}',
    'public struct POINT{public int X;public int Y;}',
    '"@',
  ];
  const body = [];
  const { verb, x, y, text, code } = action;
  if (['click', 'doubleclick', 'rightclick', 'move'].includes(verb)) {
    body.push(`[HelmIn]::SetCursorPos(${x | 0},${y | 0}); Start-Sleep -Milliseconds 40`);
    if (verb === 'click') body.push('[HelmIn]::mouse_event(2,0,0,0,0);[HelmIn]::mouse_event(4,0,0,0,0)');
    else if (verb === 'rightclick') body.push('[HelmIn]::mouse_event(8,0,0,0,0);[HelmIn]::mouse_event(16,0,0,0,0)');
    else if (verb === 'doubleclick') body.push('[HelmIn]::mouse_event(2,0,0,0,0);[HelmIn]::mouse_event(4,0,0,0,0);Start-Sleep -Milliseconds 60;[HelmIn]::mouse_event(2,0,0,0,0);[HelmIn]::mouse_event(4,0,0,0,0)');
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
export function winInput(action, { timeout = 12_000 } = {}) {
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
