#!/usr/bin/env bash
# devbuddy-update: v1.1.2
# Tag: # devbuddy-update
#
# Hotfix: custom rish path for phone control (Shizuku mode).
#
# Usage: bash update-v1.1.2.sh <target-version>

set -e

TARGET_VERSION="${1:-1.1.2}"
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
  echo "[devbuddy-update] ✓ success — v1.1.2"
  echo ""
  echo "[devbuddy-update] v1.1.2: custom rish path for phone control"
  echo "  - New: devbuddy phone rish-path <path>  (set custom rish binary location)"
  echo "  - New: --rish-path flag on 'phone enable'"
  echo "  - Useful when rish (Shizuku) isn't on PATH"
  echo "  - Example: devbuddy phone rish-path /data/data/moe.shizuku.privileged.api/start.sh"
  exit 0
fi

echo "[devbuddy-update] ⚠ version mismatch (expected ${TARGET_VERSION}, got ${NEW_VERSION})"
exit 0
