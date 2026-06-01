#!/usr/bin/env node
// image.generate — text-to-image for Helm via Pollinations (free, no API key, any OS).
// Saves a generated image to a temp file and prints its path; the gateway attaches it to chat
// when the brain ends its reply with `ATTACH: <that path>`.
//
// Usage: node image.generate.mjs --prompt "a red fox in snow" [--out <file>] [--width 1024]
//        [--height 1024] [--model flux] [--seed 42]
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const get = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };

const prompt = get('prompt');
if (!prompt) { console.error('--prompt required'); process.exit(1); }
const width  = Math.min(2048, Math.max(64, parseInt(get('width') || '1024', 10) || 1024));
const height = Math.min(2048, Math.max(64, parseInt(get('height') || '1024', 10) || 1024));
const model  = (get('model') || 'flux').replace(/[^\w.-]/g, '');
const seed   = get('seed');

// Output path: default to OS temp; guard against writing outside temp/workspace.
const WORKSPACE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const SAFE_ROOTS = [os.tmpdir(), WORKSPACE, '/tmp', '/private/tmp'];
const out = path.resolve(get('out') || path.join(os.tmpdir(), `helm-image-${Date.now()}.jpg`));
if (!SAFE_ROOTS.some(r => out === r || out.startsWith(r + path.sep) || out.startsWith(r + '/'))) {
  console.error(`refusing --out outside safe roots (${SAFE_ROOTS.join(', ')}): ${out}`);
  process.exit(1);
}

const params = new URLSearchParams({ width: String(width), height: String(height), model, nologo: 'true' });
if (seed) params.set('seed', String(seed));
const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;

const ac = new AbortController();
const timer = setTimeout(() => ac.abort(), 90_000);   // generation can take a while
try {
  const res = await fetch(url, { signal: ac.signal, headers: { accept: 'image/*' } });
  clearTimeout(timer);
  if (!res.ok) { console.error(`image provider returned ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`); process.exit(1); }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 256) { console.error('image provider returned empty/too-small response'); process.exit(1); }
  writeFileSync(out, buf);
  console.log(JSON.stringify({ ok: true, path: out, bytes: buf.length, width, height, model, prompt }));
} catch (e) {
  clearTimeout(timer);
  console.error(e.name === 'AbortError' ? 'image generation timed out (90s)' : String(e.message || e));
  process.exit(1);
}
