# Publishing a launcher update

This is a launcher-only handoff for an existing Linux host. It contains the installer, blockmap, feed, release descriptor and Node.js publishing tools. It does not update the backend, game client or player data. The host needs Node.js 22+ and tar; no npm installation is needed there.

## Create the handoff on Windows

Compile a new launcher version with the BAT manager, then use **option 3** to create its hotfix archive and `.sha256` sidecar. Never publish changed binaries under an already released version.

## Publish a manager hotfix

Upload the exact archive and sidecar created by the manager. Verify the sidecar and extract the archive using the filenames printed by the manager. Enter its extracted folder, read its generated `LAUNCHER_DEPLOYMENT.md`, and run:

```bash
sudo bash PUBLISH-LAUNCHER.sh
```

The script verifies the payload, asks for the existing published downloads directory and requires the operator to type `PUBLISH`. Its default `/srv/coa/published` is specific to the original deployment: use your actual configured directory.

## Publish an older deployment-tool bundle

A bundle created by `tools/package-launcher.cjs` has the same `launcher-release` and `release-tools` directories but may not have a publishing wrapper. From the extracted bundle:

```bash
sha256sum -c SHA256SUMS.txt
sudo node ./release-tools/tools/publish-launcher.cjs ./launcher-release /srv/coa/published
```

The `sudo node` command publishes the release. Adapt the destination before running it. It verifies installer/blockmap hashes, refuses conflicting bytes under an existing version, publishes immutable versioned files, and updates the feed and stable installer alias. It sets public file permissions explicitly.

## Verify and preserve the deployment

Check your own launcher's HTTPS update URL. For the original project:

```bash
curl --fail --silent --show-error https://launcher-api.coa-development.org/downloads/launcher/latest.yml
```

The feed's version, installer filename and SHA-512 must match the included `launcher-release/launcher-release.json`. Confirm the installer and blockmap can be downloaded, then test an installed player's update flow. Keep existing app/feed identity compatible where an in-place update is intended.

Launcher publication does not require a backend restart, game republish or installation-folder wipe. Preserve the existing Nginx configuration and private settings. Keep launcher update files publicly readable so older launchers can upgrade before enforcing a new client-download version. Backend updates are separate; see the repository's `UPDATE_0.8.1.md` and `PRODUCTION_DEPLOYMENT.md`.
