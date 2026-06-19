#!/usr/bin/env bash
# devbuddy-update: v0.5.5
# Tag: # devbuddy-update
#
# This script is fetched by devbuddy's auto-updater when updating TO v0.5.5.
# It handles the full update including any v0.5.5-specific migrations.
#
# Usage: bash update-v0.5.5.sh <target-version>
#   target-version: e.g. "0.5.5"

set -e

TARGET_VERSION="${1:-0.5.5}"
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

# 2. v0.5.5-specific migration: none needed (config schema unchanged from v0.5.1)
#    - MCP config is stored separately in ~/.devbuddy/mcp.json (new file, doesn't conflict)
#    - experimentalRemoteAI config key is optional, defaults to false

# 3. Verify the new version installed
NEW_VERSION=$(devbuddy --version 2>/dev/null || echo "unknown")
echo "[devbuddy-update] installed version: ${NEW_VERSION}"

if [ "${NEW_VERSION}" = "v${TARGET_VERSION}" ] || [ "${NEW_VERSION}" = "${TARGET_VERSION}" ]; then
  echo "[devbuddy-update] ✓ success"
  echo ""
  echo "[devbuddy-update] v0.5.5 new features:"
  echo "  - MCP server support (devbuddy mcp list/add/test)"
  echo "  - Experimental remote-AI connector (devbuddy remote ssh|claude)"
  echo "  - 5 new agent tools: grep_search, web_fetch, memory_update, git_diff, tree"
  echo "  - Configure MCP servers in ~/.devbuddy/mcp.json"
  exit 0
fi

echo "[devbuddy-update] ⚠ version mismatch (expected ${TARGET_VERSION}, got ${NEW_VERSION})"
exit 0
