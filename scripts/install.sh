#!/usr/bin/env bash
set -euo pipefail

REPO="github:TheStrongestOfTomorrow/DevBuddy-CLI"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js >= 18 is required." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js >= 18 is required. Found $(node --version)." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required." >&2
  exit 1
fi

echo "Installing the latest DevBuddy from GitHub..."
npm install --global "$REPO"

echo ""
echo "DevBuddy installed successfully: $(devbuddy --version 2>/dev/null || echo 'run devbuddy --help')"
