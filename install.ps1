#requires -Version 5
# Helm installer (Windows / PowerShell). Mirrors install.sh.
#
# Remote one-liner:
#   irm https://raw.githubusercontent.com/GOODMAN-PRO/helm/main/install.ps1 | iex
#
# Env overrides:  $env:HELM_REPO, $env:HELM_DIR, $env:HELM_SRC, $env:HELM_NONINTERACTIVE=1
$ErrorActionPreference = "Stop"

$Repo = if ($env:HELM_REPO) { $env:HELM_REPO } else { "https://github.com/GOODMAN-PRO/helm.git" }
$Dir  = if ($env:HELM_DIR)  { $env:HELM_DIR }  else { Join-Path $env:USERPROFILE "helm" }
$Src  = $env:HELM_SRC

function Need($cmd, $msg) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Host "xx  $msg" -ForegroundColor Red; exit 1 } }

Write-Host "== Helm installer (Windows) ==" -ForegroundColor Cyan

# 1) prerequisites
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Node not found — installing it via winget..." -ForegroundColor Cyan
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
# Claude Code is the engine Helm runs on — auto-install it if missing.
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Host "Claude Code (Helm's engine) not found — installing it with npm..." -ForegroundColor Cyan
  npm install -g @anthropic-ai/claude-code
}
$claudeState = if (Get-Command claude -ErrorAction SilentlyContinue) { "claude present" } else { "claude installed (restart shell if not found)" }
Write-Host "ok  node $(node -v)   git present   $claudeState" -ForegroundColor Green

# 2) fetch source
if ($Src) {
  Write-Host "Copying source from $Src -> $Dir"
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  robocopy $Src $Dir /MIR /XD .git node_modules .swarm /XF .env *.log *.db | Out-Null
} elseif (Test-Path (Join-Path $Dir ".git")) {
  Write-Host "Updating existing install at $Dir"
  git -C $Dir pull --ff-only
} else {
  Write-Host "Cloning $Repo -> $Dir"
  git clone --depth 1 $Repo $Dir
}
Set-Location $Dir

# 3) dependencies
Write-Host "Installing dependencies (npm install)..."
npm install --no-audit --no-fund | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "xx  npm install failed — run 'npm install' in $Dir to see why." -ForegroundColor Red; exit 1 }
Write-Host "ok  dependencies installed" -ForegroundColor Green

# 4) sanity check
node --check index.js
Write-Host "ok  index.js syntax valid" -ForegroundColor Green

# 5) configure
$claudePath = (Get-Command claude).Source
if (Test-Path ".env") {
  Write-Host "!!  .env already exists — leaving it. Start with: npm start" -ForegroundColor Yellow
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
    Write-Host "!!  Wizard unavailable — wrote .env from template; edit it then run: npm start" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Done. Installed at: $Dir" -ForegroundColor Cyan
Write-Host "Start it:   cd `"$Dir`"; npm start"
Write-Host "Run 24/7:   powershell -ExecutionPolicy Bypass -File `"$Dir\scripts\install-service.ps1`""
Write-Host "Reminder: one Discord token = one running instance. Stop any other copy first."
