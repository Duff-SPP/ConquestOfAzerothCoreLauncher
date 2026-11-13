@echo off
cd /d "%~dp0"
call npm.cmd run build
if errorlevel 1 goto end
start "" explorer.exe "%~dp0dist"
:end
pause
