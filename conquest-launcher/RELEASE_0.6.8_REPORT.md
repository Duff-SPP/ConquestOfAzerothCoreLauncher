# Launcher 0.6.8 handoff

Built locally; nothing published. Further acceptance testing was stopped at the user's request.

## Changes

- Corrected installer ownership generation and NSIS combined installer/uninstaller compilation. Early includes use already-defined product names; the process check does not redeclare upstream globals or kill processes by directory prefix.
- Uninstall removes exact compiled launcher-owned paths even when modified. Locked files abort removal and retain registration. Partial removal can be retried without requiring the executable/ASAR to remain. Unknown files, .coa-preserved and player AppData remain. No recursive installation-directory removal.
- The uninstaller retains its own original directory instead of accepting a registry redirection. Registration cleanup follows successful file removal and checks the installation identity.
- Fixed smoke-test path escaping and comment-based false positives. Added a disposable production acceptance script with registry/shortcut backup and restoration.
- Added a launcher-only Linux handoff packager and deployment instructions.

Primary files changed: build/preserve-files.nsh; tools/installer-ownership.cjs; tools/installer-safety-smoke.cjs; test/installer-ownership.test.cjs; tools/installer-production-acceptance.ps1; tools/package-launcher.cjs; tools/desktop-smoke.cjs; test/desktop-harness.cjs. Generated build/safe-*.nsh, build/safe-installer.nsi and build/coa-*.txt were refreshed. Deployment/report documentation was added.

## Validation and limits

- Full automated suite: 53/53 passed. Focused installer tests and disposable NSIS safety smoke passed, including same-folder upgrade, modified-file deletion, self-removal, preservation, locked-file registration retention and partial-uninstall retry.
- Protected-bundle desktop smoke passed on retry after an initial window timeout; diagnostic capture was added.
- Final Windows NSIS installer and blockmap built successfully after correcting duplicate-variable and unused-code compilation failures.
- Installer payload extracted and app.asar extracted. Its 228 files include only runtime/a.cjs, runtime/b.cjs and public/c.js as first-party scripts. No source maps or clean src tree. Other roots are public assets, package.json, launcher.config.json and external node_modules.
- esbuild minification and selective renderer javascript-obfuscator protection remain intact. Main/preload/renderer and IPC boundaries are preserved. Embedded ASAR integrity verified. RunAsNode, EnableNodeOptionsEnvironmentVariable and EnableNodeCliInspectArguments are false; EnableEmbeddedAsarIntegrityValidation and OnlyLoadAppFromAsar are true.
- Real production acceptance is INCOMPLETE, not passed. The 0.6.1 launcher installed and ran. An initial deeply nested fixture hit backup-path limitations and safely aborted upgrade. A shorter-path rerun stopped because the old launcher's graceful close timed out. No completed real 0.6.1-to-0.6.8-to-uninstall result is claimed. Testing stopped at the user's request. Original registry entries/shortcuts were restored and remaining disposable test processes stopped.
- Existing app ID, executable identity, update feed and NSIS updater integration remain unchanged. Automated upgrade coverage passed; real end-to-end upgrade acceptance remains unverified. No installation folder was manually wiped. Code signing remains unconfigured.

## Small changelog, 0.6.1 through 0.6.8

- 0.6.1: folder selection/install-flow fixes; preserve MemoryBridge.log; smoother Update-to-Play flow.
- 0.6.2: launcher file ownership and safe preservation during install/uninstall; conflict backups.
- 0.6.3: automatic required-addon installation, later superseded by 0.6.5.
- 0.6.4: clearer download/preparation phases, progress accounting, cancellation and resume handling.
- 0.6.5: player addon inventory; removed automatic required-addon synchronization; custom addons remain player-owned.
- 0.6.6: addon backup/recovery, dependency handling, stale-inventory and realm-setup retry fixes; damaged ownership handled safely.
- 0.6.7: opt-in minimum launcher compatibility and downloader regression coverage.
- 0.6.8: production source protection plus installer/uninstaller ownership, locking, registration and build fixes described above.
