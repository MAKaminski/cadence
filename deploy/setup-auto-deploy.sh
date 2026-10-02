#!/usr/bin/env bash
# One-time setup for automatic deploys (.github/workflows/deploy.yml). Run it on your own computer —
# the one that can already SSH to the server — not on the server:
#
#   CADENCE_HOST=opc@IP CADENCE_URL=https://cadence.example.com REPO=owner/cadence deploy/setup-auto-deploy.sh
#   (optional: SSH_KEY=~/.ssh/your_admin_key, default ~/.ssh/cadence_oracle)
#
# 1. Makes a deploy-only key (~/.ssh/cadence_deploy) and installs it on the server locked to
#    deploy/remote-deploy.sh: it can deploy main and nothing else (no shell, no port forwarding).
# 2. Checks it works ("status" through the locked key).
# 3. Puts CADENCE_SSH_KEY, CADENCE_HOST, CADENCE_KNOWN_HOSTS and CADENCE_URL in the GitHub repository with
#    the gh CLI when it's signed in; otherwise prints where to paste them (the private key goes to the
#    clipboard, never to the screen).
# Safe to run again: it reuses the key and doesn't add it twice.
set -euo pipefail
: "${CADENCE_HOST:?set CADENCE_HOST=user@server-ip}"
ADMIN_KEY="${SSH_KEY:-$HOME/.ssh/cadence_oracle}"
KEY="$HOME/.ssh/cadence_deploy"
IP="${CADENCE_HOST#*@}"
REPO="${REPO:-$(git remote get-url origin 2>/dev/null | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##' || true)}"
admin() { ssh -i "$ADMIN_KEY" -o BatchMode=yes "$CADENCE_HOST" "$@"; }

echo "1/4 Deploy key"
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -C cadence-github-deploy -f "$KEY"
echo "    $KEY ($(ssh-keygen -lf "$KEY.pub" | awk '{print $2}'))"

echo "2/4 Server: update the checkout and install the locked key"
admin 'cd ~/cadence && git pull --ff-only --quiet && test -x deploy/remote-deploy.sh' \
  || { echo "    deploy/remote-deploy.sh isn't on the server's main yet. Merge the automatic-deploys change first."; exit 1; }
HOME_DIR="$(admin 'printf %s "$HOME"')"
LINE="command=\"$HOME_DIR/cadence/deploy/remote-deploy.sh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $(cat "$KEY.pub")"
printf '%s\n' "$LINE" | admin 'f=~/.ssh/authorized_keys; if grep -q "cadence-github-deploy" "$f" 2>/dev/null; then cat >/dev/null; echo "    already installed"; else cat >> "$f"; chmod 600 "$f"; echo "    installed"; fi'

echo "3/4 Check: the locked key can ask for status and nothing else"
ssh -i "$KEY" -o BatchMode=yes -o IdentitiesOnly=yes "$CADENCE_HOST" status | sed 's/^/    /'
if ssh -i "$KEY" -o BatchMode=yes -o IdentitiesOnly=yes "$CADENCE_HOST" 'id' >/dev/null 2>&1; then echo "    WARNING: the key ran 'id' — the lock isn't in place"; exit 1; fi
echo "    a shell command was refused, as it should be"

# The server's host key, checked against the one this computer already trusts.
KNOWN="$(ssh-keyscan -T 10 "$IP" 2>/dev/null | grep -v '^#' || true)"
TRUSTED="$(ssh-keygen -F "$IP" 2>/dev/null | grep -v '^#' | awk '{print $3}' || true)"
match=0; for k in $(printf '%s\n' "$KNOWN" | awk '{print $3}'); do printf '%s\n' "$TRUSTED" | grep -qxF "$k" && match=1; done
[ "$match" = 1 ] || { echo "    The server's host key doesn't match ~/.ssh/known_hosts for $IP. Stopping."; exit 1; }

echo "4/4 GitHub settings${REPO:+ for $REPO}"
if [ -n "$REPO" ] && command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  gh secret set CADENCE_SSH_KEY -R "$REPO" < "$KEY"
  gh secret set CADENCE_HOST -R "$REPO" -b "$CADENCE_HOST"
  gh secret set CADENCE_KNOWN_HOSTS -R "$REPO" -b "$KNOWN"
  [ -n "${CADENCE_URL:-}" ] && gh variable set CADENCE_URL -R "$REPO" -b "$CADENCE_URL"
  echo "    done. Next merge to main deploys itself; or run it now: gh workflow run deploy -R $REPO"
else
  page="https://github.com/${REPO:-OWNER/REPO}/settings/secrets/actions"
  echo "    Add these at $page (New repository secret):"
  echo "      CADENCE_HOST         $CADENCE_HOST"
  echo "      CADENCE_KNOWN_HOSTS  (the lines below)"; printf '%s\n' "$KNOWN" | sed 's/^/                           /'
  if command -v pbcopy >/dev/null; then pbcopy < "$KEY"; echo "      CADENCE_SSH_KEY      is on your clipboard now: paste it as the value"
  else echo "      CADENCE_SSH_KEY      the whole of $KEY (cat it into the box; don't share it elsewhere)"; fi
  [ -n "${CADENCE_URL:-}" ] && echo "    And on the Variables tab: CADENCE_URL = $CADENCE_URL"
fi
