// Helm — terminal client.
//
// This does NOT run its own brain. It connects to the ONE already-running Helm (the Discord/iMessage
// service) over a loopback port and is just another window into the SAME conversation. Messages you
// type here, and Helm's replies, are mirrored across the terminal, Discord and iMessage.
//
// Start Helm first (the service):   node index.js     (or it's already running 24/7)
// Then, in any terminal:
//   node cli.js                 interactive — type messages, see replies + activity from all channels
//   node cli.js "do the thing"  one-shot: send one message, print the reply, exit
//   echo "..." | node cli.js    one-shot from stdin (pipe-friendly)
//
// Commands in interactive mode: /help · /exit   (chat commands like !mode, vault, stop go to Helm).
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
  ? { dim: '\x1b[2m', cyan: '\x1b[36m', teal: '\x1b[38;5;49m', yel: '\x1b[33m', red: '\x1b[31m', b: '\x1b[1m', x: '\x1b[0m' }
  : { dim: '', cyan: '', teal: '', yel: '', red: '', b: '', x: '' };

function connect() {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: HOST, port: PORT });
    sock.setEncoding('utf8');
    sock.once('connect', () => resolve(sock));
    sock.once('error', reject);
  });
}

const notRunning = () => {
  console.error(`${C.red}Helm isn't running.${C.x} Start the service first:  ${C.b}node index.js${C.x}  (or it should already be running 24/7).`);
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

// ---- interactive: a live window into the shared conversation ----
async function interactive() {
  let sock;
  try { sock = await connect(); } catch { notRunning(); process.exit(1); }

  console.log(`${C.teal}${C.b}Helm${C.x} ${C.dim}— terminal (live window into the one running Helm; shared with Discord & iMessage)${C.x}`);
  console.log(`${C.dim}Type a message. Activity from all channels shows here. Commands: /help · /exit${C.x}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: `${C.cyan}you ›${C.x} ` });
  const redraw = () => { if (process.stdout.isTTY) { rl.prompt(true); } };
  let statusLine = false;
  const clearStatus = () => { if (statusLine && process.stdout.isTTY) { process.stdout.write('\r\x1b[2K'); statusLine = false; } };

  let buf = '';
  sock.on('data', chunk => {
    buf += chunk; let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      clearStatus();
      if (m.type === 'reply')  { process.stdout.write(`\r\x1b[2K${C.teal}helm ›${C.x} ${m.text}\n`); redraw(); }
      else if (m.type === 'echo')   { process.stdout.write(`\r\x1b[2K${C.dim}${m.from || 'other'} › ${m.text}${C.x}\n`); redraw(); }
      else if (m.type === 'status') { if (process.stdout.isTTY) { process.stdout.write(`\r\x1b[2K${C.dim}${m.text}${C.x}`); statusLine = true; } }
      else if (m.type === 'info')   { process.stdout.write(`\r\x1b[2K${C.dim}· ${m.text}${C.x}\n`); redraw(); }
    }
  });
  sock.on('close', () => { console.log(`\n${C.red}Helm disconnected.${C.x} (the service stopped?)`); process.exit(1); });
  sock.on('error', () => { console.log(`\n${C.red}connection lost.${C.x}`); process.exit(1); });
  sock.write(JSON.stringify({ type: 'hello' }) + '\n');

  rl.prompt();
  rl.on('line', line => {
    const text = line.trim();
    if (!text) { rl.prompt(); return; }
    if (text === '/exit' || text === '/quit') { rl.close(); return; }
    if (text === '/help') {
      console.log(`${C.dim}This terminal is a client of the one running Helm.\n  type anything   send a message (Helm + Discord + iMessage all see it)\n  stop            cancel an in-flight task (a normal Helm chat command)\n  !mode ...       change autonomy (a normal Helm chat command)\n  /exit           close this terminal (Helm keeps running)${C.x}`);
      rl.prompt(); return;
    }
    sock.write(JSON.stringify({ type: 'msg', text }) + '\n');
    rl.prompt();
  });
  rl.on('close', () => { console.log(`\n${C.dim}closed (Helm keeps running).${C.x}`); sock.end(); process.exit(0); });
}

// ---- entry: arg or piped stdin = one-shot; else interactive ----
const argMsg = process.argv.slice(2).join(' ').trim();
if (argMsg) oneShot(argMsg);
else if (!process.stdin.isTTY) {
  let b = ''; process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { b += d; });
  process.stdin.on('end', () => { const m = b.trim(); m ? oneShot(m) : process.exit(0); });
} else interactive();
