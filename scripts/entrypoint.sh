#!/bin/bash
# Entrypoint do container frontend/Node (server.ts).
#
# Desde a Fase 6 (PRD_BACKEND_DJANGO.md) este processo só serve o build
# estático do React e faz proxy de /api/* pro backend Django — não
# consome nenhum segredo próprio (SMTP passou a ser configurado no
# backend_django, que é quem envia e-mail de verdade).
set -euo pipefail

exec "$@"
