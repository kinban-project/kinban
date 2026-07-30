[CmdletBinding()]
param(
  [int]$Port = 3003,
  [switch]$Install,
  [switch]$SeedLocal,
  [switch]$Yes,
  [switch]$Start
)

$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
Set-Location -LiteralPath $root

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found. Install Node.js 22.13 or newer and npm, then retry."
  }
}

function Invoke-Npm([string[]]$Arguments) {
  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) { throw "npm $($Arguments -join ' ') failed." }
}

Require-Command "node"
Require-Command "npm"
Require-Command "npx"

$nodeVersion = (& node --version).Trim().TrimStart("v")
try { $nodeMajor = [int]($nodeVersion.Split(".")[0]) } catch { throw "Cannot determine Node.js version: $nodeVersion" }
if ($nodeMajor -lt 22) { throw "Node.js 22.13 or newer is required. Current: $nodeVersion" }

Write-Host "[1/5] KINBAN working directory: $root"
Write-Host "Node.js: $nodeVersion"

if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules")) -or $Install) {
  Write-Host "[2/5] Installing npm dependencies."
  if (Test-Path -LiteralPath (Join-Path $root "package-lock.json")) {
    Invoke-Npm @("ci")
  } else {
    Invoke-Npm @("install")
  }
} else {
  Write-Host "[2/5] node_modules exists; skipping install."
}

$envExample = Join-Path $root ".env.example"
$envLocal = Join-Path $root ".env.local"
if (-not (Test-Path -LiteralPath $envLocal)) {
  Copy-Item -LiteralPath $envExample -Destination $envLocal
  Write-Host "[3/5] Copied .env.example to .env.local. Secrets are not configured."
} else {
  Write-Host "[3/5] .env.local exists; it was not overwritten."
}

if ($SeedLocal) {
  if (-not $Yes) {
    $answer = Read-Host "This will replace local D1 data with seed-local.sql. Continue (yes/no)"
    if ($answer -ne "yes") { throw "Local DB seed was cancelled." }
  }
  Write-Host "[4/5] Seeding local D1 with seed-local.sql."
  Invoke-Npm @("run", "db:seed:local")
} else {
  Write-Host "[4/5] Skipped DB seed. Use -SeedLocal -Yes explicitly when needed."
}

Write-Host "[5/5] Setup checks"
Write-Host "  npm run build       : build"
Write-Host "  npm run test        : build and rendered HTML tests"
Write-Host "  npm run dev -- --port $Port : development server"

if ($Start) {
  $existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Warning "Port $Port is already in use. Existing processes are not stopped."
  } else {
    Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev", "--", "--port", "$Port") -WorkingDirectory $root | Out-Null
    Write-Host "Development server started: http://localhost:$Port/"
  }
}

Write-Host "Bootstrap completed. This script does not publish or modify production databases."

