# Conquest Launcher

Desktop launcher and companion backend originally developed by **Duff (Duff-SPP)** for Conquest of AzerothCore.

This repository contains the current Electron frontend, .NET backend, integrated talent builder, pictures/icons/fonts/sound, tests, and Windows/Linux build and deployment tooling. It is a launcher project, not a game client or complete game-server distribution.

## License and credit

Original project code is licensed under **GPL version 3 only**, with reasonable author-attribution and origin notices under sections 7(b) and 7(c). See [LICENSE](LICENSE), the full [COPYING](COPYING), and [ATTRIBUTION.md](ATTRIBUTION.md).

Forks may rename/rebrand the launcher, change the interface and add their own author credits. Redistributed forks must preserve an accessible original-author credit, such as Settings > About, and clearly identify their modifications. GPL source-distribution obligations apply when distributing covered executables. Original credit: **Originally developed by Duff (Duff-SPP) as Conquest Launcher.**

Included third-party assets and dependencies retain their own rights. Read [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); the code license is not a blanket license to game art, fonts, trademarks or external services.

## Build on Windows

Install **Node.js 22+**, **.NET SDK 8** for backend compilation, Git and Windows `tar.exe`. Keep npm optional dependencies enabled; Koffi uses a prebuilt Windows x64 library. Open a terminal in the cloned repository:

```powershell
cd conquest-launcher
npm.cmd ci
cd ..
& '.\Launcher Manager.bat'
```

The root BAT opens the existing PowerShell manager:

| Option | Operation |
| --- | --- |
| 2 | Compile the Windows installer at the current source version |
| 3 | Package the existing fresh launcher build as a hotfix |
| 4 | Compile the framework-dependent Linux x64 backend |
| U | Compile and package an existing-install backend update |
| 7 | Install locked npm dependencies |
| 8 | Check prerequisites |

Builds/package creation stay local. Publication and VPS installation are separate actions. Windows installer output is in `conquest-launcher/dist/`; delivery packages are in `Release-Output/`. Neither belongs in Git.

See [BUILD_AND_RELEASE.md](BUILD_AND_RELEASE.md) and [LAUNCHER_MANAGER.md](LAUNCHER_MANAGER.md) for manual commands. The source metadata is 0.8.1; attribution/publication preparation changes are not a claim that an already-released 0.8.1 installer contains them. Use a new release version before distributing changed binaries.

## Configure your own project

The checked-in `conquest-launcher/launcher.config.json` describes the original project and contains public addresses only. Forks must point it at their own API, manifest, game realmlist, account pages and community links. A generic starting point is provided in `launcher.config.example.json`. Configure Electron identity, icons and the launcher update feed in `conquest-launcher/package.json` as well; changing only launcher.config.json does not change every installer/update identity.

Backend settings belong in environment variables, .NET user secrets, or an ignored local settings file. Use the supplied backend configuration examples; never commit real connection strings, OAuth secrets, SMTP passwords, signing keys or session files. Existing AzerothCore auth/characters databases are prerequisites. SQL under `Conquest-Launcher-Backend/sql/` is for an administrator to review; do not blindly apply example users/grants to an existing deployment.

### Authentication and 2FA

The launcher supports `/api/auth/login`, `/api/auth/session` and `/api/auth/logout`, with the contract in [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md). The original deployment routes auth/account requests to a **separate website service**. That website's source and its TOTP/recovery-code implementation are not part of this repository.

The bundled standalone backend has legacy SRP account login and **does not validate TOTP/recovery codes**. Do not expose it as a login provider for accounts requiring 2FA; use an authentication service implementing the documented contract. A frontend code field does not add server-side 2FA validation.

### Assets and addons

The integrated UI and builder assets are included in `conquest-launcher/public/`. The optional addon catalog has an intentionally empty, tracked directory; you do not need a private addon archive to build. Supply only addons and replacement branding/assets you are allowed to distribute. No Ascension.exe, Extensions.dll, game archives or player files are supplied.

## Development and checks

```powershell
cd conquest-launcher
npm.cmd start
npm.cmd test
```

Configure your own/local endpoints before signing in or downloading. Tests primarily use temporary fixture clients and mocked services; some production-bundle tests generate local transformed bundles. Manual smoke scripts can require compiled artifacts and are separate from ordinary source editing. The backend-update script fixture check requires Python 3 (`COA_TEST_PYTHON` can name its executable); it skips that check when no runtime is available. Actual Windows/Wine/game/VPS acceptance remains separate from tests.

## Deployment

For a new Ubuntu host, read [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) and review paths, domain names, SQL and service prerequisites before using `install-vps.sh`. That installer is specific to Ubuntu 26.04 x86_64 and existing Nginx/MySQL services.

For the original existing installation, read [UPDATE_0.8.1.md](UPDATE_0.8.1.md). `update-backend.sh --check` is the preflight mode; `--apply` replaces the backend and reviewed client-download routing with rollback files retained. Preserve any separate website authentication routing and private settings. Publish a working launcher upgrade before enforcing a new exact download version.

A version header is a compatibility barrier, not proof of an authentic binary or DRM. No source publication or local build deploys anything to a server.
