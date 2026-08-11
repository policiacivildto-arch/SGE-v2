from rest_framework import serializers
from .models import Policial, Item, Cautela, Servico, Lotacao, Fornecedor


class PolicialSerializer(serializers.ModelSerializer):
    class Meta:
        model = Policial
        fields = '__all__'

    def validate_email(self, value):
        if value and not value.strip().lower().endswith('@pc.ce.gov.br'):
            raise serializers.ValidationError('Apenas e-mails institucionais com o domínio @pc.ce.gov.br são permitidos.')
        return value.strip().lower() if value else value


class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = Item
        fields = '__all__'


class CautelaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cautela
        fields = '__all__'

    def validate_email_policial(self, value):
        if value and not value.strip().lower().endswith('@pc.ce.gov.br'):
            raise serializers.ValidationError('Apenas e-mails do domínio @pc.ce.gov.br são permitidos para cautelas.')
        return value.strip().lower() if value else value


class ServicoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Servico
        fields = '__all__'


class LotacaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lotacao
        fields = '__all__'


class FornecedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fornecedor
        fields = '__all__'
