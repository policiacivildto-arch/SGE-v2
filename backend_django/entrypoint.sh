#!/bin/bash
# Entrypoint do container backend Django.
#
# Lê os segredos montados pelo Docker em /run/secrets/<var>_SGA_BACK,
# exporta como variável de ambiente (nome sem o sufixo) e grava em
# ~/.bashrc para qualquer subshell interativo também enxergar.
#
# config/settings.py (read_secret) já cai em os.getenv(secret_name)
# quando o arquivo /run/secrets/<nome> sem sufixo não existe — então
# basta exportar com o mesmo nome que o código já espera, sem precisar
# alterar settings.py.
set -euo pipefail

vars=(
    db_user
    db_password
    db_name
    django_secret_key
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

python manage.py migrate --noinput

# Garante os 3 usuários de teste (admin/armeiro/administrativo) sempre
# presentes com senha hasheada — idempotente (get_or_create + set_password),
# seguro rodar em todo boot. Dev/demo only, ver seed_usuarios.py.
python manage.py seed_usuarios

exec "$@"
