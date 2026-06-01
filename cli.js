// Helm — terminal client (full-screen TUI).
//
// This does NOT run its own brain. It connects to the ONE already-running Helm (the Discord/iMessage
// service) over a loopback port and is just another window into the SAME conversation. Messages you
// type here, and Helm's replies, are mirrored across the terminal, Discord and iMessage.
//
// Start Helm first:  helm start   (or it's already running 24/7).  Then:
//   helm                open the full-screen chat
//   helm "do the thing" one-shot: send one message, print the reply, exit
//   echo "..." | helm   one-shot from stdin (pipe-friendly)
//
// In the TUI: type + Enter to send · PgUp/PgDn or mouse wheel to scroll · Ctrl-C / Esc / /exit to quit.
import net from 'node:net';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, '.env') });
const PORT = parseInt(process.env.HELM_CLI_PORT || '4625', 10);
const HOST = '127.0.0.1';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const C = useColor
  ? { dim: '\x1b[2m', cyan: '\x1b[36m', teal: '\x1b[38;5;49m', sky: '\x1b[38;5;39m', yel: '\x1b[33m', red: '\x1b[38;5;203m', grn: '\x1b[38;5;42m', gray: '\x1b[38;5;245m', b: '\x1b[1m', x: '\x1b[0m' }
  : { dim: '', cyan: '', teal: '', sky: '', yel: '', red: '', grn: '', gray: '', b: '', x: '' };

function connect() {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: HOST, port: PORT });
    sock.setEncoding('utf8');
    sock.once('connect', () => resolve(sock));
    sock.once('error', reject);
  });
}

const notRunning = () => {
  console.error(`${C.red}Helm isn't running.${C.x} Start the service first:  ${C.b}helm start${C.x}  (or it should already be running 24/7).`);
  console.error(`${C.dim}The terminal is a client of the one running Helm — it shares the same brain/conversation as Discord & iMessage.${C.x}`);
};

// ---- one-shot: send a single message, print the first reply, exit ----
async function oneShot(text) {
  let sock;
  try { sock = await connect(); } catch { notRunning(); process.exit(1); }
  let buf = '';
  const timer = setTimeout(() => { console.error(`${C.dim}(no reply within the time limit)${C.x}`); sock.end(); process.exit(1); }, 30 * 60_000);
  sock.on('data', chunk => {
    buf += chunk; let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'reply') { clearTimeout(timer); process.stdout.write(m.text + '\n'); sock.end(); process.exit(0); }
    }
  });
  sock.on('error', () => { notRunning(); process.exit(1); });
  sock.write(JSON.stringify({ type: 'msg', text }) + '\n');
}

// ============================ full-screen TUI ============================
const ESC = '\x1b[';
const out = s => process.stdout.write(s);
const stripAnsi = s => s.replace(/\x1b\[[0-9;]*m/g, '');

// word-wrap a plain string to width, preserving explicit newlines
function wrap(text, width) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    if (para === '') { lines.push(''); continue; }
    let cur = '';
    for (const word of para.split(/(\s+)/)) {
      if (stripAnsi(cur + word).length <= width) { cur += word; continue; }
      if (cur) lines.push(cur.replace(/\s+$/, ''));
      // hard-break a single word longer than the pane
      let w = word;
      while (stripAnsi(w).length > width) { lines.push(w.slice(0, width)); w = w.slice(width); }
      cur = w;
    }
    lines.push(cur.replace(/\s+$/, ''));
  }
  return lines;
}

function tui(sock) {
  const stdin = process.stdin;
  let W = process.stdout.columns || 80;
  let H = process.stdout.rows || 24;
  const PANE_W = () => W - 2;             // 1-col gutter each side
  const HEADER_H = 1, STATUS_H = 1, INPUT_H = 3;
  const bodyH = () => Math.max(1, H - HEADER_H - STATUS_H - INPUT_H);

  const history = [];   // { role: 'you'|'helm'|'sys'|'other', text, label }
  let scroll = 0;       // how many lines scrolled up from the bottom
  let input = '';
  let status = '';
  let connected = true;

  const enterAlt = () => out(`${ESC}?1049h${ESC}?25l`);   // alt screen, hide cursor
  const leaveAlt = () => out(`${ESC}?25h${ESC}?1049l`);   // restore
  const moveTo = (r, c) => out(`${ESC}${r};${c}H`);
  const clearLine = () => out(`${ESC}2K`);

  // flatten history into wrapped, colored display lines
  function renderLines() {
    const lines = [];
    const w = PANE_W();
    for (const m of history) {
      const tag = m.role === 'you' ? `${C.cyan}${C.b}you${C.x}`
        : m.role === 'helm' ? `${C.teal}${C.b}helm${C.x}`
        : m.role === 'other' ? `${C.sky}${m.label || 'other'}${C.x}`
        : `${C.gray}·${C.x}`;
      const bodyColor = m.role === 'sys' ? C.gray : '';
      const wrapped = wrap(m.text, w - 7);     // indent body under the tag
      wrapped.forEach((ln, i) => {
        const prefix = i === 0 ? `${tag.padEnd(5 + (tag.length - stripAnsi(tag).length))} ${C.dim}│${C.x} ` : `      ${C.dim}│${C.x} `;
        lines.push(prefix + bodyColor + ln + (bodyColor ? C.x : ''));
      });
      lines.push('');   // gap between messages
    }
    return lines;
  }

  function draw() {
    W = process.stdout.columns || 80;
    H = process.stdout.rows || 24;
    out(`${ESC}H${ESC}J`);   // home + clear

    // header
    const dot = connected ? `${C.grn}●${C.x}` : `${C.red}●${C.x}`;
    const title = `${C.teal}${C.b}⎈ Helm${C.x} ${C.dim}terminal${C.x}`;
    const right = `${dot} ${connected ? `${C.gray}127.0.0.1:${PORT} · shared with Discord & iMessage${C.x}` : `${C.red}disconnected${C.x}`}`;
    const pad = Math.max(1, W - stripAnsi(title).length - stripAnsi(right).length - 2);
    moveTo(1, 2); out(title + ' '.repeat(pad) + right);
    moveTo(2, 1); out(`${C.dim}${'─'.repeat(W)}${C.x}`);

    // body (message pane) — show the window of lines per scroll
    const all = renderLines();
    const view = bodyH();
    const maxScroll = Math.max(0, all.length - view);
    if (scroll > maxScroll) scroll = maxScroll;
    const start = Math.max(0, all.length - view - scroll);
    const slice = all.slice(start, start + view);
    for (let i = 0; i < view; i++) {
      moveTo(3 + i, 2); clearLine();
      if (slice[i] !== undefined) out(slice[i]);
    }
    // scroll indicator
    if (scroll > 0) { moveTo(3, W - 4); out(`${C.dim}↑${scroll}${C.x}`); }

    // status line
    moveTo(H - INPUT_H, 2); clearLine();
    out(status ? `${C.gray}${status}${C.x}` : `${C.dim}PgUp/PgDn scroll · Enter send · /exit quit${C.x}`);

    // input box (bordered)
    const iw = W - 2;
    moveTo(H - 2, 1); out(`${C.dim}┌${'─'.repeat(iw - 2)}┐${C.x}`);
    moveTo(H - 1, 1);
    const shown = input.length > iw - 5 ? '…' + input.slice(input.length - (iw - 6)) : input;
    out(`${C.dim}│${C.x} ${C.cyan}›${C.x} ${shown}${ESC}K${' '.repeat(0)}`);
    moveTo(H, 1); out(`${C.dim}└${'─'.repeat(iw - 2)}┘${C.x}`);
    // park cursor after the input text (visible while typing)
    moveTo(H - 1, 5 + stripAnsi(shown).length);
  }

  function add(role, text, label) { history.push({ role, text, label }); scroll = 0; draw(); }

  // ---- socket -> history ----
  let buf = '';
  sock.on('data', chunk => {
    buf += chunk; let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'reply') { status = ''; add('helm', m.text); }
      else if (m.type === 'echo') {
        // don't double-show our own terminal lines (we already added them on send)
        if (/terminal/i.test(m.from || '')) continue;
        add('other', m.text, m.from || 'other');
      }
      else if (m.type === 'status') { status = m.text; draw(); }
      else if (m.type === 'info')   { add('sys', m.text); }
    }
  });
  sock.on('close', () => { connected = false; status = 'Helm disconnected (service stopped?). Press Esc to quit.'; draw(); });
  sock.on('error', () => { connected = false; status = 'connection lost. Press Esc to quit.'; draw(); });

  // ---- raw keyboard ----
  readline.emitKeypressEvents(stdin);
  if (stdin.isTTY) stdin.setRawMode(true);
  enterAlt(); draw();

  const quit = () => { try { if (stdin.isTTY) stdin.setRawMode(false); } catch {} leaveAlt(); try { sock.end(); } catch {} process.exit(0); };

  function submit() {
    const text = input.trim(); input = '';
    if (!text) { draw(); return; }
    if (text === '/exit' || text === '/quit') return quit();
    if (text === '/help') {
      add('sys', 'This terminal is a live client of the one running Helm — shared with Discord & iMessage.\n  type + Enter   send a message (all channels see it)\n  stop           cancel an in-flight task (a Helm chat command)\n  !mode ...       change autonomy (a Helm chat command)\n  PgUp / PgDn    scroll the history\n  /exit or Esc   close this terminal (Helm keeps running)');
      return;
    }
    if (!connected) { add('sys', 'not connected — start Helm with `helm start`.'); return; }
    add('you', text);
    try { sock.write(JSON.stringify({ type: 'msg', text }) + '\n'); } catch { add('sys', 'send failed.'); }
  }

  stdin.on('keypress', (ch, key) => {
    if (!key) return;
    const name = key.name;
    if (key.ctrl && name === 'c') return quit();
    if (name === 'escape') return quit();
    if (name === 'return' || name === 'enter') return submit();
    if (name === 'backspace') { input = input.slice(0, -1); return draw(); }
    if (name === 'pageup')   { scroll += Math.max(1, bodyH() - 1); return draw(); }
    if (name === 'pagedown') { scroll = Math.max(0, scroll - Math.max(1, bodyH() - 1)); return draw(); }
    if (name === 'up')   { scroll += 1; return draw(); }
    if (name === 'down') { scroll = Math.max(0, scroll - 1); return draw(); }
    if (key.ctrl && name === 'u') { input = ''; return draw(); }   // clear line
    if (ch && !key.ctrl && !key.meta && ch >= ' ') { input += ch; return draw(); }
  });

  process.stdout.on('resize', draw);
  sock.write(JSON.stringify({ type: 'hello' }) + '\n');
  add('sys', "connected. Type a message — Helm, Discord and iMessage all share this conversation.");
}

// ---- plain fallback (no TTY / NO_COLOR-style minimal): the old line REPL ----
async function plainInteractive(sock) {
  console.log(`${C.teal}${C.b}Helm${C.x} ${C.dim}— terminal (shared with Discord & iMessage). /help · /exit${C.x}\n`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: `${C.cyan}you ›${C.x} ` });
  let buf = '';
  sock.on('data', chunk => {
    buf += chunk; let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'reply')      { process.stdout.write(`\r\x1b[2K${C.teal}helm ›${C.x} ${m.text}\n`); rl.prompt(true); }
      else if (m.type === 'echo' && !/terminal/i.test(m.from || '')) { process.stdout.write(`\r\x1b[2K${C.dim}${m.from} › ${m.text}${C.x}\n`); rl.prompt(true); }
      else if (m.type === 'info')  { process.stdout.write(`\r\x1b[2K${C.dim}· ${m.text}${C.x}\n`); rl.prompt(true); }
    }
  });
  sock.on('close', () => { console.log(`\n${C.red}Helm disconnected.${C.x}`); process.exit(1); });
  sock.write(JSON.stringify({ type: 'hello' }) + '\n');
  rl.prompt();
  rl.on('line', line => {
    const t = line.trim();
    if (t === '/exit' || t === '/quit') return rl.close();
    if (t) sock.write(JSON.stringify({ type: 'msg', text: t }) + '\n');
    rl.prompt();
  });
  rl.on('close', () => { sock.end(); process.exit(0); });
}

async function interactive() {
  let sock;
  try { sock = await connect(); } catch { notRunning(); process.exit(1); }
  // Full-screen TUI when we have a real interactive terminal; otherwise the plain REPL.
  if (process.stdout.isTTY && process.stdin.isTTY && !process.env.HELM_PLAIN) tui(sock);
  else plainInteractive(sock);
}

// ---- entry: arg or piped stdin = one-shot; else interactive ----
const argMsg = process.argv.slice(2).join(' ').trim();
if (argMsg) oneShot(argMsg);
else if (!process.stdin.isTTY) {
  let b = ''; process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { b += d; });
  process.stdin.on('end', () => { const m = b.trim(); m ? oneShot(m) : process.exit(0); });
} else interactive();
