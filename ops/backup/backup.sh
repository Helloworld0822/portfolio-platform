#!/bin/sh
set -eu
umask 077
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"

work=$(mktemp -d)
trap 'rm -r "$work"' EXIT
trap 'exit 1' HUP INT TERM

curl -fsS --retry 2 --max-time 15 -H 'Metadata-Flavor: Google' \
    http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token > "$work/token.json"
jq -er '"Authorization: Bearer " + (.access_token | select(type == "string" and length > 0))' \
    "$work/token.json" > "$work/header"

metadata_url="https://storage.googleapis.com/storage/v1/b/$BACKUP_BUCKET/o/latest.dump?fields=generation,md5Hash"
metadata() {
    curl -sS --retry 2 --max-time 20 -H "@$work/header" -o "$work/metadata.json" -w '%{http_code}' "$metadata_url"
}

status=$(metadata)
case "$status" in
    200) generation=$(jq -er '.generation | select(test("^[0-9]+$"))' "$work/metadata.json") ;;
    404) generation=0 ;;
    *) echo "Could not read snapshot generation (HTTP $status)" >&2; exit 1 ;;
esac

export PGSERVICEFILE="$work/pg_service.conf"
python3 - <<'PYTHON'
import os
from psycopg2.extensions import parse_dsn

try:
    settings = parse_dsn(os.environ["DATABASE_URL"])
except Exception:
    raise SystemExit("Invalid database connection configuration") from None
with open(os.environ["PGSERVICEFILE"], "w") as service:
    service.write("[portfolio]\n")
    for key, value in settings.items():
        if "\n" in value or "\r" in value:
            raise ValueError("multiline connection option")
        service.write(f"{key}={value}\n")
PYTHON
unset DATABASE_URL
PGSERVICE=portfolio pg_dump --no-password --format=custom --no-owner --no-acl --file="$work/latest.dump"
pg_restore --no-owner --no-acl --file=/dev/null "$work/latest.dump"
openssl dgst -md5 -binary -out "$work/md5" "$work/latest.dump"
checksum=$(openssl base64 -A -in "$work/md5")

upload_url="https://storage.googleapis.com/$BACKUP_BUCKET/latest.dump"
status=$(curl -sS --retry 2 --max-time 120 -H "@$work/header" \
    -H "Content-MD5: $checksum" -H "x-goog-if-generation-match: $generation" \
    -H 'Content-Type: application/octet-stream' --upload-file "$work/latest.dump" \
    -o /dev/null -w '%{http_code}' "$upload_url") || status=unknown

case "$status" in
    200|201) ;;
    412|unknown)
        # A retry may follow a successful write whose response was lost.
        [ "$(metadata)" = 200 ] && [ "$(jq -er '.md5Hash' "$work/metadata.json")" = "$checksum" ] || {
            echo "Snapshot upload did not complete (HTTP $status)" >&2
            exit 1
        }
        ;;
    *) echo "Snapshot upload failed (HTTP $status)" >&2; exit 1 ;;
esac
printf 'Verified backup stored in gs://%s/latest.dump\n' "$BACKUP_BUCKET"
