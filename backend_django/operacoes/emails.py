from django.conf import settings
from django.core.mail import send_mail
from django.urls import reverse
from django.utils.html import strip_tags


def is_smtp_configured():
    return settings.EMAIL_BACKEND == "django.core.mail.backends.smtp.EmailBackend"


def _enviar(subject, html, destinatario):
    try:
        send_mail(
            subject,
            strip_tags(html),
            settings.DEFAULT_FROM_EMAIL,
            [destinatario],
            html_message=html,
        )
        return True, None
    except Exception as exc:  # e-mail nunca deve derrubar o fluxo de negócio
        return False, str(exc)


def send_cautela_email_confirmation(cautela, request):
    if not cautela.email_policial:
        return {"success": False, "error": "E-mail do policial não informado.", "is_smtp_configured": is_smtp_configured()}

    confirm_url = request.build_absolute_uri(
        reverse("operacoes:confirmar-email")
    ) + f"?token={cautela.token_confirmacao}"
    subject = f"Solicitação de Confirmação de Cautela nº {cautela.numero}"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width:560px; margin:auto;">
      <h2 style="color:#2563eb;">Confirmação de Cautela nº {cautela.numero}</h2>
      <p>Prezado(a) <strong>{cautela.policial_nome}</strong>, confirme o recebimento do material abaixo:</p>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td><strong>Item</strong></td><td>{cautela.item_desc}</td></tr>
        <tr><td><strong>Série</strong></td><td>{cautela.serie or '-'}</td></tr>
        <tr><td><strong>Quantidade</strong></td><td>{cautela.qtd}</td></tr>
        <tr><td><strong>Lotação</strong></td><td>{cautela.lotacao}</td></tr>
        <tr><td><strong>Data de saída</strong></td><td>{cautela.data_saida or '-'}</td></tr>
      </table>
      <p style="text-align:center; margin:24px 0;">
        <a href="{confirm_url}" style="background:#2563eb; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none;">Confirmar Recebimento</a>
      </p>
    </div>
    """
    success, error = _enviar(subject, html, cautela.email_policial)
    result = {
        "success": success, "confirm_url": confirm_url, "email": cautela.email_policial,
        "token": cautela.token_confirmacao, "is_smtp_configured": is_smtp_configured(),
    }
    if error:
        result["error"] = error
    return result


def send_devolucao_email_confirmation(cautela, request):
    if not cautela.email_policial:
        return {"success": False, "error": "E-mail do policial não informado.", "is_smtp_configured": is_smtp_configured()}

    confirm_url = request.build_absolute_uri(
        reverse("operacoes:confirmar-email-dev")
    ) + f"?token={cautela.token_confirmacao_dev}"
    subject = f"Confirmação de DEVOLUÇÃO de Material — Cautela nº {cautela.numero}"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width:560px; margin:auto;">
      <h2 style="color:#059669;">Confirmação de Devolução — Cautela nº {cautela.numero}</h2>
      <p>Prezado(a) <strong>{cautela.policial_nome}</strong>, confirme a devolução do material abaixo:</p>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td><strong>Item</strong></td><td>{cautela.item_desc}</td></tr>
        <tr><td><strong>Série</strong></td><td>{cautela.serie or '-'}</td></tr>
        <tr><td><strong>Data de devolução</strong></td><td>{cautela.data_dev or '-'}</td></tr>
        <tr><td><strong>Condição</strong></td><td>{cautela.condicao_dev or '-'}</td></tr>
        <tr><td><strong>Observações</strong></td><td>{cautela.obs_dev or '-'}</td></tr>
      </table>
      <p style="text-align:center; margin:24px 0;">
        <a href="{confirm_url}" style="background:#059669; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none;">Confirmar Devolução</a>
      </p>
    </div>
    """
    success, error = _enviar(subject, html, cautela.email_policial)
    result = {
        "success": success, "confirm_url": confirm_url, "email": cautela.email_policial,
        "token": cautela.token_confirmacao_dev, "is_smtp_configured": is_smtp_configured(),
    }
    if error:
        result["error"] = error
    return result


def send_signature_receipt_email(cautela, hash_assinatura, is_devolucao, request):
    if not cautela.email_policial:
        return {"success": False, "error": "E-mail do policial não informado.", "is_smtp_configured": is_smtp_configured()}

    acao = "Devolução/Baixa" if is_devolucao else "Retirada/Emissão"
    cor = "#059669" if is_devolucao else "#0284c7"
    subject = f"Comprovante de Assinatura Digital — Cautela nº {cautela.numero}"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width:560px; margin:auto;">
      <h2 style="color:{cor};">Comprovante de Assinatura Digital — {acao}</h2>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td><strong>Cautela</strong></td><td>{cautela.numero}</td></tr>
        <tr><td><strong>Item</strong></td><td>{cautela.item_desc}</td></tr>
        <tr><td><strong>Série</strong></td><td>{cautela.serie or '-'}</td></tr>
        <tr><td><strong>Lotação</strong></td><td>{cautela.lotacao}</td></tr>
        <tr><td><strong>Hash de validação</strong></td><td><code>{hash_assinatura}</code></td></tr>
      </table>
    </div>
    """
    success, error = _enviar(subject, html, cautela.email_policial)
    result = {"success": success, "email": cautela.email_policial, "is_smtp_configured": is_smtp_configured()}
    if error:
        result["error"] = error
    return result
