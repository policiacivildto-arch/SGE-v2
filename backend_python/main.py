import os
import uuid
import secrets
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import engine, Base, get_db
import models
import schemas

# Create database tables automatically
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SGA - Sistema de Gestão de Armaria API",
    description="API Python (FastAPI) completa para controle de armaria, policial, material bélico, cautelas e assinaturas digitais por e-mail.",
    version="1.0.0"
)

# Enable CORS for Frontend/Mobile Web/iOS/Android
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def generate_digital_signature_svg(policial_nome: str, matricula: str, token: str, data_confirmacao: str, is_devolucao: bool = False) -> str:
    token_short = token[:14].upper() if token else "TOK-CONFIRMED"
    title = "✓ DEVOLUÇÃO ASSINADA DIGITALMENTE VIA E-MAIL" if is_devolucao else "✓ CAUTELA ASSINADA DIGITALMENTE VIA E-MAIL"
    header_bg = "#ecfdf5" if is_devolucao else "#f0f9ff"
    stroke_color = "#059669" if is_devolucao else "#0284c7"
    text_color = "#047857" if is_devolucao else "#0369a1"

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="480" height="130" viewBox="0 0 480 130">
    <rect width="480" height="130" fill="{header_bg}" stroke="{stroke_color}" stroke-width="2" rx="8"/>
    <rect x="8" y="8" width="464" height="114" fill="none" stroke="{stroke_color}" stroke-width="1" stroke-dasharray="4 4" rx="6"/>
    <text x="24" y="32" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="{text_color}">{title}</text>
    <text x="24" y="56" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="#0f172a">Policial: {policial_nome or 'Servidor'}</text>
    <text x="24" y="76" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#334155">Matrícula: {matricula or 'N/I'} | Data/Hora: {data_confirmacao}</text>
    <text x="24" y="96" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">Hash Validação: {token_short} | Protocolo E-mail Confirmado</text>
</svg>'''

@app.get("/api/health")
def health_check():
    return {"status": "ok", "system": "SGA Python API", "timestamp": datetime.utcnow().isoformat()}

# --- POLICIAIS ---
@app.get("/api/policiais", response_model=List[schemas.PolicialOut])
def get_policiais(db: Session = Depends(get_db)):
    return db.query(models.Policial).all()

@app.post("/api/policiais", response_model=schemas.PolicialOut)
def create_policial(policial: schemas.PolicialCreate, db: Session = Depends(get_db)):
    db_pol = models.Policial(**policial.dict())
    db.add(db_pol)
    db.commit()
    db.refresh(db_pol)
    return db_pol

@app.put("/api/policiais/{policial_id}", response_model=schemas.PolicialOut)
def update_policial(policial_id: str, data: schemas.PolicialCreate, db: Session = Depends(get_db)):
    pol = db.query(models.Policial).filter(models.Policial.id == policial_id).first()
    if not pol:
        raise HTTPException(status_code=404, detail="Policial não encontrado")
    for key, value in data.dict().items():
        setattr(pol, key, value)
    db.commit()
    db.refresh(pol)
    return pol

@app.delete("/api/policiais/{policial_id}")
def delete_policial(policial_id: str, db: Session = Depends(get_db)):
    pol = db.query(models.Policial).filter(models.Policial.id == policial_id).first()
    if not pol:
        raise HTTPException(status_code=404, detail="Policial não encontrado")
    db.delete(pol)
    db.commit()
    return {"detail": "Policial removido com sucesso"}

# --- BENS / ITENS / MATERIAL BÉLICO ---
@app.get("/api/bens")
@app.get("/api/material-belico")
@app.get("/api/itens")
def get_itens(db: Session = Depends(get_db)):
    return db.query(models.Item).all()

@app.post("/api/bens")
@app.post("/api/material-belico")
@app.post("/api/itens")
def create_item(item: schemas.ItemCreate, db: Session = Depends(get_db)):
    db_item = models.Item(**item.dict())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

# --- CAUTELAS ---
@app.get("/api/proximo-numero-cautela")
def get_proximo_numero_cautela(db: Session = Depends(get_db)):
    total = db.query(models.Cautela).count()
    year = datetime.now().year
    number_str = f"{(total + 1):04d}/{year}"
    return {"numero": number_str}

@app.get("/api/cautelas")
def get_cautelas(db: Session = Depends(get_db)):
    return db.query(models.Cautela).order_by(models.Cautela.criado_em.desc()).all()

@app.post("/api/cautelas")
def create_cautela(payload: schemas.CautelaCreate, req: Request, db: Session = Depends(get_db)):
    pol = db.query(models.Policial).filter(models.Policial.id == payload.policial_id).first()
    if not pol:
        raise HTTPException(status_code=400, detail="Policial selecionado não foi encontrado.")

    item = db.query(models.Item).filter(models.Item.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=400, detail="Item selecionado não foi encontrado.")

    if item.qtd_disp <= 0:
        raise HTTPException(status_code=400, detail="Item indisponível no estoque.")

    # Deduct inventory
    item.qtd_disp = max(0, item.qtd_disp - (payload.qtd or 1))
    if item.qtd_disp == 0:
        item.status = "Em Uso"

    count = db.query(models.Cautela).count()
    year = datetime.now().year
    num_cautela = f"{(count + 1):04d}/{year}"
    token = f"tok_{secrets.token_hex(6)}{int(datetime.utcnow().timestamp())}"

    nova_cautela = models.Cautela(
        numero=num_cautela,
        data_saida=datetime.now().strftime("%d/%m/%Y %H:%M"),
        data_prev=payload.data_prev or "",
        policial_id=pol.id,
        matricula=pol.matricula,
        policial_nome=pol.nome,
        email_policial=pol.email or "policial@pc.se.gov.br",
        depto=pol.depto or "",
        lotacao=pol.lotacao or "",
        item_id=item.id,
        item_desc=item.descricao,
        qtd=payload.qtd or 1,
        serie=payload.serie or payload.numero_serie or item.serie or "",
        status="Pendente de Assinatura",
        token_confirmacao=token,
        confirmado_via_email=False,
        data_envio_email=datetime.utcnow().isoformat()
    )

    db.add(nova_cautela)
    
    # Register movement
    mov = models.Movimento(
        item_id=item.id,
        tipo="Cautela",
        quantidade=payload.qtd or 1,
        status="Saída - Pendente Assinatura"
    )
    db.add(mov)
    db.commit()
    db.refresh(nova_cautela)

    host = req.headers.get("host", "localhost:8000")
    scheme = "https" if "https" in req.headers.get("x-forwarded-proto", "") else "http"
    confirm_url = f"{scheme}://{host}/api/cautelas/confirmar-email?token={token}"

    return {
        "cautela": nova_cautela,
        "email_info": {
            "success": True,
            "confirmUrl": confirm_url,
            "email": nova_cautela.email_policial,
            "token": token
        }
    }

@app.post("/api/cautelas/{cautela_id}/devolver")
def devolver_cautela(cautela_id: str, dev_data: schemas.DevolucaoCreate, req: Request, db: Session = Depends(get_db)):
    cautela = db.query(models.Cautela).filter(models.Cautela.id == cautela_id).first()
    if not cautela:
        raise HTTPException(status_code=404, detail="Cautela não encontrada")

    token_dev = f"tok_dev_{secrets.token_hex(6)}{int(datetime.utcnow().timestamp())}"

    cautela.data_dev = dev_data.data_dev or datetime.now().strftime("%d/%m/%Y %H:%M")
    cautela.condicao_dev = dev_data.condicao_dev or "Normal"
    cautela.motivo_recolhimento = dev_data.motivo_recolhimento
    cautela.nup = dev_data.nup
    cautela.numero_io_bo = dev_data.numero_io_bo
    cautela.numero_serie_reparo = dev_data.numero_serie_reparo
    cautela.obs_dev = dev_data.obs_dev
    cautela.token_confirmacao_dev = token_dev
    cautela.status = "Pendente (Devolução)"
    cautela.data_envio_email_dev = datetime.utcnow().isoformat()

    # Re-increment stock
    if cautela.item_id:
        item = db.query(models.Item).filter(models.Item.id == cautela.item_id).first()
        if item:
            item.qtd_disp += cautela.qtd
            item.status = "Disponível"

    db.commit()
    db.refresh(cautela)

    host = req.headers.get("host", "localhost:8000")
    scheme = "https" if "https" in req.headers.get("x-forwarded-proto", "") else "http"
    confirm_url = f"{scheme}://{host}/api/cautelas/confirmar-email-dev?token={token_dev}"

    return {
        "cautela": cautela,
        "email_info": {
            "success": True,
            "confirmUrl": confirm_url,
            "email": cautela.email_policial,
            "token": token_dev
        }
    }

# --- EMAIL CONFIRMATION ENDPOINTS (WEB BROWSERS) ---
@app.get("/api/cautelas/confirmar-email", response_class=HTMLResponse)
def confirmar_email(token: str = Query(...), db: Session = Depends(get_db)):
    cautela = db.query(models.Cautela).filter(models.Cautela.token_confirmacao == token).first()
    if not cautela:
        return HTMLResponse(content="<h2>❌ Token Inválido ou Cautela Não Encontrada</h2>", status_code=400)

    data_now = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    svg_sig = generate_digital_signature_svg(cautela.policial_nome, cautela.matricula, token, data_now, is_devolucao=False)

    cautela.status = "Ativa"
    cautela.assinatura_digital = svg_sig
    cautela.confirmado_via_email = True
    cautela.data_assinatura = data_now
    db.commit()

    html_content = f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>Cautela Confirmada</title>
    <style>body {{ font-family: sans-serif; background: #f0f9ff; text-align: center; padding: 40px; }} .box {{ background: white; max-width: 500px; margin: auto; padding: 24px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }}</style>
    </head>
    <body>
        <div class="box">
            <h2 style="color: #0369a1;">✓ Cautela nº {cautela.numero} Confirmada!</h2>
            <p>O policial <strong>{cautela.policial_nome}</strong> confirmou o recebimento do item <strong>{cautela.item_desc}</strong>.</p>
            <p style="font-size: 12px; color: #64748b;">A assinatura digital via e-mail foi anexada ao sistema com sucesso.</p>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.get("/api/cautelas/confirmar-email-dev", response_class=HTMLResponse)
def confirmar_email_devolucao(token: str = Query(...), db: Session = Depends(get_db)):
    cautela = db.query(models.Cautela).filter(models.Cautela.token_confirmacao_dev == token).first()
    if not cautela:
        return HTMLResponse(content="<h2>❌ Token Inválido ou Devolução Não Encontrada</h2>", status_code=400)

    data_now = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    svg_sig = generate_digital_signature_svg(cautela.policial_nome, cautela.matricula, token, data_now, is_devolucao=True)

    cautela.status = "Devolvido"
    cautela.assinatura_dev = svg_sig
    cautela.confirmado_via_email_dev = True
    cautela.data_assinatura_dev = data_now
    db.commit()

    html_content = f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>Devolução Confirmada</title>
    <style>body {{ font-family: sans-serif; background: #ecfdf5; text-align: center; padding: 40px; }} .box {{ background: white; max-width: 500px; margin: auto; padding: 24px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }}</style>
    </head>
    <body>
        <div class="box">
            <h2 style="color: #047857;">✓ Devolução da Cautela nº {cautela.numero} Confirmada!</h2>
            <p>A devolução do item <strong>{cautela.item_desc}</strong> pelo policial <strong>{cautela.policial_nome}</strong> foi concluída com sucesso.</p>
            <p style="font-size: 12px; color: #64748b;">Assinatura digital de baixa registrada na Armaria.</p>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.post("/api/cautelas/confirmar-token")
def confirmar_token_api(token: Optional[str] = Query(None), id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    cautela = None
    if token:
        cautela = db.query(models.Cautela).filter((models.Cautela.token_confirmacao == token) | (models.Cautela.token_confirmacao_dev == token)).first()
    elif id:
        cautela = db.query(models.Cautela).filter(models.Cautela.id == id).first()

    if not cautela:
        raise HTTPException(status_code=404, detail="Cautela não encontrada.")

    data_now = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    is_dev = cautela.status == "Pendente (Devolução)" or (token and token == cautela.token_confirmacao_dev)
    token_val = (cautela.token_confirmacao_dev if is_dev else cautela.token_confirmacao) or "TOK-SIMULATED"
    svg_sig = generate_digital_signature_svg(cautela.policial_nome, cautela.matricula, token_val, data_now, is_devolucao=is_dev)

    if is_dev:
        cautela.status = "Devolvido"
        cautela.assinatura_dev = svg_sig
        cautela.confirmado_via_email_dev = True
        cautela.data_assinatura_dev = data_now
    else:
        cautela.status = "Ativa"
        cautela.assinatura_digital = svg_sig
        cautela.confirmado_via_email = True
        cautela.data_assinatura = data_now

    db.commit()
    db.refresh(cautela)
    return {"detail": "Confirmado com sucesso!", "cautela": cautela}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
