from django.contrib import admin
from .models import Policial, Item, Cautela, Servico, Lotacao, Fornecedor


@admin.register(Policial)
class PolicialAdmin(admin.ModelAdmin):
    list_display = ('matricula', 'nome', 'cargo', 'email', 'depto', 'lotacao')
    search_fields = ('matricula', 'nome', 'cpf', 'email', 'lotacao')
    list_filter = ('cargo', 'depto')


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ('descricao', 'categoria', 'calibre', 'marca', 'serie', 'qtd_disp', 'qtd_total', 'status')
    search_fields = ('descricao', 'serie', 'patrimonio', 'marca', 'modelo')
    list_filter = ('categoria', 'status')


@admin.register(Cautela)
class CautelaAdmin(admin.ModelAdmin):
    list_display = ('numero', 'policial_nome', 'item_desc', 'data_saida', 'email_policial', 'status', 'confirmado_via_email')
    search_fields = ('numero', 'policial_nome', 'matricula', 'item_desc', 'email_policial')
    list_filter = ('status', 'confirmado_via_email')


@admin.register(Servico)
class ServicoAdmin(admin.ModelAdmin):
    list_display = ('codigo', 'policial_nome', 'tipo', 'data_rec', 'status', 'armeiro')
    search_fields = ('codigo', 'policial_nome', 'matricula', 'serie')
    list_filter = ('status', 'tipo')


@admin.register(Lotacao)
class LotacaoAdmin(admin.ModelAdmin):
    list_display = ('nome', 'depto', 'cidade', 'resp', 'tel')
    search_fields = ('nome', 'depto', 'cidade', 'resp')


@admin.register(Fornecedor)
class FornecedorAdmin(admin.ModelAdmin):
    list_display = ('nome', 'cnpj', 'contato', 'tel', 'email', 'categoria')
    search_fields = ('nome', 'cnpj', 'email', 'categoria')
