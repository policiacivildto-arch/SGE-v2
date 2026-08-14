"""Migra os dados de db.json (raiz do repo) para o Postgres via ORM.

Roda uma única vez, manualmente:
    docker compose exec backend_django python manage.py migrar_db_json

Não faz parte do boot normal do container (entrypoint.sh só roda
`migrate`, não este comando) — dados de produção não devem ser
reimportados a cada restart.

Os ids em db.json (ex. "dep-4", "pol-1785793097512-1120") não são UUIDs
e não viram o id definitivo no Postgres (BaseModel.id é UUID gerado).
Por isso o comando mantém um mapa {id_antigo: instância} por coleção,
usado para resolver as FKs das coleções seguintes, na ordem de
dependência: departamentos -> delegacias/lotacoes -> policiais ->
fornecedores -> compras -> itens -> bens/armas -> opcoes-menu ->
cautelas. `patrimonios`, `servicos` e `movimentos` estão vazios em
db.json hoje e não precisam de import.

Usuários não vêm de db.json (a entrada lá é lixo/1 registro solto) —
os usuários reais estão hardcoded em SEED_USERS
(src/context/AuthContext.jsx:24-52), replicados aqui porque não há
outra fonte de verdade para eles.
"""

import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from cadastros.models import (
    Delegacia,
    Departamento,
    Fornecedor,
    Lotacao,
    OpcaoMenu,
    Policial,
)
from estoque.models import Arma, BemIndividual, Compra, Item
from operacoes.models import Cautela

SEED_USERS = [
    {
        "email": "admin@pc.ce.gov.br",
        "password": "Admin@1234",
        "nome": "Administrador Geral",
        "role": "admin",
    },
    {
        "email": "armeiro@pc.ce.gov.br",
        "password": "Armeiro@1234",
        "nome": "Armeiro Plantonista",
        "role": "armeiro",
    },
    {
        "email": "admin.serv@pc.ce.gov.br",
        "password": "Admin@1234",
        "nome": "Agente Administrativo",
        "role": "administrativo",
    },
]


def _s(value):
    """None -> "" para CharField/TextField não-nulos."""
    return value if value is not None else ""


class Command(BaseCommand):
    help = "Migra os dados de db.json para o Postgres (roda uma única vez)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--db-json",
            default=None,
            help="Caminho para db.json (default: <repo>/db.json, dois níveis acima de manage.py).",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Roda mesmo se já existirem Departamentos no banco (evita duplicar em reruns acidentais).",
        )

    def handle(self, *args, **options):
        if Departamento.objects.exists() and not options["force"]:
            self.stderr.write(self.style.ERROR(
                "Já existem Departamentos no banco — abortando para não duplicar dados. "
                "Use --force se tiver certeza que quer reimportar."
            ))
            return

        if options["db_json"]:
            db_json_path = Path(options["db_json"])
        else:
            # parents[4] = layout local (backend_django/ dentro do repo);
            # parents[3] = layout no container (backend_django/ vira /app,
            # db.json montado como volume em /app/db.json — ver docker-compose.yml).
            here = Path(__file__).resolve()
            db_json_path = next(
                (c for c in (here.parents[4] / "db.json", here.parents[3] / "db.json") if c.exists()),
                here.parents[4] / "db.json",
            )
        if not db_json_path.exists():
            self.stderr.write(self.style.ERROR(f"db.json não encontrado em {db_json_path}"))
            return

        data = json.loads(db_json_path.read_text(encoding="utf-8"))

        with transaction.atomic():
            usuarios = self._migrar_usuarios()
            admin_user = usuarios["admin@pc.ce.gov.br"]

            departamentos = self._migrar_departamentos(data.get("departamentos", []))
            delegacias = self._migrar_delegacias(data.get("delegacias", []), departamentos)
            lotacoes = self._migrar_lotacoes(data.get("lotacoes", []), departamentos)
            self._migrar_policiais(data.get("policiais", []), departamentos, lotacoes)
            fornecedores = self._migrar_fornecedores(data.get("fornecedores", []))
            self._migrar_opcoes_menu(data.get("opcoes-menu", []))
            compras = self._migrar_compras(data.get("compras", []), fornecedores, admin_user)
            itens = self._migrar_itens(data.get("itens", []), fornecedores, compras, admin_user)
            self._migrar_bens(data.get("bens", []), itens, admin_user)
            self._migrar_armas(data.get("armas", []), itens, admin_user)
            self._migrar_cautelas(
                data.get("cautelas", []), departamentos, lotacoes, itens,
                self._policiais_map,
            )

        self.stdout.write(self.style.SUCCESS("Migração concluída."))

    # -- usuários -----------------------------------------------------

    def _migrar_usuarios(self):
        Usuario = get_user_model()
        criados = {}
        for seed in SEED_USERS:
            user, _ = Usuario.objects.update_or_create(
                email=seed["email"],
                defaults={
                    "username": seed["email"],
                    "nome": seed["nome"],
                    "role": seed["role"],
                    "ativo": True,
                },
            )
            user.set_password(seed["password"])
            user.save()
            criados[seed["email"]] = user
        self.stdout.write(f"Usuários: {len(criados)} migrados de SEED_USERS.")
        return criados

    # -- cadastros ------------------------------------------------------

    def _migrar_departamentos(self, rows):
        mapa_por_id = {}
        mapa_por_nome = {}
        for row in rows:
            obj = Departamento.objects.create(
                nome=_s(row.get("nome")),
                sigla=_s(row.get("sigla")),
                ativo=bool(row.get("ativo", True)),
            )
            mapa_por_id[row["id"]] = obj
            mapa_por_nome[obj.nome.strip().lower()] = obj
        self._departamentos_por_nome = mapa_por_nome
        self.stdout.write(f"Departamentos: {len(mapa_por_id)} migrados.")
        return mapa_por_id

    def _dep_by_nome(self, nome):
        if not nome:
            return None
        return self._departamentos_por_nome.get(nome.strip().lower())

    def _migrar_delegacias(self, rows, departamentos):
        mapa = {}
        for row in rows:
            dep = departamentos.get(row.get("departamento_id"))
            if dep is None:
                self.stderr.write(self.style.WARNING(
                    f"Delegacia {row.get('id')}: departamento_id {row.get('departamento_id')!r} não encontrado, pulando."
                ))
                continue
            obj = Delegacia.objects.create(
                nome=_s(row.get("nome")),
                codigo=_s(row.get("codigo")),
                cidade=_s(row.get("cidade")),
                departamento=dep,
                ativo=bool(row.get("ativo", True)),
            )
            mapa[row["id"]] = obj
        self.stdout.write(f"Delegacias: {len(mapa)} migradas.")
        return mapa

    def _migrar_lotacoes(self, rows, departamentos):
        mapa_por_id = {}
        mapa_por_nome = {}
        pulados = 0
        for row in rows:
            dep = self._dep_by_nome(row.get("depto"))
            if dep is None:
                pulados += 1
                continue
            obj = Lotacao.objects.create(
                departamento=dep,
                nome=_s(row.get("nome")),
                cidade=_s(row.get("cidade")),
                resp=_s(row.get("resp")),
                area_atuacao=_s(row.get("area_atuacao")),
                ais=_s(row.get("ais")),
                tel=_s(row.get("tel")),
                endereco=_s(row.get("end") or row.get("endereco")),
                seccional=row.get("seccional") or None,
            )
            mapa_por_id[row["id"]] = obj
            mapa_por_nome[obj.nome.strip().lower()] = obj
        self._lotacoes_por_nome = mapa_por_nome
        self.stdout.write(f"Lotações: {len(mapa_por_id)} migradas ({pulados} puladas por depto não encontrado).")
        return mapa_por_id

    def _lotacao_by_nome(self, nome):
        if not nome:
            return None
        return self._lotacoes_por_nome.get(nome.strip().lower())

    def _migrar_policiais(self, rows, departamentos, lotacoes):
        mapa = {}
        for row in rows:
            obj = Policial.objects.create(
                matricula=_s(row.get("matricula")),
                cpf=_s(row.get("cpf")),
                nome=_s(row.get("nome")),
                cargo=_s(row.get("cargo")),
                departamento=self._dep_by_nome(row.get("depto")),
                lotacao=self._lotacao_by_nome(row.get("lotacao")),
                tel=_s(row.get("tel")),
                email=_s(row.get("email")),
                obs=_s(row.get("obs")),
            )
            mapa[row["id"]] = obj
        self._policiais_map = mapa
        self.stdout.write(f"Policiais: {len(mapa)} migrados.")
        return mapa

    def _migrar_fornecedores(self, rows):
        mapa = {}
        for row in rows:
            obj = Fornecedor.objects.create(
                nome=_s(row.get("nome")),
                cnpj=_s(row.get("cnpj")),
                contato=_s(row.get("contato")),
                tel=_s(row.get("tel")),
                email=_s(row.get("email")),
                categoria=_s(row.get("categoria")),
                endereco=_s(row.get("end") or row.get("endereco")),
                obs=_s(row.get("obs")),
            )
            mapa[row["id"]] = obj
        self.stdout.write(f"Fornecedores: {len(mapa)} migrados.")
        return mapa

    def _migrar_opcoes_menu(self, rows):
        n = 0
        for row in rows:
            OpcaoMenu.objects.create(
                grupo=_s(row.get("grupo")),
                valor=_s(row.get("valor")),
                rotulo=_s(row.get("rotulo")),
                ordem=int(row.get("ordem") or 0),
                ativo=bool(row.get("ativo", True)),
            )
            n += 1
        self.stdout.write(f"Opções de menu: {n} migradas.")

    # -- estoque ----------------------------------------------------------

    def _migrar_compras(self, rows, fornecedores, admin_user):
        mapa = {}
        for row in rows:
            obj = Compra.objects.create(
                fornecedor=fornecedores.get(row.get("fornecedor_id")),
                categoria=_s(row.get("categoria")),
                tipo=_s(row.get("tipo")),
                calibre=_s(row.get("calibre")),
                comprimento_cano=_s(row.get("comprimento_cano")),
                quantidade_carregadores=row.get("quantidade_carregadores") or None,
                capacidade=row.get("capacidade") or None,
                marca=_s(row.get("marca")),
                modelo=_s(row.get("modelo")),
                nivel=_s(row.get("nivel")),
                tamanho=_s(row.get("tamanho")),
                sexo=_s(row.get("sexo")),
                cargo=_s(row.get("cargo")),
                numero_nota_fiscal=_s(row.get("numero_nota_fiscal")),
                numero_empenho=_s(row.get("numero_empenho")),
                numero_tombo=_s(row.get("numero_tombo")),
                serie=_s(row.get("serie")),
                descricao=_s(row.get("descricao")),
                qtd_total=int(row.get("qtd_total") or 0),
                qtd_disp=int(row.get("qtd_disp") or 0),
                qtd_min=int(row.get("qtd_min") or 0),
                status=_s(row.get("status")),
                dt_aq=row.get("dt_aq") or None,
                valor_compra=row.get("valor_compra"),
                dt_val=row.get("dt_val") or None,
                obs=_s(row.get("obs")),
                criado_por=admin_user,
            )
            if row.get("fornecedor_id") and obj.fornecedor is None:
                self.stderr.write(self.style.WARNING(
                    f"Compra {row.get('id')}: fornecedor_id {row.get('fornecedor_id')!r} não encontrado."
                ))
            mapa[row["id"]] = obj
        self.stdout.write(f"Compras: {len(mapa)} migradas.")
        return mapa

    def _migrar_itens(self, rows, fornecedores, compras, admin_user):
        mapa = {}
        item_compra_field = next(
            (f for f in Item._meta.get_fields() if f.name == "compra"), None
        )
        for row in rows:
            kwargs = dict(
                patrimonio=_s(row.get("patrimonio")),
                descricao=_s(row.get("descricao")) or "(sem descrição)",
                categoria=_s(row.get("categoria")),
                tamanho=_s(row.get("tamanho")),
                sexo=_s(row.get("sexo")),
                cargo=_s(row.get("cargo")),
                marca=_s(row.get("marca")),
                serie=_s(row.get("serie")),
                qtd_total=int(row.get("qtd_total") or 0),
                qtd_disp=int(row.get("qtd_disp") or 0),
                qtd_min=int(row.get("qtd_min") or 0),
                fornecedor=fornecedores.get(row.get("fornecedor_id")),
                dt_aq=row.get("dt_aq") or None,
                dt_val=row.get("dt_val") or None,
                valor_compra=row.get("valor_compra"),
                status=_s(row.get("status")) or "Disponivel",
                obs=_s(row.get("obs")),
                tipo=_s(row.get("tipo")),
                modelo=_s(row.get("modelo")),
                criado_por=admin_user,
            )
            if item_compra_field is not None:
                kwargs["compra"] = compras.get(row.get("compra_id"))
            obj = Item.objects.create(**kwargs)
            mapa[row["id"]] = obj
        self.stdout.write(
            f"Itens: {len(mapa)} migrados"
            + (" (campo 'compra' não existe no model Item — compra_id não foi preservado)."
               if item_compra_field is None else ".")
        )
        return mapa

    def _migrar_bens(self, rows, itens, admin_user):
        n = 0
        for row in rows:
            item = itens.get(row.get("item_id"))
            if item is None:
                self.stderr.write(self.style.WARNING(
                    f"Bem {row.get('id')}: item_id {row.get('item_id')!r} não encontrado, pulando."
                ))
                continue
            BemIndividual.objects.create(
                item=item,
                patrimonio=_s(row.get("patrimonio")),
                serie=_s(row.get("serie")),
                status=_s(row.get("status")) or "Disponivel",
                tamanho=_s(row.get("tamanho")),
                sexo=_s(row.get("sexo")),
                dt_val=row.get("dt_val") or None,
                obs=_s(row.get("obs")),
                criado_por=admin_user,
            )
            n += 1
        self.stdout.write(f"Bens individuais: {n} migrados.")

    def _migrar_armas(self, rows, itens, admin_user):
        n = 0
        for row in rows:
            item = itens.get(row.get("item_id"))
            if item is None:
                self.stderr.write(self.style.WARNING(
                    f"Arma {row.get('id')}: item_id {row.get('item_id')!r} não encontrado, pulando."
                ))
                continue
            Arma.objects.create(
                item=item,
                patrimonio_codigo=_s(row.get("patrimonio_id")),
                tipo=_s(row.get("tipo")),
                marca=_s(row.get("marca")),
                modelo=_s(row.get("modelo")),
                calibre=_s(row.get("calibre")),
                comprimento_cano=_s(row.get("comprimento_cano")),
                quantidade_carregadores=row.get("quantidade_carregadores") or None,
                capacidade=row.get("capacidade") or None,
                numero_serie=_s(row.get("numero_serie")),
                criado_por=admin_user,
            )
            n += 1
        self.stdout.write(f"Armas: {n} migradas.")

    # -- operacoes ----------------------------------------------------

    def _migrar_cautelas(self, rows, departamentos, lotacoes, itens, policiais):
        n = 0
        for row in rows:
            item = itens.get(row.get("item_id") or row.get("item"))
            if item is None:
                self.stderr.write(self.style.WARNING(
                    f"Cautela {row.get('id')} ({row.get('numero')}): item não encontrado, pulando."
                ))
                continue
            Cautela.objects.create(
                numero=_s(row.get("numero")),
                data_saida=row.get("data_saida") or None,
                data_prev=row.get("data_prev") or None,
                data_dev=row.get("data_dev") or None,
                policial=policiais.get(row.get("policial_id")),
                matricula=_s(row.get("matricula")),
                policial_nome=_s(row.get("policial_nome")),
                departamento=self._dep_by_nome(row.get("depto")),
                lotacao=self._lotacao_by_nome(row.get("lotacao")),
                item=item,
                item_desc=_s(row.get("item_desc")),
                qtd=int(row.get("qtd") or 1),
                status=_s(row.get("status")) or "Pendente de Assinatura",
                condicao_dev=row.get("condicao_dev") or None,
                motivo_recolhimento=_s(row.get("motivo_recolhimento")),
                nup=_s(row.get("nup")),
                numero_io_bo=_s(row.get("numero_io_bo")),
                numero_serie_reparo=_s(row.get("numero_serie_reparo")),
                obs_dev=_s(row.get("obs_dev")),
                serie=_s(row.get("serie") or row.get("numero_serie")),
                assinatura_digital=_s(row.get("assinatura_digital")),
                assinatura_dev=_s(row.get("assinatura_dev")),
                token_confirmacao=_s(row.get("token_confirmacao")),
                token_confirmacao_dev=_s(row.get("token_confirmacao_dev")),
                email_policial=_s(row.get("email_policial")),
                hash_assinatura=_s(row.get("hash_assinatura")),
                hash_assinatura_dev=_s(row.get("hash_assinatura_dev")),
            )
            n += 1
        self.stdout.write(f"Cautelas: {n} migradas.")
