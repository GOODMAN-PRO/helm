// app-build skill — scaffold a REAL, working app, then make Helm verify it before claiming "done".
//
// Why this exists: Helm's failure mode when "build me an app" is to produce a convincing UI shell with
// the functionality STUBBED (e.g. an IPC handler that just echoes), then report "built & running" without
// ever launching it. This skill hands back a skeleton whose core wiring is ALREADY REAL (a desktop app
// that talks to Helm's own brain over the loopback bridge), plus a hard checklist that forbids stubs and
// fake completion. Use it whenever you're asked to build an app.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const description =
  'Build a REAL app — never stub functionality or claim "done" without running it. Usage: app-build desktop <name>. ' +
  'Scaffolds a WORKING Electron app (already wired to Helm\'s brain on 127.0.0.1:4625, Claude-grade design tokens) ' +
  'into apps/<name>/. RULES you must then follow: (1) implement actual features — NO placeholder/echo handlers; ' +
  '(2) if asked to match a reference app, screenshot that app and match its palette/layout/type, do not guess; ' +
  '(3) RUN it and screenshot it; confirm a real end-to-end round-trip works; (4) only say "done" after you have ' +
  'SEEN it work; (5) no emojis. A nice-looking shell that does nothing is a failure, not a deliverable.';

const ROOT = path.resolve(process.env.WORKSPACE || './workspace', '..');

const PKG = (name) => JSON.stringify({
  name: `helm-${name}`,
  version: '1.0.0',
  description: `Helm app: ${name}`,
  main: 'main.js',
  scripts: { dev: 'electron .', build: 'electron-builder --mac' },
  devDependencies: { electron: '^42.0.0', 'electron-builder': '^26.0.0' },
}, null, 2) + '\n';

// main.js — the IPC handler is REAL: it relays to the running Helm brain over the bridge cli.js uses.
const MAIN_JS = `const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const net = require('net');

const HELM_PORT = parseInt(process.env.HELM_CLI_PORT || '4625', 10);
const HELM_HOST = '127.0.0.1';
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1040, height: 720, minWidth: 560, minHeight: 420,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 18 },
    backgroundColor: '#F5F4EE',
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('closed', () => { win = null; });
}

// REAL brain wiring — DO NOT replace with an echo/placeholder. Relays the message to the running Helm
// and resolves with its reply. Newline-delimited JSON: client -> {type:'msg',text}, server -> {type:'reply',text}.
ipcMain.handle('send-message', async (_e, message) => new Promise((resolve, reject) => {
  const sock = net.connect({ host: HELM_HOST, port: HELM_PORT });
  sock.setEncoding('utf8');
  let buf = '';
  const timer = setTimeout(() => { try { sock.destroy(); } catch {} reject(new Error('Helm took too long to reply.')); }, 30 * 60000);
  sock.once('connect', () => sock.write(JSON.stringify({ type: 'msg', text: message }) + '\\n'));
  sock.on('data', (chunk) => {
    buf += chunk; let nl;
    while ((nl = buf.indexOf('\\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'reply') { clearTimeout(timer); resolve(m.text); try { sock.end(); } catch {} return; }
    }
  });
  sock.once('error', () => { clearTimeout(timer); reject(new Error(\`Can't reach Helm on \${HELM_HOST}:\${HELM_PORT}. Start it with \\\`helm\\\`.\`)); });
}));

app.on('ready', createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (win === null) createWindow(); });
`;

const PRELOAD_JS = `const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('helm', {
  sendMessage: (message) => ipcRenderer.invoke('send-message', message),
});
`;

// index.html — a clean, retheme-able design system (warm neutral defaults). Wired to window.helm.
const INDEX_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Helm</title><style>
  :root{--bg:#F5F4EE;--sidebar:#EDEBE2;--panel:#FBFAF6;--text:#2B2A26;--dim:#76736A;--border:#E4E1D6;
    --accent:#CC785C;--accent-h:#B5664B;--bubble:#ECEAE0;--radius:16px;
    --font:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;}
  *{margin:0;padding:0;box-sizing:border-box}html,body{height:100%}
  body{font-family:var(--font);background:var(--bg);color:var(--text);display:flex;font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}
  #sidebar{width:256px;flex-shrink:0;background:var(--sidebar);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:46px 12px 14px;user-select:none;-webkit-app-region:drag}
  .brand{display:flex;align-items:center;gap:9px;padding:4px 8px 16px;font-weight:600;font-size:16px}
  .brand .mark{width:22px;height:22px;border-radius:6px;background:var(--accent);display:grid;place-items:center;color:#fff;font-size:13px;font-weight:700}
  .new-chat{-webkit-app-region:no-drag;display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;background:var(--panel);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;font-weight:500;cursor:pointer}
  .new-chat:hover{background:#fff}.new-chat .plus{color:var(--accent);font-size:16px}
  .label{padding:20px 10px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--dim)}
  .recent{-webkit-app-region:no-drag;flex:1;overflow-y:auto}.recent .empty{padding:6px 10px;font-size:13px;color:var(--dim)}
  .foot{-webkit-app-region:no-drag;padding:8px 10px 2px;font-size:12px;color:var(--dim)}
  .dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#6FB07F;margin-right:6px;vertical-align:middle}.dot.off{background:#C0584B}
  #main{flex:1;display:flex;flex-direction:column;min-width:0}#drag{height:30px;-webkit-app-region:drag}
  #messages{flex:1;overflow-y:auto;padding:8px 24px 24px}.thread{max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:22px}
  .row{display:flex}.row.user{justify-content:flex-end}.message{max-width:78%;word-wrap:break-word;white-space:pre-wrap}
  .row.user .message{background:var(--bubble);border:1px solid var(--border);padding:11px 15px;border-radius:14px 14px 4px 14px}
  .row.assistant .message{max-width:100%}.error .message{color:#B5443A}
  .dots{display:inline-flex;gap:5px;padding:6px 2px}.dots span{width:7px;height:7px;border-radius:50%;background:#C9B7AC;animation:b 1.3s infinite ease-in-out}
  .dots span:nth-child(2){animation-delay:.18s}.dots span:nth-child(3){animation-delay:.36s}@keyframes b{0%,80%,100%{opacity:.25}40%{opacity:1}}
  .welcome{max-width:720px;margin:12vh auto 0;text-align:center;padding:0 24px}.welcome .big{font-size:26px;font-weight:600;letter-spacing:-.02em}.welcome .sub{margin-top:8px;color:var(--dim)}
  #composer{padding:8px 24px 22px}.ci{max-width:720px;margin:0 auto;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 8px 24px rgba(60,55,45,.05);display:flex;align-items:flex-end;gap:8px;padding:10px 10px 10px 16px}
  .ci:focus-within{border-color:#D3B5A6}#input{flex:1;resize:none;border:none;outline:none;background:transparent;color:var(--text);font-family:inherit;font-size:15px;line-height:1.5;max-height:180px;padding:6px 0}
  #input::placeholder{color:var(--dim)}#send{flex-shrink:0;width:34px;height:34px;border-radius:9px;border:none;background:var(--accent);color:#fff;cursor:pointer;display:grid;place-items:center}#send:hover:not(:disabled){background:var(--accent-h)}#send:disabled{opacity:.4}#send svg{width:17px;height:17px}
  .hint{max-width:720px;margin:8px auto 0;text-align:center;font-size:11.5px;color:var(--dim)}
  ::-webkit-scrollbar{width:8px}::-webkit-scrollbar-thumb{background:#D8D5C9;border-radius:4px}
</style></head><body>
  <aside id="sidebar"><div class="brand"><span class="mark">H</span>Helm</div>
    <button class="new-chat" id="new"><span class="plus">+</span> New chat</button>
    <div class="label">Recent</div><div class="recent"><div class="empty">No conversations yet</div></div>
    <div class="foot"><span class="dot" id="dot"></span><span id="st">connected</span></div></aside>
  <main id="main"><div id="drag"></div>
    <div id="messages"><div class="welcome" id="welcome"><div class="big">Helm</div><div class="sub">Your personal AI, running on this machine. Ask anything.</div></div><div class="thread" id="thread"></div></div>
    <div id="composer"><div class="ci"><textarea id="input" rows="1" placeholder="Message Helm…"></textarea>
      <button id="send" title="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg></button></div>
      <div class="hint">Enter to send · Shift+Enter for a new line</div></div></main>
<script>
  const thread=document.getElementById('thread'),md=document.getElementById('messages'),welcome=document.getElementById('welcome');
  const inp=document.getElementById('input'),send=document.getElementById('send'),dot=document.getElementById('dot'),st=document.getElementById('st');
  const down=()=>md.scrollTop=md.scrollHeight;
  function add(text,user=false,err=false){if(welcome)welcome.style.display='none';const r=document.createElement('div');r.className='row '+(user?'user':'assistant')+(err?' error':'');const m=document.createElement('div');m.className='message';m.textContent=text;r.appendChild(m);thread.appendChild(r);down();return r;}
  function typing(){if(welcome)welcome.style.display='none';const r=document.createElement('div');r.className='row assistant';r.innerHTML='<div class="message"><div class="dots"><span></span><span></span><span></span></div></div>';thread.appendChild(r);down();return r;}
  const grow=()=>{inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,180)+'px'};inp.addEventListener('input',grow);
  async function go(){const t=inp.value.trim();if(!t)return;add(t,true);inp.value='';grow();send.disabled=true;const ty=typing();
    try{const res=await window.helm.sendMessage(t);ty.remove();add(res,false);dot.classList.remove('off');st.textContent='connected';}
    catch(e){ty.remove();add(e.message||String(e),false,true);dot.classList.add('off');st.textContent='brain offline';}
    finally{send.disabled=false;inp.focus();}}
  send.addEventListener('click',go);inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();go();}});
  document.getElementById('new').addEventListener('click',()=>{thread.innerHTML='';if(welcome)welcome.style.display='';inp.focus();});inp.focus();
</script></body></html>
`;

export async function execute(argsStr = '') {
  const parts = argsStr.trim().split(/\s+/).filter(Boolean);
  const kind = (parts[0] || 'desktop').toLowerCase();
  const name = (parts[1] || '').replace(/[^a-zA-Z0-9_-]/g, '') || 'app';

  if (kind === 'web') {
    return 'Web apps run in a browser and cannot open a raw TCP socket to the brain on 4625. ' +
      'Either build a DESKTOP app (app-build desktop <name>) which can, or first add an HTTP bridge to the brain. ' +
      'Do not fake the connection with canned responses.';
  }
  if (kind !== 'desktop') {
    return `Unknown kind "${kind}". Use: app-build desktop <name>`;
  }

  const dir = path.join(ROOT, 'apps', name);
  if (existsSync(path.join(dir, 'main.js'))) {
    return `An app already exists at ${dir}. Edit it in place (and remember: implement real features, then RUN and verify before claiming done).`;
  }
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), PKG(name));
    writeFileSync(path.join(dir, 'main.js'), MAIN_JS);
    writeFileSync(path.join(dir, 'preload.js'), PRELOAD_JS);
    writeFileSync(path.join(dir, 'index.html'), INDEX_HTML);
    writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\ndist/\n');
  } catch (e) {
    return `Scaffold failed: ${e.message}`;
  }

  return [
    `Scaffolded a WORKING desktop app at ${dir}`,
    `  package.json · main.js (brain bridge ALREADY wired — not a stub) · preload.js · index.html (Claude-grade design)`,
    ``,
    `Now, in order — and do NOT skip the verify step:`,
    `  1. cd ${path.join('apps', name)} && npm install`,
    `  2. Implement the ACTUAL features the owner asked for. Replace nothing with a placeholder/echo — wire real logic.`,
    `  3. If you were told to match a reference app's look, screenshot that app first and match palette/spacing/type — don't guess.`,
    `  4. RUN it: npm run dev (the Helm brain must be running). Then screenshot the window and confirm a real message round-trips.`,
    `  5. Only report "done" AFTER you have seen it work end-to-end. A pretty shell that does nothing is a failure. No emojis.`,
  ].join('\n');
}
