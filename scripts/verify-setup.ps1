[CmdletBinding()]
param(
  [string]$BaseUrl = "http://localhost:3003",
  [switch]$SkipMcp
)

$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$envFile = Join-Path $root ".env.local"

function Read-DotEnv([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or $trimmed -notmatch "=") { continue }
    $parts = $trimmed -split "=", 2
    $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"')
  }
  return $values
}

Write-Host "KINBAN connectivity check: $BaseUrl"
$homeResponse = Invoke-WebRequest -Uri ($BaseUrl.TrimEnd("/") + "/") -UseBasicParsing
if ($homeResponse.StatusCode -ne 200) { throw "Home page HTTP status is not 200: $($homeResponse.StatusCode)" }
Write-Host "OK: home page HTTP $($homeResponse.StatusCode)"

if ($SkipMcp) {
  Write-Host "MCP check skipped."
  exit 0
}

$values = Read-DotEnv $envFile
$mcpUrl = $values["KINBAN_MCP_URL"]
$apiKey = $values["KINBAN_ASSISTANT_API_KEY"]
$groupId = $values["KINBAN_GROUP_ID"]
if (-not $mcpUrl -or -not $apiKey -or -not $groupId) {
  Write-Host "MCP check skipped. Set KINBAN_MCP_URL, KINBAN_ASSISTANT_API_KEY, and KINBAN_GROUP_ID in .env.local to enable it."
  exit 0
}

$request = @{
  jsonrpc = "2.0"
  id = "kinban-setup-verify"
  method = "tools/call"
  params = @{ name = "list_groups"; arguments = @{} }
} | ConvertTo-Json -Depth 8

try {
  $response = Invoke-RestMethod -Method Post -Uri $mcpUrl -Headers @{ Authorization = "Bearer $apiKey" } -ContentType "application/json; charset=utf-8" -Body $request
} catch {
  throw "MCP read-only check failed. Check the URL, key, and network. The key is not displayed."
}
if ($response.result.isError) { throw "MCP rejected the read-only check." }
$text = ($response.result.content | Where-Object { $_.type -eq "text" } | Select-Object -First 1).text
$groups = $text | ConvertFrom-Json
if (-not ($groups | Where-Object { $_.id -eq $groupId })) { throw "The configured group ID is not available to this key." }
Write-Host "OK: MCP read-only connection and target group verified."
Write-Host "No data was changed."

