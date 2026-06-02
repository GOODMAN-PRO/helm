#!/usr/bin/env node
// review-day.mjs — sort through the day's owner<->Helm messages and queue every task Helm DECLINED or
// FAILED (a bug, or a missing capability) into the stuck queue, so tonight's self-upgrade builds the
// fix and Helm can do it next time. Reads workspace/conversations/<date>.md (both Discord and terminal
// exchanges are logged there). This is the FINDER; the nightly self-upgrade is the BUILDER.
//
//   node review-day.mjs [YYYY-MM-DD]      (defaults to today)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { recordStuck } from './stuck.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, '..');

// Helm replies that mean "I declined this / it failed" — capability gaps or bugs worth a self-upgrade.
const DECLINE = /\b(can'?t|cannot|unable|not able|don'?t have|do not have|not supported|isn'?t supported|not possible|no (slash )?command|failed|couldn'?t|does ?n'?t work|did ?n'?t work|not reliably|i don'?t (have|support)|beyond what i can|brain error|timed out|hit (the|a)[\w\s-]{0,14}cap)\b/i;
// Soft/clarifying replies that are NOT declines (don't queue these).
const NOT_DECLINE = /^\s*(what|which|where\b|who|when|why|how|do you|want me to|should i|got it|done\b|on it|sure\b|yes\b|here'?s|i'?ll )/i;

// Pull (owner ask, helm reply) pairs out of the conversation transcript.
function pairs(md) {
  const re = /\*\*\[\d\d:\d\d\] owner \(([^)]*)\):\*\*\s*([\s\S]*?)\n\*\*helm:\*\*\s*([\s\S]*?)(?=\n\*\*\[\d\d:\d\d\] owner|\s*$)/g;
  const out = []; let m;
  while ((m = re.exec(md))) out.push({ channel: m[1], ask: m[2].trim(), reply: m[3].trim() });
  return out;
}

function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const file = path.join(WORKSPACE, 'conversations', date + '.md');
  if (!existsSync(file)) {
    console.log(JSON.stringify({ ok: true, date, scanned: 0, queued: 0, note: 'no conversation log for that day' }));
    return;
  }
  const all = pairs(readFileSync(file, 'utf8'));
  const items = [];
  for (const p of all) {
    if (!p.ask || !p.reply) continue;
    if (NOT_DECLINE.test(p.reply)) continue;     // clarifying question / acknowledgement, not a decline
    if (!DECLINE.test(p.reply)) continue;         // no decline/failure language
    const ask = p.ask.replace(/\s+/g, ' ').slice(0, 90);
    const why = p.reply.replace(/\s+/g, ' ').slice(0, 220);
    try { recordStuck(`Couldn't do: "${ask}"`, `On ${date} Helm declined/failed this. Helm said: ${why}`, 'review'); } catch {}
    items.push(ask);
  }
  console.log(JSON.stringify({ ok: true, date, scanned: all.length, queued: items.length, items }));
}

main();
