#!/usr/bin/env node
// Screen watcher daemon.
// Runs screencapture every N seconds, computes a perceptual hash, and records
// significant frame changes to events.db.  OCR is opt-in (--ocr flag).
// OFF BY DEFAULT — started manually or via launchd after owner enables it.
//
// Usage:
//   node watcher.mjs [--interval 60] [--threshold 10] [--ocr] [--once]
//
// --interval  seconds between captures (default 60)
// --threshold hamming distance above which a frame is "different" (default 10)
// --ocr       run OCR via ocr-helper binary; skip if binary missing
// --once      capture one frame and exit (useful for testing)

import { execSync, execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR  = path.join(__dirname, 'frames');
const DB_PATH     = path.join(__dirname, 'events.db');
const OCR_BINARY  = path.resolve(__dirname, '../../..', 'bin', 'ocr-helper');
const RING_MAX    = 200;

// Parse flags
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf('--' + name);
  if (i === -1) return def;
  return (typeof def === 'boolean') ? true : (args[i + 1] ?? def);
};
const INTERVAL  = parseInt(flag('interval', '60'), 10) * 1000;
const THRESHOLD = parseInt(flag('threshold', '10'), 10);
const USE_OCR   = flag('ocr', false);
const ONCE      = flag('once', false);

// DB init (idempotent)
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts       INTEGER NOT NULL,
    hash     TEXT    NOT NULL,
    png_path TEXT    NOT NULL,
    ocr_text TEXT
  );
  CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
`);

const insertEvent = db.prepare(
  'INSERT INTO events (ts, hash, png_path, ocr_text) VALUES (?,?,?,?)'
);

// Perceptual hash: downscale to 8x8 grayscale, threshold by mean.
// Returns a 64-char binary string of '0'/'1'.
async function phash(pngPath) {
  const raw = await sharp(pngPath)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();                // 64 bytes, one per pixel

  const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
  return Array.from(raw).map(v => (v >= mean ? '1' : '0')).join('');
}

// Hamming distance between two 64-char bit strings.
function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

// Enforce ring buffer: delete oldest PNGs beyond RING_MAX.
function enforceRing() {
  const files = readdirSync(FRAMES_DIR)
    .filter(f => f.endsWith('.png'))
    .map(f => ({ f, mtime: +new Date(f.split('-')[0]) }))
    .sort((a, b) => a.mtime - b.mtime);
  while (files.length > RING_MAX) {
    const oldest = files.shift();
    try { unlinkSync(path.join(FRAMES_DIR, oldest.f)); } catch {}
  }
}

// Run OCR via the swift binary if available.
function runOcr(pngPath) {
  if (!existsSync(OCR_BINARY)) return null;
  try {
    const r = spawnSync(OCR_BINARY, [pngPath], { encoding: 'utf8', timeout: 15000 });
    return r.stdout?.trim() || null;
  } catch {
    return null;
  }
}

let lastHash = null;

async function tick() {
  const ts     = Date.now();
  const fname  = `${ts}-helm-screen.png`;
  const dest   = path.join(FRAMES_DIR, fname);
  const tmp    = `/tmp/helm-screen-${ts}.png`;

  // Capture
  try {
    execFileSync('screencapture', ['-x', '-t', 'png', tmp], { timeout: 10000 });
  } catch (e) {
    process.stderr.write(`[screen] capture failed: ${e.message}\n`);
    return;
  }

  // Hash
  let hash;
  try {
    hash = await phash(tmp);
  } catch (e) {
    process.stderr.write(`[screen] hash failed: ${e.message}\n`);
    try { unlinkSync(tmp); } catch {}
    return;
  }

  // Compare
  const dist = lastHash ? hamming(hash, lastHash) : THRESHOLD + 1;
  if (dist <= THRESHOLD && lastHash !== null) {
    // Frame too similar — discard
    try { unlinkSync(tmp); } catch {}
    return;
  }

  // Move to frames ring
  try {
    execFileSync('mv', [tmp, dest]);
  } catch {
    // mv failed; just continue with tmp path recorded
  }
  const storedPath = existsSync(dest) ? dest : tmp;

  // OCR (optional)
  let ocrText = null;
  if (USE_OCR) ocrText = runOcr(storedPath);

  // Persist
  insertEvent.run(ts, hash, storedPath, ocrText);
  lastHash = hash;

  enforceRing();

  process.stdout.write(`[screen] ts=${ts} hash=${hash.slice(0,8)}... dist=${dist} ocr=${ocrText ? 'yes' : 'no'}\n`);
}

if (ONCE) {
  await tick();
  process.exit(0);
} else {
  process.stdout.write(`[screen] watcher started interval=${INTERVAL/1000}s threshold=${THRESHOLD} ocr=${USE_OCR}\n`);
  await tick();
  setInterval(tick, INTERVAL);
}
