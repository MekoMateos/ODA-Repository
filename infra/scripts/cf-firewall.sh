#!/usr/bin/env bash
# Allow ports 80/443 ONLY from Cloudflare, so nobody can bypass Cloudflare's DDoS
# protection by hitting the server IP directly. Docker bypasses ufw, so this uses
# the DOCKER-USER chain, which Docker always respects.
# Re-run monthly (cron) to pick up Cloudflare range changes.
set -euo pipefail

V4=$(curl -fsS https://www.cloudflare.com/ips-v4)
V6=$(curl -fsS https://www.cloudflare.com/ips-v6)
[ -n "$V4" ] || { echo "Could not fetch Cloudflare ranges; firewall unchanged." >&2; exit 1; }

for ipt in iptables ip6tables; do
  $ipt -N ODA-CF 2>/dev/null || $ipt -F ODA-CF
done

for net in $V4; do iptables  -A ODA-CF -s "$net" -p tcp -m multiport --dports 80,443 -j RETURN; done
for net in $V6; do ip6tables -A ODA-CF -s "$net" -p tcp -m multiport --dports 80,443 -j RETURN; done
iptables  -A ODA-CF -p tcp -m multiport --dports 80,443 -j DROP
ip6tables -A ODA-CF -p tcp -m multiport --dports 80,443 -j DROP

for ipt in iptables ip6tables; do
  $ipt -N DOCKER-USER 2>/dev/null || true
  $ipt -C DOCKER-USER -j ODA-CF 2>/dev/null || $ipt -I DOCKER-USER 1 -j ODA-CF
done

apt-get -y install iptables-persistent >/dev/null 2>&1 || true
netfilter-persistent save >/dev/null 2>&1 || true
echo "Web ports now accept Cloudflare only."
