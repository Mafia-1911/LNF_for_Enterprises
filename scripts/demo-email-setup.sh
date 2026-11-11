#!/usr/bin/env bash
# Turns on real sign-in emails for the Vercel demo (docs/deploy-vercel.md#sign-in-emails).
# Run it yourself from the repo folder: it asks for the sending account and its password (typed
# hidden) and stores them in the Vercel project, so the password never lands in the repo, your shell
# history or a log. Then it rebuilds and redeploys, because Vercel applies new settings on deploy.
#   bash scripts/demo-email-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export VERCEL_TELEMETRY_DISABLED=1
vercel=(npx --yes vercel@65.14.0)

cat <<'TEXT'
Sign-in codes and alerts will be sent from one email account.
Gmail: turn on 2-Step Verification, then create an app password at
https://myaccount.google.com/apppasswords and paste it below (not your normal password).
Any other SMTP service works too; type its server and port.
TEXT
read -rp "SMTP server [smtp.gmail.com]: " host
host=${host:-smtp.gmail.com}
read -rp "Port [465]: " port
port=${port:-465}
read -rp "Sending email address: " user
read -rsp "Password or app password (hidden): " password
echo
if [[ "$user" != *@* || -z "$password" ]]; then
  echo "Both the sending address and its password are needed; run this again." >&2
  exit 1
fi
secure=false
[[ "$port" == 465 ]] && secure=true

# Values go in on stdin, so they don't show up in the process list either.
set_var() {
  local name=$1 value=$2
  shift 2
  printf '%s' "$value" | "${vercel[@]}" env add "$name" production --force "$@" >/dev/null
  echo "  saved $name"
}
echo "Saving the settings in Vercel (production):"
set_var SMTP_HOST "$host"
set_var SMTP_PORT "$port"
set_var SMTP_SECURE "$secure"
set_var SMTP_USER "$user"
set_var SMTP_PASSWORD "$password" --sensitive
set_var EMAIL_FROM "NSU Lost & Found <$user>"
set_var EMAIL_TRANSPORT smtp
unset password

echo "Rebuilding and deploying so the new settings take effect:"
pnpm build:vercel
"${vercel[@]}" deploy --prebuilt --prod
echo "Done. Open https://lnf-for-enterprises.vercel.app/sign-in, type your email and check your inbox."
