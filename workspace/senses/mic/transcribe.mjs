#!/usr/bin/env node
// Transcribe a WAV file using whisper.cpp.
// On-demand only. If whisper.cpp is not installed, returns { error, hint }.
//
// Usage: node transcribe.mjs --file /tmp/helm-mic-<ts>.wav [--model base.en]
// Returns JSON: { text: "..." } or { error, hint }

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const fileIdx = args.indexOf('--file');
if (fileIdx === -1) {
  console.log(JSON.stringify({ error: 'Usage: transcribe.mjs --file <path.wav>' }));
  process.exit(1);
}
const filePath = args[fileIdx + 1];

function which(bin) {
  const r = spawnSync('which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

// whisper.cpp installs its main binary as 'whisper-cpp' or 'whisper' or 'main' (brew formula)
const whisperBin = which('whisper-cpp') || which('whisper') || which('main');

if (!whisperBin) {
  console.log(JSON.stringify({
    error: 'whisper.cpp is not installed',
    hint: [
      'To install whisper.cpp:',
      '  brew install whisper-cpp',
      'Or build from source:',
      '  git clone https://github.com/ggerganov/whisper.cpp && cd whisper.cpp && make',
      '  # Download a model: bash ./models/download-ggml-model.sh base.en',
      'Do not install without asking the owner first.'
    ].join('\n')
  }));
  process.exit(0);
}

if (!existsSync(filePath)) {
  console.log(JSON.stringify({ error: `File not found: ${filePath}` }));
  process.exit(1);
}

// whisper-cpp -f <file> -m <model> -nt (no timestamps) -l en
// Model path: brew puts models in /usr/local/share/whisper-cpp/models/ or similar.
// Try to auto-locate model; fall back to 'base.en' and let whisper fail with a helpful message.
const modelArg = args.indexOf('--model') !== -1 ? args[args.indexOf('--model') + 1] : 'base.en';

const r = spawnSync(whisperBin, ['-f', filePath, '-m', modelArg, '-nt', '-l', 'en'],
  { encoding: 'utf8', timeout: 120000 });

if (r.status !== 0) {
  console.log(JSON.stringify({
    error: 'whisper.cpp failed',
    stderr: r.stderr?.slice(0, 500) ?? '',
    hint: 'Ensure a model is downloaded. With brew: whisper-cpp --download-model base.en'
  }));
  process.exit(1);
}

const text = r.stdout.trim();
console.log(JSON.stringify({ text }));
