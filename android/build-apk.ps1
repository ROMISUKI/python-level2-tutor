param(
  [string]$OutDir = (Join-Path $PSScriptRoot 'build'),
  [string]$Version = '1.0.0',
  [string]$AndroidSdk = $env:ANDROID_HOME,
  [string]$JdkHome = $env:JAVA_HOME
)

$ErrorActionPreference = 'Stop'
$android = $PSScriptRoot
$root = Split-Path -Parent $android
if (-not $AndroidSdk) { $AndroidSdk = $env:ANDROID_SDK_ROOT }
if (-not $AndroidSdk) { $AndroidSdk = 'X:\OpenCodeTools\android-sdk' }
$sdk = $AndroidSdk
if (-not $JdkHome) { $JdkHome = Join-Path $sdk 'jdk-17' }
$jdk = $JdkHome
$buildTools = Join-Path $sdk 'build-tools\35.0.0'
$androidJar = Join-Path $sdk 'platforms\android-35\android.jar'

$java = Join-Path $jdk 'bin\java.exe'
$javac = Join-Path $jdk 'bin\javac.exe'
$jar = Join-Path $jdk 'bin\jar.exe'
$keytool = Join-Path $jdk 'bin\keytool.exe'
$aapt2 = Join-Path $buildTools 'aapt2.exe'
$d8 = Join-Path $buildTools 'd8.bat'
$zipalign = Join-Path $buildTools 'zipalign.exe'
$apksigner = Join-Path $buildTools 'apksigner.bat'
$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
  $python = (Get-Command python -ErrorAction Stop).Source
}

foreach ($tool in @($java, $javac, $jar, $keytool, $aapt2, $d8, $zipalign, $apksigner, $androidJar)) {
  if (-not (Test-Path $tool)) { throw "缺少构建工具：$tool" }
}

# Rebuild the mobile PWA if needed.
if (-not (Test-Path (Join-Path $root 'mobile-dist\index.html'))) {
  & (Join-Path $root 'build-mobile.ps1')
  if ($LASTEXITCODE -ne 0) { throw '手机端构建失败' }
}

$work = Join-Path $android 'build\work'
$assets = Join-Path $android 'app\src\main\assets'
$assetWww = Join-Path $assets 'www'
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
if (Test-Path $assets) { Remove-Item $assets -Recurse -Force }
New-Item -ItemType Directory -Force -Path $work, $assetWww, $OutDir | Out-Null
Copy-Item (Join-Path $root 'mobile-dist\*') $assetWww -Recurse -Force

$res = Join-Path $android 'app\src\main\res'
$manifest = Join-Path $android 'app\src\main\AndroidManifest.xml'

Write-Output '== aapt2 compile =='
& $aapt2 compile --dir $res -o (Join-Path $work 'res.zip')
if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile 失败' }

Write-Output '== aapt2 link =='
& $aapt2 link -o (Join-Path $work 'base.apk') `
  -I $androidJar `
  --manifest $manifest `
  -A $assets `
  --java (Join-Path $work 'gen') `
  --min-sdk-version 24 `
  --target-sdk-version 35 `
  --version-code 1 `
  --version-name $Version `
  (Join-Path $work 'res.zip')
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link 失败' }

Write-Output '== normalize asset paths =='
& $python (Join-Path $android 'normalize_apk.py') (Join-Path $work 'base.apk')
if ($LASTEXITCODE -ne 0) { throw '规范化 APK 路径失败' }

Write-Output '== javac =='
$classes = Join-Path $work 'classes'
New-Item -ItemType Directory -Force -Path $classes | Out-Null
$sources = @()
$sources += Get-ChildItem (Join-Path $work 'gen') -Recurse -Filter '*.java' | ForEach-Object { $_.FullName }
$sources += Join-Path $android 'app\src\main\java\com\duan\pythonlevel2\MainActivity.java'
& $javac -encoding UTF-8 -source 8 -target 8 -bootclasspath $androidJar -d $classes $sources
if ($LASTEXITCODE -ne 0) { throw 'javac 失败' }

Write-Output '== d8 =='
$dex = Join-Path $work 'dex'
New-Item -ItemType Directory -Force -Path $dex | Out-Null
$classFiles = Get-ChildItem $classes -Recurse -Filter '*.class' | ForEach-Object { $_.FullName }
& $d8 --lib $androidJar --min-api 24 --output $dex $classFiles
if ($LASTEXITCODE -ne 0) { throw 'd8 失败' }

Write-Output '== package dex =='
Copy-Item (Join-Path $dex 'classes.dex') (Join-Path $work 'classes.dex') -Force
& $jar --update --file (Join-Path $work 'base.apk') -C $work classes.dex
if ($LASTEXITCODE -ne 0) { throw '写入 classes.dex 失败' }

Write-Output '== zipalign =='
& $zipalign -f 4 (Join-Path $work 'base.apk') (Join-Path $work 'aligned.apk')
if ($LASTEXITCODE -ne 0) { throw 'zipalign 失败' }

$keystore = Join-Path $android 'pyl2-release.jks'
if (-not (Test-Path $keystore)) {
  Write-Output '== generate signing key =='
  & $keytool -genkeypair -v `
    -keystore $keystore `
    -alias pyl2 `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storepass pyl2-release `
    -keypass pyl2-release `
    -dname 'CN=Python Level 2 Tutor, OU=Local, O=Local, L=Local, ST=Local, C=CN'
  if ($LASTEXITCODE -ne 0) { throw 'keytool 失败' }
}

$signed = Join-Path $OutDir 'Python二级通关.apk'
Write-Output '== sign =='
& $apksigner sign `
  --ks $keystore `
  --ks-key-alias pyl2 `
  --ks-pass pass:pyl2-release `
  --key-pass pass:pyl2-release `
  --out $signed `
  (Join-Path $work 'aligned.apk')
if ($LASTEXITCODE -ne 0) { throw 'apksigner 失败' }

& $apksigner verify --print-certs $signed | Select-Object -First 8
& $aapt2 dump badging $signed | Select-Object -First 4
$hash = (Get-FileHash $signed -Algorithm SHA256).Hash
"$hash  Python二级通关.apk" | Set-Content "$signed.sha256" -Encoding ascii

Write-Output "APK: $signed"
Write-Output "SHA256: $hash"
