# Launcher 0.6.6 - five reliability fixes

1. Manual repair of launcher-owned addons now backs up modified files under <game>/.coa-launcher/preserved-addons/<sha256>/Interface/AddOns before replacement, verifies backup contents, and refuses replacement if verification fails. Successful repair reports preserved files. Player-managed addons remain protected from adoption/replacement.
2. A failed realm setup after client application now emits an error instead of leaving the UI in Finalizing. A later successful retry reaches Ready.
3. Addon inventory is tied to the selected client folder. Folder selection clears cached inventory; stale in-flight responses are discarded.
4. Existing loose addon dependencies are reused without catalog replacement or ownership adoption; their declared dependencies are still checked. This is not a guarantee of runtime compatibility and does not inspect dependencies inside MPQ archives.
5. Unreadable or damaged addon ownership metadata allows inventory scanning with a warning and disabled management. The record is not overwritten or discarded. Repairing ownership is a separate operation.

Automatic addon installation remains disabled. Existing player files and earlier backups are retained. Downloader and uninstaller protections remain included.

Validation: all 47 automated tests and the isolated Electron desktop check passed. Tests cover every issue, backup failure safety, retry, stale scan results, dependency preservation and read-only fallback. No live deployment or real in-game acceptance test was performed.

Unresolved earlier reports: the in-game bug-report failure and 86.7 GB resume jump are not claimed fixed by this release.

## Publish

Extract into a new directory. From the folder containing launcher-release and release-tools:

```bash
sha256sum -c SHA256SUMS.txt
sudo node ./release-tools/tools/publish-launcher.cjs ./launcher-release /srv/coa/published
curl -fsS https://launcher-api.coa-development.org/downloads/launcher/latest.yml
```

Only publish after all checksums pass. The launcher feed should show 0.6.6. This does not publish or change the game client patch; use the separate client release process for that.
