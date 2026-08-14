# 🚀 Guia Completo de Implantação e Execução - SGA (Sistema de Gestão de Armaria)

Este guia cobre como executar o SGA localmente (Docker ou serviços separados) e como empacotar para aplicativos móveis Android e iOS.

> **Arquitetura atual (pós Fase 6 da migração para Django — ver [PRD_BACKEND_DJANGO.md](PRD_BACKEND_DJANGO.md)):** o backend real é **Django + Django REST Framework**, em `backend_django/`, rodando contra **PostgreSQL**. O frontend React é servido por um processo Node (`server.ts`) que faz só duas coisas: serve o build estático e faz proxy de `/api/*` para o Django. Não existe mais backend em Python/FastAPI (`backend_python/`, removido) nem armazenamento em `db.json` (dados migrados para o Postgres).

---

## 📁 Estrutura de Pastas do Repositório

```text
/ (Raiz do Projeto)
│── backend_django/       # Backend Django + DRF (único backend real)
│   ├── config/            # settings.py, urls.py, wsgi.py
│   ├── cadastros/         # Departamentos, Delegacias, Lotações, Policiais, Fornecedores, Patrimônios
│   ├── estoque/           # Compras, Itens, Bens Individuais, Armas
│   ├── operacoes/         # Serviços, Cautelas (máquina de estados), Movimentos
│   ├── usuarios/          # Autenticação JWT, RBAC, CRUD de usuários
│   ├── core/               # Utilitários compartilhados + management command de migração de dados legados
│   ├── requirements.txt
│   └── entrypoint.sh      # Lê segredos, roda migrations + seed, inicia o servidor
│
│── src/                  # Frontend Web & Mobile (React + Vite)
│   ├── pages/             # Páginas (Cautelas, Policiais, Itens, Serviços, Relatórios)
│   ├── components/        # Componentes reutilizáveis
│   ├── context/           # AuthContext (login/logout JWT real)
│   └── services/          # api.js (cliente HTTP com JWT + refresh automático)
│
│── server.ts              # Servidor estático do frontend + proxy /api/* → Django
│── docker-compose.yml     # db (Postgres) + backend (Django) + frontend (Node)
│── secrets/                # Segredos locais (gitignored) — ver secrets/*.txt.example
│── PRD_BACKEND_DJANGO.md  # Histórico completo da migração e arquitetura-alvo
│── MOBILE_SETUP.md        # Guia específico para Android e iOS
└── GITHUB_EXPORT.md       # Instruções de exportação para o GitHub
```

---

## 1. 🐳 Execução via Docker (recomendado)

Sobe os três serviços (Postgres, Django, frontend) de uma vez.

### Passo 1: Criar os segredos locais
```bash
cd secrets
cp db_user.txt.example db_user.txt
cp db_password.txt.example db_password.txt
cp db_name.txt.example db_name.txt
cp smtp_password.txt.example smtp_password.txt   # só necessário se for enviar e-mail de verdade
python3 -c "import secrets; print(secrets.token_urlsafe(50))" > django_secret_key.txt
```
Edite os arquivos com valores reais (nunca comitar `secrets/*.txt` — já está no `.gitignore`).

### Passo 2: Subir os containers
```bash
docker compose up -d --build
```
- Postgres: porta `5432`
- Django: só acessível internamente via proxy do frontend (não publicado no host)
- Frontend: `http://localhost:3000`

O `entrypoint.sh` do Django roda `migrate` e `seed_usuarios` (usuários de demonstração) automaticamente no boot.

### Passo 3 (só na primeira vez, se for importar dados de um `db.json` legado)
```bash
docker compose exec backend python manage.py migrar_db_json
```
Não roda automaticamente — é um import único e manual (ver `PRD_BACKEND_DJANGO.md`, seção 12.4).

### Login de demonstração
| E-mail | Senha | Papel |
|---|---|---|
| `admin@pc.ce.gov.br` | `Admin@1234` | Administrador |
| `armeiro@pc.ce.gov.br` | `Armeiro@1234` | Armeiro |
| `admin.serv@pc.ce.gov.br` | `Admin@1234` | Administrativo |

---

## 2. 🐍 Execução local do backend Django (fora do Docker)

```bash
cd backend_django
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env         # ajuste DB_HOST/db_user/db_password/db_name locais
python manage.py migrate
python manage.py seed_usuarios
python manage.py runserver 0.0.0.0:8000
```
> Documentação interativa da API (Swagger): `http://localhost:8000/api/docs/`
> Schema OpenAPI: `http://localhost:8000/api/schema/`

Sem os segredos de banco configurados, o Django cai automaticamente em SQLite local (`db.sqlite3`) — conveniente para dev, mas confirme que não é isso que está rodando em produção.

---

## 3. 💻 Execução local do frontend (React)

Em um novo terminal (na raiz do projeto):

```bash
npm install
npm run dev
```
> Frontend em `http://localhost:3000`. Em dev, o `server.ts` já faz proxy de `/api/*` para `DJANGO_BACKEND_URL` (default `http://backend:8000`, ajuste via `.env`/variável de ambiente se o Django não estiver rodando via Docker).

---

## 4. 🌐 Implantação em servidor / Nuvem

O `docker-compose.yml` já está pronto para produção com Docker Secrets (nunca `.env` para credenciais reais — ver `PRD_BACKEND_DJANGO.md`, seção 5.3):
1. Gere segredos reais em `secrets/*.txt` no servidor (nunca versionados).
2. Ajuste `DEBUG`/`ALLOWED_HOSTS` do serviço `backend` no `docker-compose.yml` para produção (`DEBUG: "False"`, `ALLOWED_HOSTS` com o domínio real).
3. `docker compose up -d --build`.

---

## 5. 📱 Aplicativo Móvel (Android & iOS)

Consulte o documento dedicado [`MOBILE_SETUP.md`](./MOBILE_SETUP.md) para instruções detalhadas de como compilar o APK Android ou o projeto Xcode para iOS usando **Capacitor**.
