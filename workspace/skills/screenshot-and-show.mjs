// screenshot-and-show skill — take a screenshot and return the path for display

import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureScreen } from '../tools/impl/capture-screen.mjs';

export const description = 'Take a screenshot of the screen and return path for display in chat';

export async function execute(args = '') {
  // OS temp dir so this works on macOS, Windows and Linux (the brain may run on any fleet machine).
  const shot = path.join(os.tmpdir(), `helm-screenshot-${Date.now()}.png`);

  const r = captureScreen(shot, { timeout: 10_000 });
  if (!r.ok) return `Screenshot failed: ${r.error}`;
  if (!existsSync(shot)) return 'Screenshot file not created.';

  // Return the path in a format that index.js can recognize and attach
  return `Screenshot ready: ${shot}`;
}
