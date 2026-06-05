#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const sIdx = args.indexOf('--seconds');
const MAX_SECONDS = 300;
let seconds = sIdx !== -1 ? parseInt(args[sIdx + 1], 10) : 30;
if (!Number.isFinite(seconds)) seconds = 30;
if (seconds > MAX_SECONDS) seconds = MAX_SECONDS;
if (seconds < 1) seconds = 1;

function which(bin) {
  const r = spawnSync('which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

const ts   = Date.now();
const dest = `/tmp/helm-mic-${ts}.wav`;

const sox    = which('sox');
const ffmpeg = which('ffmpeg');

if (!sox && !ffmpeg) {
  console.log(JSON.stringify({
    error: 'Neither sox nor ffmpeg is installed',
    hint: 'To install sox (recommended): brew install sox\nTo install ffmpeg: brew install ffmpeg\nDo not install without asking the owner first.'
  }));
  process.exit(0);
}

let result;
if (sox) {

  result = spawnSync('rec', ['-q', '-r', '16000', '-c', '1', dest, 'trim', '0', String(seconds)],
    { encoding: 'utf8', timeout: (seconds + 15) * 1000 });
} else {

  result = spawnSync(ffmpeg, [
    '-f', 'avfoundation',
    '-i', ':0',
    '-t', String(seconds),
    '-ar', '16000',
    '-ac', '1',
    '-y', dest
  ], { encoding: 'utf8', timeout: (seconds + 15) * 1000 });
}

if (result.status !== 0) {
  console.log(JSON.stringify({
    error: 'Recording failed',
    stderr: result.stderr?.slice(0, 500) ?? '',
    hint: 'Ensure Microphone permission is granted to Terminal.app in System Preferences > Privacy > Microphone.'
  }));
  process.exit(1);
}

console.log(JSON.stringify({ path: dest, seconds }));
