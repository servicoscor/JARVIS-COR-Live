#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="${REPO_PATH:-/var/www/html/JARVIS-COR-Live}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-4173}"
HOST="${HOST:-0.0.0.0}"
FORCE="${FORCE:-0}"

cd "$REPO_PATH"

echo "Buscando atualizacoes em origin/$BRANCH..."
git fetch origin "$BRANCH"

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [[ "$LOCAL" == "$REMOTE" && "$FORCE" != "1" ]]; then
  echo "Sem atualizacao nova. HEAD atual: $LOCAL"
  exit 0
fi

echo "Atualizando codigo..."
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

if [[ -f package-lock.json ]]; then
  echo "Instalando dependencias com npm ci..."
  npm ci
else
  echo "Instalando dependencias com npm install..."
  npm install
fi

echo "Gerando build..."
npm run build

echo "Reiniciando servico jarvis-cor..."
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl restart jarvis-cor
  sudo systemctl --no-pager --lines=20 status jarvis-cor
else
  pkill -f "node server.js" || true
  HOST="$HOST" PORT="$PORT" nohup node server.js > jarvis-cor.log 2>&1 &
  echo $! > .jarvis-server.pid
  echo "Servidor iniciado. PID $(cat .jarvis-server.pid)"
fi

echo "Deploy concluido: http://10.50.30.161:$PORT/"
