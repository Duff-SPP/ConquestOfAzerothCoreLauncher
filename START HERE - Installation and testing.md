# Start here — current PTR source

1. Read [BUILD_AND_RELEASE.md](BUILD_AND_RELEASE.md) for Windows prerequisites, local/backend builds, NSIS build and fresh VPS archive creation.
2. Read [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) for DNS, SQL, Discord, private config, Ubuntu service, nginx, master client and publishing.
3. Do not use old 0.4/0.5 archives or replay historical patch BATs against the current source.

For local preview, manually build the backend after C# changes, then run OPEN FULL LOCAL PREVIEW.bat. It does not build anything itself. Account services use your private appsettings.Local.json. Source UI changes need only a launcher restart.

The game download is a ten-minute simulation when COA_DOWNLOAD_DEMO=1 in the BAT. Set it to 0 for real local manifest downloads. Packaged builds cannot activate this flag.

Addon management is real in both modes. Use Locate game to select a separate writable test folder (empty is allowed locally), then open Addons. Real files are installed under Interface/AddOns. The protected C:\Azerothcore\ConquestOfAzerothCore folder must remain read-only.

Registration requires no CAPTCHA with Turnstile disabled. Discord linking is implemented; configure the application, SQL and secret before testing it. Website deployment is independent.