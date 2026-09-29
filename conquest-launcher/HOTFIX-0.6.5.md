# Launcher 0.6.5 - player addon inventory

Supersedes the automatic mandatory-addon behavior introduced in 0.6.3. The required client addons are now supplied through the restored client patch, as requested. Publish that corrected client through the normal client release process separately; this launcher package does not modify or republish patch-B.mpq.

- Client installation, update and launch no longer synchronize mandatory addons. The mandatory repair button and IPC endpoint are removed.
- Existing loose addon files and previous backups remain untouched. This release does not remove addon folders left by earlier launcher versions. Such folders may still override files from the restored patch; review them manually if a client remains affected.
- Installed addons scans Interface/AddOns, including player addons outside the catalog and folders without readable TOCs. Linked/inaccessible folders are identified without following them.
- Catalog file differences are labeled Differs from catalog, not Update available. A difference does not establish that the catalog version is newer or better.
- Player-managed folders have no launcher install/replacement/uninstall controls. Scan does not adopt ownership. Existing launcher-managed addons retain explicit manual management.
- The inventory does not read MPQ archives or determine whether an addon is enabled/loaded in-game. Patch-provided addons are therefore not individually listed unless also present as loose folders. No compatibility certification is implied by finding a folder.
- Core updater reliability and safe launcher uninstaller behavior are retained.

Validation: 42 automated tests and the isolated Electron desktop check passed. The desktop check confirms a fresh client installation creates no addon folder, custom addons appear under Installed addons, and the mandatory-install control is absent. Installer built locally; not deployed.

## Publish

Extract into a new directory and run from the directory containing launcher-release and release-tools:

```bash
sha256sum -c SHA256SUMS.txt
sudo node ./release-tools/tools/publish-launcher.cjs ./launcher-release /srv/coa/published
curl -fsS https://launcher-api.coa-development.org/downloads/launcher/latest.yml
```

Continue only if checksums pass. The launcher feed should show 0.6.5. Use your actual publication directory if different. Publishing the launcher does not publish the restored client patch.
