# Production deployment — host instructions

Start here when receiving the owner's handover ZIP. Use the fresh archive produced by **BUILD_AND_RELEASE.md**. These instructions do not certify that the delivered build has passed live acceptance checks.

## Before you start

The current installer explicitly requires **Ubuntu 26.04 x86_64**, root/sudo access, and existing active **nginx and MySQL or MariaDB** services. It rejects other Ubuntu versions and ARM hosts. This is a launcher deployment bundle, not a complete game-server or database installer. The AzerothCore server and its auth/characters databases must already be available.

The script attempts to install ASP.NET Core 8 if missing and Node.js if absent; it requires Node **22 or newer** and stops if an existing Node is older. Resolve prerequisite failures before continuing. Have DNS access for `launcher-api.coa-development.org`, ports 80/443 reachable, private database credentials and Discord OAuth settings if enabling Discord. Ensure storage can hold the private master client, public client objects, installer releases and staging/backups; changed objects consume additional space.

The handover should contain the fresh `Conquest-Launcher-VPS-<version>-<timestamp>.tar.gz`, these guides, and a complete production `master-client` for initial installation (possibly transferred separately). Private credentials are provided separately. Players use the Windows installer; Linux runs only the backend and publishing tools.

## Unpack the delivery once

Extract the outer ZIP into a staging directory using your ZIP tool. The `.tar.gz` inside it is the actual deployment bundle. Set these two variables to the actual archive path and a new, unused extraction directory; keep the same shell for subsequent commands:

```bash
COA_ARCHIVE='/path/to/Conquest-Launcher-VPS-REPLACE_VERSION-REPLACE_TIMESTAMP.tar.gz'
COA_RELEASE_DIR='/opt/coa-release-REPLACE_VERSION-REPLACE_TIMESTAMP'
tar -tzf "$COA_ARCHIVE"
sudo mkdir "$COA_RELEASE_DIR"
sudo tar -xzf "$COA_ARCHIVE" -C "$COA_RELEASE_DIR"
cd "$COA_RELEASE_DIR"
```

Replace the placeholder paths before running. The extracted directory must contain `backend/deploy/linux-x64`, `backend/sql`, `backend/ubuntu`, `release-tools`, `launcher-release`, `install-vps.sh`, and both guides. Keep that structure intact. No npm install or source compilation is required on the VPS.

For **first installation**, follow sections 1–11 in order. For **later updates**, use section 12. Installing the service does not publish the launcher installer or game client; those are separate commands in sections 9–10.

## 1. DNS and network

Point `launcher-api.coa-development.org` A record to the VPS (AAAA only if IPv6 actually works). Keep ports 80/443 reachable. Backend binds **127.0.0.1:5082**; do not open it publicly. Launcher MySQL connections use loopback.

Launcher installers do not change existing MySQL listener or firewall settings. Verify the existing host's configuration separately; the backend uses loopback database access.

## 2. Discord Application

At https://discord.com/developers/applications create/select Conquest of AzerothCore. Save its Application/Client ID and Client Secret privately. No bot or roles are needed. Register exactly:

`https://launcher-api.coa-development.org/api/account/discord/callback`

The existing integration requests only `identify`. For local testing also register `http://127.0.0.1:5082/api/account/discord/callback`. Never put the client secret in launcher config, renderer, screenshots or a published archive. The [Discord OAuth2 documentation](https://discord.com/developers/docs/topics/oauth2) describes this authorization-code flow.

## 3. SQL — administrative setup, restricted runtime

Use the fresh bundle extracted above. Run SQL with an existing administrative MySQL account, **not** with the backend runtime user. Do not reset/install MySQL.

Mandatory setup order:

1. Review `backend/sql/discord-account-link.sql`. Its `USE acore_auth` is the target auth schema. Adjust if the VPS uses another name. Creates `coa_discord_link` (unique account and Discord ID) and `coa_discord_link_log` (history). Run before enabling Discord, and before its grants below.
2. Review `backend/sql/launcher-user.example.sql`. Replace `REPLACE_WITH_A_PRIVATE_PASSWORD`, schema names if needed, and the user host if the actual MySQL server uses a different matched host. Current host is `'coa_launcher'@'127.0.0.1'` for TCP loopback. It grants account read/insert, realm read/realmcharacters insert, character read, active Discord link CRUD, and **INSERT only** on link history. No world DB privilege.

```bash
cd "$COA_RELEASE_DIR"
sudo mysql < backend/sql/discord-account-link.sql
sudo mysql < backend/sql/launcher-user.example.sql
```

If the administrator uses password authentication, use `mysql -u <admin> -p` rather than putting the password on the command line. `CREATE USER IF NOT EXISTS` does not rotate an existing user's password: use an explicit reviewed `ALTER USER` when changing it.

Optional only: `backend/sql/password-reset.sql` and the commented reset grants, followed by SMTP configuration. PTR registration/login/Discord do not need password-reset tables. No launcher script automatically applies SQL to any database.

## 4. Private configuration

Create `/etc/coa-launcher-backend/backend.env` from `backend/ubuntu/backend.env.example`. The installer creates it if absent and preserves it on reruns. Fill after the first install, or precreate before installation. It must be root-owned, group `coa-launcher`, mode **0640**; directory mode **0750**. Never distribute it.

Required settings:

```text
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://127.0.0.1:5082
LocalTesting=false
AllowedHosts=launcher-api.coa-development.org
Portal__PublicBaseUrl=https://launcher-api.coa-development.org
DataProtection__KeysPath=/var/lib/coa-launcher-backend/keys
Launcher__PublishedRoot=/srv/coa/published
ConnectionStrings__AuthDatabase="Server=127.0.0.1;Port=3306;Database=acore_auth;User ID=coa_launcher;Password=REPLACE_PRIVATE;Connection Timeout=5"
ConnectionStrings__CharactersDatabase="Server=127.0.0.1;Port=3306;Database=acore_characters;User ID=coa_launcher;Password=REPLACE_PRIVATE;Connection Timeout=5"
Accounts__RegistrationEnabled=true
Turnstile__Enabled=false
DiscordOAuth__Enabled=true
DiscordOAuth__ClientId=REPLACE_APPLICATION_ID
DiscordOAuth__ClientSecret=REPLACE_PRIVATE_SECRET
DiscordOAuth__RedirectUri=https://launcher-api.coa-development.org/api/account/discord/callback
DiscordOAuth__StateMinutes=10
Portal__PasswordResetEnabled=false
```

These are systemd EnvironmentFile assignments, not shell commands. Keep values on one line. If a password contains connection-string special characters, quote/escape it according to MySqlConnector connection-string syntax as well as systemd syntax. Prefer a generated long password without semicolons/quotes to simplify setup. Never use MySQL root as runtime user. Turnstile is optional and **off for PTR**, with validation, request limits, rate limiting and SRP6 retained.

## 5. Install/update Ubuntu service

Target: Ubuntu **26.04 LTS x86_64** (including 26.04.1), existing active nginx and MySQL. The installer uses Ubuntu's .NET backports feed to install ASP.NET Core 8, and apt Node.js if absent. Node >=22 is checked; no VPS npm modules are needed by release tools. See [Microsoft's Ubuntu installation instructions](https://learn.microsoft.com/en-us/dotnet/core/install/linux-ubuntu-install).

```bash
cd "$COA_RELEASE_DIR"
sudo bash install-vps.sh
sudoedit /etc/coa-launcher-backend/backend.env
sudo systemctl restart coa-launcher-backend
sudo systemctl status coa-launcher-backend --no-pager
sudo journalctl -u coa-launcher-backend -n 80 --no-pager
```

Runtime binaries: `/opt/coa-launcher-backend`. Persistent state/keys: `/var/lib/coa-launcher-backend`, owned by `coa-launcher`. Preserve these keys across upgrades or existing sessions will become invalid. The service cannot write master/public releases. Installation is rerunnable: private env, master client, published releases and website config are preserved. Published backend files are replaced; don't store private settings in that directory.

## 6. nginx and HTTPS

Installer adds only `/etc/nginx/sites-available/coa-launcher-backend`, its enabled link and `/etc/nginx/snippets/coa-launcher-downloads.conf`. Existing launcher server blocks are preserved on reruns, including Certbot edits. If an older launcher block already exists under another filename, consolidate that launcher hostname manually to avoid duplicate server names; don't replace your website block.

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d launcher-api.coa-development.org --redirect
sudo nginx -t && sudo systemctl reload nginx
curl -fsS https://launcher-api.coa-development.org/health
```

Ensure the **HTTPS** launcher server block includes `include /etc/nginx/snippets/coa-launcher-downloads.conf;`. nginx serves only latest manifests and validated installer/object paths; no directory listing, private master folder, scripts, secrets or arbitrary published files. Dynamic account routes proxy to loopback with forwarded HTTPS/IP headers. Plain HTTP API calls intentionally fail until HTTPS is set up.

## 7. Master client and storage

`/srv/coa/master-client` is private, administrator maintained. `/srv/coa/published` contains generated public objects/manifests/installers; `/srv/coa/release-tools` holds publishing scripts. Upload into the master (or stage a full replacement elsewhere) while no publisher is running. Never expose master through nginx.

Copy the contents of the supplied `master-client` into `/srv/coa/master-client` after installation. `Ascension.exe` must end up directly at `/srv/coa/master-client/Ascension.exe`, not inside an extra nested folder. The client must contain all required game data and production MPQs. Preserve a separate backup. Disk preflight uses actual `statfs` free space and required new objects plus a safety margin.

## 8. Addon catalog and Ascension loose addons

Current catalog source: `conquest-launcher/src/assets/AddonCatalog`. It already includes Ascension packages. The same `AddonService`/dependency resolver/file ownership implementation is used in Local Preview and packaged production; Electron packages the catalog as external read-only resources. Catalog changes ship with a new launcher version, not the game manifest.

To import another extracted addon: copy its complete folder (TOC, Lua, XML, BLP, libraries and referenced assets) under that catalog. Do not modify the original/reference MPQ. Active `*.toc` is required; exact `<Folder>.toc` is preferred. `Blizzard_*`, `.toc.dev`-only and no-active-TOC folders are excluded from optional catalog entries. The original TOC/loading directives are preserved.

- Dependencies/RequiredDeps are hard requirements. Folder-to-package providers handle suites. Resolve recursively, deduplicate and reject cycles/missing providers before applying. Complete installed dependencies are reused. Additional packages are shown for confirmation.
- OptionalDeps is metadata, never forced or blocking. LoadOnDemand and LoadWith are preserved, not promoted to hard requirements.
- Launcher records hashes for owned files in `<ClientRoot>/.coa-launcher/addons.json`, stages the full plan and uses a recovery journal. Uninstall checks manual and catalog TOCs for reverse hard dependencies. Modified/unowned files and SavedVariables survive. Unmanaged colliding addon files block installation; explicitly move that addon folder aside before adopting it into the catalog. Old pre-ownership installs are treated as unmanaged.
- Use **Locate game** to choose a separate writable local test directory (it may be empty in Local Preview). Addon install/update/uninstall remains real while the ten-minute game download stays simulated. Never select the protected reference folder.
- Before publishing production client, remove matching embedded `Interface/AddOns/<Folder>` entries from a **writable production copy** of patch-B using your MPQ tooling. Verify a single authoritative copy of each managed addon. Keep native Ascension C_* APIs/client functionality. The publisher cannot inspect MPQ internals; this is an explicit manual release gate. Do not distribute duplicate embedded and loose addon paths.

## 9. Publish and verify client

```bash
sudo node /srv/coa/release-tools/tools/validate-master.cjs /srv/coa/master-client
sudo node /srv/coa/release-tools/tools/publish-client.cjs /srv/coa/master-client /srv/coa/published REPLACE_WITH_NEW_CLIENT_RELEASE
curl -fsS https://launcher-api.coa-development.org/downloads/client/latest.json
```

Replace `REPLACE_WITH_NEW_CLIENT_RELEASE` with a unique release name, such as a date and sequence number, before running. Never reuse an existing client release name. Output: `client/objects/<sha256>`, immutable `client/releases/<version>.json`, atomic `client/latest.json`. Interface (including addons), WTF, SavedVariables, screenshots, caches/logs and realmlist are excluded. Realmlist is configured separately by the launcher with a backup. Old unchanged objects are reused. If releases were created under a restrictive shell umask, set public **files** to 0644 and directories to 0755; never do this to the private master/config directories.

For one nonempty object hash from the manifest:
`curl -I -H 'Range: bytes=0-15' https://launcher-api.coa-development.org/downloads/client/objects/<hash>` should return a valid partial range. Test download/resume through a disposable player directory before real players.

## 10. Publish launcher

```bash
cd "$COA_RELEASE_DIR"
sudo node /srv/coa/release-tools/tools/publish-launcher.cjs ./launcher-release /srv/coa/published
curl -fsS https://launcher-api.coa-development.org/downloads/launcher/latest.yml
curl -I https://launcher-api.coa-development.org/downloads/launcher/ConquestOfAzerothSetup.exe
```

Versioned EXE/blockmap are immutable; latest.yml points at them. The stable EXE URL is for the website download button only; launcher self-update uses latest.yml. Launcher updates may download automatically but Restart & Update is always a player choice. Game updates only CHECK automatically and wait for UPDATE/DOWNLOAD click.

## 11. Player acceptance gate

Run the full manual checklist in BUILD_AND_RELEASE.md: install → native account creation without CAPTCHA → login/characters → optional Discord link/unlink → empty client download/resume/hash verification → real addon dependency installation → Play Ascension.exe → manual-click incremental update/repair → voluntary launcher restart/update → launcher uninstall preserves game data. Verify these while the website is unavailable. Only then advertise the stable installer URL.

Never paste the private backend environment, session cookies, Discord secrets or ReadBridge token into public support logs. News/CMS/social features remain outside this release scope.

Record the exact archive filename, installed versions, date and pass/pending/fail results. Check health after a reboot, registration/login, Discord if enabled, an empty-client download and resume, Play, repair, a game update, and an upgrade from a previously installed launcher. Historical source test notes are not evidence that this host or release passed these checks.

## 12. Later updates — choose the relevant workflow

### Launcher update (players' Windows application)

The owner builds a new launcher version and supplies a fresh VPS archive, or the complete new `launcher-release` folder. That folder must include its versioned EXE, `.exe.blockmap`, `latest.yml` and `launcher-release.json`. An EXE alone is insufficient. Extract a fresh archive as above, then run section 10 from that extraction directory. For a standalone folder, run the same publisher with the actual folder path instead of `./launcher-release`.

The publisher updates the public update feed and stable download URL. Existing launchers can detect/download the release; the player chooses **Restart & Update**. Verify an actual upgrade from the previous version. No backend reinstall or game-client republish is required for a launcher-only update. If publishing tools also changed, use the coordinated backend/tools update below first.

### Game-client update (game files and MPQs)

Finish uploading all changed game files into the private master, and apply only the owner's explicitly listed deletions. Alternatively stage a complete replacement master. Ensure no publisher is running during changes, and keep a backup. Validate and publish using section 9 with a new client release name. Do not manually edit generated manifests or public object files.

The launcher detects the new client release; players click **UPDATE** to download the required changed/missing files. A game-only update does not require a new launcher EXE or backend restart. Addon catalog changes require a launcher release as described in section 8.

### Backend or publishing-tool update (Linux service/tools)

The owner supplies a fresh VPS archive containing current Linux binaries and tools. Extract it into a new directory as above. Back up the existing backend binaries, private environment and persistent state/keys before updating. Review any release-specific SQL/configuration changes; the installer does not apply database migrations.

```bash
cd "$COA_RELEASE_DIR"
sudo bash install-vps.sh
sudo systemctl status coa-launcher-backend --no-pager
sudo journalctl -u coa-launcher-backend -n 80 --no-pager
curl -fsS https://launcher-api.coa-development.org/health
```

This briefly stops/replaces/restarts the backend and copies bundled release tools. Existing private environment, persistent keys, master client and published releases are preserved. Existing nginx site configuration is preserved, but the downloads snippet is refreshed; review relevant configuration changes and verify HTTPS/downloads afterwards. Do not rerun first-install SQL blindly or replace private settings with example values. Publish launcher/game updates separately only when those artifacts changed.

For a combined release, update backend/tools first, then publish the intended client and launcher releases and run acceptance checks. Do not announce completion if any required step failed.
