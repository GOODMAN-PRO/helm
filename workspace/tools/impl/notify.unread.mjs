#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { macOnlyOrExit } from './mac-only.mjs';

macOnlyOrExit('notify.unread');
const CHAT_DB = `${process.env.HOME}/Library/Messages/chat.db`;

function getMessagesUnread() {
  if (!existsSync(CHAT_DB)) {
    return { value: null, warning: 'chat.db not found (Full Disk Access may be missing)' };
  }
  const tmp = `/tmp/helm-chat-unread-${Date.now()}.db`;
  try {
    execFileSync('cp', [CHAT_DB, tmp], { timeout: 5000 });
    const snap = new DatabaseSync(tmp);
    const row = snap.prepare(
      "SELECT COUNT(*) as n FROM message WHERE is_read=0 AND is_from_me=0 AND item_type=0"
    ).get();
    snap.close();
    execFileSync('rm', ['-f', tmp]);
    return { value: row?.n ?? 0 };
  } catch (e) {
    return { value: null, warning: `Cannot read chat.db: ${e.message}` };
  }
}

const JXA_CAL_NEXT = `
  const now = new Date();
  const end = new Date(now.getTime() + 24*60*60*1000);
  const evs = [];
  for (const c of Application('Calendar').calendars()) {
    const matches = c.events.whose({
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
  JSON.stringify(evs.slice(0,1));
`;

function getCalendarNext() {
  try {
    const r = spawnSync('osascript', ['-l', 'JavaScript', '-e', JXA_CAL_NEXT],
      { encoding: 'utf8', timeout: 25000 });
    if (r.status !== 0) {
      return { value: null, warning: `Calendar inaccessible (grant Automation > Calendar): ${r.stderr?.trim()}` };
    }
    const raw = r.stdout.trim();
    const cleaned = raw.replace(/^"|"$/g, '').replace(/\\"/g, '"');
    const evs = JSON.parse(cleaned.startsWith('[') ? cleaned : raw);
    return { value: evs[0] ?? null };
  } catch (e) {
    return { value: null, warning: `Calendar query failed: ${e.message}` };
  }
}

const JXA_MAIL = `JSON.stringify({ unread: Application('Mail').inbox.unreadCount() });`;

function getMailUnread() {
  try {
    const r = spawnSync('osascript', ['-l', 'JavaScript', '-e', JXA_MAIL],
      { encoding: 'utf8', timeout: 8000 });
    if (r.status !== 0) {
      return { value: null, warning: `Mail inaccessible (grant Automation > Mail): ${r.stderr?.trim()}` };
    }
    return { value: JSON.parse(r.stdout.trim()).unread };
  } catch (e) {
    return { value: null, warning: `Mail query failed: ${e.message}` };
  }
}

const msgs = getMessagesUnread();
const cal  = getCalendarNext();
const mail = getMailUnread();

const result = {
  messages: msgs.value,
  calendar: cal.value,
  mail:     mail.value
};

const warnings = [];
if (msgs.warning) warnings.push({ source: 'messages', warning: msgs.warning });
if (cal.warning)  warnings.push({ source: 'calendar',  warning: cal.warning });
if (mail.warning) warnings.push({ source: 'mail',      warning: mail.warning });
if (warnings.length) result.warnings = warnings;

console.log(JSON.stringify(result));
