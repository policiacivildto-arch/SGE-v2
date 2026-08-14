from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Role


class IsAdminRole(BasePermission):
    """Restringe a `UsuarioViewSet` a usuários com `role == Role.ADMIN`.

    Gestão de usuários não é regida pelas regras de `section` de
    `SGARolePermission` (cadastros/estoque/servicos) — é admin-only
    independente de seção.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == Role.ADMIN)

_ACTION_BY_METHOD = {
    "GET": "view",
    "HEAD": "view",
    "OPTIONS": "view",
    "POST": "add",
    "PUT": "edit",
    "PATCH": "edit",
    "DELETE": "delete",
}


def _is_owner(user, obj):
    """Réplica do fallback de AuthContext.jsx: sem dono registrado, permite.

    Usa `criado_por_id` quando existe (Item/Compra/Arma/BemIndividual/
    Servico); cai para `created_by` (string de e-mail, Cautela) senão.
    """
    creator_id = getattr(obj, "criado_por_id", None)
    if creator_id is not None:
        return str(creator_id) == str(user.id)
    created_by = getattr(obj, "created_by", None)
    if created_by:
        return created_by.strip().lower() == user.email.strip().lower()
    return True


class SGARolePermission(BasePermission):
    """Porta `can(action, section, record)` de src/context/AuthContext.jsx.

    Cada ViewSet declara `section` ("cadastros" | "estoque" | "servicos").
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role == Role.ADMIN:
            return True

        action = _ACTION_BY_METHOD.get(request.method)
        if action == "delete":
            return False

        section = getattr(view, "section", None)

        if user.role == Role.ARMEIRO:
            if section == "cadastros":
                return False
            if action in ("view", "add"):
                return section in ("servicos", "estoque")
            if action == "edit":
                return section == "servicos"
            return False

        if user.role == Role.ADMINISTRATIVO:
            if action in ("view", "add"):
                return True
            if action == "edit":
                return section == "estoque"
            return False

        return False

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role == Role.ADMIN:
            return True
        if request.method in SAFE_METHODS:
            return True
        action = _ACTION_BY_METHOD.get(request.method)
        if action != "edit":
            # delete já foi bloqueado em has_permission; add não é object-level.
            return True
        return _is_owner(user, obj)
