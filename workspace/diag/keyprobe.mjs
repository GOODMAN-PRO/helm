#!/usr/bin/env node
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(dir, 'keyprobe.out');
mkdirSync(dir, { recursive: true });
writeFileSync(outFile, `keyprobe ${new Date().toISOString()}\n` + `terminal: ${process.env.TERM_PROGRAM || ''} ${process.env.WT_SESSION ? 'WindowsTerminal' : ''} ${process.env.TERM || ''}\n\n`);

const stdin = process.stdin;
const ESC = '\x1b';
process.stdout.write(`${ESC}[?2004h${ESC}[>4;2m`);

function show(buf) {
  let s = '';
  for (const b of buf) {
    if (b === 0x1b) s += '\\e';
    else if (b >= 0x20 && b < 0x7f) s += String.fromCharCode(b);
    else s += '\\x' + b.toString(16).padStart(2, '0');
  }
  const hex = [...buf].map(b => b.toString(16).padStart(2, '0')).join(' ');
  return { s, hex };
}

const order = ['Enter', 'Shift+Enter', 'Ctrl+Enter', 'Alt+Enter', 'Tab', 'Backspace'];
let i = 0;
function prompt() {
  if (i < order.length) process.stdout.write(`\r\n[${i + 1}/${order.length}] press  ${order[i]}   (or q to quit)\r\n`);
  else process.stdout.write(`\r\nDone — press q to quit.\r\n`);
}

if (stdin.isTTY) stdin.setRawMode(true);
stdin.resume();
process.stdout.write(`keyprobe — recording what your terminal sends. Saved to:\r\n  ${outFile}\r\n`);
prompt();

stdin.on('data', chunk => {
  if (chunk.length === 1 && (chunk[0] === 0x71 || chunk[0] === 0x03)) return quit();
  const { s, hex } = show(chunk);
  const label = i < order.length ? order[i] : `extra-${i}`;
  appendFileSync(outFile, `${label.padEnd(12)} | ${hex.padEnd(30)} | ${s}\n`);
  process.stdout.write(`   ${label}: ${s}    [${hex}]\r\n`);
  i++;
  prompt();
});

function quit() {
  process.stdout.write(`${ESC}[>4;0m${ESC}[?2004l`);
  try { if (stdin.isTTY) stdin.setRawMode(false); } catch {}
  process.stdout.write(`\r\nsaved -> ${outFile}\r\n`);
  process.exit(0);
}
