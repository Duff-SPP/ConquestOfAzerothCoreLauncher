# Launcher reliability QA — 2026-09-27

## Scope and baseline

Read the complete 0.6.6 handoff. Targeted checks only; no deployment, real game launch, public bug submission, full-client download, or protected client/server changes.

The supplied current source folder has no Git metadata, so no HEAD commit can be certified. It started at 0.6.6. The earlier 0.6.6 installer, blockmap, latest.yml and prepared launcher-release bundle exist; installer and blockmap match their saved SHA-512 hashes. No separate 0.6.6 hotfix/VPS handover archive was found. New runtime changes use 0.6.7 to preserve the old artifact.

All five prior reliability fixes remain present and pass: verified backups before edited addon replacement; actionable realm error and successful retry; folder-change inventory refresh and stale-result discard; manual dependency reuse without adoption, including transitive validation; corrupt/unsafe ownership metadata remains readable but blocks mutations and preserves files/metadata.

## Downloader, finalization and WowError

The reported 86.7 GB doubled total was not reproduced in the supplied source. No accounting rewrite was needed. Before and after this work the network denominator is the sum of unique changed object sizes, not cached bytes plus full sizes. Completed unique objects plus the current object's absolute offset form the numerator. Verification and staging have separate denominators and labels; staging counts destination copies, which can differ from unique network bytes.

The new 2 MiB fixture pauses with exactly 1,048,576 partial bytes. After a fresh updater instance replans, HTTP 206 starts at 1,048,576; total remains 2,097,166 bytes (2 MiB plus the 14-byte patch), with 1,048,590 remaining at that point. HTTP 200 fallback truncates the old partial, reports zero for that file and keeps the denominator unchanged. The fallback test asserts the reset and aggregate bounds.

Partials live under `.coa-launcher/downloads/<sha256>.part`. A short partial resumes at its length; its prefix is not trusted until the complete SHA-256 passes. A corrupt prefix fails the final hash, is discarded, then downloads from zero. Full cached objects are hashed before reuse. Oversized partials are discarded. Staging is cancellable and reuses verified cached objects after restart. The implementation copies verified objects to transaction staging paths, then renames staged files to their destinations; it does not rename each `.part` directly onto a client file. Completed cache objects are cleaned up after commit; failure to remove redundant cache files is best-effort, but required final files must exist.

Tests cover network pause, restart, 206, 200 fallback, corruption, invalid ranges, deduplicated totals, staging pause, commit rollback and retry. A simulated EPERM on the final WowError rename restores the existing copy, emits error rather than ready, and succeeds on retry. This is fault injection, not a live antivirus/file-lock test.

Manifest `2026-09-26-08` publishes `WowError.exe`, 205,824 bytes, SHA-256 `a1a159d1f2e81e933533dcf24d045d701607192107d6f172da3b0d168df4eed6`. The public object was fetched read-only and matches both. It completes normally in fixtures. No file-specific defect was found; a stale last filename during post-processing is consistent with the report, but the original player's incident cannot be proven from this source.

Update readiness follows verification, staging, applying, state commit and cleanup. Tests verify every final manifest hash, Ascension.exe existence and absence of remaining fixture partials. Main-process update readiness is deferred until realm setup succeeds. Launch rechecks the release and configures the realm before spawning. Desktop checks confirm all active phases disable Play and reserve 100% for ready. No arbitrary waits were added.

## Other findings

- **In-game bug reports:** the local Help UI adapter uses COABUG self-whispers only on exact realm `AzerothCore`; server module `mod-ascension-compat` persists reports and a separate relay submits them to GitHub. The module defaults disabled. Evidence: launcher catalog `Ascension_HelpUI/BugReport/LocalGitHubBugReport.lua` and server `modules/mod-ascension-compat/docs/github-bug-reports.md` / `src/CoABugReport.cpp`. The original Ascension path remains on other realms. Launcher report UI instead opens a prefilled GitHub draft because submitUrl is empty. Player failure remains unconfirmed: need exact UI/error, actual loaded overlay/realm and deployed module/relay status. No backend, credentials, live queues or player files were changed; no report was submitted.
- **Compatibility:** added optional `minimumLauncherVersion` validation, numeric stable-version comparison, pre-download rejection and cached-fallback enforcement. Publisher CLI accepts an optional final minimum-version argument. No current release minimum was imposed. Older binaries ignore this new field; roll out supporting launchers before relying on it, and use a new schema for genuinely incompatible formats. See RELEASING.md.
- **Addons:** loose Interface/AddOns inventory includes custom/manual/no-TOC folders. Catalog match and ownership remain distinct. Differing copies are labeled as differing. Custom files are not adopted, replaced or removed automatically. Hard dependencies can reuse custom providers. Automatic addon installation remains removed from update/Play, with empty mandatory lists. Legacy opt-in service tests remain. MPQ members are not individually inventoried.
- **Ownership:** malformed JSON and unsafe paths already have coverage. Missing metadata means no ownership claim; existing manual files still cannot be overwritten. Damaged metadata makes inventory read-only and is preserved.
- **Repair/update:** only manifest-managed content is restored. Obsolete formerly managed files are removed only if still unchanged; modified obsolete files are preserved with a warning. Expanded fixture proves manual addons, WTF/SavedVariables, screenshots, unrelated helpers, unmanaged wrappers and renamed backups survive update and repair.
- **WB1:** the public manifest requires `Data/patch-WB1.MPQ`, 2,001,890,268 bytes. Restoring that canonical file is intended, including when a player has renamed/disabled another copy. No duplicate canonical entry was found; renamed copies remain unmanaged.
- **Graphics:** public manifest manages `d3d9.dll` (4,284,430 bytes), `dxgi.dll` (3,014,670 bytes), and `dxvk.conf` (129 bytes). Deleting or modifying them triggers normal manifest restoration. Low-end compatibility therefore needs a client-release decision, not automatic wrapper deletion on Play. Unmanaged wrappers are preserved.
- **Parsec:** environment troubleshooting only; no service/process manipulation. Addon submission remains future work.
- **Diagnostics:** existing UI differentiates checking, download/range, hash, staging, apply/finalization, disk space, ownership and realm errors. Filesystem failures include their native error/path. No persistent client-update log sink was found in the inspected updater/status path; capture the exact displayed error and phase for PTR. No new logging system was introduced.

## Changes and verification

Runtime/tool files: `src/release-format.cjs`, `src/client-updater.cjs`, `tools/publish-client.cjs`. Version files: `package.json`, `package-lock.json`. Documentation: `RELEASING.md`, this report. Tests: `test/client-updater.test.cjs` (four new tests: restart/206 accounting, corrupt partial, blocked rename, compatibility; expanded 200 fallback, finalization and preservation assertions). Read-only public manifest snapshot: `dist/qa-published-manifest.json`.

Focused tests passed per issue. Full automated suite ran once: **51 passed, zero failed**, retaining the 47 existing tests. Node's sandbox child-process restriction was avoided with `--experimental-test-isolation=none`; no tests were dropped. Desktop smoke passed with disposable files after the initial sandbox launch was blocked and the authorized retry launched Electron. Screenshots: `C:/Users/Andreas/AppData/Local/Temp/coa-desktop-75O48W`.

Final NSIS build completed once with `--publish never`: `dist/ConquestOfAzerothSetup-0.6.7.exe`, blockmap and hash-verified `dist/launcher-release`. Final handover packaging completed once: `../Conquest-Launcher-VPS-0.6.7-1790515007200.tar.gz`. Packaging verified launcher hashes, source freshness and the existing unchanged framework-dependent backend output. Archive listing was inspected for current release/tools and excluded private appsettings, node_modules, ReadBridge and master-client data. No backend rebuild was necessary. Nothing was deployed.

## Remaining real-player PTR acceptance

Reproduce long-download pause/resume on a slow disk/network and actual Windows security software; test true locked-file recovery, installer upgrade/uninstall and a real game launch; verify low-end graphics with the official wrapper files; diagnose the player's exact in-game report failure and perform an explicitly authorized end-to-end submission. Disposable automated checks do not certify these live cases.
