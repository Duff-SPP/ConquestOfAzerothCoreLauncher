@echo off
cd /d "%~dp0"
if not exist appsettings.Local.json (
  echo Copy appsettings.Local.example.json to appsettings.Local.json and configure your SEPARATE test databases first.
  pause
  exit /b 1
)
set ASPNETCORE_ENVIRONMENT=Development
dotnet run --project Conquest.Launcher.Backend.csproj --no-launch-profile
pause
