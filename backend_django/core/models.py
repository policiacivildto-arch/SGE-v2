import uuid

from django.db import models


class BaseModel(models.Model):
    """Campos compartilhados por todas as entidades de domínio do SGA.

    Replica o BaseEntity implícito em serverDb.ts (id, criado_em,
    atualizado_em). id é UUID por recomendação da avaliação de migração
    (AVALIACAO_MIGRACAO_DJANGO.md, seção 1) — os ids atuais em db.json
    não são UUIDs de fato, então isso vale para registros novos criados
    já em Django, não para uma migração de dados 1:1 dos ids antigos.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
