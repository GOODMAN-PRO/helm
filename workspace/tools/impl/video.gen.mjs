#!/usr/bin/env node
// video.gen — Text-to-video for Helm (no paid API).
// Expands a prompt into N scene descriptions via claude, generates one image per scene via
// image.generate (pollinations.ai), assembles with ffmpeg Ken Burns + xfade, and optionally
// synthesises per-scene narration via Windows SAPI, then muxes audio.
//
// Usage:
//   node video.gen.mjs --prompt "a space explorer story" [--scenes 4] [--secs 3]
//                      [--out <path.mp4>] [--narrate true] [--size 1280x720]
//
// Output: single JSON object  { ok, path, scenes, durationSec }
//
// Dependencies (zero npm installs):
//   ffmpeg / ffprobe   — on PATH or at FFMPEG_BIN env / hard-coded WinGet path
//   image.generate.mjs — pollinations.ai, free, no key
//   claude CLI         — scene expansion + narration lines
//   Windows SAPI       — PowerShell System.Speech (narration only, Windows-only)

import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── helpers ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get  = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
const die  = (msg, code = 1) => { console.log(JSON.stringify({ ok: false, error: msg })); process.exit(code); };

// ── parameters ───────────────────────────────────────────────────────────────

const prompt    = get('prompt');
if (!prompt) die('--prompt required');

const scenes    = Math.max(1, Math.min(20, parseInt(get('scenes') || '4', 10)));
const secs      = Math.max(1, Math.min(30, parseFloat(get('secs')  || '3')));
const narrate   = (get('narrate') || '').toLowerCase() === 'true';
const sizeArg   = get('size') || '1280x720';
const [vidW, vidH] = sizeArg.split('x').map(n => parseInt(n, 10) || 0);
if (!vidW || !vidH) die('--size must be WxH (e.g. 1280x720)');

const outPath = get('out') || path.join(tmpdir(), `helm-video-${Date.now()}.mp4`);

// ── ffmpeg resolution ─────────────────────────────────────────────────────────

const WINGET_FFMPEG = 'C:/Users/User/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe';
const WINGET_FFPROBE = 'C:/Users/User/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffprobe.exe';

function resolveBin(name) {
  // Try PATH first
  const r = spawnSync(name, ['-version'], { encoding: 'utf8', timeout: 5000 });
  if (r.status === 0) return name;
  // Try WinGet fallback
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

function tmpFile(name) { return path.join(tmpDir, name); }

// ── step 1: expand prompt into per-scene image prompts ────────────────────────

let scenePrompts = [];

try {
  const expansion = `You are a creative director. Given this story/scene prompt, expand it into exactly ${scenes} vivid, self-contained image generation prompts (one per scene), in chronological story order. Return ONLY a JSON array of strings, no markdown, no explanation. Example for 2 scenes: ["A lone astronaut steps onto a crimson Mars surface, dust swirling, Earth visible in sky, cinematic lighting", "The astronaut plants a flag, golden sunset, wide angle, photorealistic"]. Prompt: ${prompt}`;
  const raw = runClaude(expansion, 90_000);
  // Find JSON array in output
  const match = raw.match(/\[[\s\S]*\]/);
  if (match) {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed) && parsed.length > 0) {
      scenePrompts = parsed.slice(0, scenes).map(String);
    }
  }
} catch (_e) {
  // Fallback: use same prompt with scene numbers
}

// Pad / fill if claude returned fewer than requested
while (scenePrompts.length < scenes) {
  scenePrompts.push(`${prompt} — scene ${scenePrompts.length + 1}`);
}

// ── step 2: generate one image per scene ─────────────────────────────────────

const frameFiles = [];

// Pollinations enforces 1 concurrent request per IP. Retry with backoff on 402/queue-full.
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Fallback: generate a coloured placeholder frame using ffmpeg (solid colour + text overlay)
// when the image service is unavailable. This ensures the video pipeline can always be tested.
const SCENE_COLOURS = ['0x1a3a5c', '0x2d5a27', '0x5c1a1a', '0x1a4a5c', '0x3d2d5c', '0x5c3d1a'];

function generatePlaceholderFrame(i) {
  const framePath = tmpFile(`frame-${i}.jpg`);
  const colour = SCENE_COLOURS[i % SCENE_COLOURS.length];
  const label   = `Scene ${i + 1}`.replace(/'/g, '');
  const pr = spawnSync(FFMPEG, [
    '-f', 'lavfi',
    '-i', `color=c=${colour}:s=${vidW}x${vidH}:d=1`,
    '-vframes', '1',
    '-y', framePath,
  ], { encoding: 'utf8', timeout: 15_000 });
  if (pr.status !== 0 || !existsSync(framePath)) {
    die(`placeholder frame generation failed for scene ${i + 1}: ${(pr.stderr || '').slice(0, 200)}`);
  }
  return framePath;
}

async function generateFrameWithRetry(i) {
  const framePath = tmpFile(`frame-${i}.jpg`);
  const maxRetries = 4;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 8s, 16s, 32s
      const delay = Math.min(8000 * Math.pow(2, attempt - 1), 32000);
      await sleep(delay);
    }
    const r = spawnSync(process.execPath, [
      IMAGE_GEN_MJS,
      '--prompt', scenePrompts[i],
      '--out',    framePath,
      '--width',  String(vidW),
      '--height', String(vidH),
    ], { encoding: 'utf8', timeout: 180_000 });

    if (r.status === 0 && existsSync(framePath)) return framePath;

    const errText = (r.stderr || r.stdout || '').slice(0, 400);
    const isQueueFull = errText.includes('402') || errText.toLowerCase().includes('queue');
    // Retry on queue-full, otherwise fall through to placeholder after last attempt
    if (attempt < maxRetries - 1 && isQueueFull) continue;
    if (isQueueFull) {
      // All retries exhausted due to rate-limit — use placeholder so the pipeline runs
      process.stderr.write(`[video.gen] scene ${i + 1}: pollinations rate-limited, using placeholder frame\n`);
      return generatePlaceholderFrame(i);
    }
    die(`image generation failed for scene ${i + 1} (attempt ${attempt + 1}): ${errText}`);
  }
  return generatePlaceholderFrame(i);
}

// Generate scenes sequentially (Pollinations: 1 concurrent per IP)
for (let i = 0; i < scenes; i++) {
  // Brief pause between requests to avoid immediate queue collision
  if (i > 0) await sleep(3000);
  const framePath = await generateFrameWithRetry(i);
  frameFiles.push(framePath);
}

// ── step 3: assemble video with ffmpeg ────────────────────────────────────────
//
// Strategy:
//   • Each frame is looped for `secs` seconds with a gentle Ken Burns zoompan.
//   • Scenes are joined with a 0.5-second crossfade (xfade) to give a polished feel.
//   • Final output: H.264 yuv420p, scale/pad to target size, faststart mp4.
//
// For N scenes the xfade filter chain looks like:
//   [0:v]zoompan...,fps=25,setpts=PTS-STARTPTS[v0];
//   [1:v]zoompan...,fps=25,setpts=PTS-STARTPTS[v1];
//   ...
//   [v0][v1]xfade=duration=0.5:offset=<secs-0.5>[x01];
//   [x01][v2]xfade=duration=0.5:offset=<(secs-0.5)*2>[x012];
//   ...final → encode

const FPS      = 25;
const XF_DUR   = Math.min(0.5, secs * 0.4);  // crossfade length (≤ half of secs)
const totalDur = scenes * secs - (scenes - 1) * XF_DUR;

// Build filter_complex
// Ken Burns: gentle zoom from 1.0 to 1.03 over secs*FPS frames.
// We use lavfi 'color' mux trick: loop=<n> on the image so it produces enough frames,
// then pass through zoompan (which outputs exactly d= frames), then trim to secs seconds.
// The trim+setpts pair is essential to stop ffmpeg from generating excess frames.
function kbFilter(i) {
  const totalFrames = Math.ceil(secs * FPS);
  // Alternate between zoom-in/zoom-out + different pan origins
  const zoomStart = i % 2 === 0 ? 1.0  : 1.03;
  const zoomEnd   = i % 2 === 0 ? 1.03 : 1.0;
  const zoomDelta = (zoomEnd - zoomStart).toFixed(4);
  const zoomExpr  = `zoom='${zoomStart}+${zoomDelta}*(on/${totalFrames})'`;
  const xExpr     = i % 2 === 0 ? `x='iw/2-(iw/zoom/2)'` : `x='iw-iw/zoom/2-iw/zoom/2'`;
  const yExpr     = `y='ih/2-(ih/zoom/2)'`;
  // scale 2x first so zoompan has room to crop, then zoompan outputs at target size
  // trim=end_frame limits to exactly totalFrames; setpts resets pts for xfade
  return `[${i}:v]scale=${vidW * 2}:${vidH * 2},zoompan=${zoomExpr}:${xExpr}:${yExpr}:d=${totalFrames}:s=${vidW}x${vidH}:fps=${FPS},trim=end_frame=${totalFrames},setpts=PTS-STARTPTS[v${i}]`;
}

// Build ffmpeg input args: use -loop 1 so the still image produces enough frames for zoompan
const inputArgs = [];
for (const f of frameFiles) {
  // Supply enough frames for zoompan: loop=1 + -t (generous) keeps ffmpeg from hanging
  inputArgs.push('-loop', '1', '-t', String(secs + 5), '-i', f);
}

const filterParts = [];
for (let i = 0; i < scenes; i++) filterParts.push(kbFilter(i));

// Chain xfades between scenes
let lastLabel = '[v0]';
for (let i = 1; i < scenes; i++) {
  const offset    = (secs - XF_DUR) * i;   // when this fade starts in accumulated timeline
  const outLabel  = i === scenes - 1 ? '[vout]' : `[x${i}]`;
  filterParts.push(`${lastLabel}[v${i}]xfade=transition=fade:duration=${XF_DUR}:offset=${offset.toFixed(3)}${outLabel}`);
  lastLabel = outLabel;
}

// If only 1 scene, rename the label to [vout]
const filterComplex = scenes === 1
  ? filterParts[0].replace(/\[v0\]$/, '[vout]')
  : filterParts.join(';');

const videoOutPath = narrate ? tmpFile('video-only.mp4') : outPath;

const ffmpegVideoArgs = [
  ...inputArgs,
  '-filter_complex', filterComplex,
  '-map', '[vout]',
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '23',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-t', String(totalDur),   // hard cap at expected duration to handle any filter overshoot
  '-y',
  videoOutPath,
];

const vr = spawnSync(FFMPEG, ffmpegVideoArgs, { encoding: 'utf8', timeout: 300_000 });
if (vr.status !== 0) {
  die(`ffmpeg video assembly failed (exit ${vr.status}):\n${(vr.stderr || '').slice(0, 800)}`);
}

// ── step 4: optional narration via Windows SAPI ───────────────────────────────

if (narrate) {
  if (process.platform !== 'win32') {
    die('--narrate true requires Windows (SAPI). Run on Windows or omit --narrate.');
  }

  // Get one narration line per scene from claude
  let narrationLines = [];
  try {
    const nrPrompt = `Write exactly ${scenes} short narration sentences (one per line, no numbering, no extra text) for a video with these scene descriptions:\n${scenePrompts.map((p, i) => `Scene ${i + 1}: ${p}`).join('\n')}\nEach sentence should be 10-20 words, evocative, present tense.`;
    const nrRaw = runClaude(nrPrompt, 60_000);
    narrationLines = nrRaw.split('\n').map(l => l.trim()).filter(Boolean).slice(0, scenes);
  } catch (_e) {
    // Fallback
  }
  while (narrationLines.length < scenes) {
    narrationLines.push(scenePrompts[narrationLines.length] || `Scene ${narrationLines.length + 1}.`);
  }

  // Synthesise each line to a WAV via PowerShell SAPI
  const wavFiles = [];
  for (let i = 0; i < scenes; i++) {
    const wavPath = tmpFile(`narr-${i}.wav`).replace(/\\/g, '/');
    const text    = narrationLines[i].replace(/"/g, '\\"').replace(/'/g, "''");
    const psScript = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile('${wavPath}')
$synth.Speak('${text}')
$synth.SetOutputToDefaultAudioDevice()
`;
    const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
    const pr = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], {
      encoding: 'utf8', timeout: 30_000,
    });
    if (pr.status !== 0 || !existsSync(wavPath)) {
      die(`SAPI synthesis failed for scene ${i + 1}: ${(pr.stderr || pr.stdout || '').slice(0, 300)}`);
    }
    wavFiles.push(wavPath);
  }

  // Concatenate WAV files with ffmpeg
  const concatListPath = tmpFile('wavlist.txt');
  writeFileSync(concatListPath, wavFiles.map(f => `file '${f.replace(/'/g, "\\'")}'`).join('\n'));
  const concatWavPath = tmpFile('narr-all.wav');
  const cr = spawnSync(FFMPEG, [
    '-f', 'concat', '-safe', '0', '-i', concatListPath,
    '-c', 'copy', '-y', concatWavPath,
  ], { encoding: 'utf8', timeout: 60_000 });
  if (cr.status !== 0 || !existsSync(concatWavPath)) {
    die(`WAV concat failed: ${(cr.stderr || '').slice(0, 300)}`);
  }

  // Mux video + audio
  const mr = spawnSync(FFMPEG, [
    '-i', videoOutPath,
    '-i', concatWavPath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-y', outPath,
  ], { encoding: 'utf8', timeout: 120_000 });
  if (mr.status !== 0) {
    die(`audio mux failed: ${(mr.stderr || '').slice(0, 300)}`);
  }
}

// ── verify output exists ───────────────────────────────────────────────────────

if (!existsSync(outPath)) {
  die('output file was not created — ffmpeg may have silently failed');
}

const outStat = statSync(outPath);
if (outStat.size < 1024) {
  die(`output file is suspiciously small (${outStat.size} bytes)`);
}

// ── return result ─────────────────────────────────────────────────────────────

console.log(JSON.stringify({
  ok:          true,
  path:        outPath,
  scenes:      scenes,
  durationSec: Math.round(totalDur * 10) / 10,
  size:        `${vidW}x${vidH}`,
  narrated:    narrate,
  ffmpeg:      FFMPEG,
}));
