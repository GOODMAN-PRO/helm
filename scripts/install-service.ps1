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
  $tr = "`"$Node`" `"$Dir\$script`""
  if ($daily) { schtasks /Create /TN $name /TR $tr /SC DAILY /ST $daily /RL LIMITED /IT /F | Out-Null }
  else        { schtasks /Create /TN $name /TR $tr /SC ONLOGON /RL LIMITED /IT /F | Out-Null }
  Write-Host ("  ok  {0,-16} {1}" -f $name, $(if ($daily) { "daily $daily" } else { "at logon" }))
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
