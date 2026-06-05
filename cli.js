import net from 'node:net';
import readline from 'node:readline';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, '.env'), override: true });
const PORT = parseInt(process.env.HELM_CLI_PORT || '4625', 10);
const HOST = '127.0.0.1';



const IMG_RE = /\.(png|jpe?g|gif|webp|bmp|svg|tiff?|heic|heif|avif)$/i;
function openExternally(file) {
  try {
    const plat = process.platform;
    const cmd  = plat === 'darwin' ? 'open' : plat === 'win32' ? 'cmd' : 'xdg-open';
    const argv = plat === 'win32' ? ['/c', 'start', '', file] : [file];
    spawn(cmd, argv, { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch { return false; }
}

function describeAttachment(f) {
  if (!f) return null;
  const name = path.basename(f);
  if (!existsSync(f)) return `attachment (not found locally): ${f}`;
  if (IMG_RE.test(f)) return (openExternally(f) ? `opened image ${name}` : `image (couldn't open) ${f}`);
  return `attachment: ${f}`;
}

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


async function oneShot(text) {
  let sock;
  try { sock = await connect(); } catch { notRunning(); process.exit(1); }
  let buf = '';
  let gotReply = false, finishTimer = null;
  const timer = setTimeout(() => { console.error(`${C.dim}(no reply within the time limit)${C.x}`); sock.end(); process.exit(1); }, 30 * 60_000);
  const finish = () => { try { sock.end(); } catch {} process.exit(0); };
  sock.on('data', chunk => {
    buf += chunk; let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'reply') {
        clearTimeout(timer); process.stdout.write(m.text + '\n'); gotReply = true;

        clearTimeout(finishTimer); finishTimer = setTimeout(finish, 500);
      } else if (m.type === 'attach') {
        for (const f of (m.files || [])) { const l = describeAttachment(f); if (l) process.stdout.write(`${C.dim}· ${l}${C.x}\n`); }
        if (gotReply) { clearTimeout(finishTimer); finishTimer = setTimeout(finish, 150); }
      }
    }
  });
  sock.on('error', () => { notRunning(); process.exit(1); });
  sock.write(JSON.stringify({ type: 'msg', text }) + '\n');
}


const ESC = '\x1b[';
const out = s => process.stdout.write(s);
const stripAnsi = s => s.replace(/\x1b\[[0-9;]*m/g, '');

// Brand logo: the ship's-wheel mark + HELM wordmark, in the cyan→sky gradient. Drawn on startup.
const WHEEL = [
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
const GRAD = [C.teal, C.teal, C.cyan, C.cyan, C.sky, C.sky];




function demarkdown(s) {
  return String(s)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1$2')
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
  { cmd: 'doctor', desc: 'check your setup: Node, engine, model, config' },
  { cmd: 'pathway', desc: 'show which backend is active: subscription / API key / free / local' },
];

function tui(sock) {
  const stdin = process.stdin;
  let W = process.stdout.columns || 80;
  let H = process.stdout.rows || 24;
  const PANE_W = () => W - 2;
  const HEADER_H = 1, STATUS_H = 1, INPUT_H = 3;
  const bodyH = () => Math.max(1, H - HEADER_H - STATUS_H - INPUT_H);

  const history = [];
  let scroll = 0;
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
  let pasteBuf = null;


  const menuOpen = () => input.startsWith('/');
  const menuMatches = () => {
    const q = input.slice(1).toLowerCase();
    return COMMANDS.filter(c => c.cmd.replace(/^\//, '').toLowerCase().startsWith(q));
  };

  // alt screen + bracketed paste + modifyOtherKeys=2. The last one (CSI >4;2m) asks the terminal to
  // report modified keys as distinct escape sequences — that's what lets us tell Shift+Enter apart from


  const enterAlt = () => out(`${ESC}?1049h${ESC}?2004h${ESC}>4;2m`);
  const leaveAlt = () => out(`${ESC}>4;0m${ESC}?2004l${ESC}?25h${ESC}?1049l`);
  const moveTo = (r, c) => out(`${ESC}${r};${c}H`);
  const clearLine = () => out(`${ESC}2K`);


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
    out(`${ESC}?25l${ESC}H${ESC}J`);   // hide cursor while painting (avoids streak); shown again by drawInputBox

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
    // Hide the cursor while painting so it doesn't streak across the screen; drawInputBox re-shows it

    out(`${ESC}?25l` + (prevW !== W || prevH !== H ? `${ESC}H${ESC}J` : `${ESC}H`));


    const dot = connected ? `${C.grn}●${C.x}` : `${C.red}●${C.x}`;
    const title = `${C.teal}${C.b}⎈ Helm${C.x} ${C.dim}terminal${C.x}`;
    const right = `${dot} ${connected ? `${C.gray}127.0.0.1:${PORT} · shared with Discord & iMessage${C.x}` : `${C.red}disconnected${C.x}`}`;
    const pad = Math.max(1, W - stripAnsi(title).length - stripAnsi(right).length - 2);
    moveTo(1, 2); out(title + ' '.repeat(pad) + right);
    moveTo(2, 1); out(`${C.dim}${'─'.repeat(W)}${C.x}`);


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

    if (scroll > 0) { moveTo(3, W - 4); out(`${C.dim}↑${scroll}${C.x}`); }


    if (menuOpen()) {
      const items = menuMatches();
      if (menuIdx >= items.length) menuIdx = Math.max(0, items.length - 1);
      const rows = Math.min(items.length, Math.max(1, view - 1));
      const firstRow = 3 + view - rows;
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


    moveTo(H - INPUT_H, 2); clearLine();
    out(statusLineText());


    drawInputBox();
  }


  function statusLineText() {
    if (menuOpen()) return `${C.dim}↑/↓ choose · Tab/Enter complete · Esc cancel${C.x}`;
    if (busy) {
      const g = SPIN[spinFrame % SPIN.length];
      const secs = Math.round((Date.now() - busyStart) / 1000);
      const detail = status ? ` ${C.dim}· ${status.replace(/^⚙️\s*/, '')}${C.x}` : '';
      return `${C.cyan}${g}${C.x} ${C.b}${busyVerb}…${C.x} ${C.gray}${secs}s${C.x}${detail} ${C.dim}· esc to interrupt${C.x}`;
    }
    return status ? `${C.gray}${status}${C.x}` : `${C.dim}/ for commands · ⏎ send · ⌃J newline · PgUp/PgDn scroll · esc to quit${C.x}`;
  }

  // Render the rounded, full-width input box with a ghost placeholder when empty.
  // The prompt is "│ > " = 4 columns before the text starts at column 5. Use ASCII ">" (always 1
  // column wide — unlike ❯/U+276F, which some terminals render double-width and shove the cursor off).
  const PROMPT_COL = 5;   // column where typed text begins
  function drawInputBox() {
    const iw = W - 2;
    moveTo(H - 2, 1); out(`${C.dim}╭${'─'.repeat(iw - 2)}╮${C.x}`);
    moveTo(H - 1, 1); clearLine();
    const inner = iw - PROMPT_COL;
    // Multi-line input (a paste, or composed with Shift+Enter) shows a "[N lines]" tag plus the line
    // you're currently on, so the box stays one row tall but you can see what you're typing. Single-line

    const nlines = input ? input.split('\n').length : 0;
    let display, cursorLen;
    if (nlines > 1) {
      const lines = input.split('\n');
      const cur = lines[lines.length - 1];
      const tag = `${C.sky}[${nlines} lines]${C.x} `;
      const room = Math.max(4, inner - stripAnsi(tag).length);
      const shownCur = cur.length > room ? '…' + cur.slice(cur.length - (room - 1)) : cur;
      display = tag + shownCur;
      cursorLen = stripAnsi(tag).length + shownCur.length;
    } else {
      const shown = input.length > inner ? '…' + input.slice(input.length - (inner - 1)) : input;
      display = input ? shown : `${C.dim}${PLACEHOLDER.slice(0, inner)}${C.x}`;
      cursorLen = input ? stripAnsi(shown).length : 0;
    }
    out(`${C.dim}│${C.x} ${C.cyan}>${C.x} ${display}${ESC}K`);
    moveTo(H, 1); out(`${C.dim}╰${'─'.repeat(iw - 2)}╯${C.x}`);

    moveTo(H - 1, PROMPT_COL + cursorLen);
    out(`${ESC}?25h`);
  }



  function drawInput() {
    if (splashing) return draw();
    moveTo(H - INPUT_H, 2); clearLine(); out(statusLineText());
    drawInputBox();
  }

  function add(role, text, label) { splashing = false; history.push({ role, text, label }); scroll = 0; draw(); }


  let buf = '';
  sock.on('data', chunk => {
    buf += chunk; let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'reply') { stopSpin(); status = ''; add('helm', m.text); }
      else if (m.type === 'echo') {

        if (/terminal/i.test(m.from || '')) continue;
        add('other', m.text, m.from || 'other');
      }
      else if (m.type === 'status') { status = m.text; if (!splashing) draw(); }
      else if (m.type === 'attach') {
        for (const f of (m.files || [])) { const line = describeAttachment(f); if (line) add('sys', line); }
      }
      else if (m.type === 'info')   { history.push({ role: 'sys', text: m.text }); scroll = 0; if (!splashing) draw(); }
    }
  });
  sock.on('close', () => { connected = false; status = 'Helm disconnected (service stopped?). Press Esc to quit.'; draw(); });
  sock.on('error', () => { connected = false; status = 'connection lost. Press Esc to quit.'; draw(); });





  if (stdin.isTTY) stdin.setRawMode(true);
  enterAlt(); draw();

  const quit = () => { stopSpin(); try { if (stdin.isTTY) stdin.setRawMode(false); } catch {} leaveAlt(); try { sock.end(); } catch {} process.exit(0); };


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

    if (!/^\s*\/?(stop|cancel|abort|halt)\s*$/i.test(text)) startSpin();
    try { sock.write(JSON.stringify({ type: 'msg', text }) + '\n'); } catch { stopSpin(); add('sys', 'send failed.'); }
  }



  function menuComplete() {
    const items = menuMatches();
    if (!items.length) return false;
    const chosen = items[menuIdx] || items[0];

    const takesArgs = /!mode|!model|vault|^\/?mind/.test(chosen.cmd);
    input = chosen.cmd + (takesArgs ? ' ' : '');
    if (!takesArgs) return submit(), true;   // run bare commands (/help, /exit, stop, doctor) immediately
    draw(); return true;
  }

  // Handle a single logical key. name = symbolic key ('return','escape','backspace','up',… or null),

  function handleKey(name, ch, ctrl) {
    if (ctrl && name === 'c') return quit();
    if (name === 'escape') {
      if (splashing) { splashing = false; return draw(); }
      if (menuOpen()) { input = ''; menuIdx = 0; return draw(); }   // close the menu, don't quit
      if (busy) { stopSpin(); try { sock.write(JSON.stringify({ type: 'msg', text: 'stop' }) + '\n'); } catch {} status = ''; return draw(); }   // esc interrupts the running task
      return quit();
    }
    // first keypress on the splash dismisses it into the chat (without also typing that char)
    if (splashing) { splashing = false; draw(); if (name === 'return') return; }


    if (menuOpen()) {
      if (name === 'up')   { menuIdx = Math.max(0, menuIdx - 1); return draw(); }
      if (name === 'down') { menuIdx = Math.min(menuMatches().length - 1, menuIdx + 1); return draw(); }
      if (name === 'tab')  { if (menuComplete()) return; }
      if (name === 'return') { if (menuComplete()) return; }
      if (name === 'backspace') { input = input.slice(0, -1); menuIdx = 0; return draw(); }
      if (ch && !ctrl) { input += ch; menuIdx = 0; return draw(); }

    }

    if (name === 'return') return submit();

    if (name === 'backspace') { input = input.slice(0, -1); return drawInput(); }
    if (name === 'pageup')   { scroll += Math.max(1, bodyH() - 1); return draw(); }
    if (name === 'pagedown') { scroll = Math.max(0, scroll - Math.max(1, bodyH() - 1)); return draw(); }
    if (name === 'up')   { scroll += 1; return draw(); }
    if (name === 'down') { scroll = Math.max(0, scroll - 1); return draw(); }
    if (ctrl && name === 'u') { input = ''; return drawInput(); }   // clear line
    // a fresh "/" opens the menu → full draw; other chars just repaint the input line
    if (ch && !ctrl) { input += ch; return (input === '/' ? draw() : drawInput()); }
  }

  // A pasted block is appended to the input as ONE chunk (multi-line shows as "[N lines pasted]") and
  // is sent only when you press Enter — exactly like Claude Code. It never fires Enter per line.
  function pasteInto(text) {
    text = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');   // normalize CRLF, drop one trailing NL
    if (!text) return;
    const wasSplash = splashing;
    if (splashing) splashing = false;
    input += text;
    if (wasSplash) draw(); else drawInput();
  }

  // Insert a literal newline into the input — Shift+Enter / Ctrl+Enter / Alt+Enter — so you can compose
  // a multi-line message. The message is sent only on a plain Enter.
  function newline() {
    const wasSplash = splashing;
    if (splashing) splashing = false;
    input += '\n';
    if (wasSplash) draw(); else drawInput();
  }



  function csiKey(key, mod) {
    const ctrl = ((mod - 1) & 4) !== 0;
    if (key === 13 || key === 10) return mod > 1 ? newline() : handleKey('return', null, false);
    if (key === 27) return handleKey('escape', null, false);
    if (key === 9)  return handleKey('tab', null, false);
    if (key === 127 || key === 8) return handleKey('backspace', null, false);
    if (ctrl && key >= 32 && key < 127) { const ch = String.fromCharCode(key).toLowerCase(); return handleKey(ch, ch, true); }
    if (mod === 1 && key >= 32 && key < 127) return handleKey(null, String.fromCharCode(key), false);

  }


  const KEYSEQ = { '\x1b[A':'up','\x1b[B':'down','\x1b[C':'right','\x1b[D':'left',
    '\x1b[5~':'pageup','\x1b[6~':'pagedown','\x1b[H':'home','\x1b[F':'end','\x1b[3~':'delete',
    '\x1bOA':'up','\x1bOB':'down','\x1bOC':'right','\x1bOD':'left' };
  function feedKeys(s) {
    while (s.length) {
      if (s[0] === '\x1b') {

        if (s[1] === '\r' || s[1] === '\n') { s = s.slice(2); newline(); continue; }

        let mk = s.match(/^\x1b\[27;(\d+);(\d+)~/);
        if (mk) { s = s.slice(mk[0].length); csiKey(+mk[2], +mk[1]); continue; }

        let ku = s.match(/^\x1b\[(\d+)(?:;(\d+))?u/);
        if (ku) { s = s.slice(ku[0].length); csiKey(+ku[1], ku[2] ? +ku[2] : 1); continue; }

        let m = null;
        for (const k of Object.keys(KEYSEQ)) if (s.startsWith(k)) { m = k; break; }
        if (m) { s = s.slice(m.length); handleKey(KEYSEQ[m], null, false); continue; }

        let ma = s.match(/^\x1b\[1;\d+([A-D])/);
        if (ma) { const map = { A:'up', B:'down', C:'right', D:'left' }; s = s.slice(ma[0].length); handleKey(map[ma[1]], null, false); continue; }
        if (/^\x1b(\[[0-9;]*|O)$/.test(s)) { keyCarry = s; return; }
        s = s.slice(1); handleKey('escape', null, false); continue;
      }
      const c = s[0];


      if (c === '\r') { s = s.slice(1); if (s[0] === '\n') s = s.slice(1); handleKey('return', null, false); continue; }
      if (c === '\n') { s = s.slice(1); newline(); continue; }
      if (c === '\t') { s = s.slice(1); handleKey('tab', null, false); continue; }
      if (c === '\x7f' || c === '\b') { s = s.slice(1); handleKey('backspace', null, false); continue; }
      if (c === '\x03') { s = s.slice(1); handleKey('c', 'c', true); continue; }
      if (c === '\x15') { s = s.slice(1); handleKey('u', 'u', true); continue; }
      if (c < ' ') { s = s.slice(1); continue; }
      s = s.slice(1); handleKey(null, c, false);
    }
  }








  const PASTE_START = '\x1b[200~', PASTE_END = '\x1b[201~';
  let keyCarry = '';   // partial escape sequence carried to the next data chunk
  stdin.on('data', chunk => {
    let s = keyCarry + chunk.toString('utf8'); keyCarry = '';

    // bracketed paste, in progress or starting in this chunk
    if (pasteBuf !== null || s.includes(PASTE_START)) {
      if (pasteBuf === null) {
        const i = s.indexOf(PASTE_START);
        if (i > 0) feedKeys(s.slice(0, i));          // keys typed just before the paste
        s = s.slice(i + PASTE_START.length); pasteBuf = '';
      }
      const e = s.indexOf(PASTE_END);
      if (e === -1) { pasteBuf += s; return; }        // paste continues in a later chunk
      const body = pasteBuf + s.slice(0, e); pasteBuf = null;
      pasteInto(body);
      feedKeys(s.slice(e + PASTE_END.length));        // anything after the end marker
      return;
    }

    // heuristic paste (no bracketed markers): a multi-line block, or a long blob, pasted at once
    const loneEnter = s === '\r' || s === '\n' || s === '\r\n';
    if (!loneEnter && s[0] !== '\x1b' && (/[\r\n]/.test(s) || s.length > 24)) { pasteInto(s); return; }

    feedKeys(s);
  });

  process.stdout.on('resize', draw);
  sock.write(JSON.stringify({ type: 'hello' }) + '\n');


  history.push({ role: 'sys', text: "connected. Type a message — Helm, Discord and iMessage all share this conversation." });
}


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
      else if (m.type === 'attach') { for (const f of (m.files || [])) { const l = describeAttachment(f); if (l) process.stdout.write(`\r\x1b[2K${C.dim}· ${l}${C.x}\n`); } rl.prompt(true); }
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

  if (process.stdout.isTTY && process.stdin.isTTY && !process.env.HELM_PLAIN) tui(sock);
  else plainInteractive(sock);
}


const argMsg = process.argv.slice(2).join(' ').trim();
if (argMsg) oneShot(argMsg);
else if (!process.stdin.isTTY) {
  let b = ''; process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { b += d; });
  process.stdin.on('end', () => { const m = b.trim(); m ? oneShot(m) : process.exit(0); });
} else interactive();
