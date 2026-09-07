#!/usr/bin/env bash
# devbuddy-update: v1.1.5
# Tag: # devbuddy-update
#
# Hotfix: custom rish path is now honored by all phone tools, and quoted
# so paths with spaces work.
#
# Usage: bash update-v1.1.5.sh <target-version>

set -e

TARGET_VERSION="${1:-1.1.5}"
REPO="TheStrongestOfTomorrow/DevBuddy-CLI"

echo "[devbuddy-update] updating to v${TARGET_VERSION} (hotfix)"

echo "[devbuddy-update] running: npm install -g ${REPO}"
npm install -g "${REPO}" || {
  echo "[devbuddy-update] npm install failed. trying with --force…"
  npm install -g "${REPO}" --force || {
    echo "[devbuddy-update] ERROR: could not install. Aborting."
    exit 1
  }
}

NEW_VERSION=$(devbuddy --version 2>/dev/null || echo "unknown")
echo "[devbuddy-update] installed version: ${NEW_VERSION}"

if [ "${NEW_VERSION}" = "v${TARGET_VERSION}" ] || [ "${NEW_VERSION}" = "${TARGET_VERSION}" ]; then
  echo "[devbuddy-update] ✓ success — v1.1.5"
  echo ""
  echo "[devbuddy-update] v1.1.5: rish path fixes for phone control"
  echo "  - Fixed: phone_devices now uses your custom rish path (was ignored)"
  echo "  - Fixed: rish paths with spaces no longer break phone tools"
  echo "  - Set path: devbuddy phone rish-path /path/to/rish"
  exit 0
fi

echo "[devbuddy-update] ⚠ version mismatch (expected ${TARGET_VERSION}, got ${NEW_VERSION})"
exit 0
