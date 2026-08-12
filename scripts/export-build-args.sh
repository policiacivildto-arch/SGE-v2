#!/bin/bash
# Carrega o .env local e exporta as variáveis não sensíveis necessárias
# em build-time (ex: VITE_API_BASE_URL, que o Vite embute no bundle
# durante `npm run build`).
#
# Uso:
#   source scripts/export-build-args.sh
#   docker compose build
#
# O `docker compose build` já lê o .env da raiz automaticamente para
# substituir ${VAR} no docker-compose.yml, mas este script existe para
# quando o build é feito fora do compose (ex: `docker build --build-arg`
# direto, ou em pipelines de CI que não usam docker compose).

set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Arquivo $ENV_FILE não encontrado." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api}"

echo "Build args exportados a partir de $ENV_FILE:"
echo "  VITE_API_BASE_URL=$VITE_API_BASE_URL"
