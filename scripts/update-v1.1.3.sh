#!/usr/bin/env bash
# devbuddy-update: v1.1.3
# Tag: # devbuddy-update
set -e
TARGET_VERSION="${1:-1.1.3}"
REPO="TheStrongestOfTomorrow/DevBuddy-CLI"
echo "[devbuddy-update] updating to v${TARGET_VERSION}"
npm install -g "${REPO}" || npm install -g "${REPO}" --force || { echo "ERROR"; exit 1; }
NEW_VERSION=$(devbuddy --version 2>/dev/null || echo "unknown")
echo "[devbuddy-update] installed: ${NEW_VERSION}"
echo "[devbuddy-update] ✓ v1.1.3 — /thinking toggle in chat, --thinking flag on ask"
