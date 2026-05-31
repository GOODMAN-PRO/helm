#!/usr/bin/env node
// Helm tool dispatcher.
// Usage:
//   tools.mjs list
//   tools.mjs call <name> [--json '{"key":"val"}']

import { readFileSync } from 'node:fs';
import { spawnSync }    from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY   = path.join(__dirname, 'registry.json');
const WORKSPACE  = path.resolve(__dirname, '..');

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

  // Parse --json arg
  let args = {};
  const jsonIdx = rest.indexOf('--json');
  if (jsonIdx !== -1) {
    const jsonVal = rest[jsonIdx + 1];
    if (!jsonVal || jsonVal.startsWith('--')) die('--json requires a JSON string value');
    try { args = JSON.parse(jsonVal); } catch (e) { die(`bad --json: ${e.message}`); }
  }

  // Enforce confirm gate: tools with confirm:true require --force
  if (tool.confirm && !rest.includes('--force')) {
    console.error(`CONFIRM REQUIRED: ${tool.name}`);
    console.error(`Summary: ${tool.summary}`);
    console.error(`Side effects: ${tool.side_effects}`);
    console.error(`Proposed args: ${JSON.stringify(args)}`);
    console.error(`Re-run with --force flag after owner approves.`);
    process.exit(2);
  }

  // Build argv: each key=value as --key value
  if (typeof tool.exec !== 'string' || !tool.exec) die(`tool ${name}: registry entry missing exec`);
  const argv = tool.exec.split(' ');
  const cmd  = argv[0];
  const cmdArgs = argv.slice(1);
  for (const [k, v] of Object.entries(args)) {
    cmdArgs.push(`--${k}`, String(v));
  }

  const r = spawnSync(cmd, cmdArgs, { cwd: WORKSPACE, encoding: 'utf8', stdio: 'inherit' });
  if (r.error) die(`exec failed (${cmd}): ${r.error.message}`);
  process.exit(r.status ?? 1);
}

die('verbs: list | call');
