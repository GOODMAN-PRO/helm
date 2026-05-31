// reverse-engineering skill — reverse-engineer web, app, or file targets

import { spawnSync } from 'node:child_process';
import path from 'node:path';

export const description = 'Reverse engineer a target: web <url>, app <path>, or file <path>. Usage: web https://example.com | app /path/to/App.app | file /path/to/binary';

export async function execute(argsStr = '') {
  if (!argsStr.trim()) {
    return 'Usage: /skill reverse-engineering web <url> | app <path> | file <path>';
  }

  const parts = argsStr.trim().split(/\s+/);
  const subcommand = parts[0]; // web, app, or file
  const target = parts.slice(1).join(' ');

  if (!target) {
    return `Missing target for subcommand "${subcommand}".`;
  }

  const toolPath = path.resolve(process.env.WORKSPACE || './workspace', 'tools/impl/reverse.mjs');
  const result = spawnSync(process.execPath, [
    toolPath,
    subcommand,
    target,
  ], {
    encoding: 'utf8',
    timeout: 60_000,
  });

  if (result.error) {
    return `Reverse-engineering failed: ${result.error.message}`;
  }

  if (result.status !== 0) {
    return `Reverse-engineering error (exit ${result.status}): ${result.stderr || 'unknown'}`;
  }

  try {
    const json = JSON.parse(result.stdout);
    if (json.ok) {
      return `✅ Report saved: ${json.report}`;
    } else {
      return `Report generation failed: ${json.error || 'unknown'}`;
    }
  } catch {
    return result.stdout || 'No output';
  }
}
