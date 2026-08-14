# PRD — Backend Django para o SGA (Sistema de Gestão de Armaria)

**Data:** 12/08/2026 (última atualização: 14/08/2026)
**Status:** ✅ Migração concluída — Fases 0-6 todas entregues. Pendências residuais: testes automatizados e CI do build Docker do Django (seção 10).
**Depende de:** [PARECER_ESTRUTURA_AMBIENTE.md](PARECER_ESTRUTURA_AMBIENTE.md), [AVALIACAO_MIGRACAO_DJANGO.md](AVALIACAO_MIGRACAO_DJANGO.md) — este PRD não repete a análise, parte dela como base.

---

## 1. Objetivo

Construir um backend único, em **Django + Django REST Framework (DRF)**, que substitua completamente os três backends parciais e divergentes hoje existentes (`server.ts`/`serverDb.ts` em Node, `backend_python/main.py` em FastAPI, `backend_python/server_http.py` em stdlib), passando a ser a **única fonte da verdade** para dados e regras de negócio do sistema de controle de armaria da Polícia Civil do Ceará.

O frontend React (SPA em `src/`) é mantido como está — ele consome endpoints REST genéricos (`/api/{recurso}`) e não precisa saber que o backend mudou de tecnologia, desde que o contrato (formato de payload, nomes de campo) seja preservado.

## 2. Por que migrar (motivação)

- Requisito formal: o backend deve ser Django.
- Ganho colateral real, independente do requisito: hoje a lógica de negócio está **duplicada e divergente** entre Node e Python, dependendo de como o sistema é executado (ver Parecer, item 3.3). Consolidar em um único backend elimina essa ambiguidade estrutural.
- A autenticação hoje é **100% client-side, com senhas em texto puro no código-fonte** (Parecer, item 3.1) — isso precisa ser refeito do zero de qualquer forma, migração ou não. Fazer isso dentro do novo backend Django evita retrabalho.

## 3. Escopo

### Dentro do escopo
- Modelagem Django de todas as **16 entidades de domínio** hoje existentes (ver inventário completo em AVALIACAO_MIGRACAO_DJANGO.md, seção 1): Departamento, Delegacia, Lotação, Policial, Fornecedor, Compra, Item, BemIndividual, Arma, Patrimônio, Serviço, Cautela, Movimento, OpçãoMenu, Usuário.
- Todos os endpoints hoje cobertos por `server.ts` (77 rotas — inventário completo na seção 2 do documento de avaliação), via DRF `ModelViewSet`/`Router`.
- Autenticação e autorização **server-side reais**: usuários com senha com hash (`django.contrib.auth`), sessão ou JWT (`djangorestframework-simplejwt`), e RBAC replicando os três papéis hoje simulados no frontend (`admin`, `armeiro`, `administrativo`), incluindo as regras finas de "só pode editar o que criou" já existentes em `AuthContext.can()`.
- Máquina de estados da Cautela (`Pendente de Assinatura → Ativa → Pendente → Devolvido`) com efeitos colaterais atômicos no estoque (`transaction.atomic()`).
- Geração de assinatura digital SVG (já existe uma implementação em Python reaproveitável — `generate_digital_signature_svg` em `backend_python/main.py`).
- Envio de e-mail real via SMTP (`django.core.mail`), incluindo o fluxo de confirmação por link único/token hoje existente só no Node.
- Geração de PDF de documentos de cautela/serviço (equivalente a `pdfkit`; sugestão: `weasyprint` ou `reportlab`).
- Geração de relatórios em XLSX (equivalente a `openpyxl`).
- **Especificação OpenAPI** de toda a API (requisito técnico, seção 5).
- **Gestão de segredos via Docker secrets**, eliminando o uso de `.env` para credenciais em produção (requisito técnico, seção 5).
- Testes automatizados mínimos cobrindo autenticação/RBAC e o fluxo de Cautela (o mais crítico do sistema).
- Atualização de `docker-compose.yml` e Dockerfiles para o novo backend único.

### Fora do escopo (por ora)
- Reescrever o frontend React — só deve mudar se o contrato de API precisar mudar, e isso deve ser evitado.
- Migrar dados históricos além do que já está em `db.json`/Postgres atual (tratado como carga inicial única, não como sincronização contínua).
- Funcionalidades novas não existentes no sistema atual — este é um projeto de substituição de backend, não de novas features.
- O script `admin/backfill-relacional` (correção de dados legados) só entra no escopo se ainda for necessário — validar com quem conhece o histórico dos dados antes de portar.

## 4. Requisitos funcionais (resumo por módulo)

| Módulo | Requisito |
|---|---|
| Cadastros (Departamentos, Delegacias, Lotações, Policiais, Fornecedores, Patrimônios, Armas, Opções de Menu) | CRUD completo via DRF, com paridade de campos e validações do sistema atual. |
| Compras / Itens / Bens | CRUD + vínculo com Fornecedor, controle de quantidade total/disponível/mínima, mesclagem de itens, relatório XLSX. |
| Serviços | CRUD, geração de código sequencial (`next-code`), geração de documento PDF. |
| Cautelas | Fluxo completo: criação, devolução, confirmação por e-mail (link único), reenvio de e-mail, assinatura digital, geração de PDF, relatório XLSX, geração de número sequencial. Estado deve ser consistente mesmo sob concorrência. |
| Movimentos | Registro de entrada/cautela/devolução/baixa vinculado a Item/Arma/Patrimônio/Departamento/Delegacia/Usuário. |
| Usuários e Autenticação | Login/logout, sessão ou JWT, papéis (admin/armeiro/administrativo), permissões por seção e por ação (view/add/edit/delete), com a regra de "só edita o que criou" onde aplicável hoje. |
| Dashboard | Endpoint agregando indicadores de estoque hoje servidos por `GET /api/dashboard/estoque`. |

## 5. Requisitos técnicos e não-funcionais

### 5.1 Stack
- **Django** (versão estável mais recente na LTS/atual) + **Django REST Framework**.
- **PostgreSQL** como banco (mantendo o que já está em uso via `docker-compose.yml`).
- Deploy via Docker, container único para o backend substituindo `backend_python` e `server.ts`.

### 5.2 OpenAPI (requisito obrigatório)
- A API deve expor sua especificação em **OpenAPI 3** automaticamente a partir do código (não escrita manualmente à parte), usando `drf-spectacular` (ou equivalente ativo e mantido).
- Endpoints obrigatórios:
  - `/api/schema/` — schema OpenAPI em JSON/YAML.
  - `/api/docs/` — UI interativa (Swagger UI ou Redoc) para consulta humana.
- Toda `ViewSet`/`Serializer` novo deve nascer com tipagem e documentação suficientes para aparecer corretamente no schema gerado (nada de `JsonResponse` cru fora do DRF, que quebraria a geração automática).

### 5.3 Gestão de segredos — Docker secrets, não `.env` (requisito obrigatório)

Padrão definido com a infra (convenção já aplicada nesta rodada aos containers atuais, ver seção 6.1):

- **Build args** (variáveis não sensíveis necessárias em build-time, ex. `VITE_API_BASE_URL` embutido no bundle do Vite): carregadas do `.env` local via `scripts/export-build-args.sh` e passadas como `ARG`/`build.args` no Dockerfile/`docker-compose.yml`. Nunca segredo real aqui — só configuração pública.
- **Segredos reais em runtime** (senha de banco, senha SMTP, `SECRET_KEY` do Django, chave de assinatura JWT): nunca em `.env` nem em `environment:` puro. Vêm de [Docker secrets](https://docs.docker.com/engine/swarm/secrets/) montados em `/run/secrets/<nome>`, com o `target` de cada secret sufixado `_SGA_BACK` (convenção da infra) — ex. `db_password_SGA_BACK`, `django_secret_key_SGA_BACK`.
- Cada container tem um `entrypoint.sh` que lê `/run/secrets/<var>_SGA_BACK` para a lista de variáveis daquele serviço, exporta no ambiente do processo (`export VAR=valor`) e grava em `~/.bashrc`, antes de dar `exec` no comando real do container. Já implementado para os containers atuais em `scripts/entrypoint.sh` (frontend/Node) e `backend_python/entrypoint.sh` (backend Python) — o backend Django deve nascer com o mesmo padrão (`backend_django/entrypoint.sh` análogo).
- Segredos a declarar em `docker-compose.yml` → `secrets:` quando o backend Django existir: `db_user`, `db_password`, `db_name`, `django_secret_key`, `smtp_user`, `smtp_password`, e chave de assinatura JWT (se `simplejwt` com chave própria for usada) — todos com `target` sufixado `_SGA_BACK` no serviço que os consome.
- `.env` só pode existir localmente, fora do Docker, para desenvolvimento individual (`python manage.py runserver`) e para fornecer os build args não sensíveis via `scripts/export-build-args.sh`; **nunca versionado** (já coberto pelo `.gitignore` — ver seção 6) e nunca como mecanismo de segredo real em produção.
- Variáveis de configuração **não sensíveis** (host SMTP, porta, `DEBUG=False`, etc.) continuam como `environment:` normal no `docker-compose.yml`, com valores lidos do `.env` via a substituição nativa `${VAR}` do Docker Compose.

### 5.4 Autenticação e RBAC
- Senhas com hash (`django.contrib.auth.hashers`, padrão do Django — PBKDF2/Argon2).
- Sessão de servidor (`SessionAuthentication`) ou JWT (`djangorestframework-simplejwt`) — decisão a confirmar com o time, mas deve ser um dos dois, nunca validação client-side.
- Permissões do DRF (`permissions.BasePermission` customizada) implementando as mesmas regras hoje simuladas em `AuthContext.can()` (Parecer, item 3.1): admin acessa tudo; armeiro só vê/edita `serviços`/`estoque`, edição restrita ao que criou; administrativo acessa tudo, edição restrita a `estoque` do que criou.

### 5.5 Testes
- Cobertura mínima obrigatória: autenticação/login, cada regra de RBAC (uma por papel/ação), e o ciclo completo de Cautela (criar → assinar → devolver → confirmar).
- Suite deve rodar no pipeline de CI (seção 5.6) antes de qualquer merge.

### 5.6 CI/CD
- Pipeline (GitHub Actions, `.github/workflows/`) executando, a cada PR/push em `main`:
  - Backend Django: `python manage.py test` (ou `pytest`), migrations check (`makemigrations --check`).
  - Frontend: já configurado em `.github/workflows/ci.yml` (lint + build).
  - Checagem de que nenhum arquivo de segredo foi versionado (já incluída em `ci.yml`).
- Build da imagem Docker do backend Django deve ser adicionado ao pipeline quando o serviço existir.

## 6. Estado do DevOps já resolvido nesta rodada (fora do Django em si)

Estes itens já foram implementados no repositório, independentemente da migração, e servem de base para o que vier:

- `.gitignore` criado, cobrindo `node_modules/`, `dist/`, `.env`, `secrets/*.txt`, bancos locais, caches Python.
- `.env` e `secrets/*.txt` removidos do rastreamento do Git (`git rm --cached`); credenciais reais rotacionadas. **Atenção:** como o repositório já tinha sido enviado ao GitHub, os valores antigos continuam no histórico — o `.gitignore` impede novos vazamentos, mas não apaga o passado (decisão consciente, ver conversa: reescrever histórico foi descartado por exigir `push --force` num repositório compartilhado).
- Templates `secrets/*.txt.example` criados para onboarding sem expor valores reais.
- Arquivos soltos sem uso real (`data.csv`, `part1.csv`, `raw_part2.csv`, `raw_part3.csv`, `process_data.js`, `build_brasao_exact.cjs`, `metadata.json`) removidos do repositório. **`db.json` segue em uso ativo hoje** — os dados já foram migrados para o Postgres (`migrar_db_json`, seção 12.4), mas `server.ts`/`serverDb.ts` continuam sendo a fonte de dados real para qualquer recurso que a Fase 5 ainda não tenha cortado (ver seção 12.1); `db.json` só deixa de ser necessário ao final da Fase 6. `backend_python` (FastAPI) foi removido do repositório nesta rodada — não era chamado por nada, já era código morto.
- `Dockerfile` raiz corrigido: builda o frontend para produção e agora executa `npm start` (build servido), em vez de rodar em modo dev (`npm run dev`) como antes.
- Pipeline de CI inicial criado (`.github/workflows/ci.yml`): lint + build do frontend, e checagem automática de que nenhum segredo voltou a ser versionado.
- Padrão de segredos `_SGA_BACK` (alinhado com a infra) já implementado nos containers atuais: `scripts/export-build-args.sh` (build args a partir do `.env`), `scripts/entrypoint.sh` (frontend/Node — hoje só `SMTP_PASS`) e `backend_python/entrypoint.sh` (backend Python — `db_user`/`db_password`/`db_name`), com `docker-compose.yml` já declarando os `target` sufixados `_SGA_BACK` para cada secret. Ver seção 5.3.

## 7. Arquitetura alvo

```
┌─────────────────────┐        ┌──────────────────────────────┐        ┌────────────┐
│  Frontend React      │  /api  │  Backend Django + DRF          │        │ PostgreSQL │
│  (Vite build, servido│ ─────▶ │  - Models (16 entidades)       │ ─────▶ │            │
│  estático ou via     │        │  - RBAC / auth (sessão ou JWT) │        │            │
│  Nginx/whitenoise)   │        │  - PDF (weasyprint/reportlab)  │        └────────────┘
└─────────────────────┘        │  - XLSX (openpyxl)             │
                                │  - E-mail (django.core.mail)   │
                                │  - OpenAPI (drf-spectacular)   │
                                └──────────────────────────────┘
                                     ▲
                                     │ credenciais via
                                     │ Docker secrets (/run/secrets/*)
                                     │
                                (nunca .env em produção)
```

`server.ts`/Node deixa de existir como backend — ou é eliminado, ou reduzido estritamente a servir os arquivos estáticos do build React (a decidir; Django com `whitenoise` também resolveria isso sozinho, tornando o Node dispensável).

## 8. Plano faseado

| Fase | Entrega | Critério de aceite | Status |
|---|---|---|---|
| **0 — Pré-requisitos** | DevOps já concluído (seção 6) + confirmação de que Django é requisito formal | `.gitignore`, CI e limpeza já feitos nesta rodada; falta só a confirmação formal do requisito. | ✅ Concluído |
| **1 — Modelagem** | `models.py` das 16 entidades + migrations + admin do Django habilitado para inspeção manual | `python manage.py migrate` roda limpo; todas as entidades visíveis no Django Admin. | ✅ Concluído — `backend_django/` criado (Django 5.2 + DRF + drf-spectacular), 16 entidades modeladas em 4 apps (`usuarios`, `cadastros`, `estoque`, `operacoes`), FKs de depto/lotação normalizadas, `Usuario` já como `AUTH_USER_MODEL`, migrations aplicadas contra o Postgres real, 16 models visíveis no Admin. |
| **2 — Cadastros (CRUD simples)** | DRF ViewSets para Departamentos, Delegacias, Lotações, Policiais, Fornecedores, Patrimônios, Armas, Compras, Itens, Opções de Menu | Endpoints respondem com o mesmo formato de payload hoje usado pelo frontend; testado manualmente contra as telas React existentes. | ✅ Concluído — todos os `ModelViewSet`s validados contra as telas React reais durante a Fase 5 (não só via `curl`), com paginação `{count,next,previous,results}` e filtros (`search`, `ativo`, `categoria` etc.) equivalentes aos de `server.ts`. |
| **3 — Núcleo de negócio** | Autenticação/RBAC real, Cautelas (máquina de estados + estoque), Serviços, Movimentos, e-mail SMTP, assinatura digital | Fluxo completo de cautela (criar → assinar → devolver → confirmar por e-mail) funcionando ponta a ponta; testes automatizados cobrindo esse fluxo. | 🔶 Em andamento — Auth JWT real já embutido no frontend (login/refresh/logout, página dedicada). Fluxo completo de cautela (criar→assinar→devolver) validado ponta a ponta contra o frontend real na Fase 5. Falta apenas: testes automatizados (`pytest`/`manage.py test`) — item isolado, ver seção 12.2. |
| **4 — Documentos** | Geração de PDF (cautela/serviço) e XLSX (itens/cautelas) | PDFs e planilhas gerados batem visualmente com os documentos hoje gerados pelo Node. | ✅ Concluído — PDF de cautela e de serviço (`reportlab`, campos reais incluindo `motivo`/`modelo`/`calibre`/`descricao`/`trabalho_realizado`/`pecas_substituidas`, adicionados ao model `Servico` na Fase 5) e XLSX de itens/cautelas gerados e testados via `curl` (200, arquivo PDF/CSV válido). Login real implementado no frontend. |
| **5 — Cutover do frontend, recurso por recurso** | Cada tela React trocando `server.ts`/`db.json` pelo Django como fonte de dados, uma de cada vez, com validação manual no browser a cada corte | Todas as ~13 entidades consumidas via Django; nenhuma tela quebrada; `server.ts` só resta como proxy para o que ainda não foi cortado. | ✅ Concluído — os 9 grupos de recursos da seção 12.1 cortados e validados (curl + browser via Playwright) um a um: opções de menu, departamentos/delegacias, fornecedores, lotações, policiais, compras/itens/bens/armas, serviços, cautelas/movimentos, usuários/dashboard. Detalhes e correções feitas durante o cutover na seção 12.5. |
| **6 — Aposentadoria dos backends antigos e limpeza final** | `server.ts` reduzido a estático + proxy (ou eliminado), `serverDb.ts`/`db.json` removidos do runtime, documentação atualizada | Sistema roda 100% via Django+Postgres; `db.json` não é mais lido por nenhum processo em produção. | ✅ Concluído — ver seção 12.2. Único débito remanescente do PRD inteiro: testes automatizados e cobertura de CI para o build Docker do Django (seção 10). |

## 9. Riscos

- **Ausência de testes hoje** torna qualquer comparação "a migração está correta?" subjetiva. Mitigação: escrever testes de contrato (snapshot dos payloads atuais do Node) antes de iniciar a Fase 2, para servir de critério objetivo de paridade.
- **Quebra de contrato com o frontend** se nomes de campo/formato de resposta do Django divergirem do que o Node retorna hoje — o frontend não tem tolerância a isso (não há camada de adaptação). Mitigação: revisar `src/services/api.js` e cada `page`/`component` que consome dados antes de fechar cada serializer.
- **Dados reais já existentes** (se houver) em Postgres via FastAPI ou em `db.json` precisam de plano de migração explícito antes da Fase 5 — não é reversível sem backup.
- **Escopo subestimado se tratado como "portar `main.py`"** — reforçando o achado da avaliação: a base real a portar é `serverDb.ts` (Node), não o FastAPI atual, que cobre menos de um terço da funcionalidade.

## 10. Abertos / a confirmar com o cliente

- ~~Confirmar formalmente que Django é requisito obrigatório~~ — resolvido na prática: migração completa executada (Fases 1-6).
- ~~Sessão ou JWT para autenticação~~ — resolvido: JWT (`simplejwt`), já em produção no frontend.
- ~~Destino final do Node~~ — resolvido: mantido só como servidor de estáticos + proxy (Fase 6, seção 12.2, opção a).
- ~~Necessidade real do endpoint `admin/backfill-relacional`~~ — resolvido: removido na Fase 5, não tinha consumidor.
- **Testes automatizados** (`pytest`/`manage.py test`) — único item de escopo original ainda pendente. Cobertura mínima recomendada: autenticação/RBAC (um teste por papel/ação) e o ciclo completo de Cautela (criar → assinar → devolver → confirmar).
- **CI/CD do build Docker do backend Django** (seção 5.6) — o pipeline existente (`ci.yml`) cobre lint/build do frontend, mas não builda a imagem do `backend_django` nem roda os testes acima.
- **Completar o cadastro de lotações faltantes** para os ~374 policiais migrados sem `lotacao_id` (seção 12.3) — pendência de dados, não de código.
- **Pixel-parity dos PDFs** (`reportlab` vs. `pdfkit` original) — só relevante se for requisito formal confirmado com quem usa os documentos hoje.

## 11. Processo de implementação

- O MCP **context7** (`@upstash/context7-mcp`) foi configurado no repositório (`.mcp.json` + `.claude/settings.json`, auto-aprovado) para consulta de documentação atualizada de bibliotecas durante a implementação. Antes de gerar código de cada peça nova (Django, DRF, `drf-spectacular`, `djangorestframework-simplejwt`, `psycopg`, `weasyprint`/`reportlab`, `openpyxl`), consultar o context7 para confirmar a API/versão atual em vez de confiar só em conhecimento estático, dado o ritmo de mudança dessas bibliotecas.
- Requer reiniciar a sessão do Claude Code (ou `/mcp`) para o servidor `context7` ficar disponível, já que foi registrado depois do início da sessão atual.
- **Fase 1 concluída:** scaffolding do projeto Django + DRF em `backend_django/` (ao lado de `backend_python/`, mantido até o corte final da Fase 5) e modelagem das 16 entidades com migrations + Django Admin habilitado, validado via context7 (Django 5.2, `drf-spectacular`).
- **Fase 2 em andamento:** DRF `ViewSet`s dos cadastros/estoque simples (departamentos, delegacias, lotações, policiais, fornecedores, patrimônios, opções de menu, compras, itens, bens, armas) já criados e validados manualmente via `curl`; falta validar contra as telas React reais.
- **Fase 3 em andamento:** autenticação JWT + RBAC real (`usuarios/permissions.py`) e máquina de estados completa da Cautela (`operacoes/services.py`, `operacoes/emails.py`, `operacoes/signature.py`) implementadas e validadas ponta a ponta via `curl` (login dos 3 papéis, bloqueios de RBAC, criar→confirmar→devolver→confirmar cautela, decremento/restauração de estoque). Usuários de demonstração: `python manage.py seed_usuarios` (mesmos e-mails/senhas do `SEED_USERS` do frontend — dev only, não produção).
- **Fase 4 avançada nesta rodada:** endpoints faltantes implementados (`usuarios` CRUD admin-only, `itens/mesclar`, `itens/relatorio-xlsx`, `itens/{id}/bens`, `itens/{id}/compras`, `cautelas/relatorio-xlsx`, `cautelas/{id}/documento-pdf`, `servicos/{id}/documento-pdf`, `dashboard/estoque` — via `reportlab`, adicionado a `requirements.txt`). `docker-compose.yml` consolidado: `backend_python` removido do repositório e do compose; `backend_django` é o único serviço de backend (porta 8000 só interna, acesso via proxy do `frontend`); `entrypoint.sh` roda `migrate` + `seed_usuarios` automaticamente no boot; novo secret `django_secret_key`. Dados de `db.json` migrados para o Postgres via `python manage.py migrar_db_json` (novo management command, seção 12.4) — confirmado com os dados reais (714 policiais, 112 lotações, 960 bens, 11 cautelas etc.). Autenticação real implementada no frontend: `AuthContext`/`api.js` passaram a fazer login/refresh/logout JWT de verdade contra `/api/auth/*`; todo o mock (`SEED_USERS`, "Acesso Rápido de Teste", auto-cadastro local) foi removido; o login virou uma página dedicada (`src/pages/LoginPage.jsx`, substituindo o modal) que leva ao dashboard após autenticar.
- **Próxima tarefa:** Fase 5 (seção 12.1) — cortar cada tela React para consumir o Django recurso por recurso, resolvendo os gaps de formato de campo e os pontos abertos listados na seção 12.3; depois Fase 6 (seção 12.2) — aposentar `server.ts`/`db.json` como fonte de dados.

## 12. PRD detalhado — Fase 5 (cutover do frontend) e Fase 6 (aposentadoria dos backends antigos)

### 12.0 Contexto e por que isto é uma fase própria

Ao fim da Fase 4, o Django já responde pela grande maioria dos recursos com dados reais migrados do Postgres — mas o frontend React **ainda não fala com ele**. O `server.ts` continua sendo, na prática, o backend que a aplicação usa: ele implementa ~80 rotas `/api/*` lendo/gravando `db.json`, e só cai no proxy para o Django (`app.use("/api", createProxyMiddleware(...))`, adicionado nesta rodada) para o que **não** estiver implementado localmente nele mesmo.

Isso significa que hoje há **duas fontes de dados divergentes ao vivo**: o Postgres (com os dados migrados) e o `db.json` (que o frontend ainda lê de fato). Continuar assim é o pior estado possível — parece que a migração terminou, mas não terminou. A Fase 5 existe para fechar essa lacuna: cortar, recurso por recurso, a leitura/escrita real do frontend para o Django, até `server.ts` não ter mais nenhuma lógica de negócio própria. A Fase 6 existe para então remover o que sobrar.

Por que **não** cortar tudo de uma vez: os formatos de campo divergem por recurso (ver 12.3), há lacunas de funcionalidade específicas (ver 12.3), e uma tela quebrada por um corte malfeito é imediatamente visível para quem usa o sistema — cortar um recurso de cada vez, testando no browser antes do próximo, é o único jeito de manter o sistema utilizável durante a transição.

### 12.1 Fase 5 — Cutover do frontend, recurso por recurso

**Objetivo:** cada recurso abaixo passa a ser lido/gravado pelo Django (via o proxy já existente em `server.ts`), e a rota equivalente em `server.ts` é removida assim que a tela correspondente for validada manualmente no browser.

**Mecânica do corte** (repetir para cada recurso da tabela):
1. Conferir o serializer Django do recurso (`backend_django/*/serializers.py`) contra o que a(s) tela(s) React esperam hoje (`src/services/api.js` já aponta pra `/api/<resource>`, que será automaticamente proxiado assim que a rota correspondente for removida de `server.ts`).
2. Ajustar a(s) tela(s) React que usam campo que mudou de forma (texto solto → `*_id`, ver 12.3) — só onde a tela **edita/filtra** pela relação; onde só **exibe**, os campos de compatibilidade (`depto`, `lotacao_nome`, `fornecedor_nome` etc., já adicionados nos serializers) evitam reescrever a exibição.
3. Remover a(s) rota(s) equivalente(s) daquele recurso em `server.ts` (ela cai automaticamente no proxy pro Django).
4. Testar no browser: listar, criar, editar, excluir (onde aplicável) — confirmar que persiste reiniciando o container `frontend` (prova de que está indo pro Postgres, não mais pro `db.json`).
5. Só então passar para o próximo recurso.

**Ordem recomendada** (do mais isolado/sem dependência para o mais crítico/interligado):

| Ordem | Recurso | Telas React afetadas | Observação |
|---|---|---|---|
| 1 | `opcoes-menu` | `src/services/menuOptions.js`, `main.jsx` (CadMenusView) | Sem FK, sem regra de negócio — melhor primeiro corte para validar o mecanismo do zero a zero. |
| 2 | `departamentos`, `delegacias` | `main.jsx` (várias telas leem a lista para popular selects) | Poucos registros (5 e 3), baixo risco. |
| 3 | `fornecedores` | `main.jsx` (CadFornecedorView) | Campo `end`→`endereco` já resolvido no serializer/migração. |
| 4 | `lotacoes` | `src/pages/CadLotacoes.jsx` | Tela já usa `useAuth().can()`; validar filtro/CRUD completo. |
| 5 | `policiais` | `main.jsx` (CadPoliciaisView) | Maior volume (714) — atenção aos ~374 sem `lotacao_id` (gap herdado da migração, ver 12.3). |
| 6 | `compras`, `itens`, `bens`, `armas` | `src/pages/CadItensCompra.jsx`, `src/pages/CadItens.jsx`, `main.jsx` | Cortar juntos — são fortemente relacionados. Resolver o gap `Item.compra` (12.3) **antes ou durante** este corte, não depois. |
| 7 | `servicos` | `src/pages/NovoServico.jsx`, `main.jsx` (dashboards de serviço) | `documento-pdf` tem campos faltantes no model (12.3) — decidir se completa o model antes de cortar ou aceita o PDF com placeholders temporariamente. |
| 8 | `cautelas`, `movimentos` | `src/pages/Cautelas.jsx`, `main.jsx` | O mais crítico: máquina de estados, assinatura digital, e-mail. Cortar por último, com o time todo ciente, e validar manualmente cada transição de estado (criar → assinar → devolver → confirmar) contra o Django antes de remover a rota do `server.ts`. |
| 9 | `usuarios`, `dashboard/estoque` | `UserHeaderBar`/futura tela de gestão de usuários, `DashboardEstoqueView` | `usuarios` ainda não tem tela de gestão no frontend (a antiga era 100% mock/local e foi removida) — construir uma nova tela admin-only consumindo o `UsuarioViewSet` real é trabalho novo desta fase, não só um corte. `dashboard/estoque` é só troca de fonte, sem tela nova. |

**Critério de aceite da Fase 5:** todas as 9 linhas acima cortadas e validadas; `grep` em `server.ts` não deve mais encontrar `serverDb.` para nenhum desses recursos (só pode sobrar para o que for explicitamente adiado com justificativa registrada aqui).

### 12.2 Fase 6 — Aposentadoria dos backends antigos e limpeza final ✅ Concluída

**Objetivo:** depois que a Fase 5 cortou todos os recursos, `server.ts` não tem mais nenhuma lógica de negócio própria — só serve os arquivos estáticos do build React e faz proxy de `/api/*` pro Django.

**O que foi feito:**
1. Confirmado (`grep -n "serverDb\." server.ts`) que não sobrava nenhuma rota de negócio — a única lógica remanescente era código morto (helpers de e-mail/SVG usados só pelas rotas de cautela já removidas), tratado no item 3.
2. Decisão tomada: **opção (a) — `server.ts` mantido só como estático + proxy.** Eliminar o Node (opção b, servir via whitenoise/Nginx direto do Django) foi descartado por ora: mudança de infra maior, sem ganho imediato claro, fica registrada como possível trabalho futuro se algum dia o serviço Node for considerado dispensável.
3. `serverDb.ts` deletado (não tinha mais nenhum import). `db.json` **removido do repositório** (dados já confirmados no Postgres — ver seção 12.4; recuperável via histórico do Git se necessário). `server.ts` reduzido de ~2460 linhas para ~55 (build final `dist/server.cjs` caiu de 133 KB para 2.9 KB) — sobrou só `express.json()`, o proxy pro Django e o serve estático/Vite dev middleware.
4. `DJANGO_BACKEND_URL` mantido (opção `a` foi a escolhida, o proxy continua existindo).
5. **Dependências mortas removidas** de `package.json`: `pdfkit`, `nodemailer`, `@types/nodemailer`, `@types/pdfkit`, `sharp` (usado só por um script de build de imagem já removido antes desta rodada) — `npm install` rodado, `package-lock.json` atualizado.
6. **SMTP realocado**: as variáveis `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER` e o secret `smtp_password` estavam configurados no serviço `frontend` do `docker-compose.yml` (resquício de quando o Node enviava e-mail) — mas quem envia e-mail de verdade agora é o Django, que não tinha esses secrets mapeados. Corrigido: movidos para o serviço `backend`, `backend_django/entrypoint.sh` atualizado para exportar `smtp_password`. Esse gap não estava listado na Fase 4 original — só apareceu ao revisar o compose durante a Fase 6.
7. Documentação atualizada: este PRD (Fases 5/6 marcadas concluídas nesta rodada), `DEPLOYMENT_GUIDE.md` (reescrito do zero — descrevia só o `backend_python`/FastAPI removido, sem nenhuma menção a Docker/Django), `GITHUB_EXPORT.md` (seção de estrutura de pastas), `PARECER_ESTRUTURA_AMBIENTE.md` e `AVALIACAO_MIGRACAO_DJANGO.md` (nota de atualização apontando pra este PRD, mantidos como registro histórico da análise original). `README.md` não tinha conteúdo relevante para atualizar.
8. **Testes automatizados (`pytest`/`manage.py test`) e cobertura do build Docker do Django no CI (seção 5.6) seguem pendentes** — únicos itens do PRD original que não foram fechados nesta rodada. Ver seção 10 (Abertos).

**Validação final:** `docker compose down && docker compose up -d --build` (rebuild completo do zero) confirmou: containers sobem limpos, dados persistem no volume do Postgres (714 policiais, 11 cautelas, etc. — contagens batendo com a migração original), login real funciona, e as telas de lotações/policiais/itens/serviços/cautelas/dashboard testadas via Playwright sem erros de console novos.

**Critério de aceite:** ✅ `docker compose up` sobe o sistema completo sem `backend_python` (removido na Fase 5) e sem nenhuma leitura de `db.json` em tempo de execução — `db.json` já foi removido do repositório.

### 12.3 Gaps identificados na Fase 4 — o que aconteceu com cada um durante a Fase 5

Estes gaps foram identificados antes do cutover (seção 12.0) e precisaram de decisão durante os cortes. Status final de cada um:

- ✅ **Resolvido — `Item.compra`:** campo FK real adicionado (`estoque/models.py`, migration `0003_item_compra`), `ItemSerializer`/`{id}/bens`/`{id}/compras` atualizados para usar a FK de verdade em vez do fallback por categoria+descrição; dados re-migrados (`--force`) com o vínculo preservado para os 20 itens.
- ✅ **Resolvido — campos faltantes em `Servico`:** `data_dev`, `motivo`, `categoria`, `marca`, `modelo`, `calibre`, `descricao`, `trabalho_realizado` (texto), `pecas_substituidas` (JSONField) adicionados ao model (migration `0004_servico_calibre_...`); `gerar_pdf_servico` atualizado para usar os campos reais em vez de placeholders. Confirmado: `NovoServico.jsx` e o modal de edição em `main.jsx` (`RelatoriosServicosView`) realmente enviavam todos esses campos — não eram hipotéticos.
- ⚠️ **Não resolvido — `Cautela` sem campo de observação geral (`obs`)** — mantido como estava; `relatorio-xlsx` continua usando `obs_dev` como substituto. Baixo impacto observado (não bloqueou nenhuma tela), fica como débito técnico conhecido.
- ⚠️ **Não resolvido — ~374/714 `Policial` sem `lotacao_id`** — confirmado que é lacuna real dos dados de origem (nomes de lotação em `policiais[].lotacao` que não existem na coleção `lotacoes` de `db.json`, ex. "COTIC", "1ª DHPP"). Não bloqueou o cutover (campo é nullable). Fica como pendência de cadastro, a resolver preenchendo as lotações faltantes via tela quando alguém notar na prática.
- ✅ **Resolvido — 3 `Arma` não migradas:** confirmado como lixo de dados de teste pré-existente em `db.json` (`item_id` como `"item-1"`/`"item-2"`, não um id real), não uma perda real.
- ✅ **Resolvido — paginação:** `DEFAULT_PAGINATION_CLASS` configurado (`core/pagination.py`, `SGAPageNumberPagination`, `page_size=10000`) — confirma o formato `{count, next, previous, results}` que o frontend sempre esperou. Efeito colateral encontrado e corrigido: as URLs `next`/`previous` geradas pelo DRF vazam o hostname interno do Docker (`http://backend:8000/...`) porque o proxy reescreve o `Host` header — inofensivo na prática (nenhuma tela usa `next`/`previous`, todas pedem tudo de uma vez com `page_size` alto), mas registrado aqui como debito técnico cosmético.
- **Bug adicional encontrado durante o corte 1 (não previsto na Fase 4): `src/services/api.js` montava URLs sem barra final.** Os routers do DRF exigem barra final; sem ela, POST/PATCH/DELETE recebiam um redirect 301 que o `fetch` segue trocando o método por GET — descartando a operação silenciosamente. Corrigido globalmente em `api.js` (`withTrailingSlash`) antes do primeiro corte real.
- **Bug adicional encontrado durante o corte 6: `POST/PATCH /api/itens` em `server.ts` não era CRUD simples** — mesclava itens duplicados (mesma categoria+descrição), gerava `BemIndividual` por patrimônio/série sequencial, criava `Arma` automaticamente para categoria "Armas", e sincronizava bens dinamicamente com cautelas ativas a cada `GET /api/bens`. Toda essa lógica foi portada para `estoque/services.py` (`criar_ou_mesclar_item`, `atualizar_item_e_sincronizar_bens`, `sincronizar_bens_do_item`) — sem isso, cortar `itens` teria quebrado silenciosamente o fluxo de "lançar no inventário" (`CadItensCompra.jsx`), a funcionalidade mais crítica de estoque do sistema.
- **Bug adicional encontrado durante o corte 8: contador de numeração de cautelas dessincronizado.** A migração de dados importava os `numero` das 11 cautelas (`CAU-2026-0001`..`0011`) mas não avançava o contador (`SequenciaNumeracao`) usado por `proximo_numero_cautela()` — a primeira cautela criada depois da migração colidia com um `numero` já existente (`IntegrityError`). Corrigido: `migrar_db_json` agora sincroniza o contador pro maior número visto, por ano, ao final da importação (`_sincronizar_contador_cautela`).
- **PDF via `reportlab`, não `weasyprint`** — mantido; layout não é pixel-idêntico ao `pdfkit` original, mas contém as mesmas seções/dados reais (incluindo os campos de `Servico` completados acima).
- **Testes automatizados** (seção 5.5 do PRD original) seguem pendentes — ver seção 12.2, Fase 6.

### 12.4 Referência — script de migração de dados

`backend_django/core/management/commands/migrar_db_json.py` (novo nesta rodada): lê `db.json` da raiz do repo e importa para o Postgres via ORM, respeitando a ordem de dependência entre entidades e mantendo um mapa `{id_antigo: instância}` por coleção para resolver as FKs corretamente (os ids de `db.json` são strings arbitrárias, não os UUIDs que `BaseModel` gera). Resolve departamento/lotação por nome normalizado (sem acento), criando departamentos que só existiam como texto solto nos dados de policiais/lotações (a coleção `departamentos` de `db.json` tinha só 5 registros "seed"; a estrutura real tem 27). Roda uma única vez, manualmente: `docker compose exec backend python manage.py migrar_db_json` (ou `--force` para reimportar por cima de dados já existentes — não idempotente por padrão, de propósito, para não mascarar reimportações acidentais). Reaproveita o comando pré-existente `seed_usuarios` para os 3 usuários de teste em vez de duplicar a lista.
