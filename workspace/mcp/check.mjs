#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'servers.json');
const HELM_ROOT = path.resolve(__dirname, '../..');


const INIT_REQUEST =
  JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'helm-health', version: '1.0' },
    },
  }) + '\n';

function probeServer(name, entry) {
  return new Promise(resolve => {
    let settled = false;
    const settle = result => { if (!settled) { settled = true; resolve(result); } };

    let child;
    try {


      child = spawn(entry.command, entry.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        windowsHide: true,
      });
    } catch (e) {
      return settle({ name, status: 'DOWN', error: String(e.message || e) });
    }


    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      settle({ name, status: 'DOWN', error: 'timeout (5s)' });
    }, 5_000);

    let buf = '';
    child.stdout?.on('data', chunk => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1 && msg.result) {
            clearTimeout(timer);
            try { child.kill('SIGKILL'); } catch {}
            settle({ name, status: 'UP' });
            return;
          }
        } catch {  }
      }
    });

    child.on('error', e => {
      clearTimeout(timer);
      settle({ name, status: 'DOWN', error: e.message });
    });

    child.on('exit', code => {
      clearTimeout(timer);

      settle({ name, status: 'DOWN', error: `exited ${code}` });
    });




    child.stdin?.on('error', () => {});
    try {
      child.stdin?.write(INIT_REQUEST);
      child.stdin?.end();
    } catch {  }
  });
}


export async function runHealthChecks({ silent = false } = {}) {
  let config;
  try {
    config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    if (!silent) console.error('[mcp/check] cannot read servers.json:', e.message);
    return [];
  }

  const servers = config.mcpServers ?? {};
  const tasks = Object.entries(servers).map(([name, entry]) => {
    if (entry.enabled === false || !entry.healthCheck) {
      return Promise.resolve({ name, status: 'SKIP' });
    }

    const expanded = Array.isArray(entry.args)
      ? { ...entry, args: entry.args.map(a => typeof a === 'string' ? a.split('__HELM_ROOT__').join(HELM_ROOT) : a) }
      : entry;
    return probeServer(name, expanded);
  });

  const results = await Promise.all(tasks);

  if (!silent) {
    const pad = Math.max(0, ...results.map(r => r.name.length));
    for (const r of results) {
      const label = r.name.padEnd(pad);
      if (r.status === 'SKIP')      console.log(`[mcp] ${label}  SKIP`);
      else if (r.status === 'UP')   console.log(`[mcp] ${label}  UP`);
      else                          console.log(`[mcp] ${label}  DOWN  (${r.error})`);
    }
  }

  return results;
}


if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runHealthChecks().then(() => process.exit(0)).catch(() => process.exit(0));
}
