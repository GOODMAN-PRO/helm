#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

function queuePath()   { return process.env.HELM_STUCK_QUEUE   || path.join(DIR, 'stuck-queue.jsonl'); }
function archivePath() { return process.env.HELM_STUCK_ARCHIVE || path.join(DIR, 'stuck-archive.jsonl'); }
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);

export function readAll() {
  const q = queuePath();
  if (!existsSync(q)) return [];
  return readFileSync(q, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
function writeAll(items) { writeFileSync(queuePath(), items.map(i => JSON.stringify(i)).join('\n') + (items.length ? '\n' : '')); }

// Record a stuck event. Returns the (new or bumped) entry.
// Summaries starting with `__smoke` (or `__test`) are dropped without persistence — they are
// test-only markers and historically polluted stuck-archive.jsonl on every nightly run.
export function recordStuck(summary, detail = '', source = 'auto') {
  summary = (summary || '').toString().trim().slice(0, 300);
  if (!summary) return null;
  if (/^__(smoke|test)/i.test(summary)) return null;
  const items = readAll();
  const key = norm(summary);
  const now = new Date().toISOString();
  const existing = items.find(i => norm(i.summary) === key);
  if (existing) {
    existing.count = (existing.count || 1) + 1; existing.lastSeen = now;
    if (detail) existing.detail = detail.toString().slice(0, 1000);
    writeAll(items); return existing;
  }
  const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), summary,
    detail: (detail || '').toString().slice(0, 1000), source, count: 1, firstSeen: now, lastSeen: now, status: 'open' };
  items.push(entry); writeAll(items); return entry;
}

export function listStuck(openOnly = true) { return readAll().filter(i => !openOnly || i.status !== 'resolved'); }




export function processStuckMarkers(replyText, userText = '') {
  let recorded = false;
  const text = (replyText || '').replace(/\[STUCK:\s*([^\]]+)\]/gi, (_m, s) => {
    try { recordStuck(s.trim(), (userText || '').slice(0, 200), 'self'); recorded = true; } catch {}
    return '';
  });
  return { text, recorded };
}

// Phrases that signal a real capability limit (not idioms like "can't wait").
const CANT_PATTERNS = [
  /\b(?:i|i'?m)\s+(?:can'?t|cannot|can not|am unable to|am not able to|won'?t be able to|wasn'?t able to|couldn'?t)\b[^.!?\n]*/i,
  /\bi\s+(?:don'?t|do not)\s+have\s+(?:the\s+)?(?:ability|a way|access|tools?|permission|capability|means)\b[^.!?\n]*/i,
  /\b(?:that'?s|this is)\s+(?:not\s+something\s+i\s+can|beyond\s+(?:what\s+i\s+can|my))\b[^.!?\n]*/i,
  /\bi\s+(?:lack|don'?t\s+support)\b[^.!?\n]*/i,
  /\bnot\s+(?:currently\s+)?(?:supported|implemented|possible for me)\b[^.!?\n]*/i,
  /\bi\s+don'?t\s+(?:have|know how)\s+to\b[^.!?\n]*/i,
];
const CANT_IDIOMS = /can'?t\s+(?:wait|go wrong|thank|believe|help but|complain|argue)/i;



export function autoCaptureCant(text, userText = '') {
  if (!text) return null;
  for (const re of CANT_PATTERNS) {
    const m = text.match(re);
    if (m && !CANT_IDIOMS.test(m[0])) {
      const snippet = m[0].replace(/\s+/g, ' ').trim().slice(0, 160);
      return recordStuck(`Said it can't: "${snippet}"`, `Owner asked: ${(userText || '').slice(0, 200)}`, 'auto-cant');
    }
  }
  return null;
}


export function renderStuckForPrompt() {
  const open = listStuck(true);
  if (!open.length) return '';
  return open.map((i, n) => `${n + 1}. (seen ${i.count}x, ${i.source}) ${i.summary}${i.detail ? `\n   detail: ${i.detail}` : ''}`).join('\n');
}



export function archiveAll() {
  const items = readAll(); if (!items.length) return 0;
  const stamp = new Date().toISOString();
  for (const i of items) { i.status = 'archived'; i.archivedAt = stamp; }
  try { appendFileSync(archivePath(), items.map(i => JSON.stringify(i)).join('\n') + '\n'); } catch {}
  writeAll([]); return items.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'add') { const e = recordStuck(rest[0], rest[1] || '', 'cli'); console.log(e ? `recorded: ${e.summary} (x${e.count})` : 'nothing recorded'); }
  else if (cmd === 'list') { const o = listStuck(); console.log(o.length ? o.map(i => `- (${i.count}x) [${i.source}] ${i.summary}`).join('\n') : '(stuck queue empty)'); }
  else if (cmd === 'render') { console.log(renderStuckForPrompt() || '(empty)'); }
  else if (cmd === 'archive') { console.log(`archived ${archiveAll()} item(s)`); }
  else console.log('usage: stuck.mjs add "<summary>" ["<detail>"] | list | render | archive');
}
