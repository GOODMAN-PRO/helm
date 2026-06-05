#!/usr/bin/env node
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, unlinkSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';





const args = process.argv.slice(2);
const verb = args[0];
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i !== -1 ? args[i + 1] : null;
};

const PID_FILE = path.join(os.tmpdir(), 'helm-screenrec.pid');
const PATH_FILE = path.join(os.tmpdir(), 'helm-screenrec.path');

function out(obj) {
  console.log(JSON.stringify(obj));
}

function die(msg) {
  console.log(JSON.stringify({ ok: false, error: msg }));
  process.exit(0);
}





const FFMPEG_FALLBACK_DIR =
  'C:\\Users\\User\\AppData\\Local\\Microsoft\\WinGet\\Packages\\' +
  'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin';

function findBin(name) {

  const r = spawnSync('where', [name], { encoding: 'utf8', shell: false });
  if (r.status === 0) {
    const first = r.stdout.trim().split('\n')[0].trim();
    if (first) return first;
  }

  const fb = path.join(FFMPEG_FALLBACK_DIR, name + '.exe');
  if (existsSync(fb)) return fb;
  return null;
}

const FFMPEG  = findBin('ffmpeg');
const FFPROBE = findBin('ffprobe');

if (!FFMPEG) die('ffmpeg not found on PATH or in the WinGet fallback location. Install via: winget install Gyan.FFmpeg');





function defaultMp4() {
  return path.join(os.tmpdir(), `helm-rec-${Date.now()}.mp4`);
}





function regionArgs(region) {
  if (!region) return [];
  const parts = region.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    die('--region must be x,y,w,h (e.g. 0,0,1280,720)');
  }
  const [x, y, w, h] = parts;
  return ['-offset_x', String(x), '-offset_y', String(y), '-video_size', `${w}x${h}`];
}





function pidAlive(pid) {
  const r = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'], {
    encoding: 'utf8',
    shell: false,
  });
  return r.status === 0 && r.stdout.includes(String(pid));
}





if (verb === 'start') {
  const outArg     = get('out') || defaultMp4();
  const secondsArg = get('seconds');
  const fps        = get('fps') || '30';
  const region     = get('region');


  const outAbs = path.resolve(outArg);


  const ffArgs = [
    '-f', 'gdigrab',
    '-framerate', fps,
    ...regionArgs(region),
    '-i', 'desktop',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-y',
  ];

  if (secondsArg !== null) {

    const secs = parseFloat(secondsArg);
    if (isNaN(secs) || secs <= 0) die('--seconds must be a positive number');

    const fullArgs = ['-t', String(secs), ...ffArgs, outAbs];
    const r = spawnSync(FFMPEG, fullArgs, { encoding: 'utf8', stdio: 'pipe' });
    if (r.status !== 0) {
      die('ffmpeg failed: ' + (r.stderr || '').trim().slice(-400));
    }
    if (!existsSync(outAbs)) die('ffmpeg exited 0 but output file not found: ' + outAbs);
    out({ ok: true, path: outAbs, seconds: secs });
    process.exit(0);
  }

  // UNBOUNDED: detached
  if (existsSync(PID_FILE)) {
    const oldPid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (!isNaN(oldPid) && pidAlive(oldPid)) {
      die('A recording is already active (PID ' + oldPid + '). Run stop first.');
    }

    try { unlinkSync(PID_FILE); } catch {}
    try { unlinkSync(PATH_FILE); } catch {}
  }

  const fullArgs = [...ffArgs, outAbs];
  const child = spawn(FFMPEG, fullArgs, {
    detached: true,
    stdio: ['pipe', 'ignore', 'ignore'],
    windowsHide: true,
  });
  child.unref();



  const pid = child.pid;
  if (!pid) die('Failed to spawn ffmpeg (no PID returned)');


  const t0 = Date.now();
  while (Date.now() - t0 < 800) {  }

  if (!pidAlive(pid)) {
    die('ffmpeg exited immediately — gdigrab may require an unlocked interactive desktop session');
  }

  writeFileSync(PID_FILE, String(pid), 'utf8');
  writeFileSync(PATH_FILE, outAbs, 'utf8');

  out({ ok: true, path: outAbs, recording: true, pid });
  process.exit(0);
}





if (verb === 'stop') {
  if (!existsSync(PID_FILE)) {
    out({ ok: false, error: 'No recording active (pidfile not found).' });
    process.exit(0);
  }

  const pid  = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
  const outP = existsSync(PATH_FILE) ? readFileSync(PATH_FILE, 'utf8').trim() : null;

  if (isNaN(pid)) {
    try { unlinkSync(PID_FILE); } catch {}
    try { unlinkSync(PATH_FILE); } catch {}
    die('Pidfile corrupt (not a number). Cleaned up.');
  }

  if (!pidAlive(pid)) {
    try { unlinkSync(PID_FILE); } catch {}
    try { unlinkSync(PATH_FILE); } catch {}
    out({ ok: true, path: outP, note: 'Process was already gone; pidfile cleaned up.' });
    process.exit(0);
  }














  const psScript = `
$procId = ${pid}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ConsoleCtrl {
  [DllImport("kernel32.dll")] public static extern bool GenerateConsoleCtrlEvent(uint dwCtrlEvent, uint dwProcessGroupId);
  [DllImport("kernel32.dll")] public static extern bool FreeConsole();
  [DllImport("kernel32.dll")] public static extern bool AttachConsole(uint dwProcessId);
}
"@
# Try to attach to ffmpeg's console group and send Ctrl+C
[ConsoleCtrl]::FreeConsole() | Out-Null
$attached = [ConsoleCtrl]::AttachConsole([uint32]$procId)
if ($attached) {
  [ConsoleCtrl]::GenerateConsoleCtrlEvent(0, 0) | Out-Null
  Start-Sleep -Milliseconds 2500
  [ConsoleCtrl]::FreeConsole() | Out-Null
}
# Check if still alive; if so, force kill
$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
if ($proc) {
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  Write-Output "FORCED"
} else {
  Write-Output "GRACEFUL"
}
`;

  const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64],
    { encoding: 'utf8', timeout: 8000 }
  );

  try { unlinkSync(PID_FILE); } catch {}
  try { unlinkSync(PATH_FILE); } catch {}

  const psOut = (r.stdout || '').trim();
  const method = psOut.includes('GRACEFUL') ? 'graceful (Ctrl+C)' : 'forced (taskkill)';


  const t0 = Date.now();
  while (Date.now() - t0 < 500) {  }

  out({ ok: true, path: outP, stopped: true, method });
  process.exit(0);
}





if (verb === 'status') {
  if (!existsSync(PID_FILE)) {
    out({ ok: true, recording: false });
    process.exit(0);
  }

  const pid  = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
  const outP = existsSync(PATH_FILE) ? readFileSync(PATH_FILE, 'utf8').trim() : null;

  if (isNaN(pid) || !pidAlive(pid)) {

    try { unlinkSync(PID_FILE); } catch {}
    try { unlinkSync(PATH_FILE); } catch {}
    out({ ok: true, recording: false, note: 'Stale pidfile cleaned up.' });
    process.exit(0);
  }

  out({ ok: true, recording: true, pid, path: outP });
  process.exit(0);
}





if (verb === 'gif') {
  const src   = get('src');
  const gifOut = get('out');
  const fps   = get('fps') || '10';
  const width = get('width') || '640';

  if (!src)    die('gif requires --src <mp4>');
  if (!gifOut) die('gif requires --out <gif>');

  const srcAbs = path.resolve(src);
  const gifAbs = path.resolve(gifOut);

  if (!existsSync(srcAbs)) die('Source file not found: ' + srcAbs);



  const palette = path.join(os.tmpdir(), `helm-palette-${Date.now()}.png`);
  const pass1 = spawnSync(
    FFMPEG,
    [
      '-i', srcAbs,
      '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=stats_mode=diff`,
      '-y', palette,
    ],
    { encoding: 'utf8', stdio: 'pipe' }
  );
  if (pass1.status !== 0) {
    die('ffmpeg palettegen failed: ' + (pass1.stderr || '').trim().slice(-400));
  }

  // Pass 2: render GIF using palette
  const pass2 = spawnSync(
    FFMPEG,
    [
      '-i', srcAbs,
      '-i', palette,
      '-lavfi', `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`,
      '-y', gifAbs,
    ],
    { encoding: 'utf8', stdio: 'pipe' }
  );


  try { unlinkSync(palette); } catch {}

  if (pass2.status !== 0) {
    die('ffmpeg paletteuse failed: ' + (pass2.stderr || '').trim().slice(-400));
  }

  if (!existsSync(gifAbs)) die('ffmpeg exited 0 but GIF not found: ' + gifAbs);

  const gifStat = statSync(gifAbs);
  out({ ok: true, path: gifAbs, size_bytes: gifStat.size });
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Unknown verb
// ---------------------------------------------------------------------------

die('Unknown verb. Valid verbs: start | stop | status | gif');
