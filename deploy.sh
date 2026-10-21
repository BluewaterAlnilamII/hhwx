#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

git pull --ff-only origin main
npm ci
NODE_OPTIONS="--max-old-space-size=1024" npm run build
pm2 restart hhwx
