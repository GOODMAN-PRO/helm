const { contextBridge, ipcRenderer } = require('electron');

// Renderer ↔ main bridge. Outgoing actions are one-way sends; brain events are pushed in via callbacks.
contextBridge.exposeInMainWorld('helm', {
  // actions
  send: (text, conv) => ipcRenderer.send('send', { text, conv }),
  stop: () => ipcRenderer.send('stop'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  openPath: (p) => ipcRenderer.send('open-path', p),
  getTheme: () => ipcRenderer.invoke('theme'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  // brain events (persistent connection in main relays everything here)
  onReply: (cb) => ipcRenderer.on('reply', (_e, text) => cb(text)),
  onStatus: (cb) => ipcRenderer.on('status', (_e, text) => cb(text)),
  onAttach: (cb) => ipcRenderer.on('attach', (_e, files) => cb(files)),
  onEcho: (cb) => ipcRenderer.on('echo', (_e, m) => cb(m)),
  onInfo: (cb) => ipcRenderer.on('info', (_e, text) => cb(text)),
  onConn: (cb) => ipcRenderer.on('conn', (_e, up) => cb(up)),
  onThemeChanged: (cb) => ipcRenderer.on('theme-changed', (_e, t) => cb(t)),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
});
