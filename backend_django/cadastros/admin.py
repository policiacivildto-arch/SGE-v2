from django.contrib import admin

from .models import Delegacia, Departamento, Fornecedor, Lotacao, OpcaoMenu, Patrimonio, Policial


@admin.register(Departamento)
class DepartamentoAdmin(admin.ModelAdmin):
    list_display = ("nome", "sigla", "ativo", "criado_em")
    search_fields = ("nome", "sigla")


@admin.register(Delegacia)
class DelegaciaAdmin(admin.ModelAdmin):
    list_display = ("nome", "codigo", "cidade", "departamento", "ativo", "criado_em")
    search_fields = ("nome", "codigo")
    list_filter = ("departamento",)


@admin.register(Lotacao)
class LotacaoAdmin(admin.ModelAdmin):
    list_display = ("nome", "departamento", "cidade", "resp", "criado_em")
    search_fields = ("nome", "cidade")
    list_filter = ("departamento",)


@admin.register(Policial)
class PolicialAdmin(admin.ModelAdmin):
    list_display = ("matricula", "nome", "cargo", "departamento", "lotacao", "criado_em")
    search_fields = ("matricula", "nome", "cpf")
    list_filter = ("departamento", "lotacao")


@admin.register(Fornecedor)
class FornecedorAdmin(admin.ModelAdmin):
    list_display = ("nome", "cnpj", "categoria", "criado_em")
    search_fields = ("nome", "cnpj")


@admin.register(Patrimonio)
class PatrimonioAdmin(admin.ModelAdmin):
    list_display = ("codigo", "descricao", "departamento", "delegacia", "ativo", "criado_em")
    search_fields = ("codigo", "descricao")
    list_filter = ("departamento", "delegacia")


@admin.register(OpcaoMenu)
class OpcaoMenuAdmin(admin.ModelAdmin):
    list_display = ("grupo", "valor", "rotulo", "ordem", "ativo")
    search_fields = ("grupo", "valor", "rotulo")
    list_filter = ("grupo",)
