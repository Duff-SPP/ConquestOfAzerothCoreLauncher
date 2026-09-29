@echo off
cd /d "%~dp0"
set COA_LOCAL_TEST=1
set ELECTRON_RUN_AS_NODE=
call npm.cmd start
pause
