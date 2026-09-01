#!/bin/bash
# Spotly — iOS archive + App Store upload pipeline.
# Reusable: bump CFBundleVersion in ios/Spotly/Info.plist first, then run this.
# NOTE: never `rm -rf ios/build` — RN codegen lives there. Only clear archive/export.
set -e
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd ~/spotly

ARCHIVE=ios/build/Spotly.xcarchive
EXPORT=ios/build/export
KEY_ID=3N8W57HBHM
ISSUER=69a6de89-0c8c-47e3-e053-5b8c7c11a4d1
VER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" ios/Spotly/Info.plist)

echo "════════ Shipping build $VER ════════"
rm -rf "$ARCHIVE" "$EXPORT"

echo "──── [1/3] archive ────"
xcodebuild -workspace ios/Spotly.xcworkspace -scheme Spotly \
  -configuration Release -archivePath "$ARCHIVE" \
  -destination 'generic/platform=iOS' \
  archive | tail -3

echo "──── [2/3] export ────"
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist exportOptions.plist -exportPath "$EXPORT" | tail -3

IPA=$(ls "$EXPORT"/*.ipa | head -1)
echo "IPA: $IPA"

echo "──── [3/3] upload ────"
xcrun iTMSTransporter -m upload -assetFile "$IPA" \
  -apiKey "$KEY_ID" -apiIssuer "$ISSUER" 2>&1 | tail -8

echo "✅ UPLOADED build $VER"
