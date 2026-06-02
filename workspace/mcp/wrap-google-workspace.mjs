#!/usr/bin/env node
// MCP wrapper: @modelcontextprotocol/server-google-workspace (Calendar + Gmail only)
// Reads GOOGLE_WORKSPACE_CREDS from the Helm secrets vault (service-account or OAuth
// credentials JSON), writes them to a private temp file, then spawns the MCP server
// with the path and scope restrictions set via env vars.
//
// Add the key: cat creds.json | node workspace/secrets/secrets.mjs set GOOGLE_WORKSPACE_CREDS
// Scopes: https://www.googleapis.com/auth/calendar + https://mail.google.com/

import { spawnSync, spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRETS = path.resolve(__dirname, '../secrets/secrets.mjs');

const r = spawnSync(process.execPath, [SECRETS, 'get', 'GOOGLE_WORKSPACE_CREDS'], {
  encoding: 'utf8',
  timeout: 10_000,
});
if (r.status !== 0 || !r.stdout.trim()) {
  process.stderr.write(
    '[mcp/google-workspace] GOOGLE_WORKSPACE_CREDS not in vault — server unavailable.\n' +
    '  To enable: cat creds.json | node workspace/secrets/secrets.mjs set GOOGLE_WORKSPACE_CREDS\n'
  );
  process.exit(1);
}

// Write creds to a private temp file (GOOGLE_APPLICATION_CREDENTIALS must be a path)
const tmpDir = path.join(os.tmpdir(), 'helm-mcp');
mkdirSync(tmpDir, { recursive: true });
const credsPath = path.join(tmpDir, 'google-workspace-creds.json');
writeFileSync(credsPath, r.stdout.trim(), { mode: 0o600 });

const env = {
  ...process.env,
  GOOGLE_APPLICATION_CREDENTIALS: credsPath,
  // Restrict to Calendar + Gmail only — no Drive, Contacts, Admin, etc.
  GOOGLE_MCP_SCOPES: [
    'https://www.googleapis.com/auth/calendar',
    'https://mail.google.com/',
  ].join(','),
};
const child = spawn('npx', ['-y', '@modelcontextprotocol/server-google-workspace'], {
  stdio: 'inherit',
  env,
  windowsHide: true,
  shell: process.platform === 'win32',  // npx is npx.cmd on Windows — needs a shell or it ENOENTs
});
child.on('error', e => { process.stderr.write('[mcp/google-workspace] spawn error: ' + e.message + '\n'); process.exit(1); });
child.on('exit', code => process.exit(code ?? 0));
