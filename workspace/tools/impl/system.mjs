#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const args = process.argv.slice(2);
const verb = args[0];
const get  = (k) => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };




const runPs = (script) => {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64],
    { encoding: 'utf8', timeout: 30000 }
  );
};


const parseJson = (stdout) => {
  const line = (stdout || '').split('\n').map(l => l.trim()).find(l => l.startsWith('{') || l.startsWith('['));
  if (!line) return null;
  try { return JSON.parse(line); } catch { return null; }
};


const out = (obj) => { console.log(JSON.stringify(obj)); process.exit(0); };


const fail = (msg) => { console.log(JSON.stringify({ ok: false, error: String(msg) })); process.exit(1); };


const CORE_NAMES = new Set([
  'system', 'idle', 'csrss', 'wininit', 'services', 'lsass', 'winlogon', 'smss',
  'system idle process',
]);
const CORE_PIDS  = new Set([0, 4]);

const isSafe = (name, pid) => {
  if (CORE_PIDS.has(Number(pid))) return false;
  if (CORE_NAMES.has(String(name).toLowerCase().trim())) return false;
  return true;
};


if (verb === 'stats') {
  if (process.platform === 'win32') {





    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$cpus    = @(Get-CimInstance Win32_Processor)
$cpuPct  = [math]::Round(($cpus | Measure-Object -Property LoadPercentage -Average).Average, 1)
$memObj  = Get-CimInstance Win32_OperatingSystem
$totalMB = [math]::Round($memObj.TotalVisibleMemorySize / 1024, 1)
$freeMB  = [math]::Round($memObj.FreePhysicalMemory  / 1024, 1)
$usedMB  = [math]::Round($totalMB - $freeMB, 1)
$memPct  = [math]::Round(($usedMB / $totalMB) * 100, 1)
$disks   = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
  $free  = [math]::Round($_.FreeSpace  / 1GB, 2)
  $total = [math]::Round($_.Size       / 1GB, 2)
  $pct   = if ($_.Size -gt 0) { [math]::Round((($_.Size - $_.FreeSpace) / $_.Size) * 100, 1) } else { 0 }
  [PSCustomObject]@{ drive=$_.DeviceID; freeGB=$free; totalGB=$total; pct=$pct }
})
$boot      = $memObj.LastBootUpTime
$uptimeHrs = [math]::Round((New-TimeSpan -Start $boot -End (Get-Date)).TotalHours, 2)
$result    = [PSCustomObject]@{
  ok       = $true
  cpuPct   = $cpuPct
  mem      = [PSCustomObject]@{ usedMB=$usedMB; totalMB=$totalMB; pct=$memPct }
  disks    = $disks
  uptimeHrs= $uptimeHrs
  os       = $memObj.Caption
  hostname = $env:COMPUTERNAME
}
Write-Output ($result | ConvertTo-Json -Compress -Depth 4)
`;
    const r = runPs(script);
    const data = parseJson(r.stdout);
    if (!data) fail('stats: no JSON from PowerShell — ' + (r.stderr || '').trim().slice(0, 300));
    out(data);
  } else {
    // Non-Windows fallback using Node os module (no cpu% — os.cpus gives idle/user ticks, not live %).
    const mem      = os.totalmem();
    const free     = os.freemem();
    const used     = mem - free;
    const uptimeHrs = Math.round(os.uptime() / 3600 * 100) / 100;
    out({
      ok: true,
      cpuPct: null,
      mem: {
        usedMB:  Math.round(used / 1024 / 1024),
        totalMB: Math.round(mem  / 1024 / 1024),
        pct:     Math.round((used / mem) * 100 * 10) / 10,
      },
      disks: [],
      uptimeHrs,
      os: os.type() + ' ' + os.release(),
      hostname: os.hostname(),
      note: 'non-Windows: cpuPct unavailable; disks not queried',
    });
  }
}


else if (verb === 'top') {
  const by = (get('by') || 'cpu').toLowerCase();
  const n  = Math.max(1, Math.min(200, parseInt(get('n') || '10', 10)));
  if (by !== 'cpu' && by !== 'mem') fail('top --by must be cpu or mem');

  if (process.platform === 'win32') {




    const sortProp = by === 'mem' ? 'WorkingSet64' : 'CPU';
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$procs = Get-Process | Where-Object { $_.Id -ne $null } |
  Sort-Object -Property ${sortProp} -Descending |
  Select-Object -First ${n}
$out = @($procs | ForEach-Object {
  $cpuSec = if ($_.CPU -ne $null) { [math]::Round($_.CPU, 2) } else { $null }
  $memMB  = [math]::Round($_.WorkingSet64 / 1MB, 1)
  [PSCustomObject]@{
    name   = $_.ProcessName
    pid    = [int]$_.Id
    cpuSec = $cpuSec
    memMB  = $memMB
  }
})
Write-Output ($out | ConvertTo-Json -Compress -Depth 2)
`;
    const r = runPs(script);
    const data = parseJson(r.stdout);
    if (!data) fail('top: no JSON — ' + (r.stderr || '').trim().slice(0, 300));
    const arr = Array.isArray(data) ? data : [data];
    out({
      ok: true,
      by,
      note: 'cpuSec = cumulative CPU seconds (not live %). Sort by ' + by,
      count: arr.length,
      processes: arr,
    });
  } else {
    // Non-Windows: parse /proc or use os.cpus for very basic info; just surface mem via Node
    fail('top: non-Windows fallback not implemented — run on Windows');
  }
}


else if (verb === 'ps') {
  const nameFilter = get('name') || null;

  if (process.platform === 'win32') {
    const filterClause = nameFilter
      ? `| Where-Object { $_.ProcessName -like '*${nameFilter.replace(/'/g, "''")}*' }`
      : '';
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$procs = @(Get-Process ${filterClause} | Sort-Object -Property ProcessName |
  ForEach-Object {
    [PSCustomObject]@{
      name  = $_.ProcessName
      pid   = [int]$_.Id
      memMB = [math]::Round($_.WorkingSet64 / 1MB, 1)
    }
  })
Write-Output ($procs | ConvertTo-Json -Compress -Depth 2)
`;
    const r = runPs(script);
    const data = parseJson(r.stdout);
    if (!data) fail('ps: no JSON — ' + (r.stderr || '').trim().slice(0, 300));
    const arr = Array.isArray(data) ? data : [data];
    out({ ok: true, filter: nameFilter, count: arr.length, processes: arr });
  } else {
    fail('ps: non-Windows not implemented');
  }
}

// ── verb: net ────────────────────────────────────────────────────────────────
else if (verb === 'net') {
  if (process.platform === 'win32') {
    // Get-NetTCPConnection returns LocalAddress/LocalPort/RemoteAddress/RemotePort/State/OwningProcess.
    // Join with Get-Process to get proc name. Cap at 50 connections.
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$conns = @(Get-NetTCPConnection | Select-Object -First 50)
$pidMap = @{}
Get-Process | ForEach-Object { $pidMap[[int]$_.Id] = $_.ProcessName }
$out = @($conns | ForEach-Object {
  $procName = if ($pidMap.ContainsKey([int]$_.OwningProcess)) { $pidMap[[int]$_.OwningProcess] } else { '' }
  [PSCustomObject]@{
    localAddr  = $_.LocalAddress
    localPort  = [int]$_.LocalPort
    remoteAddr = $_.RemoteAddress
    remotePort = [int]$_.RemotePort
    state      = $_.State
    pid        = [int]$_.OwningProcess
    proc       = $procName
  }
})
Write-Output ($out | ConvertTo-Json -Compress -Depth 2)
`;
    const r = runPs(script);
    const data = parseJson(r.stdout);
    if (!data) fail('net: no JSON — ' + (r.stderr || '').trim().slice(0, 300));
    const arr = Array.isArray(data) ? data : [data];
    out({ ok: true, count: arr.length, connections: arr });
  } else {
    fail('net: non-Windows not implemented — use ss or netstat');
  }
}


else if (verb === 'disk') {
  if (process.platform === 'win32') {
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
  $free  = [math]::Round($_.FreeSpace / 1GB, 2)
  $total = [math]::Round($_.Size      / 1GB, 2)
  $pct   = if ($_.Size -gt 0) { [math]::Round((($_.Size - $_.FreeSpace) / $_.Size) * 100, 1) } else { 0 }
  [PSCustomObject]@{ drive=$_.DeviceID; freeGB=$free; totalGB=$total; pct=$pct; label=$_.VolumeName }
})
Write-Output ($disks | ConvertTo-Json -Compress -Depth 2)
`;
    const r = runPs(script);
    const data = parseJson(r.stdout);
    if (!data) fail('disk: no JSON — ' + (r.stderr || '').trim().slice(0, 300));
    const arr = Array.isArray(data) ? data : [data];
    out({ ok: true, count: arr.length, disks: arr });
  } else {
    fail('disk: non-Windows not implemented');
  }
}


else if (verb === 'kill') {
  const pidArg  = get('pid');
  const nameArg = get('name');

  if (!pidArg && !nameArg) {
    fail('kill requires --pid <n> or --name <substr>');
  }

  if (process.platform !== 'win32') {

    const { execSync } = await import('node:child_process').then(m => m);
    if (pidArg) {
      const pid = parseInt(pidArg, 10);
      if (!Number.isFinite(pid)) fail('kill: --pid must be a number');
      if (CORE_PIDS.has(pid)) fail(`kill: refusing to kill protected PID ${pid}`);
      try { process.kill(pid, 'SIGTERM'); } catch (e) { fail('kill failed: ' + e.message); }
      out({ ok: true, platform: process.platform, killed: [{ pid }] });
    } else {
      fail('kill --name on non-Windows not implemented');
    }
  }


  if (pidArg !== null) {
    const pid = parseInt(pidArg, 10);
    if (!Number.isFinite(pid)) fail('kill: --pid must be an integer');
    if (CORE_PIDS.has(pid)) fail(`kill: refusing to kill protected PID ${pid} (system-critical)`);


    const lookupScript = `
$ErrorActionPreference = 'SilentlyContinue'
$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if ($p) { Write-Output ($p | Select-Object -First 1 | ForEach-Object { '{"found":true,"name":"' + $_.ProcessName + '","pid":' + $_.Id + '}' }) }
else    { Write-Output '{"found":false}' }
`;
    const lr = runPs(lookupScript);
    const ldata = parseJson(lr.stdout);
    if (!ldata || !ldata.found) fail(`kill: no process with PID ${pid}`);
    if (!isSafe(ldata.name, pid)) fail(`kill: refusing to kill protected process "${ldata.name}" (PID ${pid})`);

    const killScript = `
$ErrorActionPreference = 'SilentlyContinue'
Stop-Process -Id ${pid} -Force
Write-Output '{"done":true}'
`;
    const kr = runPs(killScript);
    const kdata = parseJson(kr.stdout);
    if (!kdata || !kdata.done) fail(`kill: Stop-Process failed for PID ${pid} — ` + (kr.stderr || '').trim().slice(0, 200));
    out({ ok: true, platform: 'win32', killed: [{ pid, name: ldata.name }] });

  } else {

    const esc = nameArg.replace(/'/g, "''");
    const findScript = `
$ErrorActionPreference = 'SilentlyContinue'
$procs = @(Get-Process | Where-Object { $_.ProcessName -like '*${esc}*' } |
  ForEach-Object { [PSCustomObject]@{ name=$_.ProcessName; pid=[int]$_.Id } })
Write-Output ($procs | ConvertTo-Json -Compress -Depth 2)
`;
    const fr = runPs(findScript);
    const fdata = parseJson(fr.stdout);
    if (!fdata) fail('kill: lookup failed — ' + (fr.stderr || '').trim().slice(0, 200));
    const candidates = Array.isArray(fdata) ? fdata : [fdata];
    if (candidates.length === 0) fail(`kill: no process matched name substring "${nameArg}"`);

    const safe    = candidates.filter(p => isSafe(p.name, p.pid));
    const blocked = candidates.filter(p => !isSafe(p.name, p.pid));
    if (safe.length === 0) fail(`kill: all ${candidates.length} matched process(es) are system-critical — refusing`);


    const pidList = safe.map(p => p.pid).join(',');
    const killScript = `
$ErrorActionPreference = 'SilentlyContinue'
$pids = @(${pidList})
$pids | ForEach-Object { Stop-Process -Id $_ -Force }
Write-Output '{"done":true}'
`;
    const kr = runPs(killScript);
    const kdata = parseJson(kr.stdout);
    if (!kdata || !kdata.done) fail('kill: Stop-Process failed — ' + (kr.stderr || '').trim().slice(0, 200));

    out({
      ok: true,
      platform: 'win32',
      killed: safe,
      skipped_protected: blocked,
    });
  }
}


else {
  console.log(JSON.stringify({
    ok: false,
    error: 'unknown verb: ' + verb,
    verbs: ['stats', 'top [--by cpu|mem] [--n N]', 'ps [--name <substr>]', 'net', 'disk', 'kill --pid <n> | --name <substr>'],
  }));
  process.exit(1);
}
