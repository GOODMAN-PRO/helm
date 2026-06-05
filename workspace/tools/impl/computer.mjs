#!/usr/bin/env node
import { spawnSync }               from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir }                  from 'node:os';
import { join, dirname }           from 'node:path';
import { fileURLToPath }           from 'node:url';

import { doInput, screenBounds, resolveAnchor } from './win-input.mjs';
import { captureScreen, defaultShotPath }        from './capture-screen.mjs';





const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);


function parseJsonArg(argv) {
  const i = argv.indexOf('--json');
  if (i === -1) return {};
  const raw = argv[i + 1];
  if (!raw || raw.startsWith('--')) return {};
  try { return JSON.parse(raw); } catch (e) { die('bad --json: ' + e.message); }
}


function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--') || a === '--json') continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) { out[key] = true; continue; }
    out[key] = (val === 'true') ? true : (val === 'false') ? false
             : (val !== '' && !Number.isNaN(Number(val))) ? Number(val) : val;
    i++;
  }
  return out;
}

function die(msg, extra = {}) {
  console.log(JSON.stringify({ ok: false, error: String(msg), ...extra }));
  process.exit(0);   // always exit 0; caller reads {ok:false}
}

function ok(data) {
  console.log(JSON.stringify({ ok: true, ...data }));
}

const sleepMs = ms =>
  new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Resolve x,y from payload (absolute | at anchor | xpct/ypct percentage)
// Returns {x, y} or calls die().
// ---------------------------------------------------------------------------
function resolveXY(p, requireCoords = false) {
  let { x, y, at, xpct, ypct } = p;
  if (x != null && y != null) return { x: Number(x), y: Number(y) };

  if (at != null || (xpct != null && ypct != null)) {
    if (process.platform !== 'win32') {
      die('named/percent targets require Windows; pass x and y directly');
    }
    const b = screenBounds();
    if (!b.ok) die('cannot read screen bounds: ' + b.error);

    if (at != null) {
      const p2 = resolveAnchor(at, b);
      if (!p2) die(`unknown anchor "${at}" — use top-left|top-right|bottom-left|bottom-right|center|top|bottom|left|right`);
      return { x: p2[0], y: p2[1] };
    }

    return {
      x: b.left + Math.round((b.width - 1) * Number(xpct) / 100),
      y: b.top  + Math.round((b.height - 1) * Number(ypct) / 100),
    };
  }

  if (requireCoords) die('provide x and y, or at, or xpct and ypct');
  return { x: undefined, y: undefined };
}





function spawnSibling(relPath, extraArgs) {
  const abs = join(__dirname, relPath);
  if (!existsSync(abs)) {
    return { ok: false, error: `${relPath} not found (not yet built)` };
  }
  const r = spawnSync(process.execPath, [abs, ...extraArgs], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (r.error) return { ok: false, error: r.error.message };
  const stdout = (r.stdout || '').trim();
  if (!stdout) return { ok: false, error: `${relPath} produced no output` };
  try { return JSON.parse(stdout); } catch { return { ok: false, error: `${relPath} bad JSON: ${stdout.slice(0, 200)}` }; }
}

// Probe whether a claude CLI is on PATH (used by the `do` action for verify).
function claudioAvailable() {
  // Quick probe: `claude --version` exit 0 means it exists.
  const r = spawnSync(
    process.platform === 'win32' ? 'claude.cmd' : 'claude',
    ['--version'],
    { encoding: 'utf8', timeout: 5_000, shell: process.platform === 'win32' }
  );
  return r.status === 0;
}





function verifyWithClaude(description, imgPath) {
  const prompt =
    `Please use your Read tool to read the image at the path below. ` +
    `Did the following action/state now hold: "${description}"? ` +
    `Look at the current screen state and decide. ` +
    `Reply with ONLY a raw JSON object — either ` +
    `{"verified":true} or ` +
    `{"verified":false,"explanation":"<one sentence>"}. ` +
    `No markdown, no extra text.\n\nImage file path: ${imgPath}`;

  const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
  const r = spawnSync(
    claudeCmd,
    [
      '-p',
      '--output-format', 'json',
      '--model',          'haiku',
      '--permission-mode', 'bypassPermissions',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--max-turns', '3',
    ],
    { input: prompt, encoding: 'utf8', timeout: 120_000, shell: process.platform === 'win32', windowsHide: true }
  );
  if (r.status !== 0) throw new Error(`claude exit ${r.status}: ${(r.stderr || '').slice(0, 300)}`);
  let out = (r.stdout || '').trim();
  try { out = JSON.parse(out).result ?? out; } catch {}
  const m = out.match(/\{[^{}]+\}/);
  if (!m) throw new Error(`no JSON in claude response: ${out.slice(0, 300)}`);
  const obj = JSON.parse(m[0]);
  return { verified: !!obj.verified, explanation: obj.explanation || '' };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function actionScreenshot(p) {
  const out = p.out || defaultShotPath('helm-computer');
  const r = captureScreen(out);
  if (!r.ok) die(r.error);
  ok({ path: out });
}

async function actionSize() {
  const b = screenBounds();
  if (!b.ok) die(b.error);
  ok({ width: b.width, height: b.height, left: b.left, top: b.top });
}

async function actionMove(p) {
  const { x, y } = resolveXY(p, true);
  const r = doInput({ verb: 'move', x, y });
  if (!r.ok) die(r.error);
  ok({ x, y, cursor: r.cursor || null });
}

async function actionClick(p) {
  const { x, y } = resolveXY(p, false);
  const button = (p.button || 'left').toLowerCase();
  const verb = button === 'double' ? 'doubleclick' : button === 'right' ? 'rightclick' : 'click';

  const action = { verb, x, y };

  if (x == null || y == null) {



    die('click requires x and y (or at/xpct+ypct)');
  }
  const r = doInput(action);
  if (!r.ok) die(r.error);
  ok({ verb, x, y, cursor: r.cursor || null });
}

async function actionDouble(p) {
  const { x, y } = resolveXY(p, true);
  const r = doInput({ verb: 'doubleclick', x, y });
  if (!r.ok) die(r.error);
  ok({ verb: 'doubleclick', x, y, cursor: r.cursor || null });
}

async function actionRight(p) {
  const { x, y } = resolveXY(p, true);
  const r = doInput({ verb: 'rightclick', x, y });
  if (!r.ok) die(r.error);
  ok({ verb: 'rightclick', x, y, cursor: r.cursor || null });
}

async function actionType(p) {
  if (p.text == null) die('type requires text');
  const r = doInput({ verb: 'type', text: String(p.text) });
  if (!r.ok) die(r.error);
  ok({ typed: String(p.text) });
}

async function actionKey(p) {
  if (p.name == null) die('key requires name (e.g. enter, esc, tab, f5)');
  const r = doInput({ verb: 'key', code: String(p.name) });
  if (!r.ok) die(r.error);
  ok({ key: String(p.name) });
}

async function actionHotkey(p) {
  if (p.combo == null) die('hotkey requires combo (e.g. ctrl+c, alt+tab, win+r)');
  const r = doInput({ verb: 'hotkey', combo: String(p.combo) });
  if (!r.ok) die(r.error);
  ok({ combo: String(p.combo) });
}

async function actionScroll(p) {
  if (p.amount == null) die('scroll requires amount (positive=up, negative=down)');
  const { x, y } = resolveXY(p, false);
  const r = doInput({
    verb:       'scroll',
    amount:     Number(p.amount),
    x:          x != null ? x : undefined,
    y:          y != null ? y : undefined,
    horizontal: !!p.horizontal,
  });
  if (!r.ok) die(r.error);
  ok({ amount: Number(p.amount), horizontal: !!p.horizontal, x, y });
}

async function actionDrag(p) {
  const { x, y, x2, y2 } = p;
  if (x == null || y == null || x2 == null || y2 == null) die('drag requires x, y, x2, y2');
  const r = doInput({ verb: 'drag', x: Number(x), y: Number(y), x2: Number(x2), y2: Number(y2) });
  if (!r.ok) die(r.error);
  ok({ from: [Number(x), Number(y)], to: [Number(x2), Number(y2)], cursor: r.cursor || null });
}

async function actionFindElement(p) {
  if (p.name == null) die('find_element requires name');
  const extra = [];
  if (p.role)  extra.push('--role',  String(p.role));
  if (p.title) extra.push('--title', String(p.title));
  const result = spawnSibling('uia.mjs', ['find', '--name', String(p.name), ...extra]);

  console.log(JSON.stringify(result));
}

async function actionFindText(p) {
  if (p.text == null) die('find_text requires text');
  const result = spawnSibling('ocr.mjs', ['find', '--text', String(p.text)]);

  console.log(JSON.stringify(result));
}

async function actionClickElement(p) {
  if (p.name == null) die('click_element requires name');
  const extra = [];
  if (p.role)  extra.push('--role',  String(p.role));
  if (p.title) extra.push('--title', String(p.title));
  const found = spawnSibling('uia.mjs', ['find', '--name', String(p.name), ...extra]);

  if (!found.ok || !found.found) {
    ok({ clicked: false, reason: found.error || 'element not found', element: null });
    return;
  }
  const center = found.element && found.element.center;
  if (!center || center.x == null || center.y == null) {
    ok({ clicked: false, reason: 'element has no center coordinates', element: found.element });
    return;
  }
  const r = doInput({ verb: 'click', x: center.x, y: center.y });
  if (!r.ok) die(r.error);
  ok({ clicked: true, element: found.element, cursor: r.cursor || null });
}

async function actionClickText(p) {
  if (p.text == null) die('click_text requires text');
  const found = spawnSibling('ocr.mjs', ['find', '--text', String(p.text)]);

  if (!found.ok || !found.found) {
    ok({ clicked: false, reason: found.error || 'text not found', match: null });
    return;
  }
  const center = found.best && found.best.center;
  if (!center || center.x == null || center.y == null) {
    ok({ clicked: false, reason: 'match has no center coordinates', match: found.best });
    return;
  }
  const r = doInput({ verb: 'click', x: center.x, y: center.y });
  if (!r.ok) die(r.error);
  ok({ clicked: true, match: found.best, cursor: r.cursor || null });
}

async function actionWait(p) {
  const ms = Number(p.ms) || 0;
  if (ms > 0) await sleepMs(ms);
  ok({ waited_ms: ms });
}

async function actionDo(p) {
  const { action, args: subArgs = {}, verify, retries = 3 } = p;
  if (!action) die('do requires action');

  const hasClaude = verify != null && claudioAvailable();

  let lastResult = null;
  const maxTries = Math.max(1, Number(retries));

  for (let attempt = 1; attempt <= maxTries; attempt++) {


    const subPayload = JSON.stringify(subArgs);
    const r = spawnSync(
      process.execPath,
      [__filename, action, '--json', subPayload],
      { encoding: 'utf8', timeout: 30_000 }
    );
    let subResult;
    try { subResult = JSON.parse((r.stdout || '').trim()); } catch { subResult = { ok: false, error: r.stderr || 'no output' }; }

    if (!subResult.ok) {
      die(`sub-action "${action}" failed: ${subResult.error}`);
    }

    if (!verify) {
      ok({ action, result: subResult, verified: null });
      return;
    }

    if (!hasClaude) {
      ok({ action, result: subResult, verified: null, note: 'claude CLI not found; skipping verify' });
      return;
    }


    const imgPath = join(tmpdir(), `helm-computer-do-${process.pid}-${attempt}.png`);
    const shot = captureScreen(imgPath);
    if (!shot.ok) {
      ok({ action, result: subResult, verified: null, note: 'screenshot failed: ' + shot.error });
      return;
    }

    let vr;
    try {
      vr = verifyWithClaude(String(verify), imgPath);
    } catch (e) {
      ok({ action, result: subResult, verified: null, note: 'claude verify error: ' + e.message });
      return;
    } finally {
      try { if (existsSync(imgPath)) unlinkSync(imgPath); } catch {}
    }

    if (vr.verified) {
      ok({ action, result: subResult, verified: true, attempts: attempt });
      return;
    }
    lastResult = { attempt, explanation: vr.explanation };
  }


  ok({
    action,
    verified: false,
    attempts: maxTries,
    explanation: lastResult ? lastResult.explanation : 'unknown',
  });
}





const ACTIONS = {
  screenshot:    actionScreenshot,
  size:          actionSize,
  move:          actionMove,
  click:         actionClick,
  double:        actionDouble,
  right:         actionRight,
  type:          actionType,
  key:           actionKey,
  hotkey:        actionHotkey,
  scroll:        actionScroll,
  drag:          actionDrag,
  find_element:  actionFindElement,
  find_text:     actionFindText,
  click_element: actionClickElement,
  click_text:    actionClickText,
  wait:          actionWait,
  do:            actionDo,
};

(async () => {
  const argv    = process.argv.slice(2);
  const action  = argv[0];
  const payload = { ...parseFlags(argv.slice(1)), ...parseJsonArg(argv) };

  if (!action || action === '--help') {
    const list = Object.keys(ACTIONS).join(' | ');
    die(`usage: computer.mjs <action> [--json '{...}']\nactions: ${list}`);
  }

  const fn = ACTIONS[action];
  if (!fn) die(`unknown action "${action}". Valid: ${Object.keys(ACTIONS).join(', ')}`);

  try {
    await fn(payload);
  } catch (e) {
    die(e.message);
  }
})();
