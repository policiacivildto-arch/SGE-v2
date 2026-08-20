from django.db import models

from core.models import BaseModel


class Departamento(BaseModel):
    nome = models.CharField(max_length=255)
    sigla = models.CharField(max_length=20, blank=True)
    responsavel = models.CharField(max_length=255, blank=True)
    ativo = models.BooleanField(default=True)

    def __str__(self):
        return self.nome


class Delegacia(BaseModel):
    nome = models.CharField(max_length=255)
    codigo = models.CharField(max_length=50, blank=True)
    cidade = models.CharField(max_length=255, blank=True)
    departamento = models.ForeignKey(
        Departamento, on_delete=models.PROTECT, related_name="delegacias"
    )
    ativo = models.BooleanField(default=True)

    def __str__(self):
        return self.nome


class Lotacao(BaseModel):
    # Normalizado na Fase 1: hoje `depto` é texto livre em serverDb.ts.
    departamento = models.ForeignKey(
        Departamento, on_delete=models.PROTECT, related_name="lotacoes"
    )
    nome = models.CharField(max_length=255)
    cidade = models.CharField(max_length=255, blank=True)
    # Nome do responsável — mantido como texto: não há id de Policial
    # confiável associado a este campo nos dados atuais.
    resp = models.CharField(max_length=255, blank=True)
    area_atuacao = models.CharField(max_length=255, blank=True)
    ais = models.CharField(max_length=100, blank=True)
    tel = models.CharField(max_length=50, blank=True)
    endereco = models.CharField(max_length=255, blank=True)
    seccional = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return self.nome


class Policial(BaseModel):
    matricula = models.CharField(max_length=50)
    cpf = models.CharField(max_length=20, blank=True)
    nome = models.CharField(max_length=255)
    cargo = models.CharField(max_length=100, blank=True)
    # Normalizados na Fase 1: hoje `depto`/`lotacao` são texto livre.
    departamento = models.ForeignKey(
        Departamento, on_delete=models.PROTECT, related_name="policiais",
        null=True, blank=True,
    )
    lotacao = models.ForeignKey(
        Lotacao, on_delete=models.PROTECT, related_name="policiais",
        null=True, blank=True,
    )
    tel = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    obs = models.TextField(blank=True)

    def __str__(self):
        return f"{self.matricula} — {self.nome}"


class Fornecedor(BaseModel):
    nome = models.CharField(max_length=255)
    cnpj = models.CharField(max_length=30, blank=True)
    contato = models.CharField(max_length=255, blank=True)
    tel = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    categoria = models.CharField(max_length=100, blank=True)
    endereco = models.CharField(max_length=255, blank=True)
    obs = models.TextField(blank=True)

    def __str__(self):
        return self.nome


class Patrimonio(BaseModel):
    codigo = models.CharField(max_length=50)
    descricao = models.CharField(max_length=255, blank=True)
    categoria = models.CharField(max_length=100, blank=True)
    departamento = models.ForeignKey(
        Departamento, on_delete=models.PROTECT, related_name="patrimonios",
        null=True, blank=True,
    )
    delegacia = models.ForeignKey(
        Delegacia, on_delete=models.PROTECT, related_name="patrimonios",
        null=True, blank=True,
    )
    ativo = models.BooleanField(default=True)

    def __str__(self):
        return self.codigo


class OpcaoMenu(BaseModel):
    """Tabela de domínio configurável para combos dinâmicos do frontend."""

    grupo = models.CharField(max_length=100)
    valor = models.CharField(max_length=255)
    rotulo = models.CharField(max_length=255)
    ordem = models.IntegerField(default=0)
    ativo = models.BooleanField(default=True)

    class Meta:
        ordering = ["grupo", "ordem"]

    def __str__(self):
        return f"{self.grupo}: {self.rotulo}"
