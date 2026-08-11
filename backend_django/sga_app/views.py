import os
import uuid
import secrets
import io
from datetime import datetime

from django.shortcuts import get_object_or_404
from django.http import HttpResponse, JsonResponse
from django.core.mail import send_mail
from django.conf import settings

from rest_framework import viewsets, status
from rest_framework.decorators import api_view, action
from rest_framework.response import Response

from .models import Policial, Item, Cautela, Servico, Lotacao, Fornecedor
from .serializers import (
    PolicialSerializer, ItemSerializer, CautelaSerializer,
    ServicoSerializer, LotacaoSerializer, FornecedorSerializer
)


class PolicialViewSet(viewsets.ModelViewSet):
    queryset = Policial.objects.all()
    serializer_class = PolicialSerializer


class ItemViewSet(viewsets.ModelViewSet):
    queryset = Item.objects.all()
    serializer_class = ItemSerializer


class CautelaViewSet(viewsets.ModelViewSet):
    queryset = Cautela.objects.all()
    serializer_class = CautelaSerializer

    @action(detail=True, methods=['post'], url_path='reenviar-email')
    def reenviar_email(self, request, pk=None):
        cautela = self.get_object()
        target_email = request.data.get('email') or cautela.email_policial
        
        if not target_email or not target_email.strip().lower().endswith('@pc.ce.gov.br'):
            return Response(
                {"detail": "Apenas e-mails do domínio institucional @pc.ce.gov.br são permitidos."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        cautela.email_policial = target_email.strip().lower()
        if not cautela.token_confirmacao:
            cautela.token_confirmacao = f"tok_{secrets.token_hex(6)}"
        cautela.data_envio_email = datetime.now().isoformat()
        cautela.save()

        confirm_url = f"{request.scheme}://{request.get_host()}/api/cautelas/confirmar-email?token={cautela.token_confirmacao}"

        # Send email
        try:
            send_mail(
                subject=f"[SGA] Solicitação de Confirmação de Cautela nº {cautela.numero}",
                message=f"Confirme sua cautela acessando: {confirm_url}",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[cautela.email_policial],
                fail_silently=False,
            )
            return Response({
                "success": True,
                "email_info": {"email": cautela.email_policial, "confirmUrl": confirm_url}
            })
        except Exception as e:
            return Response({
                "success": False,
                "error": str(e),
                "confirmUrl": confirm_url
            })


class ServicoViewSet(viewsets.ModelViewSet):
    queryset = Servico.objects.all()
    serializer_class = ServicoSerializer


class LotacaoViewSet(viewsets.ModelViewSet):
    queryset = Lotacao.objects.all()
    serializer_class = LotacaoSerializer


class FornecedorViewSet(viewsets.ModelViewSet):
    queryset = Fornecedor.objects.all()
    serializer_class = FornecedorSerializer


@api_view(['GET'])
def health_check(request):
    return JsonResponse({
        "status": "ok",
        "system": "SGA Django Backend - Polícia Civil do Ceará",
        "timestamp": datetime.now().isoformat()
    })


@api_view(['GET'])
def confirmar_email_cautela(request):
    token = request.GET.get('token')
    if not token:
        return HttpResponse("Token inválido.", status=400)
    
    try:
        cautela = Cautela.objects.get(token_confirmacao=token)
        cautela.confirmado_via_email = True
        cautela.status = "Ativa"
        cautela.data_confirmacao_email = datetime.now().isoformat()
        cautela.save()

        html_content = f"""
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head><meta charset="UTF-8"><title>Confirmação de Cautela - SGA</title></head>
        <body style="font-family: sans-serif; background: #f8fafc; padding: 40px; text-align: center;">
            <div style="max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <h2 style="color: #166534;">✅ Cautela Confirmada com Sucesso!</h2>
                <p>O comprovante da Cautela Nº <strong>{cautela.numero}</strong> foi assinado e validado digitalmente.</p>
                <p style="font-size: 12px; color: #64748b;">Polícia Civil do Estado do Ceará • DTO</p>
            </div>
        </body>
        </html>
        """
        return HttpResponse(html_content)
    except Cautela.DoesNotExist:
        return HttpResponse("Token não encontrado ou expirado.", status=404)
