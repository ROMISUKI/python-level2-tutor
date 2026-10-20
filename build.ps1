param(
  [string]$OutDir = (Join-Path $PSScriptRoot 'release'),
  [string]$Version = '1.0.0'
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

$appName = 'Python二级通关'
$appDir = Join-Path $OutDir $appName
$zipPath = Join-Path $OutDir "PythonLevel2Tutor-v$Version-win64.zip"

$running = Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and $_.ExecutablePath.StartsWith($appDir, [System.StringComparison]::OrdinalIgnoreCase)
}
if ($running) {
  throw "应用正在运行（PID: $($running.ProcessId -join ', ')）。请先关闭窗口再打包。"
}

$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
  $python = (Get-Command python -ErrorAction Stop).Source
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

& $python -m PyInstaller --noconfirm --clean --windowed `
  --name $appName `
  --icon (Join-Path $root 'assets\app.ico') `
  --add-data "$root\web;web" `
  --add-data "$root\content;content" `
  --collect-all webview `
  --version-file (Join-Path $root 'packaging\version_info.txt') `
  --distpath $OutDir `
  --workpath (Join-Path $root 'build\work') `
  --specpath (Join-Path $root 'build') `
  (Join-Path $root 'run_app.py')

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller 打包失败（退出码 $LASTEXITCODE）"
}

Copy-Item (Join-Path $root 'LICENSE') $appDir -Force
Copy-Item (Join-Path $root 'LICENSE-CONTENT') $appDir -Force
Copy-Item (Join-Path $root 'THIRD_PARTY_NOTICES.md') $appDir -Force
Copy-Item (Join-Path $root 'README.md') $appDir -Force
Copy-Item (Join-Path $root 'licenses') $appDir -Recurse -Force

if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path $appDir -DestinationPath $zipPath -CompressionLevel Optimal

$hash = (Get-FileHash $zipPath -Algorithm SHA256).Hash
"$hash  $(Split-Path $zipPath -Leaf)" | Set-Content -Path "$zipPath.sha256" -Encoding ascii

Write-Output "Build finished: $appDir\$appName.exe"
Write-Output "Release zip:    $zipPath"
Write-Output "SHA256:         $hash"
