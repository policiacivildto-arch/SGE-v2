from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Usuario


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    list_display = ("username", "nome", "cargo", "departamento", "delegacia", "ativo", "is_staff")
    search_fields = ("username", "nome", "email")
    list_filter = ("departamento", "delegacia", "ativo", "is_staff")
    fieldsets = UserAdmin.fieldsets + (
        ("Dados SGA", {"fields": ("nome", "cargo", "policial", "departamento", "delegacia", "ativo")}),
    )
