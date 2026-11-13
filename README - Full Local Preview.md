# Local preview

OPEN FULL LOCAL PREVIEW.bat starts the existing Debug backend and source Electron app. It never compiles. After backend source changes, follow BUILD_AND_RELEASE.md to build Debug, stop/restart the backend, then reopen the launcher.

Private local config: Conquest-Launcher-Backend/appsettings.Local.json. LocalTesting=true and Development only; 127.0.0.1:5082. Your existing local MySQL connection is not altered by the source update.

COA_DOWNLOAD_DEMO=1 simulates game downloading for ten minutes. It cannot activate in a packaged build. It does not modify the selected folder. Set to 0 in the BAT to use real local published client files.

Addon management always uses the real shared implementation and bundled packages. Use Locate game to select a writable test folder outside the protected reference tree. An empty folder is accepted locally for addon tests; it cannot be played without Ascension.exe. Never select C:\Azerothcore\ConquestOfAzerothCore for modifications.

Keep secrets and local logs private. Do not reapply old UpdateBatsForLauncher patches.
