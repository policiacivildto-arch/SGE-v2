from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

class PolicialBase(BaseModel):
    matricula: str
    nome: str
    cpf: Optional[str] = None
    cargo: Optional[str] = None
    depto: Optional[str] = None
    lotacao: Optional[str] = None
    tel: Optional[str] = None
    email: Optional[str] = None
    obs: Optional[str] = None

class PolicialCreate(PolicialBase):
    pass

class PolicialOut(PolicialBase):
    id: str
    criado_em: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class ItemBase(BaseModel):
    descricao: str
    patrimonio: Optional[str] = None
    categoria: Optional[str] = None
    tamanho: Optional[str] = None
    sexo: Optional[str] = None
    cargo: Optional[str] = None
    marca: Optional[str] = None
    serie: Optional[str] = None
    qtd_total: Optional[int] = 1
    qtd_disp: Optional[int] = 1
    qtd_min: Optional[int] = 0
    fornecedor_id: Optional[str] = None
    dt_aq: Optional[str] = None
    dt_val: Optional[str] = None
    valor_compra: Optional[float] = None
    status: Optional[str] = "Disponível"
    obs: Optional[str] = None

class ItemCreate(ItemBase):
    pass

class ItemOut(ItemBase):
    id: str
    
    class Config:
        from_attributes = True

class CautelaCreate(BaseModel):
    policial_id: Optional[str] = None
    item_id: Optional[str] = None
    qtd: Optional[int] = 1
    numero_serie: Optional[str] = None
    serie: Optional[str] = None
    data_prev: Optional[str] = None
    obs: Optional[str] = None

class DevolucaoCreate(BaseModel):
    data_dev: Optional[str] = None
    condicao_dev: Optional[str] = None
    status_item: Optional[str] = None
    motivo_recolhimento: Optional[str] = None
    nup: Optional[str] = None
    numero_io_bo: Optional[str] = None
    numero_serie_reparo: Optional[str] = None
    obs_dev: Optional[str] = None
    assinatura_dev: Optional[str] = None
