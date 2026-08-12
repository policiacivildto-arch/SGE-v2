from rest_framework import viewsets

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


class DelegaciaViewSet(viewsets.ModelViewSet):
    queryset = Delegacia.objects.all().order_by("nome")
    serializer_class = DelegaciaSerializer


class LotacaoViewSet(viewsets.ModelViewSet):
    queryset = Lotacao.objects.all().order_by("nome")
    serializer_class = LotacaoSerializer


class PolicialViewSet(viewsets.ModelViewSet):
    queryset = Policial.objects.all().order_by("nome")
    serializer_class = PolicialSerializer


class FornecedorViewSet(viewsets.ModelViewSet):
    queryset = Fornecedor.objects.all().order_by("nome")
    serializer_class = FornecedorSerializer


class PatrimonioViewSet(viewsets.ModelViewSet):
    queryset = Patrimonio.objects.all().order_by("codigo")
    serializer_class = PatrimonioSerializer


class OpcaoMenuViewSet(viewsets.ModelViewSet):
    queryset = OpcaoMenu.objects.all()
    serializer_class = OpcaoMenuSerializer
