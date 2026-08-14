import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";

// Backend de negócio real é o Django (backend_django/) — este processo
// só serve o build estático do React e faz proxy de /api/* pro Django.
// Toda a lógica que existia aqui (CRUD, máquina de estados de Cautela,
// e-mail, PDF/XLSX) foi portada durante a Fase 5 (cutover) — ver
// PRD_BACKEND_DJANGO.md, seções 8 e 12.

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.use(
    "/api",
    createProxyMiddleware({
      target: process.env.DJANGO_BACKEND_URL || "http://backend:8000",
      changeOrigin: true,
      // app.use("/api", ...) remove o prefixo /api de req.url antes de
      // chegar aqui — precisa devolver, já que as rotas Django também
      // vivem sob /api/.
      pathRewrite: (path) => `/api${path}`,
      on: {
        // express.json() (acima) já consumiu o stream do corpo da
        // requisição — sem isso, POST/PUT/PATCH ficam pendurados
        // esperando um corpo que nunca chega no destino.
        proxyReq: fixRequestBody,
      },
    })
  );

  // --- Vite Middleware and Static File Serving ---

  if (process.env.NODE_ENV !== "production") {
    console.log("Iniciando Vite em modo de desenvolvimento...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Servindo arquivos estáticos em modo de produção...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SGA Frontend] Servidor rodando na porta http://localhost:${PORT}`);
  });
}

startServer();
