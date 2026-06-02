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
# Helm needs Node >=22.5 for the built-in node:sqlite module (checks major AND minor, not just major).
function Get-NodeOk {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  $mj = [int](node -p "process.versions.node.split('.')[0]")
  $mn = [int](node -p "process.versions.node.split('.')[1]")
  return ($mj -gt 22) -or ($mj -eq 22 -and $mn -ge 5)
}
if (-not (Get-NodeOk)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Installing/upgrading Node (Helm needs 22.5+) via winget..." -ForegroundColor Cyan
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    # refresh PATH for this session so the new node/npm are found right away
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  }
  if (-not (Get-NodeOk)) {
    $have = if (Get-Command node -ErrorAction SilentlyContinue) { node -v } else { "none" }
    Write-Host "xx  Node 22.5+ required (have: $have). Install the latest LTS from https://nodejs.org (or reopen PowerShell after winget) and re-run." -ForegroundColor Red; exit 1
  }
}
# git is OPTIONAL: if it's missing or blocked we fall back to a zip download (see fetch step).
$hasGit = [bool](Get-Command git -ErrorAction SilentlyContinue)
# Claude Code is Helm's default engine - auto-install if missing. NOT fatal: the wizard also offers a
# FREE local/online model that needs no Claude Code at all.
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Host "Claude Code (Helm's default engine) not found - installing it with npm..." -ForegroundColor Cyan
  npm.cmd install -g @anthropic-ai/claude-code
  if ($LASTEXITCODE -ne 0) { Write-Host "!!  Couldn't auto-install Claude Code. That's OK - pick a FREE model in the wizard, or install later with: npm install -g @anthropic-ai/claude-code" -ForegroundColor Yellow }
  # add npm's global bin so a freshly-installed claude.cmd is found this session
  $env:Path = $env:Path + ";" + (Join-Path $env:APPDATA "npm")
}
$gitState = if ($hasGit) { "git present" } else { "no git (will use zip)" }
$claudeState = if (Get-Command claude -ErrorAction SilentlyContinue) { "claude present" } else { "no claude (free model OK)" }
Write-Host "ok  node $(node -v)   $gitState   $claudeState" -ForegroundColor Green

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
} elseif ($hasGit) {
  Write-Host "Cloning $Repo -> $Dir"
  # git often isn't proxy-aware; if the clone can't reach github.com, fall back to the zip download.
  $cloned = $false
  try { git clone --depth 1 $Repo $Dir 2>$null; if (Test-Path (Join-Path $Dir ".git")) { $cloned = $true } } catch {}
  if (-not $cloned) {
    Write-Host "git clone failed (proxy/firewall?) - using the zip download instead." -ForegroundColor Yellow
    if (Test-Path $Dir) { Remove-Item $Dir -Recurse -Force -ErrorAction SilentlyContinue }
    Get-HelmZip $Dir
  }
} else {
  Write-Host "No git on this machine - downloading Helm as a zip instead."
  Get-HelmZip $Dir
}
if (-not (Test-Path (Join-Path $Dir "index.js"))) { Write-Host "xx  Could not fetch Helm (network blocked?). Check your connection/proxy and re-run." -ForegroundColor Red; exit 1 }
Set-Location $Dir

# 3) dependencies
Write-Host "Installing dependencies (npm install)..."
# Skip Playwright's heavy browser download (~hundreds of MB) - installed lazily on first use.
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
# Do NOT swallow npm's output (no '| Out-Null') - if it fails the user needs to see why. Native deps
# (sharp, onnxruntime via transformers) occasionally fail to fetch a prebuilt binary; retry leaner.
npm.cmd install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
  Write-Host "!!  npm install failed - retrying without optional/native extras..." -ForegroundColor Yellow
  npm.cmd install --no-audit --no-fund --omit=optional
}
if ($LASTEXITCODE -ne 0) {
  Write-Host "!!  retrying with a clean lockfile install (npm ci)..." -ForegroundColor Yellow
  npm.cmd ci --no-audit --no-fund --omit=optional
}
if ($LASTEXITCODE -ne 0) { Write-Host "xx  npm install failed. Scroll up for the actual error. Common causes: network/proxy blocking the npm registry, or out-of-date Node. Fix that, then re-run." -ForegroundColor Red; exit 1 }
Write-Host "ok  dependencies installed" -ForegroundColor Green

# 4) sanity check
# Real RUNTIME probe, not just `node --check` (which is parse-only and FALSE-passes a missing
# node:sqlite builtin on old Node). This proves the engine can actually load Helm's core module.
node --input-type=module -e "await import('node:sqlite'); process.exit(0)"
if ($LASTEXITCODE -ne 0) { Write-Host "xx  This Node can't load node:sqlite - Helm needs Node 22.5+ (have $(node -v)). Update Node and re-run." -ForegroundColor Red; exit 1 }
node --check index.js
if ($LASTEXITCODE -ne 0) { Write-Host "xx  index.js failed a syntax check - the download may be corrupt. Re-run the installer." -ForegroundColor Red; exit 1 }
Write-Host "ok  runtime + syntax valid" -ForegroundColor Green

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

# 6) register the `helm` command on PATH so users type `helm`, not `node index.js`.
Write-Host "Linking the 'helm' command..." -ForegroundColor Cyan
npm.cmd link 2>$null
$helmLinked = ($LASTEXITCODE -eq 0)
if ($helmLinked) { $env:Path = $env:Path + ";" + (Join-Path $env:APPDATA "npm") }

Write-Host ""
Write-Host "Done. Installed at: $Dir" -ForegroundColor Cyan
if ($helmLinked) {
  Write-Host "Start it:   helm            (if not found, reopen PowerShell - or: node `"$Dir\index.js`")"
} else {
  Write-Host "Start it:   cd `"$Dir`"; node index.js     ('npm start' can be blocked by PowerShell script policy)"
}
Write-Host "Check it:   helm doctor      (diagnoses Node / engine / model / config problems)"
Write-Host "Run 24/7:   powershell -ExecutionPolicy Bypass -File `"$Dir\scripts\install-service.ps1`""
Write-Host "Reminder: one Discord token = one running instance. Stop any other copy first."
