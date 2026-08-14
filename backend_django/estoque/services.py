"""Lógica de negócio de Item/BemIndividual portada de server.ts (Fase 5,
cutover do frontend) — POST/PATCH /api/itens faziam muito mais que CRUD
simples: mesclagem automática por categoria+descrição, geração de bens
individuais por patrimônio/série sequencial, criação automática de Arma
para itens de categoria "Armas", e sincronização dinâmica do status dos
bens com as cautelas ativas a cada listagem.
"""

import re

from django.db import transaction

from .models import Arma, BemIndividual, Item, StatusItemChoices

CATEGORIAS_BULK = ("muniç", "munico", "uniforme", "peça", "peca")


def _generate_sequential_string(base_str, index):
    """Réplica de generateSequentialString em server.ts:768."""
    if not base_str:
        return ""
    match = re.match(r"^(.*?)([0-9]+)$", base_str)
    if match:
        prefix, num_str = match.group(1), match.group(2)
        num_length = len(num_str)
        current_num = int(num_str) + index
        return f"{prefix}{str(current_num).zfill(num_length)}"
    return f"{base_str}-{str(index + 1).zfill(3)}"


def _is_bulk_categoria(categoria):
    cat = (categoria or "").lower()
    return any(marker in cat for marker in CATEGORIAS_BULK)


@transaction.atomic
def criar_ou_mesclar_item(dados, raw_data, usuario):
    """Réplica de POST /api/itens em server.ts:783.

    `dados` é o dict já validado pelo ItemSerializer (fornecedor/compra
    já resolvidos para instância); `raw_data` é `request.data` cru, só
    para os campos usados exclusivamente na criação automática de Arma
    (tipo/calibre/comp_cano/carregadores/capacidade) — não modelados em
    Item."""
    categoria = dados.get("categoria", "")
    descricao = dados.get("descricao", "")
    norm_desc = (descricao or "").strip().lower()
    norm_cat = (categoria or "").strip().lower()

    existente = next(
        (
            i for i in Item.objects.filter(categoria__iexact=categoria or "")
            if (i.descricao or "").strip().lower() == norm_desc
            and (i.categoria or "").strip().lower() == norm_cat
        ),
        None,
    )

    qtd_total_in = int(dados.get("qtd_total") or 1)
    qtd_disp_in = int(dados["qtd_disp"]) if dados.get("qtd_disp") is not None else qtd_total_in

    if existente:
        old_qty = int(existente.qtd_total or 0)
        existente.qtd_total = old_qty + qtd_total_in
        existente.qtd_disp = int(existente.qtd_disp or 0) + qtd_disp_in
        existente.status = StatusItemChoices.DISPONIVEL
        if dados.get("dt_aq") and not existente.dt_aq:
            existente.dt_aq = dados["dt_aq"]
        if dados.get("fornecedor") and not existente.fornecedor_id:
            existente.fornecedor = dados["fornecedor"]
        if dados.get("valor_compra") and not existente.valor_compra:
            existente.valor_compra = dados["valor_compra"]
        existente.criado_por = existente.criado_por or usuario
        existente.save()
        item = existente
    else:
        item = Item.objects.create(criado_por=usuario, **dados)
        old_qty = 0

    if "arma" in norm_cat and not Arma.objects.filter(item=item).exists():
        Arma.objects.create(
            item=item,
            patrimonio_codigo=item.patrimonio or "",
            tipo=raw_data.get("tipo") or "Pistola",
            marca=item.marca or "",
            modelo=item.descricao or "",
            calibre=raw_data.get("calibre") or "9mm",
            comprimento_cano=raw_data.get("comp_cano") or "",
            quantidade_carregadores=int(raw_data.get("carregadores") or 2),
            capacidade=int(raw_data.get("capacidade") or 15),
            numero_serie=item.serie or "",
            criado_por=usuario,
        )

    if _is_bulk_categoria(categoria):
        item.patrimonio = ""
        item.serie = ""
        item.save(update_fields=["patrimonio", "serie"])
    else:
        patrimonio_base = dados.get("patrimonio") or ""
        serie_base = dados.get("serie") or ""
        novos_bens = []
        for i in range(1, qtd_total_in + 1):
            idx = old_qty + i
            patrimonio_num = (
                _generate_sequential_string(patrimonio_base, i - 1) if patrimonio_base
                else f"TOM-{re.sub(r'[^0-9]', '', str(item.id)) or '0'}-{str(idx).zfill(3)}"
            )
            serie_num = _generate_sequential_string(serie_base, i - 1) if serie_base else ""
            novos_bens.append(BemIndividual(
                item=item,
                patrimonio=patrimonio_num,
                serie=serie_num,
                status=StatusItemChoices.DISPONIVEL if i <= qtd_disp_in else StatusItemChoices.EM_USO,
                tamanho=item.tamanho or "",
                sexo=item.sexo or "",
                dt_val=item.dt_val,
                obs=f"Gerado para o item: {item.descricao}" + (f" pela compra {item.compra_id}" if item.compra_id else ""),
                criado_por=usuario,
            ))
        if novos_bens:
            BemIndividual.objects.bulk_create(novos_bens)

    return item


@transaction.atomic
def atualizar_item_e_sincronizar_bens(item, old_qtd_total, dados_antigos):
    """Réplica de PATCH /api/itens/:id em server.ts:878 — chamado
    DEPOIS de `item` já ter sido salvo com os novos dados pelo
    serializer; `old_qtd_total`/`dados_antigos` são o snapshot de antes
    do save, usados só para calcular o diff."""
    new_qty = int(item.qtd_total or 0)
    old_qty = int(old_qtd_total or 0)

    bens_existentes = list(BemIndividual.objects.filter(item=item).order_by("criado_em"))

    if new_qty > old_qty:
        diff = new_qty - old_qty
        novos_bens = []
        for i in range(1, diff + 1):
            idx = old_qty + i
            patrimonio_num = (
                _generate_sequential_string(item.patrimonio, idx - 1) if item.patrimonio
                else f"TOM-{re.sub(r'[^0-9]', '', str(item.id)) or '0'}-{str(idx).zfill(3)}"
            )
            serie_num = _generate_sequential_string(item.serie, idx - 1) if item.serie else ""
            novos_bens.append(BemIndividual(
                item=item, patrimonio=patrimonio_num, serie=serie_num,
                status=StatusItemChoices.DISPONIVEL, tamanho=item.tamanho or "",
                sexo=item.sexo or "", dt_val=item.dt_val,
                obs=f"Adicionado na alteração de quantidade: {item.descricao}",
                criado_por=item.criado_por,
            ))
        if novos_bens:
            BemIndividual.objects.bulk_create(novos_bens)
    elif new_qty < old_qty:
        diff = old_qty - new_qty
        removidos = 0
        for b in reversed(bens_existentes):
            if removidos >= diff:
                break
            if b.status == StatusItemChoices.DISPONIVEL:
                b.delete()
                removidos += 1
        if removidos < diff:
            for b in reversed(bens_existentes):
                if removidos >= diff:
                    break
                if b.pk and BemIndividual.objects.filter(pk=b.pk).exists():
                    b.delete()
                    removidos += 1

    is_municoes = (item.categoria or "").strip().lower() in ("munições", "municoes", "munição", "municao")
    bens_atuais = list(BemIndividual.objects.filter(item=item).order_by("criado_em"))
    for index, b in enumerate(bens_atuais):
        changed = False
        if item.tamanho != b.tamanho:
            b.tamanho = item.tamanho or ""
            changed = True
        if item.sexo != b.sexo:
            b.sexo = item.sexo or ""
            changed = True
        if item.dt_val != b.dt_val:
            b.dt_val = item.dt_val
            changed = True
        if not is_municoes:
            expected_patrimonio = (
                _generate_sequential_string(item.patrimonio, index) if item.patrimonio
                else f"TOM-{re.sub(r'[^0-9]', '', str(item.id)) or '0'}-{str(index + 1).zfill(3)}"
            )
            if b.patrimonio != expected_patrimonio:
                b.patrimonio = expected_patrimonio
                changed = True
            expected_serie = _generate_sequential_string(item.serie, index) if item.serie else ""
            if b.serie != expected_serie:
                b.serie = expected_serie
                changed = True
        if changed:
            b.save()


def sincronizar_bens_do_item(item_id):
    """Réplica de syncItemBens em server.ts:995 — reconcilia o status
    dos bens individuais com as cautelas ativas do item e recalcula
    Item.qtd_disp. Importa Cautela localmente (import circular)."""
    from operacoes.models import Cautela, CautelaStatusChoices

    bens = list(BemIndividual.objects.filter(item_id=item_id))
    cautelas_ativas = Cautela.objects.filter(item_id=item_id, status=CautelaStatusChoices.ATIVA)

    cautelado_series = set()
    generico_count = 0
    for c in cautelas_ativas:
        serie = (c.serie or "").strip().lower()
        if serie:
            cautelado_series.add(serie)
        else:
            generico_count += int(c.qtd or 1)

    restante_generico = generico_count

    for b in bens:
        b_serie = (b.serie or "").strip().lower()
        b_pat = (b.patrimonio or "").strip().lower()
        if (b_serie and b_serie in cautelado_series) or (b_pat and b_pat in cautelado_series):
            if b.status != StatusItemChoices.EM_USO:
                b.status = StatusItemChoices.EM_USO
                b.save(update_fields=["status"])

    for b in bens:
        b_serie = (b.serie or "").strip().lower()
        b_pat = (b.patrimonio or "").strip().lower()
        explicitamente_cautelado = (b_serie and b_serie in cautelado_series) or (b_pat and b_pat in cautelado_series)
        if explicitamente_cautelado:
            continue
        if b.status in (StatusItemChoices.EM_USO, StatusItemChoices.DISPONIVEL):
            esperado = StatusItemChoices.DISPONIVEL
            if restante_generico > 0:
                esperado = StatusItemChoices.EM_USO
                restante_generico -= 1
            if b.status != esperado:
                b.status = esperado
                b.save(update_fields=["status"])

    if bens:
        count_disp = BemIndividual.objects.filter(
            item_id=item_id, status=StatusItemChoices.DISPONIVEL
        ).count()
        Item.objects.filter(pk=item_id).exclude(qtd_disp=count_disp).update(qtd_disp=count_disp)


def sincronizar_todos_bens():
    """Réplica de syncAllBens em server.ts:1056."""
    for item_id in Item.objects.values_list("id", flat=True):
        sincronizar_bens_do_item(item_id)
