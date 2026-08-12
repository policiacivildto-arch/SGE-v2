from django.contrib import admin

from .models import Cautela, Movimento, Servico


@admin.register(Servico)
class ServicoAdmin(admin.ModelAdmin):
    list_display = ("codigo", "policial_nome", "matricula", "tipo", "status", "criado_em")
    search_fields = ("codigo", "matricula", "policial_nome")
    list_filter = ("status", "departamento", "lotacao")


@admin.register(Movimento)
class MovimentoAdmin(admin.ModelAdmin):
    list_display = ("tipo", "item", "quantidade", "status", "data")
    search_fields = ("item__descricao",)
    list_filter = ("tipo", "status")


@admin.register(Cautela)
class CautelaAdmin(admin.ModelAdmin):
    list_display = ("numero", "policial_nome", "item", "qtd", "status", "data_saida", "criado_em")
    search_fields = ("numero", "matricula", "policial_nome", "nup")
    list_filter = ("status", "departamento", "lotacao")
