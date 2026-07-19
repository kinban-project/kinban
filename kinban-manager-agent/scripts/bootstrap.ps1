[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$Destination,
  [switch]$Update
)

$ErrorActionPreference = "Stop"
$trimChars = [char[]]@([char]92, [char]47)
$templateRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd($trimChars)
$destinationRoot = [System.IO.Path]::GetFullPath($Destination).TrimEnd($trimChars)

if ($destinationRoot -eq $templateRoot -or $destinationRoot.StartsWith("$templateRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Destination must be outside the template directory."
}

if ((Test-Path -LiteralPath $destinationRoot) -and -not $Update) {
  throw "Destination already exists. Review it and rerun with -Update to refresh the template while preserving .env and workspace."
}

New-Item -ItemType Directory -Force -Path $destinationRoot | Out-Null
$skip = @(".env", "workspace")
$copied = New-Object System.Collections.Generic.List[string]

Get-ChildItem -LiteralPath $templateRoot -Force | Where-Object { $_.Name -notin $skip } | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $destinationRoot $_.Name) -Recurse -Force
  $copied.Add($_.Name)
}

$workspace = Join-Path $destinationRoot "workspace"
New-Item -ItemType Directory -Force -Path $workspace, (Join-Path $workspace "reports"), (Join-Path $workspace "state"), (Join-Path $workspace "drafts") | Out-Null
Copy-Item -LiteralPath (Join-Path $templateRoot "workspace\README.md") -Destination (Join-Path $workspace "README.md") -Force

if (-not (Test-Path -LiteralPath (Join-Path $destinationRoot ".env"))) {
  Write-Host "Next: copy .env.example to .env and set the assistant key, MCP URL, and group ID."
}

Write-Host ("Template {0}: {1}" -f ($(if ($Update) { "updated" } else { "created" }), $destinationRoot))
Write-Host ("Copied: " + ($copied -join ", "))
Write-Host "Preserved: .env, workspace"
if ($Update) { Write-Warning "Review organization-specific runbooks after an update before using them." }
