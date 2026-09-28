#!/usr/bin/env bash
# Deploy main to the server: pull, rebuild, migrate, restart. Usage: CADENCE_HOST=opc@IP deploy/deploy.sh
set -euo pipefail
: "${CADENCE_HOST:?set CADENCE_HOST=opc@IP}"
ssh -i ~/.ssh/cadence_oracle "$CADENCE_HOST" 'cd ~/cadence && git pull --ff-only && docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build && docker image prune -f'
