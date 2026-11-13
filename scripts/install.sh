#!/usr/bin/env bash
# Installs the launchd job. Usage: scripts/install.sh [times...]
# Times are 24h "H" or "HH:MM"; default: 07:00 12:00 17:00 20:00. Example: scripts/install.sh 6:30 18
set -euo pipefail

LABEL="com.user.instapaper-curator"
TIMES=("$@")
[[ ${#TIMES[@]} -gt 0 ]] || TIMES=(7 12 17 20)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

SCHEDULE=""
LABELS=()
for t in "${TIMES[@]}"; do
  [[ "$t" =~ ^([0-9]{1,2})(:([0-9]{2}))?$ ]] || { echo "bad time '$t' (use H or HH:MM, 24h)"; exit 1; }
  h=$((10#${BASH_REMATCH[1]})); m=$((10#${BASH_REMATCH[3]:-0}))
  (( h < 24 && m < 60 )) || { echo "bad time '$t'"; exit 1; }
  SCHEDULE+="    <dict><key>Hour</key><integer>$h</integer><key>Minute</key><integer>$m</integer></dict>"$'\n'
  LABELS+=("$(printf '%02d:%02d' "$h" "$m")")
done
BUN="$(command -v bun)" || { echo "bun not found in PATH"; exit 1; }
PI="$(command -v pi)" || { echo "pi not found in PATH"; exit 1; }
[[ -f "$DIR/config.yaml" ]] || { echo "Missing config.yaml (copy config.example.yaml)"; exit 1; }
[[ -f "$DIR/.env" ]] || { echo "Missing .env (copy .env.example)"; exit 1; }

(cd "$DIR" && "$BUN" install)
mkdir -p "$DIR/logs" "$HOME/Library/LaunchAgents"

# launchd has a minimal PATH; include the dirs holding bun and pi (and pi's node).
JOB_PATH="$(dirname "$BUN"):$(dirname "$PI"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$BUN</string><string>run</string><string>src/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$JOB_PATH</string>
  </dict>
  <key>StartCalendarInterval</key><array>
$SCHEDULE  </array>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$DIR/logs/launchd.out</string>
  <key>StandardErrorPath</key><string>$DIR/logs/launchd.err</string>
</dict></plist>
PLIST
plutil -lint "$PLIST" >/dev/null

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"

echo "Installed: runs daily at ${LABELS[*]} (and now). Logs: $DIR/logs/curator.log"
echo "Run now:   launchctl kickstart $DOMAIN/$LABEL"
