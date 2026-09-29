# Windows launcher hotfix 0.6.1

This is a launcher and publishing-tools update. It contains no backend, database,
game executable or MPQ changes. Linux launcher support is not included.

## Changes

- Both game-folder pickers accept empty folders or existing clients. An invalid
  saved path no longer prevents choosing a replacement. The destination is
  tested for metadata creation, writing, renaming and deletion before saving it.
  Permission errors explain which folder failed and how to choose another.
- MemoryBridge.log is player-owned. New publications exclude it; the new launcher
  also ignores it in old published manifests and local state, preserving the log.
  Interrupted transactions from older launchers can still recover.
- Clicking the main Update/Play button completes the update and then launches.
  Updates first discovered by Play follow the same flow. Explicit Scan & Repair
  remains a maintenance action and does not launch the game.
- Download preparation has a separate progress phase, with byte progress and
  pause support. Previously, the full client was copied into staging while the
  screen still showed the final download at 100%. This can take several minutes
  for a 39 GB installation. The new phase reports this work; it does not eliminate
  the staging copy or guarantee that a slow disk finishes immediately.
- Free-space checks account for already-cached download bytes and shared objects.
- Invalid local state contents trigger a fresh scan instead of blocking repair.
- If the update service is unreachable or returns HTTP 5xx, Play can verify all
  managed files against a saved release and launch that intact client. Missing,
  damaged or unknown clients remain blocked; HTTP 4xx and invalid manifests do
  not trigger this fallback. Game-server connectivity is still required to play.

## Host handover

Extract the hotfix ZIP into a fresh directory. It contains exactly the new
`launcher-release` bundle, updated `release-tools`, this note and SHA256SUMS.txt.
This is not a full VPS-installation archive; do not reinstall the backend for it.

From the extracted directory, with the production published folder confirmed:

```bash
sha256sum -c SHA256SUMS.txt
sudo node ./release-tools/tools/publish-launcher.cjs ./launcher-release /srv/coa/published
curl -fsS https://launcher-api.coa-development.org/downloads/launcher/latest.yml
curl -I https://launcher-api.coa-development.org/downloads/launcher/ConquestOfAzerothSetup.exe
```

The feed must identify 0.6.1. The publisher verifies installer hashes and updates
the feed and stable download URL. Players can choose Restart & Update, or use the
0.6.1 installer manually. Do not delete their game folder or cached downloads.
Do not replace a published version with different bytes.

No client republish is required to stop the log loop in launcher 0.6.1. Use the
included release-tools for future client publications so MemoryBridge.log stays
excluded. To update the existing tools installation without touching the backend,
first confirm no publication is running, back up `/srv/coa/release-tools`, then
copy the supplied `release-tools/tools/*.cjs` and `release-tools/src/*.cjs` to the
matching directories there. Preserve any `publishing.local.json` configuration.

## Verification and remaining live acceptance

Local automated checks cover install/update/repair, legacy runtime logs and
transaction recovery, malformed state, cached-download space calculations,
staging pause/resume, offline verification and refusal cases, custom folders,
permissions, invalid old paths, and update-then-launch behavior. Existing addon,
account and publishing tests also pass. The isolated Electron smoke test checks
empty-folder selection and installation, saved path, realm configuration, and
the staging UI, without touching a real game client.

Before broad rollout, verify a real 0.6.0-to-0.6.1 upgrade and a full production
client install/resume in a disposable writable folder such as
`C:\Games\Project Descension`. Confirm the visible preparation stage finishes,
the game launches, and a subsequent session does not redownload MemoryBridge.log.
Live deployment, a full 39 GB installation, and an actual game launch have not
been performed as part of these local checks.
