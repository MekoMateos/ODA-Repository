#!/usr/bin/env bash
# Nightly encrypted backup: MySQL dump + Ghost content (images, themes) -> restic -> Backblaze B2.
# Keeps a local copy too (3-2-1). Cron as the deploy user:
#   15 3 * * * /opt/oda/infra/scripts/backup.sh >> /var/log/oda-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOCAL=/opt/oda/backups
mkdir -p "$LOCAL"

docker compose exec -T db sh -c 'exec mysqldump --single-transaction --routines -u root -p"$MYSQL_ROOT_PASSWORD" ghost' \
  | gzip > "$LOCAL/db-$STAMP.sql.gz"

docker run --rm -v infra_ghost_content:/content:ro -v "$LOCAL":/out alpine \
  tar czf "/out/content-$STAMP.tar.gz" -C /content .

restic snapshots >/dev/null 2>&1 || restic init
restic backup "$LOCAL/db-$STAMP.sql.gz" "$LOCAL/content-$STAMP.tar.gz" --tag nightly
restic forget --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune

# Local copies: keep 7 days
find "$LOCAL" -type f -mtime +7 -delete

[ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 "$HEALTHCHECK_URL" >/dev/null || true
echo "Backup $STAMP done."
