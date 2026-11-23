@echo off
setlocal
echo ========================================================
echo   A2Z Billing Software - 1-Click Installer
echo ========================================================
echo.
echo [1/2] Unblocking file for Windows Security...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -Path '.\A2Z Setup 0.1.0.exe' -ErrorAction SilentlyContinue"
echo [2/2] Launching A2Z Setup...
start "" ".\A2Z Setup 0.1.0.exe"
echo.
echo Installer launched successfully! You can close this window.
timeout /t 3 >nul
exit
