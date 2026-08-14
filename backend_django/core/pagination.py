from rest_framework.pagination import PageNumberPagination


class SGAPageNumberPagination(PageNumberPagination):
    """`page_size` grande o suficiente para cobrir qualquer listagem do
    SGA (maior tabela hoje: ~960 registros) — o frontend, herdado de
    server.ts's `respondList`, sempre esperou receber a lista inteira
    em `results` de uma vez, só embrulhada no formato
    `{count, next, previous, results}`. `page_size_query_param` existe
    só para o truque de `main.jsx` (`page_size=1`) que pede a contagem
    sem baixar a lista inteira."""

    page_size = 10000
    page_size_query_param = "page_size"
    max_page_size = 10000
