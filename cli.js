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

// Brand logo: the ship's-wheel mark + HELM wordmark, in the cyan→sky gradient. Drawn on startup.
const WHEEL = [   // a ship's-wheel mark in box-drawing chars; 6 uniform-width rows to match the wordmark
  '   ╭─┼─╮   ',
  '  ╭┤ │ ├╮  ',
  '  ├┼─●─┼┤  ',
  '  ╰┤ │ ├╯  ',
  '   ╰─┼─╯   ',
  '     ┼     ',
];
const WORD = [
  '██╗  ██╗███████╗██╗     ███╗   ███╗',
  '██║  ██║██╔════╝██║     ████╗ ████║',
  '███████║█████╗  ██║     ██╔████╔██║',
  '██╔══██║██╔══╝  ██║     ██║╚██╔╝██║',
  '██║  ██║███████╗███████╗██║ ╚═╝ ██║',
  '╚═╝  ╚═╝╚══════╝╚══════╝╚═╝     ╚═╝',
];
const GRAD = [C.teal, C.teal, C.cyan, C.cyan, C.sky, C.sky];   // per-row gradient for the wordmark

// Strip markdown markers to PLAIN text (for width-correct wrapping). Helm replies are markdown
// (**bold**, _italic_, `code`); the terminal can't render those, so we show the words without the
// noise symbols. Applied before wrapping so line widths stay accurate.
function demarkdown(s) {
  return String(s)
    .replace(/\*\*([^*]+)\*\*/g, '$1')      // **bold**  -> bold
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2')  // *italic* -> italic (avoid bullets)
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1$2')    // _italic_ -> italic
    .replace(/`([^`]+)`/g, '$1')            // `code`    -> code
    .replace(/^#{1,6}\s+/gm, '')            // # heading -> heading
    .replace(/^\s*[-*]\s+/gm, '• ');        // - bullet  -> • bullet
}

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

// Slash commands available in the terminal. Some are handled by this client (/exit, /help, /clear),
// the rest are sent to Helm as chat commands the brain understands.
const COMMANDS = [
  { cmd: '/help',  desc: 'show this command list' },
  { cmd: '/clear', desc: 'clear the chat history in this window' },
  { cmd: '/exit',  desc: 'close the terminal (Helm keeps running)' },
  { cmd: 'stop',   desc: 'cancel whatever Helm is currently doing' },
  { cmd: '!mode',  desc: 'show or set autonomy: !mode suggest|copilot|autopilot' },
  { cmd: '!model', desc: 'show or pin the model: !model opus|sonnet|haiku|auto' },
  { cmd: 'vault',  desc: 'store a secret: vault <NAME> <value>  ·  vault list' },
  { cmd: 'where',  desc: 'show which machine (peer) is active' },
  { cmd: 'use',    desc: 'switch active machine: use mac | use windows' },
];

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
  let splashing = true; // show the brand logo until the first keypress / message
  let menuIdx = 0;      // highlighted row in the slash-command menu

  // Claude-Code-style working spinner: a cycling glyph + a rotating verb + elapsed seconds.
  const SPIN = ['·', '✢', '✳', '∗', '✻', '✽'];
  const VERBS = ['Cogitating', 'Pondering', 'Thinking', 'Noodling', 'Working', 'Brewing', 'Conjuring', 'Computing', 'Musing', 'Tinkering'];
  let busy = false, spinFrame = 0, busyStart = 0, busyVerb = VERBS[0], spinTimer = null;
  const PLACEHOLDER = 'Ask Helm anything…  ( / for commands )';

  // The command menu is open whenever the input starts with "/". Filter by what's typed so far.
  const menuOpen = () => input.startsWith('/');
  const menuMatches = () => {
    const q = input.slice(1).toLowerCase();   // text after the leading "/"
    return COMMANDS.filter(c => c.cmd.replace(/^\//, '').toLowerCase().startsWith(q));
  };

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
      const wrapped = wrap(demarkdown(m.text), w - 7);     // strip markdown, then indent body under the tag
      wrapped.forEach((ln, i) => {
        const prefix = i === 0 ? `${tag.padEnd(5 + (tag.length - stripAnsi(tag).length))} ${C.dim}│${C.x} ` : `      ${C.dim}│${C.x} `;
        lines.push(prefix + bodyColor + ln + (bodyColor ? C.x : ''));
      });
      lines.push('');   // gap between messages
    }
    return lines;
  }

  // Splash: a Claude-Code-style rounded welcome box (logo + tips), with a live input box below.
  function splash() {
    W = process.stdout.columns || 80;
    H = process.stdout.rows || 24;
    out(`${ESC}H${ESC}J`);

    // logo block (wheel + wordmark in the gradient)
    const logo = [];
    for (let i = 0; i < WORD.length; i++) logo.push(`${C.cyan}${WHEEL[i] || ' '.repeat(11)}${C.x}  ${GRAD[i]}${C.b}${WORD[i]}${C.x}`);

    const tips = [
      '',
      `${C.gray}Your own AI agent — one brain, shared across${C.x}`,
      `${C.gray}this terminal, Discord and iMessage.${C.x}`,
      '',
      `${C.dim}/${C.x} ${C.gray}for commands   ${C.dim}⏎${C.x} ${C.gray}to send   ${C.dim}esc${C.x} ${C.gray}to quit${C.x}`,
    ];
    const block = [...logo, ...tips];
    const inW = Math.min(W - 6, Math.max(...block.map(l => stripAnsi(l).length)) + 4);
    const top = Math.max(1, Math.floor((H - (block.length + 2)) / 2) - 1);
    const left = Math.max(1, Math.floor((W - inW) / 2) + 1);

    // rounded box
    moveTo(top, left); out(`${C.cyan}╭${'─'.repeat(inW)}╮${C.x}`);
    block.forEach((ln, i) => {
      const w = stripAnsi(ln).length;
      const lp = Math.floor((inW - w) / 2), rp = inW - w - lp;
      moveTo(top + 1 + i, left); out(`${C.cyan}│${C.x}${' '.repeat(lp)}${ln}${' '.repeat(rp)}${C.cyan}│${C.x}`);
    });
    moveTo(top + 1 + block.length, left); out(`${C.cyan}╰${'─'.repeat(inW)}╯${C.x}`);

    // a (non-interactive) input box at the bottom so the first frame already looks like the chat
    drawInputBox();
  }

  function draw() {
    if (splashing) return splash();
    const prevW = W, prevH = H;
    W = process.stdout.columns || 80;
    H = process.stdout.rows || 24;
    // Only hard-clear the whole screen when the terminal was resized; otherwise just home the cursor
    // and let each row clear itself as it's rewritten — avoids the full-screen blank flash (flicker).
    out(prevW !== W || prevH !== H ? `${ESC}H${ESC}J` : `${ESC}H`);

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

    // slash-command menu: floats over the bottom of the body pane, just above the input box
    if (menuOpen()) {
      const items = menuMatches();
      if (menuIdx >= items.length) menuIdx = Math.max(0, items.length - 1);
      const rows = Math.min(items.length, Math.max(1, view - 1));
      const firstRow = 3 + view - rows;   // bottom-align within the body pane
      for (let i = 0; i < rows; i++) {
        const it = items[i]; const sel = i === menuIdx;
        moveTo(firstRow + i, 2); clearLine();
        const name = it.cmd.padEnd(8);
        out(sel
          ? `${C.teal}${C.b}❯ ${name}${C.x} ${C.gray}${it.desc}${C.x}`
          : `  ${C.cyan}${name}${C.x} ${C.dim}${it.desc}${C.x}`);
      }
      if (!items.length) { moveTo(3 + view - 1, 2); clearLine(); out(`${C.dim}  (no matching command)${C.x}`); }
    }

    // status line — a Claude-Code-style spinner while Helm works, else hints
    moveTo(H - INPUT_H, 2); clearLine();
    out(statusLineText());

    // rounded input box (Claude-Code look)
    drawInputBox();
  }

  // The text shown on the status line above the input.
  function statusLineText() {
    if (menuOpen()) return `${C.dim}↑/↓ choose · Tab/Enter complete · Esc cancel${C.x}`;
    if (busy) {
      const g = SPIN[spinFrame % SPIN.length];
      const secs = Math.round((Date.now() - busyStart) / 1000);
      const detail = status ? ` ${C.dim}· ${status.replace(/^⚙️\s*/, '')}${C.x}` : '';
      return `${C.cyan}${g}${C.x} ${C.b}${busyVerb}…${C.x} ${C.gray}${secs}s${C.x}${detail} ${C.dim}· esc to interrupt${C.x}`;
    }
    return status ? `${C.gray}${status}${C.x}` : `${C.dim}/ for commands · ⏎ send · PgUp/PgDn scroll · esc to quit${C.x}`;
  }

  // Render the rounded, full-width input box with a ghost placeholder when empty.
  function drawInputBox() {
    const iw = W - 2;
    moveTo(H - 2, 1); out(`${C.dim}╭${'─'.repeat(iw - 2)}╮${C.x}`);
    moveTo(H - 1, 1); clearLine();
    const inner = iw - 5;
    const shown = input.length > inner ? '…' + input.slice(input.length - (inner - 1)) : input;
    const body = input ? shown : `${C.dim}${PLACEHOLDER.slice(0, inner)}${C.x}`;
    out(`${C.dim}│${C.x} ${C.cyan}❯${C.x} ${body}${ESC}K ${C.dim}│${C.x}`);
    moveTo(H, 1); out(`${C.dim}╰${'─'.repeat(iw - 2)}╯${C.x}`);
    // cursor sits right after the typed text (at the prompt if empty)
    moveTo(H - 1, 5 + (input ? stripAnsi(shown).length : 0));
  }

  // Lightweight redraw of JUST the input line (no full-screen clear) — used while typing so the
  // screen doesn't flicker on every keystroke. Also repaints the status line (spinner stays live).
  function drawInput() {
    if (splashing) return draw();
    moveTo(H - INPUT_H, 2); clearLine(); out(statusLineText());
    drawInputBox();
  }

  function add(role, text, label) { splashing = false; history.push({ role, text, label }); scroll = 0; draw(); }

  // ---- socket -> history ----
  let buf = '';
  sock.on('data', chunk => {
    buf += chunk; let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'reply') { stopSpin(); status = ''; add('helm', m.text); }
      else if (m.type === 'echo') {
        // don't double-show our own terminal lines (we already added them on send)
        if (/terminal/i.test(m.from || '')) continue;
        add('other', m.text, m.from || 'other');
      }
      else if (m.type === 'status') { status = m.text; if (!splashing) draw(); }
      else if (m.type === 'info')   { history.push({ role: 'sys', text: m.text }); scroll = 0; if (!splashing) draw(); }   // queue under the splash, don't dismiss it
    }
  });
  sock.on('close', () => { connected = false; status = 'Helm disconnected (service stopped?). Press Esc to quit.'; draw(); });
  sock.on('error', () => { connected = false; status = 'connection lost. Press Esc to quit.'; draw(); });

  // ---- raw keyboard ----
  readline.emitKeypressEvents(stdin);
  if (stdin.isTTY) stdin.setRawMode(true);
  enterAlt(); draw();

  const quit = () => { stopSpin(); try { if (stdin.isTTY) stdin.setRawMode(false); } catch {} leaveAlt(); try { sock.end(); } catch {} process.exit(0); };

  // Spinner: animate the status line ~8x/sec while Helm is working; pick a fresh verb each time.
  function startSpin() {
    busy = true; busyStart = Date.now(); spinFrame = 0;
    busyVerb = VERBS[Math.floor((busyStart / 1000) % VERBS.length)];
    if (spinTimer) clearInterval(spinTimer);
    spinTimer = setInterval(() => { spinFrame++; if (!splashing) { moveTo(H - INPUT_H, 2); clearLine(); out(statusLineText()); drawInputBox(); } }, 120);
  }
  function stopSpin() { busy = false; if (spinTimer) { clearInterval(spinTimer); spinTimer = null; } }

  function submit() {
    const text = input.trim(); input = '';
    if (!text) { draw(); return; }
    if (text === '/exit' || text === '/quit') return quit();
    if (text === '/clear') { history.length = 0; scroll = 0; add('sys', 'history cleared (this window only).'); return; }
    if (text === '/help') {
      add('sys', 'Commands (type / to pick from a menu):\n' +
        COMMANDS.map(c => `  ${c.cmd.padEnd(8)} ${c.desc}`).join('\n') +
        '\n\nAnything else is sent to Helm. PgUp/PgDn scroll · Esc closes this window (Helm keeps running).');
      return;
    }
    if (!connected) { add('sys', 'not connected — start Helm with `helm start`.'); return; }
    add('you', text);
    // 'stop' cancels; for anything else, show the working spinner until the reply lands.
    if (!/^\s*\/?(stop|cancel|abort|halt)\s*$/i.test(text)) startSpin();
    try { sock.write(JSON.stringify({ type: 'msg', text }) + '\n'); } catch { stopSpin(); add('sys', 'send failed.'); }
  }

  // Complete the highlighted menu command into the input, ready to run (or run instantly if it takes
  // no arguments). Returns true if it consumed the key.
  function menuComplete() {
    const items = menuMatches();
    if (!items.length) return false;
    const chosen = items[menuIdx] || items[0];
    // commands that take args get the name + a space so you can keep typing; bare ones are ready to send
    const takesArgs = /!mode|!model|vault|use|^\/?(pull|push|mind)/.test(chosen.cmd);
    input = chosen.cmd + (takesArgs ? ' ' : '');
    if (!takesArgs) return submit(), true;   // run /help, /exit, stop, where immediately
    draw(); return true;
  }

  stdin.on('keypress', (ch, key) => {
    if (!key) return;
    const name = key.name;
    if (key.ctrl && name === 'c') return quit();
    if (name === 'escape') {
      if (splashing) { splashing = false; return draw(); }
      if (menuOpen()) { input = ''; menuIdx = 0; return draw(); }   // close the menu, don't quit
      if (busy) { stopSpin(); try { sock.write(JSON.stringify({ type: 'msg', text: 'stop' }) + '\n'); } catch {} status = ''; return draw(); }   // esc interrupts the running task
      return quit();
    }
    // first keypress on the splash dismisses it into the chat (without also typing that char)
    if (splashing) { splashing = false; draw(); if (name === 'return' || name === 'enter') return; }

    // ---- slash-command menu navigation (only while input starts with "/") ----
    if (menuOpen()) {
      if (name === 'up')   { menuIdx = Math.max(0, menuIdx - 1); return draw(); }
      if (name === 'down') { menuIdx = Math.min(menuMatches().length - 1, menuIdx + 1); return draw(); }
      if (name === 'tab')  { if (menuComplete()) return; }
      if (name === 'return' || name === 'enter') { if (menuComplete()) return; }
      if (name === 'backspace') { input = input.slice(0, -1); menuIdx = 0; return draw(); }   // re-filter (full draw)
      if (ch && !key.ctrl && !key.meta && ch >= ' ') { input += ch; menuIdx = 0; return draw(); }
      // fall through for ctrl-u etc.
    }

    if (name === 'return' || name === 'enter') return submit();
    // typing + backspace only repaint the input line (no full clear) → no flicker
    if (name === 'backspace') { input = input.slice(0, -1); return drawInput(); }
    if (name === 'pageup')   { scroll += Math.max(1, bodyH() - 1); return draw(); }
    if (name === 'pagedown') { scroll = Math.max(0, scroll - Math.max(1, bodyH() - 1)); return draw(); }
    if (name === 'up')   { scroll += 1; return draw(); }
    if (name === 'down') { scroll = Math.max(0, scroll - 1); return draw(); }
    if (key.ctrl && name === 'u') { input = ''; return drawInput(); }   // clear line
    // a fresh "/" opens the menu → full draw; other chars just repaint the input line
    if (ch && !key.ctrl && !key.meta && ch >= ' ') { input += ch; return (input === '/' ? draw() : drawInput()); }
  });

  process.stdout.on('resize', draw);
  sock.write(JSON.stringify({ type: 'hello' }) + '\n');
  // queue the greeting WITHOUT dismissing the splash — the logo stays until the user acts, then this
  // message is already there underneath it.
  history.push({ role: 'sys', text: "connected. Type a message — Helm, Discord and iMessage all share this conversation." });
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
