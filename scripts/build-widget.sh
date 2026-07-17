#!/usr/bin/env bash
# Build the WidgetKit extension as a universal, Developer ID-signed .appex and
# stage it at build/widget-ext/ for the Desk build's afterSign hook to embed.
# Requires full Xcode. Run before `npm run dist:widget`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IDENTITY="Developer ID Application: Randy Miguel (29528WCWRA)"
WIDGET="$ROOT/widget"
STAGE="$ROOT/build/widget-ext"
DERIVED="$WIDGET/relbuild"

echo "→ building universal extension (arm64 + x86_64)…"
rm -rf "$DERIVED"
xcodebuild -project "$WIDGET/SNSDeskWidgets.xcodeproj" \
  -scheme SNSDeskWidgets -configuration Release \
  -destination 'generic/platform=macOS' -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  ARCHS="arm64 x86_64" ONLY_ACTIVE_ARCH=NO build >/dev/null

SRC="$DERIVED/Build/Products/Release/S&S Desk Widgets.app/Contents/PlugIns/SNSDeskWidgetsExtension.appex"
echo "→ signing (Developer ID + hardened runtime + app-group entitlements)…"
mkdir -p "$STAGE"
rm -rf "$STAGE/SNSDeskWidgetsExtension.appex"
cp -R "$SRC" "$STAGE/"
codesign --force --options runtime --timestamp \
  --entitlements "$WIDGET/Widget/Widget.entitlements" \
  --sign "$IDENTITY" \
  "$STAGE/SNSDeskWidgetsExtension.appex"

codesign -dv --verbose=2 "$STAGE/SNSDeskWidgetsExtension.appex" 2>&1 | grep -iE "Authority=Developer ID|TeamIdentifier|runtime"
echo "✓ staged at $STAGE/SNSDeskWidgetsExtension.appex"

echo "→ building reload helper (universal, Developer ID)…"
swiftc -O -target arm64-apple-macos14  -framework WidgetKit "$WIDGET/reload-helper.swift" -o "$DERIVED/reload-arm64"
swiftc -O -target x86_64-apple-macos14 -framework WidgetKit "$WIDGET/reload-helper.swift" -o "$DERIVED/reload-x64"
lipo -create "$DERIVED/reload-arm64" "$DERIVED/reload-x64" -output "$STAGE/sns-widget-reload"
codesign --force --options runtime --timestamp --sign "$IDENTITY" "$STAGE/sns-widget-reload"
codesign -dv --verbose=2 "$STAGE/sns-widget-reload" 2>&1 | grep -iE "Authority=Developer ID|runtime"
echo "✓ staged at $STAGE/sns-widget-reload"
