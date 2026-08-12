#!/bin/bash
# Entrypoint do container backend Python.
#
# Lê os segredos montados pelo Docker em /run/secrets/<var>_SGA_BACK,
# exporta como variável de ambiente (nome sem o sufixo) e grava em
# ~/.bashrc para qualquer subshell interativo também enxergar.
#
# Os nomes aqui são minúsculos de propósito: database.py (read_secret)
# já cai em os.getenv(secret_name) quando o arquivo /run/secrets/<nome>
# sem sufixo não existe — então basta exportar com o mesmo nome que o
# código já espera, sem precisar alterar database.py.
set -euo pipefail

vars=(
    db_user
    db_password
    db_name
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
