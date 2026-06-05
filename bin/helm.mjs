#!/usr/bin/env node
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertNode } from '../workspace/preflight/node-guard.mjs';


assertNode();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = parseInt(process.env.HELM_CLI_PORT || '4625', 10);
const PIDFILE = path.join(ROOT, 'workspace', '.helm-brain.pid');
const node = process.execPath;
const run = (args, opts = {}) => spawnSync(node, args, { cwd: ROOT, stdio: 'inherit', ...opts });






if (/[\\/]_npx[\\/]/.test(ROOT)) {
  process.exit(run([path.join(ROOT, 'bin', 'helm-install.mjs')]).status ?? 0);
}


function brainUp(timeout = 600) {
  return new Promise(resolve => {
    const s = net.connect({ host: '127.0.0.1', port: PORT });
    const done = ok => { try { s.destroy(); } catch {} resolve(ok); };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    setTimeout(() => done(false), timeout);
  });
}


async function startBrainBackground() {
  process.stderr.write('Helm isn\'t running — starting it…\n');


  const LOGFILE = path.join(ROOT, 'workspace', 'helm.log');
  let out = 'ignore';
  try { out = openSync(LOGFILE, 'a'); } catch {}
  const stdio = out === 'ignore' ? 'ignore' : ['ignore', out, out];
  const child = spawn(node, [path.join(ROOT, 'index.js')], { cwd: ROOT, detached: true, stdio, windowsHide: true });
  child.unref();
  process.stderr.write(`(logs: ${LOGFILE})\n`);
  try { writeFileSync(PIDFILE, String(child.pid)); } catch {}
  for (let i = 0; i < 40; i++) {
    if (await brainUp()) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

const args = process.argv.slice(2);
const sub = args[0];


if (sub === '--help' || sub === '-h' || sub === 'help') {
  process.stdout.write(`helm — your personal AI agent\n\n  helm                 open the terminal chat (starts Helm if needed)\n  helm "message"       send one message and print the reply\n  echo "msg" | helm    one-shot from a pipe\n  helm start           run the brain in the foreground (service + bridge)\n  helm stop            stop a background brain that helm started\n  helm setup           run the setup wizard\n  helm doctor          check your setup (Node, engine, model, config) and fix hints\n  helm --help          this help\n`);
  process.exit(0);
}
if (sub === 'start') { process.exit(run([path.join(ROOT, 'index.js')]).status ?? 0); }
if (sub === 'setup' || sub === 'wizard') { process.exit(run([path.join(ROOT, 'scripts', 'wizard.mjs')]).status ?? 0); }
if (sub === 'doctor') { process.exit(run([path.join(ROOT, 'workspace', 'doctor.mjs'), ...args.slice(1)]).status ?? 0); }
if (sub === 'stop') {
  let pid; try { pid = parseInt(readFileSync(PIDFILE, 'utf8').trim(), 10); } catch {}
  if (pid) { try { process.kill(pid); process.stdout.write(`stopped Helm (pid ${pid}).\n`); } catch { process.stdout.write('no background Helm to stop (it may be running in another terminal or as a service).\n'); } }
  else process.stdout.write('no background Helm started by `helm` was found.\n');
  try { unlinkSync(PIDFILE); } catch {}
  process.exit(0);
}



const cli = [path.join(ROOT, 'cli.js'), ...args];



const up = await brainUp();
if (!up) {
  const started = await startBrainBackground();
  if (!started) {
    process.stderr.write('Could not start Helm automatically. Run `helm start` in its own terminal to see why (often: DISCORD_TOKEN not set — run `helm setup`).\n');
    process.exit(1);
  }
}
process.exit(run(cli).status ?? 0);
