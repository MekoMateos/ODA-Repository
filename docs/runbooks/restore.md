# Restore from backup (target: under 1 hour)

1. New Hetzner server, run `harden.sh`, clone the repo, copy `infra/.env` from the password manager.
2. `cd /opt/oda/infra && ./scripts/restore.sh` (latest) or `./scripts/restore.sh <snapshot-id>` (`restic snapshots` lists them).
3. Point Cloudflare DNS at the new server IP. Cloudflare keeps the visitor-facing address the same.
4. Check: front page, one article, admin login, a test newsletter to staff.

Test this on a throwaway server on the first Monday of every month and log the result.
