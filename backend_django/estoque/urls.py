from rest_framework.routers import DefaultRouter

from .views import ArmaViewSet, BemIndividualViewSet, CompraViewSet, ItemViewSet

router = DefaultRouter()
router.register("compras", CompraViewSet, basename="compra")
router.register("itens", ItemViewSet, basename="item")
router.register("bens", BemIndividualViewSet, basename="bemindividual")
router.register("armas", ArmaViewSet, basename="arma")

urlpatterns = router.urls
