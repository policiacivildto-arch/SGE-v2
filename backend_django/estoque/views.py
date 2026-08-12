from rest_framework import viewsets

from usuarios.permissions import SGARolePermission

from .models import Arma, BemIndividual, Compra, Item
from .serializers import ArmaSerializer, BemIndividualSerializer, CompraSerializer, ItemSerializer


class CompraViewSet(viewsets.ModelViewSet):
    queryset = Compra.objects.all().order_by("-criado_em")
    serializer_class = CompraSerializer
    permission_classes = [SGARolePermission]
    section = "estoque"

    def perform_create(self, serializer):
        serializer.save(criado_por=self.request.user)


class ItemViewSet(viewsets.ModelViewSet):
    queryset = Item.objects.all().order_by("descricao")
    serializer_class = ItemSerializer
    permission_classes = [SGARolePermission]
    section = "estoque"

    def perform_create(self, serializer):
        serializer.save(criado_por=self.request.user)


class BemIndividualViewSet(viewsets.ModelViewSet):
    queryset = BemIndividual.objects.all().order_by("-criado_em")
    serializer_class = BemIndividualSerializer
    permission_classes = [SGARolePermission]
    section = "estoque"

    def perform_create(self, serializer):
        serializer.save(criado_por=self.request.user)


class ArmaViewSet(viewsets.ModelViewSet):
    queryset = Arma.objects.all().order_by("-criado_em")
    serializer_class = ArmaSerializer
    permission_classes = [SGARolePermission]
    section = "estoque"

    def perform_create(self, serializer):
        serializer.save(criado_por=self.request.user)
