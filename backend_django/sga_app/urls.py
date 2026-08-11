from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PolicialViewSet, ItemViewSet, CautelaViewSet,
    ServicoViewSet, LotacaoViewSet, FornecedorViewSet,
    health_check, confirmar_email_cautela
)

router = DefaultRouter()
router.register('policiais', PolicialViewSet, basename='policiais')
router.register('bens', ItemViewSet, basename='bens')
router.register('material-belico', ItemViewSet, basename='material-belico')
router.register('itens', ItemViewSet, basename='itens')
router.register('cautelas', CautelaViewSet, basename='cautelas')
router.register('servicos', ServicoViewSet, basename='servicos')
router.register('lotacoes', LotacaoViewSet, basename='lotacoes')
router.register('fornecedores', FornecedorViewSet, basename='fornecedores')

urlpatterns = [
    path('health', health_check, name='health_check'),
    path('cautelas/confirmar-email', confirmar_email_cautela, name='confirmar_email_cautela'),
    path('', include(router.urls)),
]
