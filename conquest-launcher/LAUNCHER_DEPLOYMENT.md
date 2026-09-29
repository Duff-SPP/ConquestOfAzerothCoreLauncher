# Launcher 0.6.8 deployment

This is a launcher-only update for the existing dedicated Linux host. It contains the installer, blockmap, feed, release descriptor and dependency-free Node.js publishing tools. It does not update the backend, game client or player data. Node.js 22+ and tar are required. No npm installation is needed.

Upload `Conquest-Launcher-Deployment-0.6.8.tar.gz` and its `.sha256` file into the same directory on the dedicated machine. Then run:

```sh
sha256sum -c Conquest-Launcher-Deployment-0.6.8.tar.gz.sha256
mkdir -p "$HOME/coa-launcher-0.6.8"
tar -xzf Conquest-Launcher-Deployment-0.6.8.tar.gz -C "$HOME/coa-launcher-0.6.8"
cd "$HOME/coa-launcher-0.6.8"
sha256sum -c SHA256SUMS.txt
sudo node ./release-tools/tools/publish-launcher.cjs ./launcher-release /srv/coa/published
curl --fail --silent --show-error https://launcher-api.coa-development.org/downloads/launcher/latest.yml
```

The `sudo node` command is the publishing step: only run it when ready to release. It verifies the installer and blockmap hashes, publishes immutable versioned files and updates the feed. The feed must report version `0.6.8`, path `ConquestOfAzerothSetup-0.6.8.exe`, and the SHA-512 in the included release descriptor. Existing launchers use the same app ID, feed and installer identity and offer Restart & Update.

If different 0.6.8 bytes have already been published, the publisher refuses to overwrite them. Do not delete published versioned artifacts to bypass this; build a new version instead. The live feed observed during acceptance preparation was 0.6.1.

This package does not require a backend restart, service installation, game republish or installation-folder wipe. Retain existing `/srv/coa` permissions and deployment configuration. Code signing remains unconfigured, as in the existing build; this release is unsigned.
