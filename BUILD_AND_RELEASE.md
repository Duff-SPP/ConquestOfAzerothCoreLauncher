# Build and release — owner instructions

Run these commands on the Windows build machine. The host follows **PRODUCTION_DEPLOYMENT.md**, which is included in every newly generated VPS archive. Building and packaging do not publish updates or deploy the VPS. Do not reuse historical archives or update BATs.

## Quick handover checklist

1. Choose a new launcher version for a changed release, then run the checks below.
2. Publish the backend for Linux using the command below and a fresh output folder. `npm.cmd run build` does not compile the backend.
3. In `conquest-launcher`, run `npm.cmd run build` to create the Windows installer and update metadata.
4. In that same folder, run `npm.cmd run package:vps`. Use the exact new archive path printed on success; stop if either command fails.
5. Inspect that archive and complete the applicable local acceptance checks below. Provide the host with the handover contents described next; the host completes live acceptance checks after deployment.

## What goes in the ZIP you send the host

Create a new empty handover folder and copy only:

```text
Conquest-Handover/
  PRODUCTION_DEPLOYMENT.md
  BUILD_AND_RELEASE.md
  Conquest-Launcher-VPS-<version>-<timestamp>.tar.gz
  master-client/                 # complete production game client, first installation
    Ascension.exe
    ...all required game files and production MPQs...
```

Replace `<version>` and `<timestamp>` with the actual newly generated filename. Copy these guides from this project folder after the build; they are also inside the generated archive. ZIP this handover folder using a large-file-capable ZIP tool. Keep the `.tar.gz` inside it unchanged. For a large client, transfer `master-client` separately and tell the host where it is; it does not have to be inside the ZIP. Do not include player accounts, saved sessions or personal settings in the production client.

Do not ZIP the entire workspace. Source folders, `node_modules`, `win-unpacked`, old installers/archives, backups, patch BATs, test output, ReadBridge and the website are not needed. Do not include `appsettings.Local.json`, populated `backend.env`, database passwords or Discord secrets. Exchange required private settings separately with the administrator.

Players receive only `ConquestOfAzerothSetup-<version>.exe` (or the published stable installer download). They do not need the VPS archive, metadata files or separate launcher resource folders. The host needs the complete `launcher-release` bundle included in the archive, not just the EXE, to publish self-updates.

For later launcher/backend updates, a fresh VPS archive and these guides are sufficient; an unchanged master client need not be resent. For game-only updates, supply the updated production client or an exact changed/deleted-file list with the replacement files, so the host can produce a complete correct master before publishing.

## Windows prerequisites

- Node.js **22 or newer** and its bundled npm; use `npm.cmd` in PowerShell. Node is required for release scripts. Production Electron embeds its own runtime.
- Launcher 0.7.9 adds Koffi for native process detection without PowerShell. Refresh dependencies with `npm.cmd ci` before compiling. Keep optional dependencies enabled: `@koromix/koffi-win32-x64` contains the prebuilt Windows library. The build configuration unpacks it for Electron; no new C++ helper needs to be compiled.
- **.NET SDK 8.0** (latest servicing release), or a newer SDK capable of targeting net8.0. The VPS needs only the ASP.NET Core 8 runtime.
- Windows x64, internet for NuGet/npm and electron-builder's NSIS tooling, and `tar.exe` (included in current Windows). The current packages do not require a separately configured Visual Studio C++ toolchain. electron-builder downloads its own NSIS tools.
- Check `node --version`, `npm.cmd --version`, `dotnet --list-sdks`, `tar --version`.
- Unsigned PTR builds are supported; the existing `win.signExecutable=false` setting is intentional. Windows may show Unknown Publisher/SmartScreen. Signing and reputation are separate release decisions; do not instruct players to disable Windows security.

Open PowerShell in:

```powershell
Set-Location 'C:\Users\Andreas\Desktop\acension\Newest Conquest-Launcher'
```

## Version and lightweight checks

Current launcher version is in `conquest-launcher/package.json`, mirrored in `package-lock.json`. Backend version is in `Conquest-Launcher-Backend/Conquest.Launcher.Backend.csproj` and `/health` in `Program.cs`.

For every materially changed installer, increment before building. This command increments the patch version; run it once per new release, not for each retry:

```powershell
Set-Location conquest-launcher
npm.cmd version patch --no-git-tag-version
```

Keep backend version/health aligned when releasing backend changes. Never replace an already-published installer with different bytes at the same version. Stable application ID remains `com.conquestofazerothcore.launcher`; do not change it for upgrades.

```powershell
npm.cmd ci
npm.cmd test
```

Tests create small disposable fixtures; they do not publish your real client. Additional UI/compiled-backend smoke tools are in `tools/` but do not replace a real player acceptance test.

## Build backend for local preview

From the primary project folder:

```powershell
dotnet restore .\Conquest-Launcher-Backend\Conquest.Launcher.Backend.csproj
dotnet build .\Conquest-Launcher-Backend\Conquest.Launcher.Backend.csproj -c Debug --no-restore
```

This updates `Conquest-Launcher-Backend/bin/Debug/net8.0/Conquest.Launcher.Backend.exe` used by `OPEN FULL LOCAL PREVIEW.bat`. Stop the previous local backend before rebuilding. Local config is `appsettings.Local.json`, loaded only in Development; keep credentials private. No live database migrations run automatically.

## Publish backend for Ubuntu

Use a **fresh output directory** to avoid leftover self-contained files from old releases. If `deploy/linux-x64` already exists, rename it first to a unique archive name outside `deploy/linux-x64`; do not merge old outputs into the new directory.

```powershell
dotnet publish .\Conquest-Launcher-Backend\Conquest.Launcher.Backend.csproj -c Release -r linux-x64 --self-contained false -p:UseAppHost=false -o .\Conquest-Launcher-Backend\deploy\linux-x64
```

Expected: `Conquest.Launcher.Backend.dll`, `.deps.json`, `.runtimeconfig.json`, dependencies and `wwwroot`. Runtime/private appsettings are excluded. The Linux service runs `/usr/bin/dotnet /opt/coa-launcher-backend/Conquest.Launcher.Backend.dll`; `install-vps.sh` installs ASP.NET Core 8 if absent.

## Build Windows launcher / NSIS

From `conquest-launcher`:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npm.cmd ci
npm.cmd run build
```

The exact package script is `electron-builder --win nsis --x64 --publish never && node tools/prepare-release.cjs`. It creates:

- `dist/ConquestOfAzerothSetup-<version>.exe`
- its `.exe.blockmap` and electron-builder `dist/latest.yml`
- `dist/launcher-release/` containing those three files and hash-verified `launcher-release.json`
- `dist/release-tools/` for the existing publisher/menu scripts

`build:dir` makes only an unpacked launcher; it is insufficient for release preparation. Native addons are copied from `src/assets/AddonCatalog` into packaged resources. No website/backend secrets belong in this directory.

## Create a fresh VPS archive

After both builds and the applicable local checks below, from `conquest-launcher` (live VPS checks follow deployment):

```powershell
npm.cmd run package:vps
```

`tools/package-vps.cjs` validates hashes/version, rejects artifacts older than source, checks framework-dependent backend output, and stages an allowlist of current artifacts. It creates a new `Conquest-Launcher-VPS-<version>-<timestamp>.tar.gz` in the primary project folder. Staging is retained under `dist/vps-current-*` for inspection.

The archive contains `backend/deploy/linux-x64`, `backend/ubuntu`, `backend/sql`, `release-tools`, `launcher-release`, `install-vps.sh`, and both primary guides. It excludes ReadBridge, real configs, historical patches, master/client data, test output and source node_modules. Inspect it with `tar -tzf <archive>` before uploading. Follow **PRODUCTION_DEPLOYMENT.md** next.

## Publish client manually on VPS

Complete uploads first; do not alter the master during either command:

```bash
sudo node /srv/coa/release-tools/tools/validate-master.cjs /srv/coa/master-client
sudo node /srv/coa/release-tools/tools/publish-client.cjs /srv/coa/master-client /srv/coa/published REPLACE_WITH_NEW_CLIENT_RELEASE
```

Replace `REPLACE_WITH_NEW_CLIENT_RELEASE` with a unique release name each time, such as a date and sequence number. The publisher hashes the master, verifies/reuses existing immutable objects, checks actual free disk space for new objects plus 512 MiB, copies only missing objects, rechecks the master, validates the manifest, and atomically changes `client/latest.json`. It never modifies the master. If interrupted, latest remains the previous valid release; unused immutable objects are harmless. Remove `.publish.lock` only after confirming no publisher process remains.

## Publish launcher manually on VPS

From the freshly extracted archive directory:

```bash
sudo node /srv/coa/release-tools/tools/publish-launcher.cjs ./launcher-release /srv/coa/published
```

This checks hashes, stores immutable versioned installer/blockmap, and generates `launcher/latest.yml` for the generic electron-updater feed. It also atomically replaces the stable hard-linked `launcher/ConquestOfAzerothSetup.exe` for new players. Website download link:
`https://launcher-api.coa-development.org/downloads/launcher/ConquestOfAzerothSetup.exe`.

## Required manual acceptance checks after compilation

- Install EXE; verify Desktop/Start Menu shortcuts and Windows Installed Apps entry. Install a later version over it; verify settings and identity survive.
- Packaged launcher ignores `COA_LOCAL_TEST=1` and `COA_DOWNLOAD_DEMO=1`; it uses real manifest downloads. Local preview keeps the ten-minute game demo.
- Local preview: choose a separate writable client/test folder through **Locate game**, open Addons, install/uninstall and refresh. Real files must appear under `Interface/AddOns` even with the game demo enabled.
- Verify missing hard dependency blocks; available dependency plan is shown; OptionalDeps does not block; reverse dependency prevents removal.
- Register with Turnstile disabled, log in, restart launcher to verify session, show account/characters, sign out. Stop the public website during a test: launcher core must still work.
- Discord: connect in system browser, approve, refresh if needed, verify CONNECTED, unlink; database history remains. Test cancel/expired callback and already-linked account.
- New empty game directory: download real fixture or published client, pause/restart/resume, confirm hash validation, then Play launches **Ascension.exe**. No simulated success may enable Play for a nonexistent executable.
- Publish changed/missing files: startup shows UPDATE without downloading; click to apply. Corrupt one managed file in a disposable client and repair. Keep manual addons, WTF, Screenshots and catalog addons unchanged.
- Close the game before file mutations. Restart & Update is user initiated and must not terminate the game.
- Uninstall the launcher: the separate client, AddOns, WTF and Screenshots remain. Never place a client inside the launcher installation directory.
- Check backend starts, archive contents, no private configs/secrets, HTTPS feed/latest.yml/blockmap/range downloads. Test Linux service after reboot.

Record the delivered archive filename, launcher/backend versions, build/test date and acceptance results with the handover. Mark unperformed checks as pending and assign live checks to the host. Historical source checks do not certify this delivery. Editing these guides does not rebuild existing archives or verify a deployed environment.
