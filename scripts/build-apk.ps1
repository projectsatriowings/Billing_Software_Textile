# scripts/build-apk.ps1
# Automates Android APK build for A2Z Billing on Windows

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot

# Configure JDK 21
$defaultJdk = "C:\Program Files\Eclipse Adoptium\jdk-21.0.13.10002-hotspot"
if (Test-Path $defaultJdk) {
    $env:JAVA_HOME = $defaultJdk
    $env:PATH = "$defaultJdk\bin;$env:PATH"
    Write-Host "[build-apk] Using JDK 21 at: $env:JAVA_HOME" -ForegroundColor Cyan
} elseif ($env:JAVA_HOME) {
    Write-Host "[build-apk] Using existing JAVA_HOME: $env:JAVA_HOME" -ForegroundColor Cyan
} else {
    Write-Warning "[build-apk] JAVA_HOME is not set. Ensure JDK 17 or 21 is installed."
}

# Configure Android SDK
$defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
if (-not $env:ANDROID_HOME -and (Test-Path $defaultSdk)) {
    $env:ANDROID_HOME = $defaultSdk
    $env:ANDROID_SDK_ROOT = $defaultSdk
    Write-Host "[build-apk] Using Android SDK at: $env:ANDROID_HOME" -ForegroundColor Cyan
}

# Navigate to android directory
$androidDir = Join-Path $projectRoot "android"
if (-not (Test-Path $androidDir)) {
    Write-Error "[build-apk] Android project directory not found at $androidDir"
    exit 1
}

Write-Host "[build-apk] Building Android Debug APK via Gradle..." -ForegroundColor Green
Push-Location $androidDir
try {
    .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[build-apk] Gradle build failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

# Copy output APK
$outputApk = Join-Path $projectRoot "android\app\build\outputs\apk\debug\app-debug.apk"
$destDir = Join-Path $projectRoot "client\public\downloads"
$destApk = Join-Path $destDir "A2Z-Billing.apk"

if (Test-Path $outputApk) {
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    Copy-Item -Path $outputApk -Destination $destApk -Force
    $sizeMb = [math]::Round(((Get-Item $destApk).Length / 1MB), 2)
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "✅ APK BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "Output File: $destApk ($sizeMb MB)" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green
} else {
    Write-Error "[build-apk] Output APK not found at: $outputApk"
    exit 1
}
