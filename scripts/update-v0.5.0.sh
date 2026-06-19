#!/usr/bin/env bash
# devbuddy-update: v0.5.0
# Tag: # devbuddy-update
#
# This script is fetched by devbuddy's auto-updater when updating TO v0.5.0.
# It handles the full update including any v0.5.0-specific migrations.
#
# Usage: bash update-v0.5.0.sh <target-version>
#   target-version: e.g. "0.5.0"

set -e

TARGET_VERSION="${1:-0.5.0}"
REPO="TheStrongestOfTomorrow/DevBuddy-CLI"

echo "[devbuddy-update] updating to v${TARGET_VERSION}"

# 1. Install the new version from GitHub
echo "[devbuddy-update] running: npm install -g ${REPO}"
npm install -g "${REPO}" || {
  echo "[devbuddy-update] npm install failed. trying with --force…"
  npm install -g "${REPO}" --force || {
    echo "[devbuddy-update] ERROR: could not install. Aborting."
    exit 1
  }
}

# 2. v0.5.0-specific migration: none needed (config schema unchanged from v0.4)
# Future migrations would go here.

# 3. Verify the new version installed
NEW_VERSION=$(devbuddy --version 2>/dev/null || echo "unknown")
echo "[devbuddy-update] installed version: ${NEW_VERSION}"

if [ "${NEW_VERSION}" = "v${TARGET_VERSION}" ] || [ "${NEW_VERSION}" = "${TARGET_VERSION}" ]; then
  echo "[devbuddy-update] ✓ success"
  exit 0
fi

echo "[devbuddy-update] ⚠ version mismatch (expected ${TARGET_VERSION}, got ${NEW_VERSION})"
echo "[devbuddy-update] the install may have partially succeeded. try running 'devbuddy --version'."
exit 0  # don't fail the update just because version string format differs
