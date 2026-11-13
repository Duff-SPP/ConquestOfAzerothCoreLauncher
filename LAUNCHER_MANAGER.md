# Launcher Manager

Run **Launcher Manager.bat** from the repository root or `conquest-launcher/`. Keep the source tree together; the BAT is not intended for a player's installed game folder.

## Requirements

Windows x64, Node.js 22+ with npm, Windows `tar.exe`, and .NET SDK 8 for backend builds. Use option **7** to install the locked npm dependencies and **8** to check the installed tools. Windows administrator rights are normally unnecessary.

## Menu

| Option | Action |
| --- | --- |
| 1 | Choose a new launcher version, build the installer and create a hotfix package |
| 2 | Build the installer at the current version, or retry a failed build |
| 3 | Package an existing fresh launcher build as a hotfix |
| 4 | Build the Linux x64 backend; retain the previous output |
| 5 | Choose a version, build launcher/backend and create a full VPS package |
| 6 | Increase the version without building |
| 7 | Install locked npm dependencies using npm ci |
| 8 | Check Node/npm/.NET/tar prerequisites |
| 9 | Open the delivery folder |
| U | Build and package a backend update for the existing installation |
| F | Create a full VPS archive from existing fresh builds |
| D | Open this guide |
| 0 | Exit |

For an ordinary launcher release, use **1**. To retry without increasing the version again, use **2**, then **3**. Never publish different installer bytes under a version already released.

For the original existing VPS installation, use **U** and follow [UPDATE_0.8.1.md](UPDATE_0.8.1.md). Full VPS packages are described in [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md); review them before use on a host with customized website/authentication routing. The menu does not apply database migrations.

Installer output is in `conquest-launcher/dist/`. Hotfix/backend update packages are written to `Release-Output/`. Each action stops on failure and records a log in `conquest-launcher/manager-logs/`. Do not upload packages marked `INCOMPLETE-DO-NOT-UPLOAD.txt`. Tests are run separately.

## Publish

For a launcher hotfix, upload the archive and checksum to the host and follow the included `LAUNCHER_DEPLOYMENT.md`. Its publishing script verifies the files, asks for the destination and requires `PUBLISH` before changing the live feed. Builds and package creation do not upload anything automatically.

Original author: Duff (Duff-SPP). See LICENSE, COPYING and ATTRIBUTION.md for reuse terms.
