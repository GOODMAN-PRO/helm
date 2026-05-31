#!/usr/bin/env node
// helm-push — DM the owner via Discord REST using the bot token in .env.
//   helm-push "message text"            -> sends a text DM
//   helm-push -f /abs/path "caption"    -> sends a file attachment with optional caption
// Exits non-zero on failure. Safe to call from launchd / cron.

import { readFileSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env');
let env = {};
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
} catch (e) {
  console.error('cannot read .env:', e.message);
  process.exit(2);
}
const TOKEN = env.DISCORD_TOKEN;
const OWNER = env.OWNER_ID;
if (!TOKEN || !OWNER) {
  console.error('DISCORD_TOKEN or OWNER_ID missing in .env');
  process.exit(2);
}

const args = process.argv.slice(2);
let filePath = null;
if (args[0] === '-f') {
  filePath = args[1];
  args.splice(0, 2);
}
const message = args.join(' ').trim();
if (!message && !filePath) {
  console.error('usage: helm-push [-f /path] "message"');
  process.exit(2);
}

async function api(pathStr, init = {}) {
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Helm (helm, 1.0)',
    ...(init.headers || {}),
  };
  const res = await fetch(`https://discord.com/api/v10${pathStr}`, { ...init, headers });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${body}`);
  return body ? JSON.parse(body) : {};
}

async function ensureDmChannel() {
  const ch = await api('/users/@me/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: OWNER }),
  });
  return ch.id;
}

async function sendText(channelId, text) {
  return api(`/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text.slice(0, 1990) }),
  });
}

async function sendFile(channelId, fp, caption) {
  const stat = statSync(fp);
  if (stat.size > 24 * 1024 * 1024) throw new Error('file too large for non-nitro upload');
  const form = new FormData();
  const buf = readFileSync(fp);
  const blob = new Blob([buf]);
  form.append('files[0]', blob, path.basename(fp));
  form.append('payload_json', JSON.stringify({ content: (caption || '').slice(0, 1990) }));
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${TOKEN}`, 'User-Agent': 'Helm (helm, 1.0)' },
    body: form,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${body}`);
  return body ? JSON.parse(body) : {};
}

try {
  const cid = await ensureDmChannel();
  if (filePath) await sendFile(cid, filePath, message);
  else await sendText(cid, message);
  console.log('ok');
} catch (e) {
  console.error('push failed:', e.message);
  process.exit(1);
}
