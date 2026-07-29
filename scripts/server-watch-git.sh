#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="${REPO_PATH:-/var/www/html/JARVIS-COR-Live}"
BRANCH="${BRANCH:-main}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-60}"

echo "Monitorando origin/$BRANCH em $REPO_PATH a cada $INTERVAL_SECONDS segundos..."

while true; do
  if ! REPO_PATH="$REPO_PATH" BRANCH="$BRANCH" bash "$REPO_PATH/scripts/server-pull-deploy.sh"; then
    echo "Erro no deploy em $(date -Is)"
  fi
  sleep "$INTERVAL_SECONDS"
done
