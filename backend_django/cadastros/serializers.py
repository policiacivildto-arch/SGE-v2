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

    class Meta:
        model = Lotacao
        fields = [
            "id", "departamento_id", "nome", "cidade", "resp", "area_atuacao",
            "ais", "tel", "endereco", "seccional", "criado_em", "atualizado_em",
        ]


class PolicialSerializer(serializers.ModelSerializer):
    departamento_id = serializers.PrimaryKeyRelatedField(
        source="departamento", queryset=Departamento.objects.all(),
        allow_null=True, required=False,
    )
    lotacao_id = serializers.PrimaryKeyRelatedField(
        source="lotacao", queryset=Lotacao.objects.all(),
        allow_null=True, required=False,
    )

    class Meta:
        model = Policial
        fields = [
            "id", "matricula", "cpf", "nome", "cargo", "departamento_id",
            "lotacao_id", "tel", "email", "obs", "criado_em", "atualizado_em",
        ]


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
