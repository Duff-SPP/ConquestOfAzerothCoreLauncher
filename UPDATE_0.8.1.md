# Launcher/backend 0.8.1 update

This update targets the original existing installation, including its separate website authentication routing. Do not rerun the full VPS installer for this update.

## Build on Windows

Use Launcher Manager.bat option 2 to compile the current 0.8.1 launcher. Publish its installer/update metadata using the normal reviewed release process BEFORE enforcing 0.8.1, so old players have a working upgrade path.

Use the new BAT option U to compile the Linux backend and package a backend-only update. Alternatively, option 4 then `node tools/package-backend-update.cjs` inside conquest-launcher. Send the new `Release-Output/Conquest-Backend-Update-0.8.1-*.tar.gz` to the VPS owner. No database dump or private configuration is included. Packaging refuses binaries older than backend source.

## VPS owner: existing-install update only

Extract the archive into a new directory, enter it, and run:

```bash
sudo bash update-backend.sh --check
sudo bash update-backend.sh --apply
```

The check performs no application/config changes. Apply briefly restarts only coa-launcher-backend.service and reloads Nginx after validation. Do this at an agreed maintenance time; active client downloads can be interrupted and resumed.

The script checks package hashes, installation paths and the recognized download-rule layout. It preserves a customized publication root and rejects unrecognized rules for review. It never edits the server block containing the website's `/api/(auth|account)` proxy, any website service/files, the backend environment file, data protection keys, published clients, or a database. It requires the existing 5082 backend and included `/etc/nginx/snippets/coa-launcher-downloads.conf` layout.

It retains the old application and snippet under a unique `/opt/coa-launcher-rollback-*` folder. Failed restart/config/download checks trigger automatic rollback. No script can guarantee recovery after power loss or a terminated shell; retained files permit manual restoration. Health checks are not a replacement for a real player login/download test.

## Required launcher version

The script installs `/etc/coa-launcher-backend/download-policy.json`:

```json
{"Launcher":{"RequiredClientVersion":"0.8.1"}}
```

Change that exact version for subsequent releases after publishing the new installer. The backend reloads this file automatically. Invalid configuration fails closed. No SQL is involved. A missing policy defaults to 0.8.1.

Client manifest and object requests require `X-CoA-Launcher-Version` matching the policy exactly. Missing/older/different versions get HTTP 426 and an update message. Nginx now proxies `/downloads/client/` through the backend rather than aliasing public files. `/downloads/launcher/` stays public so older launchers can upgrade. Existing public/CDN/private mirrors outside this server are not controlled by this policy; inspect those separately. Version headers can be imitated: this is a compatibility barrier, not proof of an authentic binary or DRM.

## Accounts and remembered sign-in

The website continues to own login/2FA/session validity on port 5081, with the original Host and X-CoA-Request handling untouched. Website V2.50 must be deployed for 2FA account login. Existing session cookies remain valid subject to the website's 30-day sliding expiry, password/security-stamp changes and logout.

Remember me controls saving the cookie using Electron system encryption. Unchecking it keeps login only for this process. With both Remember me and automatic game login enabled, game credentials are also stored encrypted locally; the launcher validates the website session and username again before using them. Sign out and disabling game auto-login remove saved game credentials. Encryption unavailable (including Wine basic_text storage) must not silently save plaintext. Game login may still request its own authenticator code.

## Review/acceptance before production announcement

- Sign in, register then sign in, 2FA incorrect/correct/recovery cases.
- Remember me on/off across restart; logout/password/session revocation.
- Auto-login on/off with a remembered session, and unavailable encrypted storage.
- Old/no version header rejects client manifest AND objects; 0.8.1 downloads/resumes; launcher update remains public.
- Existing website/account routing and registration unaffected.

Test the updated deployment and game launch on the platforms you support before announcing a release.
