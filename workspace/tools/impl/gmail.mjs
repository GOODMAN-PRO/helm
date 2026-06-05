#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SECRETS = path.join(HERE, '..', '..', 'secrets', 'secrets.mjs');
const secret = (name) => {
  if (process.env[name]) return process.env[name].trim();
  const r = spawnSync(process.execPath, [SECRETS, 'get', name], { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : '';
};
const USER = secret('GMAIL_USER');
const PASS = secret('GMAIL_APP_PASSWORD').replace(/\s+/g, ''); // app passwords are shown with spaces

const args = process.argv.slice(2);
const verb = args[0];
const get = (k) => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
const ok = (o) => { console.log(JSON.stringify({ ok: true, ...o })); process.exit(0); };
const fail = (m) => { console.error(JSON.stringify({ ok: false, error: m })); process.exit(1); };

if (!USER || !PASS) {
  fail('Gmail not set up. Add GMAIL_USER and GMAIL_APP_PASSWORD to the vault — get an app password at myaccount.google.com/apppasswords (2-Step Verification must be on).');
}

const fmt = (m) => ({
  uid: m.uid,
  from: m.envelope?.from?.map((f) => f.address).join(', '),
  subject: m.envelope?.subject,
  date: m.envelope?.date,
});
const newImap = async () => {
  const { ImapFlow } = await import('imapflow');
  return new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: USER, pass: PASS }, logger: false });
};

try {
  if (verb === 'send') {
    const to = get('to');
    if (!to) fail('send needs --to');
    const nodemailer = (await import('nodemailer')).default;
    const t = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: USER, pass: PASS } });
    const subject = get('subject') || '(no subject)';
    const info = await t.sendMail({ from: USER, to, cc: get('cc') || undefined, bcc: get('bcc') || undefined, subject, text: get('body') || '' });
    ok({ sent: true, to, subject, messageId: info.messageId });
  } else if (verb === 'list' || verb === 'search') {
    const max = Math.min(Number(get('max') || 10), 50);
    const mailbox = get('mailbox') || 'INBOX';
    const query = get('query');
    const c = await newImap();
    await c.connect();
    const lock = await c.getMailboxLock(mailbox);
    const msgs = [];
    try {
      if (query) {
        const uids = await c.search({ or: [{ subject: query }, { from: query }, { body: query }] }, { uid: true });
        const pick = (uids || []).slice(-max);
        if (pick.length) for await (const m of c.fetch(pick, { envelope: true, uid: true }, { uid: true })) msgs.push(fmt(m));
      } else {
        const total = c.mailbox.exists || 0;
        if (total > 0) {
          const start = Math.max(1, total - max + 1);
          for await (const m of c.fetch(`${start}:*`, { envelope: true, uid: true })) msgs.push(fmt(m));
        }
      }
    } finally { lock.release(); await c.logout(); }
    ok({ mailbox, count: msgs.length, messages: msgs.reverse() });
  } else if (verb === 'read') {
    const uid = get('uid');
    if (!uid) fail('read needs --uid');
    const mailbox = get('mailbox') || 'INBOX';
    const { simpleParser } = await import('mailparser');
    const c = await newImap();
    await c.connect();
    const lock = await c.getMailboxLock(mailbox);
    let result;
    try {
      const m = await c.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
      if (!m) fail('uid ' + uid + ' not found in ' + mailbox);
      const p = await simpleParser(m.source);
      result = { uid: Number(uid), from: p.from?.text, to: p.to?.text, subject: p.subject, date: p.date, body: (p.text || '').slice(0, 8000) };
    } finally { lock.release(); await c.logout(); }
    ok({ message: result });
  } else {
    fail('verbs: send --to --subject --body | list [--max] [--query] | read --uid');
  }
} catch (e) {
  fail((e && e.message) || String(e));
}
