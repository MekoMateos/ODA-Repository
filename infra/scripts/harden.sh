#!/usr/bin/env bash
# One-time hardening for a fresh Ubuntu 24.04 server (Hetzner).
# Run as root once:  bash harden.sh <deploy-user> "<ssh-public-key>"
set -euo pipefail

DEPLOY_USER="${1:?usage: harden.sh <deploy-user> \"<ssh-public-key>\"}"
PUBKEY="${2:?ssh public key required}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get -y install ufw fail2ban unattended-upgrades curl ca-certificates gnupg restic jq

# --- Deploy user: SSH key only, sudo for docker work ---
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
echo "$PUBKEY" > "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

# --- SSH: no root login, no passwords ---
cat > /etc/ssh/sshd_config.d/99-oda.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 20
AllowUsers $DEPLOY_USER
X11Forwarding no
EOF
systemctl restart ssh

# --- Automatic security updates ---
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# --- fail2ban for SSH ---
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 4
bantime = 1h
EOF
systemctl enable --now fail2ban

# --- Docker (official repo) ---
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker "$DEPLOY_USER"

# Docker publishes ports around ufw, so web ports are locked to Cloudflare by cf-firewall.sh.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

bash "$(dirname "$0")/cf-firewall.sh"

echo "Hardening done. Log in as $DEPLOY_USER with your SSH key before closing this session."
