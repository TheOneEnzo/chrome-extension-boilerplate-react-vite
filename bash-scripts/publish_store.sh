#!/bin/bash
# Build the extension zip and upload it to the Chrome Web Store, then submit it
# for review (Chrome Web Store API v2, via chrome-webstore-upload-cli).
#
# Usage (from the repo root):
#   pnpm publish:store                 # build, upload, submit for review
#   pnpm publish:store --upload-only   # build and upload a draft, don't submit
#   pnpm publish:store --skip-build    # reuse the newest zip in dist-zip/ (CI uses this)
#   pnpm publish:store --tag v2.7.0    # also check the tag matches manifest.ts
#
# Credentials come from the environment, or from a git-ignored `.env.store`
# file in the repo root (see PUBLISHING.md):
#   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_PUBLISHER_ID
#   CWS_EXTENSION_ID (optional, defaults to the Highlight Translator item id)

set -euo pipefail

cd "$(dirname "$0")/.."

CLI_PACKAGE="chrome-webstore-upload-cli@4.0.2"
DEFAULT_EXTENSION_ID="gmllfaeopfdgjekgcgfahamnoogkedec"

skip_build=false
upload_only=false
tag=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) skip_build=true ;;
    --upload-only) upload_only=true ;;
    --tag) tag="${2:-}"; shift ;;
    --tag=*) tag="${1#*=}" ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

# Local convenience: load store credentials from .env.store if present.
# It is matched by the `**/.env.*` rule in .gitignore, so it is never committed.
if [[ -f .env.store ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.store
  set +a
fi

missing=()
for var in CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_PUBLISHER_ID; do
  [[ -z "${!var:-}" ]] && missing+=("$var")
done
if (( ${#missing[@]} > 0 )); then
  echo "✖ Missing Chrome Web Store credentials: ${missing[*]}" >&2
  echo "  Set them in the environment or in .env.store (see PUBLISHING.md)." >&2
  exit 1
fi

if [[ "$skip_build" == false ]]; then
  if ! grep -qE '^CEB_API_KEY=.+' .env 2>/dev/null; then
    echo "✖ CEB_API_KEY (DeepL) is empty in .env; the published extension couldn't translate." >&2
    exit 1
  fi
  if ! grep -qE '^CEB_SUPABASE_KEY=.+' .env 2>/dev/null; then
    echo "✖ CEB_SUPABASE_KEY is empty in .env." >&2
    exit 1
  fi
  pnpm zip
fi

bash bash-scripts/check_release_version.sh ${tag:+"$tag"}

zip_file=$(ls -t dist-zip/*.zip 2>/dev/null | head -n 1 || true)
if [[ -z "$zip_file" ]]; then
  echo "✖ No zip found in dist-zip/. Run 'pnpm zip' first or drop --skip-build." >&2
  exit 1
fi

# Make sure the zip we're about to upload is the version we think it is.
zip_version=$(unzip -p "$zip_file" manifest.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).version))")
manifest_version=$(node -p "require('./dist/manifest.json').version")
if [[ "$zip_version" != "$manifest_version" ]]; then
  echo "✖ $zip_file contains version $zip_version, expected $manifest_version. Rebuild with 'pnpm zip'." >&2
  exit 1
fi

export CLIENT_ID="$CWS_CLIENT_ID"
export CLIENT_SECRET="$CWS_CLIENT_SECRET"
export REFRESH_TOKEN="$CWS_REFRESH_TOKEN"
export PUBLISHER_ID="$CWS_PUBLISHER_ID"
export EXTENSION_ID="${CWS_EXTENSION_ID:-$DEFAULT_EXTENSION_ID}"

echo "→ Uploading $zip_file (version $zip_version) to item $EXTENSION_ID"
pnpm dlx "$CLI_PACKAGE" upload --source "$zip_file"

if [[ "$upload_only" == true ]]; then
  echo "✔ Uploaded as a draft. Submit it from the dashboard, or rerun without --upload-only."
  exit 0
fi

echo "→ Submitting version $zip_version for review"
pnpm dlx "$CLI_PACKAGE" publish
echo "✔ Submitted. Google reviews it before it goes live; check the dashboard for status."
