#requires -Version 5
# Install Helm as a Windows background service via Task Scheduler (runs at logon, restarts on failure).
$ErrorActionPreference = "Stop"
$Dir  = Split-Path -Parent $PSScriptRoot
$Node = (Get-Command node).Source
if (-not (Test-Path (Join-Path $Dir ".env"))) { Write-Host "No .env in $Dir — run the installer first." -ForegroundColor Red; exit 1 }

$tr = "`"$Node`" `"$Dir\index.js`""
# /IT = run only when the user is logged on (so it can reach the GUI/Claude session); /RL LIMITED = normal rights
schtasks /Create /TN "HelmDiscord" /TR $tr /SC ONLOGON /RL LIMITED /IT /F | Out-Null
Write-Host "Installed scheduled task 'HelmDiscord' (starts at logon)."
Write-Host "Start now:  schtasks /Run /TN HelmDiscord"
Write-Host "Stop:       schtasks /End /TN HelmDiscord"
Write-Host "Remove:     schtasks /Delete /TN HelmDiscord /F"
