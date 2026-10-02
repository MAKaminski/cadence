#!/usr/bin/env bash
# Deploy main to the server: pull, check settings, rebuild, migrate, restart. Usage: CADENCE_HOST=opc@IP deploy/deploy.sh
set -euo pipefail
: "${CADENCE_HOST:?set CADENCE_HOST=opc@IP}"
# check-env.sh prints which sign-in settings are set (never their values) and stops the deploy when
# BETTER_AUTH_URL, BETTER_AUTH_SECRET or POSTGRES_PASSWORD would break sign-in for everyone.
# The steps after the pull are deploy/remote-deploy.sh, the same ones automatic deploys run (disk check,
# settings check, build, migrate, restart, tidy).
ssh -i ~/.ssh/cadence_oracle "$CADENCE_HOST" 'cd ~/cadence && git pull --ff-only && SSH_ORIGINAL_COMMAND="deploy $(git rev-parse HEAD)" bash deploy/remote-deploy.sh'
