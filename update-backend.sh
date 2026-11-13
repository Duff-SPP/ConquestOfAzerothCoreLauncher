#!/usr/bin/env bash
# Existing-install update only. No SQL, database tools, website files or environment changes.
set -euo pipefail
umask 077
MODE="${1:---check}"
[[ "$MODE" == --check || "$MODE" == --apply ]] || { echo 'Usage: sudo bash update-backend.sh [--check|--apply]'; exit 1; }
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.'; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$ROOT/backend/deploy/linux-x64"
TARGET=/opt/coa-launcher-backend
SNIPPET=/etc/nginx/snippets/coa-launcher-downloads.conf
POLICY=/etc/coa-launcher-backend/download-policy.json
UNIT=coa-launcher-backend.service
for cmd in nginx systemctl curl sha256sum rsync python3; do command -v "$cmd" >/dev/null || { echo "Missing prerequisite: $cmd"; exit 1; }; done
for item in "$TARGET" "$SNIPPET" /etc/coa-launcher-backend /var/lib/coa-launcher-backend; do
    [[ -e "$item" && ! -L "$item" ]] || { echo "Unexpected or linked installation path: $item"; exit 1; }
    [[ "$(readlink -f "$item")" == "$item" ]] || { echo "Linked ancestor: $item"; exit 1; }
done
[[ -f "$SOURCE/Conquest.Launcher.Backend.dll" && -f "$ROOT/SHA256SUMS" ]] || { echo 'Use the packaged backend update with freshly compiled binaries.'; exit 1; }
(cd "$ROOT" && sha256sum --check --quiet SHA256SUMS)
[[ ! -L "$POLICY" ]] || { echo "Refusing linked policy: $POLICY"; exit 1; }
systemctl is-active --quiet "$UNIT"
nginx -t
prepare_snippet() {
python3 - "$SNIPPET" "$ROOT/backend/ubuntu/downloads.nginx.conf" "$1" <<'PY'
import base64,pathlib,re,sys
old=pathlib.Path(sys.argv[1]).read_text()
new=pathlib.Path(sys.argv[2]).read_text()
baseline=base64.b64decode('IyBJbmNsdWRlIGluc2lkZSB0aGUgTkVXIEhUVFBTIHNlcnZlciB7fSBmb3IgbGF1bmNoZXItYXBpLmNvYS1kZXZlbG9wbWVudC5vcmcuCiMgTWFzdGVyIGFuZCBwdWJsaXNoZWQgcm9vdHMgTVVTVCBiZSBkaWZmZXJlbnQgZm9sZGVycy4gbmdpbnggbmVlZHMgcmVhZCBhY2Nlc3Mgb25seS4KbG9jYXRpb24gPSAvZG93bmxvYWRzL2xhdW5jaGVyL0NvbnF1ZXN0T2ZBemVyb3RoU2V0dXAuZXhlIHsKICAgIGFsaWFzIC9zcnYvY29hL3B1Ymxpc2hlZC9sYXVuY2hlci9Db25xdWVzdE9mQXplcm90aFNldHVwLmV4ZTsKICAgIGRlZmF1bHRfdHlwZSBhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW07CiAgICBhZGRfaGVhZGVyIENhY2hlLUNvbnRyb2wgIm5vLXN0b3JlIiBhbHdheXM7CiAgICBkaXNhYmxlX3N5bWxpbmtzIG9uOwogICAgZ3ppcCBvZmY7CiAgICBzZW5kZmlsZSBvbjsKfQpsb2NhdGlvbiA9IC9kb3dubG9hZHMvY2xpZW50L2xhdGVzdC5qc29uIHsKICAgIGFsaWFzIC9zcnYvY29hL3B1Ymxpc2hlZC9jbGllbnQvbGF0ZXN0Lmpzb247CiAgICBkZWZhdWx0X3R5cGUgYXBwbGljYXRpb24vanNvbjsKICAgIGFkZF9oZWFkZXIgQ2FjaGUtQ29udHJvbCAibm8tc3RvcmUiIGFsd2F5czsKICAgIGFkZF9oZWFkZXIgWC1Db250ZW50LVR5cGUtT3B0aW9ucyBub3NuaWZmIGFsd2F5czsKICAgIGRpc2FibGVfc3ltbGlua3Mgb247Cn0KbG9jYXRpb24gfiBeL2Rvd25sb2Fkcy9jbGllbnQvb2JqZWN0cy8oW2EtZjAtOV17NjR9KSQgewogICAgYWxpYXMgL3Nydi9jb2EvcHVibGlzaGVkL2NsaWVudC9vYmplY3RzLyQxOwogICAgZGVmYXVsdF90eXBlIGFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbTsKICAgIGFkZF9oZWFkZXIgQ2FjaGUtQ29udHJvbCAicHVibGljLG1heC1hZ2U9MzE1MzYwMDAsaW1tdXRhYmxlIiBhbHdheXM7CiAgICBhZGRfaGVhZGVyIFgtQ29udGVudC1UeXBlLU9wdGlvbnMgbm9zbmlmZiBhbHdheXM7CiAgICBnemlwIG9mZjsKICAgIHNlbmRmaWxlIG9uOwogICAgZGlzYWJsZV9zeW1saW5rcyBvbjsKfQpsb2NhdGlvbiA9IC9kb3dubG9hZHMvbGF1bmNoZXIvbGF0ZXN0LnltbCB7CiAgICBhbGlhcyAvc3J2L2NvYS9wdWJsaXNoZWQvbGF1bmNoZXIvbGF0ZXN0LnltbDsKICAgIGRlZmF1bHRfdHlwZSB0ZXh0L3lhbWw7CiAgICBhZGRfaGVhZGVyIENhY2hlLUNvbnRyb2wgIm5vLXN0b3JlIiBhbHdheXM7CiAgICBhZGRfaGVhZGVyIFgtQ29udGVudC1UeXBlLU9wdGlvbnMgbm9zbmlmZiBhbHdheXM7CiAgICBkaXNhYmxlX3N5bWxpbmtzIG9uOwp9CmxvY2F0aW9uIH4gXi9kb3dubG9hZHMvbGF1bmNoZXIvKENvbnF1ZXN0T2ZBemVyb3RoU2V0dXAtWzAtOV0rXC5bMC05XStcLlswLTldK1wuZXhlKD86XC5ibG9ja21hcCk/KSQgewogICAgYWxpYXMgL3Nydi9jb2EvcHVibGlzaGVkL2xhdW5jaGVyLyQxOwogICAgZGVmYXVsdF90eXBlIGFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbTsKICAgIGFkZF9oZWFkZXIgQ2FjaGUtQ29udHJvbCAicHVibGljLG1heC1hZ2U9MzE1MzYwMDAsaW1tdXRhYmxlIiBhbHdheXM7CiAgICBhZGRfaGVhZGVyIFgtQ29udGVudC1UeXBlLU9wdGlvbnMgbm9zbmlmZiBhbHdheXM7CiAgICBnemlwIG9mZjsKICAgIHNlbmRmaWxlIG9uOwogICAgZGlzYWJsZV9zeW1saW5rcyBvbjsKfQojIFByZXZlbnQgZGlyZWN0b3J5IGxpc3Rpbmcgb3IgYW55IG90aGVyIGZpbGVzIGluIHB1Ymxpc2hlZCBzdG9yYWdlIGJlY29taW5nIHB1YmxpYy4KbG9jYXRpb24gL2Rvd25sb2Fkcy8gewogICAgcmV0dXJuIDQwNDsKfQo=').decode()
def canonical(text):
    return re.sub(r'\s+','',re.sub(r'(?m)^\s*#.*$','',text).replace(chr(34),''))
def published_root(text):
    matches=re.findall(r'alias\s+(/[^;{}\s]+)/launcher/latest\.yml\s*;',text)
    if len(matches)!=1 or '..' in pathlib.PurePosixPath(matches[0]).parts:
        raise ValueError('Unknown launcher alias layout')
    return matches[0]
try:
    root=published_root(old)
    expected=baseline.replace(published_root(baseline),root)
    expected_new=new.replace(published_root(new),root)
    if canonical(old)==canonical(expected_new):
        result=old
    elif canonical(old)==canonical(expected):
        proxy=re.search(r'location \^~ /downloads/client/ \{[^{}]*\}',new)
        if not proxy: raise ValueError('Missing packaged client proxy')
        result,count=re.subn(r'location\s*=\s*/downloads/client/latest\.json\s*\{[^{}]*\}',lambda _:proxy.group(0),old)
        if count!=1: raise ValueError('Ambiguous manifest location')
        result,count=re.subn(r'location\s*~\s*"?\^/downloads/client/objects/\(\[a-f0-9\]\{64\}\)\$"?\s*\{[^{}]*\}', '',result)
        if count!=1 or canonical(result)!=canonical(expected_new): raise ValueError('Unexpected object location')
    else: raise ValueError('Unrecognized custom download rules')
    if sys.argv[3]!='--check': pathlib.Path(sys.argv[3]).write_text(result)
except ValueError as error:
    print(str(error)+'. No configuration overwritten; review this snippet first.',file=sys.stderr)
    sys.exit(1)
PY
}
prepare_snippet --check
# Confirm this snippet is actually included. Never replace a server block or auth routing.
nginx -T 2>&1 | grep -F 'include /etc/nginx/snippets/coa-launcher-downloads.conf;' >/dev/null
python3 - "$ROOT/backend/ubuntu/download-policy.json" <<'PY'
import json,re,sys
v=json.load(open(sys.argv[1]))['Launcher']['RequiredClientVersion']
assert isinstance(v,str) and re.fullmatch(r'\d+\.\d+\.\d+',v), 'Invalid version policy'
PY
[[ "$MODE" == --apply ]] || { echo 'Preflight passed. No changes made. Run again with --apply after publishing launcher 0.8.1.'; exit 0; }
BACKUP="$(mktemp -d /opt/coa-launcher-rollback-XXXXXXXX)"
STAGE="$(mktemp -d /opt/coa-launcher-stage-XXXXXXXX)"
cp -a "$SNIPPET" "$BACKUP/downloads.nginx.conf"
prepare_snippet "$BACKUP/new-downloads.nginx.conf"
if [[ -f "$POLICY" ]]; then cp -a "$POLICY" "$BACKUP/download-policy.json"; fi
rsync -a --exclude 'appsettings.Local*' --exclude '*.log' "$SOURCE/" "$STAGE/"
chown -R root:root "$STAGE"
find "$STAGE" -type d -exec chmod 0755 {} +
find "$STAGE" -type f -exec chmod 0644 {} +
swapped=0
rollback() {
    local status=$?
    trap - EXIT INT TERM
    if [[ $status -ne 0 && $swapped -eq 1 ]]; then
        echo "Update failed; restoring previous backend and download configuration. Backup: $BACKUP"
        systemctl stop "$UNIT" || true
        if [[ -d "$BACKUP/backend" ]]; then
            if [[ -d "$TARGET" ]]; then mv "$TARGET" "$BACKUP/failed-backend"; fi
            mv "$BACKUP/backend" "$TARGET"
        fi
        cp -a "$BACKUP/downloads.nginx.conf" "$SNIPPET"
        if [[ -f "$BACKUP/download-policy.json" ]]; then cp -a "$BACKUP/download-policy.json" "$POLICY"; else rm -f -- "$POLICY"; fi
        systemctl start "$UNIT" || true
        if nginx -t; then systemctl reload nginx || true; fi
    fi
    exit "$status"
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
swapped=1
systemctl stop "$UNIT"
mv "$TARGET" "$BACKUP/backend"
mv "$STAGE" "$TARGET"
install -m 0640 -o root -g coa-launcher "$ROOT/backend/ubuntu/download-policy.json" "$POLICY"
install -m 0644 "$BACKUP/new-downloads.nginx.conf" "$SNIPPET"
nginx -t
systemctl start "$UNIT"
ready=0
for attempt in {1..20}; do
    if curl --fail --silent -H 'Host: launcher-api.coa-development.org' http://127.0.0.1:5082/health >/dev/null; then ready=1; break; fi
    sleep 1
done
[[ $ready -eq 1 ]] || { echo 'Backend health check failed.'; exit 1; }
required="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["Launcher"]["RequiredClientVersion"])' "$POLICY")"
[[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: launcher-api.coa-development.org' http://127.0.0.1:5082/downloads/client/latest.json)" == 426 ]]
curl --fail --silent -H 'Host: launcher-api.coa-development.org' -H "X-CoA-Launcher-Version: $required" http://127.0.0.1:5082/downloads/client/latest.json >/dev/null
systemctl reload nginx
[[ "$(curl -s -o /dev/null -w '%{http_code}' https://launcher-api.coa-development.org/downloads/client/latest.json)" == 426 ]]
curl --fail --silent -H "X-CoA-Launcher-Version: $required" https://launcher-api.coa-development.org/downloads/client/latest.json >/dev/null
curl --fail --silent https://launcher-api.coa-development.org/downloads/launcher/latest.yml >/dev/null
trap - EXIT INT TERM
echo "Backend updated. Allowed launcher: $required. Rollback files: $BACKUP"
echo 'Website, database, private environment and authentication routing were not modified.'
