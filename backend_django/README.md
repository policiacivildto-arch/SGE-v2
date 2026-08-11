# 🐍 SGA - Backend Python / Django REST Framework
**Polícia Civil do Estado do Ceará • DTO (Departamento Técnico Operacional)**

Este repositório contém a API backend completa do **SGA (Sistema de Gestão de Armaria e Material Bélico)** convertida para **Python 3.10+** e **Django 4.2+ / Django Rest Framework**.

---

## 🚀 Como Executar Localmente

### Pré-requisitos
* Python 3.10+
* Virtualenv (`python3 -m venv venv`)

### Passos de Instalação:
1. Navegue até este diretório:
   ```bash
   cd backend_django
   ```

2. Crie e ative um ambiente virtual:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # Linux/macOS
   # ou no Windows: venv\Scripts\activate
   ```

3. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```

4. Execute as migrações do banco de dados (SQLite ou PostgreSQL):
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

5. Crie um superusuário para acessar o painel administrativo do Django (`http://localhost:8000/admin`):
   ```bash
   python manage.py createsuperuser
   ```

6. Inicie o servidor de desenvolvimento:
   ```bash
   python manage.py runserver 0.0.0.0:8000
   ```

---

## 🐳 Executando com Docker Compose

Caso prefira rodar com **Docker** e **PostgreSQL**:
```bash
docker-compose up --build
```
A API estará acessível em `http://localhost:8000/api/`.

---

## 📌 Endpoints Principais

* `GET /api/health` - Verificação de status
* `GET/POST /api/policiais/` - Gestão de policiais com validação de e-mail `@pc.ce.gov.br`
* `GET/POST /api/itens/` ou `material-belico/` ou `bens/` - Gestão de inventário e estoque
* `GET/POST /api/cautelas/` - Emissão e controle de cautelas
* `POST /api/cautelas/<id>/reenviar-email/` - Reenvio do e-mail de confirmação digital
* `GET /api/cautelas/confirmar-email?token=...` - Endpoint público de confirmação via link
* `GET/POST /api/servicos/` - Ordens de serviço e manutenção
* `GET/POST /api/lotacoes/` - Mapeamento de departamentos e delegacias
* `GET/POST /api/fornecedores/` - Cadastro de fornecedores
