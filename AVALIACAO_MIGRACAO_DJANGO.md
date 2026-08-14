# Avaliação de Viabilidade — Migração do Backend para Django

**Data:** 12/08/2026
**Escopo:** Avaliar a viabilidade de migrar o backend do sistema SGA (Polícia Civil do Ceará) para Django, mantendo o domínio de negócio atual (armamento, policiais, cautelas, lotações, assinatura digital via e-mail).
**Pré-requisito de leitura:** [PARECER_ESTRUTURA_AMBIENTE.md](PARECER_ESTRUTURA_AMBIENTE.md) — este documento não repete os achados de segurança/arquitetura já registrados lá, mas depende deles como pano de fundo.

> **Atualização (14/08/2026):** a migração avaliada aqui foi executada por completo — ver [PRD_BACKEND_DJANGO.md](PRD_BACKEND_DJANGO.md) para o plano faseado e o estado final (Fases 1-6 concluídas). Este documento é mantido como registro da análise de viabilidade original.

---

## 0. Achado que muda o enquadramento do pedido

Antes de discutir Django, é preciso corrigir uma premissa: **"migrar o backend Python (`backend_python/`) para Django" subestima drasticamente o tamanho real do trabalho**, porque `backend_python/main.py` (FastAPI) **não é o backend completo do sistema — é um esqueleto parcial**.

O backend que a aplicação React realmente usa no dia a dia (`npm run dev`) é [server.ts](server.ts) + [serverDb.ts](serverDb.ts), em **Node/Express, 2.474 + 1.131 linhas**, com **77 rotas** registradas, geração de **PDF (pdfkit)**, geração de **relatórios XLSX**, envio de **e-mail real via SMTP (nodemailer)**, e **16 entidades de domínio**.

O FastAPI (`backend_python/main.py`, usado só no `docker-compose up`) implementa **apenas 9 endpoints reais**, cobrindo somente `policiais`, `itens/bens` (parcial) e `cautelas` (criar/listar/devolver/confirmar), sem PDF, sem SMTP real (a confirmação é só uma URL que pode ser aberta manualmente), sem `armas`, `patrimonios`, `servicos`, `compras`, `movimentos`, `departamentos`, `delegacias`, `fornecedores`, `usuarios` nem `opcoes-menu`.

**Consequência prática:** uma migração para Django não é "reescrever `main.py` em Django" — é **construir do zero, em Django, tudo o que hoje existe espalhado entre `server.ts`/`serverDb.ts` (a versão funcionalmente completa) e `backend_python/` (a versão parcial em Postgres)**, escolhendo qual dos dois é a fonte da verdade do domínio (recomendação: `serverDb.ts`, por ser o mais completo). O restante desta avaliação assume esse escopo real.

---

## 1. Modelos de dados (→ Django models)

Fonte mais completa: [serverDb.ts](serverDb.ts) (16 entidades). O SQLAlchemy (`backend_python/models.py`) cobre só 9 delas, de forma mais simples.

| Entidade | Campos principais | Relacionamentos |
|---|---|---|
| **Departamento** | nome, sigla, ativo | 1:N com Delegacia, Patrimonio |
| **Delegacia** | nome, código, cidade, departamento_id, ativo | N:1 Departamento; 1:N Patrimonio |
| **Lotacao** | depto, nome, cidade, resp, área de atuação, AIS, tel, endereço, seccional | referenciada por Policial (hoje por texto livre, não FK) |
| **Policial** | matrícula (única), CPF, nome, cargo, depto, lotação, tel, email, obs | 1:N Cautela, Servico, Usuario |
| **Fornecedor** | nome, CNPJ, contato, tel, email, categoria, endereço, obs | 1:N Item, Compra |
| **Compra** | fornecedor_id, categoria, tipo, calibre, comprimento_cano, qtd carregadores, capacidade, marca, modelo, nível, tamanho, sexo, cargo, NF, empenho, tombo, série, qtd_total/disp/min, status, datas, valor | N:1 Fornecedor |
| **Item** (bem/material bélico) | patrimônio, descrição, categoria, tamanho, sexo, cargo, marca, série, qtd_total/disp/min, fornecedor_id, datas aquisição/validade, valor, status, obs | N:1 Fornecedor; 1:N BemIndividual, Arma, Cautela, Movimento |
| **BemIndividual** | item_id, patrimônio, série, status, tamanho, sexo, dt_val, obs | N:1 Item |
| **Arma** | item_id, patrimonio_id, tipo, marca, modelo, calibre, comprimento_cano, qtd carregadores, capacidade, número de série | N:1 Item, Patrimonio |
| **Patrimonio** | código, descrição, categoria, departamento_id, delegacia_id, ativo | N:1 Departamento, Delegacia |
| **Servico** | código, policial_id, matrícula, nome, depto, lotação, tipo, data recebimento, status, série, obs | N:1 Policial |
| **Cautela** | número, data saída/prevista/devolução, policial_id, matrícula, nome, email, depto, lotação, item_id, descrição, qtd, status (máquina de estados), condição devolução, motivo recolhimento, NUP, número IO/BO, série reparo, obs devolução, série, **assinatura_digital / assinatura_dev (SVG)**, **token_confirmacao / token_confirmacao_dev**, hash_assinatura(_dev), created_by | N:1 Policial, Item; 1:N Movimento |
| **Movimento** | item_id, arma_id, patrimonio_id, departamento_id, delegacia_id, usuario_id, tipo (Entrada/Cautela/Devolução/Baixa), quantidade, status, data | N:1 Item/Arma/Patrimonio/Departamento/Delegacia/Usuario |
| **OpcaoMenu** | grupo, valor, rótulo, ordem, ativo | tabela de domínio configurável (combos dinâmicos) |
| **Usuario** | username, nome, cargo, policial_id, departamento_id, delegacia_id, ativo | N:1 Policial, Departamento, Delegacia — **hoje não existe no backend real; autenticação é 100% client-side** (ver Parecer, item 3.1) |

Observações de modelagem relevantes para Django:
- `Cautela.status` é uma **máquina de estados** (`Pendente de Assinatura → Ativa → Pendente (Devolução) → Devolvido`) com efeitos colaterais em `Item.qtd_disp`/`status` a cada transição — isso deve virar lógica de serviço/model methods, não só CRUD.
- Muitas FKs hoje são **strings soltas sem `ForeignKey` de fato** (ex.: `Policial.lotacao` é texto livre, não aponta para `Lotacao.id`) — a migração é uma boa oportunidade para normalizar isso em `models.ForeignKey`, mas é trabalho extra, não só tradução 1:1.
- IDs são `uuid` como string em toda parte — mapeável direto para `UUIDField(primary_key=True, default=uuid.uuid4)`.

---

## 2. Endpoints/rotas (→ views/serializers, provavelmente DRF)

Agrupado pelo escopo real (`server.ts`, 77 rotas — superset do que `main.py` cobre):

- **Dashboard**: `GET /api/dashboard/estoque`
- **Departamentos**: GET/POST/PATCH/DELETE `/api/departamentos[/:id]`
- **Delegacias**: GET/POST/PATCH/DELETE `/api/delegacias[/:id]`
- **Lotações**: GET/POST/PATCH/DELETE `/api/lotacoes[/:id]`
- **Policiais**: GET/POST/PATCH/DELETE `/api/policiais[/:id]`
- **Fornecedores**: GET/POST/PATCH/DELETE `/api/fornecedores[/:id]`
- **Compras**: GET/POST/PATCH/DELETE `/api/compras[/:id]`
- **Itens/Bens/Material bélico**: GET/POST/PATCH/DELETE `/api/itens[/:id]`, `/api/bens[/:id]`, `/api/itens/:id/bens`, `/api/itens/:id/compras`, `/api/itens/mesclar`, `/api/itens/relatorio-xlsx` (**gera XLSX**)
- **Armas**: GET/POST/PATCH/DELETE `/api/armas[/:id]`
- **Patrimônios**: GET/POST/PATCH/DELETE `/api/patrimonios[/:id]`
- **Serviços**: GET/POST/PATCH/DELETE `/api/servicos[/:id]`, `/api/servicos/next-code`, `/api/servicos/:id/documento-pdf` (**gera PDF**)
- **Cautelas** (o núcleo mais complexo do sistema):
  - `GET/POST /api/cautelas`, `PATCH/DELETE /api/cautelas/:id`
  - `GET /api/cautelas/next-number`, `/api/cautelas/relatorio-xlsx`
  - `POST /api/cautelas/:id/devolver`, `/api/cautelas/:id/reenviar-email`, `/api/cautelas/:id/assinar`
  - `GET /api/cautelas/confirmar-email`, `/api/cautelas/confirmar-email-dev` (**endpoints HTML**, clicados a partir do e-mail)
  - `POST /api/cautelas/confirmar-token`
  - `GET /api/cautelas/:id/documento-pdf` (**gera PDF**)
- **Movimentos**: GET/POST/PATCH `/api/movimentos[/:id]`
- **Opções de menu (combos dinâmicos)**: GET/POST/PATCH/DELETE `/api/opcoes-menu[/:id]`
- **Usuários**: GET/POST/PATCH/DELETE `/api/usuarios[/:id]` (hoje sem autenticação real por trás)
- **Admin**: `POST /api/admin/backfill-relacional` (script de correção de dados legado — avaliar se ainda é necessário migrar)
- **Health**: `GET /api/health`

Como o front é uma SPA React consumindo JSON puro via `fetch` (ver `src/services/api.js`, que usa `GET/POST/PATCH/DELETE` genéricos sobre `/api/{resource}[/:id]`), **Django REST Framework (DRF) é claramente a escolha correta** — os `ViewSet`s + `Router` do DRF mapeiam quase 1:1 para esse padrão CRUD-por-recurso que o frontend já assume, poupando bastante boilerplate versus Django puro com `JsonResponse`.

---

## 3. Funcionalidades que exigem atenção especial na migração

1. **Autenticação/RBAC — hoje inexistente no servidor.** Nenhum dos três backends (Express, FastAPI, `server_http.py`) valida quem está logado; tudo é feito em `AuthContext.jsx` no navegador, com senhas em texto puro versionadas (Parecer, item 3.1). Migrar para Django **não é portar autenticação existente — é implementá-la pela primeira vez**, idealmente com `django.contrib.auth` + hashing + `SessionAuthentication` ou JWT (`djangorestframework-simplejwt`), e RBAC mapeando os papéis hoje só simulados no client (`admin`/`armeiro`/`administrativo`, lógica em `AuthContext.can()`).
2. **Envio de e-mail via SMTP real** — hoje só existe em `server.ts` (Node, via `nodemailer`, com fallback para conta de teste Ethereal se SMTP não configurado). O `backend_python/main.py` **não envia e-mail de verdade**: ele só monta a `confirmUrl` e devolve no JSON, assumindo que algo externo (o Node) mandaria o e-mail. Migrar para Django exige reimplementar esse envio (Django tem suporte nativo a SMTP via `django.core.mail`, é direto) e decidir o que fazer com o fallback de "modo simulado sem SMTP configurado" que hoje existe no Node.
3. **Geração de assinatura digital (SVG) embutida no registro da Cautela** — já existe em Python (`generate_digital_signature_svg` em `main.py`), reaproveitável quase sem alteração.
4. **Geração de PDF de documentos de cautela/serviço** — hoje feita em Node com `pdfkit`, **não existe em nenhum lugar do backend Python atual**. Precisa ser implementada do zero em Django (`reportlab`, `weasyprint` ou `xhtml2pdf` são os equivalentes usuais).
5. **Geração de relatórios XLSX** (`/api/itens/relatorio-xlsx`, `/api/cautelas/relatorio-xlsx`) — mesma situação: existe só no Node, precisa ser refeita em Django (`openpyxl` é o equivalente direto).
6. **Upload/captura de assinatura manuscrita** (`src/components/SignaturePad.jsx`) — verificar se hoje persiste imagem (base64/blob) no backend; se sim, definir estratégia de armazenamento de mídia em Django (`FileField`/`ImageField` + storage, já que hoje pode estar apenas embutida como string no JSON).
7. **Máquina de estados da Cautela com efeito colateral no estoque** (`Item.qtd_disp`) — precisa virar transação atômica no Django ORM (`transaction.atomic()`), hoje feita "manualmente" em cada handler tanto no Node quanto no FastAPI, sem garantias de atomicidade/concorrência.
8. **Relatório/rotina "admin/backfill-relacional"** — parece script de correção de dados legados do Node; decidir se precisa existir em Django ou se é descartável (dado histórico de uma migração anterior de dados).
9. **CORS e paridade de contrato** — o front hoje bate genericamente em `/api/*`; qualquer resposta de Django precisa manter os mesmos formatos de payload (nomes de campo em português, snake_case) para não exigir reescrever o frontend inteiro junto.

---

## 4. Estimativa de esforço por etapa (complexidade relativa, não prazo)

| Etapa | Complexidade | Por quê |
|---|---|---|
| **1. Modelagem (Django models + migrations)** | **Média** | 16 entidades, a maioria simples (CRUD de cadastro). A parte não trivial é decidir normalizar FKs hoje soltas como texto (ex. `lotacao` como string) e desenhar a máquina de estados da Cautela corretamente. |
| **2. Autenticação/RBAC** | **Grande** | Não existe hoje no servidor — é construção do zero, não migração. Inclui: modelo de usuário, hashing, login/logout, sessão ou JWT, permissões por papel em cada endpoint, e reescrever `AuthContext.jsx` no front para parar de decidir tudo localmente. É provavelmente a maior peça de trabalho nova do projeto todo, migração ou não. |
| **3. Endpoints CRUD (DRF ViewSets/Serializers)** | **Média-Grande** | Volume alto (77 rotas), mas grande parte é CRUD repetitivo que DRF resolve com pouco código por recurso (`ModelViewSet` + `Router`). O que puxa a complexidade para cima é a lógica de negócio da Cautela (criação, devolução, confirmação por e-mail, reenvio, assinatura) que não é CRUD simples. |
| **4. Integração de e-mail (SMTP)** | **Pequena-Média** | Django tem suporte nativo; o trabalho é replicar os templates HTML de confirmação e o fluxo de link único por token, hoje só existente no Node. |
| **5. Geração de PDF e XLSX** | **Média** | Não existe hoje em Python nenhum dos dois; é implementação nova usando bibliotecas equivalentes (`reportlab`/`weasyprint`, `openpyxl`), replicando o layout que hoje só existe em `pdfkit`/lib XLSX do Node. |
| **6. Testes automatizados** | **Média-Grande** | Hoje não há indício de suite de testes real no backend (nem Python nem Node) nem no RBAC do frontend (Parecer, item 9). Uma migração séria deveria nascer com testes, o que é esforço adicional não coberto no sistema atual. |
| **7. Deploy/Docker/CI** | **Pequena-Média** | Já existe `docker-compose.yml` com Postgres; adaptar para um serviço Django é incremental. O ponto de atenção é decidir o que acontece com `server.ts` (ver seção 5) e ajustar o `Dockerfile` raiz, que já tem um bug conhecido (builda produção mas roda em modo dev — Parecer, item 3.7). |

**Leitura geral:** o projeto é de porte **médio para grande**, não pelo número de entidades (que é gerenciável), mas porque **metade do trabalho "de migração" é na verdade construção de funcionalidade que nunca existiu em Python** (autenticação server-side, PDF, XLSX, SMTP real) — soma-se a isso a ausência de testes que tornaria qualquer refatoração arriscada de validar.

---

## 5. Riscos e decisões de arquitetura a tomar

1. **Django puro vs Django REST Framework.** Recomendação: **DRF**. O frontend já é 100% SPA consumindo JSON via `fetch` genérico por recurso — é exatamente o caso de uso que `ModelViewSet` + `DefaultRouter` resolve com o menor código possível. Django puro com `JsonResponse` obrigaria reimplementar manualmente serialização, paginação e validação que o DRF já dá pronto.
2. **Manter Postgres.** Sim — já está em produção via `docker-compose.yml`/`backend_python/database.py`, com leitura de segredos via Docker secrets. Django + `psycopg2`/`psycopg` é padrão maduro, sem risco aqui. (Trocar as credenciais reais hoje versionadas continua sendo pré-requisito independente da stack — Parecer, item 3.2.)
3. **O que fazer com `server.ts`/Express.** Hoje ele acumula 4 papéis: (a) servir o build do Vite, (b) proxy/spawn do backend Python em dev, (c) **fonte real de toda a lógica de negócio via `serverDb.ts`** (arquivo JSON), (d) geração de PDF/XLSX e envio de SMTP. Decisão necessária:
   - **Opção recomendada:** Django assume completamente os papéis (c) e (d) — regra de negócio, persistência e documentos passam a viver só no backend Django. Node fica reduzido a servir os assets estáticos do build React (ou é eliminado, servindo os assets direto por Nginx/Django `whitenoise`), eliminando a duplicação de lógica de negócio entre duas linguagens que hoje é o maior risco estrutural do projeto (Parecer, item 3.3).
   - **Alternativa a evitar:** manter Node como "camada de apresentação" fazendo PDF/e-mail enquanto Django faz CRUD — isso recriaria o mesmo problema de dois sistemas com regras de negócio parcialmente sobrepostas que já existe hoje entre Node e os dois Pythons.
4. **`db.json` como fonte de dados.** Precisa deixar de existir como armazenamento de produção (é lido/escrito por `server_http.py` e por `serverDb.ts`). Na migração, vira no máximo insumo de uma carga inicial única (como já é `seed_db.py` para o Postgres), nunca persistência corrente.
5. **Paridade de contrato com o frontend.** Qualquer alteração de nomes de campo/formatos de resposta quebra o frontend sem aviso (não há testes de contrato). Recomenda-se, se possível, escrever testes de snapshot dos payloads atuais do Node antes de desligar `server.ts`, para comparar contra as respostas do Django.
6. **Migração de dados em produção (se já houver dados reais em Postgres via FastAPI).** Se `backend_python/main.py` já estiver com dados reais gravados (não apenas os de seed), é preciso plano de migração de schema (SQLAlchemy → Django ORM apontando para as mesmas tabelas, ou migração de dados linha a linha) — schemas não são idênticos hoje.
7. **Janela de indisponibilidade / estratégia de corte.** Dado que hoje há dois backends ativos dependendo do modo de execução, a migração é uma boa oportunidade de eliminar essa ambiguidade de uma vez (consolidar em um único backend Django), mas isso deve ser comunicado como parte do escopo — não é "trocar o motor sem o carro perceber".

---

## 6. Recomendação

**Migrar vale a pena, mas só faz sentido como projeto faseado e com escopo explícito — não como "portar `main.py` para Django".**

- Não recomendo migrar **apenas por reescrever a stack**: o Python/FastAPI atual, apesar de incompleto, é uma base tecnicamente saudável (SQLAlchemy, Postgres, tipagem via Pydantic) e não tem nenhum problema inerente que Django resolveria sozinho. Se "Django" não for um requisito formal e comprovado do cliente, o custo-benefício de trocar de framework só para trocar é baixo perto dos ganhos reais.
- **Se é requisito formal do cliente** (como o enunciado indica), a recomendação é migrar, mas com o entendimento correto de escopo:
  1. **Fase 0 (pré-requisito, independente de framework):** tratar a Fase 1 do Parecer — segredos e autenticação server-side — pois sem isso qualquer backend novo nasce com a mesma falha crítica.
  2. **Fase 1:** modelagem Django completa das 16 entidades reais (baseadas em `serverDb.ts`, não só nas 9 do SQLAlchemy atual), com DRF para os CRUDs de cadastro (departamentos, delegacias, lotações, policiais, fornecedores, compras, patrimônios, armas, opções de menu) — é a parte de menor risco e maior volume, boa para validar o padrão antes de atacar Cautelas.
  3. **Fase 2:** portar o núcleo de negócio (Cautelas + máquina de estados + estoque), autenticação/RBAC, e-mail SMTP e geração de assinatura digital.
  4. **Fase 3:** PDF e XLSX (as duas funcionalidades que hoje só existem em Node e precisam ser recriadas do zero).
  5. **Fase 4:** aposentar `server.ts`/`serverDb.ts`/`server_http.py`/`db.json`, deixando Django como único backend, com Node (se mantido) restrito a servir estáticos.
- Fazer isso **em uma tacada só, sem fases**, é arriscado dado que não há testes automatizados cobrindo o comportamento atual (nem backend, nem o RBAC client-side) — o risco de regressão silenciosa é alto. Recomenda-se pelo menos escrever testes de contrato dos endpoints Node atuais antes de começar a Fase 1, para servir de critério objetivo de "a migração está correta".
