# Launcher 0.6.4: downloader reliability audit

Audited the active local 0.6.3 source in this directory. This directory has no Git repository/HEAD, so the baseline is the previously built local source and 0.6.3 release, not a Git commit. The 0.6.3 mandatory-addon and installer preservation behavior is retained.

## Confirmed causes and changes

The downloader emitted network progress for the last chunk before awaiting FileHandle.sync(), closing the file and reading the entire file again for SHA-256 verification. The renderer translated those received bytes directly to 100%. Thus the last filename, often WowError.exe, remained under Downloading while disk flush/hash work continued. WowError.exe has no special updater behavior.

After all downloads, the updater copies every changed object to a separate staging file. Only after every staged file is complete does the transaction move files into their final paths. A fresh client's Ascension.exe is therefore intentionally absent during downloading, verification and staging. A .part suffix is not proof of an incomplete network download: complete verified objects retain that suffix until transaction cleanup.

0.6.4 explicitly reports disk flush/verification, staging, per-file application, final state/cleanup, and required-addon installation. Busy progress cannot display 100%; ready displays 100%. Core update readiness is deferred in the main-process install/update flow until realm configuration and mandatory addons finish.

Progress IPC during network writes is throttled to approximately five updates per second, plus the final chunk, instead of every chunk. This removes an avoidable renderer/message backlog on fast transfers. No production trace was supplied to quantify its contribution to reported pause delays.

Pause now immediately shows Pausing while handles unwind. Hash read streams receive the abort signal, and network and staging operations retain abort support. Apply/finalize are deliberately non-cancellable to protect the journal. An already submitted OS write or disk flush cannot be cancelled by this JavaScript change; slow storage can still delay pause completion. No promise of a fixed pause latency is made.

## Byte accounting, resume and space

Downloads are sequential, not parallel. Network totals now count each content-addressed object once, and duplicate paths reuse its verified download. Counters are local to each update invocation and do not accumulate across resume. Range responses must exactly match the requested start and published end/size. A 200 response to a Range request truncates/restarts safely. Complete cached objects are rehashed; incomplete files resume by their current length; oversize and failed-hash objects are discarded. Up to three attempts are made. Invalid range/size/content encoding cannot reach application.

The reported 39/43/56 -> 86.7 GB network jump has NOT been reproduced or conclusively identified. Different manifests/changed files, rejected cached bytes, and the distinction between download size and free-space requirements must be checked against an affected player's logs and manifest. The free-space calculation intentionally includes remaining object bytes PLUS the full staging copy and 256 MiB margin. That can approach twice the release size on an empty client; it is not additional network traffic. This release preserves the safe copy-based staging architecture rather than introducing untested rename/recovery semantics.

## Application, ownership and recovery

All part write handles are closed before hashing and staging. The staging pipeline finishes/closes before application. Existing destination files are renamed into backup, and staged files are renamed into place on the same client filesystem. Windows lock/permission errors surface as errors and trigger recovery; there is no infinite rename retry. Anti-virus/file-lock causes have not been demonstrated on a player machine.

An applying journal is written before destination mutations. A failed/interrupted apply restores backups and removes newly applied files, invalidates cached state, then cleans staging. A committed journal only cleans backups/staging. Installed state is saved before the committed marker. Cached objects survive interrupted staging/application for retry. Completed-object cleanup occurs before readiness.

Obsolete files are removed only when they match previous owned size/hash; modified obsolete files are preserved with warnings. Unknown player files are not enumerated for removal. Protected settings, Interface/AddOns, realmlists and runtime MemoryBridge.log remain excluded from the core manifest. Mandatory addon behavior and custom-file backups from 0.6.3 remain intact.

## Validation and limits

41 automated tests passed. New tests cover explicit post-network phases and deferred readiness, duplicate-object totals across pause/resume, active network cancellation and exact resumed offset, servers ignoring Range, invalid Range rejection, and interrupted application recovery. Existing coverage includes bad hashes, staging cancellation, obsolete/player files, offline verification, mandatory addons and installer ownership.

The Electron desktop check verifies all busy phases disable Play, never show 100%, and expose Pause only where supported; it also installs the real mandatory addon catalog in a disposable client. Tests use small fixture clients, not a full 40-90 GB PTR download. Production-sized testing on affected Windows storage remains necessary to confirm timing and investigate the unconfirmed 86.7 GB report.

## Publish

Extract the handover ZIP into a new folder and open a terminal in its directory containing launcher-release and release-tools:

```bash
sha256sum -c SHA256SUMS.txt
sudo node ./release-tools/tools/publish-launcher.cjs ./launcher-release /srv/coa/published
curl -fsS https://launcher-api.coa-development.org/downloads/launcher/latest.yml
```

Only publish after checksums pass. The public feed should then say 0.6.4. No backend replacement or client republish is required for these changes. No live publication was performed during local development.
