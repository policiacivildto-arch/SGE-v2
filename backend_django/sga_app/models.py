import uuid
from django.db import models
from django.core.exceptions import ValidationError


def validate_pc_ce_email(value):
    if value and not value.strip().lower().endswith('@pc.ce.gov.br'):
        raise ValidationError('Apenas e-mails institucionais com o domínio @pc.ce.gov.br são permitidos.')


class Policial(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=uuid.uuid4, editable=False)
    matricula = models.CharField(max_length=32, unique=True, verbose_name="Matrícula")
    cpf = models.CharField(max_length=14, blank=True, null=True, verbose_name="CPF")
    nome = models.CharField(max_length=255, verbose_name="Nome Completo")
    cargo = models.CharField(max_length=128, verbose_name="Cargo")
    depto = models.CharField(max_length=255, blank=True, null=True, verbose_name="Departamento")
    lotacao = models.CharField(max_length=255, blank=True, null=True, verbose_name="Lotação / Delegacia")
    tel = models.CharField(max_length=32, blank=True, null=True, verbose_name="Telefone")
    email = models.EmailField(blank=True, null=True, validators=[validate_pc_ce_email], verbose_name="E-mail Institucional (@pc.ce.gov.br)")
    obs = models.TextField(blank=True, null=True, verbose_name="Observações")
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Policial"
        verbose_name_plural = "Policiais"
        ordering = ['nome']

    def __str__(self):
        return f"{self.nome} ({self.matricula}) - {self.cargo}"


class Item(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=uuid.uuid4, editable=False)
    patrimonio = models.CharField(max_length=64, blank=True, null=True, verbose_name="Patrimônio / Tombo")
    descricao = models.CharField(max_length=255, verbose_name="Descrição do Item")
    categoria = models.CharField(max_length=128, verbose_name="Categoria")
    calibre = models.CharField(max_length=64, blank=True, null=True, verbose_name="Calibre")
    marca = models.CharField(max_length=128, blank=True, null=True, verbose_name="Marca")
    modelo = models.CharField(max_length=128, blank=True, null=True, verbose_name="Modelo")
    serie = models.CharField(max_length=128, blank=True, null=True, verbose_name="Nº de Série")
    tamanho = models.CharField(max_length=32, blank=True, null=True)
    sexo = models.CharField(max_length=32, blank=True, null=True)
    cargo = models.CharField(max_length=128, blank=True, null=True)
    qtd_total = models.IntegerField(default=1, verbose_name="Quantidade Total")
    qtd_disp = models.IntegerField(default=1, verbose_name="Quantidade Disponível")
    qtd_min = models.IntegerField(default=0, verbose_name="Quantidade Mínima")
    fornecedor_id = models.CharField(max_length=64, blank=True, null=True)
    dt_aq = models.CharField(max_length=32, blank=True, null=True, verbose_name="Data de Aquisição")
    dt_val = models.CharField(max_length=32, blank=True, null=True, verbose_name="Data de Validade")
    valor_compra = models.DecimalField(max_digits=12, decimal_places=2, default=0.00, blank=True, null=True)
    status = models.CharField(max_length=64, default="Disponível")
    obs = models.TextField(blank=True, null=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Item / Material Bélico"
        verbose_name_plural = "Itens / Materiais Bélicos"
        ordering = ['descricao']

    def __str__(self):
        return f"{self.descricao} ({self.categoria}) - Serie: {self.serie or 'S/N'}"


class Cautela(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=uuid.uuid4, editable=False)
    numero = models.CharField(max_length=64, unique=True, verbose_name="Nº da Cautela")
    data_saida = models.CharField(max_length=32, verbose_name="Data de Saída / Emissão")
    data_prev = models.CharField(max_length=32, blank=True, null=True, verbose_name="Previsão de Devolução")
    data_dev = models.CharField(max_length=32, blank=True, null=True, verbose_name="Data de Devolução")
    policial_id = models.CharField(max_length=64, blank=True, null=True)
    matricula = models.CharField(max_length=32, verbose_name="Matrícula Policial")
    policial_nome = models.CharField(max_length=255, verbose_name="Nome do Policial")
    email_policial = models.EmailField(blank=True, null=True, validators=[validate_pc_ce_email], verbose_name="E-mail Institucional (@pc.ce.gov.br)")
    depto = models.CharField(max_length=255, blank=True, null=True)
    lotacao = models.CharField(max_length=255, blank=True, null=True)
    item_id = models.CharField(max_length=64, blank=True, null=True)
    item_desc = models.CharField(max_length=255, verbose_name="Descrição do Item")
    qtd = models.IntegerField(default=1)
    status = models.CharField(max_length=64, default="Pendente de Assinatura")
    condicao_dev = models.CharField(max_length=128, blank=True, null=True)
    motivo_recolhimento = models.CharField(max_length=255, blank=True, null=True)
    nup = models.CharField(max_length=128, blank=True, null=True)
    numero_io_bo = models.CharField(max_length=128, blank=True, null=True)
    numero_serie_reparo = models.CharField(max_length=128, blank=True, null=True)
    obs_dev = models.TextField(blank=True, null=True)
    serie = models.CharField(max_length=128, blank=True, null=True)
    token_confirmacao = models.CharField(max_length=128, blank=True, null=True)
    token_confirmacao_dev = models.CharField(max_length=128, blank=True, null=True)
    confirmado_via_email = models.BooleanField(default=False)
    confirmado_via_email_dev = models.BooleanField(default=False)
    data_envio_email = models.CharField(max_length=64, blank=True, null=True)
    data_envio_email_dev = models.CharField(max_length=64, blank=True, null=True)
    data_confirmacao_email = models.CharField(max_length=64, blank=True, null=True)
    data_confirmacao_email_dev = models.CharField(max_length=64, blank=True, null=True)
    assinatura_digital = models.TextField(blank=True, null=True)
    assinatura_dev = models.TextField(blank=True, null=True)
    obs = models.TextField(blank=True, null=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Cautela"
        verbose_name_plural = "Cautelas"
        ordering = ['-id']

    def __str__(self):
        return f"Cautela Nº {self.numero} - {self.policial_nome} ({self.status})"


class Servico(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=uuid.uuid4, editable=False)
    codigo = models.CharField(max_length=64, unique=True, verbose_name="Código da OS")
    policial_id = models.CharField(max_length=64, blank=True, null=True)
    matricula = models.CharField(max_length=32)
    policial_nome = models.CharField(max_length=255)
    depto = models.CharField(max_length=255, blank=True, null=True)
    lotacao = models.CharField(max_length=255, blank=True, null=True)
    tipo = models.CharField(max_length=128, verbose_name="Tipo de Serviço / Manutenção")
    data_rec = models.CharField(max_length=32, verbose_name="Data do Recolhimento / Entrada")
    status = models.CharField(max_length=64, default="Em Aberto")
    serie = models.CharField(max_length=128, blank=True, null=True)
    armeiro = models.CharField(max_length=255, blank=True, null=True)
    obs = models.TextField(blank=True, null=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Ordem de Serviço"
        verbose_name_plural = "Ordens de Serviço"
        ordering = ['-id']

    def __str__(self):
        return f"OS {self.codigo} - {self.policial_nome} ({self.tipo})"


class Lotacao(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=uuid.uuid4, editable=False)
    depto = models.CharField(max_length=255, verbose_name="Departamento Pai")
    nome = models.CharField(max_length=255, verbose_name="Nome da Lotação / Delegacia")
    cidade = models.CharField(max_length=128, blank=True, null=True)
    resp = models.CharField(max_length=255, blank=True, null=True, verbose_name="Responsável / Delegado")
    area_atuacao = models.CharField(max_length=128, blank=True, null=True)
    ais = models.CharField(max_length=32, blank=True, null=True)
    tel = models.CharField(max_length=32, blank=True, null=True)
    end = models.TextField(blank=True, null=True)
    seccional = models.CharField(max_length=255, blank=True, null=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Lotação / Delegacia"
        verbose_name_plural = "Lotações / Delegacias"
        ordering = ['nome']

    def __str__(self):
        return f"{self.nome} ({self.depto})"


class Fornecedor(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=255, verbose_name="Razão Social / Nome")
    cnpj = models.CharField(max_length=32, blank=True, null=True)
    contato = models.CharField(max_length=255, blank=True, null=True)
    tel = models.CharField(max_length=32, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    categoria = models.CharField(max_length=128, blank=True, null=True)
    end = models.TextField(blank=True, null=True)
    obs = models.TextField(blank=True, null=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Fornecedor"
        verbose_name_plural = "Fornecedores"
        ordering = ['nome']

    def __str__(self):
        return self.nome
