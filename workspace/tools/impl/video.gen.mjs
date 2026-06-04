#!/usr/bin/env node
// video.gen — text-to-video for Helm (no paid API).
// Expands a prompt into N scene descriptions via claude, generates one image per scene via
// image.generate (pollinations.ai), assembles with ffmpeg: varied Ken Burns motion (pans + zooms)
// joined by varied crossfades, optional burned-in captions, optional background music, and optional
// per-scene narration via Windows SAPI.
//
// Usage:
//   node video.gen.mjs --prompt "a space explorer story" [--scenes 4] [--secs 3]
//                      [--out <path.mp4>] [--narrate true] [--captions true] [--music <file>]
//                      [--aspect landscape|portrait|square|wide|story] [--res 720|1080]
//                      [--size 1280x720]   (explicit --size overrides --aspect/--res)
//
// Output: single JSON object  { ok, path, scenes, durationSec, size, fps, ... }
//
// Dependencies (zero npm installs):
//   ffmpeg / ffprobe   — on PATH or at FFMPEG_BIN env / hard-coded WinGet path
//   image.generate.mjs — pollinations.ai, free, no key
//   claude CLI         — scene expansion + narration lines
//   Windows SAPI       — PowerShell System.Speech (narration only, Windows-only)

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── helpers ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get  = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
const bool = k => { const v = get(k); return v !== null && /^(true|1|yes|on)$/i.test(v); };
const die  = (msg, code = 1) => { console.log(JSON.stringify({ ok: false, error: msg })); process.exit(code); };

// ── parameters ───────────────────────────────────────────────────────────────

const prompt = get('prompt');
if (!prompt) die('--prompt required');

const scenes  = Math.max(1, Math.min(20, parseInt(get('scenes') || '4', 10)));
const secs    = Math.max(1, Math.min(30, parseFloat(get('secs') || '3')));
const narrate = bool('narrate');
const captions = bool('captions');
const musicArg = get('music');

// Size: explicit --size wins; otherwise --aspect + --res presets (default landscape 720p = back-compat 1280x720).
const ASPECTS = {
  landscape: [16, 9], wide: [21, 9], square: [1, 1],
  portrait: [9, 16], story: [9, 16], vertical: [9, 16],
};
function resolveSize() {
  const sizeArg = get('size');
  if (sizeArg) {
    const [w, h] = sizeArg.split('x').map(n => parseInt(n, 10) || 0);
    if (!w || !h) die('--size must be WxH (e.g. 1280x720)');
    return [w, h];
  }
  const aspect = (get('aspect') || 'landscape').toLowerCase();
  const ratio = ASPECTS[aspect] || ASPECTS.landscape;
  const res = parseInt(get('res') || '720', 10) || 720;        // short-side target
  const portrait = ratio[1] > ratio[0];
  let w, h;
  if (portrait) { h = Math.round(res * ratio[1] / ratio[0] / 2) * 2; w = res; }
  else { w = Math.round(res * ratio[0] / ratio[1] / 2) * 2; h = res; }
  // Keep within sane bounds and even-dimensioned (H.264 yuv420p requirement).
  w = Math.min(2560, Math.max(64, w - (w % 2)));
  h = Math.min(2560, Math.max(64, h - (h % 2)));
  return [w, h];
}
const [vidW, vidH] = resolveSize();

const outPath = get('out') || path.join(tmpdir(), `helm-video-${Date.now()}.mp4`);

// ── ffmpeg resolution ─────────────────────────────────────────────────────────

const WINGET_FFMPEG = 'C:/Users/User/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe';
const WINGET_FFPROBE = 'C:/Users/User/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffprobe.exe';

function resolveBin(name) {
  const r = spawnSync(name, ['-version'], { encoding: 'utf8', timeout: 5000 });
  if (r.status === 0) return name;
  const fallback = name === 'ffmpeg' ? WINGET_FFMPEG : WINGET_FFPROBE;
  if (existsSync(fallback)) return fallback;
  return null;
}

const FFMPEG  = resolveBin('ffmpeg');
const FFPROBE = resolveBin('ffprobe');
if (!FFMPEG)  die('ffmpeg not found — install it or ensure the WinGet path exists');
if (!FFPROBE) die('ffprobe not found — install it or ensure the WinGet path exists');

// ── claude CLI ────────────────────────────────────────────────────────────────

const CLAUDE_BIN = 'C:/Users/User/.local/bin/claude.exe';
const claudeBin  = existsSync(CLAUDE_BIN) ? CLAUDE_BIN : 'claude';

function runClaude(userPrompt, timeoutMs = 60_000) {
  const r = spawnSync(claudeBin, ['-p', userPrompt], { encoding: 'utf8', timeout: timeoutMs });
  if (r.error) throw new Error(`claude spawn failed: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`claude exited ${r.status}: ${(r.stderr || '').slice(0, 300)}`);
  return (r.stdout || '').trim();
}

// ── image.generate path ───────────────────────────────────────────────────────

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_GEN_MJS = path.join(__dirname, 'image.generate.mjs');
if (!existsSync(IMAGE_GEN_MJS)) die('image.generate.mjs not found at ' + IMAGE_GEN_MJS);

// ── temp workspace ────────────────────────────────────────────────────────────

const tmpDir = mkdtempSync(path.join(tmpdir(), 'helm-vid-'));
const tmpFile = name => path.join(tmpDir, name);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── step 1: expand prompt into per-scene image prompts ────────────────────────

let scenePrompts = [];
try {
  const expansion = `You are a creative director. Given this story/scene prompt, expand it into exactly ${scenes} vivid, self-contained image generation prompts (one per scene), in chronological story order. Return ONLY a JSON array of strings, no markdown, no explanation. Example for 2 scenes: ["A lone astronaut steps onto a crimson Mars surface, dust swirling, Earth visible in sky, cinematic lighting", "The astronaut plants a flag, golden sunset, wide angle, photorealistic"]. Prompt: ${prompt}`;
  const raw = runClaude(expansion, 90_000);
  const match = raw.match(/\[[\s\S]*\]/);
  if (match) {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed) && parsed.length > 0) scenePrompts = parsed.slice(0, scenes).map(String);
  }
} catch (_e) { /* fall through to padded prompts */ }
while (scenePrompts.length < scenes) scenePrompts.push(`${prompt} — scene ${scenePrompts.length + 1}`);

// ── step 2: generate one image per scene ─────────────────────────────────────

const frameFiles = [];
const SCENE_COLOURS = ['0x1a3a5c', '0x2d5a27', '0x5c1a1a', '0x1a4a5c', '0x3d2d5c', '0x5c3d1a'];

function generatePlaceholderFrame(i) {
  const framePath = tmpFile(`frame-${i}.jpg`);
  const colour = SCENE_COLOURS[i % SCENE_COLOURS.length];
  const pr = spawnSync(FFMPEG, [
    '-f', 'lavfi', '-i', `color=c=${colour}:s=${vidW}x${vidH}:d=1`,
    '-vframes', '1', '-y', framePath,
  ], { encoding: 'utf8', timeout: 15_000 });
  if (pr.status !== 0 || !existsSync(framePath)) {
    die(`placeholder frame generation failed for scene ${i + 1}: ${(pr.stderr || '').slice(0, 200)}`);
  }
  return framePath;
}

async function generateFrame(i) {
  const framePath = tmpFile(`frame-${i}.jpg`);
  // The hardened image.generate already retries with backoff + validates bytes.
  const r = spawnSync(process.execPath, [
    IMAGE_GEN_MJS,
    '--prompt', scenePrompts[i],
    '--out',    framePath,
    '--width',  String(vidW),
    '--height', String(vidH),
    '--retries', '4',
    '--enhance', 'true',
  ], { encoding: 'utf8', timeout: 300_000 });
  if (r.status === 0 && existsSync(framePath)) return framePath;
  process.stderr.write(`[video.gen] scene ${i + 1}: image gen failed, using placeholder — ${(r.stderr || r.stdout || '').slice(0, 200)}\n`);
  return generatePlaceholderFrame(i);
}

for (let i = 0; i < scenes; i++) {
  if (i > 0) await sleep(2500);  // be polite to the free image service (1 concurrent / IP)
  frameFiles.push(await generateFrame(i));
}

// ── step 3: assemble video with ffmpeg ────────────────────────────────────────

const FPS    = 30;
const XF_DUR = Math.min(0.6, secs * 0.4);                       // crossfade length (≤ ~half of secs)
const totalDur = scenes * secs - (scenes - 1) * XF_DUR;
const N = Math.ceil(secs * FPS);                               // frames per scene

// Varied Ken Burns motion presets (zoom + pan combos) for visual variety across scenes.
const zIn  = `1.0+0.12*on/${N}`;   // zoom 1.00 → 1.12
const zOut = `1.12-0.12*on/${N}`;  // zoom 1.12 → 1.00
const cX = `iw/2-(iw/zoom/2)`, cY = `ih/2-(ih/zoom/2)`;
const panR = `(iw-iw/zoom)*on/${N}`, panL = `(iw-iw/zoom)*(1-on/${N})`;
const panD = `(ih-ih/zoom)*on/${N}`, panU = `(ih-ih/zoom)*(1-on/${N})`;
const MOTIONS = [
  { z: zIn,  x: cX,   y: cY   },
  { z: zOut, x: cX,   y: cY   },
  { z: zIn,  x: panR, y: cY   },
  { z: zIn,  x: panL, y: cY   },
  { z: zIn,  x: cX,   y: panD },
  { z: zOut, x: cX,   y: panU },
  { z: zIn,  x: panR, y: panD },
  { z: zOut, x: panL, y: panU },
];
function kbFilter(i) {
  const m = MOTIONS[i % MOTIONS.length];
  // Scale up 2x so zoompan has room to crop; output exactly N frames at target size.
  return `[${i}:v]scale=${vidW * 2}:${vidH * 2},zoompan=zoom='${m.z}':x='${m.x}':y='${m.y}':d=${N}:s=${vidW}x${vidH}:fps=${FPS},trim=end_frame=${N},setpts=PTS-STARTPTS[v${i}]`;
}

// Varied crossfade transitions, cycled per cut.
const TRANSITIONS = ['fade', 'dissolve', 'smoothleft', 'smoothright', 'smoothup',
  'circleopen', 'wipeleft', 'slideup', 'fadeblack', 'radial', 'diagtl', 'pixelize'];

const inputArgs = [];
for (const f of frameFiles) inputArgs.push('-loop', '1', '-t', String(secs + 5), '-i', f);

const filterParts = [];
for (let i = 0; i < scenes; i++) filterParts.push(kbFilter(i));

let lastLabel = '[v0]';
for (let i = 1; i < scenes; i++) {
  const offset = (secs - XF_DUR) * i;
  const outLabel = i === scenes - 1 ? '[vout]' : `[x${i}]`;
  const tr = TRANSITIONS[(i - 1) % TRANSITIONS.length];
  filterParts.push(`${lastLabel}[v${i}]xfade=transition=${tr}:duration=${XF_DUR}:offset=${offset.toFixed(3)}${outLabel}`);
  lastLabel = outLabel;
}

let filterComplex = scenes === 1 ? filterParts[0].replace(/\[v0\]$/, '[vout]') : filterParts.join(';');

// Optional burned-in captions (one short line per scene, shown during that scene's window).
let mapVideo = '[vout]';
let captionCwd;
if (captions) {
  const FONTS = ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/calibri.ttf'];
  const font = FONTS.find(existsSync);
  if (!font) die('--captions needs a TTF font; none found in C:/Windows/Fonts');
  // ffmpeg's filtergraph parser can't handle a Windows drive-colon in fontfile/textfile, so copy the
  // font into the temp dir and reference the font + caption files by RELATIVE basename, with ffmpeg's
  // working directory set to tmpDir (captionCwd). No colons → no escaping headaches.
  copyFileSync(font, tmpFile('font.ttf'));
  captionCwd = tmpDir;
  const fpx = Math.max(20, Math.round(vidH * 0.045));
  const pad = Math.round(vidH * 0.06);
  const caption = s => {
    s = String(s).replace(/\s+/g, ' ').trim();
    const firstSent = (s.split(/(?<=[.!?])\s/)[0] || s);
    return firstSent.length > 72 ? firstSent.slice(0, 70).replace(/\s+\S*$/, '') + '...' : firstSent;
  };
  let prev = '[vout]';
  const capParts = [];
  for (let i = 0; i < scenes; i++) {
    writeFileSync(tmpFile(`cap-${i}.txt`), caption(scenePrompts[i]), 'utf8');
    const a = (secs - XF_DUR) * i;
    const b = Math.min(a + secs, totalDur);
    const out = i === scenes - 1 ? '[vcap]' : `[c${i}]`;
    capParts.push(`${prev}drawtext=fontfile=font.ttf:textfile=cap-${i}.txt:fontcolor=white:fontsize=${fpx}:line_spacing=6:box=1:boxcolor=black@0.5:boxborderw=20:x=(w-text_w)/2:y=h-text_h-${pad}:enable=between(t\\,${a.toFixed(3)}\\,${b.toFixed(3)})${out}`);
    prev = out;
  }
  filterComplex += ';' + capParts.join(';');
  mapVideo = '[vcap]';
}

const hasAudio = narrate || !!musicArg;
const videoOutPath = hasAudio ? tmpFile('video-only.mp4') : outPath;

const ffmpegVideoArgs = [
  ...inputArgs,
  '-filter_complex', filterComplex,
  '-map', mapVideo,
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '21',
  '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-movflags', '+faststart',
  '-t', String(totalDur),
  '-y', videoOutPath,
];
const vr = spawnSync(FFMPEG, ffmpegVideoArgs, { encoding: 'utf8', timeout: 600_000, cwd: captionCwd });
if (vr.status !== 0) die(`ffmpeg video assembly failed (exit ${vr.status}):\n${(vr.stderr || '').slice(-900)}`);

// ── step 4: optional audio (narration + music) ────────────────────────────────

if (hasAudio) {
  let narrWav = null;
  if (narrate) {
    if (process.platform !== 'win32') die('--narrate true requires Windows (SAPI). Run on Windows or omit --narrate.');
    let lines = [];
    try {
      const nrPrompt = `Write exactly ${scenes} short narration sentences (one per line, no numbering, no extra text) for a video with these scene descriptions:\n${scenePrompts.map((p, i) => `Scene ${i + 1}: ${p}`).join('\n')}\nEach sentence should be 10-20 words, evocative, present tense.`;
      lines = runClaude(nrPrompt, 60_000).split('\n').map(l => l.trim()).filter(Boolean).slice(0, scenes);
    } catch (_e) { /* fall back to scene prompts */ }
    while (lines.length < scenes) lines.push(scenePrompts[lines.length] || `Scene ${lines.length + 1}.`);

    const wavFiles = [];
    for (let i = 0; i < scenes; i++) {
      const wavPath = tmpFile(`narr-${i}.wav`).replace(/\\/g, '/');
      const text = lines[i].replace(/'/g, "''");
      const psScript = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile('${wavPath}')
$synth.Speak('${text}')
$synth.SetOutputToDefaultAudioDevice()
`;
      const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
      const pr = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8', timeout: 30_000 });
      if (pr.status !== 0 || !existsSync(wavPath)) die(`SAPI synthesis failed for scene ${i + 1}: ${(pr.stderr || pr.stdout || '').slice(0, 300)}`);
      wavFiles.push(wavPath);
    }
    const listPath = tmpFile('wavlist.txt');
    writeFileSync(listPath, wavFiles.map(f => `file '${f.replace(/'/g, "\\'")}'`).join('\n'));
    narrWav = tmpFile('narr-all.wav');
    const cr = spawnSync(FFMPEG, ['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-y', narrWav], { encoding: 'utf8', timeout: 60_000 });
    if (cr.status !== 0 || !existsSync(narrWav)) die(`WAV concat failed: ${(cr.stderr || '').slice(0, 300)}`);
  }

  let music = null;
  if (musicArg) {
    music = path.resolve(musicArg);
    if (!existsSync(music)) die(`--music file not found: ${music}`);
  }

  // Assemble the mux: [0:v] from the rendered video + audio from narration and/or looped music.
  const muxIn = ['-i', videoOutPath];
  let narrIdx = -1, musicIdx = -1, idx = 1;
  if (narrWav) { narrIdx = idx++; muxIn.push('-i', narrWav); }
  if (music)   { musicIdx = idx++; muxIn.push('-stream_loop', '-1', '-i', music); }

  let audioFilter = null, mapAudio = `${narrWav ? narrIdx : musicIdx}:a`;
  if (narrWav && music) {
    audioFilter = `[${narrIdx}:a]apad=whole_dur=${totalDur}[na];[${musicIdx}:a]volume=0.14,atrim=0:${totalDur}[ma];[na][ma]amix=inputs=2:duration=first:normalize=0[aout]`;
    mapAudio = '[aout]';
  } else if (music) {
    audioFilter = `[${musicIdx}:a]volume=0.20,atrim=0:${totalDur}[aout]`;
    mapAudio = '[aout]';
  }

  const muxArgs = [...muxIn];
  if (audioFilter) muxArgs.push('-filter_complex', audioFilter);
  muxArgs.push('-map', '0:v', '-map', mapAudio,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-t', String(totalDur), '-movflags', '+faststart', '-y', outPath);
  const mr = spawnSync(FFMPEG, muxArgs, { encoding: 'utf8', timeout: 180_000 });
  if (mr.status !== 0) die(`audio mux failed: ${(mr.stderr || '').slice(-500)}`);
}

// ── verify + return ─────────────────────────────────────────────────────────

if (!existsSync(outPath)) die('output file was not created — ffmpeg may have silently failed');
const outStat = statSync(outPath);
if (outStat.size < 1024) die(`output file is suspiciously small (${outStat.size} bytes)`);

console.log(JSON.stringify({
  ok: true,
  path: outPath,
  scenes,
  durationSec: Math.round(totalDur * 10) / 10,
  size: `${vidW}x${vidH}`,
  fps: FPS,
  captions,
  narrated: narrate,
  music: !!musicArg,
  bytes: outStat.size,
  ffmpeg: FFMPEG,
}));
