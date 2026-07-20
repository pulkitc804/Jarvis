#!/usr/bin/env bash
# Creates ~/Applications/Jarvis.app — a real double-clickable Mac app that
# starts the Jarvis server (if needed) and opens it in its own window.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP="$HOME/Applications/Jarvis.app"

echo "Building Jarvis (first run only)…"
(cd "$REPO_DIR" && npm run build >/dev/null 2>&1) || {
  echo "Build failed — run 'npm run build' in $REPO_DIR to see the error."; exit 1;
}

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Jarvis</string>
  <key>CFBundleDisplayName</key><string>Jarvis</string>
  <key>CFBundleIdentifier</key><string>com.pulkit.jarvis</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>Jarvis</string>
</dict></plist>
PLIST

cat > "$APP/Contents/MacOS/Jarvis" <<LAUNCH
#!/usr/bin/env bash
exec "$REPO_DIR/scripts/jarvis" open
LAUNCH
chmod +x "$APP/Contents/MacOS/Jarvis"

# Refresh Launch Services so the app appears immediately.
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$APP" >/dev/null 2>&1 || true

echo "✓ Installed $APP"
echo "  Open it from Spotlight (\"Jarvis\") or ~/Applications, then drag it to your Dock."
