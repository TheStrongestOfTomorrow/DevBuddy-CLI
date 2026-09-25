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
  npm install
  npm install -g .
else
  echo "Downloading source archive..."
  curl -fsSL "$TARBALL_URL" -o "$TMP_DIR/devbuddy.tar.gz"
  mkdir -p "$TMP_DIR/devbuddy"
  tar -xzf "$TMP_DIR/devbuddy.tar.gz" -C "$TMP_DIR/devbuddy" --strip-components=1
  cd "$TMP_DIR/devbuddy"
  npm install
  npm install -g .
fi

rm -rf "$TMP_DIR"

GLOBAL_ROOT="$(npm root -g 2>/dev/null || echo "")"
PACKAGE_BIN=""

if [ -d "$GLOBAL_ROOT/@thestrongestoftomorrow/devbuddy/bin" ]; then
  PACKAGE_BIN="$GLOBAL_ROOT/@thestrongestoftomorrow/devbuddy/bin/devbuddy.js"
elif [ -d "$GLOBAL_ROOT/devbuddy/bin" ]; then
  PACKAGE_BIN="$GLOBAL_ROOT/devbuddy/bin/devbuddy.js"
fi

if [ -n "${PREFIX:-}" ] && [ -d "$PREFIX/bin" ] && [ -n "$PACKAGE_BIN" ] && [ -f "$PACKAGE_BIN" ]; then
  TERMUX_BIN="$PREFIX/bin/devbuddy"
  rm -f "$TERMUX_BIN"
  cat << WRAPPER > "$TERMUX_BIN"
#!/usr/bin/env sh
exec node "$PACKAGE_BIN" "$@"
WRAPPER
  chmod +x "$TERMUX_BIN"
fi

hash -r 2>/dev/null || true

echo ""
echo "✓ DevBuddy CLI installed successfully!"
echo "Version: $(devbuddy --version 2>/dev/null || node -p "require("./package.json").version" 2>/dev/null || echo "v1.3.0")"

if ! command -v devbuddy >/dev/null 2>&1; then
  echo ""
  echo "Note: If 'devbuddy' is not found on PATH, run:"
  echo "  export PATH="$(npm config get prefix)/bin:$PATH""
fi

echo "Run 'devbuddy onboard' to get started."
