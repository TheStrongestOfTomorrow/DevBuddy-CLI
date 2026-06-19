#!/usr/bin/env bash
# devbuddy-update: v1.0.0
# Tag: # devbuddy-update
#
# This script is fetched by devbuddy's auto-updater when updating TO v1.0.0.
# Major version bump — handles v0.5.x → v1.0.0 migration.
#
# Usage: bash update-v1.0.0.sh <target-version>

set -e

TARGET_VERSION="${1:-1.0.0}"
REPO="TheStrongestOfTomorrow/DevBuddy-CLI"

echo "[devbuddy-update] updating to v${TARGET_VERSION} (major release!)"

# 1. Install the new version from GitHub
echo "[devbuddy-update] running: npm install -g ${REPO}"
npm install -g "${REPO}" || {
  echo "[devbuddy-update] npm install failed. trying with --force…"
  npm install -g "${REPO}" --force || {
    echo "[devbuddy-update] ERROR: could not install. Aborting."
    exit 1
  }
}

# 2. v1.0.0 migration: new config keys are optional and default safely.
#    No breaking changes to existing config. New keys:
#    - theme: 'dark' (default)
#    - stream: true (default)
#    - experimentalActAsMcp: false (default)
#    These are auto-merged on first load via the DEFAULT_CONFIG spread.

# 3. Verify the new version installed
NEW_VERSION=$(devbuddy --version 2>/dev/null || echo "unknown")
echo "[devbuddy-update] installed version: ${NEW_VERSION}"

if [ "${NEW_VERSION}" = "v${TARGET_VERSION}" ] || [ "${NEW_VERSION}" = "${TARGET_VERSION}" ]; then
  echo "[devbuddy-update] ✓ success — welcome to v1.0.0!"
  echo ""
  echo "[devbuddy-update] v1.0.0 highlights:"
  echo "  - DevBuddy as MCP server (devbuddy act-as-mcp --transport sse)"
  echo "  - Text streaming in ask + chat REPL (tokens appear as they arrive)"
  echo "  - Ollama auth fix (no API key required for local Ollama)"
  echo "  - devbuddy commit — conventional commit messages from git diff"
  echo "  - devbuddy review — AI code review on diffs/commits"
  echo "  - devbuddy doctor — diagnose setup issues"
  echo "  - devbuddy history — command history across sessions"
  echo "  - Theme support (dark/light/auto) via config"
  echo ""
  echo "[devbuddy-update] Run 'devbuddy doctor' to verify your setup."
  exit 0
fi

echo "[devbuddy-update] ⚠ version mismatch (expected ${TARGET_VERSION}, got ${NEW_VERSION})"
exit 0
