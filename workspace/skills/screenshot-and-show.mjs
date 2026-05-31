// screenshot-and-show skill — take a screenshot and return the path for display

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const description = 'Take a screenshot of the screen and return path for display in chat';

export async function execute(args = '') {
  const now = Date.now();
  const path = `/tmp/helm-screenshot-${now}.png`;

  const result = spawnSync('screencapture', ['-x', path], { encoding: 'utf8', timeout: 10_000 });

  if (result.error) {
    return `Screenshot failed: ${result.error.message}`;
  }

  if (result.status !== 0) {
    return `Screenshot error (exit ${result.status}): ${result.stderr || 'unknown'}`;
  }

  if (!existsSync(path)) {
    return 'Screenshot file not created.';
  }

  // Return the path in a format that index.js can recognize and attach
  return `Screenshot ready: ${path}`;
}
