#!/bin/bash
# Waits for the Kuwait sweep to finish, then Telegrams the result via openclaw.
# Runs ON EC2, detached (nohup) — survives the laptop closing / SSH dropping.
#   nohup bash sweep_notify.sh > sweep_notify.log 2>&1 < /dev/null &
LOG=/home/ec2-user/caption-proxy/sweep.log
TARGET=8851553014
OPENCLAW="$HOME/.nvm/versions/node/v22.22.2/bin/openclaw"

# Poll until the sweep prints its "Done" line OR the python process disappears.
until grep -q "^Done" "$LOG" 2>/dev/null || ! pgrep -f sweep_kuwait.py >/dev/null; do
  sleep 30
done

if grep -q "^Done" "$LOG" 2>/dev/null; then
  HEAD="✅ Spotly — Kuwait screening sweep FINISHED."
else
  HEAD="⚠️ Spotly — sweep process exited before printing Done (check sweep.log)."
fi

# Pull the headline numbers (collection totals + final keep/drop) from the log.
DETAILS=$(grep -E "^Collected|^Estimated Google|^Already screened|^Done" "$LOG" 2>/dev/null | tail -5)
LAST=$(grep "kept" "$LOG" 2>/dev/null | tail -1)

MSG="$HEAD

$DETAILS
last batch: $LAST"

"$OPENCLAW" message send --channel telegram --target "$TARGET" --message "$MSG"
