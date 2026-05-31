#!/usr/bin/env node
// Take a screenshot then use Claude's vision to describe the screen or locate a UI element.
// Verbs:
//   describe  => { ok: true, description: string }
//   find      => { ok: true, x: number, y: number, px: number, py: number, scale: number }
//
// Retina display: screencapture -x captures at pixel resolution; divide by --scale (default 2)
// to get point coordinates that work with bin/guicontrol.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCALE_DEFAULT = 2;

function screenshot(imgPath) {
  const r = spawnSync('/usr/sbin/screencapture', ['-x', imgPath], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'screencapture failed');
}

function askClaude(prompt, imagePath) {
  const fullPrompt = `${prompt}\n\nImage file path: ${imagePath}`;
  const r = spawnSync(
    'claude',
    [
      '-p',
      '--output-format', 'json',
      '--model', 'haiku',
      '--permission-mode', 'bypassPermissions',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--max-turns', '3',
    ],
    { input: fullPrompt, encoding: 'utf8', timeout: 120_000 }
  );
  if (r.status !== 0) throw new Error((r.stderr || '').slice(0, 400) || 'claude exited non-zero');
  let out = r.stdout.trim();
  try { out = JSON.parse(out).result ?? out; } catch { /* raw text is fine */ }
  return out;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const get = k => { const i = rawArgs.indexOf(`--${k}`); return i !== -1 ? rawArgs[i + 1] : null; };

  const verb = rawArgs[0];
  const imgPath = get('out') || '/tmp/helm-vision.png';
  const scale = Number(get('scale') || SCALE_DEFAULT);

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
    // Parse the JSON from the response (may have surrounding whitespace or backticks)
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

  } else {
    console.error('Usage: vision.mjs describe | find <query>');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
