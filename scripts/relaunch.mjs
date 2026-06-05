#!/usr/bin/env node
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_PORT = parseInt(process.env.HELM_LOCK_PORT || '4624', 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));


const lockFree = () => new Promise(resolve => {
  const s = net.connect({ host: '127.0.0.1', port: LOCK_PORT });
  const done = free => { try { s.destroy(); } catch {} resolve(free); };
  s.once('connect', () => done(false));
  s.once('error', () => done(true));
  setTimeout(() => done(false), 800);
});


for (let i = 0; i < 40; i++) { if (await lockFree()) break; await sleep(500); }
await sleep(500);


spawn(process.execPath, [path.join(ROOT, 'index.js')], {
  cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true,
}).unref();
process.exit(0);
