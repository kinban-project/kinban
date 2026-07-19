[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"

if (-not (Test-Path -LiteralPath $envFile)) { throw ".env is missing. Copy .env.example and set the required values." }

Get-Content -LiteralPath $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#") -or $line -notmatch "=") { return }
  $parts = $line -split "=", 2
  if ($parts.Count -eq 2) { Set-Item -Path ("Env:" + $parts[0].Trim()) -Value $parts[1].Trim() }
}

foreach ($name in "KINBAN_MCP_URL", "KINBAN_ASSISTANT_API_KEY", "KINBAN_GROUP_ID") {
  if (-not (Get-Item -Path ("Env:" + $name) -ErrorAction SilentlyContinue).Value) { throw "$name is not configured in .env." }
}

$request = @{
  jsonrpc = "2.0"
  id = "kinban-manager-agent-verify"
  method = "tools/call"
  params = @{ name = "list_groups"; arguments = @{} }
} | ConvertTo-Json -Depth 8

try {
  $response = Invoke-RestMethod -Method Post -Uri $env:KINBAN_MCP_URL -Headers @{ Authorization = "Bearer $env:KINBAN_ASSISTANT_API_KEY" } -ContentType "application/json" -Body $request
} catch {
  throw "KINBAN MCP connection failed. Check the URL, assistant key, and network. The key value is not displayed."
}

if ($response.result.isError) { throw "KINBAN MCP rejected the read-only check: $($response.result.content[0].text)" }
$groups = $response.result.content[0].text | ConvertFrom-Json
if (-not ($groups | Where-Object { $_.id -eq $env:KINBAN_GROUP_ID })) { throw "The configured KINBAN_GROUP_ID is not available to this assistant key." }

Write-Host "KINBAN MCP read-only connection succeeded for the configured group."
Write-Host "No KINBAN data was changed."
