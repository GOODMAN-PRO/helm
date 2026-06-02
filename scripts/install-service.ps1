#requires -Version 5
# Install Helm to run at logon on Windows — NO ADMIN required.
#   - The bot + background daemons start at logon via per-user Startup launchers. (schtasks /SC ONLOGON
#     needs admin and fails non-elevated with "Access is denied"; the Startup folder does not.)
#   - The nightly self-upgrade uses a DAILY scheduled task, which DOES work non-elevated.
$ErrorActionPreference = "Stop"
$Dir  = Split-Path -Parent $PSScriptRoot
$Node = (Get-Command node).Source
if (-not (Test-Path (Join-Path $Dir ".env"))) { Write-Host "No .env in $Dir - run the installer first." -ForegroundColor Red; exit 1 }

$Startup = [Environment]::GetFolderPath('Startup')

# 8.3 short path (no spaces) so launchers need no quoting; '' if unavailable.
function ShortPath($p) { try { (New-Object -ComObject Scripting.FileSystemObject).GetFile($p).ShortPath } catch { '' } }

# At-logon daemon -> a hidden VBS launcher in the per-user Startup folder (runs at logon, no admin, no
# console window). node.exe lives under "C:\Program Files\..." (a space), so prefer 8.3 short paths
# that need no quoting; otherwise fall back to VBS-escaped quotes ("" = a literal ").
function New-HelmStartup($name, $script) {
  $sp = Join-Path $Dir $script
  $ns = ShortPath $Node; $ss = ShortPath $sp
  if ($ns -and $ss -and $ns -notmatch '\s' -and $ss -notmatch '\s') { $run = "$ns $ss" }
  else { $run = '""' + $Node + '"" ""' + $sp + '""' }
  $vbs = "Set s = CreateObject(""WScript.Shell"")`r`ns.Run ""$run"", 0, False"
  Set-Content -LiteralPath (Join-Path $Startup "$name.vbs") -Value $vbs -Encoding ASCII
  Write-Host ("  ok  {0,-16} at logon (Startup)" -f $name)
}

# Nightly one-shot -> DAILY scheduled task (works non-elevated).
function New-HelmDaily($name, $script, $at) {
  $sp = Join-Path $Dir $script
  $ns = ShortPath $Node; $ss = ShortPath $sp
  $tr = if ($ns -and $ss -and $ns -notmatch '\s' -and $ss -notmatch '\s') { "$ns $ss" } else { "\`"$Node\`" \`"$sp\`"" }
  schtasks /Create /TN $name /TR $tr /SC DAILY /ST $at /RL LIMITED /IT /F | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host ("  ok  {0,-16} daily {1}" -f $name, $at) }
  else { Write-Host ("  xx  {0,-16} schtasks /Create failed (exit {1})" -f $name, $LASTEXITCODE) -ForegroundColor Red }
}

Write-Host "Installing Helm to run at logon (no admin needed):"
New-HelmStartup "HelmDiscord"   "index.js"                            # the bot
New-HelmStartup "HelmScheduler" "workspace\scheduler\scheduler.mjs"   # fires scheduled jobs
New-HelmStartup "HelmThink"     "workspace\think\think.mjs"           # background cognition
New-HelmDaily   "HelmSelfUpgrade" "workspace\upgrades\self-upgrade.mjs" "03:00"   # nightly auto-upgrade

Write-Host ""
Write-Host "They start automatically at your next logon. To start the bot NOW (without logging out):  helm"
Write-Host "Turn one off:  delete its file in  $Startup  (e.g. HelmDiscord.vbs)."
Write-Host "Nightly upgrade:  schtasks /Run /TN HelmSelfUpgrade   (remove: schtasks /Delete /TN HelmSelfUpgrade /F)"
Write-Host "Reminder: one Discord token = one running bot. Stop any other copy (e.g. on the Mac) first."
