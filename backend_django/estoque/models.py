from django.db import models

from cadastros.models import Fornecedor
from core.models import BaseModel


class StatusItemChoices(models.TextChoices):
    """Vocabulário exato observado em server.ts, compartilhado por
    Item.status, BemIndividual.status e Cautela.condicao_dev."""

    DISPONIVEL = "Disponivel", "Disponível"
    EM_USO = "Em Uso", "Em Uso"
    EM_REPARO = "Em Reparo", "Em Reparo"
    RECOLHIDA = "Recolhida", "Recolhida"
    APREENDIDA = "Apreendida", "Apreendida"
    FURTADA = "Furtada", "Furtada"
    ROUBADA = "Roubada", "Roubada"
    PERDIDA = "Perdida", "Perdida"
    DESTRUIDA = "Destruida", "Destruída"
    INSERVIVEL = "Inservivel", "Inservível"


class Compra(BaseModel):
    fornecedor = models.ForeignKey(
        Fornecedor, on_delete=models.PROTECT, related_name="compras"
    )
    categoria = models.CharField(max_length=100, blank=True)
    tipo = models.CharField(max_length=100, blank=True)
    calibre = models.CharField(max_length=50, blank=True)
    comprimento_cano = models.CharField(max_length=50, blank=True)
    quantidade_carregadores = models.IntegerField(null=True, blank=True)
    capacidade = models.IntegerField(null=True, blank=True)
    marca = models.CharField(max_length=100, blank=True)
    modelo = models.CharField(max_length=100, blank=True)
    nivel = models.CharField(max_length=50, blank=True)
    tamanho = models.CharField(max_length=50, blank=True)
    sexo = models.CharField(max_length=20, blank=True)
    cargo = models.CharField(max_length=100, blank=True)
    numero_nota_fiscal = models.CharField(max_length=100, blank=True)
    numero_empenho = models.CharField(max_length=100, blank=True)
    numero_tombo = models.CharField(max_length=100, blank=True)
    serie = models.CharField(max_length=100, blank=True)
    descricao = models.CharField(max_length=255, blank=True)
    qtd_total = models.IntegerField(default=0)
    qtd_disp = models.IntegerField(default=0)
    qtd_min = models.IntegerField(default=0)
    # Nenhum enum observado em server.ts para este campo — CharField livre.
    status = models.CharField(max_length=50, blank=True)
    dt_aq = models.DateField(null=True, blank=True)
    valor_compra = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    dt_val = models.DateField(null=True, blank=True)
    obs = models.TextField(blank=True)

    def __str__(self):
        return f"Compra {self.numero_nota_fiscal or self.id} — {self.fornecedor}"


class Item(BaseModel):
    patrimonio = models.CharField(max_length=100, blank=True)
    descricao = models.CharField(max_length=255)
    categoria = models.CharField(max_length=100, blank=True)
    tamanho = models.CharField(max_length=50, blank=True)
    sexo = models.CharField(max_length=20, blank=True)
    cargo = models.CharField(max_length=100, blank=True)
    marca = models.CharField(max_length=100, blank=True)
    serie = models.CharField(max_length=100, blank=True)
    qtd_total = models.IntegerField(default=0)
    qtd_disp = models.IntegerField(default=0)
    qtd_min = models.IntegerField(default=0)
    fornecedor = models.ForeignKey(
        Fornecedor, on_delete=models.PROTECT, related_name="itens",
        null=True, blank=True,
    )
    dt_aq = models.DateField(null=True, blank=True)
    dt_val = models.DateField(null=True, blank=True)
    valor_compra = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    status = models.CharField(
        max_length=20, choices=StatusItemChoices.choices,
        default=StatusItemChoices.DISPONIVEL,
    )
    obs = models.TextField(blank=True)
    # Existem em dados reais (db.json) fora da interface TS declarada.
    tipo = models.CharField(max_length=100, blank=True)
    modelo = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return self.descricao


class BemIndividual(BaseModel):
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="bens")
    patrimonio = models.CharField(max_length=100, blank=True)
    serie = models.CharField(max_length=100, blank=True)
    status = models.CharField(
        max_length=20, choices=StatusItemChoices.choices,
        default=StatusItemChoices.DISPONIVEL,
    )
    tamanho = models.CharField(max_length=50, blank=True)
    sexo = models.CharField(max_length=20, blank=True)
    dt_val = models.DateField(null=True, blank=True)
    obs = models.TextField(blank=True)

    def __str__(self):
        return f"{self.item} — {self.patrimonio or self.serie}"


class Arma(BaseModel):
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="armas")
    # Renomeado de patrimonio_id: hoje NÃO é FK real para Patrimonio.id
    # (é uma cópia do código Item.patrimonio) — manter como texto evita
    # inventar uma relação que os dados atuais não sustentam.
    patrimonio_codigo = models.CharField(max_length=100, blank=True)
    tipo = models.CharField(max_length=100, blank=True)
    marca = models.CharField(max_length=100, blank=True)
    modelo = models.CharField(max_length=100, blank=True)
    calibre = models.CharField(max_length=50, blank=True)
    comprimento_cano = models.CharField(max_length=50, blank=True)
    quantidade_carregadores = models.IntegerField(null=True, blank=True)
    capacidade = models.IntegerField(null=True, blank=True)
    numero_serie = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return f"{self.tipo} {self.marca} {self.modelo} — {self.numero_serie}"
