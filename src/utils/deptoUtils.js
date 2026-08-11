/* Department and Unit matching utility helpers */

export const DEFAULT_DEPTOS_CONFIG = {
  'Assessoria de Controle Interno': { sigla: 'ASCOI', resp: 'Não Informado' },
  'Assessoria de Comunicação': { sigla: 'ASCOM', resp: 'Não Informado' },
  'Assessoria de Segurança Institucional': { sigla: 'ASI', resp: 'Não Informado' },
  'Assessoria ao Sistema de Justiça': { sigla: 'ASJ', resp: 'Não Informado' },
  'Assessoria Jurídica': { sigla: 'ASJUR', resp: 'Não Informado' },
  'Controladoria Geral de Disciplina': { sigla: 'CGD', resp: 'Não Informado' },
  'Coordenadoria de Saúde do Policial Civil': { sigla: 'CO-SAÚDE', resp: 'Não Informado' },
  'Coordenadoria de Administração e Finanças': { sigla: 'COAFI', resp: 'Não Informado' },
  'Coordenadoria de Desenvolvimento Institucional e Planejamento': { sigla: 'CODIP', resp: 'Não Informado' },
  'Coordenadoria de Gestão de Pessoas': { sigla: 'COGEP', resp: 'Não Informado' },
  'Coordenadoria de Logística': { sigla: 'COLOG', resp: 'Dr. Roberto Medeiros' },
  'Coordenadoria de Plantões': { sigla: 'COPLAN', resp: 'Não Informado' },
  'Coordenadoria de Operações e Recursos Especiais': { sigla: 'CORE', resp: 'Dr. Antônio Carlos' },
  'Corregedoria-Geral de Polícia Civil': { sigla: 'CORREGEDORIA', resp: 'Não Informado' },
  'Coordenadoria de Tecnologia da Informação e Comunicação': { sigla: 'COTIC', resp: 'Não Informado' },
  'Departamento de Combate a Crimes contra o Patrimônio': { sigla: 'DEPATRI', resp: 'Não Informado' },
  'Departamento de Homicídios e Proteção à Pessoa': { sigla: 'DHPP', resp: 'Dra. Eliana Sousa' },
  'Departamento de Homicídios e Proteção à Pessoa da RMF': { sigla: 'DH-RMF', resp: 'Não Informado' },
  'Departamento de Inteligência Policial': { sigla: 'DIP', resp: 'Dr. Fábio Facó' },
  'Departamento de Polícia da Capital': { sigla: 'DPC', resp: 'Dr. Danilo Bezerra' },
  'Departamento de Polícia Metropolitana': { sigla: 'DPM', resp: 'Dr. Hugo Alencar' },
  'Departamento de Polícia do Interior Norte': { sigla: 'DPI NORTE', resp: 'Dr. Marcos Aurélio' },
  'Departamento de Polícia do Interior Sul': { sigla: 'DPI SUL', resp: 'Dra. Patrícia Aragão' },
  'Departamento Técnico Operacional': { sigla: 'DTO', resp: 'Dr. Carlos Henrique Silva' },
  'Departamento de Repressão às Ações Criminosas Organizadas': { sigla: 'DRACO', resp: 'Não Informado' },
  'Departamento de Combate ao Tráfico de Drogas': { sigla: 'DENARC', resp: 'Não Informado' },
  'Departamento de Proteção aos Grupos Vulneráveis': { sigla: 'DPGV', resp: 'Não Informado' }
};

export function normalizeStr(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getSavedDeptosConfig() {
  try {
    const saved = localStorage.getItem('sga_deptos_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    // fallback
  }
  return DEFAULT_DEPTOS_CONFIG;
}

export function getSavedDeptosList() {
  const config = getSavedDeptosConfig();
  return Object.keys(config);
}

export function getDeptoSigla(deptoName) {
  if (!deptoName) return '';
  const upper = String(deptoName).toUpperCase();
  if (upper.includes('CAPITAL') || upper === 'DPC') return 'DPC';
  if (upper.includes('METROPOLITANA') || upper === 'DPM') return 'DPM';
  if (upper.includes('INTERIOR NORTE') || upper.includes('DPI NORTE')) return 'DPI Norte';
  if (upper.includes('INTERIOR SUL') || upper.includes('DPI SUL')) return 'DPI Sul';
  if (upper.includes('TECNICO') || upper.includes('TÉCNICO') || upper === 'DTO') return 'DTO';
  if (upper.includes('INTELIGENCIA') || upper.includes('INTELIGÊNCIA') || upper === 'DIP') return 'DIP';
  if (upper.includes('HOMICIDIOS') || upper.includes('HOMICÍDIOS') || upper === 'DHPP') return 'DHPP';
  if (upper.includes('LOGISTICA') || upper.includes('LOGÍSTICA') || upper === 'COLOG') return 'COLOG';
  if (upper.includes('RECURSOS ESPECIAIS') || upper === 'CORE') return 'CORE';

  const saved = getSavedDeptosConfig();
  if (saved[deptoName] && saved[deptoName].sigla) {
    return saved[deptoName].sigla;
  }

  return upper.replace(/[^A-Z]/g, '') || upper;
}

export function matchDeptoFlex(itemDepto, filterDepto) {
  if (!filterDepto || filterDepto === 'Todos' || filterDepto === 'Todas') return true;
  if (!itemDepto) return false;

  const normItem = normalizeStr(itemDepto);
  const normFilter = normalizeStr(filterDepto);

  if (normItem === normFilter) return true;
  if (normItem.includes(normFilter) || normFilter.includes(normItem)) return true;

  const siglaItem = getDeptoSigla(itemDepto);
  const siglaFilter = getDeptoSigla(filterDepto);
  if (siglaItem && siglaFilter && siglaItem.toLowerCase() === siglaFilter.toLowerCase()) return true;

  return false;
}

export function buildLotacaoToDeptoMap(lotacoesList = []) {
  const map = new Map();
  lotacoesList.forEach(l => {
    if (l) {
      const name = l.nome || l.lotacao || l.unidade;
      const depto = l.depto || l.departamento;
      if (name && depto) {
        map.set(normalizeStr(name), depto);
      }
    }
  });
  return map;
}
