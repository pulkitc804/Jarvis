#!/usr/bin/env bash
# Creates ~/Applications/Jarvis.app — a native Electron desktop app (its own
# window, own icon, own process — not a browser) that runs the local Jarvis
# server. Everything stays on this Mac; nothing is exposed to anyone else.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP="$HOME/Applications/Jarvis.app"
ELECTRON="$REPO_DIR/node_modules/.bin/electron"

if [ ! -x "$ELECTRON" ]; then
  echo "Electron isn't installed. Run:  npm install   then re-run this."; exit 1
fi

echo "① Building the icon…"; bash "$SCRIPT_DIR/make-icon.sh" || true
echo "② Building Jarvis (first run only)…"
(cd "$REPO_DIR" && npm run build >/dev/null 2>&1) || {
  echo "Build failed — run 'npm run build' in $REPO_DIR to see the error."; exit 1;
}

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
[ -f "$REPO_DIR/electron/icon.icns" ] && cp "$REPO_DIR/electron/icon.icns" "$APP/Contents/Resources/Jarvis.icns"

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
  <key>CFBundleIconFile</key><string>Jarvis</string>
</dict></plist>
PLIST

# Launcher: run the native Electron app pointed at this repo.
cat > "$APP/Contents/MacOS/Jarvis" <<LAUNCH
#!/usr/bin/env bash
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:\$PATH"
exec "$ELECTRON" "$REPO_DIR"
LAUNCH
chmod +x "$APP/Contents/MacOS/Jarvis"

/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$APP" >/dev/null 2>&1 || true

echo "✓ Installed $APP"
echo "  Open 'Jarvis' from Spotlight or ~/Applications and drag it to your Dock."
echo "  It runs entirely on this Mac — private to you."
