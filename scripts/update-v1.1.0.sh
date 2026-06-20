#!/usr/bin/env bash
# devbuddy-update: v1.1.0
# Tag: # devbuddy-update
#
# Adds experimental phone control via ADB/Shizuku (Ollama only).
#
# Usage: bash update-v1.1.0.sh <target-version>

set -e

TARGET_VERSION="${1:-1.1.0}"
REPO="TheStrongestOfTomorrow/DevBuddy-CLI"

echo "[devbuddy-update] updating to v${TARGET_VERSION}"

echo "[devbuddy-update] running: npm install -g ${REPO}"
npm install -g "${REPO}" || {
  echo "[devbuddy-update] npm install failed. trying with --force…"
  npm install -g "${REPO}" --force || {
    echo "[devbuddy-update] ERROR: could not install. Aborting."
    exit 1
  }
}

# v1.1.0 migration: new config keys are optional with safe defaults.
# No breaking changes. New keys: phoneControlEnabled, phoneControlTrusted,
# phoneControlMode, phoneControlEnabledAt.

NEW_VERSION=$(devbuddy --version 2>/dev/null || echo "unknown")
echo "[devbuddy-update] installed version: ${NEW_VERSION}"

if [ "${NEW_VERSION}" = "v${TARGET_VERSION}" ] || [ "${NEW_VERSION}" = "${TARGET_VERSION}" ]; then
  echo "[devbuddy-update] ✓ success — v1.1.0"
  echo ""
  echo "[devbuddy-update] v1.1.0 new feature: phone control (experimental)"
  echo "  - Control your Android phone via ADB or Shizuku (rish)"
  echo "  - Ollama-only for safety (no data leaves your machine)"
  echo "  - Strict trust gate: type 'I trust this AI' to enable"
  echo "  - 11 phone tools: tap, swipe, type, screenshot, launch apps, etc."
  echo ""
  echo "  Enable:  devbuddy phone enable"
  echo "  Launch:  devbuddy --phone"
  exit 0
fi

echo "[devbuddy-update] ⚠ version mismatch (expected ${TARGET_VERSION}, got ${NEW_VERSION})"
exit 0
