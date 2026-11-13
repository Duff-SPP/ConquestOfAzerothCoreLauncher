# Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
param(
  [string]$OldInstaller = "$PSScriptRoot\..\dist\ConquestOfAzerothSetup-0.6.1.exe",
  [string]$NewInstaller = "$PSScriptRoot\..\dist\ConquestOfAzerothSetup-0.6.8.exe"
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class CoaAcceptanceWindows {
  public delegate bool Callback(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Callback c, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
}
'@
function Find-LauncherWindow([int]$processId) {
  $script:launcherWindow = [IntPtr]::Zero
  $null = [CoaAcceptanceWindows]::EnumWindows({ param($h,$l)
    [uint32]$windowProcess = 0
    $null = [CoaAcceptanceWindows]::GetWindowThreadProcessId($h, [ref]$windowProcess)
    if ($windowProcess -eq $processId) {
      $title = [Text.StringBuilder]::new(512)
      $null = [CoaAcceptanceWindows]::GetWindowText($h, $title, 512)
      if ($title.ToString() -eq 'Conquest of AzerothCore') { $script:launcherWindow = $h }
    }
    return $true
  }, [IntPtr]::Zero)
  return $script:launcherWindow
}
$project = (Resolve-Path -LiteralPath "$PSScriptRoot\..").Path
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('coa-acceptance-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$installRoot = Join-Path $testRoot 'Launcher with spaces\ConquestOfAzeroth'
$profile = Join-Path $testRoot 'Isolated AppData'
$gameRoot = Join-Path $testRoot 'Separate client'
$guid = 'bc7ca133-c176-5f2a-95ed-01bef8777024'
$regPaths = @("HKCU\Software\$guid", "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid")
$providerPaths = @("HKCU:\Software\$guid", "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid")
$exe = Join-Path $installRoot 'ConquestOfAzeroth.exe'
$uninstaller = Join-Path $installRoot 'Uninstall ConquestOfAzeroth.exe'
$events = [Collections.Generic.List[string]]::new()
$shortcuts = @(
  (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Conquest of AzerothCore.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Conquest of AzerothCore.lnk')
)
function Assert-That([bool]$condition, [string]$message) { if (-not $condition) { throw $message } }
function Note([string]$message) { $events.Add($message); Write-Output $message }
function Install-Test([string]$installer, [bool]$updated) {
  $arguments = '/S /currentuser --no-desktop-shortcut'
  if ($updated) { $arguments += ' --updated' }
  # NSIS requires /D last and unquoted, including paths containing spaces.
  $arguments += " /D=$installRoot"
  $process = Start-Process -FilePath (Resolve-Path -LiteralPath $installer).Path -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait
  Assert-That ($process.ExitCode -eq 0) "Installer failed with exit code $($process.ExitCode)"
  Assert-That (Test-Path -LiteralPath $exe) 'Installer did not produce the requested executable'
  Assert-That ((Get-ItemProperty -LiteralPath $providerPaths[0]).InstallLocation -eq $installRoot) 'Incorrect registered installation directory'
}
function Start-TestLauncher {
  $process = Start-Process -FilePath $exe -ArgumentList "--user-data-dir=`"$profile`"" -WorkingDirectory $installRoot -WindowStyle Hidden -PassThru
  $script:running = $process
  $deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 200
    $process.Refresh()
    if ($process.HasExited) { throw "Packaged launcher exited before showing its window: $($process.ExitCode)" }
  } until ((Find-LauncherWindow $process.Id) -ne [IntPtr]::Zero -or (Get-Date) -gt $deadline)
  Assert-That ((Find-LauncherWindow $process.Id) -ne [IntPtr]::Zero) 'Packaged launcher window did not become ready'
  Start-Sleep -Seconds 3
  return $process
}
function Close-TestLauncher($process) {
  Assert-That ([CoaAcceptanceWindows]::PostMessage((Find-LauncherWindow $process.Id), 16, [IntPtr]::Zero, [IntPtr]::Zero)) 'Could not request a graceful launcher close'
  Assert-That ($process.WaitForExit(20000)) 'Launcher did not close gracefully'
}
function Uninstall-Test {
  $process = Start-Process -FilePath $uninstaller -ArgumentList '/S /currentuser' -WindowStyle Hidden -PassThru -Wait
  # NSIS launches a TEMP child; -Wait waits for the process tree. Verify effects,
  # never mistake the bootstrap process's exit code for completed uninstallation.
  return $process.ExitCode
}
New-Item -ItemType Directory -Path $testRoot,$profile,$gameRoot -Force | Out-Null
Assert-That (-not (Get-Process -Name ConquestOfAzeroth -ErrorAction SilentlyContinue)) 'Close the existing launcher before the disposable acceptance test'
$backedUpRegistry = @()
for ($i=0; $i -lt $regPaths.Count; $i++) {
  $present = Test-Path -LiteralPath $providerPaths[$i]
  $backedUpRegistry += $present
  if ($present) { & reg.exe export $regPaths[$i] (Join-Path $testRoot "registry-$i.reg") /y | Out-Null; Assert-That ($LASTEXITCODE -eq 0) 'Registry backup failed' }
}
$backedUpShortcuts = @()
for ($i=0; $i -lt $shortcuts.Count; $i++) {
  $present = Test-Path -LiteralPath $shortcuts[$i]; $backedUpShortcuts += $present
  if ($present) { Copy-Item -LiteralPath $shortcuts[$i] -Destination (Join-Path $testRoot "shortcut-$i.lnk") }
}
$running = $null
try {
  # Isolate product discovery so the old installer cannot target the real installation.
  foreach ($key in $providerPaths) { if (Test-Path -LiteralPath $key) { Remove-Item -LiteralPath $key -Recurse -Force } }
  Set-Content -LiteralPath (Join-Path $gameRoot 'Ascension.exe') -Value 'separate game sentinel'
  Set-Content -LiteralPath (Join-Path $profile 'KEEP-APPDATA.txt') -Value 'appdata sentinel'
  $gameHash = (Get-FileHash -LiteralPath (Join-Path $gameRoot 'Ascension.exe')).Hash
  Install-Test $OldInstaller $false
  Note 'Old production installer installed in disposable folder.'
  $running = Start-TestLauncher; Close-TestLauncher $running; $running = $null
  Note 'Old packaged launcher opened its window and closed gracefully.'
  Set-Content -LiteralPath (Join-Path $installRoot 'KEEP-ME.txt') -Value 'unknown player file'
  New-Item -ItemType Directory -Path (Join-Path $installRoot '.coa-preserved') -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $installRoot '.coa-preserved\manual.txt') -Value 'existing backup'
  Install-Test $NewInstaller $true
  Assert-That ((Get-ItemProperty -LiteralPath $providerPaths[1]).DisplayVersion -eq '0.6.8') 'Upgrade registration version mismatch'
  Note '0.6.8 installed over old version in the same folder using updater-style --updated arguments.'
  $owned = Get-ChildItem -LiteralPath $installRoot -File -Recurse | Where-Object { $_.FullName -notlike "$installRoot\.coa-preserved\*" -and $_.Name -ne 'KEEP-ME.txt' }
  $running = Start-TestLauncher
  $null = Uninstall-Test
  Assert-That (Test-Path -LiteralPath $exe) 'Running-launcher uninstall removed the EXE'
  Assert-That (Test-Path -LiteralPath $providerPaths[1]) 'Running-launcher uninstall removed registration'
  $running.Refresh(); Assert-That (-not $running.HasExited) 'Uninstaller terminated the running launcher'
  Close-TestLauncher $running; $running = $null
  Note 'Protected packaged launcher ran; uninstall while running safely refused; graceful close succeeded.'
  $handle = [IO.File]::Open((Join-Path $installRoot 'resources\app.asar'), 'Open', 'Read', 'Read')
  try {
    $null = Uninstall-Test
    Assert-That (Test-Path -LiteralPath $exe) 'Locked-file preflight removed files'
    Assert-That (Test-Path -LiteralPath $providerPaths[1]) 'Locked-file failure removed registration'
  } finally { $handle.Dispose() }
  Note 'Locked ASAR safely blocked removal and retained Windows registration.'
  # An owned file remains owned even after modification and a read-only flag.
  $ownedFile = Join-Path $installRoot 'resources\app-update.yml'
  Add-Content -LiteralPath $ownedFile -Value '# acceptance-only modified owned bytes'
  (Get-Item -LiteralPath $ownedFile).IsReadOnly = $true
  $null = Uninstall-Test
  foreach ($file in $owned) { Assert-That (-not (Test-Path -LiteralPath $file.FullName)) "Owned file remains: $($file.FullName)" }
  Assert-That (-not (Test-Path -LiteralPath $uninstaller)) 'Uninstaller did not remove itself'
  foreach ($key in $providerPaths) { Assert-That (-not (Test-Path -LiteralPath $key)) 'Windows uninstall/install registration remains' }
  Assert-That ((Get-Content -LiteralPath (Join-Path $installRoot 'KEEP-ME.txt') -Raw).Trim() -eq 'unknown player file') 'Unknown file changed'
  Assert-That ((Get-Content -LiteralPath (Join-Path $installRoot '.coa-preserved\manual.txt') -Raw).Trim() -eq 'existing backup') 'Preserved backup changed'
  Assert-That ((Get-FileHash -LiteralPath (Join-Path $gameRoot 'Ascension.exe')).Hash -eq $gameHash) 'Separate game changed'
  Assert-That (Test-Path -LiteralPath (Join-Path $profile 'KEEP-APPDATA.txt')) 'AppData sentinel removed'
  Note 'Uninstall removed every installed owned file, modified/read-only file, itself and Windows registration; unknown files, backups, isolated AppData and separate game survived.'
  $events | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $testRoot 'PASS.json')
} finally {
  if ($running -and -not $running.HasExited) {
    $null = [CoaAcceptanceWindows]::PostMessage((Find-LauncherWindow $running.Id), 16, [IntPtr]::Zero, [IntPtr]::Zero)
    $null = $running.WaitForExit(10000)
  }
  for ($i=0; $i -lt $regPaths.Count; $i++) {
    if (Test-Path -LiteralPath $providerPaths[$i]) { Remove-Item -LiteralPath $providerPaths[$i] -Recurse -Force }
    if ($backedUpRegistry[$i]) { & reg.exe import (Join-Path $testRoot "registry-$i.reg") | Out-Null }
  }
  for ($i=0; $i -lt $shortcuts.Count; $i++) {
    if ($backedUpShortcuts[$i]) { Copy-Item -LiteralPath (Join-Path $testRoot "shortcut-$i.lnk") -Destination $shortcuts[$i] -Force }
  }
  Write-Output "Acceptance evidence retained: $testRoot"
}
