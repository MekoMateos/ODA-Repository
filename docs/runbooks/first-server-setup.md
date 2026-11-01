# First server setup (about 1 hour)

1. **Hetzner:** create a CX32 (4 GB) server, Ubuntu 24.04, EU location, with your SSH key. Enable Hetzner backups (+20%) as an extra safety net.
2. **Cloudflare:** add the domain, proxy (orange cloud) `oda.example.org` and `admin.oda.example.org` to the server IP. SSL mode: **Full (strict)**.
3. **Origin certificate:** Cloudflare > SSL/TLS > Origin Server > Create certificate. Save as `infra/caddy/certs/origin.pem` and `origin.key` on the server only.
4. **Harden:** `scp -r infra root@SERVER:/root/` then `ssh root@SERVER 'bash /root/infra/scripts/harden.sh deploy "ssh-ed25519 AAAA..."'`. Check you can log in as `deploy` before closing the root session.
5. **App:** as `deploy`: `sudo mkdir -p /opt/oda && sudo chown deploy /opt/oda && git clone <repo> /opt/oda`, `cp infra/.env.example infra/.env`, fill it in, then `cd infra && docker compose up -d`.
6. **Ghost setup:** open `https://admin.oda.example.org/ghost/`, create the owner account (association email), turn on 2FA. Settings > Mailgun (EU), Stripe (later), language `sq`.
7. **Cloudflare Access:** Zero Trust > Access > Application for `admin.oda.example.org`, allow only staff emails, require a hardware key. Free up to 50 users.
8. **Cloudflare rules:** rate limit `/members/api/*` (10 req/min per IP) and `/ghost/api/admin/session*` (5/min). Turn on Bot Fight Mode. Cache everything on the public domain except `/ghost/*`, `/members/*`, `/p/*` and requests with the `ghost-members-ssr` cookie.
9. **Backups:** `crontab -e` as deploy: `15 3 * * * /opt/oda/infra/scripts/backup.sh >> /opt/oda/backup.log 2>&1` and `0 4 1 * * sudo /opt/oda/infra/scripts/cf-firewall.sh`.
10. **Theme:** create a Ghost custom integration (Settings > Integrations), put its Admin API URL + key into GitHub secrets, merge to main, approve the deploy.
11. **Redaksia (editorial dashboard):** follow [redaksia.md](redaksia.md) > Setup on the server.
12. **Brand:** Ghost Admin > Settings > Design & branding: upload `brand/oda-icon-512.png` as the publication icon and `brand/oda-share-1200x630.png` as the social image (Settings > General > Social accounts / Meta data). Leave the logo empty: the theme draws the ODA mark and wordmark itself.
