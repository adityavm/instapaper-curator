#!/usr/bin/env bash
# Removes the launchd job. Pass --purge to also delete data/ and logs/.
set -euo pipefail

LABEL="com.user.instapaper-curator"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "Uninstalled $LABEL"

if [[ "${1:-}" == "--purge" ]]; then
  rm -rf "$DIR/data" "$DIR/logs"
  echo "Removed data/ and logs/"
fi
