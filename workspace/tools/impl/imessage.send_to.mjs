#!/usr/bin/env node
// Send an iMessage to any handle on behalf of Helm.
// confirm: true in registry — dispatcher enforces owner approval before calling.

import { spawnSync } from 'node:child_process';

const args   = process.argv.slice(2);
const get    = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
const handle = get('handle');
const text   = get('text');

if (!handle || !text) {
  console.error('--handle and --text required');
  process.exit(1);
}

const SCRIPT = `on run {msgText, targetHandle}
  tell application "Messages"
    set svc to 1st account whose service type = iMessage
    set theBuddy to participant targetHandle of svc
    send msgText to theBuddy
  end tell
end run`;

const r = spawnSync('/usr/bin/osascript', ['-e', SCRIPT, text, handle], { encoding: 'utf8', timeout: 30_000 });
if (r.status !== 0) { console.error(r.stderr || 'osascript failed'); process.exit(1); }
console.log(JSON.stringify({ ok: true, handle, length: text.length }));
