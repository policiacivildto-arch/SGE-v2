from rest_framework import serializers

from .models import Delegacia, Departamento, Fornecedor, Lotacao, OpcaoMenu, Patrimonio, Policial
from .services import resolve_lotacao, resolve_or_create_departamento


class DepartamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Departamento
        fields = ["id", "nome", "sigla", "ativo", "criado_em", "atualizado_em"]


class DelegaciaSerializer(serializers.ModelSerializer):
    departamento_id = serializers.PrimaryKeyRelatedField(
        source="departamento", queryset=Departamento.objects.all()
    )
    # Compatibilidade: server.ts denormalizava departamento_nome na
    # listagem (server.ts:534-539).
    departamento_nome = serializers.SerializerMethodField()

    class Meta:
        model = Delegacia
        fields = [
            "id", "nome", "codigo", "cidade", "departamento_id", "departamento_nome",
            "ativo", "criado_em", "atualizado_em",
        ]

    def get_departamento_nome(self, obj):
        return obj.departamento.nome if obj.departamento_id else ""


class LotacaoSerializer(serializers.ModelSerializer):
    # `departamento_id` deixou de ser obrigatório aqui porque
    # CadLotacoes.jsx (Fase 5) ainda envia `depto` como texto livre no
    # create/update, não o id normalizado — validate() abaixo lê
    # `self.initial_data["depto"]` diretamente e resolve (ou cria) o
    # Departamento quando `departamento_id` não vem preenchido.
    departamento_id = serializers.PrimaryKeyRelatedField(
        source="departamento", queryset=Departamento.objects.all(), required=False,
    )
    # Somente-leitura de propósito: mesmo campo `depto` que a tela usa
    # tanto para exibir (nome do departamento) quanto, na escrita, como
    # texto livre — não dá pra declarar os dois papéis no mesmo campo
    # DRF, então a leitura fica aqui e a escrita é tratada via
    # `self.initial_data` em validate(), sem precisar de um campo extra.
    depto = serializers.SerializerMethodField()
    # Compatibilidade: CadLotacoes.jsx lê/grava `end`, o model usa
    # `endereco` (nome herdado de db.json).
    end = serializers.CharField(source="endereco", required=False, allow_blank=True)

    class Meta:
        model = Lotacao
        fields = [
            "id", "departamento_id", "depto", "nome", "cidade", "resp",
            "area_atuacao", "ais", "tel", "end", "seccional", "criado_em", "atualizado_em",
        ]

    def get_depto(self, obj):
        return obj.departamento.nome if obj.departamento_id else ""

    def validate(self, attrs):
        if "departamento" not in attrs:
            depto_nome = self.initial_data.get("depto")
            if depto_nome:
                attrs["departamento"] = resolve_or_create_departamento(depto_nome)
            elif not self.partial:
                # PATCH (partial=True) pode legitimamente não tocar no
                # departamento — só exige o campo em create/PUT.
                raise serializers.ValidationError(
                    {"departamento_id": "Obrigatório (envie 'departamento_id' ou 'depto')."}
                )
        return attrs


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

    def validate(self, attrs):
        # CadPoliciaisView (main.jsx, Fase 5) ainda envia `depto`/`lotacao`
        # como texto livre no create/update (add individual e importação
        # em lote) — diferente de Lotacao, aqui as duas FKs são
        # opcionais (nullable), então só resolve se o texto vier e o
        # *_id explícito não tiver sido enviado.
        if "departamento" not in attrs:
            depto_nome = self.initial_data.get("depto")
            if depto_nome:
                attrs["departamento"] = resolve_or_create_departamento(depto_nome)
        if "lotacao" not in attrs:
            lotacao_nome = self.initial_data.get("lotacao")
            if lotacao_nome:
                attrs["lotacao"] = resolve_lotacao(lotacao_nome)
        return attrs


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
