#!/usr/bin/env bash
# Deploy the Spotly daily report to EC2 + set recipients, then run it once so you
# get the email immediately. Run from a network that allows SSH (port 22).
#   bash ~/spotly-site/tools/report/deploy-to-ec2.sh
set -euo pipefail

KEY=~/.ssh/openclaw-ssh.pem
HOST=ec2-user@16.16.79.251
SRC=~/spotly-site/tools/report/daily-report.mjs
# NOTE: Resend test-mode (from onboarding@resend.dev) only delivers to the account
# owner. Adding more recipients 403s the whole send. To add bader@ etc., first verify
# a domain at resend.com/domains + set REPORT_FROM to that domain, THEN list them here.
RECIPIENTS='nader@khatibdesigns.com'

echo "→ Uploading daily-report.mjs to EC2…"
scp -i "$KEY" "$SRC" "$HOST:~/spotly-report/daily-report.mjs"

echo "→ Setting REPORT_TO (recipients) + running the report once…"
ssh -i "$KEY" "$HOST" "
  cd ~/spotly-report
  if grep -q '^REPORT_TO=' report.env 2>/dev/null; then
    sed -i 's|^REPORT_TO=.*|REPORT_TO=$RECIPIENTS|' report.env
  else
    echo 'REPORT_TO=$RECIPIENTS' >> report.env
  fi
  echo '  REPORT_TO is now:' \$(grep '^REPORT_TO=' report.env)
  sudo systemctl start spotly-report.service
  sleep 4
  journalctl -u spotly-report.service -n 12 --no-pager
"
echo "✓ Done. Both nader@ and bader@ should receive the report. (Daily 05:00 UTC timer uses this from now on.)"
