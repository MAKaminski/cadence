#!/bin/sh
# Check a Cadence env file for settings that would break sign-in, without printing any value.
# Usage: sh deploy/check-env.sh deploy/.env   (exit 1 and say which line to fix)
f="${1:-deploy/.env}"
[ -f "$f" ] || { echo "check-env: $f not found (copy deploy/env.example and fill it in)"; exit 1; }
id=$(sed -n 's/^LINKEDIN_CLIENT_ID=//p' "$f" | tail -n 1 | tr -d '"'"'"' \r')
secret=$(sed -n 's/^LINKEDIN_CLIENT_SECRET=//p' "$f" | tail -n 1 | tr -d '"'"'"' \r')
case "$(printf '%s' "$id" | tr 'A-Z' 'a-z')" in
  ""|preview|build|ci|test|changeme|change-me|placeholder|todo|xxx|none|null)
    echo "check-env: LINKEDIN_CLIENT_ID in $f is empty or a placeholder. Set it to the Client ID from your LinkedIn app (Auth tab)."; exit 1 ;;
esac
printf '%s' "$id" | grep -Eq '^[A-Za-z0-9]{10,}$' || { echo "check-env: LINKEDIN_CLIENT_ID in $f doesn't look like a LinkedIn Client ID (letters and digits, 10 or more)."; exit 1; }
[ -n "$secret" ] || { echo "check-env: LINKEDIN_CLIENT_SECRET in $f is empty."; exit 1; }
echo "check-env: LinkedIn settings look right."
