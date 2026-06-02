#!/usr/bin/env node
// Helm dashboard — local web UI. Default port 7777. No external deps.
// Usage: node workspace/dashboard/server.mjs [--port N]
// Export: start(port) -> { server, url } for testing.

import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE  = path.resolve(__dirname, '..');
const ROOT       = path.resolve(__dirname, '../..');

const SERVICES = [
  'com.helm.discord',
  'com.helm.think',
  'com.helm.scheduler',
  'com.helm.selfupgrade',
  'com.helm.dashboard',
];

// --- data collectors ---

function launchctlStatus() {
  try {
    const r = spawnSync('launchctl', ['list'], { encoding: 'utf8', timeout: 5000 });
    const map = {};
    for (const line of r.stdout.trim().split('\n').slice(1)) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const [pid, status, label] = parts;
        map[label.trim()] = { pid: pid.trim(), status: status.trim() };
      }
    }
    return SERVICES.map(name => {
      const info = map[name];
      return {
        name,
        running: Boolean(info && info.pid !== '-'),
        pid: info?.pid ?? '-',
        exitStatus: info?.status ?? '—',
      };
    });
  } catch {
    return SERVICES.map(name => ({ name, running: false, pid: '-', exitStatus: 'error' }));
  }
}

function memoryStats() {
  const dbPath = path.join(WORKSPACE, 'memory', 'memory.db');
  if (!existsSync(dbPath)) return { total: 0, byKind: {}, recent: [] };
  let db;
  try {
    db = new DatabaseSync(dbPath);
    const { n: total } = db.prepare('SELECT COUNT(*) AS n FROM facts').get();
    const byKind = {};
    for (const row of db.prepare('SELECT kind, COUNT(*) AS n FROM facts GROUP BY kind').all()) {
      byKind[row.kind] = row.n;
    }
    const recent = db.prepare(
      `SELECT id, kind, key, value, confidence, updated
       FROM facts ORDER BY updated DESC LIMIT 12`
    ).all();
    return { total, byKind, recent };
  } catch (e) {
    return { total: 0, byKind: {}, recent: [], error: e.message };
  } finally {
    try { db?.close(); } catch {}
  }
}

function schedulerJobs() {
  const dbPath = path.join(WORKSPACE, 'scheduler', 'jobs.db');
  if (!existsSync(dbPath)) return [];
  let db;
  try {
    db = new DatabaseSync(dbPath);
    const jobs = db.prepare(
      `SELECT id, name, cron, enabled, last_run, next_run, payload
       FROM jobs ORDER BY enabled DESC, name ASC`
    ).all();
    return jobs;
  } catch {
    return [];
  } finally {
    try { db?.close(); } catch {}
  }
}

function thinkJournal() {
  const dir = path.join(WORKSPACE, 'think', 'journal');
  if (!existsSync(dir)) return [];
  try {
    const files = readdirSync(dir).filter(f => /\.(md|txt|json)$/.test(f)).sort().slice(-5);
    return files.map(f => {
      const content = readFileSync(path.join(dir, f), 'utf8');
      return { file: f, excerpt: content.slice(0, 500) };
    }).reverse();
  } catch {
    return [];
  }
}

function upgradeHistory() {
  const logPath = path.join(WORKSPACE, 'upgrades', 'UPGRADE_LOG.md');
  if (!existsSync(logPath)) return [];
  try {
    const content = readFileSync(logPath, 'utf8');
    // Split on section headers ("## YYYY-...")
    const sections = content.split(/(?=^## )/m).filter(Boolean);
    return sections.slice(-5).reverse().map(s => s.trim());
  } catch {
    return [];
  }
}

function gitLog() {
  try {
    const r = spawnSync('git', ['log', '--oneline', '-5'], { encoding: 'utf8', cwd: ROOT, timeout: 5000 });
    return r.stdout.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function recentRuns() {
  const runsDir = path.join(WORKSPACE, 'runs');
  if (!existsSync(runsDir)) return [];
  try {
    const entries = readdirSync(runsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort()
      .slice(-5)
      .reverse();
    return entries.map(name => {
      const resultPath = path.join(runsDir, name, 'result.md');
      const result = existsSync(resultPath)
        ? readFileSync(resultPath, 'utf8').slice(0, 400)
        : null;
      return { name, result };
    });
  } catch {
    return [];
  }
}

function buildState() {
  return {
    ts: new Date().toISOString(),
    services: launchctlStatus(),
    memory: memoryStats(),
    jobs: schedulerJobs(),
    journal: thinkJournal(),
    upgradeHistory: upgradeHistory(),
    gitLog: gitLog(),
    recentRuns: recentRuns(),
  };
}

// --- HTML renderer ---

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtTs(unix) {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleString('en-GB', { hour12: false });
}

function renderServices(services) {
  const rows = services.map(s => `
    <tr>
      <td><span class="dot ${s.running ? 'green' : 'red'}"></span></td>
      <td class="mono">${esc(s.name)}</td>
      <td>${s.running ? 'running' : 'stopped'}</td>
      <td class="mono dim">${esc(s.pid)}</td>
      <td class="mono dim">${esc(s.exitStatus)}</td>
    </tr>`).join('');
  return `<table><thead><tr><th></th><th>Label</th><th>State</th><th>PID</th><th>Exit</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderMemory(mem) {
  const kinds = Object.entries(mem.byKind).map(([k, n]) => `<span class="badge">${esc(k)} ${n}</span>`).join(' ');
  const rows = (mem.recent || []).map(f => `
    <tr>
      <td class="mono dim">${esc(f.kind)}</td>
      <td class="mono">${esc(f.key)}</td>
      <td>${esc(String(f.value).slice(0, 80))}</td>
      <td class="mono dim">${Number(f.confidence).toFixed(2)}</td>
      <td class="dim">${fmtTs(f.updated)}</td>
    </tr>`).join('');
  return `
    <p>Total facts: <strong>${mem.total}</strong> &nbsp; ${kinds}</p>
    <table><thead><tr><th>Kind</th><th>Key</th><th>Value</th><th>Conf</th><th>Updated</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function renderJobs(jobs) {
  if (!jobs.length) return '<p class="dim">No jobs found.</p>';
  const rows = jobs.map(j => `
    <tr class="${j.enabled ? '' : 'dim'}">
      <td><span class="dot ${j.enabled ? 'green' : 'grey'}"></span></td>
      <td class="mono">${esc(j.name)}</td>
      <td class="mono">${esc(j.cron)}</td>
      <td class="dim">${fmtTs(j.last_run)}</td>
      <td class="dim">${fmtTs(j.next_run)}</td>
    </tr>`).join('');
  return `<table><thead><tr><th></th><th>Name</th><th>Cron</th><th>Last run</th><th>Next run</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderJournal(entries) {
  if (!entries.length) return '<p class="dim">No journal entries.</p>';
  return entries.map(e => `
    <details>
      <summary class="mono">${esc(e.file)}</summary>
      <pre>${esc(e.excerpt)}${e.excerpt.length >= 500 ? '\n…' : ''}</pre>
    </details>`).join('');
}

function renderUpgrades(sections) {
  if (!sections.length) return '<p class="dim">No upgrade history.</p>';
  return sections.map(s => {
    const firstLine = s.split('\n')[0];
    const rest = s.split('\n').slice(1).join('\n').trim();
    return `<details><summary>${esc(firstLine)}</summary><pre>${esc(rest.slice(0, 600))}${rest.length > 600 ? '\n…' : ''}</pre></details>`;
  }).join('');
}

function renderGit(commits) {
  if (!commits.length) return '<p class="dim">No commits.</p>';
  return `<ol>${commits.map(c => `<li class="mono">${esc(c)}</li>`).join('')}</ol>`;
}

function renderRuns(runs) {
  if (!runs.length) return '<p class="dim">No runs yet.</p>';
  return runs.map(r => `
    <details>
      <summary class="mono">${esc(r.name)}</summary>
      ${r.result != null
        ? `<pre>${esc(r.result)}${r.result.length >= 400 ? '\n…' : ''}</pre>`
        : '<p class="dim">No result.md</p>'}
    </details>`).join('');
}

function buildHTML(state) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Helm Dashboard</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0b0d11;
    --surface: #13161d;
    --border: #1e2230;
    --text: #d0d6e8;
    --dim: #606880;
    --green: #3dcc6e;
    --red: #e85454;
    --grey: #404050;
    --accent: #5b8fee;
    --mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  }
  body { background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; font-size: 14px; line-height: 1.5; }
  header { padding: 18px 24px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  header h1 { font-size: 18px; font-weight: 600; letter-spacing: .03em; color: #fff; }
  #refresh-ts { font-size: 12px; color: var(--dim); }
  #refresh-countdown { font-size: 11px; color: var(--dim); }
  main { padding: 20px 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media(max-width: 760px) { main { grid-template-columns: 1fr; } }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
  .card.full { grid-column: 1 / -1; }
  .card h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--accent); margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--dim); font-weight: 500; padding: 3px 8px 6px 0; border-bottom: 1px solid var(--border); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  td { padding: 5px 8px 5px 0; border-bottom: 1px solid var(--border); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
  .dot.green { background: var(--green); box-shadow: 0 0 6px var(--green); }
  .dot.red   { background: var(--red); }
  .dot.grey  { background: var(--grey); }
  .mono { font-family: var(--mono); font-size: 12px; }
  .dim { color: var(--dim); }
  .badge { display: inline-block; background: #1a1e2a; border: 1px solid var(--border); border-radius: 4px; padding: 1px 7px; font-size: 12px; font-family: var(--mono); margin-right: 4px; }
  pre { font-family: var(--mono); font-size: 11px; color: var(--dim); white-space: pre-wrap; word-break: break-word; margin-top: 8px; line-height: 1.6; }
  details { margin-bottom: 8px; }
  summary { cursor: pointer; font-size: 13px; color: var(--text); padding: 4px 0; }
  summary:hover { color: #fff; }
  ol { padding-left: 20px; }
  li.mono { font-size: 12px; padding: 2px 0; }
  p { font-size: 13px; margin-bottom: 8px; }
  .fleet-badge { font-size: 22px; font-weight: 700; color: var(--accent); font-family: var(--mono); }
  #flash { position: fixed; top: 10px; right: 16px; background: var(--accent); color: #fff; font-size: 12px; padding: 4px 12px; border-radius: 20px; opacity: 0; transition: opacity .3s; }
  #flash.show { opacity: 1; }
</style>
</head>
<body>
<div id="flash">Refreshed</div>
<header>
  <h1>Helm Dashboard</h1>
  <div>
    <div id="refresh-ts">Updated: <span id="ts">${esc(state.ts)}</span></div>
    <div id="refresh-countdown">Next refresh in <span id="countdown">10</span>s</div>
  </div>
</header>
<main id="main">
${renderAllCards(state)}
</main>
<script>
(function() {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function fmtTs(unix) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleString('en-GB', { hour12: false });
  }
  function renderServices(services) {
    const rows = services.map(s =>
      '<tr><td><span class="dot ' + (s.running ? 'green' : 'red') + '"></span></td>' +
      '<td class="mono">' + esc(s.name) + '</td>' +
      '<td>' + (s.running ? 'running' : 'stopped') + '</td>' +
      '<td class="mono dim">' + esc(s.pid) + '</td>' +
      '<td class="mono dim">' + esc(s.exitStatus) + '</td></tr>'
    ).join('');
    return '<table><thead><tr><th></th><th>Label</th><th>State</th><th>PID</th><th>Exit</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function renderMemory(mem) {
    const kinds = Object.entries(mem.byKind || {}).map(([k, n]) => '<span class="badge">' + esc(k) + ' ' + n + '</span>').join(' ');
    const rows = (mem.recent || []).map(f =>
      '<tr><td class="mono dim">' + esc(f.kind) + '</td>' +
      '<td class="mono">' + esc(f.key) + '</td>' +
      '<td>' + esc(String(f.value).slice(0, 80)) + '</td>' +
      '<td class="mono dim">' + Number(f.confidence).toFixed(2) + '</td>' +
      '<td class="dim">' + fmtTs(f.updated) + '</td></tr>'
    ).join('');
    return '<p>Total facts: <strong>' + mem.total + '</strong> &nbsp; ' + kinds + '</p>' +
      '<table><thead><tr><th>Kind</th><th>Key</th><th>Value</th><th>Conf</th><th>Updated</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function renderJobs(jobs) {
    if (!jobs.length) return '<p class="dim">No jobs found.</p>';
    const rows = jobs.map(j =>
      '<tr class="' + (j.enabled ? '' : 'dim') + '">' +
      '<td><span class="dot ' + (j.enabled ? 'green' : 'grey') + '"></span></td>' +
      '<td class="mono">' + esc(j.name) + '</td>' +
      '<td class="mono">' + esc(j.cron) + '</td>' +
      '<td class="dim">' + fmtTs(j.last_run) + '</td>' +
      '<td class="dim">' + fmtTs(j.next_run) + '</td></tr>'
    ).join('');
    return '<table><thead><tr><th></th><th>Name</th><th>Cron</th><th>Last run</th><th>Next run</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function renderJournal(entries) {
    if (!entries.length) return '<p class="dim">No journal entries.</p>';
    return entries.map(e =>
      '<details><summary class="mono">' + esc(e.file) + '</summary>' +
      '<pre>' + esc(e.excerpt) + (e.excerpt.length >= 500 ? '\n…' : '') + '</pre></details>'
    ).join('');
  }
  function renderUpgrades(sections) {
    if (!sections.length) return '<p class="dim">No upgrade history.</p>';
    return sections.map(s => {
      const firstLine = s.split('\n')[0];
      const rest = s.split('\n').slice(1).join('\n').trim();
      return '<details><summary>' + esc(firstLine) + '</summary><pre>' + esc(rest.slice(0, 600)) + (rest.length > 600 ? '\n…' : '') + '</pre></details>';
    }).join('');
  }
  function renderGit(commits) {
    if (!commits.length) return '<p class="dim">No commits.</p>';
    return '<ol>' + commits.map(c => '<li class="mono">' + esc(c) + '</li>').join('') + '</ol>';
  }
  function renderRuns(runs) {
    if (!runs || !runs.length) return '<p class="dim">No runs yet.</p>';
    return runs.map(r =>
      '<details><summary class="mono">' + esc(r.name) + '</summary>' +
      (r.result != null
        ? '<pre>' + esc(r.result) + (r.result.length >= 400 ? '\n…' : '') + '</pre>'
        : '<p class="dim">No result.md</p>') +
      '</details>'
    ).join('');
  }
  function renderAllCards(state) {
    return '<div class="card"><h2>Services</h2>' + renderServices(state.services) + '</div>' +
      '<div class="card full"><h2>Memory</h2>' + renderMemory(state.memory) + '</div>' +
      '<div class="card full"><h2>Scheduler Jobs</h2>' + renderJobs(state.jobs) + '</div>' +
      '<div class="card"><h2>Think Journal</h2>' + renderJournal(state.journal) + '</div>' +
      '<div class="card"><h2>Self-Upgrade History</h2>' + renderUpgrades(state.upgradeHistory) + '</div>' +
      '<div class="card"><h2>Recent Job Runs</h2>' + renderRuns(state.recentRuns) + '</div>' +
      '<div class="card"><h2>Git Log (last 5)</h2>' + renderGit(state.gitLog) + '</div>';
  }

  let t = 10;
  const cd = document.getElementById('countdown');
  const flash = document.getElementById('flash');

  function tick() {
    t--;
    if (cd) cd.textContent = t;
    if (t <= 0) { t = 10; refresh(); }
  }
  function flash_() {
    flash.classList.add('show');
    setTimeout(() => flash.classList.remove('show'), 1200);
  }
  async function refresh() {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) return;
      const state = await res.json();
      const main = document.getElementById('main');
      if (main) main.innerHTML = renderAllCards(state);
      const tsEl = document.getElementById('ts');
      if (tsEl) tsEl.textContent = state.ts;
      flash_();
    } catch {}
  }

  setInterval(tick, 1000);
})();
</script>
</body>
</html>`;
}

function renderAllCards(state) {
  return `
  <div class="card">
    <h2>Services</h2>
    ${renderServices(state.services)}
  </div>
  <div class="card full">
    <h2>Memory</h2>
    ${renderMemory(state.memory)}
  </div>
  <div class="card full">
    <h2>Scheduler Jobs</h2>
    ${renderJobs(state.jobs)}
  </div>
  <div class="card">
    <h2>Think Journal</h2>
    ${renderJournal(state.journal)}
  </div>
  <div class="card">
    <h2>Self-Upgrade History</h2>
    ${renderUpgrades(state.upgradeHistory)}
  </div>
  <div class="card">
    <h2>Recent Job Runs</h2>
    ${renderRuns(state.recentRuns)}
  </div>
  <div class="card">
    <h2>Git Log (last 5)</h2>
    ${renderGit(state.gitLog)}
  </div>`;
}

// --- server ---

export function start(port = 7777) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Method Not Allowed');
      return;
    }
    try {
      if (req.url === '/api/state') {
        const state = buildState();
        const body = JSON.stringify(state, null, 2);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(body);
      } else {
        const state = buildState();
        const body = buildHTML(state);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(body);
      }
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(String(err));
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
    server.on('error', reject);
  });
}

// --- main ---

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const portArg = process.argv.indexOf('--port');
  const port = portArg !== -1 ? parseInt(process.argv[portArg + 1], 10) : 7777;
  start(port).then(({ url }) => {
    console.log(`[dashboard] Helm dashboard running at ${url}`);
  }).catch(err => {
    console.error('[dashboard] Failed to start:', err.message);
    process.exit(1);
  });
}
