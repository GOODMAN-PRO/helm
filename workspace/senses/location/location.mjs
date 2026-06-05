#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function which(bin) {
  const r = spawnSync('which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

const cliBin = which('CoreLocationCLI');

if (!cliBin) {
  console.log(JSON.stringify({
    installed: false,
    hint: 'CoreLocationCLI is not installed. To install (free, open source):\n  brew install corlocationcli\nDo not run this automatically — ask the owner first.'
  }));
  process.exit(0);
}


const r = spawnSync(cliBin, ['-json', '-once'], { encoding: 'utf8', timeout: 15000 });
if (r.status !== 0 || !r.stdout.trim()) {
  console.log(JSON.stringify({
    error: 'CoreLocationCLI failed',
    stderr: r.stderr?.trim() ?? '',
    hint: 'Ensure Location Services are enabled in System Preferences > Privacy > Location Services.'
  }));
  process.exit(1);
}

try {
  const data = JSON.parse(r.stdout.trim());
  console.log(JSON.stringify({
    lat:      data.latitude,
    lon:      data.longitude,
    accuracy: data.accuracy,
    ts:       Date.now()
  }));
} catch {
  console.log(JSON.stringify({ error: 'Failed to parse CoreLocationCLI output', raw: r.stdout }));
  process.exit(1);
}
