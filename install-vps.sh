#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run sudo bash install-vps.sh'; exit 1; }
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 26.04 && "$(uname -m)" == x86_64 ]] || { echo 'Requires Ubuntu 26.04 LTS x86_64.'; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
[[ -d "$BACKEND" ]] || BACKEND="$ROOT/Conquest-Launcher-Backend"
SOURCE="$BACKEND/deploy/linux-x64"
[[ -f "$SOURCE/Conquest.Launcher.Backend.dll" ]] || { echo 'Publish the current backend first (BUILD_AND_RELEASE.md).'; exit 1; }
command -v nginx >/dev/null && systemctl is-active --quiet nginx || { echo 'Existing nginx must be active.'; exit 1; }
systemctl is-active --quiet mysql || systemctl is-active --quiet mariadb || { echo 'Existing MySQL service must be active; this script will not reset/install it.'; exit 1; }
# Do not follow operator-created links into unrelated application paths.
for target in /opt/coa-launcher-backend /srv/coa /srv/coa/master-client /srv/coa/published /srv/coa/release-tools /etc/coa-launcher-backend /var/lib/coa-launcher-backend; do
    [[ ! -L "$target" ]] || { echo "Refusing linked destination: $target"; exit 1; }
done
apt-get update
apt-get install -y rsync ca-certificates curl
if ! command -v dotnet >/dev/null || ! dotnet --list-runtimes | grep -q '^Microsoft.AspNetCore.App 8\.'; then
    apt-get install -y software-properties-common
    add-apt-repository -y ppa:dotnet/backports
    apt-get update
    apt-get install -y aspnetcore-runtime-8.0
fi
if ! command -v node >/dev/null; then apt-get install -y nodejs; fi
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { echo 'Install Node 22 or newer for release tools.'; exit 1; }
id coa-launcher >/dev/null 2>&1 || useradd --system --home-dir /var/lib/coa-launcher-backend --shell /usr/sbin/nologin coa-launcher
install -d -m 0755 /opt/coa-launcher-backend /srv/coa /srv/coa/published /srv/coa/release-tools
install -d -m 0750 -o root -g root /srv/coa/master-client
install -d -m 0750 -o root -g coa-launcher /etc/coa-launcher-backend
install -d -m 0700 -o coa-launcher -g coa-launcher /var/lib/coa-launcher-backend /var/lib/coa-launcher-backend/keys
if [[ ! -f /etc/coa-launcher-backend/backend.env ]]; then
    install -m 0640 -o root -g coa-launcher "$BACKEND/ubuntu/backend.env.example" /etc/coa-launcher-backend/backend.env
fi
# Private settings survive reruns. Only application binaries are replaced.
systemctl stop coa-launcher-backend.service 2>/dev/null || true
rsync -a --delete --exclude 'appsettings.Local*' --exclude '*.log' "$SOURCE/" /opt/coa-launcher-backend/
chown -R root:root /opt/coa-launcher-backend
find /opt/coa-launcher-backend -type d -exec chmod 0755 {} +
find /opt/coa-launcher-backend -type f -exec chmod 0644 {} +
if [[ -d "$ROOT/release-tools" ]]; then
    rsync -a "$ROOT/release-tools/" /srv/coa/release-tools/
    find /srv/coa/release-tools -type d -exec chmod 0755 {} +
    find /srv/coa/release-tools -type f -exec chmod 0644 {} +
fi
install -m 0644 "$BACKEND/ubuntu/coa-launcher-backend.service" /etc/systemd/system/coa-launcher-backend.service
systemctl daemon-reload
systemctl enable --now coa-launcher-backend.service
install -d /etc/nginx/snippets
SITE=/etc/nginx/sites-available/coa-launcher-backend
LINK=/etc/nginx/sites-enabled/coa-launcher-backend
SNIPPET=/etc/nginx/snippets/coa-launcher-downloads.conf
[[ ! -L "$SITE" && ! -L "$SNIPPET" ]] || { echo 'Refusing linked nginx source files.'; exit 1; }
BACKUP=$(mktemp)
had_snippet=0; created_site=0; created_link=0
if [[ -f "$SNIPPET" ]]; then cp "$SNIPPET" "$BACKUP"; had_snippet=1; fi
install -m 0644 "$BACKEND/ubuntu/downloads.nginx.conf" "$SNIPPET"
# Preserve certbot HTTPS changes and any administrator edits on reruns.
if [[ ! -e "$SITE" ]]; then install -m 0644 "$BACKEND/ubuntu/launcher-api.nginx.conf" "$SITE"; created_site=1; fi
if [[ ! -e "$LINK" && ! -L "$LINK" ]]; then ln -s "$SITE" "$LINK"; created_link=1; fi
if ! nginx -t; then
    if [[ $had_snippet == 1 ]]; then cp "$BACKUP" "$SNIPPET"; else rm -f "$SNIPPET"; fi
    [[ $created_link == 0 ]] || rm -f "$LINK"
    [[ $created_site == 0 ]] || rm -f "$SITE"
    rm -f "$BACKUP"
    echo 'nginx validation failed; launcher nginx changes rolled back. No reload performed.'; exit 1
fi
rm -f "$BACKUP"
systemctl reload nginx
systemctl is-active --quiet coa-launcher-backend.service
echo 'Launcher installed. Fill /etc/coa-launcher-backend/backend.env, restart service, then configure HTTPS with certbot.'
echo 'Existing website, MySQL, firewall, master client and releases were preserved.'
