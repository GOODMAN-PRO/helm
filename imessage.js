// Helm — iMessage node (macOS).
//
//   iMessage from you  ->  claude -p  (your subscription, full tools)  ->  reply
//
// Reads new incoming messages from the Messages SQLite DB (needs Full Disk Access),
// sends replies via AppleScript. Owner-locked to a single handle. Same brain as Discord.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { getSession, setSession, deleteSession } from './workspace/sessions.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, '.env') });

const {
  CLAUDE_BIN = 'claude',
  MODEL = 'sonnet',
  PERMISSION_MODE = 'bypassPermissions',
} = process.env;
const WORKSPACE = path.resolve(__dirname, process.env.WORKSPACE || './workspace');
const CHAT_DB = path.join(os.homedir(), 'Library/Messages/chat.db');

// One or more of YOUR handles (comma-separated): the self-thread you text the bot in.
const OWNERS = (process.env.IMESSAGE_OWNER || '').split(',').map(s => s.trim()).filter(Boolean);
if (OWNERS.length === 0) {
  console.error('✋ Missing IMESSAGE_OWNER in .env (your phone/email — the self-thread you text the bot in)');
  process.exit(1);
}
const digitsOnly = s => (s || '').replace(/[^0-9]/g, '');
// Match an incoming handle against any owner handle. Emails: exact (case-insensitive).
// Phones: compare digits, tolerant of +country/format differences (last >=9 digits align).
function isOwner(h) {
  const hl = (h || '').toLowerCase();
  for (const o of OWNERS) {
    if (hl === o.toLowerCase()) return true;
    if (h.includes('@') || o.includes('@')) continue;
    const a = digitsOnly(h), b = digitsOnly(o);
    if (a && b && Math.min(a.length, b.length) >= 9 && (a.endsWith(b) || b.endsWith(a))) return true;
  }
  return false;
}
mkdirSync(WORKSPACE, { recursive: true });

// Returns an --mcp-config value: the path to workspace/mcp/servers.json when valid,
// or an inline empty-servers JSON as a fallback so Helm always starts even if the
// config file is missing or malformed.
function mcpConfigArg() {
  const p = path.join(__dirname, 'workspace/mcp/servers.json');
  try { JSON.parse(readFileSync(p, 'utf8')); return p; }
  catch { return '{"mcpServers":{}}'; }
}

const PERSONA =
  'You are Helm, a personal AI agent talking to your owner over iMessage. ' +
  "You run on their own machine with full tools (shell, files, web) — act, don't just advise. " +
  'Keep replies short and chat-friendly; this is a text thread, not a document. ' +
  'Your long-term memory is CLAUDE.md in the working directory — read it, and append durable ' +
  'facts about your owner or ongoing work. Confirm before anything destructive, irreversible, ' +
  'or that spends money. ' +
  'You have full authority over this Mac — shell, files, GUI (screenshot + guicontrol clicks/typing), ' +
  'the scheduler, and your own source code. Act boldly and proactively. ' +
  'NEVER touch ~/helm or the Helm Supabase/daemon (com.helm.agent) — a separate project, strictly off-limits.';

// ---- unified session (shared with Discord — one owner, one brain thread) ----
// Key is always 'owner'; the handle is used only for sending replies.

// ---- the brain: one Claude run on your subscription ----
// cap: 30 min for chat messages.
function runClaude(args, prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, { cwd: WORKSPACE });
    let out = '', err = '';
    const kill = setTimeout(() => { child._timedOut = true; child.kill(); }, 30 * 60_000); // 30-min cap for chat
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(kill); reject(e); });
    child.on('close', code => {
      clearTimeout(kill);
      if (child._timedOut) return reject(Object.assign(new Error('hit 30-min cap'), { timedOut: true }));
      if (code === 0) resolve(out);
      else reject(new Error(err.trim() || `claude exited ${code}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function ask(handle, prompt) {
  const base = [
    '-p', '--output-format', 'json',
    '--model', MODEL,
    '--permission-mode', PERMISSION_MODE,
    '--append-system-prompt', PERSONA,
    '--add-dir', WORKSPACE,
    '--add-dir', '/Users/owner', // full home access (ultimate powers); ~/helm stays off-limits per persona
    '--strict-mcp-config', '--mcp-config', mcpConfigArg(), // workspace/mcp/servers.json (filesystem + fetch)
  ];
  const sid = getSession('owner');
  const args = sid ? [...base, '--resume', sid] : base;
  let out;

  // Heartbeat: after 30s with no reply, send "still working..." every 60s.
  let hbStart, hbInterval;
  hbStart = setTimeout(() => {
    try { sendiMessage('still working...', handle); } catch { /* ignore */ }
    hbInterval = setInterval(() => {
      try { sendiMessage('still working...', handle); } catch { /* ignore */ }
    }, 60_000);
  }, 30_000);

  try {
    out = await runClaude(args, prompt);
    clearTimeout(hbStart);
    clearInterval(hbInterval);
  } catch (e) {
    clearTimeout(hbStart);
    clearInterval(hbInterval);
    if (e.timedOut || !sid) throw e;
    deleteSession('owner');
    out = await runClaude(base, prompt);
  }
  try {
    const j = JSON.parse(out);
    if (j.session_id) setSession('owner', j.session_id, 'imessage');
    return (j.result ?? '').toString().trim() || '(empty reply)';
  } catch {
    return out.trim() || '(no output)';
  }
}

// ---- decode Messages' attributedBody blob (modern macOS stores text there, not in `text`) ----
// Verified layout (this macOS): "NSString" <01 94 84 01 2B> <len> <utf8 text> <0x86 terminator>.
// `len` uses typedstream int encoding: a single byte, or 0x81 + u16 LE, or 0x82 + u32 LE.
function decodeAttributedBody(hex) {
  if (!hex) return '';
  const buf = Buffer.from(hex, 'hex');
  let idx = buf.indexOf('NSString', 0, 'latin1'); let nameLen = 8;
  if (idx === -1) { idx = buf.indexOf('NSMutableString', 0, 'latin1'); nameLen = 15; }
  if (idx === -1) return '';
  const base = idx + nameLen;
  const readAt = i => {
    if (i >= buf.length) return null;
    const b = buf[i];
    if (b === 0x81) { if (i + 3 > buf.length) return null; return { len: buf.readUInt16LE(i + 1), start: i + 3 }; }
    if (b === 0x82) { if (i + 5 > buf.length) return null; return { len: buf.readUInt32LE(i + 1), start: i + 5 }; }
    return { len: b, start: i + 1 };
  };
  // The framing is normally 5 bytes; try nearby skips and trust the one whose
  // decoded string is immediately followed by the 0x86 object terminator.
  for (const skip of [5, 4, 6, 7, 3]) {
    const r = readAt(base + skip);
    if (!r || r.len <= 0 || r.start + r.len > buf.length) continue;
    if (buf[r.start + r.len] === 0x86) return buf.toString('utf8', r.start, r.start + r.len);
  }
  const r = readAt(base + 5);
  if (!r) return '';
  const len = Math.min(r.len, buf.length - r.start);
  return buf.toString('utf8', r.start, r.start + len);
}

// ---- read new incoming messages from a snapshot of chat.db ----
function newMessages(sinceRowId) {
  const tmp = path.join(os.tmpdir(), 'helm-chat.db');
  for (const ext of ['', '-wal', '-shm']) {
    if (existsSync(CHAT_DB + ext)) { try { copyFileSync(CHAT_DB + ext, tmp + ext); } catch { /* best effort */ } }
  }
  // Dedicated Helm Apple ID: the owner texts Helm from their own phone, so the messages
  // we care about are INCOMING (is_from_me = 0) from the owner's personal handle.
  // Coerce to integer defensively — chat.db is read via sqlite3 CLI (no parameter binding here).
  const safeSince = Math.max(0, Math.floor(Number(sinceRowId) || 0));
  const sql =
    `SELECT m.ROWID, COALESCE(m.text,''), hex(m.attributedBody), h.id ` +
    `FROM message m JOIN handle h ON m.handle_id = h.ROWID ` +
    `WHERE m.is_from_me = 0 AND m.ROWID > ${safeSince} ` +
    `ORDER BY m.ROWID ASC;`;
  const r = spawnSync('/usr/bin/sqlite3', ['-readonly', '-separator', '', tmp, sql], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || 'sqlite read failed').trim());
  const rows = [];
  for (const line of r.stdout.split('\n')) {
    if (!line) continue;
    const [rowid, text, attrHex, handle] = line.split('');
    const body = (text && text.trim()) ? text : decodeAttributedBody(attrHex);
    rows.push({ rowid: Number(rowid), text: (body || '').trim(), handle });
  }
  return rows;
}

function maxRowId() {
  const tmp = path.join(os.tmpdir(), 'helm-chat.db');
  for (const ext of ['', '-wal', '-shm']) {
    if (existsSync(CHAT_DB + ext)) { try { copyFileSync(CHAT_DB + ext, tmp + ext); } catch { /* best effort */ } }
  }
  const r = spawnSync('/usr/bin/sqlite3', ['-readonly', tmp, 'SELECT IFNULL(MAX(ROWID),0) FROM message;'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || 'sqlite read failed').trim());
  return Number(r.stdout.trim() || 0);
}

// Agent can attach files by ending lines with "ATTACH: /abs/path" (e.g. screenshots).
function splitAttachments(s) {
  const files = [];
  const text = (s || '').split('\n').filter(line => {
    const m = line.match(/^\s*ATTACH:\s*(.+?)\s*$/);
    if (m) { files.push(m[1]); return false; }
    return true;
  }).join('\n').trim();
  return { text, files };
}

// ---- send a reply via Messages (text passed as argv, no shell interpolation) ----
const SEND_SCRIPT = `on run {msgText, targetHandle}
  tell application "Messages"
    set svc to 1st account whose service type = iMessage
    set theBuddy to participant targetHandle of svc
    send msgText to theBuddy
  end tell
end run`;
const SEND_FILE_SCRIPT = `on run {filePath, targetHandle}
  tell application "Messages"
    set svc to 1st account whose service type = iMessage
    set theBuddy to participant targetHandle of svc
    send (POSIX file filePath) to theBuddy
  end tell
end run`;
function sendiFile(filePath, handle) {
  const r = spawnSync('/usr/bin/osascript', ['-e', SEND_FILE_SCRIPT, filePath, handle], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || 'osascript file send failed').trim());
}
// remember our own replies so we never answer them (they're also is_from_me=1 in the self thread)
const sent = [];
const SENT_MAX = 80;
const markSent = t => { sent.push((t || '').trim()); if (sent.length > SENT_MAX) sent.shift(); };
const wasSentByUs = t => sent.includes((t || '').trim());

function sendiMessage(text, handle) {
  const r = spawnSync('/usr/bin/osascript', ['-e', SEND_SCRIPT, text, handle], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || 'osascript send failed').trim());
  markSent(text);
}

// ---- main loop ----
let cursor = maxRowId(); // ignore history; only react to messages that arrive after startup
console.log(`✅ Helm iMessage online  ·  model=${MODEL}  ·  owners=${OWNERS.join(', ')}  ·  cursor=${cursor}`);

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const rows = newMessages(cursor);
    for (const row of rows) {
      cursor = Math.max(cursor, row.rowid);
      if (!isOwner(row.handle)) { console.log(`(skip msg from ${row.handle})`); continue; } // only the owner may talk to Helm
      if (!row.text) continue;
      if (wasSentByUs(row.text)) continue;         // skip our own replies -> no loop
      console.log(`📩 ${row.text}`);
      try {
        const reply = await ask(row.handle, row.text);
        const { text: body, files } = splitAttachments(reply);
        if (body) sendiMessage(body, row.handle);
        for (const f of files) {
          try { sendiFile(f, row.handle); }
          catch (e) { sendiMessage(`(couldn't attach ${f}: ${String(e.message || e).slice(0, 200)})`, row.handle); }
        }
        console.log(`📤 replied (${body.length} chars, ${files.length} files)`);
      } catch (e) {
        const m = `⚠️ brain error: ${String(e.message || e).slice(0, 1500)}`;
        try { sendiMessage(m, row.handle); } catch { /* ignore */ }
        console.error(e);
      }
    }
  } catch (e) {
    console.error('poll error:', e.message || e);
  } finally {
    busy = false;
  }
}
// Prevent any stray unhandled async rejection from killing the polling loop.
process.on('unhandledRejection', reason => console.error('Unhandled rejection:', reason));

setInterval(tick, 3000);
