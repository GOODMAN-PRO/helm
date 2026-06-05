#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, statSync, unlinkSync } from 'node:fs';
import { resolveClaude } from '../../lib/engine.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureScreen } from './capture-screen.mjs';



const SCALE_DEFAULT = process.platform === 'darwin' ? 2 : 1;

function screenshot(imgPath) {

  const r = captureScreen(imgPath);
  if (!r.ok) throw new Error(r.error || 'screen capture failed');
  if (!existsSync(imgPath) || statSync(imgPath).size < 100) {
    throw new Error(
      'screen capture produced no output — on macOS grant Screen Recording permission ' +
      '(System Settings → Privacy & Security → Screen Recording); a black/empty image often means the screen is locked.'
    );
  }
}

function askClaude(prompt, imagePath) {
  const fullPrompt = `${prompt}\n\nImage file path: ${imagePath}`;
  const cb = resolveClaude();
  const r = spawnSync(
    cb.cmd,
    [
      '-p',
      '--output-format', 'json',
      '--model', 'haiku',
      '--permission-mode', 'bypassPermissions',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--max-turns', '3',
    ],
    { input: fullPrompt, encoding: 'utf8', timeout: 120_000, shell: cb.shell, windowsHide: true }
  );
  if (r.status !== 0) throw new Error((r.stderr || '').slice(0, 400) || 'claude exited non-zero');
  let out = r.stdout.trim();
  try { out = JSON.parse(out).result ?? out; } catch {  }
  return out;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const get = k => { const i = rawArgs.indexOf(`--${k}`); return i !== -1 ? rawArgs[i + 1] : null; };

  const verb = rawArgs[0];
  const outArg = get('out');

  const tmpFile = outArg ? null : join(tmpdir(), `helm-vision-${process.pid}.png`);
  const imgPath = outArg || tmpFile;


  const scale = Number(get('scale')) || SCALE_DEFAULT;

  try {
    if (verb === 'describe') {
      screenshot(imgPath);
      const description = askClaude(
        'Please use your Read tool to read the image at the path below. Describe what is currently shown on the screen: key applications, windows, visible text, and notable UI elements. Be concise and factual.',
        imgPath
      );
      console.log(JSON.stringify({ ok: true, description }));

    } else if (verb === 'find') {
      const query = get('query') || rawArgs[1];
      if (!query) { console.error('find requires a query: vision.mjs find <query>'); process.exit(1); }
      screenshot(imgPath);
      const response = askClaude(
        `Please use your Read tool to read the image at the path below. Find the UI element: "${query}". Reply with ONLY a raw JSON object with the pixel coordinates of its center: {"x": <number>, "y": <number>}. No explanation, no markdown — just the JSON object.`,
        imgPath
      );

      const jsonMatch = response.match(/\{[^{}]+\}/);
      if (!jsonMatch) throw new Error(`no JSON object in claude response: ${response.slice(0, 300)}`);
      let coords;
      try { coords = JSON.parse(jsonMatch[0]); } catch (e) { throw new Error(`malformed JSON: ${jsonMatch[0]}`); }
      if (typeof coords.x !== 'number' || typeof coords.y !== 'number') {
        throw new Error(`expected {x, y} numbers, got: ${jsonMatch[0]}`);
      }
      const x = Math.round(coords.x / scale);
      const y = Math.round(coords.y / scale);
      console.log(JSON.stringify({ ok: true, x, y, px: coords.x, py: coords.y, scale, query }));

    } else if (verb === 'verify') {
      const expectation = get('expect') || rawArgs[1];
      if (!expectation) {
        console.error('verify requires: vision.mjs verify --expect "<expected screen state>"');
        process.exit(1);
      }
      screenshot(imgPath);
      const response = askClaude(
        `Please use your Read tool to read the image at the path below. Does the screen currently show: "${expectation}"? Reply with ONLY a raw JSON object: {"verified": true, "explanation": "<one sentence>"} or {"verified": false, "explanation": "<one sentence>"}. No markdown, no extra text.`,
        imgPath
      );
      const jsonMatch = response.match(/\{[^{}]+\}/);
      if (!jsonMatch) throw new Error(`no JSON in claude response: ${response.slice(0, 300)}`);
      let result;
      try { result = JSON.parse(jsonMatch[0]); } catch (e) { throw new Error(`malformed JSON: ${jsonMatch[0]}`); }
      if (typeof result.verified !== 'boolean') throw new Error(`expected {verified: bool}, got: ${jsonMatch[0]}`);
      console.log(JSON.stringify({ ok: true, verified: result.verified, explanation: result.explanation ?? '', expectation }));

    } else {
      console.error('Usage: vision.mjs describe | find <query> | verify --expect "<expected state>"');
      process.exit(1);
    }
  } finally {

    if (tmpFile && existsSync(tmpFile)) {
      try { unlinkSync(tmpFile); } catch {  }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
