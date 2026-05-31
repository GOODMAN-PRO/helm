#!/usr/bin/env node
// Notification poller daemon.
// Every 30s, checks: Messages unread count, Calendar next event, Mail unread count.
// Records changes in events.db.
//
// Usage:
//   node poller.mjs [--interval 30] [--once]
//
// Privacy: reads local macOS data only. Nothing leaves the machine.
// Permissions required:
//   - Messages: Full Disk Access (to read ~/Library/Messages/chat.db)
//   - Calendar: Automation > Calendar.app
//   - Mail: Automation > Mail.app

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, statSync, truncateSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.join(__dirname, 'events.db');
const CHAT_DB   = `${process.env.HOME}/Library/Messages/chat.db`;

// Truncate logs at startup if they exceed 5 MB to prevent unbounded growth.
const LOG_CAP = 5 * 1024 * 1024;
for (const lf of [path.join(__dirname, 'poller.log'), path.join(__dirname, 'poller.err')]) {
  try { if (statSync(lf).size > LOG_CAP) truncateSync(lf, 0); } catch {}
}

const args     = process.argv.slice(2);
const iFlag    = args.indexOf('--interval');
const INTERVAL = iFlag !== -1 ? parseInt(args[iFlag + 1], 10) * 1000 : 30000;
const ONCE     = args.includes('--once');

// One-time warning tracker (don't spam stderr on every tick)
const warned = new Set();
function warnOnce(key, msg) {
  if (!warned.has(key)) { warned.add(key); process.stderr.write(`[notify] ${msg}\n`); }
}

// DB init (idempotent)
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           INTEGER NOT NULL,
    source       TEXT    NOT NULL,
    kind         TEXT    NOT NULL,
    summary      TEXT,
    payload_json TEXT
  );
  CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
`);

const insertEvent = db.prepare(
  'INSERT INTO events (ts, source, kind, summary, payload_json) VALUES (?,?,?,?,?)'
);

// ---- Messages ----
// Reuses the snapshot approach from imessage.js: open chat.db read-only via cp.
// node:sqlite can't open WAL databases shared by another process safely, so we
// copy first (same pattern used elsewhere in Helm).
function getMessagesUnread() {
  if (!existsSync(CHAT_DB)) {
    warnOnce('chat-db', 'chat.db not found — Messages never opened or Full Disk Access missing');
    return null;
  }
  const tmp = `/tmp/helm-chat-snapshot-${Date.now()}.db`;
  let snap = null;
  let result = null;
  try {
    execFileSync('cp', [CHAT_DB, tmp], { timeout: 5000 });
    snap = new DatabaseSync(tmp);
    const row = snap.prepare(
      "SELECT COUNT(*) as n FROM message WHERE is_read=0 AND is_from_me=0 AND item_type=0"
    ).get();
    result = row?.n ?? 0;
  } catch (e) {
    warnOnce('chat-read', `Cannot read chat.db: ${e.message}`);
  } finally {
    try { snap?.close(); } catch {}
    try { execFileSync('rm', ['-f', tmp]); } catch {}
  }
  return result;
}

// ---- Calendar ----
// Range filter uses _and: a single object with two `startDate` keys collapses to one in JS,
// which silently returns everything before `end` (incl. years of past holidays).
const JXA_CAL = `
  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const evs = [];
  for (const cal of Application('Calendar').calendars()) {
    const matches = cal.events.whose({
      _and: [
        { startDate: { _greaterThan: now } },
        { startDate: { _lessThan: end } }
      ]
    })();
    for (const ev of matches) {
      evs.push({ title: ev.summary(), start: ev.startDate().toISOString() });
    }
  }
  evs.sort((a,b) => a.start < b.start ? -1 : 1);
  JSON.stringify(evs.slice(0,5));
`;

function getCalendarNext() {
  try {
    const r = spawnSync('osascript', ['-l', 'JavaScript', '-e', JXA_CAL],
      { encoding: 'utf8', timeout: 25000 });
    if (r.status !== 0) {
      warnOnce('cal-perm', `Calendar JXA failed (permission missing?): ${r.stderr?.trim()}`);
      return null;
    }
    return JSON.parse(r.stdout.trim());
  } catch {
    warnOnce('cal-err', 'Calendar polling failed');
    return null;
  }
}

// ---- Mail ----
const JXA_MAIL = `
  const mail = Application('Mail');
  mail.includeStandardAdditions = true;
  JSON.stringify({ unread: mail.inbox.unreadCount() });
`;

function getMailUnread() {
  try {
    const r = spawnSync('osascript', ['-l', 'JavaScript', '-e', JXA_MAIL],
      { encoding: 'utf8', timeout: 8000 });
    if (r.status !== 0) {
      warnOnce('mail-perm', `Mail JXA failed (permission missing?): ${r.stderr?.trim()}`);
      return null;
    }
    return JSON.parse(r.stdout.trim()).unread ?? null;
  } catch {
    warnOnce('mail-err', 'Mail polling failed');
    return null;
  }
}

// Track previous values to detect changes
let prev = { messages: null, calendar: null, mail: null };

function tick() {
  const ts = Date.now();

  const msgs = getMessagesUnread();
  if (msgs !== null && msgs !== prev.messages) {
    insertEvent.run(ts, 'messages', 'unread_count',
      `Unread Messages: ${msgs}`, JSON.stringify({ count: msgs }));
    prev.messages = msgs;
  }

  const calEvents = getCalendarNext();
  if (calEvents !== null) {
    const sig = JSON.stringify(calEvents);
    if (sig !== prev.calendar) {
      const next = calEvents[0];
      const summary = next ? `Next: ${next.title} at ${next.start}` : 'No upcoming events';
      insertEvent.run(ts, 'calendar', 'upcoming', summary, sig);
      prev.calendar = sig;
    }
  }

  const mail = getMailUnread();
  if (mail !== null && mail !== prev.mail) {
    insertEvent.run(ts, 'mail', 'unread_count',
      `Unread Mail: ${mail}`, JSON.stringify({ count: mail }));
    prev.mail = mail;
  }

  process.stdout.write(`[notify] tick ts=${ts} msgs=${msgs} cal=${calEvents?.length ?? 'n/a'} mail=${mail}\n`);
}

if (ONCE) {
  tick();
} else {
  process.stdout.write(`[notify] poller started interval=${INTERVAL/1000}s\n`);
  tick();
  setInterval(tick, INTERVAL);
}
