param(
  [Parameter(Mandatory = $true)]
  [string]$PluginPath,

  [string]$OutDir = "output\plugins"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$resolved = (Resolve-Path -LiteralPath $PluginPath).Path
$manifestPath = Join-Path $resolved "plugin.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "plugin.json was not found in $resolved"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $manifest.id -or -not $manifest.version) {
  throw "plugin.json must contain id and version"
}

$outPath = if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $repoRoot $OutDir }
New-Item -ItemType Directory -Force -Path $outPath | Out-Null
$archive = Join-Path $outPath "$($manifest.id)-$($manifest.version).orbit-plugin.zip"
if (Test-Path -LiteralPath $archive) {
  Remove-Item -LiteralPath $archive -Force
}

$entries = Get-ChildItem -LiteralPath $resolved -Force
if (-not $entries) {
  throw "Plugin directory is empty: $resolved"
}

Compress-Archive -Path $entries.FullName -DestinationPath $archive -Force
Write-Output $archive
