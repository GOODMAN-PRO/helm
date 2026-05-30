// Helm — your own tiny AI agent.
//
//   Discord DM (you only)  ->  claude -p  (your Max subscription, full tools)  ->  reply
//
// No framework, no plugins, no gateway service. Read it top to bottom.

import { spawn } from 'node:child_process';
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
function runClaudeRemote(prompt) {
  return new Promise(resolve => {
    if (!HELM_WIN_HOST) return resolve('Windows node not configured yet. Set HELM_WIN_HOST in .env (e.g. you@win-tailscale), install Claude on Windows, then say "use windows" again.');
    const remoteCmd = `${HELM_WIN_DIR ? `cd ${HELM_WIN_DIR} && ` : ''}${HELM_WIN_CLAUDE} -p --output-format json --model ${MODEL} --permission-mode ${PERMISSION_MODE}`;
    const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', HELM_WIN_HOST, remoteCmd]);
    let out = '', err = '';
    const kill = setTimeout(() => child.kill(), 30 * 60_000);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(kill); resolve(`Windows SSH error: ${e.message}`); });
    child.on('close', code => {
      clearTimeout(kill);
      if (code !== 0) return resolve(`Windows exec failed (exit ${code}): ${(err || '').trim().slice(0, 500)}`);
      try { resolve((JSON.parse(out).result ?? '').toString().trim() || '(empty reply)'); }
      catch { resolve(out.trim() || '(no output)'); }
    });
    child.stdin.write(prompt); child.stdin.end();
  });
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
  'NEVER touch ~/helm or the Helm Supabase/daemon (com.helm.agent) — a separate project, strictly off-limits.';

// ---- unified session (shared with iMessage — one owner, one brain thread) ----
// Key is always 'owner' since this bot is owner-locked.

// ---- the brain: one Claude run on your subscription ----
// cap: 30 min for chat messages (scheduler-initiated runs have no cap).
function runClaude(args, prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, { cwd: WORKSPACE });
    let out = '', err = '';
    const kill = setTimeout(() => child.kill(), 30 * 60_000); // 30-min cap for chat
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(kill); reject(e); });
    child.on('close', code => {
      clearTimeout(kill);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim() || `claude exited ${code}`));
    });
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
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', // lean: no MCP bloat
  ];
  const sid = getSession('owner');
  const args = sid ? [...base, '--resume', sid] : base;
  let out;
  let hbStart, hbInterval;
  try {
    // Heartbeat: after 30s with no reply, ping every 60s.
    hbStart = setTimeout(() => {
      onHeartbeat?.('still working...');
      hbInterval = setInterval(() => onHeartbeat?.('still working...'), 60_000);
    }, 30_000);

    out = await runClaude(args, prompt);

    clearTimeout(hbStart);
    clearInterval(hbInterval);
  } catch (e) {
    clearTimeout(hbStart);
    clearInterval(hbInterval);
    if (!sid) throw e;           // genuine failure on a fresh chat
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
  if (!text) return;

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
  console.log(`📩 [${target}] ${text}`);
  const typing = setInterval(() => msg.channel.sendTyping().catch(() => {}), 8000);
  msg.channel.sendTyping().catch(() => {});
  try {
    const reply = await ask(text, heartbeat => msg.channel.send(heartbeat).catch(() => {}), target);
    clearInterval(typing);
    const { text: body, files } = splitAttachments(reply);
    for (const part of chunks(body || '(see attachment)')) await msg.reply(part);
    for (const f of files) {
      try { await msg.reply({ files: [f] }); }
      catch (e) { await msg.reply(`(couldn't attach ${f}: ${String(e.message || e).slice(0, 200)})`); }
    }
    console.log(`📤 replied (${body.length} chars, ${files.length} files)`);
  } catch (e) {
    clearInterval(typing);
    console.error(e);
    await msg.reply(`⚠️ brain error: ${String(e.message || e).slice(0, 1800)}`);
  }
});

client.login(DISCORD_TOKEN);
