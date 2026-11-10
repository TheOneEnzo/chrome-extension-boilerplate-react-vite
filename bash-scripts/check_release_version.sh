#!/bin/bash
# Fails when the release tag and/or the built bundle don't match the version in
# chrome-extension/manifest.ts (the single source of truth for the store version).
#
# Usage:
#   bash bash-scripts/check_release_version.sh            # print manifest version, check dist/ if built
#   bash bash-scripts/check_release_version.sh v2.7.0     # also require the tag to match
#
# In GitHub Actions the tag is taken from GITHUB_REF_NAME when GITHUB_REF_TYPE=tag.

set -euo pipefail

cd "$(dirname "$0")/.."

MANIFEST_TS="chrome-extension/manifest.ts"
manifest_version=$(sed -nE "s/^[[:space:]]*version:[[:space:]]*['\"]([^'\"]+)['\"].*/\1/p" "$MANIFEST_TS" | head -n 1)

if [[ -z "$manifest_version" ]]; then
  echo "✖ Could not read 'version' from $MANIFEST_TS" >&2
  exit 1
fi

if [[ ! "$manifest_version" =~ ^[0-9]+(\.[0-9]+){0,3}$ ]]; then
  echo "✖ '$manifest_version' in $MANIFEST_TS is not a valid Chrome extension version (1-4 dot-separated integers)" >&2
  exit 1
fi

tag="${1:-}"
if [[ -z "$tag" && "${GITHUB_REF_TYPE:-}" == "tag" ]]; then
  tag="${GITHUB_REF_NAME:-}"
fi

if [[ -n "$tag" ]]; then
  tag_version="${tag#v}"
  if [[ "$tag_version" != "$manifest_version" ]]; then
    echo "✖ Tag '$tag' does not match version '$manifest_version' in $MANIFEST_TS." >&2
    echo "  Bump the version in $MANIFEST_TS (or fix the tag) so they agree." >&2
    exit 1
  fi
  echo "✔ Tag '$tag' matches manifest version $manifest_version"
else
  echo "ℹ No tag given; manifest version is $manifest_version"
fi

# If a build exists, make sure it is the build of this version (catches stale dist/).
if [[ -f dist/manifest.json ]]; then
  built_version=$(node -p "require('./dist/manifest.json').version")
  if [[ "$built_version" != "$manifest_version" ]]; then
    echo "✖ dist/manifest.json has version '$built_version', expected '$manifest_version'. Rebuild with 'pnpm zip'." >&2
    exit 1
  fi
  echo "✔ dist/manifest.json version matches ($built_version)"
fi
