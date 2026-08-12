#!/bin/bash
# Entrypoint do container frontend/Node (server.ts).
#
# Lê os segredos montados pelo Docker em /run/secrets/<VAR>_SGA_BACK,
# exporta como variável de ambiente (nome sem o sufixo) e grava em
# ~/.bashrc para qualquer subshell interativo também enxergar.
#
# Convenção pedida pela infra: cada secret do Docker Compose deve ter
# `target: <VAR>_SGA_BACK` para aparecer aqui com esse nome.
set -euo pipefail

vars=(
    SMTP_PASS
)

bashrc_additions=""
for var in "${vars[@]}"; do
    secret_file="/run/secrets/${var}_SGA_BACK"
    if [ -f "$secret_file" ]; then
        val="$(< "$secret_file")"
        export "$var"="$val"
        bashrc_additions+="export $var=\"$val\"\n"
    else
        echo "Aviso: secret $secret_file não encontrado, $var não será definido." >&2
    fi
done

if [ -n "$bashrc_additions" ]; then
    printf "%b" "$bashrc_additions" >> ~/.bashrc
fi

exec "$@"
