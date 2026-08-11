import { apiService } from './api';

export async function getMenuOptions(grupo) {
  try {
    const data = await apiService.getList('opcoes-menu', new URLSearchParams({ grupo, ativo: 'true' }));
    const list = data?.results || data || [];
    return list.map((item) => ({
      ...item,
      value: item.valor,
      label: item.rotulo,
    }));
  } catch (err) {
    console.error(`Erro ao buscar opções de menu para o grupo ${grupo}:`, err);
    return [];
  }
}
