#!/usr/bin/env node
// Helm audio tool — all verbs in one file.
//
// Verbs:
//   voices                                                    -> installed SAPI voices
//   say   --text "<...>" [--out <wav>] [--voice <substr>] [--rate N]  -> TTS to WAV
//   info  --path <audio>                                      -> ffprobe metadata
//   convert --src <a> --out <b>                               -> ffmpeg format convert
//   trim  --src <a> --out <b> --start <sec> --dur <sec>       -> ffmpeg trim
//   transcribe --path <audio>                                 -> whisper (if present)
//
// Prints ONE JSON object to stdout; exits 0.

import { spawnSync } from 'node:child_process';
import { existsSync }  from 'node:fs';
import os   from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const verb = args[0];
const get  = (k) => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };

function out(obj) { console.log(JSON.stringify(obj)); process.exit(0); }
function fail(msg) { console.log(JSON.stringify({ ok: false, error: msg })); process.exit(0); }

// Run a PowerShell script via -EncodedCommand (avoids all quoting issues).
function runPs(script, timeoutMs = 30_000) {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64],
    { encoding: 'utf8', timeout: timeoutMs });
}

// Find the first line of stdout that looks like JSON.
function parseJsonLine(stdout) {
  const line = (stdout || '').split('\n').map(l => l.trim()).find(l => l.startsWith('{') || l.startsWith('['));
  if (!line) return null;
  try { return JSON.parse(line); } catch { return null; }
}

// Locate ffmpeg / ffprobe: try PATH first, then the known WinGet install.
const WINGET_BIN =
  'C:\\Users\\User\\AppData\\Local\\Microsoft\\WinGet\\Packages\\' +
  'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin';

function findBin(name) {
  // Try PATH
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which',
    [name], { encoding: 'utf8', timeout: 5_000 });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0].trim();
  // Fallback: WinGet install
  const fallback = path.join(WINGET_BIN, name + (process.platform === 'win32' ? '.exe' : ''));
  if (existsSync(fallback)) return fallback;
  return null;
}

const FFMPEG  = findBin('ffmpeg');
const FFPROBE = findBin('ffprobe');

// ---------------------------------------------------------------------------
// Verb: voices
// ---------------------------------------------------------------------------
if (verb === 'voices') {
  const script = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$list = @()
foreach ($v in $s.GetInstalledVoices()) {
  $info = $v.VoiceInfo
  $list += [PSCustomObject]@{
    name    = $info.Name
    culture = $info.Culture.ToString()
    gender  = $info.Gender.ToString()
    age     = $info.Age.ToString()
    enabled = $v.Enabled
  }
}
$s.Dispose()
Write-Output ($list | ConvertTo-Json -Compress)
`;
  const r = runPs(script);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed) fail('SAPI voices query failed: ' + (r.stderr || r.stdout || '').trim().slice(0, 300));
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  out({ ok: true, voices: arr });
}

// ---------------------------------------------------------------------------
// Verb: say
// ---------------------------------------------------------------------------
if (verb === 'say') {
  const text  = get('text');
  if (!text) fail('say requires --text "<...>"');

  const ts     = Date.now();
  const wavOut = get('out') || path.join(os.tmpdir(), `helm-tts-${ts}.wav`);
  const voice  = get('voice') || '';
  const rateRaw = get('rate');
  const rate   = rateRaw !== null ? parseInt(rateRaw, 10) : 0;

  if (isNaN(rate) || rate < -10 || rate > 10) fail('--rate must be an integer -10..10');

  // Escape the text and paths for PowerShell here-string usage.
  // We embed them as PS variables set before the script body so no inner escaping is needed.
  const safeWav  = wavOut.replace(/'/g, "''");
  const safeText = text.replace(/'/g, "''");
  const safeVoice = voice.replace(/'/g, "''");

  const script = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile('${safeWav}')
$synth.Rate = ${rate}
${voice ? `try { $synth.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::NotSet) } catch {}
# Try to select by name substring
foreach ($v in $synth.GetInstalledVoices()) {
  if ($v.VoiceInfo.Name -like '*${safeVoice}*') {
    $synth.SelectVoice($v.VoiceInfo.Name)
    break
  }
}` : '# use default voice'}
$synth.Speak('${safeText}')
$synth.SetOutputToDefaultAudioDevice()
$synth.Dispose()
Write-Output '{"ok":true}'
`;

  const r = runPs(script, 60_000);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed || !parsed.ok) {
    fail('TTS failed: ' + (r.stderr || r.stdout || '').trim().slice(0, 400));
  }

  if (!existsSync(wavOut)) fail('TTS produced no output file at: ' + wavOut);

  // Measure duration via ffprobe if available.
  let durationSec = null;
  if (FFPROBE) {
    const fp = spawnSync(FFPROBE, [
      '-v', 'quiet', '-print_format', 'json', '-show_format', wavOut
    ], { encoding: 'utf8', timeout: 10_000 });
    try {
      const meta = JSON.parse(fp.stdout);
      durationSec = parseFloat(meta.format.duration);
    } catch {}
  }

  out({ ok: true, path: wavOut, durationSec });
}

// ---------------------------------------------------------------------------
// Verb: info
// ---------------------------------------------------------------------------
if (verb === 'info') {
  const audioPath = get('path');
  if (!audioPath) fail('info requires --path <audio>');
  if (!existsSync(audioPath)) fail('file not found: ' + audioPath);
  if (!FFPROBE) fail('ffprobe not found; install ffmpeg or add it to PATH');

  const r = spawnSync(FFPROBE, [
    '-v', 'quiet', '-print_format', 'json',
    '-show_format', '-show_streams', audioPath
  ], { encoding: 'utf8', timeout: 15_000 });

  if (r.status !== 0) fail('ffprobe failed: ' + (r.stderr || r.stdout || '').trim().slice(0, 300));

  let meta;
  try { meta = JSON.parse(r.stdout); } catch { fail('ffprobe output was not valid JSON'); }

  out({
    ok: true,
    path: audioPath,
    format: {
      name:       meta.format.format_name,
      long_name:  meta.format.format_long_name,
      duration:   parseFloat(meta.format.duration) || null,
      size:       parseInt(meta.format.size, 10)   || null,
      bit_rate:   parseInt(meta.format.bit_rate, 10) || null,
    },
    streams: (meta.streams || []).map(s => ({
      index:       s.index,
      codec_type:  s.codec_type,
      codec_name:  s.codec_name,
      sample_rate: s.sample_rate || null,
      channels:    s.channels    || null,
      bit_rate:    s.bit_rate    || null,
      duration:    s.duration    || null,
    })),
  });
}

// ---------------------------------------------------------------------------
// Verb: convert
// ---------------------------------------------------------------------------
if (verb === 'convert') {
  const src = get('src');
  const dst = get('out');
  if (!src) fail('convert requires --src <file>');
  if (!dst) fail('convert requires --out <file>');
  if (!existsSync(src)) fail('source file not found: ' + src);
  if (!FFMPEG) fail('ffmpeg not found; install ffmpeg or add it to PATH');

  // Derive quality flags from output extension.
  const ext = path.extname(dst).toLowerCase();
  const extraFlags = {
    '.mp3': ['-codec:a', 'libmp3lame', '-qscale:a', '2'],
    '.m4a': ['-codec:a', 'aac', '-b:a', '192k'],
    '.ogg': ['-codec:a', 'libvorbis', '-qscale:a', '5'],
    '.wav': ['-codec:a', 'pcm_s16le'],
    '.flac': ['-codec:a', 'flac'],
  }[ext] || [];

  const r = spawnSync(FFMPEG, [
    '-y', '-i', src, ...extraFlags, dst
  ], { encoding: 'utf8', timeout: 120_000 });

  if (r.status !== 0) {
    // ffmpeg writes diagnostics to stderr; capture last few lines for the error message.
    const errText = (r.stderr || '').trim().split('\n').slice(-8).join('\n');
    fail('ffmpeg convert failed: ' + errText.slice(0, 500));
  }

  if (!existsSync(dst)) fail('ffmpeg ran but output file not found: ' + dst);

  // Confirm output with ffprobe if available.
  let durationSec = null;
  if (FFPROBE) {
    const fp = spawnSync(FFPROBE, ['-v', 'quiet', '-print_format', 'json', '-show_format', dst],
      { encoding: 'utf8', timeout: 10_000 });
    try { durationSec = parseFloat(JSON.parse(fp.stdout).format.duration); } catch {}
  }

  out({ ok: true, src, out: dst, durationSec });
}

// ---------------------------------------------------------------------------
// Verb: trim
// ---------------------------------------------------------------------------
if (verb === 'trim') {
  const src   = get('src');
  const dst   = get('out');
  const start = get('start');
  const dur   = get('dur');

  if (!src)   fail('trim requires --src <file>');
  if (!dst)   fail('trim requires --out <file>');
  if (!start) fail('trim requires --start <seconds>');
  if (!dur)   fail('trim requires --dur <seconds>');
  if (!existsSync(src)) fail('source file not found: ' + src);
  if (!FFMPEG) fail('ffmpeg not found; install ffmpeg or add it to PATH');

  const startSec = parseFloat(start);
  const durSec   = parseFloat(dur);
  if (isNaN(startSec) || startSec < 0) fail('--start must be a non-negative number');
  if (isNaN(durSec)   || durSec   <= 0) fail('--dur must be a positive number');

  const r = spawnSync(FFMPEG, [
    '-y',
    '-ss', String(startSec),
    '-i', src,
    '-t', String(durSec),
    '-codec', 'copy',
    dst,
  ], { encoding: 'utf8', timeout: 120_000 });

  if (r.status !== 0) {
    const errText = (r.stderr || '').trim().split('\n').slice(-8).join('\n');
    fail('ffmpeg trim failed: ' + errText.slice(0, 500));
  }

  if (!existsSync(dst)) fail('ffmpeg ran but output file not found: ' + dst);

  let durationSec = null;
  if (FFPROBE) {
    const fp = spawnSync(FFPROBE, ['-v', 'quiet', '-print_format', 'json', '-show_format', dst],
      { encoding: 'utf8', timeout: 10_000 });
    try { durationSec = parseFloat(JSON.parse(fp.stdout).format.duration); } catch {}
  }

  out({ ok: true, src, out: dst, startSec, requestedDurSec: durSec, actualDurationSec: durationSec });
}

// ---------------------------------------------------------------------------
// Verb: transcribe
// ---------------------------------------------------------------------------
if (verb === 'transcribe') {
  const audioPath = get('path');
  if (!audioPath) fail('transcribe requires --path <audio>');
  if (!existsSync(audioPath)) fail('file not found: ' + audioPath);

  // Detect whisper: try several known binary names in order.
  // Note: 'main' on Windows is a Control Panel applet, so require it to be outside system32.
  const whisperCandidates = ['whisper', 'whisper.cpp', 'faster-whisper'];
  let whisperBin = null;

  for (const name of whisperCandidates) {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which',
      [name], { encoding: 'utf8', timeout: 5_000 });
    if (r.status === 0 && r.stdout.trim()) {
      whisperBin = r.stdout.trim().split(/\r?\n/)[0].trim();
      break;
    }
  }

  // Check for whisper.cpp 'main' binary specifically outside system32.
  if (!whisperBin) {
    const r = spawnSync('where', ['main'], { encoding: 'utf8', timeout: 5_000 });
    if (r.status === 0 && r.stdout.trim()) {
      const candidates = r.stdout.trim().split(/\r?\n/).map(l => l.trim());
      const notSystem = candidates.find(p => !/system32/i.test(p));
      if (notSystem) whisperBin = notSystem;
    }
  }

  if (!whisperBin) {
    out({ ok: false, hint: 'whisper not installed — install openai/whisper, whisper.cpp, or faster-whisper and ensure it is on PATH' });
  }

  // Run whisper with output to stdout / stdout mode.
  const r = spawnSync(whisperBin, [audioPath, '--output_format', 'txt', '--output_dir', os.tmpdir()],
    { encoding: 'utf8', timeout: 300_000 });

  if (r.status !== 0) fail('whisper failed: ' + (r.stderr || r.stdout || '').trim().slice(0, 400));

  const text = (r.stdout || '').trim() || (r.stderr || '').trim();
  out({ ok: true, path: audioPath, whisperBin, transcript: text });
}

// ---------------------------------------------------------------------------
// Unknown verb
// ---------------------------------------------------------------------------
fail(`unknown verb "${verb || '(none)'}". Valid verbs: voices | say | info | convert | trim | transcribe`);
