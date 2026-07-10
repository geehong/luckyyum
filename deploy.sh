#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="geehong@211.176.23.51"
REMOTE_PATH="~/LuckyYum"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "==> Pushing '$BRANCH' to origin"
git push origin "$BRANCH"

echo "==> Deploying on $REMOTE_HOST ($REMOTE_PATH)"
ssh "$REMOTE_HOST" "cd $REMOTE_PATH && git pull && docker-compose up -d --build"

echo "==> Done"
