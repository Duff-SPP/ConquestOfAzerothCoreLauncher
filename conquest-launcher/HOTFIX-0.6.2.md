# Launcher 0.6.2 — preserve player files

This release includes the 0.6.1 launcher fixes and replaces blanket installer
cleanup with file ownership checks. No backend or game-client update is required.

## Behavior

- Uninstall removes only packaged files whose bytes still match the embedded
  SHA-256 ownership list. Modified and unrelated files remain in place. Empty
  packaged directories are removed without recursive deletion.
- Player AppData is preserved, including when an external uninstall command
  supplies `--delete-app-data`. Separate game folders, addons and account settings
  remain untouched. Server-side accounts are unaffected.
- Upgrade does not execute the 0.6.0/0.6.1 uninstaller. It overlays the new payload
  after preserving any differing existing payload files under
  `<launcher folder>/.coa-preserved/<unique folder>/`, with their relative paths.
  This can include older launcher binaries as well as player-modified files.
  These backups are intentionally retained after uninstall.
- Unknown files outside the incoming payload remain in their original location.
  If a destination is a linked folder/file, or a conflict cannot be backed up and
  verified, installation stops before extracting the new payload.
- Choosing a different installation location leaves the old folder intact. Do
  not run an old 0.6.0/0.6.1 uninstaller on a folder containing personal files.
  The new release cannot change an old uninstaller that is run independently.

The installer has no automatic option to delete personal data. Preserved files
can be removed manually by their owner after review. Never delete a player's
game folder as part of a launcher upgrade.

## Publish

Extract the ZIP into a new folder. From the directory containing
`launcher-release`, `release-tools` and `SHA256SUMS.txt`:

```bash
sha256sum -c SHA256SUMS.txt
sudo node ./release-tools/tools/publish-launcher.cjs ./launcher-release /srv/coa/published
curl -fsS https://launcher-api.coa-development.org/downloads/launcher/latest.yml
```

Continue only after all checksums pass. The public feed should show 0.6.2.
Use the host's actual published directory if it differs from `/srv/coa/published`.
Players can update directly from 0.6.0 or 0.6.1; the older launcher is not
uninstalled by the new installer. Test one real player upgrade before announcing.
No live deployment is performed by preparing this archive.

## Local validation

The native NSIS smoke test compiles and runs the production preservation macros
against disposable fixtures. It verifies conflicting-file backups, custom files,
account settings, modified packaged files, linked-folder refusal, and selective
uninstall. The source regression test verifies template pinning, Unicode ownership
paths, and removal of the legacy uninstall and AppData deletion paths.
The standard launcher regression suite covers the prior 0.6.1 fixes.

Full production upgrade and uninstall acceptance remains a host/player test;
the local tests do not uninstall a real player's application.

## Build maintenance

`tools/installer-ownership.cjs` runs after Windows executable resource editing
through the electron-builder afterSign hook. It hashes the final payload and
generates pinned NSIS integration files in `build/`. If the upstream templates
change, the build fails until their preservation integration has been reviewed.
Keep `signAndEditExecutable` enabled so that this hook runs. Do not distribute an
installer from a bypassed/manual NSIS build using a stale ownership list.
