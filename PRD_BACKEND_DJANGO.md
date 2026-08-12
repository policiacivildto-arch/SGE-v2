# PRD — Backend Django para o SGA (Sistema de Gestão de Armaria)

**Data:** 12/08/2026
**Status:** Rascunho para validação
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
- Arquivos soltos sem uso real (`data.csv`, `part1.csv`, `raw_part2.csv`, `raw_part3.csv`, `process_data.js`, `build_brasao_exact.cjs`, `metadata.json`) removidos do repositório. **`db.json` foi mantido de propósito** — ele é dado ativo hoje (usado por `serverDb.ts`, `server_http.py` e como seed do Postgres em `seed_db.py`) e só deve ser removido quando o backend Django assumir e os dados forem migrados de fato para o Postgres.
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
| **2 — Cadastros (CRUD simples)** | DRF ViewSets para Departamentos, Delegacias, Lotações, Policiais, Fornecedores, Patrimônios, Armas, Compras, Itens, Opções de Menu | Endpoints respondem com o mesmo formato de payload hoje usado pelo frontend; testado manualmente contra as telas React existentes. | 🔶 Em andamento — 11 `ModelViewSet`s criados e validados manualmente via `curl` (payload snake_case, FKs expostas como `*_id`, sem paginação, schema OpenAPI com 22 paths). Falta validar contra as telas React reais (ainda só testado por linha de comando) e cobrir `Bens` (incluído) e demais recursos de cadastro fora da lista original se necessário. |
| **3 — Núcleo de negócio** | Autenticação/RBAC real, Cautelas (máquina de estados + estoque), Serviços, Movimentos, e-mail SMTP, assinatura digital | Fluxo completo de cautela (criar → assinar → devolver → confirmar por e-mail) funcionando ponta a ponta; testes automatizados cobrindo esse fluxo. | 🔶 Em andamento — Auth JWT (`djangorestframework-simplejwt`) + RBAC (`SGARolePermission`, portado de `AuthContext.can()`) implementados e validados via `curl` para os 3 papéis (admin/armeiro/administrativo). Máquina de estados da Cautela completa (`operacoes/services.py`, `transaction.atomic()` + `select_for_update()`), e-mail via `django.core.mail` (console backend em dev), assinatura digital (SVG base64, porta fiel de `generateDigitalSignatureSvg`), numeração sequencial race-safe (`SequenciaNumeracao`). Fluxo completo criar→confirmar→devolver→confirmar validado ponta a ponta via `curl`. Falta: testes automatizados (`pytest`/`manage.py test`), validação contra o frontend React real. |
| **4 — Documentos** | Geração de PDF (cautela/serviço) e XLSX (itens/cautelas) | PDFs e planilhas gerados batem visualmente com os documentos hoje gerados pelo Node. | ⬜ Não iniciado |
| **5 — OpenAPI e corte final** | `/api/schema/` e `/api/docs/` publicados; `server.ts`/`serverDb.ts`/`server_http.py`/`db.json` aposentados; `docker-compose.yml` com um único serviço de backend usando Docker secrets | Sistema roda 100% via Django; nenhum dos backends antigos é mais necessário para a aplicação funcionar. | ⬜ Não iniciado — `/api/schema/`/`/api/docs/` já publicados desde a Fase 1, mas aposentar os backends antigos e consolidar o `docker-compose.yml` depende das Fases 3 e 4 estarem prontas. |

## 9. Riscos

- **Ausência de testes hoje** torna qualquer comparação "a migração está correta?" subjetiva. Mitigação: escrever testes de contrato (snapshot dos payloads atuais do Node) antes de iniciar a Fase 2, para servir de critério objetivo de paridade.
- **Quebra de contrato com o frontend** se nomes de campo/formato de resposta do Django divergirem do que o Node retorna hoje — o frontend não tem tolerância a isso (não há camada de adaptação). Mitigação: revisar `src/services/api.js` e cada `page`/`component` que consome dados antes de fechar cada serializer.
- **Dados reais já existentes** (se houver) em Postgres via FastAPI ou em `db.json` precisam de plano de migração explícito antes da Fase 5 — não é reversível sem backup.
- **Escopo subestimado se tratado como "portar `main.py`"** — reforçando o achado da avaliação: a base real a portar é `serverDb.ts` (Node), não o FastAPI atual, que cobre menos de um terço da funcionalidade.

## 10. Abertos / a confirmar com o cliente

- Confirmar formalmente que Django é requisito obrigatório (e não apenas preferência).
- Sessão (`SessionAuthentication`) ou JWT (`simplejwt`) para autenticação — decisão de arquitetura ainda em aberto.
- Destino final do Node: eliminado ou mantido só como servidor de estáticos.
- Necessidade real do endpoint `admin/backfill-relacional` (script de correção de dados legados).

## 11. Processo de implementação

- O MCP **context7** (`@upstash/context7-mcp`) foi configurado no repositório (`.mcp.json` + `.claude/settings.json`, auto-aprovado) para consulta de documentação atualizada de bibliotecas durante a implementação. Antes de gerar código de cada peça nova (Django, DRF, `drf-spectacular`, `djangorestframework-simplejwt`, `psycopg`, `weasyprint`/`reportlab`, `openpyxl`), consultar o context7 para confirmar a API/versão atual em vez de confiar só em conhecimento estático, dado o ritmo de mudança dessas bibliotecas.
- Requer reiniciar a sessão do Claude Code (ou `/mcp`) para o servidor `context7` ficar disponível, já que foi registrado depois do início da sessão atual.
- **Fase 1 concluída:** scaffolding do projeto Django + DRF em `backend_django/` (ao lado de `backend_python/`, mantido até o corte final da Fase 5) e modelagem das 16 entidades com migrations + Django Admin habilitado, validado via context7 (Django 5.2, `drf-spectacular`).
- **Fase 2 em andamento:** DRF `ViewSet`s dos cadastros/estoque simples (departamentos, delegacias, lotações, policiais, fornecedores, patrimônios, opções de menu, compras, itens, bens, armas) já criados e validados manualmente via `curl`; falta validar contra as telas React reais.
- **Fase 3 em andamento:** autenticação JWT + RBAC real (`usuarios/permissions.py`) e máquina de estados completa da Cautela (`operacoes/services.py`, `operacoes/emails.py`, `operacoes/signature.py`) implementadas e validadas ponta a ponta via `curl` (login dos 3 papéis, bloqueios de RBAC, criar→confirmar→devolver→confirmar cautela, decremento/restauração de estoque). Usuários de demonstração: `python manage.py seed_usuarios` (mesmos e-mails/senhas do `SEED_USERS` do frontend — dev only, não produção).
- **Próxima tarefa:** completar Fase 3 com testes automatizados (`manage.py test`), depois Fase 4 (seção 8) — geração de PDF (cautela/serviço) e relatórios XLSX.
