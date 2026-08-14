from django.db.models import Q
from rest_framework import viewsets

from usuarios.permissions import SGARolePermission

from .models import Delegacia, Departamento, Fornecedor, Lotacao, OpcaoMenu, Patrimonio, Policial
from .serializers import (
    DelegaciaSerializer,
    DepartamentoSerializer,
    FornecedorSerializer,
    LotacaoSerializer,
    OpcaoMenuSerializer,
    PatrimonioSerializer,
    PolicialSerializer,
)


class DepartamentoViewSet(viewsets.ModelViewSet):
    queryset = Departamento.objects.all().order_by("nome")
    serializer_class = DepartamentoSerializer
    permission_classes = [SGARolePermission]
    section = "cadastros"


class DelegaciaViewSet(viewsets.ModelViewSet):
    queryset = Delegacia.objects.all().order_by("nome")
    serializer_class = DelegaciaSerializer
    permission_classes = [SGARolePermission]
    section = "cadastros"


class LotacaoViewSet(viewsets.ModelViewSet):
    queryset = Lotacao.objects.all().order_by("nome")
    serializer_class = LotacaoSerializer
    permission_classes = [SGARolePermission]
    section = "cadastros"


class PolicialViewSet(viewsets.ModelViewSet):
    queryset = Policial.objects.all().order_by("nome")
    serializer_class = PolicialSerializer
    permission_classes = [SGARolePermission]
    section = "cadastros"

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(matricula__icontains=search) | Q(cpf__icontains=search)
                | Q(nome__icontains=search) | Q(cargo__icontains=search)
                | Q(departamento__nome__icontains=search)
                | Q(lotacao__nome__icontains=search)
            )
        return qs


class FornecedorViewSet(viewsets.ModelViewSet):
    queryset = Fornecedor.objects.all().order_by("nome")
    serializer_class = FornecedorSerializer
    permission_classes = [SGARolePermission]
    section = "cadastros"

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(nome__icontains=search) | Q(cnpj__icontains=search)
                | Q(contato__icontains=search) | Q(tel__icontains=search)
                | Q(email__icontains=search) | Q(categoria__icontains=search)
            )
        return qs


class PatrimonioViewSet(viewsets.ModelViewSet):
    queryset = Patrimonio.objects.all().order_by("codigo")
    serializer_class = PatrimonioSerializer
    permission_classes = [SGARolePermission]
    section = "cadastros"


class OpcaoMenuViewSet(viewsets.ModelViewSet):
    queryset = OpcaoMenu.objects.all()
    serializer_class = OpcaoMenuSerializer
    permission_classes = [SGARolePermission]
    section = "cadastros"

    def get_queryset(self):
        qs = super().get_queryset()
        grupo = self.request.query_params.get("grupo")
        ativo = self.request.query_params.get("ativo")
        if grupo:
            qs = qs.filter(grupo=grupo)
        if ativo is not None:
            qs = qs.filter(ativo=ativo.lower() == "true")
        return qs
