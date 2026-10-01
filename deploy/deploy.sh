#!/usr/bin/env bash
# Deploy main to the server: pull, check settings, rebuild, migrate, restart. Usage: CADENCE_HOST=opc@IP deploy/deploy.sh
set -euo pipefail
: "${CADENCE_HOST:?set CADENCE_HOST=opc@IP}"
# check-env.sh stops the deploy when the LinkedIn app ID is empty or a placeholder: sign-in would send
# people to LinkedIn's error page ("The passed in client_id is invalid"). It never prints the values.
ssh -i ~/.ssh/cadence_oracle "$CADENCE_HOST" 'cd ~/cadence && git pull --ff-only && sh deploy/check-env.sh deploy/.env && docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build && docker image prune -f'
