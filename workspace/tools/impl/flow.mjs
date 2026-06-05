#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT      = path.resolve(__dirname, '..', '..', '..');

const WORKSPACE = path.resolve(__dirname, '..', '..');
const FLOWS_DIR = path.join(WORKSPACE, 'flows');
const TOOLS_MJS = path.join(WORKSPACE, 'tools', 'tools.mjs');


if (!existsSync(FLOWS_DIR)) {
  mkdirSync(FLOWS_DIR, { recursive: true });
}




const argv = process.argv.slice(2);
const verb = argv[0];





const getFlag = (k) => {
  const i = argv.indexOf(`--${k}`);
  if (i === -1) return null;

  const parts = [];
  for (let j = i + 1; j < argv.length; j++) {
    if (argv[j].startsWith('--')) break;
    parts.push(argv[j]);
  }
  return parts.length > 0 ? parts.join(' ') : null;
};

function die(msg) {
  console.log(JSON.stringify({ ok: false, error: String(msg) }));
  process.exit(0);
}




function flowPath(name) {

  const safe = name.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return path.join(FLOWS_DIR, `${safe}.json`);
}

function loadFlow(name) {
  const fp = flowPath(name);
  if (!existsSync(fp)) return null;
  try {
    return JSON.parse(readFileSync(fp, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveFlow(name, steps) {
  const fp = flowPath(name);
  const flow = { name, steps, created: new Date().toISOString() };
  writeFileSync(fp, JSON.stringify(flow, null, 2), 'utf8');
  return flow;
}

function listFlows() {
  let files = [];
  try { files = readdirSync(FLOWS_DIR); } catch {}
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(readFileSync(path.join(FLOWS_DIR, f), 'utf8'));
        return { name: data.name, steps: (data.steps || []).length, created: data.created };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}




function interpolate(str, vars) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const parts = path.trim().split('.');
    let val = vars;
    for (const part of parts) {
      if (val == null || typeof val !== 'object') return match;
      val = val[part];
    }
    if (val === undefined || val === null) return match;
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  });
}


function interpolateDeep(obj, vars) {
  if (typeof obj === 'string') return interpolate(obj, vars);
  if (Array.isArray(obj)) return obj.map(v => interpolateDeep(v, vars));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = interpolateDeep(v, vars);
    return out;
  }
  return obj;
}

















const SAFE_TOKEN_RE = /^[\s\d.+\-*"'`a-zA-Z_$()[\]{}:,!<>=&|?;]+$/;
const ALLOWED_RE    = /^(?:[\s\d.]*|"[^"]*"|'[^']*'|true|false|null|undefined|vars(?:\.[a-zA-Z_$][\w$]*)*|==|!=|===|!==|<=|>=|<|>|&&|\|\||!|\(|\)|\s)*$/;

function evalCondition(condStr, vars) {
  if (!condStr || typeof condStr !== 'string') return true;
  const trimmed = condStr.trim();
  if (!trimmed) return true;



  const stripped = trimmed
    .replace(/\s+/g, ' ')
    .replace(/"[^"]*"/g, '""')    // remove string contents
    .replace(/'[^']*'/g, "''");   // remove string contents

  // Check that every token is in the allowed set
  const tokenCheck = /^(?:vars(?:\.[a-zA-Z_$][\w$]*)*|[0-9]+(?:\.[0-9]+)?|""|''|true|false|null|undefined|==|!==|===|!=|<=|>=|<|>|&&|\|\||!|\(|\)|\s+)*$/;
  if (!tokenCheck.test(stripped)) {
    // Fall back to literal boolean parsing
    if (trimmed === 'true')  return true;
    if (trimmed === 'false') return false;
    return false;
  }

  try {


    const fn = new Function('vars', `"use strict"; return Boolean(${trimmed});`);
    return fn(vars);
  } catch {
    return false;
  }
}






function runStep(step, vars) {

  let result = { stepId: step.id || null, skipped: false, raw: null, parsed: null, error: null };


  if (step.when !== undefined) {
    const cond = evalCondition(interpolate(step.when, vars), vars);
    if (!cond) {
      result.skipped = true;
      result.raw = `[skipped: when="${step.when}" evaluated false]`;
      return result;
    }
  }

  if (step.tool) {

    const toolName = interpolate(step.tool, vars);
    let argsObj = step.args || {};
    if (typeof argsObj === 'string') {
      try { argsObj = JSON.parse(interpolate(argsObj, vars)); } catch { argsObj = {}; }
    } else {
      argsObj = interpolateDeep(argsObj, vars);
    }
    const argsJson = JSON.stringify(argsObj);

    const r = spawnSync(
      'node',
      [TOOLS_MJS, 'call', toolName, '--json', argsJson],
      { cwd: ROOT, encoding: 'utf8', timeout: 60000 }
    );
    result.raw = (r.stdout || '') + (r.stderr || '');
    if (r.error) {
      result.error = `spawn error: ${r.error.message}`;
    } else {
      // Try to parse stdout as JSON
      const stdout = (r.stdout || '').trim();
      try { result.parsed = JSON.parse(stdout); } catch { result.parsed = null; }
      result.raw = stdout || (r.stderr || '').trim();
      if (r.status !== 0 && !result.parsed) {
        result.error = `tool exited ${r.status}: ${(r.stderr || '').trim().slice(0, 300)}`;
      }
    }
  } else if (step.exec) {
    // Shell command: run from ROOT so paths like "node workspace/tools/impl/x.mjs" resolve correctly.
    // Interpolate tokens before running.
    const cmd = interpolate(step.exec, vars);
    let spawnArgs;
    if (process.platform === 'win32') {
      spawnArgs = ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd]];
    } else {
      spawnArgs = ['sh', ['-c', cmd]];
    }
    const r = spawnSync(spawnArgs[0], spawnArgs[1], {
      cwd: ROOT, encoding: 'utf8', timeout: 60000
    });
    const stdout = (r.stdout || '').trim();
    const stderr = (r.stderr || '').trim();
    result.raw = stdout || stderr;
    if (r.error) {
      result.error = `spawn error: ${r.error.message}`;
    } else {
      try { result.parsed = JSON.parse(stdout); } catch { result.parsed = null; }
      if (r.status !== 0 && !result.error) {
        result.error = `exited ${r.status}: ${stderr.slice(0, 300)}`;
      }
    }
  } else {
    result.error = 'step has neither tool nor exec';
  }

  return result;
}





if (verb === 'list') {
  const flows = listFlows();
  console.log(JSON.stringify({ ok: true, flows }));
  process.exit(0);
}

if (verb === 'show') {
  const name = getFlag('name');
  if (!name) die('show requires --name <n>');
  const flow = loadFlow(name);
  if (!flow) die(`flow not found: ${name}`);
  console.log(JSON.stringify({ ok: true, name: flow.name, created: flow.created, steps: flow.steps }));
  process.exit(0);
}

if (verb === 'save') {
  const name        = getFlag('name');
  const jsonStr     = getFlag('json');
  const jsonFile    = getFlag('json-file');
  if (!name) die('save requires --name <n>');
  if (!jsonStr && !jsonFile) die('save requires --json <steps array> or --json-file <path>');
  let steps;
  try {
    let src = jsonStr;
    if (!src && jsonFile) {
      src = readFileSync(jsonFile, 'utf8');
    }
    steps = JSON.parse(src);
  } catch (e) {
    die(`bad --json: ${e.message}`);
  }
  if (!Array.isArray(steps)) die('steps must be a JSON array');

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s.tool && !s.exec) die(`step ${i}: must have tool or exec`);
  }
  const flow = saveFlow(name, steps);
  console.log(JSON.stringify({ ok: true, saved: flow.name, stepCount: steps.length, path: flowPath(name) }));
  process.exit(0);
}

if (verb === 'run') {
  const name      = getFlag('name');
  const varsStr   = getFlag('vars');
  const varsFile  = getFlag('vars-file');
  if (!name) die('run requires --name <n>');

  const flow = loadFlow(name);
  if (!flow) die(`flow not found: ${name}`);

  let vars = {};
  if (varsStr || varsFile) {
    try {
      const src = varsStr || readFileSync(varsFile, 'utf8');
      vars = JSON.parse(src);
    } catch (e) { die(`bad --vars: ${e.message}`); }
  }

  const steps   = flow.steps || [];
  const results = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let stepResult;
    try {
      stepResult = runStep(step, vars);
    } catch (e) {
      stepResult = { stepId: step.id || null, skipped: false, raw: null, parsed: null, error: String(e) };
    }


    if (!stepResult.skipped && step.saveAs) {
      vars[step.saveAs] = stepResult.parsed !== null ? stepResult.parsed : stepResult.raw;
    }

    results.push({
      index: i,
      id: step.id || null,
      tool: step.tool || null,
      exec: step.exec || null,
      skipped: stepResult.skipped || false,
      raw: stepResult.raw,
      parsed: stepResult.parsed,
      error: stepResult.error || null,
      savedAs: (!stepResult.skipped && step.saveAs) ? step.saveAs : null,
    });
  }

  console.log(JSON.stringify({ ok: true, name, results, vars }));
  process.exit(0);
}

if (verb === 'delete') {
  const name = getFlag('name');
  if (!name) die('delete requires --name <n>');
  const fp = flowPath(name);
  if (!existsSync(fp)) die(`flow not found: ${name}`);
  try {
    unlinkSync(fp);
    console.log(JSON.stringify({ ok: true, deleted: name }));
  } catch (e) {
    die(`delete failed: ${e.message}`);
  }
  process.exit(0);
}


die(`unknown verb: ${verb || '(none)'}. verbs: list | show | save | run | delete`);
