#!/usr/bin/env bash
# devbuddy-update: v1.3.0

set -e

TARGET_VERSION="${1:-1.3.0}"
REPO="TheStrongestOfTomorrow/DevBuddy-CLI"

echo "[devbuddy-update] updating to v${TARGET_VERSION}"
npm install -g "${REPO}"

NEW_VERSION=$(devbuddy --version 2>/dev/null || echo "unknown")
echo "[devbuddy-update] installed version: ${NEW_VERSION}"
