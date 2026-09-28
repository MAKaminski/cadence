#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VM (Oracle Cloud Always Free, ARM). Run as the default user:
#   ssh ubuntu@IP 'bash -s' < deploy/setup-vm.sh
set -euo pipefail
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git
# Docker from Docker's own repository.
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"
# Oracle's Ubuntu images block everything but SSH in iptables; open HTTP and HTTPS (the VCN security list must allow them too).
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
# 4 GB swap so the Next.js build fits in memory.
if [ ! -f /swapfile ]; then sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab; fi
# Security updates install themselves.
sudo apt-get install -y unattended-upgrades
[ -d ~/cadence ] || git clone https://github.com/MAKaminski/cadence.git ~/cadence
echo "Setup done. Next: create ~/cadence/deploy/.env from deploy/env.example."
