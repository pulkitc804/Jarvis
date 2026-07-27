#!/usr/bin/env bash
# Build a self-contained Jarvis.app with electron-builder.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "① icon"; bash scripts/make-icon.sh || true
echo "② next build (standalone)"; npm run build
echo "③ package"; npx electron-builder --mac dir
echo
echo "✓ Done. Your app is at:"
ls -d "$DIR"/release/mac*/Jarvis.app 2>/dev/null || echo "  (check the release/ folder)"
