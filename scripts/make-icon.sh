#!/usr/bin/env bash
# Render electron/icon.svg → icon.png (1024) → icon.icns (macOS app icon).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICONDIR="$DIR/electron"
SVG="$ICONDIR/icon.svg"
PNG="$ICONDIR/icon.png"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "$CHROME" ]; then echo "Chrome not found — skipping icon generation."; exit 0; fi

"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1024,1024 --default-background-color=00000000 \
  --screenshot="$PNG" "file://$SVG" >/dev/null 2>&1 || { echo "icon render failed"; exit 0; }

ICONSET="$ICONDIR/Jarvis.iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" "$PNG" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null 2>&1
  d=$((s * 2))
  sips -z "$d" "$d" "$PNG" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null 2>&1
done
iconutil -c icns "$ICONSET" -o "$ICONDIR/icon.icns" && echo "✓ electron/icon.icns"
rm -rf "$ICONSET"
