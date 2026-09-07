#!/usr/bin/env bash
# devbuddy-update: v1.2.5
# Tag: # devbuddy-update
#
# v1.2.5: `devbuddy features` review command + reliability fixes.
#   New: devbuddy features (review every feature: configured? working?)
#   New: devbuddy features --json (machine-readable report for GitHub issues)
#   Fixed: history now actually records commands (keys masked)
#   Fixed: config set validates values (no more theme=banana)
#
# Usage: bash update-v1.2.5.sh <target-version>

set -e

TARGET_VERSION="${1:-1.2.5}"
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

NEW_VERSION=$(devbuddy --version 2>/dev/null || echo "unknown")
echo "[devbuddy-update] installed version: ${NEW_VERSION}"

if [ "${NEW_VERSION}" = "v${TARGET_VERSION}" ] || [ "${NEW_VERSION}" = "${TARGET_VERSION}" ]; then
  echo "[devbuddy-update] ✓ success — v1.2.5"
  echo ""
  echo "[devbuddy-update] v1.2.5 highlights:"
  echo "  New: devbuddy features (review every feature: configured? working?)"
  echo "  New: devbuddy features --json (machine-readable report for GitHub issues)"
  echo "  Fixed: history now actually records commands (keys masked)"
  echo "  Fixed: config set validates values (no more theme=banana)"
  echo "  Try: devbuddy features"
  exit 0
fi

echo "[devbuddy-update] ⚠ version mismatch (expected ${TARGET_VERSION}, got ${NEW_VERSION})"
exit 0
