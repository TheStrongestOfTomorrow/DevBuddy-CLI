#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/TheStrongestOfTomorrow/DevBuddy-CLI.git"
TARBALL_URL="https://github.com/TheStrongestOfTomorrow/DevBuddy-CLI/archive/refs/heads/main.tar.gz"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js >= 18 is required." >&2
fi

NODE_MAJOR="$(node -p "process.versions.node.split(\".\")[0]")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js >= 18 is required. Found $(node --version)." >&2
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required." >&2
fi

echo "Installing DevBuddy CLI..."

TMP_DIR="$(mktemp -d)"

if command -v git >/dev/null 2>&1; then
  echo "Cloning repository..."
  git clone --depth 1 "$REPO_URL" "$TMP_DIR/devbuddy"
  cd "$TMP_DIR/devbuddy"
  npm install -g .
else
  echo "Downloading source archive..."
  curl -fsSL "$TARBALL_URL" -o "$TMP_DIR/devbuddy.tar.gz"
  mkdir -p "$TMP_DIR/devbuddy"
  tar -xzf "$TMP_DIR/devbuddy.tar.gz" -C "$TMP_DIR/devbuddy" --strip-components=1
  cd "$TMP_DIR/devbuddy"
  npm install -g .
fi

rm -rf "$TMP_DIR"

echo ""
echo "✓ DevBuddy CLI installed successfully!"
echo "Version: $(devbuddy --version 2>/dev/null || echo "v1.3.0")"
echo "Run 'devbuddy onboard' to get started."
