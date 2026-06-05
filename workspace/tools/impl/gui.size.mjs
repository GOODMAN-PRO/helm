#!/usr/bin/env node
import { screenBounds } from './win-input.mjs';

if (process.platform === 'darwin') {
  const { spawnSync } = await import('node:child_process');

  const r = spawnSync('osascript', ['-e', 'tell application "Finder" to get bounds of window of desktop'], { encoding: 'utf8' });
  const m = (r.stdout || '').match(/(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)/);
  if (m) { console.log(JSON.stringify({ ok: true, left: +m[1], top: +m[2], width: +m[3] - +m[1], height: +m[4] - +m[2] })); process.exit(0); }
  console.error('could not read screen size'); process.exit(1);
}
if (process.platform !== 'win32') { console.error('gui.size not supported on ' + process.platform); process.exit(1); }

const b = screenBounds();
if (!b.ok) { console.error(b.error); process.exit(1); }
console.log(JSON.stringify({ ok: true, width: b.width, height: b.height, left: b.left, top: b.top }));
