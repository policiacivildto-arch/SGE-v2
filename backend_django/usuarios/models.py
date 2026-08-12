import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    """Papel de acesso (RBAC) — distinto de `cargo` (patente/função,
    ex. "Delegado de Polícia"). Portado de AuthContext.jsx (SEED_USERS),
    que nunca teve equivalente persistido em serverDb.ts."""

    ADMIN = "admin", "Administrador"
    ARMEIRO = "armeiro", "Armeiro"
    ADMINISTRATIVO = "administrativo", "Administrativo"


class Usuario(AbstractUser):
    """AUTH_USER_MODEL customizado desde a Fase 1 para evitar troca de
    modelo de usuário depois de já existirem migrations (recomendação
    oficial do Django). AbstractUser já traz username/password/hash;
    os campos abaixo replicam a entidade Usuario de serverDb.ts.

    Login é por e-mail (Fase 3): `email` precisa ser único para a busca
    determinística em usuarios/views.py, mesmo com USERNAME_FIELD
    continuando "username" (Django admin/createsuperuser inalterados).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.ADMINISTRATIVO)
    nome = models.CharField(max_length=255, blank=True)
    cargo = models.CharField(max_length=100, blank=True)
    policial = models.ForeignKey(
        "cadastros.Policial", on_delete=models.SET_NULL,
        related_name="usuarios", null=True, blank=True,
    )
    departamento = models.ForeignKey(
        "cadastros.Departamento", on_delete=models.SET_NULL,
        related_name="usuarios", null=True, blank=True,
    )
    delegacia = models.ForeignKey(
        "cadastros.Delegacia", on_delete=models.SET_NULL,
        related_name="usuarios", null=True, blank=True,
    )
    ativo = models.BooleanField(default=True)

    def __str__(self):
        return self.username
