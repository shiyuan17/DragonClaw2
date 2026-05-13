#!/bin/bash
# release.sh — Release helper: bump + verify + commit + annotated tag
# Usage: ./scripts/release.sh 0.2.6 "chore(release): bump version to v0.2.6"

set -e

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <version> <commit-message>"
    echo "Example: $0 0.2.6 \"feat: add settings page\""
    exit 1
fi

VERSION="$1"
MESSAGE="$2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🚀 Release Pipeline v$VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CURRENT_BRANCH="$(git branch --show-current)"
if [ "$CURRENT_BRANCH" != "v2-dev" ]; then
    echo "❌ Release must start from v2-dev. Current branch: $CURRENT_BRANCH"
    exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Working tree is not clean. Commit or stash unrelated changes before release."
    git status --short
    exit 1
fi

# Step 1: Bump version
echo ""
echo "📦 Step 1/5: Bump version"
bash "$SCRIPT_DIR/bump-version.sh" "$VERSION"

# Step 2: Run quality gates
echo ""
echo "🧪 Step 2/5: Running quality gates"
npm run test:ci

# Step 3: Build release package
echo ""
echo "🔨 Step 3/5: Building release package..."
npm run tauri -- build
echo "  ✅ Build completed"

# Step 4: Commit and tag
echo ""
echo "📝 Step 4/5: Committing..."
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "$MESSAGE"
git tag -a "v$VERSION" -m "DragonClaw v$VERSION"
echo "  ✅ Tagged v$VERSION"

# Step 5: Print push instructions
echo ""
echo "🚀 Step 5/5: Push manually after reviewing the commit:"
echo "   git push origin v2-dev"
echo "   git checkout main"
echo "   git merge v2-dev"
echo "   git push origin main"
echo "   git push origin v$VERSION"
echo "   git checkout v2-dev"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Local release prep for v$VERSION complete."
echo "   The v* tag push will trigger GitHub Release builds."
echo "   Check: https://github.com/shiyuan17/DragonClaw2/actions"
