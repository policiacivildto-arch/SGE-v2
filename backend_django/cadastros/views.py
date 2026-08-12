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


class FornecedorViewSet(viewsets.ModelViewSet):
    queryset = Fornecedor.objects.all().order_by("nome")
    serializer_class = FornecedorSerializer
    permission_classes = [SGARolePermission]
    section = "cadastros"


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
