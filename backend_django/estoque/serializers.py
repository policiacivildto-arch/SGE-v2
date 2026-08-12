from rest_framework import serializers

from cadastros.models import Fornecedor
from .models import Arma, BemIndividual, Compra, Item


class CompraSerializer(serializers.ModelSerializer):
    fornecedor_id = serializers.PrimaryKeyRelatedField(
        source="fornecedor", queryset=Fornecedor.objects.all()
    )

    class Meta:
        model = Compra
        fields = [
            "id", "fornecedor_id", "categoria", "tipo", "calibre",
            "comprimento_cano", "quantidade_carregadores", "capacidade",
            "marca", "modelo", "nivel", "tamanho", "sexo", "cargo",
            "numero_nota_fiscal", "numero_empenho", "numero_tombo", "serie",
            "descricao", "qtd_total", "qtd_disp", "qtd_min", "status",
            "dt_aq", "valor_compra", "dt_val", "obs", "criado_em", "atualizado_em",
        ]


class ItemSerializer(serializers.ModelSerializer):
    fornecedor_id = serializers.PrimaryKeyRelatedField(
        source="fornecedor", queryset=Fornecedor.objects.all(),
        allow_null=True, required=False,
    )

    class Meta:
        model = Item
        fields = [
            "id", "patrimonio", "descricao", "categoria", "tamanho", "sexo",
            "cargo", "marca", "serie", "qtd_total", "qtd_disp", "qtd_min",
            "fornecedor_id", "dt_aq", "dt_val", "valor_compra", "status",
            "obs", "tipo", "modelo", "criado_em", "atualizado_em",
        ]


class BemIndividualSerializer(serializers.ModelSerializer):
    item_id = serializers.PrimaryKeyRelatedField(
        source="item", queryset=Item.objects.all()
    )

    class Meta:
        model = BemIndividual
        fields = [
            "id", "item_id", "patrimonio", "serie", "status", "tamanho",
            "sexo", "dt_val", "obs", "criado_em", "atualizado_em",
        ]


class ArmaSerializer(serializers.ModelSerializer):
    item_id = serializers.PrimaryKeyRelatedField(
        source="item", queryset=Item.objects.all()
    )

    class Meta:
        model = Arma
        fields = [
            "id", "item_id", "patrimonio_codigo", "tipo", "marca", "modelo",
            "calibre", "comprimento_cano", "quantidade_carregadores",
            "capacidade", "numero_serie", "criado_em", "atualizado_em",
        ]
