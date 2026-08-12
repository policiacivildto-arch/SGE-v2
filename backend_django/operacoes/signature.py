import base64

from django.utils import timezone


def _formatar_data_pt_br(data):
    """Equivalente a `Date.toLocaleString("pt-BR")` no server.ts."""
    local = timezone.localtime(data) if timezone.is_aware(data) else data
    return local.strftime("%d/%m/%Y %H:%M:%S")


def generate_digital_signature_svg(policial_nome, matricula, token, data_confirmacao, is_devolucao=False):
    """Porta exata de `generateDigitalSignatureSvg` (server.ts:67-85) —
    fonte da verdade estabelecida nas fases anteriores (serverDb.ts >
    backend_python), inclusive o wrapper base64 data-URI.
    """
    token_short = token[:14].upper() if token else "TOK-CONFIRMED"
    date_formatted = _formatar_data_pt_br(data_confirmacao) if data_confirmacao else _formatar_data_pt_br(timezone.now())
    title = "✓ DEVOLUÇÃO ASSINADA DIGITALMENTE VIA E-MAIL" if is_devolucao else "✓ CAUTELA ASSINADA DIGITALMENTE VIA E-MAIL"
    header_bg = "#ecfdf5" if is_devolucao else "#f0f9ff"
    stroke_color = "#059669" if is_devolucao else "#0284c7"
    text_color = "#047857" if is_devolucao else "#0369a1"

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="480" height="130" viewBox="0 0 480 130">
    <rect width="480" height="130" fill="{header_bg}" stroke="{stroke_color}" stroke-width="2" rx="8"/>
    <rect x="8" y="8" width="464" height="114" fill="none" stroke="{stroke_color}" stroke-width="1" stroke-dasharray="4 4" rx="6"/>
    <text x="24" y="32" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="{text_color}">{title}</text>
    <text x="24" y="56" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="#0f172a">Policial: {policial_nome or 'Servidor'}</text>
    <text x="24" y="76" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#334155">Matrícula: {matricula or 'N/I'} | Data/Hora: {date_formatted}</text>
    <text x="24" y="96" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b">Hash Validação: {token_short} | Protocolo E-mail Confirmado</text>
    <text x="24" y="112" font-family="Arial, Helvetica, sans-serif" font-size="9" fill="#94a3b8">SGA - AUTENTICAÇÃO DIGITAL GOV.SE</text>
</svg>'''
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"
