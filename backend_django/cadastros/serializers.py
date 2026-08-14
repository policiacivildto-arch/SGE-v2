from rest_framework import serializers

from .models import Delegacia, Departamento, Fornecedor, Lotacao, OpcaoMenu, Patrimonio, Policial


class DepartamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Departamento
        fields = ["id", "nome", "sigla", "ativo", "criado_em", "atualizado_em"]


class DelegaciaSerializer(serializers.ModelSerializer):
    departamento_id = serializers.PrimaryKeyRelatedField(
        source="departamento", queryset=Departamento.objects.all()
    )

    class Meta:
        model = Delegacia
        fields = [
            "id", "nome", "codigo", "cidade", "departamento_id", "ativo",
            "criado_em", "atualizado_em",
        ]


class LotacaoSerializer(serializers.ModelSerializer):
    departamento_id = serializers.PrimaryKeyRelatedField(
        source="departamento", queryset=Departamento.objects.all()
    )
    # Compatibilidade: db.json guardava `depto` como texto solto; a tela
    # que só exibe (não edita) o departamento da lotação continua lendo
    # este campo somente-leitura em vez do `departamento_id` normalizado.
    depto = serializers.SerializerMethodField()

    class Meta:
        model = Lotacao
        fields = [
            "id", "departamento_id", "depto", "nome", "cidade", "resp", "area_atuacao",
            "ais", "tel", "endereco", "seccional", "criado_em", "atualizado_em",
        ]

    def get_depto(self, obj):
        return obj.departamento.nome if obj.departamento_id else ""


class PolicialSerializer(serializers.ModelSerializer):
    departamento_id = serializers.PrimaryKeyRelatedField(
        source="departamento", queryset=Departamento.objects.all(),
        allow_null=True, required=False,
    )
    lotacao_id = serializers.PrimaryKeyRelatedField(
        source="lotacao", queryset=Lotacao.objects.all(),
        allow_null=True, required=False,
    )
    # Compatibilidade: db.json guardava `depto`/`lotacao` como texto
    # solto no Policial; telas que só exibem (não editam) continuam
    # lendo estes campos somente-leitura em vez dos `*_id` normalizados.
    depto = serializers.SerializerMethodField()
    lotacao = serializers.SerializerMethodField()

    class Meta:
        model = Policial
        fields = [
            "id", "matricula", "cpf", "nome", "cargo", "departamento_id",
            "lotacao_id", "depto", "lotacao", "tel", "email", "obs",
            "criado_em", "atualizado_em",
        ]

    def get_depto(self, obj):
        return obj.departamento.nome if obj.departamento_id else ""

    def get_lotacao(self, obj):
        return obj.lotacao.nome if obj.lotacao_id else ""


class FornecedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fornecedor
        fields = [
            "id", "nome", "cnpj", "contato", "tel", "email", "categoria",
            "endereco", "obs", "criado_em", "atualizado_em",
        ]


class PatrimonioSerializer(serializers.ModelSerializer):
    departamento_id = serializers.PrimaryKeyRelatedField(
        source="departamento", queryset=Departamento.objects.all(),
        allow_null=True, required=False,
    )
    delegacia_id = serializers.PrimaryKeyRelatedField(
        source="delegacia", queryset=Delegacia.objects.all(),
        allow_null=True, required=False,
    )

    class Meta:
        model = Patrimonio
        fields = [
            "id", "codigo", "descricao", "categoria", "departamento_id",
            "delegacia_id", "ativo", "criado_em", "atualizado_em",
        ]


class OpcaoMenuSerializer(serializers.ModelSerializer):
    class Meta:
        model = OpcaoMenu
        fields = ["id", "grupo", "valor", "rotulo", "ordem", "ativo", "criado_em", "atualizado_em"]
