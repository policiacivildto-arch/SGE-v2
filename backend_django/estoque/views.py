from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from usuarios.permissions import SGARolePermission

from . import services
from .models import Arma, BemIndividual, Compra, Item
from .serializers import ArmaSerializer, BemIndividualSerializer, CompraSerializer, ItemSerializer


class CompraViewSet(viewsets.ModelViewSet):
    queryset = Compra.objects.all().order_by("-criado_em")
    serializer_class = CompraSerializer
    permission_classes = [SGARolePermission]
    section = "estoque"

    def perform_create(self, serializer):
        serializer.save(criado_por=self.request.user)

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(descricao__icontains=search) | Q(categoria__icontains=search)
                | Q(marca__icontains=search) | Q(modelo__icontains=search)
                | Q(serie__icontains=search)
            )
        return qs


def _escape_csv(val) -> str:
    """Réplica de escapeCsv em server.ts:770."""
    s = "" if val is None else str(val).strip()
    if ";" in s or "\n" in s or '"' in s:
        return '"' + s.replace('"', '""') + '"'
    return s


_RELATORIO_HEADER_LINES = [
    "POLÍCIA CIVIL DO ESTADO DO CEARÁ",
    "GOVERNO DO ESTADO - SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL",
    "DEPARTAMENTO TÉCNICO OPERACIONAL - SEÇÃO DE AQUISIÇÃO, LOGÍSTICA E TIRO (DTO)",
    "Av. Professor Guilhon, s/n, Aeroporto, 4º Andar, Fortaleza/CE – CEP 60415-330 - Tel. 3101-7300",
    "",
]


class ItemViewSet(viewsets.ModelViewSet):
    queryset = Item.objects.all().order_by("descricao")
    serializer_class = ItemSerializer
    permission_classes = [SGARolePermission]
    section = "estoque"

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        categoria = self.request.query_params.get("categoria")
        item_status = self.request.query_params.get("status")
        if categoria:
            categoria = "Coletes Balísticos" if categoria == "Coletes" else categoria
            qs = qs.filter(categoria=categoria)
        if item_status:
            qs = qs.filter(status=item_status)
        if search:
            qs = qs.filter(
                Q(patrimonio__icontains=search) | Q(descricao__icontains=search)
                | Q(categoria__icontains=search) | Q(marca__icontains=search)
                | Q(serie__icontains=search)
            )
        return qs

    def create(self, request, *args, **kwargs):
        """Réplica de POST /api/itens (server.ts:783) — não é CRUD
        simples: mescla em item existente de mesma categoria+descrição,
        gera bens individuais e cria Arma automaticamente quando
        aplicável. Ver estoque/services.py."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = services.criar_ou_mesclar_item(
            dict(serializer.validated_data), request.data, request.user
        )
        return Response(
            self.get_serializer(item).data, status=status.HTTP_201_CREATED
        )

    def update(self, request, *args, **kwargs):
        """Réplica de PATCH /api/itens/:id (server.ts:878) — sincroniza
        bens individuais (cria/remove pelo diff de qtd_total, propaga
        tamanho/sexo/dt_val/patrimônio/série) depois de salvar."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        old_qtd_total = instance.qtd_total
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        # Uma única transação: se a sincronização dos bens individuais
        # falhar, o save do Item também é desfeito — sem isso, uma falha
        # no meio deixava qtd_total do Item já salvo mas os
        # BemIndividual fora de sincronia com esse número.
        with transaction.atomic():
            item = serializer.save()
            services.atualizar_item_e_sincronizar_bens(item, old_qtd_total, None)
        item.refresh_from_db()
        return Response(self.get_serializer(item).data)

    @action(detail=False, methods=["get"], url_path="relatorio-xlsx")
    def relatorio_xlsx(self, request):
        """Réplica de GET /api/itens/relatorio-xlsx em server.ts:779.

        Na prática é um CSV `;`-separado com BOM, servido com
        Content-Type/nome de arquivo de xlsx — mesma gambiarra do
        server.ts original, replicada de propósito para manter
        compatibilidade com o que o frontend já espera.
        """
        search = request.query_params.get("search")
        categoria = request.query_params.get("categoria")

        qs = Item.objects.all().order_by("descricao")
        if categoria:
            categoria = "Coletes Balísticos" if categoria == "Coletes" else categoria
            qs = qs.filter(categoria=categoria)
        if search:
            qs = qs.filter(
                Q(descricao__icontains=search) | Q(categoria__icontains=search)
                | Q(marca__icontains=search) | Q(serie__icontains=search)
                | Q(patrimonio__icontains=search)
            )

        headers = [
            "Descrição", "Categoria", "Status", "Tombo / Patrimônio", "Série",
            "Quantidade Total", "Quantidade Disponível", "Quantidade Mínima",
            "Observações",
        ]
        lines = [*_RELATORIO_HEADER_LINES, ";".join(headers)]
        for i in qs:
            row = [
                i.descricao or "", i.categoria or "", i.status or "Disponivel",
                i.patrimonio or "", i.serie or "", str(i.qtd_total or 0),
                str(i.qtd_disp or 0), str(i.qtd_min or 0), i.obs or "",
            ]
            lines.append(";".join(_escape_csv(v) for v in row))

        csv_content = "﻿" + "\r\n".join(lines)
        response = HttpResponse(
            csv_content.encode("utf-8"),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="relatorio_inventario.xlsx"'
        return response

    @action(detail=False, methods=["post"])
    def mesclar(self, request):
        """Réplica de POST /api/itens/mesclar em server.ts:841 — reatribui
        bens/cautelas/movimentos/armas do item origem para o destino,
        soma quantidades e remove o item origem."""
        item_origem_id = request.data.get("item_origem_id")
        item_destino_id = request.data.get("item_destino_id")

        if not item_origem_id or not item_destino_id:
            return Response(
                {"detail": "IDs de origem e destino são obrigatórios."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if str(item_origem_id) == str(item_destino_id):
            return Response(
                {"detail": "O item de origem e destino não podem ser o mesmo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        origem = Item.objects.filter(pk=item_origem_id).first()
        destino = Item.objects.filter(pk=item_destino_id).first()
        if not origem or not destino:
            return Response(
                {"detail": "Item de origem ou destino não encontrado."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Import local para evitar import circular (operacoes.models importa
        # estoque.models no nível de módulo).
        from operacoes.models import Cautela, Movimento

        with transaction.atomic():
            BemIndividual.objects.filter(item=origem).update(item=destino)
            Cautela.objects.filter(item=origem).update(item=destino, item_desc=destino.descricao)
            Movimento.objects.filter(item=origem).update(item=destino)

            if Arma.objects.filter(item=destino).exists():
                Arma.objects.filter(item=origem).delete()
            else:
                Arma.objects.filter(item=origem).update(item=destino)

            destino.qtd_total = (destino.qtd_total or 0) + (origem.qtd_total or 0)
            destino.qtd_disp = (destino.qtd_disp or 0) + (origem.qtd_disp or 0)
            destino.save(update_fields=["qtd_total", "qtd_disp"])

            origem_descricao = origem.descricao
            origem.delete()

        return Response({
            "success": True,
            "message": f'Itens mesclados com sucesso! "{origem_descricao}" foi unificado em "{destino.descricao}"',
            "destino_id": destino.id,
        })

    @action(detail=True, methods=["get"])
    def bens(self, request, pk=None):
        """Réplica de GET /api/itens/:id/bens em server.ts:1279.

        Desde a Fase 5 (cutover do frontend), `Item.compra` é uma FK
        real (`on_delete=SET_NULL`) — a compra de origem do item, se
        houver, é sempre resolvível daqui; `compra_excluida` fica
        estruturalmente impossível (SET_NULL zera a FK ao invés de
        deixar um id pendurado), mas o campo é mantido em `False` para
        não quebrar o formato de resposta que o frontend já espera.
        """
        item = self.get_object()
        services.sincronizar_bens_do_item(item.pk)
        bens_qs = BemIndividual.objects.filter(item=item).order_by("patrimonio")
        compra_data = CompraSerializer(item.compra).data if item.compra_id else None
        data = []
        for b in bens_qs:
            payload = BemIndividualSerializer(b).data
            payload["compra"] = compra_data
            payload["compra_excluida"] = False
            data.append(payload)
        return Response({"count": len(data), "next": None, "previous": None, "results": data})

    @action(detail=True, methods=["get"])
    def compras(self, request, pk=None):
        """Réplica de GET /api/itens/:id/compras em server.ts:1322.

        Usa a FK real `Item.compra` (Fase 5). Fallback por igualdade de
        categoria+descrição preservado só para itens migrados antes da
        FK existir (ou sem `compra` associada)."""
        item = self.get_object()
        if item.compra_id:
            matched = [item.compra]
        else:
            norm_cat = (item.categoria or "").strip().lower()
            norm_desc = (item.descricao or "").strip().lower()
            matched = [
                c for c in Compra.objects.all()
                if (c.categoria or "").strip().lower() == norm_cat
                and (c.descricao or "").strip().lower() == norm_desc
            ]
        data = CompraSerializer(matched, many=True).data
        return Response({"count": len(data), "next": None, "previous": None, "results": data})


class BemIndividualViewSet(viewsets.ModelViewSet):
    queryset = BemIndividual.objects.all().order_by("patrimonio")
    serializer_class = BemIndividualSerializer
    permission_classes = [SGARolePermission]
    section = "estoque"

    def perform_create(self, serializer):
        serializer.save(criado_por=self.request.user)

    def list(self, request, *args, **kwargs):
        """Réplica de GET /api/bens (server.ts:1064) — sincroniza o
        status de todos os bens com as cautelas ativas a cada listagem
        (server.ts fazia o mesmo, dinamicamente, a cada GET) e enriquece
        com dados do item pai (server.ts:1079-1088)."""
        services.sincronizar_todos_bens()
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        qs = super().get_queryset().select_related("item")
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(patrimonio__icontains=search) | Q(serie__icontains=search))
        return qs


class ArmaViewSet(viewsets.ModelViewSet):
    queryset = Arma.objects.all().order_by("-criado_em")
    serializer_class = ArmaSerializer
    permission_classes = [SGARolePermission]
    section = "estoque"

    def perform_create(self, serializer):
        serializer.save(criado_por=self.request.user)

    def get_queryset(self):
        qs = super().get_queryset().select_related("item")
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(marca__icontains=search) | Q(modelo__icontains=search)
                | Q(numero_serie__icontains=search)
            )
        return qs
