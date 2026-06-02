#requires -Version 5
# Helm uninstaller (Windows). One-liner:
#   irm https://raw.githubusercontent.com/GOODMAN-PRO/helm/main/scripts/uninstall.ps1 | iex
# Stops + deletes Helm's scheduled tasks, kills its processes, removes the install dir.
# Leaves your HelmBrain vault and any backups alone. Override the dir with $env:HELM_DIR; skip the
# confirm with $env:HELM_YES=1.
$ErrorActionPreference = "SilentlyContinue"
$Dir = if ($env:HELM_DIR) { $env:HELM_DIR } else { Join-Path $env:USERPROFILE "helm" }

# Stop + delete Helm's scheduled tasks (bot, daemons, and the on-demand screenshot/input tasks).
foreach ($t in "HelmDiscord","HelmScheduler","HelmThink","HelmSelfUpgrade","HelmShot","HelmInput","HelmEnum","HelmScreencap") {
  schtasks /End /TN $t 2>$null | Out-Null
  schtasks /Delete /TN $t /F 2>$null | Out-Null
}
# Kill any node processes running Helm — from the install dir OR an npx-cache copy.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" 2>$null |
  Where-Object { $_.CommandLine -and ($_.CommandLine -like "*$Dir*" -or $_.CommandLine -like "*\helm\index.js*" -or $_.CommandLine -like "*node_modules\helm\*") } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force 2>$null }

# Remove the global `helm` command if it was linked (npm is npm.cmd on Windows).
& npm.cmd rm -g helm 2>$null | Out-Null

Write-Host "Helm services stopped and unregistered."
# NOTE: use `return`, not `exit` — this script is run via `irm ... | iex`, and `exit` would close the
# whole terminal window. `return` ends the script cleanly in both `iex` and `-File` modes.
if (-not (Test-Path $Dir)) { Write-Host "No install dir at $Dir (an npx run leaves nothing here to delete). Services + global command removed."; return }

if ($env:HELM_YES -ne "1") {
  $ans = Read-Host "Delete the install at $Dir ? (y/N)"
  if ($ans -notmatch '^[Yy]') { Write-Host "Kept $Dir (services are stopped). Aborted."; return }
}
Remove-Item -Recurse -Force $Dir
Write-Host "Helm uninstalled from $Dir. Your HelmBrain vault and any backups were left untouched."
