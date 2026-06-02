#requires -Version 5
# Install Helm to run locally on Windows via Task Scheduler — the bot plus the background daemons
# (scheduler, background cognition, nightly self-upgrade), mirroring the Mac's launchd jobs.
$ErrorActionPreference = "Stop"
$Dir  = Split-Path -Parent $PSScriptRoot
$Node = (Get-Command node).Source
if (-not (Test-Path (Join-Path $Dir ".env"))) { Write-Host "No .env in $Dir - run the installer first." -ForegroundColor Red; exit 1 }

# Helper: (re)create a scheduled task that runs `node <script>`.
#   -Logon  : start at logon and keep running (continuous daemons)
#   -Daily  : run once a day at the given HH:mm (one-shot jobs)
# /IT keeps tasks in the interactive desktop session so Claude + screenshots work.
function New-HelmTask($name, $script, [string]$daily = $null) {
  $scriptPath = Join-Path $Dir $script
  # node.exe lives under "C:\Program Files\..." — that space broke schtasks /TR (PowerShell drops the
  # embedded quotes when handing the value to schtasks.exe, so it saw two separate bad arguments).
  # Use 8.3 short paths (no spaces) so /TR needs no inner quoting; fall back to escaped quotes if 8.3
  # names are disabled on this volume.
  $tr = $null
  try {
    $fso = New-Object -ComObject Scripting.FileSystemObject
    $ns = $fso.GetFile($Node).ShortPath
    $ss = $fso.GetFile($scriptPath).ShortPath
    if ($ns -notmatch '\s' -and $ss -notmatch '\s') { $tr = "$ns $ss" }
  } catch {}
  if (-not $tr) { $tr = "\`"$Node\`" \`"$scriptPath\`"" }
  if ($daily) { schtasks /Create /TN $name /TR $tr /SC DAILY /ST $daily /RL LIMITED /IT /F | Out-Null }
  else        { schtasks /Create /TN $name /TR $tr /SC ONLOGON /RL LIMITED /IT /F | Out-Null }
  if ($LASTEXITCODE -eq 0) { Write-Host ("  ok  {0,-16} {1}" -f $name, $(if ($daily) { "daily $daily" } else { "at logon" })) }
  else { Write-Host ("  xx  {0,-16} schtasks /Create failed (exit {1})" -f $name, $LASTEXITCODE) -ForegroundColor Red }
}

Write-Host "Installing Helm local services (Task Scheduler):"
New-HelmTask "HelmDiscord"     "index.js"                              # the bot
New-HelmTask "HelmScheduler"   "workspace\scheduler\scheduler.mjs"     # fires scheduled jobs (continuous)
New-HelmTask "HelmThink"       "workspace\think\think.mjs"             # background cognition (continuous)
New-HelmTask "HelmSelfUpgrade" "workspace\upgrades\self-upgrade.mjs" "03:00"   # nightly auto-upgrade

Write-Host ""
Write-Host "Start the bot now:  schtasks /Run /TN HelmDiscord"
Write-Host "Start a daemon:     schtasks /Run /TN HelmScheduler   (and HelmThink)"
Write-Host "Stop a task:        schtasks /End  /TN <Name>"
Write-Host "Remove all:         schtasks /Delete /TN HelmDiscord /F  (repeat for HelmScheduler, HelmThink, HelmSelfUpgrade)"
Write-Host "Reminder: one Discord token = one running bot. Stop any other copy (e.g. on the Mac) first."
