from django.utils.crypto import get_random_string
from rest_framework import serializers

from cadastros.models import Delegacia, Departamento, Policial

from .models import Usuario


class UsuarioSerializer(serializers.ModelSerializer):
    """CRUD administrativo de usuários (`UsuarioViewSet`).

    `password` é write-only e só é usada para (re)definir a senha via
    `set_password` — nunca expomos hash. `username` é derivado do e-mail
    quando não informado, já que o login é feito por e-mail (ver
    usuarios/views.py:LoginView) mas o AUTH_USER_MODEL herdado de
    AbstractUser ainda exige `username` único.
    """

    password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)
    policial_id = serializers.PrimaryKeyRelatedField(
        source="policial", queryset=Policial.objects.all(), allow_null=True, required=False
    )
    departamento_id = serializers.PrimaryKeyRelatedField(
        source="departamento", queryset=Departamento.objects.all(), allow_null=True, required=False
    )
    delegacia_id = serializers.PrimaryKeyRelatedField(
        source="delegacia", queryset=Delegacia.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = Usuario
        fields = [
            "id", "username", "email", "nome", "cargo", "role",
            "policial_id", "departamento_id", "delegacia_id", "ativo",
            "password", "criado_em", "atualizado_em",
        ]
        read_only_fields = ["id", "criado_em", "atualizado_em"]
        extra_kwargs = {"username": {"required": False}}

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        if not validated_data.get("username"):
            validated_data["username"] = validated_data.get("email", "")
        usuario = Usuario(**validated_data)
        usuario.set_password(password or get_random_string(32))
        usuario.save()
        return usuario

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


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
