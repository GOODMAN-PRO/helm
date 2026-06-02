#!/usr/bin/env node
// MCP wrapper: @modelcontextprotocol/server-brave-search
// Reads BRAVE_API_KEY from the Helm secrets vault and injects it as the required env var,
// then spawns the real MCP server. Exits 1 if the key is not set yet.
//
// Add the key: echo -n "BSAk..." | node workspace/secrets/secrets.mjs set BRAVE_API_KEY
// Get an API key: https://api.search.brave.com/

import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRETS = path.resolve(__dirname, '../secrets/secrets.mjs');

const r = spawnSync(process.execPath, [SECRETS, 'get', 'BRAVE_API_KEY'], {
  encoding: 'utf8',
  timeout: 10_000,
});
if (r.status !== 0 || !r.stdout.trim()) {
  process.stderr.write(
    '[mcp/brave-search] BRAVE_API_KEY not in vault — server unavailable.\n' +
    '  To enable: echo -n "BSAk..." | node workspace/secrets/secrets.mjs set BRAVE_API_KEY\n'
  );
  process.exit(1);
}

const env = { ...process.env, BRAVE_API_KEY: r.stdout.trim() };
const child = spawn('npx', ['-y', '@modelcontextprotocol/server-brave-search'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',  // npx is npx.cmd on Windows — needs a shell or it ENOENTs
});
child.on('error', e => { process.stderr.write('[mcp/brave-search] spawn error: ' + e.message + '\n'); process.exit(1); });
child.on('exit', code => process.exit(code ?? 0));
