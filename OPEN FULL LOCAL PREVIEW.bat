@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Conquest of AzerothCore - Full Local Preview

set "ROOT=%~dp0"
set "BACKEND=%ROOT%Conquest-Launcher-Backend"
set "LAUNCHER=%ROOT%conquest-launcher"
set "BACKEND_EXE=%BACKEND%\bin\Debug\net8.0\Conquest.Launcher.Backend.exe"
set "ELECTRON=%LAUNCHER%\node_modules\electron\dist\electron.exe"
set "STATE=%ROOT%.full-local-preview-backend.pid"

echo.
echo ============================================================
echo   CONQUEST OF AZEROTHCORE - FULL LOCAL PREVIEW
echo ============================================================
echo.
echo This starts the existing compiled launcher backend and then
echo starts the Electron launcher in COA_LOCAL_TEST mode.
echo.
echo NO BUILD OR COMPILE IS PERFORMED.
echo.

if not exist "%BACKEND%\appsettings.Local.json" (
    echo [ERROR] Missing:
    echo   %BACKEND%\appsettings.Local.json
    echo.
    echo Extract/copy the supplied local config into the backend folder.
    pause
    exit /b 1
)

if not exist "%BACKEND_EXE%" (
    echo [ERROR] Existing compiled backend was not found:
    echo   %BACKEND_EXE%
    echo.
    echo This preview intentionally does not build anything.
    pause
    exit /b 1
)

if not exist "%ELECTRON%" (
    call :restoreelectron
    if errorlevel 1 (
        pause
        exit /b 1
    )
)

echo [1/4] Checking local MySQL on 127.0.0.1:3307...
powershell.exe -NoProfile -Command ^
  "$c=New-Object Net.Sockets.TcpClient; try {$a=$c.BeginConnect('127.0.0.1',3307,$null,$null); if(-not $a.AsyncWaitHandle.WaitOne(1500)){exit 1}; $c.EndConnect($a); exit 0} catch {exit 1} finally {$c.Dispose()}"
if errorlevel 1 (
    echo.
    echo [ERROR] MySQL is not reachable on 127.0.0.1:3307.
    echo Start the local CoA repack/MySQL first, then run this file again.
    pause
    exit /b 1
)
echo       MySQL is reachable.

echo.
echo [2/4] Checking launcher backend...
powershell.exe -NoProfile -Command ^
  "try {$r=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5082/health' -TimeoutSec 1; if($r.StatusCode -eq 200){exit 0}} catch {}; exit 1"
if not errorlevel 1 (
    echo       Backend is already running on 127.0.0.1:5082.
    goto :backendready
)

echo       Starting existing compiled backend...
rem Local preview logs to files; it does not need Windows Event Log permissions.
set "Logging__EventLog__LogLevel__Default=None"
powershell.exe -NoProfile -Command ^
  "$ErrorActionPreference='Stop'; $env:ASPNETCORE_ENVIRONMENT='Development'; $p=Start-Process -FilePath $env:BACKEND_EXE -WorkingDirectory $env:BACKEND -WindowStyle Hidden -RedirectStandardOutput (Join-Path $env:BACKEND 'local-preview.stdout.log') -RedirectStandardError (Join-Path $env:BACKEND 'local-preview.stderr.log') -PassThru; Set-Content -LiteralPath $env:STATE -Value $p.Id -Encoding ascii"
if errorlevel 1 (
    echo [ERROR] Could not start the backend. See the error above.
    pause
    exit /b 1
)

echo       Waiting for backend health check...
for /L %%I in (1,1,20) do (
    powershell.exe -NoProfile -Command ^
      "try {$r=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5082/health' -TimeoutSec 1; if($r.StatusCode -eq 200){exit 0}} catch {}; exit 1"
    if not errorlevel 1 goto :backendready
    timeout /t 1 /nobreak >nul
)

echo.
echo [ERROR] Backend did not become healthy on port 5082.
echo See local-preview.stderr.log and local-preview.stdout.log in the backend folder.
echo These logs are private; do not share them without checking for secrets.
pause
exit /b 1

:backendready
echo       Backend is healthy.

echo.
echo [3/4] Local account services configured - database schema is not checked by this helper.
echo       Login/registration will use your real local acore_auth database.
echo       Character/account views will use acore_characters.

echo.
echo [4/4] Starting Electron launcher in LOCAL TEST mode...
cd /d "%LAUNCHER%"
set "COA_LOCAL_TEST=1"
rem Set to 0 to restore real local downloads. Packaged launchers ignore this.
set "COA_DOWNLOAD_DEMO=1"
set "ELECTRON_RUN_AS_NODE="
start "Conquest of AzerothCore - Local Preview" "%ELECTRON%" "."

echo.
echo ============================================================
echo   FULL LOCAL PREVIEW STARTED
echo ============================================================
echo.
echo Launcher API : http://127.0.0.1:5082
echo MySQL       : 127.0.0.1:3307
echo Auth DB     : acore_auth
echo Character DB: acore_characters
echo.
echo Account creation is REAL and will insert into your local DB.
echo Login/account/character reads are REAL.
echo.
echo Close this window whenever you want.
echo Use "STOP FULL LOCAL PREVIEW.bat" to stop the backend started
echo by this helper.
echo.
pause
exit /b 0

:restoreelectron
setlocal
if not exist "%LAUNCHER%\node_modules\electron\install.js" (
    echo [ERROR] The Electron development package is missing. Restore development dependencies manually.
    exit /b 1
)
where node.exe >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found. Install Node.js or add it to PATH, then retry.
    exit /b 1
)
echo Restoring only the missing Electron development runtime. This may download Electron.
rem Use the installed package's own version/checksums, not npm install or a build.
rem Ignore cross-build/dist overrides for this Windows development runtime only.
set "ELECTRON_SKIP_BINARY_DOWNLOAD="
set "ELECTRON_OVERRIDE_DIST_PATH="
set "ELECTRON_INSTALL_PLATFORM=win32"
set "ELECTRON_INSTALL_ARCH="
set "npm_config_platform="
set "npm_config_arch="
node.exe "%LAUNCHER%\node_modules\electron\install.js"
if errorlevel 1 (
    echo [ERROR] Electron runtime repair failed. Check the download/extraction error above.
    echo Check your internet connection and antivirus quarantine, then run this preview again.
    exit /b 1
)
if not exist "%ELECTRON%" (
    echo [ERROR] Electron repair completed but electron.exe is still missing:
    echo   %ELECTRON%
    echo Check antivirus quarantine and folder permissions, then retry.
    exit /b 1
)
echo Electron development runtime restored.
exit /b 0
