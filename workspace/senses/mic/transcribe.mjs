#!/usr/bin/env node
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
