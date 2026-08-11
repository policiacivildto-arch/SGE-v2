# 🚀 Guia Completo de Implantação e Execução - SGA (Sistema de Gestão de Armaria)

Este guia cobre todas as instruções passo a passo para executar o SGA em ambiente **Local**, **Servidor Web / Nuvem** e como empacotar para aplicativos móveis **Android e iOS**.

---

## 📁 Estrutura de Pastas do Repositório

```text
/ (Raiz do Projeto)
│── backend_python/       # Backend FastAPI (Python) para produção local e nuvem
│   ├── main.py           # Endpoints REST e lógica de e-mail / assinaturas
│   ├── database.py       # Conexão ORM SQLAlchemy (SQLite / PostgreSQL)
│   ├── models.py         # Tabelas de Policiais, Bens, Cautelas e Movimentações
│   ├── schemas.py        # Validação de dados (Pydantic)
│   ├── seed_db.py        # Script para importar dados iniciais
│   ├── requirements.txt  # Dependências Python
│   └── .env.example      # Exemplo de variáveis de ambiente do backend
│
│── src/                  # Frontend Web & Mobile (React + Vite + Tailwind)
│   ├── pages/            # Páginas (Cautelas, Policiais, Armaria, Relatórios)
│   ├── components/       # Componentes reutilizáveis
│   └── services/         # Serviços de API e comunicação HTTP
│
│── server.ts             # Backend de testes rápido (Node.js/Express)
│── serverDb.ts           # Banco simulado de testes local (db.json)
│── DEPLOYMENT_GUIDE.md   # Este guia
│── MOBILE_SETUP.md       # Guia específico para Android e iOS
└── GITHUB_EXPORT.md      # Instruções de exportação para o GitHub
```

---

## 1. 🐍 Execução Local do Backend em Python (FastAPI)

### Passo 1: Instalar o Python e criar um ambiente virtual
```bash
# Navegar até a pasta do backend
cd backend_python

# Criar o ambiente virtual (venv)
python -m venv venv

# Ativar o ambiente virtual:
# No Windows (Command Prompt):
venv\Scripts\activate
# No Linux / macOS:
source venv/bin/activate
```

### Passo 2: Instalar as dependências do Python
```bash
pip install -r requirements.txt
```

### Passo 3: Configurar as Variáveis de Ambiente
Crie um arquivo `.env` na pasta `backend_python/`:
```env
DATABASE_URL=sqlite:///./sga_database.db
HOST=0.0.0.0
PORT=8000
DEBUG=True
```

### Passo 4: Criar as Tabelas e Semeá-las com Dados Iniciais
```bash
python seed_db.py
```

### Passo 5: Iniciar o Servidor FastAPI
```bash
python main.py
# Ou usando Uvicorn diretamente:
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
> O backend estará rodando em: `http://localhost:8000`
> A documentação Swagger interativa das rotas estará disponível em: `http://localhost:8000/docs`

---

## 2. 💻 Execução Local do Frontend (React)

Em um novo terminal (na raiz do projeto):

```bash
# 1. Instalar as dependências do Node.js
npm install

# 2. Iniciar o servidor de desenvolvimento do Frontend
npm run dev
```
> O frontend estará rodando em: `http://localhost:3000` ou `http://localhost:5173`

---

## 3. 🌐 Implantação do Servidor Web (Nuvem / Docker / VPS)

### Opção A: Implantação com Docker (Recomendado)
Crie um arquivo `Dockerfile.backend` na pasta `backend_python/`:

```dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Opção B: PostgreSQL para Banco de Dados de Produção
Para conectar o Python a um banco de dados PostgreSQL profissional:
1. Altere a variável `DATABASE_URL` no `.env`:
   ```env
   DATABASE_URL=postgresql://usuario:senha@localhost:5432/sga_db
   ```
2. Execute `python seed_db.py` para criar todas as tabelas automaticamente no PostgreSQL.

---

## 4. 📱 Aplicativo Móvel (Android & iOS)

Consulte o documento dedicado [`MOBILE_SETUP.md`](./MOBILE_SETUP.md) para instruções detalhadas de como compilar o APK Android ou o projeto Xcode para iOS usando **Capacitor**.
