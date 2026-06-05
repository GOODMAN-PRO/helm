#!/usr/bin/env node
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRETS = path.resolve(__dirname, '../secrets/secrets.mjs');

const r = spawnSync(process.execPath, [SECRETS, 'get', 'GITHUB_PAT'], {
  encoding: 'utf8',
  timeout: 10_000,
});
if (r.status !== 0 || !r.stdout.trim()) {
  process.stderr.write(
    '[mcp/github] GITHUB_PAT not in vault — server unavailable.\n' +
    '  To enable: echo -n "ghp_..." | node workspace/secrets/secrets.mjs set GITHUB_PAT\n'
  );
  process.exit(1);
}

const env = { ...process.env, GITHUB_PERSONAL_ACCESS_TOKEN: r.stdout.trim() };
const child = spawn('npx', ['-y', '@modelcontextprotocol/server-github'], {
  stdio: 'inherit',
  env,
  windowsHide: true,
  shell: process.platform === 'win32',
});
child.on('error', e => { process.stderr.write('[mcp/github] spawn error: ' + e.message + '\n'); process.exit(1); });
child.on('exit', code => process.exit(code ?? 0));
