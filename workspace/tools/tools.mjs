#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync }    from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CircuitBreaker } from './circuit-breaker.mjs';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY   = path.join(__dirname, 'registry.json');
const WORKSPACE  = path.resolve(__dirname, '..');



const CANONICAL_ROOT = path.resolve(WORKSPACE, '..');
const LOCAL_ROOT     = path.resolve(WORKSPACE, '..');

const [,, verb, name, ...rest] = process.argv;

let registry;
try {
  registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
} catch (e) {
  die(`cannot load registry (${REGISTRY}): ${e.message}`);
}

function die(msg, code = 1) { console.error(msg); process.exit(code); }

if (verb === 'list') {
  console.log(JSON.stringify(registry.map(t => ({
    name: t.name,
    summary: t.summary,
    confirm: t.confirm,
  })), null, 2));
  process.exit(0);
}

if (verb === 'call') {
  if (!name) die('usage: tools.mjs call <name> [--json \'{...}\']');
  const tool = registry.find(t => t.name === name);
  if (!tool) die(`unknown tool: ${name}`);



  if (tool.platform && tool.platform !== process.platform) {
    console.error(`${name} is ${tool.platform}-only and this machine is ${process.platform}. Not available here — use a cross-platform tool (shell, files, web, screenshot) instead.`);
    process.exit(4);
  }


  let args = {};
  const jsonIdx = rest.indexOf('--json');
  if (jsonIdx !== -1) {
    const jsonVal = rest[jsonIdx + 1];
    if (!jsonVal || jsonVal.startsWith('--')) die('--json requires a JSON string value');
    try { args = JSON.parse(jsonVal); } catch (e) { die(`bad --json: ${e.message}`); }
  }


  if (tool.confirm && !rest.includes('--force')) {
    console.error(`CONFIRM REQUIRED: ${tool.name}`);
    console.error(`Summary: ${tool.summary}`);
    console.error(`Side effects: ${tool.side_effects}`);
    console.error(`Proposed args: ${JSON.stringify(args)}`);
    console.error(`Re-run with --force flag after owner approves.`);
    process.exit(2);
  }


  if (typeof tool.exec !== 'string' || !tool.exec) die(`tool ${name}: registry entry missing exec`);

  const localExec = LOCAL_ROOT !== CANONICAL_ROOT
    ? tool.exec.replace(CANONICAL_ROOT, LOCAL_ROOT)
    : tool.exec;
  const argv = localExec.split(' ');
  const cmd  = argv[0];
  const cmdArgs = argv.slice(1);
  for (const [k, v] of Object.entries(args)) {
    cmdArgs.push(`--${k}`, String(v));
  }

  const cb = new CircuitBreaker(name);
  const blocked = cb.guard();
  if (blocked) { console.error('CIRCUIT BREAKER: ' + blocked); process.exit(3); }

  const r = spawnSync(cmd, cmdArgs, { cwd: WORKSPACE, encoding: 'utf8', stdio: 'inherit' });
  if (r.error) { cb.onFailure(); die(`exec failed (${cmd}): ${r.error.message}`); }

  if (r.status === 0) cb.onSuccess();
  else if (r.status !== 2) cb.onFailure();
  process.exit(r.status ?? 1);
}

die('verbs: list | call');
