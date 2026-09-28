#!/usr/bin/env bash
# One-time setup of a fresh Oracle Cloud Always Free ARM VM (Oracle Linux 9 or Ubuntu 24.04). Run as the
# default user (opc on Oracle Linux, ubuntu on Ubuntu):
#   ssh -i ~/.ssh/cadence_oracle opc@IP 'bash -s' < deploy/setup-vm.sh
set -euo pipefail
. /etc/os-release
if [ "$ID" = "ol" ]; then
  sudo dnf install -y dnf-plugins-core git
  sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
  sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  # Oracle Linux runs firewalld; open HTTP and HTTPS (the VCN security list must allow them too).
  sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload
  # Security updates install themselves.
  sudo dnf install -y dnf-automatic
  sudo sed -i 's/^upgrade_type.*/upgrade_type = security/; s/^apply_updates.*/apply_updates = yes/' /etc/dnf/automatic.conf
  sudo systemctl enable --now dnf-automatic.timer
else
  sudo apt-get update -y && sudo apt-get install -y ca-certificates curl git
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin unattended-upgrades
  # Oracle's Ubuntu images block everything but SSH in iptables.
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save
fi
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
# 4 GB swap so the Next.js build fits in memory.
if [ ! -f /swapfile ]; then
  sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
[ -d ~/cadence ] || git clone https://github.com/MAKaminski/cadence.git ~/cadence
echo "Setup done. Next: create ~/cadence/deploy/.env from deploy/env.example."
