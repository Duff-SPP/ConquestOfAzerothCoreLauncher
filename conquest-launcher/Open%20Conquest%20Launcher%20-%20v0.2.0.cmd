@echo off
setlocal EnableExtensions

rem ------------------------------------------------------------
rem Conquest of AzerothCore Launcher preview helper
rem Works when this CMD is:
rem   1) next to the conquest-launcher folder,
rem   2) inside the conquest-launcher folder, or
rem   3) next to an extracted version folder that contains it.
rem ------------------------------------------------------------

set "ROOT=%~dp0"
set "APPDIR="

rem Case 1: CMD is next to \conquest-launcher
if exist "%ROOT%conquest-launcher\node_modules\electron\dist\electron.exe" (
    set "APPDIR=%ROOT%conquest-launcher"
    goto :launch
)

rem Case 2: CMD is already inside \conquest-launcher
if exist "%ROOT%node_modules\electron\dist\electron.exe" if exist "%ROOT%package.json" (
    set "APPDIR=%ROOT%"
    goto :launch
)

rem Case 3: CMD is next to a version/extracted folder containing \conquest-launcher
for /d %%D in ("%ROOT%*") do (
    if exist "%%~fD\conquest-launcher\node_modules\electron\dist\electron.exe" (
        set "APPDIR=%%~fD\conquest-launcher"
        goto :launch
    )
)

echo.
echo [ERROR] Could not find the Conquest launcher runtime.
echo.
echo Put this file either:
echo   - next to the ^"conquest-launcher^" folder, or
echo   - inside the ^"conquest-launcher^" folder.
echo.
pause
exit /b 1

:launch
cd /d "%APPDIR%"
set "ELECTRON_RUN_AS_NODE="
start "Conquest of AzerothCore" "%APPDIR%\node_modules\electron\dist\electron.exe" "."
exit /b 0
