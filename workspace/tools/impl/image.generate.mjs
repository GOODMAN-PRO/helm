#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const get  = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
const bool = (k, def) => { const v = get(k); if (v === null) return def; return !/^(false|0|no|off)$/i.test(v); };

const prompt = get('prompt');
if (!prompt) { console.error('--prompt required'); process.exit(1); }


const ASPECTS = {
  square:    [1024, 1024],
  landscape: [1280, 720],
  wide:      [1456, 816],
  portrait:  [896, 1152],
  tall:      [896, 1152],
  story:     [1080, 1920],
  vertical:  [1080, 1920],
};
const clamp = n => Math.min(2048, Math.max(64, n | 0));
let [baseW, baseH] = [1024, 1024];
const aspect = (get('aspect') || '').toLowerCase();
if (ASPECTS[aspect]) [baseW, baseH] = ASPECTS[aspect];

const width   = clamp(parseInt(get('width')  || String(baseW), 10) || baseW);
const height  = clamp(parseInt(get('height') || String(baseH), 10) || baseH);
const model   = (get('model') || 'flux').replace(/[^\w.-]/g, '');
const seedArg = get('seed');
const enhance = bool('enhance', true);
const negative = get('negative');
const batch   = Math.min(8, Math.max(1, parseInt(get('batch')   || '1', 10) || 1));
const retries = Math.min(8, Math.max(0, parseInt(get('retries') || '4', 10)));


const WORKSPACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SAFE_ROOTS = [os.tmpdir(), WORKSPACE, '/tmp', '/private/tmp'];
const safe = p => SAFE_ROOTS.some(r => p === r || p.startsWith(r + path.sep) || p.startsWith(r + '/'));
const baseOut = path.resolve(get('out') || path.join(os.tmpdir(), `helm-image-${Date.now()}.jpg`));
if (!safe(baseOut)) {
  console.error(`refusing --out outside safe roots (${SAFE_ROOTS.join(', ')}): ${baseOut}`);
  process.exit(1);
}



function polltoken() {
  if (process.env.POLLINATIONS_TOKEN) return process.env.POLLINATIONS_TOKEN.trim();
  try {
    const secrets = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'secrets', 'secrets.mjs');
    const r = spawnSync(process.execPath, [secrets, 'get', 'POLLINATIONS_TOKEN'], { encoding: 'utf8', timeout: 8000 });
    if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout.trim();
  } catch {  }
  return null;
}
const TOKEN = polltoken();

const sleep = ms => new Promise(r => setTimeout(r, ms));

const RETRY_STATUS = new Set([402, 408, 425, 429, 500, 502, 503, 504, 520, 522, 524]);


function isImage(b) {
  if (!b || b.length < 100) return false;
  if (b[0] === 0xFF && b[1] === 0xD8) return true;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return true;
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true;
  if (b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') return true;
  if (b[0] === 0x42 && b[1] === 0x4D) return true;
  return false;
}

function buildUrl(seed) {
  const params = new URLSearchParams({
    width: String(width), height: String(height), model,
    nologo: 'true', private: 'true', nofeed: 'true',
  });
  if (enhance) params.set('enhance', 'true');
  params.set('referrer', 'helm');
  if (TOKEN) params.set('token', TOKEN);
  if (seed != null) params.set('seed', String(seed));
  let full = prompt;
  if (negative) full += `\n\nAvoid: ${negative}`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?${params}`;
}

async function genOne(outPath, seed) {
  let lastErr = 'unknown';
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(4000 * 2 ** (attempt - 1), 32000) + Math.floor(Math.random() * 1500));
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120_000);
    try {
      const headers = { accept: 'image/*' };
      if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
      const res = await fetch(buildUrl(seed), { signal: ac.signal, headers });
      clearTimeout(timer);
      if (!res.ok) {
        lastErr = `provider returned ${res.status}`;
        if (RETRY_STATUS.has(res.status)) continue;
        return { ok: false, error: `${lastErr}: ${(await res.text().catch(() => '')).slice(0, 160)}` };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!isImage(buf)) { lastErr = `non-image response (${buf.length}b)`; continue; }
      writeFileSync(outPath, buf);
      return { ok: true, path: outPath, bytes: buf.length, seed: seed ?? null };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e.name === 'AbortError' ? 'timeout (120s)' : String(e.message || e);
    }
  }
  return { ok: false, error: `image generation failed after ${retries + 1} attempt(s): ${lastErr}` };
}

function outFor(i) {
  if (i === 0) return baseOut;
  const ext = path.extname(baseOut) || '.jpg';
  return baseOut.slice(0, baseOut.length - ext.length) + `-${i + 1}` + ext;
}

const images = [];
for (let i = 0; i < batch; i++) {
  const seed = (seedArg != null && seedArg !== '') ? (parseInt(seedArg, 10) || 0) + i : undefined;
  const r = await genOne(outFor(i), seed);
  if (r.ok) { images.push(r); continue; }
  // First image must succeed; for a partial batch keep what we already have.
  if (images.length === 0) { console.error(r.error); process.exit(1); }
  break;
}
if (images.length === 0) { console.error('no images generated'); process.exit(1); }

const first = images[0];
console.log(JSON.stringify({
  ok: true, path: first.path, bytes: first.bytes,
  width, height, model, enhance, prompt,
  count: images.length, images,
}));
