#!/usr/bin/env bash
# OPT-IN: keeps the Jarvis server running in the background and restarts it on
# login/crash via a macOS LaunchAgent. Run scripts/disable-autostart.sh to undo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${JARVIS_PORT:-3000}"
NEXT="$REPO_DIR/node_modules/.bin/next"
LABEL="com.pulkit.jarvis"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "Building Jarvis…"
(cd "$REPO_DIR" && npm run build >/dev/null 2>&1) || { echo "Build failed."; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NEXT</string><string>start</string><string>-p</string><string>$PORT</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO_DIR</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$REPO_DIR/.jarvis.log</string>
  <key>StandardErrorPath</key><string>$REPO_DIR/.jarvis.log</string>
</dict></plist>
PLIST

launchctl unload "$PLIST" >/dev/null 2>&1 || true
launchctl load "$PLIST"
echo "✓ Auto-start enabled. Jarvis will run at http://localhost:$PORT and restart on login."
