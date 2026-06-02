#!/usr/bin/env node
// MCP wrapper: @modelcontextprotocol/server-github
// Reads GITHUB_PAT from the Helm secrets vault, injects it as the required env var,
// then exec-spawns the real MCP server. Exits 1 with a helpful message if the key
// is not in the vault yet (check.mjs will mark this server DOWN gracefully).
//
// Add the key: echo -n "ghp_..." | node workspace/secrets/secrets.mjs set GITHUB_PAT

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
  shell: process.platform === 'win32',  // npx is npx.cmd on Windows — needs a shell or it ENOENTs
});
child.on('error', e => { process.stderr.write('[mcp/github] spawn error: ' + e.message + '\n'); process.exit(1); });
child.on('exit', code => process.exit(code ?? 0));
