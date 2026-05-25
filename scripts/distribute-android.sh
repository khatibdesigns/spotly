#!/usr/bin/env bash
# Spotly — upload the latest release APK to Firebase App Distribution.
# Usage: scripts/distribute-android.sh "release notes..."
# Requires: `npx firebase-tools login` once (cached creds).
set -euo pipefail

NOTES="${1:-New Spotly build}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
APP_ID="1:1096688153950:android:8848ce305219a4a1d84bcf"
PROJECT="spotly-6ca9a"
GROUP="testers"

[ -f "$APK" ] || { echo "APK not found at $APK — run ./gradlew assembleRelease first"; exit 1; }

npx --yes firebase-tools appdistribution:distribute "$APK" \
  --app "$APP_ID" \
  --project "$PROJECT" \
  --release-notes "$NOTES" \
  --groups "$GROUP"
