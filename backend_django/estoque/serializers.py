from rest_framework import serializers

from cadastros.models import Fornecedor
from .models import Arma, BemIndividual, Compra, Item


class CompraSerializer(serializers.ModelSerializer):
    fornecedor_id = serializers.PrimaryKeyRelatedField(
        source="fornecedor", queryset=Fornecedor.objects.all()
    )
    # Compatibilidade: db.json guardava `fornecedor_nome` denormalizado
    # ao lado de `fornecedor_id`; telas que só exibem continuam lendo
    # este campo somente-leitura.
    fornecedor_nome = serializers.SerializerMethodField()
    criado_por_id = serializers.PrimaryKeyRelatedField(source="criado_por", read_only=True)

    class Meta:
        model = Compra
        fields = [
            "id", "fornecedor_id", "fornecedor_nome", "categoria", "tipo", "calibre",
            "comprimento_cano", "quantidade_carregadores", "capacidade",
            "marca", "modelo", "nivel", "tamanho", "sexo", "cargo",
            "numero_nota_fiscal", "numero_empenho", "numero_tombo", "serie",
            "descricao", "qtd_total", "qtd_disp", "qtd_min", "status",
            "dt_aq", "valor_compra", "dt_val", "obs", "criado_por_id",
            "criado_em", "atualizado_em",
        ]

    def get_fornecedor_nome(self, obj):
        return obj.fornecedor.nome if obj.fornecedor_id else ""


class ItemSerializer(serializers.ModelSerializer):
    fornecedor_id = serializers.PrimaryKeyRelatedField(
        source="fornecedor", queryset=Fornecedor.objects.all(),
        allow_null=True, required=False,
    )
    compra_id = serializers.PrimaryKeyRelatedField(
        source="compra", queryset=Compra.objects.all(),
        allow_null=True, required=False,
    )
    criado_por_id = serializers.PrimaryKeyRelatedField(source="criado_por", read_only=True)
    # Compatibilidade: server.ts enriquecia GET /api/itens com o nome do
    # fornecedor (server.ts:732,919) — `compra_excluida` fica sempre
    # False desde a Fase 5 (Item.compra é FK real com on_delete=SET_NULL,
    # não sobra id pendurado), mantido só pra não quebrar o formato.
    fornecedor_nome = serializers.SerializerMethodField()
    compra_excluida = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            "id", "patrimonio", "descricao", "categoria", "tamanho", "sexo",
            "cargo", "marca", "serie", "qtd_total", "qtd_disp", "qtd_min",
            "fornecedor_id", "fornecedor_nome", "compra_id", "compra_excluida",
            "dt_aq", "dt_val", "valor_compra", "status",
            "obs", "tipo", "modelo", "criado_por_id", "criado_em", "atualizado_em",
        ]

    def get_fornecedor_nome(self, obj):
        return obj.fornecedor.nome if obj.fornecedor_id else ""

    def get_compra_excluida(self, obj):
        return False


class BemIndividualSerializer(serializers.ModelSerializer):
    item_id = serializers.PrimaryKeyRelatedField(
        source="item", queryset=Item.objects.all()
    )
    criado_por_id = serializers.PrimaryKeyRelatedField(source="criado_por", read_only=True)
    # Compatibilidade: server.ts enriquecia GET /api/bens com dados do
    # item pai (server.ts:1079-1088) — NovoServico.jsx usa item_categoria
    # pra detectar arma e item_marca/item_descricao como fallback de
    # exibição. `item_calibre` do original não é replicado (Item não
    # modela calibre); o frontend já tem fallback pra '9mm' nesse caso.
    item_categoria = serializers.SerializerMethodField()
    item_marca = serializers.SerializerMethodField()
    item_descricao = serializers.SerializerMethodField()

    class Meta:
        model = BemIndividual
        fields = [
            "id", "item_id", "patrimonio", "serie", "status", "tamanho",
            "sexo", "dt_val", "obs", "item_categoria", "item_marca", "item_descricao",
            "criado_por_id", "criado_em", "atualizado_em",
        ]

    def get_item_categoria(self, obj):
        return obj.item.categoria if obj.item_id else ""

    def get_item_marca(self, obj):
        return obj.item.marca if obj.item_id else ""

    def get_item_descricao(self, obj):
        return obj.item.descricao if obj.item_id else ""


class ArmaSerializer(serializers.ModelSerializer):
    item_id = serializers.PrimaryKeyRelatedField(
        source="item", queryset=Item.objects.all()
    )
    criado_por_id = serializers.PrimaryKeyRelatedField(source="criado_por", read_only=True)
    # Compatibilidade: server.ts enriquecia com a descrição do item pai
    # (server.ts:1194-1200); NovoServico.jsx/Cautelas.jsx usam como
    # fallback de exibição.
    item_descricao = serializers.SerializerMethodField()

    class Meta:
        model = Arma
        fields = [
            "id", "item_id", "patrimonio_codigo", "tipo", "marca", "modelo",
            "calibre", "comprimento_cano", "quantidade_carregadores",
            "capacidade", "numero_serie", "item_descricao", "criado_por_id",
            "criado_em", "atualizado_em",
        ]

    def get_item_descricao(self, obj):
        return obj.item.descricao if obj.item_id else ""
