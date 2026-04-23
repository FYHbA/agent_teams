$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repoRoot "backend/.venv/Scripts/python.exe"
if (-not (Test-Path $python)) {
  $python = "python"
}

& $python (Join-Path $repoRoot "scripts/dev_launcher.py") up
