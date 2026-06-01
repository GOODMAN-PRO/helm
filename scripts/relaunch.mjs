#!/usr/bin/env node
// Helm relauncher — spawned (detached) by the Discord `restart` command. The old brain exits right
// after spawning this, which frees the single-instance lock port; we wait for that, then start a fresh
// brain (also detached). So Helm can restart itself on the same machine without anyone touching a
// terminal. Kept tiny and dependency-free so it can't fail to bring Helm back.
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_PORT = parseInt(process.env.HELM_LOCK_PORT || '4624', 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Resolves true once the lock port is free (connection refused = the old brain has fully exited).
const lockFree = () => new Promise(resolve => {
  const s = net.connect({ host: '127.0.0.1', port: LOCK_PORT });
  const done = free => { try { s.destroy(); } catch {} resolve(free); };
  s.once('connect', () => done(false));   // still held by the old brain
  s.once('error', () => done(true));      // refused -> free
  setTimeout(() => done(false), 800);
});

// Wait up to ~20s for the old brain to release the lock, then a short settle before rebinding.
for (let i = 0; i < 40; i++) { if (await lockFree()) break; await sleep(500); }
await sleep(500);

// Start a fresh brain, fully detached so it outlives this relauncher.
spawn(process.execPath, [path.join(ROOT, 'index.js')], {
  cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true,
}).unref();
process.exit(0);
