# Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$launcher = Split-Path $PSScriptRoot -Parent
$project = Split-Path $launcher -Parent
$backend = Join-Path $project 'Conquest-Launcher-Backend'
$output = Join-Path $launcher 'dist'
$deliveries = Join-Path $project 'Release-Output'
Set-Location -LiteralPath $launcher

function Version { return (Get-Content -LiteralPath (Join-Path $launcher 'package.json') -Raw | ConvertFrom-Json).version }
function Require-Tool([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "$Name is missing. Install it, then reopen this menu. See LAUNCHER_MANAGER.md." }
}
function Run([string]$Command, [string[]]$Arguments) {
    Write-Host "`n> $Command $($Arguments -join ' ')" -ForegroundColor Cyan
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed (exit $LASTEXITCODE). No later steps were run." }
}
function Node-Ready {
    Require-Tool 'node.exe'
    $nodeVersion = & node.exe -p 'process.versions.node.split(String.fromCharCode(46))[0]'
    if ($LASTEXITCODE -ne 0 -or [int]$nodeVersion -lt 22) { throw 'Node.js 22 or newer is required.' }
    Require-Tool 'npm.cmd'
}
function Dependencies { Node-Ready; Run 'npm.cmd' @('ci') }
function Change-Version {
    Node-Ready
    $current = Version
    $parts = $current.Split('.')
    $suggested = '{0}.{1}.{2}' -f $parts[0], $parts[1], ([int]$parts[2] + 1)
    $next = Read-Host "New launcher version [$suggested] (C to cancel)"
    if ($next -eq 'C') { throw 'Cancelled. Version unchanged.' }
    if (-not $next) { $next = $suggested }
    if ($next -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or [version]$next -le [version]$current) { throw "Choose a version greater than $current, for example $suggested." }
    Run 'npm.cmd' @('version', $next, '--no-git-tag-version', '--ignore-scripts')
    Write-Host "Version is now $next. If a later build fails, retry option 2 without increasing it again."
}
function Build-Launcher {
    Node-Ready
    if (-not (Test-Path -LiteralPath (Join-Path $launcher 'node_modules/.bin/electron-builder.cmd'))) { Dependencies }
    $oldElectron = $env:ELECTRON_RUN_AS_NODE
    $oldSigning = $env:CSC_IDENTITY_AUTO_DISCOVERY
    try {
        Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
        $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
        Run 'npm.cmd' @('run', 'build')
    } finally {
        $env:ELECTRON_RUN_AS_NODE = $oldElectron
        $env:CSC_IDENTITY_AUTO_DISCOVERY = $oldSigning
    }
    Write-Host "`nInstaller: $(Join-Path $output ('ConquestOfAzerothSetup-' + (Version) + '.exe'))" -ForegroundColor Green
}
function Build-Backend {
    Require-Tool 'dotnet.exe'
    $csproj = Join-Path $backend 'Conquest.Launcher.Backend.csproj'
    if (-not (Test-Path -LiteralPath $csproj)) { throw 'Backend source folder is missing.' }
    $deploy = Join-Path $backend 'deploy'
    New-Item -ItemType Directory -Path $deploy -Force | Out-Null
    $suffix = [guid]::NewGuid().ToString('N')
    $fresh = Join-Path $deploy "linux-build-$suffix"
    Run 'dotnet.exe' @('publish', $csproj, '-c', 'Release', '-r', 'linux-x64', '--self-contained', 'false', '-p:UseAppHost=false', '-o', $fresh)
    if (-not (Test-Path -LiteralPath (Join-Path $fresh 'Conquest.Launcher.Backend.dll'))) { throw 'Backend publish did not produce the expected DLL.' }
    $active = Join-Path $deploy 'linux-x64'
    $saved = Join-Path $deploy "linux-previous-$suffix"
    # Verify all move targets remain direct children of the intended output directory.
    foreach ($target in @($fresh, $active, $saved)) {
        if ((Split-Path ([IO.Path]::GetFullPath($target)) -Parent) -ne [IO.Path]::GetFullPath($deploy)) { throw 'Unexpected backend output path.' }
        if ((Test-Path -LiteralPath $target) -and ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Linked backend output paths are not supported.' }
    }
    if (Test-Path -LiteralPath $active) { Move-Item -LiteralPath $active -Destination $saved }
    try { Move-Item -LiteralPath $fresh -Destination $active }
    catch {
        if ((Test-Path -LiteralPath $saved) -and -not (Test-Path -LiteralPath $active)) { Move-Item -LiteralPath $saved -Destination $active }
        throw
    }
    Write-Host "Linux backend ready: $active" -ForegroundColor Green
}
function Hotfix {
    Node-Ready
    Require-Tool 'tar.exe'
    Run 'node.exe' @('tools/manager-hotfix.cjs')
}
function Full-Package {
    Node-Ready
    Require-Tool 'tar.exe'
    Run 'npm.cmd' @('run', 'package:vps')
    Write-Host 'Use the exact new archive path printed above. Follow PRODUCTION_DEPLOYMENT.md.' -ForegroundColor Green
    Write-Host 'For the September account fixes, apply the Discord pending-state table/grants before deployment. See Conquest-Launcher-Backend/README.md.'
}
function Prerequisites {
    Node-Ready
    Run 'node.exe' @('--version')
    Run 'npm.cmd' @('--version')
    Require-Tool 'dotnet.exe'
    Run 'dotnet.exe' @('--list-sdks')
    Require-Tool 'tar.exe'
    Run 'tar.exe' @('--version')
    Write-Host 'Backend builds need .NET SDK 8 or a later SDK capable of targeting net8.0.'
}
if ($CheckOnly) {
    Write-Host "Manager loaded. Source: $launcher; version: $(Version). No build or packaging performed."
    exit 0
}
while ($true) {
    Write-Host "`n============================================================" -ForegroundColor Cyan
    Write-Host " CONQUEST LAUNCHER MANAGER - version $(Version)"
    Write-Host " Source: $launcher"
    Write-Host '============================================================'
    Write-Host @'
 1  NEW LAUNCHER RELEASE: choose version + build EXE + hotfix folder/archive
 2  Compile installer EXE at current version (also retry a failed build)
 3  Create hotfix deploy folder/archive from the current build
 4  Compile Linux backend only
 5  FULL RELEASE: choose version + build launcher/backend + VPS archive
 6  Choose/increase launcher version only
 7  Install/refresh build dependencies (npm ci)
 8  Check build prerequisites
 9  Open hotfix output folder
 U  Compile Linux backend + create existing-install update archive
 F  Create full VPS archive from existing fresh builds
 D  Open manager instructions
 0  Exit

Local builds do not publish anything. Use a NEW version for changed releases.
Launcher-only hotfixes do not include backend fixes.
'@
    $choice = Read-Host 'Choose an option'
    if ($choice -eq '0') { break }
    $transcribing = $false
    try {
        $logs = Join-Path $launcher 'manager-logs'
        New-Item -ItemType Directory -Path $logs -Force | Out-Null
        $log = Join-Path $logs ((Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.log')
        Start-Transcript -Path $log | Out-Null
        $transcribing = $true
        switch ($choice.ToUpperInvariant()) {
            '1' { Change-Version; Build-Launcher; Hotfix }
            '2' { Write-Host 'Do not publish different bytes under a version already released.'; Build-Launcher }
            '3' { Hotfix }
            '4' { Build-Backend }
            '5' { Change-Version; Build-Launcher; Build-Backend; Full-Package }
            '6' { Change-Version }
            '7' { Dependencies }
            '8' { Prerequisites }
            '9' { New-Item -ItemType Directory -Path $deliveries -Force | Out-Null; & explorer.exe $deliveries }
            'U' { Build-Backend; Node-Ready; Run 'node.exe' @('tools/package-backend-update.cjs') }
            'F' { Full-Package }
            'D' { & notepad.exe (Join-Path $project 'LAUNCHER_MANAGER.md') }
            default { Write-Host 'Choose one of the listed options.' }
        }
    } catch { Write-Host "`nSTOPPED: $($_.Exception.Message)" -ForegroundColor Red }
    finally { if ($transcribing) { Stop-Transcript | Out-Null; Write-Host "Log: $log" } }
    Read-Host 'Press Enter to return to the menu' | Out-Null
}
