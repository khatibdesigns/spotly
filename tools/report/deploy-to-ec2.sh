#!/usr/bin/env bash
# Deploy the Spotly daily report to EC2 + set sender/recipients, then run it once.
# Run from a network that allows SSH (port 22).
#   bash ~/spotly-site/tools/report/deploy-to-ec2.sh
set -euo pipefail

KEY=~/.ssh/openclaw-ssh.pem
HOST=ec2-user@16.16.79.251
SRC=~/spotly-site/tools/report/daily-report.mjs

# Sender must be on a Resend-verified domain (send.meetspotly.com is verified).
FROM='Spotly Reports <reports@send.meetspotly.com>'
RECIPIENTS='nader@khatibdesigns.com,bader.zayat@gmail.com'

echo "→ Uploading daily-report.mjs to EC2…"
scp -i "$KEY" "$SRC" "$HOST:~/spotly-report/daily-report.mjs"

echo "→ Setting REPORT_FROM + REPORT_TO and running the report once…"
ssh -i "$KEY" "$HOST" "
  cd ~/spotly-report
  grep -q '^REPORT_FROM=' report.env && sed -i 's|^REPORT_FROM=.*|REPORT_FROM=$FROM|' report.env || echo 'REPORT_FROM=$FROM' >> report.env
  grep -q '^REPORT_TO=' report.env   && sed -i 's|^REPORT_TO=.*|REPORT_TO=$RECIPIENTS|' report.env || echo 'REPORT_TO=$RECIPIENTS' >> report.env
  grep -E '^REPORT_(FROM|TO)=' report.env
  sudo systemctl start spotly-report.service
  sleep 4
  journalctl -u spotly-report.service -n 8 --no-pager | grep -iE 'Sent via|error|403' || true
"
echo "✓ Done. nader@ + bader@ both receive the report (daily 05:00 UTC timer uses this)."
