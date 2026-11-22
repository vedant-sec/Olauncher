#!/usr/bin/env bash
# Build the "Progress Mirror" web app into the Android asset folder.
# Usage: scripts/build-web.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
WEB_DIR="${REPO_ROOT}/web"
ASSETS_DIR="${REPO_ROOT}/app/src/main/assets/mirror"

echo "==> Building Progress Mirror web app"
echo "    Web dir:    ${WEB_DIR}"
echo "    Output dir: ${ASSETS_DIR} (configured in web/vite.config.ts)"

cd "${WEB_DIR}"
echo "==> npm install"
npm install
echo "==> npm run build"
npm run build

echo "==> Done. Built web app into ${ASSETS_DIR}"
