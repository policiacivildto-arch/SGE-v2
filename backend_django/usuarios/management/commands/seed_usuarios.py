from django.core.management.base import BaseCommand

from usuarios.models import Role, Usuario

SEED_USERS = [
    {
        "username": "admin_geral",
        "email": "admin@pc.ce.gov.br",
        "password": "Admin@1234",
        "nome": "Administrador Geral",
        "role": Role.ADMIN,
    },
    {
        "username": "armeiro",
        "email": "armeiro@pc.ce.gov.br",
        "password": "Armeiro@1234",
        "nome": "Armeiro Plantonista",
        "role": Role.ARMEIRO,
    },
    {
        "username": "admin_serv",
        "email": "admin.serv@pc.ce.gov.br",
        "password": "Admin@1234",
        "nome": "Agente Administrativo",
        "role": Role.ADMINISTRATIVO,
    },
]


class Command(BaseCommand):
    help = (
        "Cria os 3 usuários de demonstração (mesmos e-mails/senhas de "
        "SEED_USERS em AuthContext.jsx), agora com senha hasheada "
        "server-side. Seed de desenvolvimento, não usar em produção."
    )

    def handle(self, *args, **options):
        for data in SEED_USERS:
            user, created = Usuario.objects.get_or_create(
                email=data["email"],
                defaults={
                    "username": data["username"],
                    "nome": data["nome"],
                    "role": data["role"],
                    "ativo": True,
                },
            )
            user.set_password(data["password"])
            user.role = data["role"]
            user.nome = data["nome"]
            user.ativo = True
            user.save()
            status = "criado" if created else "atualizado"
            self.stdout.write(self.style.SUCCESS(f"{data['email']} — {status}"))
