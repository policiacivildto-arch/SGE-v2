from rest_framework import serializers

from cadastros.models import Delegacia, Departamento, Lotacao, Patrimonio, Policial
from estoque.models import Arma, Item
from usuarios.models import Usuario

from .models import Cautela, Movimento, Servico


class ServicoSerializer(serializers.ModelSerializer):
    policial_id = serializers.PrimaryKeyRelatedField(
        source="policial", queryset=Policial.objects.all(), allow_null=True, required=False
    )
    departamento_id = serializers.PrimaryKeyRelatedField(
        source="departamento", queryset=Departamento.objects.all(), allow_null=True, required=False
    )
    lotacao_id = serializers.PrimaryKeyRelatedField(
        source="lotacao", queryset=Lotacao.objects.all(), allow_null=True, required=False
    )
    criado_por_id = serializers.PrimaryKeyRelatedField(source="criado_por", read_only=True)
    # Compatibilidade: db.json guardava `depto`/`lotacao` como texto
    # solto (snapshot) ao lado dos ids; telas que só exibem continuam
    # lendo estes campos somente-leitura em vez dos `*_id` normalizados.
    depto = serializers.SerializerMethodField()
    lotacao_nome = serializers.SerializerMethodField()

    class Meta:
        model = Servico
        fields = [
            "id", "codigo", "policial_id", "matricula", "policial_nome",
            "departamento_id", "lotacao_id", "depto", "lotacao_nome", "tipo",
            "data_rec", "status", "serie", "obs", "armeiro", "criado_por_id",
            "criado_em", "atualizado_em",
        ]
        read_only_fields = ["codigo"]

    def get_depto(self, obj):
        return obj.departamento.nome if obj.departamento_id else ""

    def get_lotacao_nome(self, obj):
        return obj.lotacao.nome if obj.lotacao_id else ""


class MovimentoSerializer(serializers.ModelSerializer):
    item_id = serializers.PrimaryKeyRelatedField(source="item", queryset=Item.objects.all())
    arma_id = serializers.PrimaryKeyRelatedField(
        source="arma", queryset=Arma.objects.all(), allow_null=True, required=False
    )
    patrimonio_id = serializers.PrimaryKeyRelatedField(
        source="patrimonio", queryset=Patrimonio.objects.all(), allow_null=True, required=False
    )
    departamento_id = serializers.PrimaryKeyRelatedField(
        source="departamento", queryset=Departamento.objects.all(), allow_null=True, required=False
    )
    delegacia_id = serializers.PrimaryKeyRelatedField(
        source="delegacia", queryset=Delegacia.objects.all(), allow_null=True, required=False
    )
    usuario_id = serializers.PrimaryKeyRelatedField(
        source="usuario", queryset=Usuario.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = Movimento
        fields = [
            "id", "item_id", "arma_id", "patrimonio_id", "departamento_id",
            "delegacia_id", "usuario_id", "tipo", "quantidade", "status",
            "data", "criado_em", "atualizado_em",
        ]


_CAUTELA_EDITAVEIS = {
    "obs_dev", "nup", "numero_io_bo", "numero_serie_reparo",
    "motivo_recolhimento", "email_policial",
}


class CautelaSerializer(serializers.ModelSerializer):
    policial_id = serializers.PrimaryKeyRelatedField(source="policial", read_only=True)
    departamento_id = serializers.PrimaryKeyRelatedField(source="departamento", read_only=True)
    lotacao_id = serializers.PrimaryKeyRelatedField(source="lotacao", read_only=True)
    item_id = serializers.PrimaryKeyRelatedField(source="item", read_only=True)
    # Compatibilidade: db.json guardava `depto`/`lotacao`/`categoria` como
    # texto solto (snapshot) na Cautela; telas que só exibem continuam
    # lendo estes campos somente-leitura em vez dos `*_id` normalizados.
    depto = serializers.SerializerMethodField()
    lotacao_nome = serializers.SerializerMethodField()
    categoria = serializers.SerializerMethodField()

    class Meta:
        model = Cautela
        fields = [
            "id", "numero", "data_saida", "data_prev", "data_dev",
            "policial_id", "matricula", "policial_nome",
            "departamento_id", "lotacao_id", "depto", "lotacao_nome",
            "item_id", "item_desc", "categoria", "qtd", "status", "condicao_dev",
            "motivo_recolhimento", "nup", "numero_io_bo", "numero_serie_reparo",
            "obs_dev", "serie", "assinatura_digital", "assinatura_dev",
            "token_confirmacao", "token_confirmacao_dev", "email_policial",
            "hash_assinatura", "hash_assinatura_dev", "id_confirmacao",
            "hash_confirmacao", "created_by", "qtd_carregadores",
            "confirmado_via_email", "confirmado_via_email_dev",
            "data_assinatura", "data_assinatura_dev",
            "criado_em", "atualizado_em",
        ]
        read_only_fields = [
            f for f in fields
            if f not in _CAUTELA_EDITAVEIS and f not in ("depto", "lotacao_nome", "categoria")
        ]

    def get_depto(self, obj):
        return obj.departamento.nome if obj.departamento_id else ""

    def get_lotacao_nome(self, obj):
        return obj.lotacao.nome if obj.lotacao_id else ""

    def get_categoria(self, obj):
        return obj.item.categoria if obj.item_id else ""


# --- Serializers de entrada das actions customizadas (não são ModelSerializer
# porque a mutação real é feita por operacoes/services.py, não pelo DRF). ---

class CautelaCreateSerializer(serializers.Serializer):
    policial_id = serializers.UUIDField(required=False, allow_null=True)
    item_id = serializers.UUIDField(required=False, allow_null=True)
    qtd = serializers.IntegerField(required=False, min_value=1, default=1)
    serie = serializers.CharField(required=False, allow_blank=True)
    numero_serie = serializers.CharField(required=False, allow_blank=True)
    data_saida = serializers.DateField(required=False)
    data_prev = serializers.DateField(required=False, allow_null=True)
    assinatura_digital = serializers.CharField(required=False, allow_blank=True)
    email_policial = serializers.EmailField(required=False, allow_blank=True)
    qtd_carregadores = serializers.IntegerField(required=False, allow_null=True)
    status = serializers.CharField(required=False, allow_blank=True)
    hash_assinatura = serializers.CharField(required=False, allow_blank=True)
    is_cautela_unidade = serializers.BooleanField(required=False, default=False)
    lotacao_nome = serializers.CharField(required=False, allow_blank=True)
    delegado_matricula = serializers.CharField(required=False, allow_blank=True)
    policial_nome = serializers.CharField(required=False, allow_blank=True)


class CautelaDevolverSerializer(serializers.Serializer):
    data_dev = serializers.DateField()
    condicao_dev = serializers.CharField(required=False, allow_blank=True)
    motivo_recolhimento = serializers.CharField(required=False, allow_blank=True)
    nup = serializers.CharField(required=False, allow_blank=True)
    numero_io_bo = serializers.CharField(required=False, allow_blank=True)
    numero_serie_reparo = serializers.CharField(required=False, allow_blank=True)
    obs_dev = serializers.CharField(required=False, allow_blank=True)
    assinatura_dev = serializers.CharField(required=False, allow_blank=True)
    assinatura_digital = serializers.CharField(required=False, allow_blank=True)
    status_item = serializers.CharField(required=False, allow_blank=True)


class CautelaAssinarSerializer(serializers.Serializer):
    assinatura_digital = serializers.CharField()
    tipo = serializers.CharField(required=False, allow_blank=True)


class CautelaReenviarEmailSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)


class CautelaConfirmarTokenSerializer(serializers.Serializer):
    token = serializers.CharField(required=False, allow_blank=True)
    id = serializers.UUIDField(required=False, allow_null=True)
