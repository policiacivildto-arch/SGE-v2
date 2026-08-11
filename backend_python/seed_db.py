import os
import json
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
import models

def seed():
    print("Criando tabelas no banco de dados...")
    Base.metadata.create_all(bind=engine)

    db_json_path = os.path.join(os.path.dirname(__file__), "..", "db.json")
    if not os.path.exists(db_json_path):
        print("Arquivo db.json não encontrado. Pulo de sementeira.")
        return

    with open(db_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    db: Session = SessionLocal()
    try:
        # Seed Policiais
        policiais_data = data.get("policiais", [])
        if db.query(models.Policial).count() == 0 and policiais_data:
            print(f"Semeando {len(policiais_data)} policiais...")
            for item in policiais_data:
                pol = models.Policial(
                    id=item.get("id"),
                    matricula=item.get("matricula", ""),
                    cpf=item.get("cpf", ""),
                    nome=item.get("nome", ""),
                    cargo=item.get("cargo", ""),
                    depto=item.get("depto", ""),
                    lotacao=item.get("lotacao", ""),
                    tel=item.get("tel", ""),
                    email=item.get("email", ""),
                    obs=item.get("obs", "")
                )
                db.add(pol)

        # Seed Itens / bens
        itens_data = data.get("bens", []) or data.get("itens", [])
        if db.query(models.Item).count() == 0 and itens_data:
            print(f"Semeando {len(itens_data)} itens/bens...")
            for item in itens_data:
                it = models.Item(
                    id=item.get("id"),
                    patrimonio=item.get("patrimonio", ""),
                    descricao=item.get("descricao", "Sem descrição"),
                    categoria=item.get("categoria", "Geral"),
                    tamanho=item.get("tamanho", ""),
                    sexo=item.get("sexo", ""),
                    cargo=item.get("cargo", ""),
                    marca=item.get("marca", ""),
                    serie=item.get("serie", ""),
                    qtd_total=item.get("qtd_total", 1),
                    qtd_disp=item.get("qtd_disp", 1),
                    qtd_min=item.get("qtd_min", 0),
                    fornecedor_id=item.get("fornecedor_id", ""),
                    status=item.get("status", "Disponível"),
                    obs=item.get("obs", "")
                )
                db.add(it)

        # Seed Cautelas
        cautelas_data = data.get("cautelas", [])
        if db.query(models.Cautela).count() == 0 and cautelas_data:
            print(f"Semeando {len(cautelas_data)} cautelas...")
            for item in cautelas_data:
                caut = models.Cautela(
                    id=item.get("id"),
                    numero=item.get("numero", "0001/2026"),
                    data_saida=item.get("data_saida", ""),
                    data_prev=item.get("data_prev", ""),
                    data_dev=item.get("data_dev", ""),
                    policial_id=item.get("policial_id"),
                    matricula=item.get("matricula", ""),
                    policial_nome=item.get("policial_nome", ""),
                    email_policial=item.get("email_policial", ""),
                    depto=item.get("depto", ""),
                    lotacao=item.get("lotacao", ""),
                    item_id=item.get("item_id"),
                    item_desc=item.get("item_desc", ""),
                    qtd=item.get("qtd", 1),
                    status=item.get("status", "Pendente de Assinatura"),
                    serie=item.get("serie", ""),
                    token_confirmacao=item.get("token_confirmacao", ""),
                    confirmado_via_email=item.get("confirmado_via_email", False),
                    data_assinatura=item.get("data_assinatura", ""),
                    assinatura_digital=item.get("assinatura_digital", ""),
                    condicao_dev=item.get("condicao_dev", ""),
                    obs_dev=item.get("obs_dev", ""),
                    token_confirmacao_dev=item.get("token_confirmacao_dev", ""),
                    confirmado_via_email_dev=item.get("confirmado_via_email_dev", False),
                    data_assinatura_dev=item.get("data_assinatura_dev", ""),
                    assinatura_dev=item.get("assinatura_dev", "")
                )
                db.add(caut)

        db.commit()
        print("Sementeira executada com sucesso no banco Python!")
    except Exception as e:
        print(f"Erro durante a sementeira: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed()
