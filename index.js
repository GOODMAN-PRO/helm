// Helm — your own tiny AI agent.
//
//   Discord DM (you only)  ->  claude -p  (your Max subscription, full tools)  ->  reply
//
// No framework, no plugins, no gateway service. Read it top to bottom.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import { getSession, setSession, deleteSession } from './workspace/sessions.mjs';

// Resolve .env and workspace relative to THIS file, so the agent runs from any cwd.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, '.env') });

// ---- config (.env) ----
const {
  DISCORD_TOKEN,
  OWNER_ID,
  CLAUDE_BIN = 'claude',
  MODEL = 'sonnet',
  PERMISSION_MODE = 'bypassPermissions',
} = process.env;
const WORKSPACE = path.resolve(__dirname, process.env.WORKSPACE || './workspace');

if (!DISCORD_TOKEN || !OWNER_ID) {
  console.error('✋ Missing DISCORD_TOKEN or OWNER_ID in .env');
  process.exit(1);
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

// ---- fleet: swap which machine runs the brain ("use mac" / "use windows") ----
// mac = run claude locally (this Mac). windows = run claude over SSH on the Windows box.
// Free, no cloud, doesn't touch the Helm project. Configure Windows in .env:
//   HELM_WIN_HOST=you@windows-host   (LAN IP or Tailscale name; key-based SSH)
//   HELM_WIN_CLAUDE=claude           (path to claude on Windows, optional)
//   HELM_WIN_DIR=C:/path/to/dir      (remote working dir, optional)
const HELM_WIN_HOST = process.env.HELM_WIN_HOST || '';
const HELM_WIN_CLAUDE = process.env.HELM_WIN_CLAUDE || 'claude';
const HELM_WIN_DIR = process.env.HELM_WIN_DIR || '';
const TARGET_FILE = path.join(WORKSPACE, 'active-target');
const VALID_TARGETS = ['mac', 'windows'];
const getTarget = () => { try { const t = readFileSync(TARGET_FILE, 'utf8').trim(); return VALID_TARGETS.includes(t) ? t : 'mac'; } catch { return 'mac'; } };
const setTarget = t => writeFileSync(TARGET_FILE, t);

// Run the brain on the Windows node over SSH (async so the gateway stays responsive).
// Resumes the windows session ('owner-windows') so multi-step tasks stay coherent across messages.
function runClaudeRemote(prompt) {
  return new Promise(resolve => {
    if (!HELM_WIN_HOST) return resolve('Windows node not configured yet. Set HELM_WIN_HOST in .env (e.g. you@win-tailscale), install Claude on Windows, then say "use windows" again.');
    const q = s => `"${s.replace(/"/g, '\\"')}"`;   // shell-quote for the remote shell
    const REMOTE_PERSONA = "You are Helm on the owner's Windows PC over SSH, with full shell and file access. " +
      'ACT — actually DO what the owner asks end to end: create the files, build the thing, run the commands, accomplish the task. ' +
      'A screenshot is ONLY to SHOW a result AFTER you have done the work — NEVER reply with just a screenshot instead of doing the task, and never claim you did something you did not. ' +
      'Keep replies short. Confirm before anything destructive, irreversible, or that spends money. Never touch the separate Helm project. ' +
      'To screenshot the Windows desktop (SSH cannot capture it directly): run  schtasks /run /tn HelmShot  then wait ~3s (powershell Start-Sleep 3); it saves to C:\\\\Users\\\\User\\\\helm-shot.png. End that reply with a line exactly: ATTACH: C:\\\\Users\\\\User\\\\helm-shot.png';
    const run = sid => {
      const resumeFlag = sid ? `--resume ${q(sid)} ` : '';
      const remoteCmd = `${HELM_WIN_DIR ? `cd ${q(HELM_WIN_DIR)} && ` : ''}${q(HELM_WIN_CLAUDE)} -p --output-format json --model ${q(MODEL)} --permission-mode ${q(PERMISSION_MODE)} ${resumeFlag}--append-system-prompt ${q(REMOTE_PERSONA)}`;
      const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', HELM_WIN_HOST, remoteCmd]);
      let out = '', err = '';
      const kill = setTimeout(() => child.kill(), 30 * 60_000);
      child.stdout.on('data', d => { out += d; });
      child.stderr.on('data', d => { err += d; });
      child.on('error', e => { clearTimeout(kill); resolve(`Windows SSH error: ${e.message}`); });
      child.on('close', code => {
        clearTimeout(kill);
        if (code !== 0) {
          if (sid) { deleteSession('owner-windows'); return run(null); }   // stale session -> retry fresh
          return resolve(`Windows exec failed (exit ${code}): ${(err || '').trim().slice(0, 500)}`);
        }
        try {
          const j = JSON.parse(out);
          if (j.session_id) setSession('owner-windows', j.session_id, 'windows');
          resolve((j.result ?? '').toString().trim() || '(empty reply)');
        } catch { resolve(out.trim() || '(no output)'); }
      });
      child.stdin.write(prompt); child.stdin.end();
    };
    run(getSession('owner-windows'));
  });
}

// Pull a file off the Windows box (for ATTACH paths produced by the windows brain, e.g. screenshots).
function scpFromWin(winPath) {
  if (!HELM_WIN_HOST) return null;
  const INBOX = path.join(WORKSPACE, 'inbox');
  mkdirSync(INBOX, { recursive: true });
  const fwd = winPath.replace(/\\/g, '/');   // scp needs forward slashes; backslash paths fail
  const local = path.join(INBOX, `win-${Date.now()}-${path.basename(fwd) || 'file'}`);
  const r = spawnSync('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', `${HELM_WIN_HOST}:${fwd}`, local], { encoding: 'utf8' });
  return r.status === 0 ? local : null;
}

// Push a local file TO the Windows box so the windows brain can read it (e.g. an attachment the
// owner sent while on the windows target). Returns a path the windows brain can Read, or null.
function scpToWin(localPath) {
  if (!HELM_WIN_HOST) return null;
  const base = path.basename(localPath).replace(/[^\w.\-]/g, '_');
  spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', HELM_WIN_HOST, 'if not exist helm-inbox mkdir helm-inbox'], { encoding: 'utf8' });
  const r = spawnSync('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', localPath, `${HELM_WIN_HOST}:helm-inbox/${base}`], { encoding: 'utf8' });
  return r.status === 0 ? `helm-inbox/${base}` : null;  // relative to the windows home (where the ssh brain runs)
}

// ---- persona: appended to Claude Code's own (tool-enabled) system prompt ----
const PERSONA =
  'You are Helm, a personal AI agent talking to your owner over Discord DMs. ' +
  "You run on their own machine with full tools (shell, files, web) — act, don't just advise. " +
  'Keep replies short and chat-friendly; this is a messaging app, not a document. ' +
  'Your long-term memory is CLAUDE.md in the working directory — read it, and append durable ' +
  'facts about your owner or ongoing work. Confirm before anything destructive, irreversible, ' +
  'or that spends money. ' +
  'You have full authority over this Mac — shell, files, GUI (screenshot + guicontrol clicks/typing), ' +
  'the scheduler, and your own source code. Act boldly and proactively. ' +
  'When asked to build or create something, actually BUILD it (make the files, write the code, run the commands, finish the task) — a screenshot or a description is NEVER a substitute for doing the work. "Show me" means produce the real artifact first, THEN optionally screenshot it to display the result. ' +
  'NEVER touch ~/helm or the Helm Supabase/daemon (com.helm.agent) — a separate project, strictly off-limits.';

// ---- unified session (shared with iMessage — one owner, one brain thread) ----
// Key is always 'owner' since this bot is owner-locked.

// ---- the brain: one Claude run on your subscription ----
// Track in-flight runs so "stop" can actually kill them. 10-min hard cap for chat.
const running = new Set();
function killAll() {
  let n = 0;
  for (const c of running) { c._stopped = true; try { c.kill('SIGKILL'); n++; } catch {} }
  running.clear();
  return n;
}
function runClaude(args, prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, { cwd: WORKSPACE });
    running.add(child);
    let out = '', err = '';
    const kill = setTimeout(() => { child._timedOut = true; try { child.kill('SIGKILL'); } catch {} }, 10 * 60_000); // 10-min cap
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(kill); running.delete(child); reject(e); });
    child.on('close', code => {
      clearTimeout(kill); running.delete(child);
      if (child._stopped) return reject(Object.assign(new Error('stopped by owner'), { stopped: true }));
      if (child._timedOut) return reject(Object.assign(new Error('hit 10-min cap'), { timedOut: true }));
      if (code === 0) resolve(out);
      else reject(new Error(err.trim() || `claude exited ${code}`));
    });
    child.stdin.on('error', () => {}); // EPIPE if claude exits before reading stdin
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function ask(prompt, onHeartbeat, target = 'mac') {
  if (target === 'windows') return runClaudeRemote(prompt);
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
  let hbStart, hbInterval, pings = 0;
  try {
    // Heartbeat: after 30s, ping every 60s — but at most 5 times, so a stuck run can't spam forever.
    hbStart = setTimeout(() => {
      onHeartbeat?.('still working...');
      hbInterval = setInterval(() => {
        if (++pings >= 5) { clearInterval(hbInterval); return; }
        onHeartbeat?.('still working...');
      }, 60_000);
    }, 30_000);

    out = await runClaude(args, prompt);

    clearTimeout(hbStart);
    clearInterval(hbInterval);
  } catch (e) {
    clearTimeout(hbStart);
    clearInterval(hbInterval);
    if (e.stopped || e.timedOut || !sid) throw e;  // never retry a cancel/timeout (that's what caused the hour-long loop)
    deleteSession('owner');      // stale/expired session -> retry fresh once
    out = await runClaude(base, prompt);
  }
  try {
    const j = JSON.parse(out);
    if (j.session_id) setSession('owner', j.session_id, 'discord');
    return (j.result ?? '').toString().trim() || '(empty reply)';
  } catch {
    return out.trim() || '(no output)';
  }
}

// ---- Discord ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages, // DM content is delivered without the privileged intent
  ],
  partials: [Partials.Channel, Partials.Message],
});

const chunks = s => s.match(/[\s\S]{1,1900}/g) ?? ['(empty)']; // Discord caps messages at 2000 chars

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

client.once(Events.ClientReady, c =>
  console.log(`✅ Helm online as ${c.user.tag}  ·  model=${MODEL}  ·  owner=${OWNER_ID}`)
);

client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot) return;
  console.log(`[msg] from=${msg.author.id} dm=${!msg.guild} content=${JSON.stringify((msg.content || '').slice(0, 120))}`);
  if (msg.author.id !== OWNER_ID) return;                       // owner-only lock
  const dm = !msg.guild;
  if (!dm && !msg.mentions.users.has(client.user.id)) return;   // in servers: only when @mentioned

  const text = msg.content.replace(`<@${client.user.id}>`, '').trim();
  if (!text && !msg.attachments.size) return;   // allow image-only messages

  // ---- stop/cancel: actually kill any in-flight run (handled before anything else) ----
  if (/^\s*\/?(stop|cancel|abort|halt)\s*$/i.test(text)) {
    const n = killAll();
    await msg.reply(n ? `Stopped — killed ${n} running task(s).` : 'Nothing was running.');
    return;
  }

  // ---- vault: store a secret straight from chat ("vault NAME value" / "vault list") ----
  if (/^vault(\s|$)/i.test(text)) {
    if (/^vault\s+list\s*$/i.test(text)) {
      const r = spawnSync(process.execPath, ['workspace/secrets/secrets.mjs', 'list'], { cwd: __dirname, encoding: 'utf8' });
      await msg.reply('Vault names:\n' + (r.stdout || r.stderr || '[]').trim());
      return;
    }
    const m = text.match(/^vault\s+(\S+)\s+([\s\S]+)$/i);
    if (!m) { await msg.reply('Usage: `vault <NAME> <value>` to store · `vault list` for names. (I never print values back.)'); return; }
    const [, name, value] = m;
    const r = spawnSync(process.execPath, ['workspace/secrets/secrets.mjs', 'set', name], { cwd: __dirname, input: value, encoding: 'utf8' });
    if (r.status === 0) {
      let deleted = false;
      try { await msg.delete(); deleted = true; } catch {}
      await msg.channel.send(`Stored **${name}** in the vault (encrypted).` + (deleted
        ? ' Deleted your message.'
        : " I can't delete messages in a DM — delete yours so the secret isn't left in the chat. (It also passed through Discord; for max privacy use the terminal vault command.)"));
    } else {
      await msg.channel.send('Vault error: ' + ((r.stderr || r.stdout || 'unknown').trim().slice(0, 300)));
    }
    return;
  }

  // ---- fleet commands (handled before the brain) ----
  const low = text.toLowerCase();
  const useM = low.match(/^\/?use\s+(mac|windows|win|pc)\b/);
  if (useM) {
    const t = (useM[1] === 'mac') ? 'mac' : 'windows';
    setTarget(t);
    const note = (t === 'windows' && !HELM_WIN_HOST) ? ' — not configured yet (set HELM_WIN_HOST in .env)' : '';
    await msg.reply(`Active machine: **${t}**${note}.`);
    return;
  }
  if (/^\/?(where|which|target|status)\b/.test(low)) {
    await msg.reply(`Active machine: **${getTarget()}**${getTarget() === 'windows' && !HELM_WIN_HOST ? ' (not configured)' : ''}.`);
    return;
  }

  const target = getTarget();
  // ---- download any attachments so Helm can actually SEE/read them ----
  let prompt = text;
  if (msg.attachments.size) {
    const INBOX = path.join(WORKSPACE, 'inbox');
    mkdirSync(INBOX, { recursive: true });
    const saved = [];
    for (const a of msg.attachments.values()) {
      try {
        const res = await fetch(a.url);
        const buf = Buffer.from(await res.arrayBuffer());
        const p = path.join(INBOX, `${Date.now()}-${(a.name || 'file').replace(/[^\w.\-]/g, '_')}`);
        writeFileSync(p, buf); saved.push(p);
      } catch { /* skip a failed download */ }
    }
    // On the windows target, push the files to the PC so the remote brain can read them.
    let refs = saved;
    if (target === 'windows' && saved.length) refs = saved.map(scpToWin).filter(Boolean);
    if (refs.length) prompt = (text || '(no caption)') +
      `\n\n[The owner attached ${refs.length} file(s) — look at them NOW with your Read tool (Read handles images): ${refs.join(' , ')}]`;
  }
  console.log(`📩 [${target}] ${text || '(attachment)'}${msg.attachments.size ? ' +' + msg.attachments.size + 'file' : ''}`);
  const typing = setInterval(() => msg.channel.sendTyping().catch(() => {}), 8000);
  msg.channel.sendTyping().catch(() => {});
  try {
    const reply = await ask(prompt, heartbeat => msg.channel.send(heartbeat).catch(() => {}), target);
    clearInterval(typing);
    const { text: body, files } = splitAttachments(reply);
    for (const part of chunks(body || '(see attachment)')) await msg.reply(part);
    for (const f of files) {
      let lf = f;
      if (target === 'windows' && /^[A-Za-z]:[\\/]/.test(f)) {       // a Windows path -> pull it to the Mac first
        lf = scpFromWin(f);
        if (!lf) { await msg.reply(`(couldn't fetch ${f} from windows)`); continue; }
      }
      try { await msg.reply({ files: [lf] }); }
      catch (e) { await msg.reply(`(couldn't attach ${f}: ${String(e.message || e).slice(0, 200)})`); }
    }
    console.log(`📤 replied (${body.length} chars, ${files.length} files)`);
  } catch (e) {
    clearInterval(typing);
    if (e.stopped) return;  // the stop command already acknowledged
    console.error(e);
    const m = e.timedOut
      ? '⚠️ that task hit the 10-min cap and was stopped — try breaking it into a smaller step.'
      : `⚠️ brain error: ${String(e.message || e).slice(0, 1800)}`;
    try { await msg.reply(m); } catch {}  // Discord API failure in error path must not crash the process
  }
});

// Prevent Discord WebSocket errors from crashing Node (unhandled EventEmitter error event = fatal).
client.on('error', err => console.error('Discord client error:', err));
// Prevent any stray unhandled async rejection from killing the process.
process.on('unhandledRejection', reason => console.error('Unhandled rejection:', reason));

client.login(DISCORD_TOKEN);
