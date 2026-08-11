from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from database import Base

def generate_uuid():
    return str(uuid.uuid4())

class Policial(Base):
    __tablename__ = "policiais"

    id = Column(String, primary_key=True, default=generate_uuid)
    matricula = Column(String, unique=True, index=True, nullable=False)
    cpf = Column(String, nullable=True)
    nome = Column(String, index=True, nullable=False)
    cargo = Column(String, nullable=True)
    depto = Column(String, nullable=True)
    lotacao = Column(String, nullable=True)
    tel = Column(String, nullable=True)
    email = Column(String, nullable=True)
    obs = Column(Text, nullable=True)
    criado_em = Column(DateTime, default=datetime.utcnow)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Item(Base):
    __tablename__ = "itens"

    id = Column(String, primary_key=True, default=generate_uuid)
    patrimonio = Column(String, nullable=True, index=True)
    descricao = Column(String, nullable=False, index=True)
    categoria = Column(String, nullable=True, index=True)
    tamanho = Column(String, nullable=True)
    sexo = Column(String, nullable=True)
    cargo = Column(String, nullable=True)
    marca = Column(String, nullable=True)
    serie = Column(String, nullable=True)
    qtd_total = Column(Integer, default=1)
    qtd_disp = Column(Integer, default=1)
    qtd_min = Column(Integer, default=0)
    fornecedor_id = Column(String, nullable=True)
    dt_aq = Column(String, nullable=True)
    dt_val = Column(String, nullable=True)
    valor_compra = Column(Float, nullable=True)
    status = Column(String, default="Disponível")
    obs = Column(Text, nullable=True)
    criado_em = Column(DateTime, default=datetime.utcnow)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class BemIndividual(Base):
    __tablename__ = "bens_individuais"

    id = Column(String, primary_key=True, default=generate_uuid)
    item_id = Column(String, ForeignKey("itens.id"), nullable=True)
    patrimonio = Column(String, nullable=True)
    serie = Column(String, index=True, nullable=True)
    status = Column(String, default="Disponível")
    tamanho = Column(String, nullable=True)
    sexo = Column(String, nullable=True)
    dt_val = Column(String, nullable=True)
    obs = Column(Text, nullable=True)
    criado_em = Column(DateTime, default=datetime.utcnow)

class Cautela(Base):
    __tablename__ = "cautelas"

    id = Column(String, primary_key=True, default=generate_uuid)
    numero = Column(String, unique=True, index=True, nullable=False)
    data_saida = Column(String, nullable=False)
    data_prev = Column(String, nullable=True)
    data_dev = Column(String, nullable=True)
    policial_id = Column(String, ForeignKey("policiais.id"), nullable=True)
    matricula = Column(String, nullable=False)
    policial_nome = Column(String, nullable=False)
    email_policial = Column(String, nullable=True)
    depto = Column(String, nullable=True)
    lotacao = Column(String, nullable=True)
    item_id = Column(String, nullable=True)
    item_desc = Column(String, nullable=False)
    qtd = Column(Integer, default=1)
    status = Column(String, default="Pendente de Assinatura", index=True) # "Pendente de Assinatura", "Ativa", "Pendente (Devolução)", "Devolvido"
    serie = Column(String, nullable=True)
    
    # Signatures and email verification
    token_confirmacao = Column(String, nullable=True, index=True)
    confirmado_via_email = Column(Boolean, default=False)
    data_assinatura = Column(String, nullable=True)
    assinatura_digital = Column(Text, nullable=True)
    data_envio_email = Column(String, nullable=True)

    # Devolução attributes
    condicao_dev = Column(String, nullable=True)
    motivo_recolhimento = Column(String, nullable=True)
    nup = Column(String, nullable=True)
    numero_io_bo = Column(String, nullable=True)
    numero_serie_reparo = Column(String, nullable=True)
    obs_dev = Column(Text, nullable=True)
    token_confirmacao_dev = Column(String, nullable=True, index=True)
    confirmado_via_email_dev = Column(Boolean, default=False)
    data_assinatura_dev = Column(String, nullable=True)
    assinatura_dev = Column(Text, nullable=True)
    data_envio_email_dev = Column(String, nullable=True)

    criado_em = Column(DateTime, default=datetime.utcnow)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Movimento(Base):
    __tablename__ = "movimentos"

    id = Column(String, primary_key=True, default=generate_uuid)
    item_id = Column(String, nullable=True)
    arma_id = Column(String, nullable=True)
    patrimonio_id = Column(String, nullable=True)
    tipo = Column(String, nullable=False) # Entrada, Cautela, Devolucao, Baixa
    quantidade = Column(Integer, default=1)
    status = Column(String, nullable=True)
    data = Column(String, default=datetime.utcnow().isoformat)

class Departamento(Base):
    __tablename__ = "departamentos"

    id = Column(String, primary_key=True, default=generate_uuid)
    nome = Column(String, nullable=False)
    sigla = Column(String, nullable=False)
    ativo = Column(Boolean, default=True)

class Delegacia(Base):
    __tablename__ = "delegacias"

    id = Column(String, primary_key=True, default=generate_uuid)
    nome = Column(String, nullable=False)
    codigo = Column(String, nullable=True)
    cidade = Column(String, nullable=True)
    departamento_id = Column(String, nullable=True)
    ativo = Column(Boolean, default=True)

class Lotacao(Base):
    __tablename__ = "lotacoes"

    id = Column(String, primary_key=True, default=generate_uuid)
    depto = Column(String, nullable=True)
    nome = Column(String, nullable=False)
    cidade = Column(String, nullable=True)
    resp = Column(String, nullable=True)
    area_atuacao = Column(String, nullable=True)
    ais = Column(String, nullable=True)
    tel = Column(String, nullable=True)
    end = Column(String, nullable=True)
    seccional = Column(String, nullable=True)

class Fornecedor(Base):
    __tablename__ = "fornecedores"

    id = Column(String, primary_key=True, default=generate_uuid)
    nome = Column(String, nullable=False)
    cnpj = Column(String, nullable=True)
    contato = Column(String, nullable=True)
    tel = Column(String, nullable=True)
    email = Column(String, nullable=True)
    categoria = Column(String, nullable=True)
    end = Column(String, nullable=True)
    obs = Column(Text, nullable=True)
