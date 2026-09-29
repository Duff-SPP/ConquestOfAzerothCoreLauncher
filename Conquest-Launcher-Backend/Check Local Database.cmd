@echo off
cd /d "%~dp0"
if not exist appsettings.Local.json (
  echo Configure appsettings.Local.json for SEPARATE test databases first.
  pause
  exit /b 1
)
set ASPNETCORE_ENVIRONMENT=Development
dotnet run --project Conquest.Launcher.Backend.csproj --no-launch-profile -- --check-database
pause
