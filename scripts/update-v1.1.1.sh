#!/usr/bin/env bash
# devbuddy-update: v1.1.1
# Tag: # devbuddy-update
#
# Hotfix: updater timeout fix + --force-install flag.
#
# Usage: bash update-v1.1.1.sh <target-version>

set -e

TARGET_VERSION="${1:-1.1.1}"
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
  echo "[devbuddy-update] ✓ success — v1.1.1"
  echo ""
  echo "[devbuddy-update] v1.1.1 fix: updater timeout"
  echo "  - Increased GitHub API timeout from 4s to 15s"
  echo "  - Added retry (2 attempts) for API + script fetches"
  echo "  - New: devbuddy update --force-install (skips API check entirely)"
  echo "    useful when GitHub API times out or is rate-limited"
  exit 0
fi

echo "[devbuddy-update] ⚠ version mismatch (expected ${TARGET_VERSION}, got ${NEW_VERSION})"
exit 0
