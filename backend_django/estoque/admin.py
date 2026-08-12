from django.contrib import admin

from .models import Arma, BemIndividual, Compra, Item


@admin.register(Compra)
class CompraAdmin(admin.ModelAdmin):
    list_display = ("fornecedor", "categoria", "descricao", "qtd_total", "qtd_disp", "status", "criado_em")
    search_fields = ("descricao", "numero_nota_fiscal", "numero_empenho", "numero_tombo")
    list_filter = ("fornecedor", "categoria", "status")


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ("descricao", "categoria", "qtd_total", "qtd_disp", "qtd_min", "status", "criado_em")
    search_fields = ("descricao", "patrimonio", "serie")
    list_filter = ("categoria", "status")


@admin.register(BemIndividual)
class BemIndividualAdmin(admin.ModelAdmin):
    list_display = ("item", "patrimonio", "serie", "status", "criado_em")
    search_fields = ("patrimonio", "serie")
    list_filter = ("status",)


@admin.register(Arma)
class ArmaAdmin(admin.ModelAdmin):
    list_display = ("item", "tipo", "marca", "modelo", "numero_serie", "criado_em")
    search_fields = ("numero_serie", "marca", "modelo")
    list_filter = ("tipo",)
