#!/usr/bin/env bash
# Restore the latest (or a given) restic snapshot onto this server.
#   restore.sh            -> latest snapshot
#   restore.sh <snapshot> -> specific snapshot
# Test this monthly on a throwaway server; the runbook is docs/runbooks/restore.md.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

SNAP="${1:-latest}"
WORK=$(mktemp -d)
restic restore "$SNAP" --target "$WORK"

DB=$(find "$WORK" -name 'db-*.sql.gz' | sort | tail -1)
CONTENT=$(find "$WORK" -name 'content-*.tar.gz' | sort | tail -1)
[ -f "$DB" ] && [ -f "$CONTENT" ] || { echo "Snapshot is missing files." >&2; exit 1; }

docker compose up -d db
until docker compose exec -T db mysqladmin ping -u root -p"$MYSQL_ROOT_PASSWORD" --silent; do sleep 2; done

docker compose stop ghost
gunzip -c "$DB" | docker compose exec -T db sh -c 'exec mysql -u root -p"$MYSQL_ROOT_PASSWORD" ghost'
docker run --rm -v infra_ghost_content:/content -v "$(dirname "$CONTENT")":/in alpine \
  sh -c "rm -rf /content/* && tar xzf /in/$(basename "$CONTENT") -C /content && chown -R 1000:1000 /content"
REDAKSIA=$(find "$WORK" -name 'redaksia-*.db' | sort | tail -1)
docker compose up -d
if [ -f "$REDAKSIA" ]; then
  docker compose stop redaksia
  docker compose cp "$REDAKSIA" redaksia:/data/redaksia.db
  docker compose start redaksia
fi
rm -rf "$WORK"
echo "Restored snapshot $SNAP."
