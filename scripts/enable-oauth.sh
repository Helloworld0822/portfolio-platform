#!/usr/bin/env bash
# Enable GitHub OAuth login for the portfolio platform.
#
# Usage (run from the repo root):
#   scripts/enable-oauth.sh <CLIENT_ID> <CLIENT_SECRET>
#
# This writes the credentials into .env (gitignored) and recreates the api
# container so the running site picks them up, keeping the site online.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ $# -ne 2 ]; then
  echo "usage: scripts/enable-oauth.sh <GITHUB_CLIENT_ID> <GITHUB_CLIENT_SECRET>" >&2
  exit 1
fi

CLIENT_ID="$1"
CLIENT_SECRET="$2"

if [ ! -f .env ]; then
  echo "error: .env not found. Run 'cp .env.example .env' first." >&2
  exit 1
fi

sed -i "s|^GITHUB_CLIENT_ID=.*|GITHUB_CLIENT_ID=${CLIENT_ID}|" .env
sed -i "s|^GITHUB_CLIENT_SECRET=.*|GITHUB_CLIENT_SECRET=${CLIENT_SECRET}|" .env

echo "wrote credentials to .env; recreating api + nginx so the config and
upstream DNS both refresh (recreating only api leaves nginx with a stale
container IP -> 502)..."
podman-compose up -d --force-recreate api nginx

echo "done. Verify: open https://blog.helloworld0822.site/admin and click GitHub으로 로그인"
echo "callback URL expected by GitHub: https://blog.helloworld0822.site/api/auth/github/callback"