from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from usuarios.permissions import SGARolePermission

from . import services
from .models import Cautela, Movimento, Servico
from .serializers import (
    CautelaAssinarSerializer,
    CautelaConfirmarTokenSerializer,
    CautelaCreateSerializer,
    CautelaDevolverSerializer,
    CautelaReenviarEmailSerializer,
    CautelaSerializer,
    MovimentoSerializer,
    ServicoSerializer,
)


class ServicoViewSet(viewsets.ModelViewSet):
    queryset = Servico.objects.all().order_by("-criado_em")
    serializer_class = ServicoSerializer
    permission_classes = [SGARolePermission]
    section = "servicos"

    def perform_create(self, serializer):
        policial = serializer.validated_data.get("policial")
        extra = {}
        if policial:
            extra["matricula"] = serializer.validated_data.get("matricula") or policial.matricula
            extra["policial_nome"] = serializer.validated_data.get("policial_nome") or policial.nome
            if not serializer.validated_data.get("departamento"):
                extra["departamento"] = policial.departamento
            if not serializer.validated_data.get("lotacao"):
                extra["lotacao"] = policial.lotacao
        serializer.save(codigo=services.proximo_codigo_servico(), criado_por=self.request.user, **extra)

    @action(detail=False, methods=["get"], url_path="next-code")
    def next_code(self, request):
        return Response({"codigo": services.proximo_codigo_servico(peek=True)})


class MovimentoViewSet(viewsets.ModelViewSet):
    queryset = Movimento.objects.all().order_by("-criado_em")
    serializer_class = MovimentoSerializer
    permission_classes = [SGARolePermission]
    section = "estoque"


def _erro_response(exc):
    return Response({"detail": exc.message}, status=exc.status_code)


class CautelaViewSet(viewsets.ModelViewSet):
    queryset = Cautela.objects.all().order_by("-criado_em")
    serializer_class = CautelaSerializer
    permission_classes = [SGARolePermission]
    section = "estoque"

    def create(self, request, *args, **kwargs):
        serializer = CautelaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cautela, email_info = services.criar_cautela(serializer.validated_data, request.user, request)
        except services.CautelaError as exc:
            return _erro_response(exc)
        data = CautelaSerializer(cautela).data
        data["email_info"] = email_info
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="next-number")
    def next_number(self, request):
        return Response({"numero": services.proximo_numero_cautela(peek=True)})

    @action(detail=True, methods=["post"])
    def devolver(self, request, pk=None):
        cautela = self.get_object()
        serializer = CautelaDevolverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cautela, email_info = services.devolver_cautela(cautela, serializer.validated_data, request)
        except services.CautelaError as exc:
            return _erro_response(exc)
        data = CautelaSerializer(cautela).data
        data["email_info"] = email_info
        return Response(data)

    @action(detail=True, methods=["post"])
    def assinar(self, request, pk=None):
        cautela = self.get_object()
        serializer = CautelaAssinarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cautela, hash_assinatura, email_result = services.assinar_cautela(
                cautela,
                serializer.validated_data["assinatura_digital"],
                serializer.validated_data.get("tipo"),
                request,
            )
        except services.CautelaError as exc:
            return _erro_response(exc)
        return Response({
            "detail": "Assinatura registrada com sucesso!",
            "hash_assinatura": hash_assinatura,
            "email_enviado": bool(email_result and email_result.get("success")),
            "email_destino": (email_result or {}).get("email") or cautela.email_policial,
            "cautela": CautelaSerializer(cautela).data,
        })

    @action(detail=True, methods=["post"], url_path="reenviar-email")
    def reenviar_email(self, request, pk=None):
        cautela = self.get_object()
        serializer = CautelaReenviarEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cautela, email_info = services.reenviar_email(
                cautela, serializer.validated_data.get("email"), request
            )
        except services.CautelaError as exc:
            return _erro_response(exc)
        return Response({
            "detail": "E-mail de confirmação enviado ao policial com sucesso!",
            "cautela": CautelaSerializer(cautela).data,
            "email_info": email_info,
        })

    @action(detail=False, methods=["post"], url_path="confirmar-token", permission_classes=[AllowAny])
    def confirmar_token(self, request):
        serializer = CautelaConfirmarTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cautela, hash_assinatura, is_dev, email_result = services.confirmar_token(
                serializer.validated_data.get("token"),
                serializer.validated_data.get("id"),
                request,
            )
        except services.CautelaError as exc:
            return _erro_response(exc)
        return Response({
            "detail": "Confirmado com sucesso!",
            "hash_assinatura": hash_assinatura,
            "id_confirmacao": hash_assinatura,
            "email_enviado": bool(email_result and email_result.get("success")),
            "email_destino": (email_result or {}).get("email") or cautela.email_policial,
            "cautela": CautelaSerializer(cautela).data,
        })


def _pagina_confirmacao(titulo, cor, mensagem, erro=False):
    if erro:
        return f"<h2>❌ {titulo}</h2><p>{mensagem}</p>"
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>{titulo}</title>
<style>body {{ font-family: sans-serif; background: {cor['bg']}; text-align: center; padding: 40px; }}
.box {{ background: white; max-width: 500px; margin: auto; padding: 24px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }}</style>
</head>
<body>
    <div class="box">
        <h2 style="color: {cor['text']};">✓ {titulo}</h2>
        <p>{mensagem}</p>
    </div>
</body>
</html>"""


def confirmar_email_view(request):
    token = request.GET.get("token")
    if not token:
        return HttpResponse(_pagina_confirmacao("Token de Confirmação Inválido", None, "Nenhum token informado.", erro=True), status=400)
    cautela = services.confirmar_email(token, request)
    if not cautela:
        return HttpResponse(_pagina_confirmacao("Cautela Não Encontrada", None, "Token inválido ou cautela não encontrada.", erro=True), status=404)
    mensagem = f"O policial <strong>{cautela.policial_nome}</strong> confirmou o recebimento do item <strong>{cautela.item_desc}</strong>."
    html = _pagina_confirmacao(f"Cautela nº {cautela.numero} Confirmada!", {"bg": "#f0f9ff", "text": "#0369a1"}, mensagem)
    return HttpResponse(html)


def confirmar_email_dev_view(request):
    token = request.GET.get("token")
    if not token:
        return HttpResponse(_pagina_confirmacao("Token de Confirmação Inválido", None, "Nenhum token informado.", erro=True), status=400)
    cautela = services.confirmar_email_devolucao(token, request)
    if not cautela:
        return HttpResponse(_pagina_confirmacao("Devolução Não Encontrada", None, "Token inválido ou devolução não encontrada.", erro=True), status=404)
    mensagem = f"A devolução do item <strong>{cautela.item_desc}</strong> pelo policial <strong>{cautela.policial_nome}</strong> foi concluída com sucesso."
    html = _pagina_confirmacao(f"Devolução da Cautela nº {cautela.numero} Confirmada!", {"bg": "#ecfdf5", "text": "#047857"}, mensagem)
    return HttpResponse(html)
