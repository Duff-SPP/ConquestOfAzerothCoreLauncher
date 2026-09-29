# P0 source validation — 18 September 2026

Source/configuration/scripts updated for the 0.6.0 release candidate. This is not a compiled or deployed release certification.

## Lightweight checks completed

18 focused Node tests passed:

- Client updater: 8 (installation, incremental changes, repair, owned-file removal, player-data preservation, range resume, corrupt-download rejection, rollback, unsafe paths, immutable publishing, changing-master rejection and realm configuration).
- Launcher publishing: 1 (verified immutable release files, metadata and stable installer).
- Portal: 2 (login/logout, concurrent saved-session restoration and CAPTCHA-free PTR registration request).
- Addon P0: 4 (dependency order/deduplication, optional metadata, missing dependencies/cycles, ownership, manual reverse dependencies, junction rejection and injected-failure rollback/retry).
- Existing addon suite: 3 (catalog grouping, install/uninstall and required dependency protection).

Eleven changed JavaScript files passed `node --check`. Both Ubuntu installer scripts passed `bash -n`.

Tests used disposable fixture folders and mock/local HTTP responses. They do not prove production MySQL, Discord OAuth or Linux service behavior. Current catalog inspection found 69 packages containing 143 active addon folders, including Ascension packages.

## Changes covered

- Independent launcher account backend; PTR Turnstile requirement disabled; database failures no longer masquerade as wrong passwords; saved-session startup race fixed.
- Game updates check at startup and wait for player action; repair retains full verification; packaged launcher cannot enable the local game download simulation.
- Local-preview addons use the real catalog/service and a separately selected writable test client. Dependencies are planned before mutation and file ownership/transactions protect player content.
- Client publishing validates/hash-checks immutable objects and disk space; launcher publishing provides a stable installer download URL.
- Current-source VPS package tool, restricted SQL guidance, Ubuntu deployment scripts and manual release guides.

## Still mandatory before public release

Follow **BUILD_AND_RELEASE.md**, then **PRODUCTION_DEPLOYMENT.md**. Compile the C# backend, build/package Electron and NSIS, inspect the fresh archive, configure private credentials/DNS/HTTPS, deploy, publish and complete their end-to-end acceptance checklist. C# compilation, Windows installation/self-update, real database authentication, Discord OAuth and Ubuntu runtime operation have not been executed in this task.

Inspect the production MPQ copy manually for embedded addon duplicates; publishing does not inspect MPQ contents. Legacy/unmanaged loose addons are deliberately not adopted or deleted automatically.

No production binaries or deployment archive were created. The website and protected `C:\Azerothcore\ConquestOfAzerothCore` reference were not modified. No real database writes, production client publishing or VPS changes were performed.
