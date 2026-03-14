$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildScript = Join-Path $projectRoot "build.ps1"

if (-not (Test-Path $buildScript)) {
  throw "Missing build.ps1 in project root."
}

& $buildScript

if ($LASTEXITCODE -ne 0) {
  throw ("Deploy failed with exit code {0}." -f $LASTEXITCODE)
}
