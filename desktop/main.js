const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, globalShortcut, shell, nativeTheme, dialog } = require('electron');
const path = require('path');
const net = require('net');
const fs = require('fs');

const HELM_PORT = parseInt(process.env.HELM_CLI_PORT || '4625', 10);
const HELM_HOST = '127.0.0.1';
const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');

let win, tray, sock, reconnectTimer, buf = '';
let quitting = false;

// ---------------- window ----------------
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')); } catch { return {}; } }
function saveState() { if (!win || win.isDestroyed()) return; try { fs.writeFileSync(STATE_FILE(), JSON.stringify(win.getBounds())); } catch {} }

function createWindow() {
  const s = loadState();
  win = new BrowserWindow({
    width: s.width || 1040, height: s.height || 720,
    x: s.x, y: s.y, minWidth: 560, minHeight: 420,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 18 },
    backgroundColor: '#F5F4EE', show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('resize', saveState);
  win.on('move', saveState);
  win.on('close', (e) => { if (!quitting && process.platform === 'darwin') { e.preventDefault(); win.hide(); } });
}

// ---------------- brain bridge (persistent) ----------------
function toRenderer(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }

function connectBrain() {
  try { if (sock) sock.destroy(); } catch {}
  sock = net.connect({ host: HELM_HOST, port: HELM_PORT });
  sock.setEncoding('utf8');
  sock.on('connect', () => { toRenderer('conn', true); try { sock.write(JSON.stringify({ type: 'hello' }) + '\n'); } catch {} });
  sock.on('data', (chunk) => {
    buf += chunk; let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'reply') toRenderer('reply', m.text);
      else if (m.type === 'status') toRenderer('status', m.text);
      else if (m.type === 'attach') toRenderer('attach', m.files || []);
      else if (m.type === 'echo') toRenderer('echo', { from: m.from, text: m.text });
      else if (m.type === 'info') toRenderer('info', m.text);
    }
  });
  const drop = () => { toRenderer('conn', false); clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connectBrain, 1500); };
  sock.on('close', drop);
  sock.on('error', () => {});
}
function sendToBrain(text, conv) { try { sock.write(JSON.stringify({ type: 'msg', text, conv }) + '\n'); } catch { connectBrain(); } }

ipcMain.on('send', (_e, p) => sendToBrain((p && p.text) || '', p && p.conv));
ipcMain.on('stop', () => sendToBrain('stop'));
ipcMain.on('open-external', (_e, url) => { if (/^https?:\/\//i.test(url || '')) shell.openExternal(url); });
ipcMain.on('open-path', (_e, p) => { if (p) shell.openPath(p); });
ipcMain.handle('theme', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'));
ipcMain.handle('pick-files', async () => {
  try {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], title: 'Attach documents for Helm to read' });
    return r.canceled ? [] : r.filePaths;
  } catch { return []; }
});

// ---------------- tray + global hotkey + menu ----------------
const TRAY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAt0lEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMAoAr1wD/dT8r6sAAAAASUVORK5CYII=';
function createTray() {
  try {
    const icon = nativeImage.createFromDataURL(TRAY_ICON).resize({ width: 18, height: 18 });
    icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip('Helm');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Helm', click: showWindow },
      { label: 'New Chat', click: () => { showWindow(); toRenderer('menu', 'new'); } },
      { type: 'separator' },
      { label: 'Quit Helm', click: () => { quitting = true; app.quit(); } },
    ]));
    tray.on('click', showWindow);
  } catch {}
}
function showWindow() { if (!win) createWindow(); else { win.show(); win.focus(); } }
function toggleWindow() { if (win && win.isVisible() && win.isFocused()) win.hide(); else showWindow(); }

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { label: 'Settings…', accelerator: 'Cmd+,', click: () => toRenderer('menu', 'settings') }, { type: 'separator' }, { role: 'hide' }, { role: 'quit', click: () => { quitting = true; app.quit(); } }] }] : []),
    { label: 'File', submenu: [
      { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: () => toRenderer('menu', 'new') },
      { label: 'Search Chats', accelerator: 'CmdOrCtrl+K', click: () => toRenderer('menu', 'search') },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('ready', () => {
  createWindow();
  createTray();
  buildMenu();
  connectBrain();
  try { globalShortcut.register('CommandOrControl+Shift+H', toggleWindow); } catch {}
  nativeTheme.on('updated', () => toRenderer('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light'));
});
app.on('activate', () => { if (!win) createWindow(); else win.show(); });
app.on('before-quit', () => { quitting = true; saveState(); });
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch {} });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
