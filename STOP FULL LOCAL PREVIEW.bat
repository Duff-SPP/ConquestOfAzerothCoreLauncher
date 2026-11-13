@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
set "STATE=%ROOT%.full-local-preview-backend.pid"

echo.
if not exist "%STATE%" (
    echo No backend PID file exists.
    echo If a backend is already running manually on port 5082, this helper will not kill it.
    pause
    exit /b 0
)

powershell.exe -NoProfile -Command ^
  "$backendPid=0; if(-not [int]::TryParse((Get-Content -LiteralPath $env:STATE -Raw).Trim(),[ref]$backendPid)){exit 1}; $p=Get-Process -Id $backendPid -ErrorAction SilentlyContinue; $expected=Join-Path $env:ROOT 'Conquest-Launcher-Backend\bin\Debug\net8.0\Conquest.Launcher.Backend.exe'; if($p -and $p.Path -eq $expected){Stop-Process -Id $backendPid -Force; exit 0}else{exit 1}"

if errorlevel 1 (
    echo No matching launcher backend process found. No process was stopped.
) else (
    echo Stopped the local launcher backend process.
)

del /q "%STATE%" >nul 2>&1
pause
