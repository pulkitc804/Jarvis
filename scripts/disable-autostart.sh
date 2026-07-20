#!/usr/bin/env bash
# Undo scripts/enable-autostart.sh.
set -euo pipefail
LABEL="com.pulkit.jarvis"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl unload "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"
echo "✓ Auto-start disabled. (The server may still be running — 'scripts/jarvis stop' to stop it now.)"
