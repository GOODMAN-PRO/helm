#requires -Version 5
# Helm installer (Windows / PowerShell). Mirrors install.sh.
#
# Remote one-liner:
#   irm https://raw.githubusercontent.com/GOODMAN-PRO/helm/main/install.ps1 | iex
#
# Env overrides:  $env:HELM_REPO, $env:HELM_DIR, $env:HELM_SRC, $env:HELM_NONINTERACTIVE=1
$ErrorActionPreference = "Stop"
# Many Windows machines block running .ps1 scripts (Restricted policy), which breaks npm.ps1/npx.ps1.
# Relax it for THIS process only (no admin, nothing persisted), and we call npm.cmd directly below.
try { Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force } catch {}

$Repo = if ($env:HELM_REPO) { $env:HELM_REPO } else { "https://github.com/GOODMAN-PRO/helm.git" }
$Dir  = if ($env:HELM_DIR)  { $env:HELM_DIR }  else { Join-Path $env:USERPROFILE "helm" }
$Src  = $env:HELM_SRC

function Need($cmd, $msg) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Host "xx  $msg" -ForegroundColor Red; exit 1 } }

Write-Host "== Helm installer (Windows) ==" -ForegroundColor Cyan

# 1) prerequisites
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Node not found - installing it via winget..." -ForegroundColor Cyan
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    # refresh PATH for this session so node/npm are found right away
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "xx  Node still not on PATH. Install from https://nodejs.org (or restart PowerShell after winget) and re-run." -ForegroundColor Red; exit 1
  }
}
Need git "git not found. Install Git for Windows (https://git-scm.com) then re-run."
$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) { Write-Host "xx  Node too old; need 18+." -ForegroundColor Red; exit 1 }
# Claude Code is the engine Helm runs on - auto-install it if missing.
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Host "Claude Code (Helm's engine) not found - installing it with npm..." -ForegroundColor Cyan
  npm.cmd install -g @anthropic-ai/claude-code
}
$claudeState = if (Get-Command claude -ErrorAction SilentlyContinue) { "claude present" } else { "claude installed (restart shell if not found)" }
Write-Host "ok  node $(node -v)   git present   $claudeState" -ForegroundColor Green

# 2) fetch source
function Get-HelmZip($dest) {
  # Download + extract the repo zip via Invoke-WebRequest (uses the system proxy, unlike git).
  Write-Host "Downloading Helm (zip)..." -ForegroundColor Cyan
  $zip = Join-Path $env:TEMP "helm-main.zip"
  $tmp = Join-Path $env:TEMP ("helm-zip-" + [guid]::NewGuid().ToString("N"))
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
  Invoke-WebRequest -UseBasicParsing "https://codeload.github.com/GOODMAN-PRO/helm/zip/refs/heads/main" -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $inner = Get-ChildItem -Directory $tmp | Select-Object -First 1
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Recurse -Force (Join-Path $inner.FullName "*") $dest
  Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
if ($Src) {
  Write-Host "Copying source from $Src -> $Dir"
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  robocopy $Src $Dir /MIR /XD .git node_modules .swarm /XF .env *.log *.db | Out-Null
} elseif (Test-Path (Join-Path $Dir ".git")) {
  Write-Host "Updating existing install at $Dir"
  # Normal path is a fast-forward. If upstream history was rewritten (e.g. a force-push to scrub
  # data), --ff-only fails; recover by resetting to the remote. Safe: .env/memory/vault/state are
  # all gitignored, so a hard reset leaves them untouched.
  git -C $Dir pull --ff-only
  if ($LASTEXITCODE -ne 0) {
    Write-Host "fast-forward not possible (upstream history changed) - re-syncing to the remote..." -ForegroundColor Yellow
    $br = (git -C $Dir remote show origin 2>$null | Select-String 'HEAD branch:\s*(\S+)').Matches.Groups[1].Value
    if (-not $br) { $br = "main" }
    git -C $Dir fetch origin
    git -C $Dir reset --hard "origin/$br"
    if ($LASTEXITCODE -ne 0) { Write-Host "couldn't auto-resync - your .env is safe; run: git -C `"$Dir`" fetch origin; git -C `"$Dir`" reset --hard origin/$br" -ForegroundColor Yellow }
  }
} elseif (Test-Path (Join-Path $Dir "index.js")) {
  # existing non-git install (came from a zip) -> refresh the code via zip, keep .env
  Write-Host "Updating existing install at $Dir (zip)"
  Get-HelmZip $Dir
} else {
  Write-Host "Cloning $Repo -> $Dir"
  # git often isn't proxy-aware; if the clone can't reach github.com, fall back to the zip download.
  $cloned = $false
  try { git clone --depth 1 $Repo $Dir 2>$null; if (Test-Path (Join-Path $Dir ".git")) { $cloned = $true } } catch {}
  if (-not $cloned) {
    Write-Host "git clone failed (proxy/firewall?) - using the zip download instead." -ForegroundColor Yellow
    if (Test-Path $Dir) { Remove-Item $Dir -Recurse -Force -ErrorAction SilentlyContinue }
    Get-HelmZip $Dir
  }
}
if (-not (Test-Path (Join-Path $Dir "index.js"))) { Write-Host "xx  Could not fetch Helm (network blocked?). Check your connection/proxy and re-run." -ForegroundColor Red; exit 1 }
Set-Location $Dir

# 3) dependencies
Write-Host "Installing dependencies (npm install)..."
# Skip Playwright's heavy browser download (~hundreds of MB) - installed lazily on first use.
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
npm.cmd install --no-audit --no-fund | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "xx  npm install failed - run 'npm install' in $Dir to see why." -ForegroundColor Red; exit 1 }
Write-Host "ok  dependencies installed" -ForegroundColor Green

# 4) sanity check
node --check index.js
Write-Host "ok  index.js syntax valid" -ForegroundColor Green

# 5) configure
$claudePath = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claudePath) { $claudePath = "claude" }
if (Test-Path ".env") {
  Write-Host "!!  .env already exists - leaving it. Start with: npm start" -ForegroundColor Yellow
} elseif ($env:HELM_NONINTERACTIVE -eq "1") {
  Copy-Item .env.example .env
  (Get-Content .env) -replace '^CLAUDE_BIN=.*', "CLAUDE_BIN=$claudePath" | Set-Content .env
  Write-Host "!!  Non-interactive: wrote .env from template. Set DISCORD_TOKEN + OWNER_ID, then: npm start" -ForegroundColor Yellow
} else {
  # hand off to the setup wizard (gateways, backend incl. free models, model, service)
  node scripts/wizard.mjs
  if ($LASTEXITCODE -ne 0 -and -not (Test-Path ".env")) {
    Copy-Item .env.example .env
    (Get-Content .env) -replace '^CLAUDE_BIN=.*', "CLAUDE_BIN=$claudePath" | Set-Content .env
    Write-Host "!!  Wizard unavailable - wrote .env from template; edit it then run: npm start" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Done. Installed at: $Dir" -ForegroundColor Cyan
Write-Host "Start it:   cd `"$Dir`"; node index.js     (use 'node index.js' on Windows - 'npm start' can be blocked by script policy)"
Write-Host "Run 24/7:   powershell -ExecutionPolicy Bypass -File `"$Dir\scripts\install-service.ps1`""
Write-Host "Reminder: one Discord token = one running instance. Stop any other copy first."
