const ACCESS_TOKEN_KEY = 'sga_access_token';
const REFRESH_TOKEN_KEY = 'sga_refresh_token';

let unauthorizedHandler = null;
let refreshPromise = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function setTokens(access, refresh) {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function hasTokens() {
  return Boolean(getAccessToken());
}

// Os routers do DRF exigem barra final. Sem isso, o Django responde
// com redirect 301 pra versão com barra — que o fetch segue trocando
// POST/PATCH/DELETE por GET (comportamento padrão de redirect no
// browser), descartando a operação silenciosamente. Então toda URL
// de recurso precisa terminar em '/' antes da query string.
function withTrailingSlash(path) {
  return path.endsWith('/') ? path : `${path}/`;
}

async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = await res.json();
        // SIMPLE_JWT tem ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION
        // ligados (backend_django/config/settings.py) — o refresh usado
        // acima já foi invalidado no backend e a resposta traz um novo
        // em `data.refresh`. Guardar o `refresh` antigo aqui derruba o
        // usuário no próximo refresh (token já na blacklist).
        setTokens(data.access, data.refresh);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Faz o fetch com o Authorization header; em 401, tenta renovar o
// access token uma vez e repete a chamada original antes de desistir.
async function authFetch(url, options = {}, { isRetry = false } = {}) {
  const token = getAccessToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 && !isRetry && getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return authFetch(url, options, { isRetry: true });
    }
  }

  if (res.status === 401) {
    clearTokens();
    if (unauthorizedHandler) unauthorizedHandler();
  }

  return res;
}

export const apiService = {
  hasTokens,
  setTokens,
  clearTokens,
  getRefreshToken,

  async getList(resource, params) {
    const query = params ? `?${params.toString()}` : '';
    const res = await authFetch(`/api/${withTrailingSlash(resource)}${query}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ao buscar lista de ${resource}`);
    }
    return res.json();
  },

  async get(path) {
    const res = await authFetch(`/api/${withTrailingSlash(path)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ao buscar ${path}`);
    }
    return res.json();
  },

  async create(resource, payload) {
    const res = await authFetch(`/api/${withTrailingSlash(resource)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ao criar ${resource}`);
    }
    return res.json();
  },

  async update(resource, id, payload) {
    // If id is provided as separate argument, use resource/id, else resource represents the path
    const urlPath = withTrailingSlash(id ? `${resource}/${id}` : resource);
    const res = await authFetch(`/api/${urlPath}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ao atualizar ${urlPath}`);
    }
    return res.json();
  },

  async remove(resource, id) {
    const urlPath = withTrailingSlash(id ? `${resource}/${id}` : resource);
    const res = await authFetch(`/api/${urlPath}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ao remover ${urlPath}`);
    }
    return true;
  },

  async patch(path, payload) {
    const res = await authFetch(`/api/${withTrailingSlash(path)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ao atualizar ${path}`);
    }
    return res.json();
  },

  async download(path, filename, params) {
    const query = params ? `?${params.toString()}` : '';
    const res = await authFetch(`/api/${withTrailingSlash(path)}${query}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ao baixar arquivo de ${path}`);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
};
