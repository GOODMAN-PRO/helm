#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


function parseEdits(text) {
  const blocks = [];
  const parts = text.split(/^<<<OLD /m);
  for (const part of parts.slice(1)) {
    const firstNL = part.indexOf('\n');
    if (firstNL === -1) continue;
    const file = part.slice(0, firstNL).trim();
    const rest = part.slice(firstNL + 1);
    const sepIdx = rest.indexOf('\n===\n');
    const endIdx = rest.indexOf('\n>>>NEW');
    if (sepIdx === -1 || endIdx === -1) continue;
    const oldStr = rest.slice(0, sepIdx);
    const newStr = rest.slice(sepIdx + 5, endIdx);
    blocks.push({ file, old: oldStr, new: newStr });
  }
  return blocks;
}

export function applyEdits(text, cwd = process.cwd()) {
  const blocks = parseEdits(text);
  const applied = [];
  const errors = [];

  for (const block of blocks) {
    const absPath = path.resolve(cwd, block.file);
    let content;
    try {
      content = readFileSync(absPath, 'utf8');
    } catch (e) {
      errors.push({ file: block.file, error: `cannot read: ${e.message}` });
      continue;
    }


    const count = content.split(block.old).length - 1;
    if (count === 0) {
      errors.push({ file: block.file, error: 'OLD block not found in file (0 matches)' });
      continue;
    }
    if (count > 1) {
      errors.push({ file: block.file, error: `OLD block ambiguous (${count} matches); narrow the context` });
      continue;
    }

    const updated = content.replace(block.old, block.new);
    writeFileSync(absPath, updated);


    if (/\.(m?js|cjs)$/.test(block.file)) {
      const check = spawnSync('node', ['--check', absPath], { encoding: 'utf8' });
      if (check.status !== 0) {
        spawnSync('git', ['-C', cwd, 'checkout', '--', block.file], { encoding: 'utf8' });
        errors.push({
          file: block.file,
          error: `node --check failed (reverted): ${(check.stderr || '').slice(0, 300)}`,
        });
        continue;
      }
    }

    const diff = spawnSync('git', ['-C', cwd, 'diff', '--', block.file], { encoding: 'utf8' }).stdout;
    applied.push({ file: block.file, diff });
  }

  return {
    applied: applied.length,
    diffs: applied.map(a => a.diff).join('\n'),
    errors,
  };
}


if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const cwdIdx = argv.indexOf('--cwd');
  const cwd = cwdIdx >= 0 ? argv[cwdIdx + 1] : process.cwd();

  let text = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { text += d; });
  process.stdin.on('end', () => {
    const result = applyEdits(text, cwd);
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exit(1);
  });
}
