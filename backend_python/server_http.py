import os
import json
import uuid
import re
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

DB_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "db.json")

def load_db():
    if not os.path.exists(DB_FILE):
        return {}
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print("Erro ao carregar db.json:", e)
        return {}

def save_db(data):
    try:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("Erro ao salvar db.json:", e)

class PythonBackendHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def _send_json(self, status, payload):
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    def _read_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 0:
            body = self.rfile.read(content_length)
            try:
                return json.loads(body.decode("utf-8"))
            except Exception:
                return {}
        return {}

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/api/health":
            return self._send_json(200, {
                "status": "ok",
                "backend": "Python HTTP Server (SGA)",
                "timestamp": datetime.utcnow().isoformat()
            })

        db = load_db()

        if path == "/api/cautelas/next-number":
            cautelas = db.get("cautelas", [])
            numbers = []
            current_year = datetime.now().year
            for c in cautelas:
                num_str = c.get("numero_cautela", "")
                if "/" in num_str:
                    try:
                        n = int(num_str.split("/")[0])
                        numbers.append(n)
                    except ValueError:
                        pass
            next_num = max(numbers, default=0) + 1
            return self._send_json(200, {"next_number": f"{next_num:04d}/{current_year}"})

        # Match collection routes: /api/{collection}
        m = re.match(r"^/api/([a-zA-Z0-9_\-]+)$", path)
        if m:
            collection = m.group(1)
            if collection in db:
                items = db[collection]
                # Handle search/filter if query string exists
                q = query.get("q", [None])[0]
                if q and isinstance(items, list):
                    q_lower = q.lower()
                    filtered = []
                    for item in items:
                        if isinstance(item, dict) and any(q_lower in str(v).lower() for v in item.values()):
                            filtered.append(item)
                    return self._send_json(200, filtered)
                return self._send_json(200, items)
            else:
                return self._send_json(200, [])

        # Match item detail routes: /api/{collection}/{id}
        m_item = re.match(r"^/api/([a-zA-Z0-9_\-]+)/([a-zA-Z0-9_\-]+)$", path)
        if m_item:
            collection, item_id = m_item.groups()
            if collection in db and isinstance(db[collection], list):
                for item in db[collection]:
                    if isinstance(item, dict) and str(item.get("id")) == str(item_id):
                        return self._send_json(200, item)
                return self._send_json(404, {"error": "Item não encontrado"})

        return self._send_json(404, {"error": "Rota não encontrada"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_body()
        db = load_db()

        # Custom actions: /api/cautelas/:id/devolver
        m_dev = re.match(r"^/api/cautelas/([a-zA-Z0-9_\-]+)/devolver$", path)
        if m_dev:
            cautela_id = m_dev.group(1)
            cautelas = db.get("cautelas", [])
            found = None
            for c in cautelas:
                if str(c.get("id")) == str(cautela_id):
                    found = c
                    break
            if not found:
                return self._send_json(404, {"error": "Cautela não encontrada"})
            
            found["status"] = "Devolvido"
            found["data_devolucao"] = datetime.now().isoformat()
            found["observacoes_devolucao"] = body.get("observacoes", "")
            save_db(db)
            return self._send_json(200, found)

        # Match collection routes: /api/{collection}
        m = re.match(r"^/api/([a-zA-Z0-9_\-]+)$", path)
        if m:
            collection = m.group(1)
            if collection not in db or not isinstance(db[collection], list):
                db[collection] = []
            
            new_item = dict(body)
            if "id" not in new_item:
                new_item["id"] = f"{collection[:3]}-{uuid.uuid4().hex[:8]}"
            now_iso = datetime.now().isoformat()
            new_item["criado_em"] = now_iso
            new_item["atualizado_em"] = now_iso

            db[collection].append(new_item)
            save_db(db)
            return self._send_json(201, new_item)

        return self._send_json(404, {"error": "Rota não encontrada"})

    def do_PATCH(self):
        self.do_PUT()

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_body()
        db = load_db()

        m_item = re.match(r"^/api/([a-zA-Z0-9_\-]+)/([a-zA-Z0-9_\-]+)$", path)
        if m_item:
            collection, item_id = m_item.groups()
            if collection in db and isinstance(db[collection], list):
                for item in db[collection]:
                    if isinstance(item, dict) and str(item.get("id")) == str(item_id):
                        item.update(body)
                        item["atualizado_em"] = datetime.now().isoformat()
                        save_db(db)
                        return self._send_json(200, item)
                return self._send_json(404, {"error": "Item não encontrado"})

        return self._send_json(404, {"error": "Rota não encontrada"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        db = load_db()

        m_item = re.match(r"^/api/([a-zA-Z0-9_\-]+)/([a-zA-Z0-9_\-]+)$", path)
        if m_item:
            collection, item_id = m_item.groups()
            if collection in db and isinstance(db[collection], list):
                original_len = len(db[collection])
                db[collection] = [x for x in db[collection] if str(x.get("id")) != str(item_id)]
                if len(db[collection]) < original_len:
                    save_db(db)
                    return self._send_json(200, {"success": True, "message": "Item removido"})
                return self._send_json(404, {"error": "Item não encontrado"})

        return self._send_json(404, {"error": "Rota não encontrada"})

def run(port=None):
    if port is None:
        port = int(os.environ.get("PYTHON_PORT", "8008"))
    server_address = ("0.0.0.0", port)
    httpd = HTTPServer(server_address, PythonBackendHandler)
    print(f"🐍 Python Backend Server rodando na porta {port}...")
    httpd.serve_forever()

if __name__ == "__main__":
    run()
