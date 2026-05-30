#!/usr/bin/env node
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, '..');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 7777;

const SERVICES = [
  'com.helm.discord',
  'com.helm.think',
  'com.helm.scheduler',
  'com.helm.selfupgrade',
  'com.helm.dashboard',
];

function getServicesStatus() {
  const r = spawnSync('launchctl', ['list'], { encoding: 'utf8', timeout: 5000 });
  const lines = (r.stdout || '').split('\n');
  return SERVICES.map(svc => {
    const line = lines.find(l => l.includes(svc));
    if (!line) return { name: svc, status: 'not loaded', pid: null, exit: null };
    const parts = line.trim().split(/\s+/);
    const pid = parts[0] === '-' ? null : parseInt(parts[0], 10);
    const exit = parts[1] === '-' ? null : (parseInt(parts[1], 10) || null);
    return { name: svc, status: pid ? 'running' : 'stopped', pid, exit };
  });
}

function getMemoryStats() {
  const dbPath = path.join(WORKSPACE, 'memory/memory.db');
  if (!existsSync(dbPath)) return { totalFacts: 0, facts: [], preferences: [] };
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const totalFacts = db.prepare('SELECT COUNT(*) AS n FROM facts').get().n;
    const facts = [...db.prepare(
      "SELECT key, value, kind, confidence FROM facts ORDER BY updated DESC LIMIT 10"
    ).all()];
    const preferences = [...db.prepare(
      "SELECT key, value, confidence FROM facts WHERE kind='preference' ORDER BY updated DESC LIMIT 5"
    ).all()];
    db.close();
    return { totalFacts, facts, preferences };
  } catch (e) {
    return { totalFacts: 0, facts: [], preferences: [], error: e.message };
  }
}

function getSchedulerJobs() {
  const dbPath = path.join(WORKSPACE, 'scheduler/jobs.db');
  if (!existsSync(dbPath)) return [];
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const jobs = [...db.prepare(
      'SELECT id, name, cron, last_run, next_run, enabled FROM jobs ORDER BY id'
    ).all()];
    db.close();
    return jobs;
  } catch (e) {
    return [];
  }
}

function getThinkJournal() {
  const journalDir = path.join(WORKSPACE, 'think/journal');
  if (!existsSync(journalDir)) return [];
  try {
    const today = new Date().toISOString().slice(0, 10);
    const todayFile = path.join(journalDir, `${today}.md`);
    if (!existsSync(todayFile)) return [];
    const lines = readFileSync(todayFile, 'utf8').split('\n').filter(l => l.trim().startsWith('- '));
    return lines.slice(-5);
  } catch (e) {
    return [];
  }
}

function getUpgradeHistory() {
  const logPath = path.join(WORKSPACE, 'upgrades/UPGRADE_LOG.md');
  if (!existsSync(logPath)) return [];
  try {
    const content = readFileSync(logPath, 'utf8');
    const sections = content.split(/^## /m).filter(Boolean);
    return sections.slice(-5).map(s => s.split('\n')[0].trim());
  } catch (e) {
    return [];
  }
}

function getActiveTarget() {
  const f = path.join(WORKSPACE, 'active-target');
  if (!existsSync(f)) return null;
  try { return readFileSync(f, 'utf8').trim(); } catch { return null; }
}

function getGitCommits() {
  const root = path.resolve(WORKSPACE, '..');
  const r = spawnSync('git', ['-C', root, 'log', '--oneline', '-5'], {
    encoding: 'utf8', timeout: 5000,
  });
  if (r.status !== 0) return [];
  return r.stdout.trim().split('\n').filter(Boolean);
}

function getState() {
  return {
    timestamp: new Date().toISOString(),
    services: getServicesStatus(),
    memory: getMemoryStats(),
    schedulerJobs: getSchedulerJobs(),
    thinkJournal: getThinkJournal(),
    upgradeHistory: getUpgradeHistory(),
    activeTarget: getActiveTarget(),
    gitCommits: getGitCommits(),
  };
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHTML(state) {
  const servicesHtml = state.services.map(s => {
    const ok = s.status === 'running';
    const dot = `<span class="dot ${ok ? 'ok' : 'off'}"></span>`;
    return `<tr><td>${dot}${esc(s.name)}</td><td class="${ok ? 'ok' : 'off'}">${s.status}</td><td>${s.pid ?? '—'}</td><td>${s.exit ?? '—'}</td></tr>`;
  }).join('');

  const factsHtml = state.memory.facts.slice(0, 8).map(f =>
    `<tr><td>${esc(f.key)}</td><td>${esc(f.value)}</td><td class="dim">${esc(f.kind)}</td><td class="dim">${f.confidence != null ? Number(f.confidence).toFixed(2) : '—'}</td></tr>`
  ).join('') || '<tr><td colspan="4" class="empty">No facts</td></tr>';

  const jobsHtml = state.schedulerJobs.map(j => {
    const nr = j.next_run ? new Date(j.next_run * 1000).toISOString().replace('T', ' ').slice(0, 16) : '—';
    const lr = j.last_run ? new Date(j.last_run * 1000).toISOString().replace('T', ' ').slice(0, 16) : '—';
    return `<tr><td>${esc(j.name)}</td><td class="dim mono">${esc(j.cron)}</td><td class="dim">${lr}</td><td class="dim">${nr}</td><td class="${j.enabled ? 'ok' : 'off'}">${j.enabled ? 'on' : 'off'}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">No jobs</td></tr>';

  const journalHtml = state.thinkJournal.length
    ? state.thinkJournal.map(l => `<li>${esc(l.replace(/^- /, ''))}</li>`).join('')
    : '<li class="empty">No entries today</li>';

  const upgradesHtml = state.upgradeHistory.length
    ? state.upgradeHistory.map(u => `<li>${esc(u)}</li>`).join('')
    : '<li class="empty">No upgrade history</li>';

  const commitsHtml = state.gitCommits.length
    ? state.gitCommits.map(c => `<li class="mono">${esc(c)}</li>`).join('')
    : '<li class="empty">No commits</li>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Helm Dashboard</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0d0d0d;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;padding:24px;line-height:1.5}
h1{font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.02em}
.ts{font-size:12px;color:#555;margin-bottom:28px;margin-top:4px}
.ts a{color:#555;text-decoration:underline}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(460px,1fr));gap:18px}
.wide{grid-column:1/-1}
.card{background:#131313;border:1px solid #242424;border-radius:10px;padding:18px}
.card h2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#666;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:#444;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;padding:0 12px 8px 0;border-bottom:1px solid #1e1e1e}
td{padding:7px 12px 7px 0;border-bottom:1px solid #1a1a1a;vertical-align:top;word-break:break-word;max-width:260px}
td:last-child{padding-right:0}
ul{list-style:none;padding:0;font-size:13px}
ul li{padding:5px 0;border-bottom:1px solid #1a1a1a}
ul li:last-child{border-bottom:none}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;vertical-align:middle;flex-shrink:0}
.ok{color:#4ade80}.dot.ok{background:#4ade80}
.off{color:#666}.dot.off{background:#444}
.dim{color:#666;font-size:12px}
.mono{font-family:'SF Mono',Menlo,monospace;font-size:12px}
.empty{color:#444;font-style:italic}
.target{font-size:17px;font-weight:700;color:#7ecbff;word-break:break-all}
.count{font-size:13px;color:#666;margin-bottom:12px}
</style>
<script>
(function(){
  let t=10;
  const go=()=>location.reload();
  let tid=setTimeout(go,10000);
  const el=document.querySelector('.countdown');
  setInterval(()=>{if(--t<=0)return;el.textContent='auto-refresh in '+t+'s';},1000);
})();
</script>
</head>
<body>
<h1>Helm Dashboard</h1>
<div class="ts">
  <span class="countdown">auto-refresh in 10s</span>
  &nbsp;·&nbsp; ${esc(state.timestamp)}
  &nbsp;·&nbsp; <a href="/api/state">JSON API</a>
</div>

<div class="grid">

<div class="card">
  <h2>Services</h2>
  <table>
    <tr><th>Label</th><th>Status</th><th>PID</th><th>Exit</th></tr>
    ${servicesHtml}
  </table>
</div>

<div class="card">
  <h2>Active Target</h2>
  <p class="target">${esc(state.activeTarget ?? '(none)')}</p>
</div>

<div class="card wide">
  <h2>Memory</h2>
  <p class="count">${state.memory.totalFacts} total facts</p>
  <table>
    <tr><th>Key</th><th>Value</th><th>Kind</th><th>Conf</th></tr>
    ${factsHtml}
  </table>
</div>

<div class="card">
  <h2>Scheduler Jobs</h2>
  <table>
    <tr><th>Name</th><th>Cron</th><th>Last Run</th><th>Next Run</th><th>En</th></tr>
    ${jobsHtml}
  </table>
</div>

<div class="card">
  <h2>Think Journal — Today</h2>
  <ul>${journalHtml}</ul>
</div>

<div class="card">
  <h2>Recent Upgrades</h2>
  <ul>${upgradesHtml}</ul>
</div>

<div class="card">
  <h2>Last 5 Commits</h2>
  <ul>${commitsHtml}</ul>
</div>

</div>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }
  const url = req.url.split('?')[0];
  if (url === '/api/state') {
    const state = getState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state, null, 2));
    return;
  }
  if (url === '/') {
    const state = getState();
    const html = renderHTML(state);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`Helm dashboard listening on http://localhost:${PORT}\n`);
});
