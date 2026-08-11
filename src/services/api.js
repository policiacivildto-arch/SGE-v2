export const apiService = {
  async getList(resource, params) {
    const query = params ? `?${params.toString()}` : '';
    const res = await fetch(`/api/${resource}${query}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ao buscar lista de ${resource}`);
    }
    return res.json();
  },

  async get(path) {
    const res = await fetch(`/api/${path}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ao buscar ${path}`);
    }
    return res.json();
  },

  async create(resource, payload) {
    const res = await fetch(`/api/${resource}`, {
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
    const urlPath = id ? `${resource}/${id}` : resource;
    const res = await fetch(`/api/${urlPath}`, {
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
    const urlPath = id ? `${resource}/${id}` : resource;
    const res = await fetch(`/api/${urlPath}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Erro ao remover ${urlPath}`);
    }
    return true;
  },

  async patch(path, payload) {
    const res = await fetch(`/api/${path}`, {
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
    const res = await fetch(`/api/${path}${query}`);
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
