#!/usr/bin/env node
// `helm` — the one-line entry point.
//
//   helm                 open the terminal chat. If Helm's brain isn't running yet, start it in the
//                        background first, then connect. (One brain, shared with Discord/iMessage.)
//   helm "do the thing"  one-shot: send a single message and print the reply
//   echo "..." | helm    one-shot from stdin (pipe-friendly)
//   helm start           run the brain in the foreground (Discord/iMessage service + terminal bridge)
//   helm setup           (re)run the setup wizard
//   helm stop            stop a background brain that `helm` started
//   helm --help
//
// Install once so `helm` is on your PATH:  npm link   (from the repo)  — or  npm install -g .
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertNode } from '../workspace/preflight/node-guard.mjs';

// Fail fast with a clear message on too-old Node, instead of a cryptic node:sqlite crash deep in index.js.
assertNode();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // repo root
const PORT = parseInt(process.env.HELM_CLI_PORT || '4625', 10);
const PIDFILE = path.join(ROOT, 'workspace', '.helm-brain.pid');
const node = process.execPath;
const run = (args, opts = {}) => spawnSync(node, args, { cwd: ROOT, stdio: 'inherit', ...opts });

// `npx github:GOODMAN-PRO/helm` runs THIS bin from npm's EPHEMERAL npx cache (…/_npx/…). Running the
// agent/wizard there would write .env + a launchd/Task service into a temp dir npm later deletes, and
// never put `helm` on PATH (exactly the broken install people hit). So when we detect we're in the npx
// cache, hand off to the real installer, which copies to ~/helm, installs deps, links `helm`, and sets
// up the service — i.e. `npx github:GOODMAN-PRO/helm` becomes a proper one-command install.
if (/[\\/]_npx[\\/]/.test(ROOT)) {
  process.exit(run([path.join(ROOT, 'bin', 'helm-install.mjs')]).status ?? 0);
}

// Is the brain's terminal bridge accepting connections right now?
function brainUp(timeout = 600) {
  return new Promise(resolve => {
    const s = net.connect({ host: '127.0.0.1', port: PORT });
    const done = ok => { try { s.destroy(); } catch {} resolve(ok); };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    setTimeout(() => done(false), timeout);
  });
}

// Start the brain detached (background) and wait until its bridge is reachable.
async function startBrainBackground() {
  process.stderr.write('Helm isn\'t running — starting it…\n');
  // Capture the brain's stdout+stderr to workspace/helm.log so errors (engine spawn failures, crashes,
  // routing) are actually recorded — a detached `stdio: 'ignore'` process leaves nothing to debug.
  const LOGFILE = path.join(ROOT, 'workspace', 'helm.log');
  let out = 'ignore';
  try { out = openSync(LOGFILE, 'a'); } catch {}
  const stdio = out === 'ignore' ? 'ignore' : ['ignore', out, out];
  const child = spawn(node, [path.join(ROOT, 'index.js')], { cwd: ROOT, detached: true, stdio, windowsHide: true });
  child.unref();
  process.stderr.write(`(logs: ${LOGFILE})\n`);
  try { writeFileSync(PIDFILE, String(child.pid)); } catch {}
  for (let i = 0; i < 40; i++) {            // up to ~20s for Discord login + bridge listen
    if (await brainUp()) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

const args = process.argv.slice(2);
const sub = args[0];

// ---- explicit subcommands ----
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

// ---- default: chat (one-shot if a message/pipe is given, else interactive) ----
// A bare message like `helm hello there` is treated as a one-shot unless it's a known subcommand.
const cli = [path.join(ROOT, 'cli.js'), ...args];

// If the brain is up, just hand off to the client. If not — and we're going interactive or one-shot —
// start it in the background first so `helm` "just works" as a single command.
const up = await brainUp();
if (!up) {
  const started = await startBrainBackground();
  if (!started) {
    process.stderr.write('Could not start Helm automatically. Run `helm start` in its own terminal to see why (often: DISCORD_TOKEN not set — run `helm setup`).\n');
    process.exit(1);
  }
}
process.exit(run(cli).status ?? 0);
