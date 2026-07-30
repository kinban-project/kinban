[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$Destination,
  [switch]$Update
)

$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$template = Join-Path $root "kinban-manager-agent\scripts\bootstrap.ps1"
if (-not (Test-Path -LiteralPath $template)) {
  throw "Manager agent template was not found: $template"
}

$destinationPath = [System.IO.Path]::GetFullPath($Destination)
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $template -Destination $destinationPath -Update:$Update
if ($LASTEXITCODE -ne 0) { throw "Manager agent template deployment failed." }

$envExample = Join-Path $destinationPath ".env.example"
$envLocal = Join-Path $destinationPath ".env.local"
if ((Test-Path -LiteralPath $envExample) -and -not (Test-Path -LiteralPath $envLocal)) {
  Copy-Item -LiteralPath $envExample -Destination $envLocal
  Write-Host "Copied .env.example to .env.local. The key is not configured."
}

Write-Host "Manager agent destination: $destinationPath"
Write-Host "Set KINBAN_MCP_URL, KINBAN_ASSISTANT_API_KEY, and KINBAN_GROUP_ID in $envLocal."
Write-Host "Then run scripts/verify-connection.ps1, or from the KINBAN root run verify-setup.ps1 -ManagerAgentPath `"$destinationPath`"."

