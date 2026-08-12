from rest_framework.routers import DefaultRouter

from .views import (
    DelegaciaViewSet,
    DepartamentoViewSet,
    FornecedorViewSet,
    LotacaoViewSet,
    OpcaoMenuViewSet,
    PatrimonioViewSet,
    PolicialViewSet,
)

router = DefaultRouter()
router.register("departamentos", DepartamentoViewSet, basename="departamento")
router.register("delegacias", DelegaciaViewSet, basename="delegacia")
router.register("lotacoes", LotacaoViewSet, basename="lotacao")
router.register("policiais", PolicialViewSet, basename="policial")
router.register("fornecedores", FornecedorViewSet, basename="fornecedor")
router.register("patrimonios", PatrimonioViewSet, basename="patrimonio")
router.register("opcoes-menu", OpcaoMenuViewSet, basename="opcaomenu")

urlpatterns = router.urls
