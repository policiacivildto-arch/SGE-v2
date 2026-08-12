from rest_framework import viewsets

from .models import Arma, BemIndividual, Compra, Item
from .serializers import ArmaSerializer, BemIndividualSerializer, CompraSerializer, ItemSerializer


class CompraViewSet(viewsets.ModelViewSet):
    queryset = Compra.objects.all().order_by("-criado_em")
    serializer_class = CompraSerializer


class ItemViewSet(viewsets.ModelViewSet):
    queryset = Item.objects.all().order_by("descricao")
    serializer_class = ItemSerializer


class BemIndividualViewSet(viewsets.ModelViewSet):
    queryset = BemIndividual.objects.all().order_by("-criado_em")
    serializer_class = BemIndividualSerializer


class ArmaViewSet(viewsets.ModelViewSet):
    queryset = Arma.objects.all().order_by("-criado_em")
    serializer_class = ArmaSerializer
