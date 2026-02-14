#!/usr/bin/env bash
set -euo pipefail

base_branch="${BASE_BRANCH:-develop}"
current_branch="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$current_branch" == "main" || "$current_branch" == "develop" ]]; then
  echo "❌ Refusing to open PR from protected branch: $current_branch"
  exit 1
fi

echo "→ Pushing $current_branch"
git push -u origin "$current_branch"

remote_url="$(git config --get remote.origin.url)"
repo_path=""

if [[ "$remote_url" =~ ^git@github.com:(.+)\.git$ ]]; then
  repo_path="${BASH_REMATCH[1]}"
elif [[ "$remote_url" =~ ^https://github.com/(.+)\.git$ ]]; then
  repo_path="${BASH_REMATCH[1]}"
else
  echo "❌ Unsupported remote URL format: $remote_url"
  exit 1
fi

compare_url="https://github.com/${repo_path}/compare/${base_branch}...${current_branch}?expand=1"

pr_url=""
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  existing_pr="$(gh pr list --base "$base_branch" --head "$current_branch" --state open --json url --jq '.[0].url' 2>/dev/null || true)"
  if [[ -n "$existing_pr" ]]; then
    pr_url="$existing_pr"
  else
    pr_url="$(gh pr create --base "$base_branch" --head "$current_branch" --fill 2>/dev/null || true)"
  fi
fi

if [[ -n "$pr_url" ]]; then
  echo "✅ PR URL: $pr_url"
else
  echo "✅ Open this URL to create PR: $compare_url"
fi
