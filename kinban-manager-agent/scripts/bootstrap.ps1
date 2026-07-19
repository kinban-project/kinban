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
  throw "Destination already exists. Review it and rerun with -Update to refresh the template while preserving .env, workspace, and runbooks/local."
}

$changes = New-Object System.Collections.Generic.List[string]

function Sync-TemplateNode {
  param(
    [Parameter(Mandatory)] [System.IO.FileSystemInfo]$Source,
    [Parameter(Mandatory)] [string]$Target,
    [Parameter(Mandatory)] [string]$RelativePath,
    [switch]$PreserveOnUpdate
  )

  if ($PreserveOnUpdate -and $Update -and (Test-Path -LiteralPath $Target)) {
    $changes.Add("preserved  $RelativePath")
    return
  }

  if ($Source.PSIsContainer) {
    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    Get-ChildItem -LiteralPath $Source.FullName -Force | ForEach-Object {
      $childRelative = if ($RelativePath) { "$RelativePath/$($_.Name)" } else { $_.Name }
      $childTarget = Join-Path $Target $_.Name
      $isLocalRunbook = $childRelative -eq "runbooks/local"
      Sync-TemplateNode -Source $_ -Target $childTarget -RelativePath $childRelative -PreserveOnUpdate:$isLocalRunbook
    }
    return
  }

  $status = "created"
  if (Test-Path -LiteralPath $Target) {
    $sourceHash = (Get-FileHash -LiteralPath $Source.FullName -Algorithm SHA256).Hash
    $targetHash = (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash
    $status = if ($sourceHash -eq $targetHash) { "unchanged" } else { "updated" }
  }
  Copy-Item -LiteralPath $Source.FullName -Destination $Target -Force
  $changes.Add(("{0,-10} {1}" -f $status, $RelativePath))
}

New-Item -ItemType Directory -Force -Path $destinationRoot | Out-Null
Get-ChildItem -LiteralPath $templateRoot -Force | Where-Object { $_.Name -notin @(".env", "workspace") } | ForEach-Object {
  Sync-TemplateNode -Source $_ -Target (Join-Path $destinationRoot $_.Name) -RelativePath $_.Name
}

$workspace = Join-Path $destinationRoot "workspace"
New-Item -ItemType Directory -Force -Path $workspace, (Join-Path $workspace "reports"), (Join-Path $workspace "state"), (Join-Path $workspace "drafts") | Out-Null
$workspaceReadme = Join-Path $workspace "README.md"
if (-not (Test-Path -LiteralPath $workspaceReadme)) {
  Copy-Item -LiteralPath (Join-Path $templateRoot "workspace\README.md") -Destination $workspaceReadme -Force
  $changes.Add("created    workspace/README.md")
} elseif ($Update) {
  $changes.Add("preserved  workspace/")
}

if (-not (Test-Path -LiteralPath (Join-Path $destinationRoot ".env"))) {
  Write-Host "Next: copy .env.example to .env and set the assistant key, MCP URL, and group ID."
}

Write-Host ("Template {0}: {1}" -f ($(if ($Update) { "updated" } else { "created" }), $destinationRoot))
Write-Host "Change summary:"
$changes | Sort-Object | ForEach-Object { Write-Host "  $_" }
Write-Host "Preserved on update: .env, workspace/, runbooks/local/"
if ($Update) { Write-Warning "Review updated defaults and organization-specific local runbooks before using them." }
