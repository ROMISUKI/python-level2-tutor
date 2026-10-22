param([switch]$SkipFetch)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
  $python = (Get-Command python -ErrorAction Stop).Source
}

$pyodide = Join-Path $root 'mobile\vendor\pyodide\pyodide.js'
if (-not $SkipFetch -and -not (Test-Path $pyodide)) {
  & $python (Join-Path $root 'tools\fetch_pyodide.py')
  if ($LASTEXITCODE -ne 0) { throw 'Pyodide 下载失败' }
}

& $python (Join-Path $root 'tools\build_mobile.py')
if ($LASTEXITCODE -ne 0) { throw '移动端构建失败' }
