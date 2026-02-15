#!/usr/bin/env bash
set -euo pipefail

allowed_types="feat fix chore docs refactor test"

echo "Conventional Commit helper"
echo "Allowed types: $allowed_types"

if git diff --cached --quiet; then
  read -r -p "No staged changes. Stage everything with 'git add -A'? [y/N] " stage_all
  if [[ "$stage_all" =~ ^[Yy]$ ]]; then
    git add -A
  fi
fi

if git diff --cached --quiet; then
  echo "❌ No staged changes. Nothing to commit."
  exit 1
fi

read -r -p "Type (feat/fix/chore/docs/refactor/test): " type
if [[ ! " $allowed_types " =~ " $type " ]]; then
  echo "❌ Invalid type: $type"
  exit 1
fi

read -r -p "Scope (optional, e.g. api or web/auth): " scope
read -r -p "Summary (imperative, lowercase start): " summary

if [[ -z "$summary" ]]; then
  echo "❌ Summary is required."
  exit 1
fi

header="$type: $summary"
if [[ -n "$scope" ]]; then
  header="$type($scope): $summary"
fi

if [[ ! "$header" =~ ^(feat|fix|chore|docs|refactor|test)(\([a-z0-9._/-]+\))?:\ [^[:space:]].+$ ]]; then
  echo "❌ Commit header failed validation: $header"
  echo "Expected: type(scope): summary"
  exit 1
fi

echo
echo "Commit message: $header"
read -r -p "Create commit? [Y/n] " confirm
if [[ "$confirm" =~ ^[Nn]$ ]]; then
  echo "Canceled."
  exit 1
fi

git commit -m "$header"
echo "✅ Commit created."
