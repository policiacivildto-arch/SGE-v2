from datetime import date

from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from cadastros.models import Lotacao
from estoque.models import Arma, Item
from usuarios.permissions import SGARolePermission

from . import services
from .models import Cautela, CautelaStatusChoices, Movimento, Servico
from .pdf import gerar_pdf_cautela, gerar_pdf_servico
from .serializers import (
    CautelaAssinarSerializer,
    CautelaConfirmarTokenSerializer,
    CautelaCreateSerializer,
    CautelaDevolverSerializer,
    CautelaReenviarEmailSerializer,
    CautelaSerializer,
    MovimentoSerializer,
    ServicoSerializer,
)

_RELATORIO_HEADER_LINES = [
    "POLÍCIA CIVIL DO ESTADO DO CEARÁ",
    "GOVERNO DO ESTADO - SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL",
    "DEPARTAMENTO TÉCNICO OPERACIONAL - SEÇÃO DE AQUISIÇÃO, LOGÍSTICA E TIRO (DTO)",
    "Av. Professor Guilhon, s/n, Aeroporto, 4º Andar, Fortaleza/CE – CEP 60415-330 - Tel. 3101-7300",
    "",
]


def _escape_csv(val) -> str:
    """Réplica de escapeCsv em server.ts:770."""
    s = "" if val is None else str(val).strip()
    if ";" in s or "\n" in s or '"' in s:
        return '"' + s.replace('"', '""') + '"'
    return s


class ServicoViewSet(viewsets.ModelViewSet):
    queryset = Servico.objects.all().order_by("-criado_em")
    serializer_class = ServicoSerializer
    permission_classes = [SGARolePermission]
    section = "servicos"

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        servico_status = self.request.query_params.get("status")
        tipo = self.request.query_params.get("tipo")
        armeiro = self.request.query_params.get("armeiro")
        if servico_status:
            qs = qs.filter(status=servico_status)
        if tipo:
            qs = qs.filter(tipo=tipo)
        if armeiro:
            qs = qs.filter(armeiro=armeiro)
        if search:
            qs = qs.filter(
                Q(codigo__icontains=search) | Q(policial_nome__icontains=search)
                | Q(matricula__icontains=search) | Q(departamento__nome__icontains=search)
                | Q(lotacao__nome__icontains=search) | Q(tipo__icontains=search)
                | Q(serie__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        policial = serializer.validated_data.get("policial")
        extra = {}
        if policial:
            extra["matricula"] = serializer.validated_data.get("matricula") or policial.matricula
            extra["policial_nome"] = serializer.validated_data.get("policial_nome") or policial.nome
            if not serializer.validated_data.get("departamento"):
                extra["departamento"] = policial.departamento
            if not serializer.validated_data.get("lotacao"):
                extra["lotacao"] = policial.lotacao
        serializer.save(codigo=services.proximo_codigo_servico(), criado_por=self.request.user, **extra)

    @action(detail=False, methods=["get"], url_path="next-code")
    def next_code(self, request):
        return Response({"codigo": services.proximo_codigo_servico(peek=True)})

    @action(detail=True, methods=["get"], url_path="documento-pdf")
    def documento_pdf(self, request, pk=None):
        """Réplica de GET /api/servicos/:id/documento-pdf (server.ts:2284)."""
        servico = self.get_object()
        pdf_bytes = gerar_pdf_servico(servico)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="servico_{servico.codigo}.pdf"'
        return response


class MovimentoViewSet(viewsets.ModelViewSet):
    queryset = Movimento.objects.all().order_by("-criado_em")
    serializer_class = MovimentoSerializer
    permission_classes = [SGARolePermission]
    section = "estoque"


def _erro_response(exc):
    return Response({"detail": exc.message}, status=exc.status_code)


class CautelaViewSet(viewsets.ModelViewSet):
    queryset = Cautela.objects.all().order_by("-criado_em")
    serializer_class = CautelaSerializer
    permission_classes = [SGARolePermission]
    section = "estoque"

    def create(self, request, *args, **kwargs):
        serializer = CautelaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cautela, email_info = services.criar_cautela(serializer.validated_data, request.user, request)
        except services.CautelaError as exc:
            return _erro_response(exc)
        data = CautelaSerializer(cautela).data
        data["email_info"] = email_info
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="next-number")
    def next_number(self, request):
        return Response({"numero": services.proximo_numero_cautela(peek=True)})

    @action(detail=False, methods=["get"], url_path="relatorio-xlsx")
    def relatorio_xlsx(self, request):
        """Réplica de GET /api/cautelas/relatorio-xlsx (server.ts:1509).

        Mesma gambiarra do relatório de itens: CSV `;`-separado com BOM,
        servido com Content-Type/nome de arquivo de xlsx.
        """
        search = request.query_params.get("search")
        categoria = request.query_params.get("categoria")

        qs = Cautela.objects.all().order_by("-data_saida")
        if categoria:
            categoria = "Coletes Balísticos" if categoria == "Coletes" else categoria
            qs = qs.filter(item__categoria=categoria)
        if search:
            qs = qs.filter(
                Q(numero__icontains=search) | Q(policial_nome__icontains=search)
                | Q(matricula__icontains=search) | Q(departamento__nome__icontains=search)
                | Q(lotacao__nome__icontains=search) | Q(item_desc__icontains=search)
            )

        headers = [
            "Número", "Data Saída", "Data Previsão", "Data Devolução",
            "Policial Beneficiário", "Matrícula", "Departamento", "Lotação",
            "Item Cautelado", "Categoria", "Quantidade", "Qtd Carregadores",
            "Número de Série", "Patrimônio / Tombo", "Status",
            "Condição Devolução", "Motivo Recolhimento", "NUP",
            "Número IO/BO", "Número Série Reparo", "Observações",
        ]
        lines = [*_RELATORIO_HEADER_LINES, ";".join(headers)]
        for c in qs.select_related("departamento", "lotacao", "item"):
            row = [
                c.numero or "", c.data_saida or "", c.data_prev or "", c.data_dev or "",
                c.policial_nome or "", c.matricula or "",
                c.departamento.nome if c.departamento_id else "",
                c.lotacao.nome if c.lotacao_id else "",
                c.item_desc or "", c.item.categoria if c.item_id else "",
                str(c.qtd or 1),
                str(c.qtd_carregadores) if c.qtd_carregadores is not None else "",
                c.serie or "", c.item.patrimonio if c.item_id else "",
                c.status or "Ativa", c.condicao_dev or "", c.motivo_recolhimento or "",
                c.nup or "", c.numero_io_bo or "", c.numero_serie_reparo or "",
                c.obs_dev or "",
            ]
            lines.append(";".join(_escape_csv(v) for v in row))

        csv_content = "﻿" + "\r\n".join(lines)
        response = HttpResponse(
            csv_content.encode("utf-8"),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="relatorio_cautelas.xlsx"'
        return response

    @action(detail=True, methods=["get"], url_path="documento-pdf")
    def documento_pdf(self, request, pk=None):
        """Réplica de GET /api/cautelas/:id/documento-pdf (server.ts:2161)."""
        cautela = self.get_object()
        pdf_bytes = gerar_pdf_cautela(cautela)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="cautela_{cautela.numero}.pdf"'
        return response

    @action(detail=True, methods=["post"])
    def devolver(self, request, pk=None):
        cautela = self.get_object()
        serializer = CautelaDevolverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cautela, email_info = services.devolver_cautela(cautela, serializer.validated_data, request)
        except services.CautelaError as exc:
            return _erro_response(exc)
        data = CautelaSerializer(cautela).data
        data["email_info"] = email_info
        return Response(data)

    @action(detail=True, methods=["post"])
    def assinar(self, request, pk=None):
        cautela = self.get_object()
        serializer = CautelaAssinarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cautela, hash_assinatura, email_result = services.assinar_cautela(
                cautela,
                serializer.validated_data["assinatura_digital"],
                serializer.validated_data.get("tipo"),
                request,
            )
        except services.CautelaError as exc:
            return _erro_response(exc)
        return Response({
            "detail": "Assinatura registrada com sucesso!",
            "hash_assinatura": hash_assinatura,
            "email_enviado": bool(email_result and email_result.get("success")),
            "email_destino": (email_result or {}).get("email") or cautela.email_policial,
            "cautela": CautelaSerializer(cautela).data,
        })

    @action(detail=True, methods=["post"], url_path="reenviar-email")
    def reenviar_email(self, request, pk=None):
        cautela = self.get_object()
        serializer = CautelaReenviarEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cautela, email_info = services.reenviar_email(
                cautela, serializer.validated_data.get("email"), request
            )
        except services.CautelaError as exc:
            return _erro_response(exc)
        return Response({
            "detail": "E-mail de confirmação enviado ao policial com sucesso!",
            "cautela": CautelaSerializer(cautela).data,
            "email_info": email_info,
        })

    @action(detail=False, methods=["post"], url_path="confirmar-token", permission_classes=[AllowAny])
    def confirmar_token(self, request):
        serializer = CautelaConfirmarTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cautela, hash_assinatura, is_dev, email_result = services.confirmar_token(
                serializer.validated_data.get("token"),
                serializer.validated_data.get("id"),
                request,
            )
        except services.CautelaError as exc:
            return _erro_response(exc)
        return Response({
            "detail": "Confirmado com sucesso!",
            "hash_assinatura": hash_assinatura,
            "id_confirmacao": hash_assinatura,
            "email_enviado": bool(email_result and email_result.get("success")),
            "email_destino": (email_result or {}).get("email") or cautela.email_policial,
            "cautela": CautelaSerializer(cautela).data,
        })


def _pagina_confirmacao(titulo, cor, mensagem, erro=False):
    if erro:
        return f"<h2>❌ {titulo}</h2><p>{mensagem}</p>"
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>{titulo}</title>
<style>body {{ font-family: sans-serif; background: {cor['bg']}; text-align: center; padding: 40px; }}
.box {{ background: white; max-width: 500px; margin: auto; padding: 24px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }}</style>
</head>
<body>
    <div class="box">
        <h2 style="color: {cor['text']};">✓ {titulo}</h2>
        <p>{mensagem}</p>
    </div>
</body>
</html>"""


def confirmar_email_view(request):
    token = request.GET.get("token")
    if not token:
        return HttpResponse(_pagina_confirmacao("Token de Confirmação Inválido", None, "Nenhum token informado.", erro=True), status=400)
    cautela = services.confirmar_email(token, request)
    if not cautela:
        return HttpResponse(_pagina_confirmacao("Cautela Não Encontrada", None, "Token inválido ou cautela não encontrada.", erro=True), status=404)
    mensagem = f"O policial <strong>{cautela.policial_nome}</strong> confirmou o recebimento do item <strong>{cautela.item_desc}</strong>."
    html = _pagina_confirmacao(f"Cautela nº {cautela.numero} Confirmada!", {"bg": "#f0f9ff", "text": "#0369a1"}, mensagem)
    return HttpResponse(html)


def confirmar_email_dev_view(request):
    token = request.GET.get("token")
    if not token:
        return HttpResponse(_pagina_confirmacao("Token de Confirmação Inválido", None, "Nenhum token informado.", erro=True), status=400)
    cautela = services.confirmar_email_devolucao(token, request)
    if not cautela:
        return HttpResponse(_pagina_confirmacao("Devolução Não Encontrada", None, "Token inválido ou devolução não encontrada.", erro=True), status=404)
    mensagem = f"A devolução do item <strong>{cautela.item_desc}</strong> pelo policial <strong>{cautela.policial_nome}</strong> foi concluída com sucesso."
    html = _pagina_confirmacao(f"Devolução da Cautela nº {cautela.numero} Confirmada!", {"bg": "#ecfdf5", "text": "#047857"}, mensagem)
    return HttpResponse(html)


class DashboardEstoqueView(APIView):
    """Réplica de GET /api/dashboard/estoque (server.ts:418), que delega
    para `ServerDb.getDashboardEstoque` (serverDb.ts:902-1128).

    Protegido como os demais endpoints de leitura de estoque
    (`section = "estoque"`, via SGARolePermission).
    """

    permission_classes = [SGARolePermission]
    section = "estoque"

    def get(self, request):
        params = request.query_params
        categoria_filtro = (params.get("categoria") or "").strip()
        depto_filtro = (params.get("depto") or "").strip()
        delegacia_filtro = (params.get("delegacia") or "").strip()
        status_filtro = (params.get("status") or "").strip()
        modelo_filtro = (params.get("modelo") or "").strip()
        tipo_filtro = (params.get("tipo") or "").strip()

        # --- Cautelas ativas, filtradas -----------------------------------
        cautelas_ativas = Cautela.objects.filter(
            status=CautelaStatusChoices.ATIVA
        ).select_related("departamento", "lotacao", "item")
        filtered_cautelas = list(cautelas_ativas)

        if categoria_filtro:
            filtered_cautelas = [
                c for c in filtered_cautelas
                if categoria_filtro.lower() in (c.item_desc or "").lower()
            ]
        if depto_filtro:
            filtered_cautelas = [
                c for c in filtered_cautelas
                if (c.departamento.nome if c.departamento_id else "").lower() == depto_filtro.lower()
            ]
        if delegacia_filtro:
            filtered_cautelas = [
                c for c in filtered_cautelas
                if (c.lotacao.nome if c.lotacao_id else "").lower() == delegacia_filtro.lower()
            ]

        # --- Itens, filtrados ------------------------------------------------
        armas_by_item_id = {a.item_id: a for a in Arma.objects.all()}
        filtered_itens = list(Item.objects.all())

        if categoria_filtro:
            filtered_itens = [i for i in filtered_itens if categoria_filtro.lower() in (i.categoria or "").lower()]
        if status_filtro:
            filtered_itens = [i for i in filtered_itens if (i.status or "").lower() == status_filtro.lower()]
        if tipo_filtro:
            filtered_itens = [
                i for i in filtered_itens
                if armas_by_item_id.get(i.id) and (armas_by_item_id.get(i.id).tipo or "").lower() == tipo_filtro.lower()
            ]
        if modelo_filtro:
            filtered_itens = [
                i for i in filtered_itens
                if armas_by_item_id.get(i.id) and (armas_by_item_id.get(i.id).modelo or "").lower() == modelo_filtro.lower()
            ]

        is_dto_filtro = (not depto_filtro and not delegacia_filtro) or (
            (depto_filtro and (depto_filtro.lower() == "dto" or "tecnico operacional" in depto_filtro.lower()))
            and (not delegacia_filtro or delegacia_filtro.lower() == "dto" or "tecnico operacional" in delegacia_filtro.lower())
        )

        if depto_filtro or delegacia_filtro:
            items_in_cautela_at_loc = {c.item_id for c in filtered_cautelas}
            if is_dto_filtro:
                dto_disponiveis_ids = {
                    i.id for i in Item.objects.all()
                    if "arma" in (i.categoria or "").lower() and i.status == "Disponivel"
                }
                filtered_itens = [
                    i for i in filtered_itens
                    if i.id in items_in_cautela_at_loc or i.id in dto_disponiveis_ids
                ]
            else:
                filtered_itens = [i for i in filtered_itens if i.id in items_in_cautela_at_loc]

        # --- Estatísticas ------------------------------------------------
        total_qtd = sum(i.qtd_total or 0 for i in filtered_itens)
        total_disp = sum(i.qtd_disp or 0 for i in filtered_itens)

        categorias_list = sorted({i.categoria for i in Item.objects.all() if i.categoria})
        locais_list = [
            {"departamento": l.departamento.nome if l.departamento_id else "", "delegacia": l.nome, "seccional": l.cidade or ""}
            for l in Lotacao.objects.select_related("departamento").all()
        ]
        if not any(loc["departamento"] == "DTO" for loc in locais_list):
            locais_list.append({"departamento": "DTO", "delegacia": "DTO", "seccional": "DTO"})

        tipos_list = sorted({a.tipo for a in armas_by_item_id.values() if a.tipo})
        modelos_list = sorted({a.modelo for a in armas_by_item_id.values() if a.modelo})

        by_categoria_map = {}
        by_status_map = {}
        by_modelo_map = {}
        for i in filtered_itens:
            by_categoria_map[i.categoria] = by_categoria_map.get(i.categoria, 0) + (i.qtd_total or 0)
            by_status_map[i.status] = by_status_map.get(i.status, 0) + (i.qtd_total or 0)
            arma = armas_by_item_id.get(i.id)
            if arma and arma.modelo:
                by_modelo_map[arma.modelo] = by_modelo_map.get(arma.modelo, 0) + (i.qtd_total or 0)

        by_categoria = sorted(by_categoria_map.items(), key=lambda kv: kv[1], reverse=True)
        by_status = sorted(by_status_map.items(), key=lambda kv: kv[1], reverse=True)
        by_modelo = sorted(by_modelo_map.items(), key=lambda kv: kv[1], reverse=True)

        # --- Validade ------------------------------------------------------
        hoje = date.today()
        qtd_vencidos = qtd_vence_30 = qtd_vence_60 = qtd_sem_validade = 0
        itens_criticos = []
        por_ano_map = {}

        for item in filtered_itens:
            qty = item.qtd_disp if item.qtd_disp is not None else item.qtd_total
            if not item.dt_val:
                qtd_sem_validade += qty
                continue

            ano = item.dt_val.year
            por_ano_map[ano] = por_ano_map.get(ano, 0) + qty

            dias_para_vencer = (item.dt_val - hoje).days
            situacao = "Dentro da validade"
            if dias_para_vencer < 0:
                situacao = "Vencido"
                qtd_vencidos += qty
            elif dias_para_vencer <= 365:
                situacao = "Vence em ate 1 ano"
                qtd_vence_30 += qty
            elif dias_para_vencer <= 730:
                situacao = "Vence em ate 2 anos"
                qtd_vence_60 += qty

            if dias_para_vencer <= 730:
                itens_criticos.append({
                    "id": item.id,
                    "descricao": item.descricao or "—",
                    "categoria": item.categoria or "Não informado",
                    "dt_val": item.dt_val,
                    "qtd_disp": qty,
                    "diasParaVencer": dias_para_vencer,
                    "anosParaVencer": round(dias_para_vencer / 365, 2),
                    "situacao": situacao,
                })

        itens_criticos.sort(key=lambda x: x["diasParaVencer"])
        por_ano = sorted(
            ({"ano": ano, "quantidade": qty} for ano, qty in por_ano_map.items()),
            key=lambda x: x["ano"], reverse=True,
        )

        # --- Armas por local -------------------------------------------------
        armas_por_local = []
        for c in filtered_cautelas:
            if not c.item_id or "arma" not in (c.item.categoria or "").lower():
                continue
            arma = armas_by_item_id.get(c.item_id)
            armas_por_local.append({
                "id": str(c.id),
                "tipo": (arma.tipo if arma else "") or "Armas",
                "modelo": (arma.modelo if arma else "") or "Não informado",
                "serie": c.item.serie or "Não informado",
                "status": c.item.status or "Em Uso",
                "departamento": (c.departamento.nome if c.departamento_id else "") or "Não informado",
                "lotacao": (c.lotacao.nome if c.lotacao_id else "") or "Não informado",
            })

        incluir_disponiveis = (not status_filtro) or status_filtro.lower() == "disponivel"
        if incluir_disponiveis and is_dto_filtro:
            armas_disp = [
                i for i in Item.objects.all()
                if "arma" in (i.categoria or "").lower() and i.status == "Disponivel"
            ]
            for item in armas_disp:
                arma = armas_by_item_id.get(item.id)
                armas_por_local.append({
                    "id": f"disp-{item.id}",
                    "tipo": (arma.tipo if arma else "") or "Armas",
                    "modelo": (arma.modelo if arma else "") or "Não informado",
                    "serie": (arma.numero_serie if arma else "") or item.serie or "Não informado",
                    "status": item.status or "Disponivel",
                    "departamento": "DTO",
                    "lotacao": "DTO",
                })

        armas_por_local.sort(key=lambda a: (a["departamento"], a["lotacao"], a["modelo"]))

        return Response({
            "categorias": categorias_list,
            "locais": locais_list,
            "tipos": tipos_list,
            "modelos": modelos_list,
            "stats": {
                "total": total_qtd,
                "disp": total_disp,
                "registros_itens": len(filtered_itens),
                "ativas": len(filtered_cautelas),
                "registros_cautelas": Cautela.objects.count(),
            },
            "by_categoria": by_categoria,
            "by_status": by_status,
            "by_modelo": by_modelo,
            "validade": {
                "qtdVencidos": qtd_vencidos,
                "qtdVence30": qtd_vence_30,
                "qtdVence60": qtd_vence_60,
                "qtdSemValidade": qtd_sem_validade,
                "itensCriticos": itens_criticos,
                "porAno": por_ano,
            },
            "armas_por_local": armas_por_local,
        })
