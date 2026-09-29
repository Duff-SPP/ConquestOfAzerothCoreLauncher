# Launcher Manager

Double-click **Launcher Manager.bat** here or inside `conquest-launcher`. Keep the BAT with the source tree, not inside a player's installed launcher or an old hotfix folder.

For a normal launcher update, choose **1**. Accept the next version (currently 0.6.9), or enter another higher version. The manager builds the Windows installer and creates a verified hotfix folder, `.tar.gz` and `.sha256` inside **Release-Output** beside this guide. Nothing is uploaded or published automatically. The installer keeps its existing `ConquestOfAzerothSetup-<version>.exe` name.

For the recent fixes involving backend authentication and Discord persistence, choose **5**. This builds the launcher and Linux backend, then creates the full VPS archive using the existing packager. Its exact output path is printed in the console (in this project folder). Follow `PRODUCTION_DEPLOYMENT.md` and the migration note in `Conquest-Launcher-Backend/README.md`; database migrations are not executed by this menu.

- **2:** Compile the installer at the current version. Also retries failed builds.
- **3:** Create a launcher-only hotfix from the current build. Rejects stale source, mismatched hashes and invalid updater metadata.
- **4:** Compile the Linux backend. Previous output is retained as `deploy/linux-previous-*`.
- **6:** Increase the version in package.json and package-lock.json without building.
- **7:** Install/refresh locked npm dependencies. Internet may be required.
- **8:** Display Node/npm/.NET/tar versions and report missing tools.
- **9:** Open the hotfix output folder.
- **F:** Package existing fresh launcher/backend builds without compiling again.
- **D:** Open this guide.

If a build fails after changing the version, retry with **2**, then **3**. For full releases, retry the failed build with **2** or **4**, then use **F**. Do not increase the version again just to retry. Never publish different installer bytes under an already published version.

Each action stops on failure and writes a log in `conquest-launcher/manager-logs`. Never upload a folder marked `INCOMPLETE-DO-NOT-UPLOAD.txt`. The menu does not run test suites automatically.

Prerequisites: Windows x64, Node.js 22+ and npm, Windows tar, and .NET SDK 8 (or newer targeting net8.0) for backend builds. Windows administrator rights are normally unnecessary. Existing source protection, installer identity and signing settings remain controlled by the existing build scripts.

On Linux, upload the hotfix archive and checksum together, then follow its included `LAUNCHER_DEPLOYMENT.md`. The generated `PUBLISH-LAUNCHER.sh` verifies hashes, asks for your existing published directory and requires typing PUBLISH before updating the live feed. Run it with bash as documented. Full VPS packages use the existing deployment guide instead.

The manager was source-reviewed and syntax-checked without compiling, creating a real release, contacting the dedicated host or publishing an update.
