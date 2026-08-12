from rest_framework import serializers

from .models import Usuario


class UsuarioMeSerializer(serializers.ModelSerializer):
    policial_id = serializers.PrimaryKeyRelatedField(source="policial", read_only=True)
    departamento_id = serializers.PrimaryKeyRelatedField(source="departamento", read_only=True)
    delegacia_id = serializers.PrimaryKeyRelatedField(source="delegacia", read_only=True)

    class Meta:
        model = Usuario
        fields = [
            "id", "username", "nome", "email", "role", "cargo",
            "policial_id", "departamento_id", "delegacia_id", "ativo",
        ]


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
