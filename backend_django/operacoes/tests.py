from django.test import TestCase
from django.utils import timezone

from estoque.models import BemIndividual, Item, StatusItemChoices

from .models import Cautela, CautelaStatusChoices, Movimento, MovimentoTipoChoices
from .services import CautelaError, assinar_cautela, criar_cautela, devolver_cautela


def _dados_unidade(**extra):
    """Payload mínimo de criar_cautela sem depender de um Policial
    cadastrado — cautela "de unidade", como usado pelos testes de estoque."""
    dados = {"is_cautela_unidade": True, "lotacao_nome": "Seção de Testes"}
    dados.update(extra)
    return dados


class CriarCautelaGranelTests(TestCase):
    """Item sem BemIndividual (a granel): coletes, munição etc."""

    def setUp(self):
        self.item = Item.objects.create(
            descricao="Colete Balístico", categoria="EPI", qtd_total=2, qtd_disp=2,
        )

    def test_decrementa_estoque_disponivel(self):
        cautela, _ = criar_cautela(_dados_unidade(item_id=self.item.id, qtd=1), None, None)
        self.item.refresh_from_db()
        self.assertEqual(self.item.qtd_disp, 1)
        self.assertEqual(cautela.qtd, 1)

    def test_bloqueia_sobrevenda_quando_qtd_maior_que_disponivel(self):
        """Regressão: antes da correção, qtd_disp ia a max(0, qtd_disp - qtd)
        sem checar se havia estoque suficiente — permitindo cautelar mais
        unidades do que o item tinha em estoque."""
        criar_cautela(_dados_unidade(item_id=self.item.id, qtd=2), None, None)
        self.item.refresh_from_db()
        self.assertEqual(self.item.qtd_disp, 0)

        with self.assertRaises(CautelaError):
            criar_cautela(_dados_unidade(item_id=self.item.id, qtd=1), None, None)

        self.item.refresh_from_db()
        self.assertEqual(self.item.qtd_disp, 0, "estoque não pode ficar negativo nem a cautela rejeitada deve ter efeito")

    def test_item_fica_em_uso_quando_estoque_zera(self):
        criar_cautela(_dados_unidade(item_id=self.item.id, qtd=2), None, None)
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, StatusItemChoices.EM_USO)


class CriarCautelaIndividualizadaTests(TestCase):
    """Item com BemIndividual: armas e outros itens serializados."""

    def setUp(self):
        self.item = Item.objects.create(
            descricao="Pistola Taurus G3", categoria="Armamento", qtd_total=2, qtd_disp=2,
        )
        self.bem_disponivel = BemIndividual.objects.create(
            item=self.item, serie="SN-001", patrimonio="PAT-001",
            status=StatusItemChoices.DISPONIVEL,
        )
        self.bem_em_uso = BemIndividual.objects.create(
            item=self.item, serie="SN-002", patrimonio="PAT-002",
            status=StatusItemChoices.EM_USO,
        )

    def test_aloca_bem_disponivel_e_marca_em_uso(self):
        criar_cautela(_dados_unidade(item_id=self.item.id, serie="SN-001"), None, None)
        self.bem_disponivel.refresh_from_db()
        self.assertEqual(self.bem_disponivel.status, StatusItemChoices.EM_USO)

    def test_forca_qtd_1_independente_do_qtd_pedido(self):
        """Regressão: cautela.qtd vinha direto do request (ex.: qtd=5) mesmo
        só alocando 1 BemIndividual — quantidade registrada ficava
        inconsistente com o que foi de fato reservado."""
        cautela, _ = criar_cautela(_dados_unidade(item_id=self.item.id, serie="SN-001", qtd=5), None, None)
        self.assertEqual(cautela.qtd, 1)

    def test_bloqueia_cautela_de_bem_ja_em_uso(self):
        """Regressão: quando a série informada batia com um bem que não
        estava disponível, a cautela era criada mesmo assim, sem nenhum
        bem físico de fato reservado."""
        with self.assertRaises(CautelaError):
            criar_cautela(_dados_unidade(item_id=self.item.id, serie="SN-002"), None, None)

    def test_bloqueia_quando_serie_nao_existe(self):
        with self.assertRaises(CautelaError):
            criar_cautela(_dados_unidade(item_id=self.item.id, serie="SN-999"), None, None)

    def test_bloqueia_quando_nenhum_bem_disponivel(self):
        self.bem_disponivel.status = StatusItemChoices.EM_USO
        self.bem_disponivel.save(update_fields=["status"])

        with self.assertRaises(CautelaError):
            criar_cautela(_dados_unidade(item_id=self.item.id), None, None)

    def test_conflito_de_serie_e_escopado_por_item(self):
        """Regressão: a checagem de série duplicada não filtrava por item —
        duas cautelas de itens diferentes com a mesma string de série se
        bloqueavam mutuamente (falso positivo)."""
        outro_item = Item.objects.create(
            descricao="Rádio HT", categoria="Comunicacao", qtd_total=1, qtd_disp=1,
        )
        BemIndividual.objects.create(
            item=outro_item, serie="SN-001", status=StatusItemChoices.DISPONIVEL,
        )

        # Mesma string de série ("SN-001"), item diferente — não deve conflitar.
        criar_cautela(_dados_unidade(item_id=self.item.id, serie="SN-001"), None, None)
        criar_cautela(_dados_unidade(item_id=outro_item.id, serie="SN-001"), None, None)

        # Mas repetir a mesma série no MESMO item deve continuar bloqueado.
        with self.assertRaises(CautelaError):
            criar_cautela(_dados_unidade(item_id=self.item.id, serie="SN-001"), None, None)


class AssinarCautelaTests(TestCase):
    def setUp(self):
        self.item = Item.objects.create(
            descricao="Rádio HT", categoria="Comunicacao", qtd_total=1, qtd_disp=1,
        )
        self.cautela, _ = criar_cautela(
            _dados_unidade(item_id=self.item.id, qtd=1, assinatura_digital="sig-saida"),
            None, None,
        )

    def test_assinatura_de_saida_ativa_a_cautela(self):
        self.assertEqual(self.cautela.status, CautelaStatusChoices.ATIVA)

    def test_bloqueia_forjar_devolucao_via_tipo_em_cautela_ativa(self):
        """Regressão: `tipo` vinha do cliente sem validação e decidia
        sozinho se a assinatura era de saída ou devolução — permitindo
        pular /devolver e marcar uma cautela Ativa como Devolvido direto,
        sem o item voltar ao estoque."""
        with self.assertRaises(CautelaError):
            assinar_cautela(self.cautela, "sig-fake", tipo="devolucao", request=None)

        self.cautela.refresh_from_db()
        self.assertEqual(self.cautela.status, CautelaStatusChoices.ATIVA)
        self.item.refresh_from_db()
        self.assertEqual(self.item.qtd_disp, 0, "item não pode voltar ao estoque sem passar por /devolver")

    def test_assinatura_de_devolucao_funciona_apos_devolver_cautela(self):
        devolver_cautela(self.cautela, {"data_dev": timezone.now().date()}, request=None)
        self.cautela.refresh_from_db()
        self.assertEqual(self.cautela.status, CautelaStatusChoices.PENDENTE_DEVOLUCAO)

        assinar_cautela(self.cautela, "sig-devolucao", tipo="devolucao", request=None)
        self.cautela.refresh_from_db()
        self.assertEqual(self.cautela.status, CautelaStatusChoices.DEVOLVIDO)


class DevolverCautelaTests(TestCase):
    def setUp(self):
        self.item = Item.objects.create(
            descricao="Colete Balístico", categoria="EPI", qtd_total=1, qtd_disp=1,
        )
        self.cautela, _ = criar_cautela(
            _dados_unidade(item_id=self.item.id, qtd=1, assinatura_digital="sig-saida"),
            None, None,
        )
        self.item.refresh_from_db()

    def test_devolucao_restaura_estoque(self):
        self.assertEqual(self.item.qtd_disp, 0)
        devolver_cautela(
            self.cautela,
            {"data_dev": timezone.now().date(), "assinatura_dev": "sig-devolucao"},
            request=None,
        )
        self.item.refresh_from_db()
        self.assertEqual(self.item.qtd_disp, 1)
        self.assertEqual(self.item.status, StatusItemChoices.DISPONIVEL)

    def test_devolucao_sem_assinatura_fica_pendente(self):
        cautela, _ = devolver_cautela(self.cautela, {"data_dev": timezone.now().date()}, request=None)
        self.assertEqual(cautela.status, CautelaStatusChoices.PENDENTE_DEVOLUCAO)


class MovimentoTests(TestCase):
    """Regressão: criar_cautela/devolver_cautela nunca escreviam em
    Movimento, apesar do model já ter os choices CAUTELA/DEVOLUCAO
    prontos — qualquer relatório baseado nele ficava sempre vazio."""

    def setUp(self):
        self.item = Item.objects.create(
            descricao="Colete Balístico", categoria="EPI", qtd_total=1, qtd_disp=1,
        )

    def test_criar_cautela_registra_movimento_de_cautela(self):
        cautela, _ = criar_cautela(_dados_unidade(item_id=self.item.id, qtd=1), None, None)

        movimentos = Movimento.objects.filter(item=self.item, tipo=MovimentoTipoChoices.CAUTELA)
        self.assertEqual(movimentos.count(), 1)
        self.assertEqual(movimentos.first().quantidade, cautela.qtd)

    def test_devolver_cautela_registra_movimento_de_devolucao(self):
        cautela, _ = criar_cautela(
            _dados_unidade(item_id=self.item.id, qtd=1, assinatura_digital="sig"), None, None,
        )
        devolver_cautela(
            cautela, {"data_dev": timezone.now().date(), "assinatura_dev": "sig-dev"}, request=None,
        )

        self.assertEqual(
            Movimento.objects.filter(item=self.item, tipo=MovimentoTipoChoices.DEVOLUCAO).count(), 1,
        )
