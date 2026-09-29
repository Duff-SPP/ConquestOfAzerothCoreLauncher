# Launcher 0.6.3 - mandatory addons

Includes the 0.6.1 client fixes and 0.6.2 installer preservation changes.

- Automatically installs/updates 53 mandatory addon folders after client installation/update and before launching an existing client.
- Includes all 17 supplied Blizzard interface folders. Ascension_RotationStudio is excluded because it only supplies a development TOC.
- Adds an Install / repair mandatory addons button and prevents removing mandatory packages through the launcher.
- Installs from the bundled catalog. New catalog content requires publishing a new launcher build.
- Identical files are not rewritten. Differing unowned or player-modified addon files are backed up under <game>/.coa-launcher/preserved-addons/<hash>/Interface/AddOns before replacement. Account settings and unrelated files are preserved.
- Mandatory folders are explicitly listed in launcher.config.json. Blizzard_TalentUI is an explicit asset-only folder, copied exactly as supplied without inventing a TOC.
- This installs files; it does not change the player's in-game addon enabled flags.

## Publish

Extract the ZIP to a new directory on the dedicated server. Open a terminal in the directory containing launcher-release, release-tools and SHA256SUMS.txt, then run:

```bash
sha256sum -c SHA256SUMS.txt
sudo node ./release-tools/tools/publish-launcher.cjs ./launcher-release /srv/coa/published
curl -fsS https://launcher-api.coa-development.org/downloads/launcher/latest.yml
```

Continue only if checksums pass. The public feed should show version 0.6.3. Use the actual published directory if different. This publishes a launcher update; no client publishing command or backend replacement is needed.

## Validation

36 automated tests passed, including dependency resolution, mandatory uninstall protection, repeat installs, modified-file backups, missing-package errors and the real 53-folder catalog. An isolated Electron desktop smoke test installed the real mandatory catalog into a temporary client, checked Blizzard assets and RotationStudio exclusion, and displayed the repair button. Windows installer build succeeded.

Real in-game loading, particularly the supplied asset-only Blizzard_TalentUI folder, and a production player upgrade remain acceptance checks. No live deployment was performed.
