import secrets

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from cadastros.models import Policial
from estoque.models import BemIndividual, Item, StatusItemChoices

from .emails import send_cautela_email_confirmation, send_devolucao_email_confirmation, send_signature_receipt_email
from .models import Cautela, CautelaStatusChoices, SequenciaNumeracao
from .signature import generate_digital_signature_svg


class CautelaError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# --- Numeração sequencial race-safe -----------------------------------
# Substitui getNextCode/getNextCautelaNumber de serverDb.ts (scan +
# incremento sobre array em memória, seguro só por acidente do Node ser
# single-threaded). `peek=True` é usado pelos endpoints de "próximo
# número" (preview, não reserva); `peek=False` reserva de fato, usado
# na criação real — replicando a mesma divergência que já existe no
# Node entre GET /next-number (não consome) e o create (consome).

def _peek_valor(chave: str) -> int:
    seq = SequenciaNumeracao.objects.filter(chave=chave).first()
    return (seq.ultimo_valor if seq else 0) + 1


def _proximo_valor(chave: str) -> int:
    with transaction.atomic():
        seq, _ = SequenciaNumeracao.objects.select_for_update().get_or_create(chave=chave)
        seq.ultimo_valor += 1
        seq.save(update_fields=["ultimo_valor"])
        return seq.ultimo_valor


def proximo_numero_cautela(peek=False) -> str:
    year = timezone.now().year
    chave = f"cautela-{year}"
    n = _peek_valor(chave) if peek else _proximo_valor(chave)
    return f"CAU-{year}-{n:04d}"


def proximo_codigo_servico(peek=False) -> str:
    n = _peek_valor("servico") if peek else _proximo_valor("servico")
    return f"{n:04d}"


def _gerar_token(prefixo="tok_"):
    return f"{prefixo}{secrets.token_hex(6)}{int(timezone.now().timestamp())}"


def _gerar_hash_assinatura():
    ano = timezone.now().year
    timestamp_hex = format(int(timezone.now().timestamp() * 1000), "x").upper()
    random_hex = secrets.token_hex(3).upper()
    return f"SIG-{ano}-{timestamp_hex}-{random_hex}"


def _validar_email_institucional(email):
    if email and not email.strip().lower().endswith("@pc.ce.gov.br"):
        raise CautelaError("Apenas e-mails institucionais do domínio @pc.ce.gov.br são permitidos.")


# --- Criação -------------------------------------------------------------

@transaction.atomic
def criar_cautela(dados, usuario, request):
    item_id = dados.get("item_id")
    qtd = dados.get("qtd") or 1
    selected_serie = (dados.get("serie") or dados.get("numero_serie") or "").strip() or None

    if selected_serie:
        conflito = Cautela.objects.select_for_update().filter(
            serie__iexact=selected_serie
        ).exclude(status=CautelaStatusChoices.DEVOLVIDO)
        if item_id:
            conflito = conflito.filter(item_id=item_id)
        if conflito.exists():
            raise CautelaError(
                f'O item com número de série "{selected_serie}" já possui uma cautela ativa ou pendente.'
            )

    extra = {}
    policial = None
    is_cautela_unidade = bool(dados.get("is_cautela_unidade"))
    policial_id = dados.get("policial_id")

    if not is_cautela_unidade and policial_id:
        policial = Policial.objects.filter(pk=policial_id).first()
        if not policial:
            raise CautelaError("Policial selecionado não foi encontrado.")
        extra.update(
            policial=policial,
            matricula=policial.matricula,
            policial_nome=policial.nome,
            departamento=policial.departamento,
            lotacao=policial.lotacao,
        )
    elif is_cautela_unidade:
        lotacao_nome = dados.get("lotacao_nome") or ""
        extra.update(
            policial=None,
            policial_nome=dados.get("policial_nome") or f"UNIDADE: {lotacao_nome}",
            matricula=dados.get("delegado_matricula") or "CARGA DA UNIDADE",
        )

    item = None
    allocated_bem = None
    if item_id:
        item = Item.objects.select_for_update().filter(pk=item_id).first()
        if not item:
            raise CautelaError("Item selecionado não foi encontrado.")

        bens_do_item = list(BemIndividual.objects.select_for_update().filter(item=item))
        if bens_do_item:
            if selected_serie:
                allocated_bem = next(
                    (b for b in bens_do_item if
                     (b.serie or "").strip().lower() == selected_serie.lower()
                     or (b.patrimonio or "").strip().lower() == selected_serie.lower()),
                    None,
                )
                if allocated_bem is None:
                    raise CautelaError(
                        f'Nenhum bem individual encontrado para a série/patrimônio "{selected_serie}".'
                    )
                if allocated_bem.status != StatusItemChoices.DISPONIVEL:
                    raise CautelaError(
                        f'O bem com série/patrimônio "{selected_serie}" não está disponível para cautela.'
                    )
            else:
                allocated_bem = next((b for b in bens_do_item if b.status == StatusItemChoices.DISPONIVEL), None)
                if allocated_bem is None:
                    raise CautelaError("Não há bens individuais disponíveis para este item.")
                selected_serie = allocated_bem.serie or allocated_bem.patrimonio

            allocated_bem.status = StatusItemChoices.EM_USO
            allocated_bem.save(update_fields=["status"])

            item.qtd_disp = BemIndividual.objects.filter(
                item=item, status=StatusItemChoices.DISPONIVEL
            ).count()
        else:
            if qtd > item.qtd_disp:
                raise CautelaError(
                    f'Estoque insuficiente para "{item.descricao}": disponível {item.qtd_disp}, solicitado {qtd}.'
                )
            item.qtd_disp = item.qtd_disp - qtd

        if item.qtd_disp == 0:
            item.status = StatusItemChoices.EM_USO
        item.save(update_fields=["qtd_disp", "status"])

        extra.update(item=item, item_desc=item.descricao, serie=selected_serie or item.serie or "")

    numero = proximo_numero_cautela()

    assinatura_digital = dados.get("assinatura_digital") or ""
    has_signature = bool(assinatura_digital.strip())
    initial_status = dados.get("status") or (
        CautelaStatusChoices.ATIVA if has_signature else CautelaStatusChoices.PENDENTE_ASSINATURA
    )

    token = _gerar_token("tok_")
    pre_hash = _gerar_hash_assinatura()

    email_policial = (dados.get("email_policial") or (policial.email if policial else "") or "").strip()
    _validar_email_institucional(email_policial)

    cautela = Cautela.objects.create(
        numero=numero,
        data_saida=dados.get("data_saida") or timezone.now().date(),
        data_prev=dados.get("data_prev"),
        qtd=qtd,
        status=initial_status,
        token_confirmacao=token,
        email_policial=email_policial,
        id_confirmacao=pre_hash,
        hash_confirmacao=pre_hash,
        hash_assinatura=pre_hash if has_signature else (dados.get("hash_assinatura") or ""),
        assinatura_digital=assinatura_digital,
        condicao_dev="",
        obs_dev="",
        qtd_carregadores=dados.get("qtd_carregadores"),
        created_by=usuario.email if usuario else "",
        **extra,
    )

    email_info = None
    if not has_signature:
        email_info = send_cautela_email_confirmation(cautela, request)

    return cautela, email_info


# --- Devolução -------------------------------------------------------------

@transaction.atomic
def devolver_cautela(cautela, dados, request):
    if not dados.get("data_dev"):
        raise CautelaError("data_dev é obrigatório.")

    cautela = Cautela.objects.select_for_update().get(pk=cautela.pk)
    if cautela.status not in (
        CautelaStatusChoices.ATIVA,
        CautelaStatusChoices.PENDENTE_ASSINATURA,
        CautelaStatusChoices.PENDENTE_DEVOLUCAO,
    ):
        raise CautelaError("Cautela não encontrada ou não ativa.", status_code=404)

    token_dev = _gerar_token("tok_dev_")
    assinatura_dev = dados.get("assinatura_dev") or dados.get("assinatura_digital") or ""
    has_signature = bool(assinatura_dev.strip())

    cautela.data_dev = dados["data_dev"]
    cautela.condicao_dev = dados.get("condicao_dev") or ""
    cautela.motivo_recolhimento = dados.get("motivo_recolhimento") or ""
    cautela.nup = dados.get("nup") or ""
    cautela.numero_io_bo = dados.get("numero_io_bo") or ""
    cautela.numero_serie_reparo = dados.get("numero_serie_reparo") or ""
    cautela.obs_dev = dados.get("obs_dev") or ""
    cautela.token_confirmacao_dev = token_dev
    cautela.assinatura_dev = assinatura_dev
    cautela.status = CautelaStatusChoices.DEVOLVIDO if has_signature else CautelaStatusChoices.PENDENTE_DEVOLUCAO
    cautela.save()

    condicao_dev = cautela.condicao_dev
    status_item_override = dados.get("status_item")
    final_status = StatusItemChoices.DISPONIVEL
    if condicao_dev and condicao_dev in StatusItemChoices.values and condicao_dev != StatusItemChoices.DISPONIVEL:
        final_status = condicao_dev
    elif status_item_override:
        final_status = status_item_override

    if cautela.serie and cautela.item_id:
        bem = BemIndividual.objects.select_for_update().filter(item_id=cautela.item_id).filter(
            Q(serie__iexact=cautela.serie) | Q(patrimonio__iexact=cautela.serie)
        ).first()
        if bem:
            bem.status = final_status
            bem.save(update_fields=["status"])

    if cautela.item_id:
        item = Item.objects.select_for_update().get(pk=cautela.item_id)
        bens_do_item = list(BemIndividual.objects.filter(item=item))
        if bens_do_item:
            item.qtd_disp = sum(1 for b in bens_do_item if b.status == StatusItemChoices.DISPONIVEL)
        else:
            item.qtd_disp = min(item.qtd_total, item.qtd_disp + cautela.qtd)

        item_final_status = final_status
        outras_ativas = Cautela.objects.filter(
            item=item, status=CautelaStatusChoices.ATIVA
        ).exclude(pk=cautela.pk).exists()
        if item_final_status == StatusItemChoices.DISPONIVEL and outras_ativas:
            item_final_status = StatusItemChoices.EM_USO
        item.status = item_final_status
        item.save(update_fields=["qtd_disp", "status"])

    email_info = None
    if not has_signature:
        email_info = send_devolucao_email_confirmation(cautela, request)

    return cautela, email_info


# --- Assinatura direta (não via link de e-mail) ---------------------------

def assinar_cautela(cautela, assinatura_digital, tipo=None, request=None):
    if not assinatura_digital:
        raise CautelaError("assinatura_digital é obrigatória.")

    # `tipo` vem do cliente só como dica de UI — o estado real da cautela
    # é quem decide se isso é assinatura de saída ou de devolução. Confiar
    # em `tipo` do cliente permitiria forjar a transição (ex.: mandar
    # tipo="devolucao" numa cautela Ativa e pular `devolver_cautela`,
    # marcando-a como Devolvido sem nunca liberar o bem/estoque).
    is_devolucao = cautela.status == CautelaStatusChoices.PENDENTE_DEVOLUCAO
    if tipo == "devolucao" and not is_devolucao:
        raise CautelaError(
            "Esta cautela ainda não passou pela devolução; chame /devolver antes de assinar a devolução."
        )
    hash_assinatura = _gerar_hash_assinatura()
    agora = timezone.now()

    with transaction.atomic():
        cautela = Cautela.objects.select_for_update().get(pk=cautela.pk)
        if is_devolucao:
            cautela.assinatura_dev = assinatura_digital
            cautela.status = CautelaStatusChoices.DEVOLVIDO
            cautela.hash_assinatura_dev = hash_assinatura
            cautela.data_assinatura_dev = agora
            cautela.confirmado_via_email_dev = True
        else:
            cautela.assinatura_digital = assinatura_digital
            cautela.status = CautelaStatusChoices.ATIVA
            cautela.hash_assinatura = hash_assinatura
            cautela.data_assinatura = agora
            cautela.confirmado_via_email = True
        cautela.save()

    email_result = None
    if request is not None:
        try:
            email_result = send_signature_receipt_email(cautela, hash_assinatura, is_devolucao, request)
        except Exception:
            email_result = None

    return cautela, hash_assinatura, email_result


# --- Confirmação por link de e-mail (HTML) e por token (API/JSON) --------

def confirmar_email(token, request):
    cautela = Cautela.objects.filter(token_confirmacao=token).first()
    if not cautela:
        return None
    with transaction.atomic():
        cautela = Cautela.objects.select_for_update().get(pk=cautela.pk)
        agora = timezone.now()
        hash_assinatura = cautela.hash_assinatura or cautela.id_confirmacao or cautela.hash_confirmacao or _gerar_hash_assinatura()
        svg = generate_digital_signature_svg(cautela.policial_nome, cautela.matricula, hash_assinatura, agora, is_devolucao=False)
        cautela.status = CautelaStatusChoices.ATIVA
        cautela.assinatura_digital = svg
        cautela.confirmado_via_email = True
        cautela.data_assinatura = agora
        cautela.hash_assinatura = hash_assinatura
        cautela.id_confirmacao = hash_assinatura
        cautela.hash_confirmacao = hash_assinatura
        cautela.save()
    try:
        send_signature_receipt_email(cautela, hash_assinatura, False, request)
    except Exception:
        pass
    return cautela


def confirmar_email_devolucao(token, request):
    cautela = Cautela.objects.filter(token_confirmacao_dev=token).first()
    if not cautela:
        return None
    with transaction.atomic():
        cautela = Cautela.objects.select_for_update().get(pk=cautela.pk)
        agora = timezone.now()
        hash_assinatura = cautela.hash_assinatura_dev or _gerar_hash_assinatura()
        svg = generate_digital_signature_svg(cautela.policial_nome, cautela.matricula, hash_assinatura, agora, is_devolucao=True)
        cautela.status = CautelaStatusChoices.DEVOLVIDO
        cautela.assinatura_dev = svg
        cautela.confirmado_via_email_dev = True
        cautela.data_assinatura_dev = agora
        cautela.hash_assinatura_dev = hash_assinatura
        cautela.save()
    try:
        send_signature_receipt_email(cautela, hash_assinatura, True, request)
    except Exception:
        pass
    return cautela


def confirmar_token(token=None, cautela_id=None, request=None):
    cautela = None
    if token:
        cautela = Cautela.objects.filter(Q(token_confirmacao=token) | Q(token_confirmacao_dev=token)).first()
    elif cautela_id:
        cautela = Cautela.objects.filter(pk=cautela_id).first()
    if not cautela:
        raise CautelaError("Cautela não encontrada.", status_code=404)

    is_dev = cautela.status == CautelaStatusChoices.PENDENTE_DEVOLUCAO or (
        token is not None and token == cautela.token_confirmacao_dev
    )

    with transaction.atomic():
        cautela = Cautela.objects.select_for_update().get(pk=cautela.pk)
        agora = timezone.now()
        if is_dev:
            hash_assinatura = cautela.hash_assinatura_dev or "TOK-SIMULATED"
            svg = generate_digital_signature_svg(cautela.policial_nome, cautela.matricula, hash_assinatura, agora, is_devolucao=True)
            cautela.status = CautelaStatusChoices.DEVOLVIDO
            cautela.assinatura_dev = svg
            cautela.confirmado_via_email_dev = True
            cautela.data_assinatura_dev = agora
            cautela.hash_assinatura_dev = hash_assinatura
        else:
            hash_assinatura = cautela.hash_assinatura or "TOK-SIMULATED"
            svg = generate_digital_signature_svg(cautela.policial_nome, cautela.matricula, hash_assinatura, agora, is_devolucao=False)
            cautela.status = CautelaStatusChoices.ATIVA
            cautela.assinatura_digital = svg
            cautela.confirmado_via_email = True
            cautela.data_assinatura = agora
            cautela.hash_assinatura = hash_assinatura
        cautela.save()

    email_result = None
    if request is not None:
        try:
            email_result = send_signature_receipt_email(cautela, hash_assinatura, is_dev, request)
        except Exception:
            email_result = None

    return cautela, hash_assinatura, is_dev, email_result


# --- Reenvio de e-mail (reaproveita o token existente) --------------------

def reenviar_email(cautela, email=None, request=None):
    target_email = (email or cautela.email_policial or "").strip()
    _validar_email_institucional(target_email)
    if not target_email:
        raise CautelaError("Apenas e-mails institucionais do domínio @pc.ce.gov.br são permitidos.")

    if email:
        cautela.email_policial = email
        cautela.save(update_fields=["email_policial"])

    if cautela.status == CautelaStatusChoices.PENDENTE_DEVOLUCAO:
        if not cautela.token_confirmacao_dev:
            cautela.token_confirmacao_dev = _gerar_token("tok_dev_")
            cautela.save(update_fields=["token_confirmacao_dev"])
        email_info = send_devolucao_email_confirmation(cautela, request)
    else:
        if not cautela.token_confirmacao:
            cautela.token_confirmacao = _gerar_token("tok_")
            cautela.save(update_fields=["token_confirmacao"])
        email_info = send_cautela_email_confirmation(cautela, request)

    return cautela, email_info
