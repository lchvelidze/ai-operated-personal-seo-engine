#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/git-start-feature.sh <type/short-description>

Examples:
  scripts/git-start-feature.sh feat/pr-automation
  scripts/git-start-feature.sh fix/login-timeout
EOF
}

branch_name="${1:-}"
if [[ -z "$branch_name" ]]; then
  usage
  exit 1
fi

if [[ ! "$branch_name" =~ ^(feat|fix|chore|docs|refactor|test)\/[a-z0-9._-]+$ ]]; then
  echo "❌ Invalid branch name: $branch_name"
  echo "Expected format: type/short-description (e.g. feat/pr-automation)"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Working tree is not clean. Commit or stash changes first."
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$branch_name"; then
  echo "❌ Local branch already exists: $branch_name"
  exit 1
fi

if git ls-remote --exit-code --heads origin "$branch_name" >/dev/null 2>&1; then
  echo "❌ Remote branch already exists: origin/$branch_name"
  exit 1
fi

echo "→ Switching to develop"
git checkout develop

echo "→ Syncing develop"
git pull --ff-only origin develop

echo "→ Creating branch $branch_name"
git checkout -b "$branch_name"

echo "✅ Ready on branch: $branch_name"
