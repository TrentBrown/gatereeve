#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: publish-marketplace.sh <release-root> <remote-url> <source-tag>" >&2
  exit 2
fi

release_root="$1"
remote_url="$2"
source_tag="$3"

if [[ ! -f "$release_root/RELEASE.json" ]]; then
  echo "Release root is incomplete: $release_root" >&2
  exit 1
fi

publish_root="$(mktemp -d)"
trap 'rm -rf "$publish_root"' EXIT
cp -R "$release_root/." "$publish_root/"

git -C "$publish_root" init --initial-branch=marketplace >/dev/null
git -C "$publish_root" config user.name "github-actions[bot]"
git -C "$publish_root" config user.email \
  "41898282+github-actions[bot]@users.noreply.github.com"
git -C "$publish_root" add --all
git -C "$publish_root" commit -m "Publish $source_tag" >/dev/null
git -C "$publish_root" remote add origin "$remote_url"

if [[ "${WORKFLOW_PUBLISH_FAIL_BEFORE_PUSH:-0}" == "1" ]]; then
  echo "Injected publication failure before remote ref update" >&2
  exit 1
fi

git -C "$publish_root" push --force origin HEAD:marketplace
