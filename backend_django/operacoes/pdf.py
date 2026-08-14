"""Geração de PDF para Cautela e Servico — porta de `drawBrasaoPdfHeader`,
`GET /api/cautelas/:id/documento-pdf` e `GET /api/servicos/:id/documento-pdf`
em server.ts (linhas ~2147-2383), usando reportlab no lugar de pdfkit.

Não é reprodução pixel-perfect (motor de PDF diferente), mas replica as
mesmas seções/dados/ordem do documento original.
"""

import base64
import re
from pathlib import Path

from django.conf import settings
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 50
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN

# server.ts resolvia o brasão a partir de `public/brasao_pcce.png`,
# relativo ao cwd do processo Node (raiz do repo). Aqui replicamos o
# mesmo caminho relativo à raiz do monorepo (pai de backend_django/).
_BRASAO_PATH = Path(settings.BASE_DIR).parent / "public" / "brasao_pcce.png"


def _draw_brasao_header(c: canvas.Canvas):
    """Réplica de drawBrasaoPdfHeader em server.ts:2147 — best-effort,
    ignora silenciosamente se a imagem não existir (mesmo comportamento
    do try/catch original)."""
    try:
        if _BRASAO_PATH.exists():
            img = ImageReader(str(_BRASAO_PATH))
            size = 50
            x = PAGE_WIDTH / 2 - size / 2
            y = PAGE_HEIGHT - 20 - size
            c.drawImage(img, x, y, width=size, height=size, preserveAspectRatio=True, mask="auto")
    except Exception:
        pass


class _DocWriter:
    """Cursor de texto vertical simples, para aproximar a API incremental
    de `doc.text()`/`doc.moveDown()` do pdfkit."""

    def __init__(self, c: canvas.Canvas, start_y):
        self.c = c
        self.y = start_y
        self.font = "Helvetica"
        self.size = 10

    def set_font(self, font=None, size=None):
        if font:
            self.font = font
        if size:
            self.size = size
        self.c.setFont(self.font, self.size)

    def move_down(self, lines=1.0):
        self.y -= self.size * 1.6 * lines

    def _line_height(self):
        return self.size * 1.35

    def text(self, value, align="left", x=None, width=None):
        self.c.setFont(self.font, self.size)
        x = MARGIN if x is None else x
        width = CONTENT_WIDTH if width is None else width
        lines = self._wrap(value, width)
        for line in lines:
            self._draw_line(line, x, width, align)
            self.y -= self._line_height()

    def _draw_line(self, line, x, width, align):
        c = self.c
        if align == "center":
            c.drawCentredString(x + width / 2, self.y, line)
        elif align == "right":
            c.drawRightString(x + width, self.y, line)
        else:
            c.drawString(x, self.y, line)

    def _wrap(self, value, width):
        words = str(value).split(" ")
        lines = []
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if self.c.stringWidth(candidate, self.font, self.size) <= width or not current:
                current = candidate
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines or [""]


def _fixed_text(c, text, x, y, font="Helvetica", size=10, width=None, align="left"):
    c.setFont(font, size)
    if align == "center" and width:
        c.drawCentredString(x + width / 2, y, text)
    elif align == "right" and width:
        c.drawRightString(x + width, y, text)
    else:
        c.drawString(x, y, text)


def gerar_pdf_cautela(cautela) -> bytes:
    """Réplica de GET /api/cautelas/:id/documento-pdf (server.ts:2161)."""
    from io import BytesIO

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    _draw_brasao_header(c)

    w = _DocWriter(c, PAGE_HEIGHT - 90)
    w.set_font("Helvetica-Bold", 13)
    w.text("POLÍCIA CIVIL DO ESTADO DO CEARÁ", align="center")
    w.set_font("Helvetica", 9)
    w.text("GOVERNO DO ESTADO • SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL", align="center")
    w.set_font("Helvetica-Bold", 10)
    w.text("DEPARTAMENTO TÉCNICO OPERACIONAL", align="center")
    w.text("SEÇÃO DE AQUISIÇÃO, LOGÍSTICA E TIRO - DTO", align="center")
    w.move_down(1.2)

    w.set_font("Helvetica-Bold", 13)
    w.text(f"TERMO DE CAUTELA DE MATERIAL BÉLICO Nº {cautela.numero}", align="center")
    w.move_down(1.2)

    depto_nome = cautela.departamento.nome if cautela.departamento_id else ""
    lotacao_nome = cautela.lotacao.nome if cautela.lotacao_id else ""

    w.set_font("Helvetica-Bold", 10)
    w.text("1. DADOS DA CAUTELA:")
    w.set_font("Helvetica", 10)
    w.text(f"Data de Saída: {cautela.data_saida or '—'}")
    w.text(f"Previsão de Devolução: {cautela.data_prev or 'Não definida'}")
    status_exibicao = "Em Uso" if cautela.status == "Ativa" else cautela.status
    w.text(f"Status da Cautela: {status_exibicao}")
    w.move_down()

    w.set_font("Helvetica-Bold", 10)
    w.text("2. DESTINATÁRIO / ATRIBUIÇÃO:")
    w.set_font("Helvetica", 10)
    is_unidade = (not cautela.policial_id) or str(cautela.policial_nome or "").startswith("UNIDADE:")
    if is_unidade:
        w.text(f"Atribuição: CARGA DA UNIDADE ({lotacao_nome or depto_nome or '—'})")
    elif cautela.policial_nome or cautela.matricula:
        w.text(f"Policial Beneficiário: {cautela.policial_nome or '—'}")
        w.text(f"Matrícula: {cautela.matricula or '—'}")
    else:
        w.text("Destinatário: Unidade / Carga Geral")
    w.text(f"Departamento: {depto_nome or '—'}")
    w.text(f"Lotação / Unidade: {lotacao_nome or '—'}")
    w.move_down()

    w.set_font("Helvetica-Bold", 10)
    w.text("3. ESPECIFICAÇÃO DO ITEM CAUTELADO:")
    w.set_font("Helvetica", 10)
    w.text(f"Item: {cautela.item_desc or '—'}")
    categoria = cautela.item.categoria if cautela.item_id else ""
    w.text(f"Categoria: {categoria or '—'}")
    w.text(f"Quantidade: {cautela.qtd or 1}")
    if cautela.qtd_carregadores not in (None, ""):
        w.text(f"Quantidade de Carregadores: {cautela.qtd_carregadores}")
    w.text(f"Número de Série: {cautela.serie or '—'}")
    patrimonio = cautela.item.patrimonio if cautela.item_id else ""
    w.text(f"Patrimônio / Tombo: {patrimonio or '—'}")
    w.move_down()

    if cautela.obs_dev:
        w.set_font("Helvetica-Bold", 10)
        w.text("4. OBSERVAÇÕES:")
        w.set_font("Helvetica", 10)
        w.text(cautela.obs_dev)
        w.move_down()

    w.set_font("Helvetica-Bold", 10)
    w.text("5. DECLARAÇÃO DE RESPONSABILIDADE:")
    w.set_font("Helvetica", 9)
    w.text(
        "Declaro sob as penas da lei que recebi o material bélico/equipamento acima especificado, em "
        "perfeito estado de conservação e funcionamento, comprometendo-me a zelar pela sua guarda, "
        "manutenção e integridade física. Obrigo-me a apresentá-lo ao Setor de Armamento e Material "
        "Bélico sempre que solicitado, ou a devolvê-lo imediatamente em caso de transferência, licença, "
        "aposentadoria ou exoneração, sob pena de responder administrativa, civil e penalmente nos "
        "termos da legislação vigente."
    )
    w.move_down(3)

    start_y = w.y

    # Assinatura digital (imagem base64) ou aviso de pendência.
    if cautela.assinatura_digital and cautela.assinatura_digital.startswith("data:image"):
        try:
            b64 = re.sub(r"^data:image/\w+;base64,", "", cautela.assinatura_digital)
            img_bytes = base64.b64decode(b64)
            from io import BytesIO as _BIO
            img = ImageReader(_BIO(img_bytes))
            c.drawImage(img, 60, start_y - 5, width=200, height=32, preserveAspectRatio=True, mask="auto")
        except Exception:
            pass
    elif cautela.status in ("Pendente de Assinatura", "Pendente (Devolução)"):
        c.setFillColorRGB(0.85, 0.47, 0.02)
        _fixed_text(c, "[ PENDENTE DE ASSINATURA DIGITAL ]", 50, start_y + 15, size=8, width=220, align="center")
        c.setFillColorRGB(0, 0, 0)

    sig_nome = cautela.policial_nome or "Responsável pela Unidade"
    sig_mat = f"Matrícula: {cautela.matricula}" if cautela.matricula else "Assinatura do Recebedor"

    _fixed_text(c, "__________________________________________", 50, start_y, width=220, align="center")
    _fixed_text(c, sig_nome, 50, start_y - 15, width=220, align="center")
    _fixed_text(c, sig_mat, 50, start_y - 30, width=220, align="center")

    _fixed_text(c, "__________________________________________", 320, start_y, width=220, align="center")
    _fixed_text(c, "Setor de Armamento e Munição", 320, start_y - 15, width=220, align="center")
    _fixed_text(c, "Identificação do Emissor (S.G.A.)", 320, start_y - 30, width=220, align="center")

    _fixed_text(
        c,
        "Av. Professor Guilhon, s/n, Aeroporto, 4º Andar, Fortaleza/CE – CEP 60415-330 | Tel. 3101-7300.",
        50, 60, size=8, width=CONTENT_WIDTH, align="center",
    )

    c.showPage()
    c.save()
    return buffer.getvalue()


def gerar_pdf_servico(servico) -> bytes:
    """Réplica de GET /api/servicos/:id/documento-pdf (server.ts:2284)."""
    from io import BytesIO

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    _draw_brasao_header(c)

    w = _DocWriter(c, PAGE_HEIGHT - 90)
    w.set_font("Helvetica-Bold", 13)
    w.text("POLÍCIA CIVIL DO ESTADO DO CEARÁ", align="center")
    w.set_font("Helvetica", 9)
    w.text("GOVERNO DO ESTADO • SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL", align="center")
    w.set_font("Helvetica-Bold", 10)
    w.text("DEPARTAMENTO TÉCNICO OPERACIONAL", align="center")
    w.text("SEÇÃO DE AQUISIÇÃO, LOGÍSTICA E TIRO - DTO", align="center")
    w.move_down(1.2)

    w.set_font("Helvetica-Bold", 13)
    w.text(f"ORDEM DE SERVIÇO Nº {servico.codigo}", align="center")
    w.move_down(1.2)

    depto_nome = servico.departamento.nome if servico.departamento_id else ""
    lotacao_nome = servico.lotacao.nome if servico.lotacao_id else ""

    w.set_font("Helvetica-Bold", 10)
    w.text("1. DADOS DA ORDEM DE SERVIÇO:")
    w.set_font("Helvetica", 10)
    w.text(f"Data de Recebimento: {servico.data_rec or '—'}")
    w.text(f"Data de Devolução: {servico.data_dev or 'Aberto / Em manutenção'}")
    w.text(f"Tipo de Serviço: {servico.tipo or '—'}")
    w.text(f"Motivo: {servico.motivo or '—'}")
    w.text(f"Armeiro Responsável: {servico.armeiro or '—'}")
    w.text(f"Status do Serviço: {servico.status or '—'}")
    w.move_down()

    w.set_font("Helvetica-Bold", 10)
    w.text("2. DADOS DO POLICIAL SOLICITANTE:")
    w.set_font("Helvetica", 10)
    w.text(f"Policial: {servico.policial_nome or '—'}")
    w.text(f"Matrícula: {servico.matricula or '—'}")
    w.text(f"Departamento: {depto_nome or '—'}")
    w.text(f"Lotação / Unidade: {lotacao_nome or '—'}")
    w.move_down()

    w.set_font("Helvetica-Bold", 10)
    w.text("3. ESPECIFICAÇÃO DO ITEM / ARMAMENTO:")
    w.set_font("Helvetica", 10)
    w.text(f"Categoria: {servico.categoria or '—'}")
    w.text(f"Marca / Modelo: {servico.marca or '—'} / {servico.modelo or '—'}")
    w.text(f"Calibre: {servico.calibre or '—'}")
    w.text(f"Número de Série: {servico.serie or '—'}")
    if servico.descricao:
        w.text(f"Descrição: {servico.descricao}")
    w.move_down()

    w.set_font("Helvetica-Bold", 10)
    w.text("4. DETALHAMENTO DO SERVIÇO:")
    w.set_font("Helvetica", 10)
    w.text(f"Trabalho Realizado: {servico.trabalho_realizado or 'Ainda não concluído'}")
    pecas = [f"{nome} ({qtd})" for nome, qtd in (servico.pecas_substituidas or {}).items() if qtd]
    w.text(f"Peças Substituídas: {', '.join(pecas) if pecas else 'Nenhuma'}")
    w.text(f"Observações: {servico.obs or 'Sem observações adicionais'}")
    w.move_down(3)

    start_y = w.y
    _fixed_text(c, "__________________________________________", 50, start_y, width=220, align="center")
    _fixed_text(c, servico.policial_nome or "Policial Solicitante", 50, start_y - 15, width=220, align="center")
    _fixed_text(
        c, f"Matrícula: {servico.matricula}" if servico.matricula else "Assinatura do Policial",
        50, start_y - 30, width=220, align="center",
    )

    _fixed_text(c, "__________________________________________", 320, start_y, width=220, align="center")
    _fixed_text(c, servico.armeiro or "Armeiro de Plantão", 320, start_y - 15, width=220, align="center")
    _fixed_text(c, "Assinatura do Armeiro", 320, start_y - 30, width=220, align="center")

    _fixed_text(
        c,
        "Av. Professor Guilhon, s/n, Aeroporto, 4º Andar, Fortaleza/CE – CEP 60415-330 | Tel. 3101-7300.",
        50, 60, size=8, width=CONTENT_WIDTH, align="center",
    )

    c.showPage()
    c.save()
    return buffer.getvalue()
