#!/bin/sh
# Check a Cadence env file for settings that would break sign-in, without printing any value.
# Usage: sh deploy/check-env.sh deploy/.env
# Prints one line per setting. Exits 1 (and deploy/deploy.sh stops) only when sign-in would break for
# everyone (URL, secret, database); a missing LinkedIn app, Resend or Stripe is a warning. Mirrors src/lib/setup-check.ts.
f="${1:-deploy/.env}"
[ -f "$f" ] || { echo "check-env: $f not found (copy deploy/env.example and fill it in)"; exit 1; }
val() { sed -n "s/^$1=//p" "$f" | tail -n 1 | sed 's/^["'"'"']//; s/["'"'"']$//' | tr -d '\r'; }
lower() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }
placeholder() { case "$(lower "$(printf '%s' "$1" | tr -d ' ')")" in ""|preview|build|ci|test|changeme|change-me|placeholder|todo|xxx|none|null) return 0 ;; esac; return 1; }
fail=0; warned=0
ok()   { echo "ok     $1"; }
warn() { echo "warn   $1"; warned=1; }
err()  { echo "ERROR  $1"; fail=1; }

url=$(val BETTER_AUTH_URL); domain=$(val DOMAIN)
host=$(printf '%s' "$url" | sed -n 's#^https://\([^/]*\).*#\1#p')
if [ -z "$host" ]; then err "BETTER_AUTH_URL must be https://YOUR_DOMAIN (sign-in links, cookies and redirects are built from it)."
elif [ -n "$domain" ] && [ "$host" != "$domain" ]; then err "BETTER_AUTH_URL's host must be DOMAIN exactly ($domain); otherwise sign-in goes to the wrong site."
else ok "BETTER_AUTH_URL"; fi

secret=$(val BETTER_AUTH_SECRET)
if [ "${#secret}" -lt 32 ]; then err "BETTER_AUTH_SECRET needs 32+ characters (openssl rand -base64 48)."; else ok "BETTER_AUTH_SECRET"; fi
[ -n "$(val POSTGRES_PASSWORD)" ] && ok "POSTGRES_PASSWORD" || err "POSTGRES_PASSWORD is empty."

li=0
id=$(val LINKEDIN_CLIENT_ID); lsecret=$(val LINKEDIN_CLIENT_SECRET)
if placeholder "$id"; then warn "LINKEDIN_CLIENT_ID is empty or a placeholder (e.g. \"preview\"): LinkedIn sign-in and publishing stay hidden. Copy it from your LinkedIn app's Auth tab."
elif ! printf '%s' "$id" | grep -Eq '^[A-Za-z0-9]{10,}$'; then warn "LINKEDIN_CLIENT_ID doesn't look like a LinkedIn Client ID (letters and digits, 10 or more): LinkedIn stays hidden."
elif placeholder "$lsecret"; then warn "LINKEDIN_CLIENT_SECRET is empty or a placeholder: LinkedIn stays hidden."
else li=1; ok "LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET (redirect URL in the LinkedIn app: ${url%/}/api/auth/callback/linkedin)"; fi

em=0
from=$(val EMAIL_FROM)
if [ -z "$(val RESEND_API_KEY)" ]; then warn "RESEND_API_KEY is empty: no email sign-in."
elif ! printf '%s' "$from" | grep -Eq '@[^@ >]+\.[^@ >]+'; then warn "EMAIL_FROM must be a sender on a domain verified in Resend, e.g. Cadence <hello@$domain>: no email sign-in."
else em=1; ok "RESEND_API_KEY, EMAIL_FROM"; fi

# Not a reason to stop the deploy: the new build says on /login what is missing, and the owner can still
# get in with `pnpm signin:link` (see README). Keeping an older build running would hide the problem.
if [ "$li" = 0 ] && [ "$em" = 0 ]; then warn "NOBODY CAN SIGN IN until the LinkedIn keys or RESEND_API_KEY and EMAIL_FROM are set. Meanwhile, on the server: docker compose -f deploy/compose.yml --env-file deploy/.env run --rm web pnpm signin:link you@example.com"; fi

case "$(val STRIPE_SECRET_KEY)" in sk_*) s1=1 ;; *) s1=0 ;; esac
case "$(val STRIPE_WEBHOOK_SECRET)" in whsec_*) s2=1 ;; *) s2=0 ;; esac
case "$(val STRIPE_PRICE_ID)" in price_*) s3=1 ;; *) s3=0 ;; esac
if [ "$s1$s2$s3" = 111 ]; then ok "STRIPE_*"; else warn "STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_ID missing: new accounts stop at the trial step (/checkout)."; fi

if [ "$fail" = 1 ]; then echo "check-env: fix the ERROR lines in $f, then deploy again."; exit 1; fi
[ "$warned" = 1 ] && echo "check-env: nothing blocks the deploy; fix the warn lines when you can." || echo "check-env: sign-in settings look right."
