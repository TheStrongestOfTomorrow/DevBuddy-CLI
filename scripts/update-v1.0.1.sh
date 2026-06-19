#!/usr/bin/env bash
# devbuddy-update: v1.0.1
# Tag: # devbuddy-update
#
# Hotfix release. Allows users to type a custom model ID during onboarding
# instead of picking from a fixed list (useful for downloaded Ollama models,
# fine-tunes, or any model not in DevBuddy's known list).
#
# Usage: bash update-v1.0.1.sh <target-version>

set -e

TARGET_VERSION="${1:-1.0.1}"
REPO="TheStrongestOfTomorrow/DevBuddy-CLI"

echo "[devbuddy-update] updating to v${TARGET_VERSION} (hotfix)"

# 1. Install the new version
echo "[devbuddy-update] running: npm install -g ${REPO}"
npm install -g "${REPO}" || {
  echo "[devbuddy-update] npm install failed. trying with --force…"
  npm install -g "${REPO}" --force || {
    echo "[devbuddy-update] ERROR: could not install. Aborting."
    exit 1
  }
}

# 2. v1.0.1 migration: none needed. Config schema unchanged from v1.0.0.
#    The only change is the onboarding model picker now offers a "type your
#    own model ID" option, and a new `devbuddy auth model` command.

# 3. Verify
NEW_VERSION=$(devbuddy --version 2>/dev/null || echo "unknown")
echo "[devbuddy-update] installed version: ${NEW_VERSION}"

if [ "${NEW_VERSION}" = "v${TARGET_VERSION}" ] || [ "${NEW_VERSION}" = "${TARGET_VERSION}" ]; then
  echo "[devbuddy-update] ✓ success — v1.0.1 hotfix applied"
  echo ""
  echo "[devbuddy-update] v1.0.1 changes:"
  echo "  - Onboarding model picker now has a 'Type your own model ID' option"
  echo "  - New command: devbuddy auth model <name> (set any model, no list restriction)"
  echo "  - Use it for downloaded Ollama models, fine-tunes, or unlisted models"
  exit 0
fi

echo "[devbuddy-update] ⚠ version mismatch (expected ${TARGET_VERSION}, got ${NEW_VERSION})"
exit 0
