from django.conf import settings
from django.db import models

from cadastros.models import Delegacia, Departamento, Lotacao, Patrimonio, Policial
from core.models import BaseModel
from estoque.models import Arma, Item, StatusItemChoices


class SequenciaNumeracao(BaseModel):
    """Contador race-safe para numero/codigo sequenciais (Cautela/Servico).

    Substitui o "escaneia o array e incrementa" de serverDb.ts
    (getNextCode/getNextCautelaNumber), que só era seguro por acidente
    do Node ser single-threaded. Usado via select_for_update() em
    operacoes/services.py.
    """

    chave = models.CharField(max_length=50, unique=True)
    ultimo_valor = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.chave}={self.ultimo_valor}"


class Servico(BaseModel):
    # Geração sequencial (getNextCode em serverDb.ts) fica para a Fase 3.
    codigo = models.CharField(max_length=20, unique=True)
    policial = models.ForeignKey(
        Policial, on_delete=models.SET_NULL, related_name="servicos",
        null=True, blank=True,
    )
    # Snapshots históricos copiados do Policial no momento da criação —
    # mantidos como texto de propósito, não uma relação viva.
    matricula = models.CharField(max_length=50, blank=True)
    policial_nome = models.CharField(max_length=255, blank=True)
    departamento = models.ForeignKey(
        Departamento, on_delete=models.SET_NULL, related_name="servicos",
        null=True, blank=True,
    )
    lotacao = models.ForeignKey(
        Lotacao, on_delete=models.SET_NULL, related_name="servicos",
        null=True, blank=True,
    )
    tipo = models.CharField(max_length=100, blank=True)
    data_rec = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=50, blank=True)
    serie = models.CharField(max_length=100, blank=True)
    obs = models.TextField(blank=True)
    # Hoje sem id de referência nos dados (só texto livre em server.ts) —
    # candidato a virar FK → Policial numa fase futura, se necessário.
    armeiro = models.CharField(max_length=255, blank=True)
    # Dono do registro para a regra "só edita o que criou" (Fase 3, RBAC).
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        related_name="servicos_criados", null=True, blank=True,
    )

    def __str__(self):
        return self.codigo


class MovimentoTipoChoices(models.TextChoices):
    ENTRADA = "Entrada", "Entrada"
    CAUTELA = "Cautela", "Cautela"
    DEVOLUCAO = "Devolucao", "Devolução"
    BAIXA = "Baixa", "Baixa"


class Movimento(BaseModel):
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="movimentos")
    arma = models.ForeignKey(
        Arma, on_delete=models.SET_NULL, related_name="movimentos",
        null=True, blank=True,
    )
    patrimonio = models.ForeignKey(
        Patrimonio, on_delete=models.SET_NULL, related_name="movimentos",
        null=True, blank=True,
    )
    departamento = models.ForeignKey(
        Departamento, on_delete=models.SET_NULL, related_name="movimentos",
        null=True, blank=True,
    )
    delegacia = models.ForeignKey(
        Delegacia, on_delete=models.SET_NULL, related_name="movimentos",
        null=True, blank=True,
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        related_name="movimentos", null=True, blank=True,
    )
    tipo = models.CharField(max_length=20, choices=MovimentoTipoChoices.choices)
    quantidade = models.IntegerField(default=0)
    status = models.CharField(max_length=50, blank=True)
    data = models.DateTimeField()

    def __str__(self):
        return f"{self.tipo} — {self.item} ({self.quantidade})"


class CautelaStatusChoices(models.TextChoices):
    PENDENTE_ASSINATURA = "Pendente de Assinatura", "Pendente de Assinatura"
    ATIVA = "Ativa", "Ativa"
    PENDENTE_DEVOLUCAO = "Pendente (Devolução)", "Pendente (Devolução)"
    DEVOLVIDO = "Devolvido", "Devolvido"


class Cautela(BaseModel):
    """Núcleo mais complexo do sistema: máquina de estados com efeitos
    colaterais no estoque (Item.qtd_disp) — a lógica de transição em si
    é responsabilidade da Fase 3 (transaction.atomic()); aqui só o
    schema necessário para sustentá-la.
    """

    # Geração sequencial (getNextCautelaNumber em serverDb.ts) — Fase 3.
    numero = models.CharField(max_length=30, unique=True)
    data_saida = models.DateField(null=True, blank=True)
    data_prev = models.DateField(null=True, blank=True)
    data_dev = models.DateField(null=True, blank=True)

    policial = models.ForeignKey(
        Policial, on_delete=models.SET_NULL, related_name="cautelas",
        null=True, blank=True,
    )
    # Snapshots históricos, mantidos como texto de propósito.
    matricula = models.CharField(max_length=50, blank=True)
    policial_nome = models.CharField(max_length=255, blank=True)
    departamento = models.ForeignKey(
        Departamento, on_delete=models.SET_NULL, related_name="cautelas",
        null=True, blank=True,
    )
    lotacao = models.ForeignKey(
        Lotacao, on_delete=models.SET_NULL, related_name="cautelas",
        null=True, blank=True,
    )

    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name="cautelas")
    # Snapshot da descrição do Item no momento da cautela — mantido de
    # propósito para preservar o histórico mesmo se o Item mudar depois.
    item_desc = models.CharField(max_length=255, blank=True)
    qtd = models.IntegerField(default=1)

    status = models.CharField(
        max_length=30, choices=CautelaStatusChoices.choices,
        default=CautelaStatusChoices.PENDENTE_ASSINATURA,
    )
    condicao_dev = models.CharField(
        max_length=20, choices=StatusItemChoices.choices, null=True, blank=True
    )
    motivo_recolhimento = models.CharField(max_length=255, blank=True)
    nup = models.CharField(max_length=100, blank=True)
    numero_io_bo = models.CharField(max_length=100, blank=True)
    numero_serie_reparo = models.CharField(max_length=100, blank=True)
    obs_dev = models.TextField(blank=True)
    serie = models.CharField(max_length=100, blank=True)

    # SVG de assinatura digital — ver generate_digital_signature_svg em
    # backend_python/main.py, reaproveitável verbatim na Fase 3.
    assinatura_digital = models.TextField(blank=True)
    assinatura_dev = models.TextField(blank=True)
    token_confirmacao = models.CharField(max_length=100, blank=True)
    token_confirmacao_dev = models.CharField(max_length=100, blank=True)
    email_policial = models.EmailField(blank=True)
    hash_assinatura = models.CharField(max_length=100, blank=True)
    hash_assinatura_dev = models.CharField(max_length=100, blank=True)
    id_confirmacao = models.CharField(max_length=100, blank=True)
    hash_confirmacao = models.CharField(max_length=100, blank=True)
    created_by = models.CharField(max_length=255, blank=True)

    # Existe em dados reais fora da interface TS declarada.
    qtd_carregadores = models.IntegerField(null=True, blank=True)

    confirmado_via_email = models.BooleanField(default=False)
    confirmado_via_email_dev = models.BooleanField(default=False)
    data_assinatura = models.DateTimeField(null=True, blank=True)
    data_assinatura_dev = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.numero
