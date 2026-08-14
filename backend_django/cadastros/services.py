import unicodedata

from .models import Departamento, Lotacao


def _norm(nome):
    """Mesma normalização usada em core/management/commands/migrar_db_json.py
    — sem acento, sem espaços nas pontas, minúsculo."""
    sem_acento = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode("ascii")
    return sem_acento.strip().lower()


def resolve_or_create_departamento(nome):
    """Resolve um Departamento pelo nome (normalizado, sem acento) ou
    cria um novo se não existir — mesma lógica de
    migrar_db_json._dep_by_nome, necessária porque o frontend
    (CadLotacoes.jsx, CadPoliciaisView em main.jsx) ainda envia
    `depto` como texto livre no create/update, não `departamento_id`."""
    if not nome or not nome.strip():
        return None
    chave = _norm(nome)
    match = next(
        (d for d in Departamento.objects.all() if _norm(d.nome) == chave), None
    )
    if match:
        return match
    return Departamento.objects.create(nome=nome.strip(), ativo=True)


def resolve_lotacao(nome):
    """Resolve uma Lotacao pelo nome (normalizado). Ao contrário de
    Departamento, não cria uma nova — Lotacao exige `departamento`
    (FK obrigatória) que não temos como inferir só do nome."""
    if not nome or not nome.strip():
        return None
    chave = _norm(nome)
    return next((l for l in Lotacao.objects.all() if _norm(l.nome) == chave), None)
