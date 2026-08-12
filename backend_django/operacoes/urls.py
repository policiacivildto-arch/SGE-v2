from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CautelaViewSet,
    MovimentoViewSet,
    ServicoViewSet,
    confirmar_email_dev_view,
    confirmar_email_view,
)

app_name = "operacoes"

router = DefaultRouter()
router.register("servicos", ServicoViewSet, basename="servico")
router.register("movimentos", MovimentoViewSet, basename="movimento")
router.register("cautelas", CautelaViewSet, basename="cautela")

urlpatterns = [
    path("cautelas/confirmar-email/", confirmar_email_view, name="confirmar-email"),
    path("cautelas/confirmar-email-dev/", confirmar_email_dev_view, name="confirmar-email-dev"),
] + router.urls
