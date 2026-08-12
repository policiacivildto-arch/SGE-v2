# Parecer Técnico — Estrutura de Código e Ambiente do Projeto SGA

**Data:** 12/08/2026
**Escopo:** Análise da organização do repositório, arquitetura de back-end/front-end, configuração de ambiente e segredos.

---

## 1. Resumo Executivo

O projeto está em um estado **funcional, mas estruturalmente inconsistente e inseguro para produção**. Os principais problemas não são de "estilo", mas de arquitetura: existem **dois back-ends divergentes** que atendem a mesma aplicação dependendo de como ela é executada, **autenticação inteira feita no cliente com senhas em texto puro no código-fonte**, e **segredos reais versionados no Git** sem `.gitignore`. Há também arquivos de dados soltos na raiz do repositório que não deveriam estar ali.

Nenhum destes pontos impede o funcionamento local do sistema, mas todos representam risco alto caso o projeto vá para produção real com dados de policiais, armamento e cautelas (dado o domínio `@pc.ce.gov.br`).

---

## 2. Estrutura Atual

```
/
├── server.ts               # Servidor Express (Node) — usado via `npm run dev`
├── serverDb.ts              # "Banco" implementado em Node, 1131 linhas
├── backend_python/
│   ├── main.py               # API FastAPI + SQLAlchemy + Postgres (usado no Docker)
│   ├── server_http.py        # Servidor HTTP puro em stdlib, lê/escreve db.json (usado no dev local)
│   ├── models.py / schemas.py / database.py
│   └── seed_db.py
├── src/                      # Frontend React (Vite)
│   ├── context/AuthContext.jsx   # Autenticação 100% client-side
│   ├── pages/, components/, services/
├── secrets/                  # Arquivos de segredo (versionados!)
├── docker-compose.yml        # Orquestra Postgres + FastAPI + frontend
├── db.json, data.csv, part1.csv, raw_part2.csv, raw_part3.csv  # dados soltos na raiz
├── .env, .env.example
└── (sem .gitignore)
```

---

## 3. Achados Detalhados

### 3.1 CRÍTICO — Autenticação inteira no front-end, senhas em texto puro
Arquivo: [src/context/AuthContext.jsx](src/context/AuthContext.jsx)

- Usuários "seed" com senhas em **texto plano** hardcoded no código-fonte (`Admin@1234`, `Armeiro@1234`), versionadas no Git.
- Login (`login()`) compara `user.password !== password` **no navegador**, sem chamada ao back-end.
- Cadastro de novos usuários e senhas fica em `localStorage` (`pc_ce_registered_users`), acessível via DevTools por qualquer pessoa com acesso à máquina/navegador.
- Não há token, sessão de servidor, hashing (bcrypt/argon2) nem qualquer verificação server-side de permissão — os back-ends (Express, FastAPI e o servidor Python simplificado) não validam quem está autenticado nas rotas.
- Resultado prático: qualquer usuário pode abrir o console do navegador, editar o objeto `currentUser`/`localStorage` e se autopromover a `admin`, ou ler `pc_ce_registered_users` para obter todas as senhas cadastradas.

**Isso é o achado mais grave do projeto** — em um sistema de controle de armaria/policial isso é inaceitável mesmo em ambiente de homologação.

### 3.2 CRÍTICO — Segredos reais versionados no Git, sem `.gitignore`
- Não existe **nenhum `.gitignore`** no repositório.
- `secrets/db_user.txt`, `secrets/db_password.txt`, `secrets/db_name.txt` estão **commitados** com valores reais (`sga_user` / `sga_password` / `sga_db`).
- `.env` também está commitado (atualmente só contém `VITE_API_BASE_URL`, mas a ausência de `.gitignore` significa que qualquer segredo real adicionado por engano será versionado também).
- Sem `.gitignore`, `node_modules/`, builds (`dist/`), bancos SQLite locais e arquivos de IDE também correm risco de serem commitados no futuro.

### 3.3 ALTO — Dois back-ends divergentes conforme o modo de execução
- **Rodando via `npm run dev`:** [server.ts](server.ts) sobe o Express e, em paralelo, faz `spawn("python3", ["backend_python/server_http.py"])` — um servidor HTTP artesanal (stdlib, sem framework) que lê/grava dados diretamente em `db.json` (arquivo texto na raiz, 861KB).
- **Rodando via `docker-compose up`:** o serviço `backend` builda `backend_python/Dockerfile`, cujo `CMD` é `python main.py` — a API **FastAPI real**, com SQLAlchemy e Postgres.
- Ou seja, **o comportamento de persistência e regras de negócio muda dependendo de como alguém sobe o projeto**, e não há garantia de paridade entre `main.py` (Postgres/SQLAlchemy) e `server_http.py` (JSON file). Isso é uma fonte constante de bugs "funciona no meu ambiente" e dificulta qualquer teste confiável antes de produção.
- Além disso `serverDb.ts` (Node, 1131 linhas) parece implementar *ainda outra* camada de dados dentro do Express — não ficou claro nesta análise se é usada em paralelo ao Python ou é legado. Vale investigar se pode ser removida.

### 3.4 MÉDIO — CORS aberto com credenciais habilitadas
Arquivo: [backend_python/main.py](backend_python/main.py) linhas 27–29
```python
allow_origins=["*"],
allow_credentials=True,
```
Combinar `allow_origins=["*"]` com `allow_credentials=True` é uma configuração insegura (e, em navegadores modernos, é rejeitada pela spec CORS quando cookies estão envolvidos). Deve ser restrito a origens explícitas.

### 3.5 MÉDIO — Arquivos de dados/migração soltos na raiz do projeto
`db.json` (861KB), `data.csv`, `part1.csv`, `raw_part2.csv`, `raw_part3.csv`, `process_data.js`, `build_brasao_exact.cjs`, `metadata.json` estão na raiz do repositório, misturados com arquivos de configuração. Parecem artefatos de uma migração/importação de dados feita uma única vez, e não pertencem ao código-fonte da aplicação.

### 3.6 BAIXO — `tsconfig.json` com `strict: false`
Desabilita boa parte das checagens de tipo do TypeScript, reduzindo o valor do `npm run lint` (que roda `tsc --noEmit`) em pegar erros antes de produção.

### 3.7 BAIXO — Dockerfile de produção roda em modo dev
[Dockerfile](Dockerfile) (raiz) faz `RUN npm run build` mas o `CMD` final é `["npm", "run", "dev"]`, ou seja, builda os assets de produção e depois sobe o servidor em modo desenvolvimento (`tsx server.ts`) em vez de servir o build via `npm start` (`node dist/server.cjs`). O build feito é desperdiçado.

---

## 4. Plano de Correção

Organizado por prioridade. Itens 1–2 devem ser tratados antes de qualquer deploy real.

### Fase 1 — Segurança urgente (fazer antes de qualquer outra coisa)
1. **Remover segredos do histórico do Git**
   - Trocar imediatamente as credenciais reais em `secrets/*.txt` (mesmo sendo dev, evitar reuso).
   - Criar `.gitignore` cobrindo: `node_modules/`, `dist/`, `secrets/*.txt` (manter só `.gitkeep` ou `*.example`), `.env`, `*.db`, `db.json`.
   - Remover os arquivos sensíveis do índice do Git (`git rm --cached`) e considerar reescrever histórico (`git filter-repo`) já que ainda é um repositório pequeno/recente.
2. **Migrar autenticação para o servidor**
   - Mover `SEED_USERS`/lógica de `login`/`register` de `AuthContext.jsx` para o back-end escolhido (ver Fase 2).
   - Armazenar senhas com hash (bcrypt/argon2), nunca em texto plano.
   - Emitir sessão/token (JWT ou cookie de sessão httpOnly) validado em toda rota protegida.
   - `AuthContext.jsx` no front passa a apenas chamar a API e guardar o token/usuário retornado — sem lista de usuários nem senha no bundle JS.

### Fase 2 — Unificar a arquitetura de back-end
3. **Decidir um único back-end "fonte da verdade"** (recomendo o FastAPI/Postgres, `main.py`, por já ter modelagem relacional com SQLAlchemy):
   - Descontinuar `server_http.py` e a leitura direta de `db.json`.
   - Fazer `server.ts` sempre apontar para a API FastAPI (via proxy `/api` → `http://backend:8000`), tanto em dev quanto em Docker, em vez de decidir dinamicamente qual backend subir.
   - Avaliar se `serverDb.ts` ainda é necessário; se for redundante com `main.py`, remover.
4. **Corrigir CORS** em `main.py`: restringir `allow_origins` a domínios conhecidos (ou usar variável de ambiente por ambiente), e só usar `allow_credentials=True` junto de origens explícitas.
5. **Corrigir o `Dockerfile` de produção** para usar `npm start` (build servido) em vez de `npm run dev`.

### Fase 3 — Organização do repositório
6. Mover artefatos de dados (`data.csv`, `part1.csv`, `raw_part2.csv`, `raw_part3.csv`, `db.json`, `process_data.js`, `metadata.json`) para uma pasta `scripts/migration/` ou `data/` isolada, com um README explicando se ainda são necessários — ou removê-los se já cumpriram seu papel de importação inicial.
7. Avaliar mover `build_brasao_exact.cjs` para `scripts/`.

### Fase 4 — Qualidade
8. Reativar `"strict": true` em `tsconfig.json` gradualmente (pode ser por diretório/arquivo se o volume de erros for grande).
9. Adicionar testes automatizados mínimos para as regras de permissão hoje em `AuthContext.can()` — essa lógica de RBAC (admin/armeiro/administrativo) é sensível e deve ser coberta por testes antes de ser movida para o servidor.

---

## 5. Observação Final

A prioridade real não é estilo de código — é que **hoje qualquer pessoa com acesso ao navegador pode se tornar administrador do sistema de controle de armamento**, e **as credenciais do banco de dados estão no histórico público/privado do Git sem proteção**. Recomendo tratar os itens da Fase 1 como bloqueantes antes de qualquer uso além do ambiente local do desenvolvedor.
