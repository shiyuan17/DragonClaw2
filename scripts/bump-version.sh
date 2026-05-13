#!/bin/bash
# bump-version.sh — Sync release version across project manifests
# Usage: ./scripts/bump-version.sh 0.2.6

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 0.2.6"
    echo ""
    echo "Current versions:"
    echo "  package.json:      $(grep '"version"' package.json | head -1 | sed 's/.*: "//;s/".*//')"
    echo "  package-lock.json: $(grep '"version"' package-lock.json | head -1 | sed 's/.*: "//;s/".*//')"
    echo "  Cargo.toml:        $(grep '^version' src-tauri/Cargo.toml | sed 's/.*= "//;s/".*//')"
    echo "  tauri.conf.json:   $(grep '"version"' src-tauri/tauri.conf.json | sed 's/.*: "//;s/".*//')"
    echo ""
    echo "Frontend version display is read from Tauri getVersion(); do not edit App.tsx or SettingsTab.tsx."
    exit 1
fi

VERSION="$1"

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "❌ Invalid version format: $VERSION"
    echo "   Expected: X.Y.Z (e.g., 0.2.6)"
    exit 1
fi

echo "📦 Bumping version to $VERSION..."

# 1. npm manifests
node -e '
const fs = require("fs");
const version = process.argv[1];

function writeJson(file, update) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  update(data);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

writeJson("package.json", (data) => {
  data.version = version;
});

writeJson("package-lock.json", (data) => {
  data.version = version;
  if (data.packages && data.packages[""]) {
    data.packages[""].version = version;
  }
});
' "$VERSION"
echo "  ✅ package.json"
echo "  ✅ package-lock.json"

# 2. Cargo.toml (only the first version = line, not dependency versions)
sed -i "0,/^version = \"[^\"]*\"/s//version = \"$VERSION\"/" src-tauri/Cargo.toml
echo "  ✅ src-tauri/Cargo.toml"

# 3. tauri.conf.json
node -e '
const fs = require("fs");
const version = process.argv[1];
const file = "src-tauri/tauri.conf.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));
data.version = version;
fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
' "$VERSION"
echo "  ✅ src-tauri/tauri.conf.json"

echo ""
echo "🎉 All files updated to v$VERSION"
echo "   Next: git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/tauri.conf.json"
