#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { doInput } from './win-input.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MACROS_DIR = path.resolve(__dirname, '../../macros');


try { mkdirSync(MACROS_DIR, { recursive: true }); } catch {}


const args = process.argv.slice(2);
const verb = args[0];
const get  = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };


function out(obj) { console.log(JSON.stringify(obj)); process.exit(obj.ok ? 0 : 1); }
function fail(msg) { out({ ok: false, error: msg }); }


function runPs(script, timeoutMs = 30_000) {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], {
    encoding: 'utf8', timeout: timeoutMs,
  });
}


function macroPath(name) {
  const safe = String(name).replace(/[^a-zA-Z0-9_\-]/g, '_');
  return path.join(MACROS_DIR, `${safe}.json`);
}


const STEP_TYPES = {
  move:    s => s.x != null && s.y != null,
  click:   s => s.x != null && s.y != null,
  type:    s => s.text != null,
  key:     s => s.name != null,
  hotkey:  s => s.combo != null,
  scroll:  s => s.amount != null,
  drag:    s => s.x != null && s.y != null && s.x2 != null && s.y2 != null,
  wait:    s => s.ms != null,
};

function validateSteps(steps) {
  if (!Array.isArray(steps)) return 'steps must be a JSON array';
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (typeof s !== 'object' || s == null) return `step[${i}] is not an object`;
    if (!s.type || !STEP_TYPES[s.type]) return `step[${i}] has unknown type "${s.type}" — valid: ${Object.keys(STEP_TYPES).join(', ')}`;
    if (!STEP_TYPES[s.type](s)) return `step[${i}] type "${s.type}" is missing required fields`;
  }
  return null;
}


function stepToAction(step, speed = 1) {
  switch (step.type) {
    case 'move':   return { verb: 'move',   x: step.x, y: step.y };
    case 'click':  return { verb: step.button === 'right' ? 'rightclick' : 'click', x: step.x, y: step.y };
    case 'type':   return { verb: 'type',   text: step.text };
    case 'key':    return { verb: 'key',    code: step.name };
    case 'hotkey': return { verb: 'hotkey', combo: step.combo };
    case 'scroll': return { verb: 'scroll', amount: step.amount, x: step.x, y: step.y };
    case 'drag':   return { verb: 'drag',   x: step.x, y: step.y, x2: step.x2, y2: step.y2 };
    case 'wait':   return null;
    default:       return null;
  }
}


const sleepMs = ms => {
  if (ms <= 0) return;
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.round(ms)); } catch {}
};




if (verb === 'list') {
  let files = [];
  try { files = readdirSync(MACROS_DIR).filter(f => f.endsWith('.json')); } catch {}
  const macros = files.map(f => {
    try {
      const data = JSON.parse(readFileSync(path.join(MACROS_DIR, f), 'utf8'));
      return { name: data.name || f.replace(/\.json$/, ''), steps: data.steps.length, created: data.created };
    } catch {
      return { name: f.replace(/\.json$/, ''), steps: 0, created: null };
    }
  });
  out({ ok: true, macros });
}

// show --name <n> -> {ok, name, steps:[...]}
else if (verb === 'show') {
  const name = get('name');
  if (!name) fail('show requires --name <n>');
  const fp = macroPath(name);
  if (!existsSync(fp)) fail(`macro "${name}" not found`);
  let data;
  try { data = JSON.parse(readFileSync(fp, 'utf8')); } catch (e) { fail('could not read macro: ' + e.message); }
  out({ ok: true, name: data.name, steps: data.steps, created: data.created });
}


else if (verb === 'save') {
  const name = get('name');
  if (!name) fail('save requires --name <n>');
  const jsonStr = get('json');
  if (!jsonStr) fail('save requires --json \'<steps array>\'');
  let steps;
  try { steps = JSON.parse(jsonStr); } catch (e) { fail('invalid JSON: ' + e.message); }
  const err = validateSteps(steps);
  if (err) fail(err);
  const data = { name, steps, created: new Date().toISOString() };
  try { writeFileSync(macroPath(name), JSON.stringify(data, null, 2)); } catch (e) { fail('could not save macro: ' + e.message); }
  out({ ok: true, name, steps });
}






else if (verb === 'record') {
  const name = get('name');
  if (!name) fail('record requires --name <n>');
  const seconds  = Math.max(1, Math.min(300, Number(get('seconds')  || 10)));
  const interval = Math.max(20, Math.min(2000, Number(get('interval') || 80)));






  const ps = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class HelmMacRec {
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
}
public struct POINT { public int X; public int Y; }
"@

$steps      = New-Object System.Collections.Generic.List[hashtable]
$lbPrev     = $false
$rbPrev     = $false
$lastX      = -1
$lastY      = -1
$lastTime   = [DateTime]::UtcNow
$deadline   = [DateTime]::UtcNow.AddSeconds(${seconds})
$interval   = ${interval}

while ([DateTime]::UtcNow -lt $deadline) {
  $p = New-Object POINT
  [HelmMacRec]::GetCursorPos([ref]$p) | Out-Null
  $cx = $p.X; $cy = $p.Y

  $lbNow = ([HelmMacRec]::GetAsyncKeyState(0x01) -band 0x8000) -ne 0
  $rbNow = ([HelmMacRec]::GetAsyncKeyState(0x02) -band 0x8000) -ne 0

  $now = [DateTime]::UtcNow
  $elapsed = [int]($now - $lastTime).TotalMilliseconds

  # Emit move + wait if cursor has moved and enough time has elapsed.
  if (($cx -ne $lastX -or $cy -ne $lastY) -and $elapsed -gt 0) {
    if ($lastX -ge 0) {
      $steps.Add(@{type='move'; x=$cx; y=$cy})
      $steps.Add(@{type='wait'; ms=$elapsed})
    }
    $lastX = $cx; $lastY = $cy; $lastTime = $now
  }

  # Left button DOWN transition.
  if ($lbNow -and -not $lbPrev) {
    $steps.Add(@{type='click'; x=$cx; y=$cy; button='left'})
    $lastTime = [DateTime]::UtcNow
  }
  # Right button DOWN transition.
  if ($rbNow -and -not $rbPrev) {
    $steps.Add(@{type='click'; x=$cx; y=$cy; button='right'})
    $lastTime = [DateTime]::UtcNow
  }

  $lbPrev = $lbNow; $rbPrev = $rbNow
  Start-Sleep -Milliseconds $interval
}

# Output the step list as JSON.
$steps | ConvertTo-Json -Depth 5 -Compress
`.trim();

  const r = runPs(ps, (seconds + 15) * 1000);
  const raw = (r.stdout || '').trim();
  // Only fail on a non-zero exit; empty stdout just means nothing was captured (cursor didn't move).

  if (r.status !== 0) {
    const errText = (r.stdout || '').trim().slice(0, 400) || (r.stderr || '').replace(/<[^>]+>/g, '').trim().slice(0, 200) || 'powershell failed';
    fail('record failed: ' + errText);
  }


  let steps = [];
  if (raw && raw !== 'null') {
    try {
      const parsed = JSON.parse(raw);

      steps = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
    } catch (e) {
      fail('could not parse recorded steps: ' + e.message + ' raw=' + raw.slice(0, 200));
    }
  }


  steps = steps.map(s => {
    const norm = {};
    for (const [k, v] of Object.entries(s)) norm[k.toLowerCase()] = v;
    return norm;
  });

  const data = { name, steps, created: new Date().toISOString() };
  try { writeFileSync(macroPath(name), JSON.stringify(data, null, 2)); } catch (e) { fail('could not save macro: ' + e.message); }
  out({ ok: true, name, steps, count: steps.length });
}



else if (verb === 'replay') {
  const name = get('name');
  if (!name) fail('replay requires --name <n>');
  const speed = Math.max(0.1, Number(get('speed') || 1));
  const fp = macroPath(name);
  if (!existsSync(fp)) fail(`macro "${name}" not found`);
  let data;
  try { data = JSON.parse(readFileSync(fp, 'utf8')); } catch (e) { fail('could not read macro: ' + e.message); }
  const { steps } = data;
  const err = validateSteps(steps);
  if (err) fail('macro has invalid steps: ' + err);

  let played = 0;
  for (const step of steps) {
    if (step.type === 'wait') {
      sleepMs((step.ms || 0) / speed);
      played++;
      continue;
    }
    const action = stepToAction(step, speed);
    if (!action) { played++; continue; }
    const r = doInput(action);
    if (!r.ok) {
      out({ ok: false, name, played, error: `step ${played} (${step.type}) failed: ${r.error}` });
    }
    played++;
  }
  out({ ok: true, name, played });
}

else {
  fail('verbs: list | show --name <n> | save --name <n> --json \'<steps>\' | record --name <n> [--seconds N] [--interval ms] | replay --name <n> [--speed x]');
}
