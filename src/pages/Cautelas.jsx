import React, { useEffect, useMemo, useState } from 'react';
import { apiService } from '../services/api';
import Modal from '../components/Modal';
import SignaturePad from '../components/SignaturePad';
import { DEPARTAMENTOS_PADRAO } from '../constants/organizacao';
import { getMenuOptions } from '../services/menuOptions';
import { getSavedDeptosList, matchDeptoFlex } from '../utils/deptoUtils';

const formatLocalDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    if (dateStr.includes('-') && !dateStr.includes('T')) {
      const parts = dateStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    const dateWithTime = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
    return new Date(dateWithTime).toLocaleDateString('pt-BR');
  } catch (e) {
    return dateStr;
  }
};

/* eslint-disable react/prop-types */

const BAIXA_MOTIVO_OPTIONS = [
  'Devolvido',
  'Apreendida',
  'Destruida',
  'Em Reparo',
  'Furtada',
  'Inservivel',
  'Perdida',
  'Recolhida',
  'Ressarcida',
  'Roubada',
];

function mapMotivoToStatus(motivo) {
  if (motivo === 'Devolvido') return 'Disponivel';
  return motivo || 'Disponivel';
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const formatMatricula = (val) => {
  if (val === undefined || val === null) return '';
  const valStr = String(val);
  const digits = valStr.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 7) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}-${digits.slice(6, 7)}-${digits.slice(7)}`;
};

function Cautelas() {
  const [cautelas, setCautelas] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Filter States for Cautelas tab
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptoFilter, setDeptoFilter] = useState('');
  const [lotacaoFilter, setLotacaoFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredCautelas = useMemo(() => {
    return cautelas.filter(c => {
      // 1. Text Search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const numMatch = String(c.numero || '').toLowerCase().includes(q);
        const polMatch = String(c.policial_nome || '').toLowerCase().includes(q);
        const delMatch = String(c.delegado_nome || '').toLowerCase().includes(q);
        const matMatch = String(c.matricula || c.delegado_matricula || '').toLowerCase().includes(q);
        const lotMatch = String(c.lotacao || '').toLowerCase().includes(q);
        const depMatch = String(c.depto || '').toLowerCase().includes(q);
        const itemMatch = String(c.item_desc || c.item || '').toLowerCase().includes(q);
        const serieMatch = String(c.serie || c.numero_serie || '').toLowerCase().includes(q);
        const patMatch = String(c.patrimonio || '').toLowerCase().includes(q);

        if (!numMatch && !polMatch && !delMatch && !matMatch && !lotMatch && !depMatch && !itemMatch && !serieMatch && !patMatch) {
          return false;
        }
      }

      // 2. Status
      if (statusFilter) {
        if (statusFilter === 'Ativa') {
          if (c.status !== 'Ativa' && c.status !== 'Em Uso') return false;
        } else if (statusFilter === 'Pendente') {
          if (c.status !== 'Pendente' && c.status !== 'Pendente de Assinatura') return false;
        } else if (statusFilter === 'PendenteDev') {
          if (c.status !== 'Pendente (Devolução)') return false;
        } else if (statusFilter === 'Baixada') {
          if (c.status !== 'Baixada' && c.status !== 'Devolvido' && c.status !== 'Devolvida') return false;
        }
      }

      // 3. Depto
      if (deptoFilter) {
        if (String(c.depto || '').toLowerCase() !== String(deptoFilter).toLowerCase()) return false;
      }

      // 4. Lotacao
      if (lotacaoFilter) {
        if (String(c.lotacao || '').toLowerCase() !== String(lotacaoFilter).toLowerCase()) return false;
      }

      // 5. Date From
      if (dateFrom) {
        const cDate = String(c.data_saida || '').substring(0, 10);
        if (cDate < dateFrom) return false;
      }

      // 6. Date To
      if (dateTo) {
        const cDate = String(c.data_saida || '').substring(0, 10);
        if (cDate > dateTo) return false;
      }

      return true;
    });
  }, [cautelas, searchTerm, statusFilter, deptoFilter, lotacaoFilter, dateFrom, dateTo]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, deptoFilter, lotacaoFilter, dateFrom, dateTo]);

  const totalPages = Math.ceil(filteredCautelas.length / itemsPerPage) || 1;
  const paginatedCautelas = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCautelas.slice(start, start + itemsPerPage);
  }, [filteredCautelas, currentPage]);
  const [policiais, setPoliciais] = useState([]);
  const [departamentosMenu, setDepartamentosMenu] = useState([]);
  const [departamentosBase, setDepartamentosBase] = useState([]);
  const [lotacoesBase, setLotacoesBase] = useState([]);
  const [armasDisponiveis, setArmasDisponiveis] = useState([]);
  const [armasByItemId, setArmasByItemId] = useState({});
  const [armasBySerial, setArmasBySerial] = useState({});
  const [bens, setBens] = useState([]);
  const [bensBySerial, setBensBySerial] = useState({});
  const [itens, setItens] = useState([]);
  const [itensTodos, setItensTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBaixaModalOpen, setIsBaixaModalOpen] = useState(false);
  const [cautelaBaixa, setCautelaBaixa] = useState(null);

  // States for viewing Cautela Details modal without PDF
  const [selectedCautelaDetails, setSelectedCautelaDetails] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const handleViewDetails = (cautela) => {
    setSelectedCautelaDetails(cautela);
    setIsDetailModalOpen(true);
  };

  // States for police confirmation modal & serial suggestions
  const [showConfirmLotacaoModal, setShowConfirmLotacaoModal] = useState(false);
  const [pendingPolicial, setPendingPolicial] = useState(null);
  const [lastConfirmedMatricula, setLastConfirmedMatricula] = useState('');
  const [sugestoesSeries, setSugestoesSeries] = useState([]);
  const [serieSelecionada, setSerieSelecionada] = useState(null);
  const [showConfirmDuplicateModal, setShowConfirmDuplicateModal] = useState(false);
  const [similarActiveCautela, setSimilarActiveCautela] = useState(null);
  const [showExpiringAlertModal, setShowExpiringAlertModal] = useState(false);
  const [expiringAlertItems, setExpiringAlertItems] = useState([]);
  // States for Digital Signature Modal
  const [isAssinarModalOpen, setIsAssinarModalOpen] = useState(false);
  const [cautelaParaAssinar, setCautelaParaAssinar] = useState(null);
  const [assinaturaCapturada, setAssinaturaCapturada] = useState('');

  const [baixaForm, setBaixaForm] = useState({
    data_dev: new Date().toISOString().slice(0, 10),
    condicao_dev: 'Devolvido',
    status_item: 'Disponivel',
    motivo_recolhimento: '',
    nup: '',
    numero_io_bo: '',
    numero_serie_reparo: '',
    obs_dev: '',
    assinatura_dev: '',
  });
  const [form, setForm] = useState({
    numero: '',
    data_saida: '',
    data_prev: '',
    matricula: '',
    policial_nome: '',
    email_policial: '',
    depto: '',
    lotacao: '',
    categoria: '',
    item: '',
    numero_serie: '',
    serie_patrimonio: '',
    qtd: 1,
    qtd_carregadores: 2,
    obs: '',
    policial_id: '',
    delegado_id: '',
    delegado_nome: '',
    delegado_matricula: '',
    assinatura_digital: '',
  });

  const [sendingEmail, setSendingEmail] = useState(false);

  const handleReenviarEmail = async (cautelaObj) => {
    try {
      setSendingEmail(true);
      const targetEmail = cautelaObj.email_policial || cautelaObj.email || '';
      const res = await apiService.create(`cautelas/${cautelaObj.id}/reenviar-email`, { email: targetEmail });
      alert(`✅ E-mail de confirmação enviado com sucesso para ${res.email_info?.email || targetEmail || 'o policial'}!`);
      await loadAll();
    } catch (err) {
      alert(err.message || 'Falha ao enviar e-mail de confirmação.');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleConfirmarTokenEmail = async (tokenVal, cautelaId) => {
    try {
      await apiService.create('cautelas/confirmar-token', { token: tokenVal, id: cautelaId });
      alert('✅ Cautela confirmada com sucesso! Assinatura digital gerada no sistema.');
      setIsAssinarModalOpen(false);
      setIsDetailModalOpen(false);
      await loadAll();
    } catch (err) {
      alert(err.message || 'Falha ao confirmar assinatura via e-mail.');
    }
  };

  const [selectedGroupKey, setSelectedGroupKey] = useState('');
  const [selectedTamanho, setSelectedTamanho] = useState('');
  const [selectedSexo, setSelectedSexo] = useState('');
  const [selectedCargo, setSelectedCargo] = useState('');

  const getFallbackNextNumber = (rows) => {
    const year = new Date().getFullYear();
    const prefix = `CAU-${year}-`;
    const max = (rows || []).reduce((acc, row) => {
      const numero = String(row?.numero || '');
      if (!numero.startsWith(prefix)) return acc;
      const seq = Number(numero.slice(prefix.length));
      return Number.isFinite(seq) ? Math.max(acc, seq) : acc;
    }, 0);
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  };

  const normalizeSerialInput = (value) => {
    return String(value || '').replace(/\s+/g, '').toUpperCase();
  };

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [cautelasData, policiaisData, departamentosData, lotacoesData, itensData, armasData, bensData] = await Promise.all([
        apiService.getList('cautelas', new URLSearchParams({ page_size: '500', ordering: '-data_saida' })),
        apiService.getList('policiais', new URLSearchParams({ page_size: '500', ordering: 'nome' })),
        apiService.getList('departamentos', new URLSearchParams({ page_size: '500', ordering: 'nome' })),
        apiService.getList('lotacoes', new URLSearchParams({ page_size: '500', ordering: 'depto,nome' })),
        apiService.getList('itens', new URLSearchParams({ page_size: '500', ordering: 'descricao' })),
        apiService.getList('armas', new URLSearchParams({ page_size: '1000' })),
        apiService.getList('bens', new URLSearchParams({ page_size: '2000' })),
      ]);
      const cautelasRows = cautelasData.results || [];
      const armasRows = armasData.results || [];
      const bensRows = bensData.results || [];
      setCautelas(cautelasRows);
      setPoliciais(policiaisData.results || []);
      setDepartamentosBase(departamentosData.results || []);
      setLotacoesBase(lotacoesData.results || []);
      const allItens = itensData.results || [];
      setItensTodos(allItens);
      setItens(allItens.filter((item) => Number(item.qtd_disp || 0) > 0));
      setArmasDisponiveis(armasRows);
      setBens(bensRows);

      const armasMap = {};
      const armasSerialMap = {};
      armasRows.forEach((arma) => {
        if (arma?.item_id) {
          armasMap[String(arma.item_id)] = arma;
        } else if (arma?.item) {
          armasMap[String(arma.item)] = arma;
        }
        const numeroSerie = normalizeText(arma?.numero_serie);
        if (numeroSerie) {
          armasSerialMap[numeroSerie] = arma;
        }
      });
      setArmasByItemId(armasMap);
      setArmasBySerial(armasSerialMap);

      const bensSerialMap = {};
      bensRows.forEach((bem) => {
        const numS = normalizeText(bem?.serie);
        if (numS) {
          bensSerialMap[numS] = bem;
        }
      });
      setBensBySerial(bensSerialMap);

      let nextNumber = getFallbackNextNumber(cautelasRows);
      try {
        const nextNumberData = await apiService.getList('cautelas/next-number');
        if (nextNumberData?.numero) {
          nextNumber = nextNumberData.numero;
        }
      } catch {
        // Mantem fallback local caso endpoint dedicado esteja indisponivel.
      }

      setForm((prev) => ({
        ...prev,
        numero: nextNumber || prev.numero,
        data_saida: prev.data_saida || new Date().toLocaleDateString('sv-SE'),
      }));
    } catch (err) {
      setError(err.message || 'Falha ao carregar cautelas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const loadMenus = async () => {
      try {
        const departamentosData = await getMenuOptions('departamento');
        setDepartamentosMenu(departamentosData);
      } catch {
        // fallback para listas locais
      }
    };

    loadMenus();
  }, []);

  const departamentos = useMemo(() => {
    const map = new Map();

    getSavedDeptosList().forEach((deptoName) => {
      if (deptoName) {
        map.set(deptoName, { valor: deptoName, rotulo: deptoName });
      }
    });

    if (departamentosMenu.length > 0) {
      departamentosMenu.forEach((opt) => {
        const valor = opt.valor || opt.nome || (typeof opt === 'string' ? opt : '');
        const rotulo = opt.rotulo || opt.label || opt.nome || opt.valor || (typeof opt === 'string' ? opt : '');
        if (valor) {
          map.set(valor, { valor, rotulo });
        }
      });
    }

    departamentosBase.forEach((d) => {
      if (d.nome) {
        const rotulo = d.sigla || d.nome;
        map.set(d.nome, { valor: d.nome, rotulo });
      }
    });

    policiais.forEach((p) => {
      if (p.depto && !map.has(p.depto)) {
        map.set(p.depto, { valor: p.depto, rotulo: p.depto });
      }
    });

    lotacoesBase.forEach((l) => {
      if (l.depto && !map.has(l.depto)) {
        map.set(l.depto, { valor: l.depto, rotulo: l.depto });
      }
    });

    cautelas.forEach((c) => {
      if (c.depto && !map.has(c.depto)) {
        map.set(c.depto, { valor: c.depto, rotulo: c.depto });
      }
    });

    if (map.size === 0) {
      DEPARTAMENTOS_PADRAO.forEach((depto) => {
        if (depto) {
          map.set(depto, { valor: depto, rotulo: depto });
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }, [departamentosMenu, departamentosBase, policiais, lotacoesBase, cautelas]);

  const lotacoes = useMemo(() => {
    if (!form.depto) return [];
    const set = new Set(
      [
        ...policiais.filter((p) => matchDeptoFlex(p.depto, form.depto)).map((p) => p.lotacao).filter(Boolean),
        ...lotacoesBase.filter((l) => matchDeptoFlex(l.depto || l.departamento, form.depto)).map((l) => l.nome || l.lotacao).filter(Boolean),
      ],
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }, [policiais, lotacoesBase, form.depto]);

  const isDelegado = (p) => {
    if (!p) return false;
    const cargoNorm = normalizeText(p.cargo);
    const nomeNorm = normalizeText(p.nome);
    return (
      cargoNorm.includes('delegad') ||
      cargoNorm === 'dpc' ||
      nomeNorm.includes('delegad') ||
      nomeNorm.startsWith('del ') ||
      nomeNorm.startsWith('dr ') ||
      nomeNorm.startsWith('dra ')
    );
  };

  const delegadosOpcoes = useMemo(() => {
    const daUnidade = policiais.filter((p) => {
      const matchUnit = !form.depto || matchDeptoFlex(p.depto, form.depto);
      const matchLot = !form.lotacao || normalizeText(p.lotacao) === normalizeText(form.lotacao);
      return isDelegado(p) && (matchLot || matchUnit);
    });

    if (daUnidade.length > 0) return daUnidade;
    return policiais.filter((p) => isDelegado(p));
  }, [policiais, form.depto, form.lotacao]);

  const categorias = useMemo(() => {
    const set = new Set(itensTodos.map((item) => item.categoria).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }, [itensTodos]);

  const isCategoryEligibleForGrouping = (categoria) => {
    const cat = String(categoria || '').trim().toLowerCase();
    return cat.includes('uniforme') || cat.includes('colete') || cat.includes('equipamento');
  };

  const getGroupKey = (item) => {
    if (!item) return '';
    const cat = String(item.categoria || '').trim().toLowerCase();
    const tipo = String(item.tipo || '').trim().toUpperCase();
    const marca = String(item.marca || '').trim().toUpperCase();
    const nivel = String(item.nivel || '').trim().toUpperCase();

    if (cat.includes('colete')) {
      return `COLETE|${marca}|${nivel}`;
    }
    if (cat.includes('uniforme')) {
      return `UNIFORME|${tipo}|${marca}`;
    }
    if (cat.includes('equipamento') && tipo.includes('DISTINTIVO')) {
      return `DISTINTIVO|${tipo}|${marca}`;
    }
    return `ITEM|${item.id}`;
  };

  const getGroupDisplayName = (groupKey, itemsInGroup) => {
    const parts = groupKey.split('|');
    const totalQty = itemsInGroup.reduce((sum, item) => sum + Number(item.qtd_disp || 0), 0);
    
    if (parts[0] === 'COLETE') {
      return `COLETE ${parts[1]} ${parts[2]} (Saldo Total: ${totalQty})`;
    }
    if (parts[0] === 'UNIFORME') {
      return `${parts[1]} ${parts[2]} (Saldo Total: ${totalQty})`;
    }
    if (parts[0] === 'DISTINTIVO') {
      return `DISTINTIVO ${parts[1]} (Saldo Total: ${totalQty})`;
    }
    const item = itemsInGroup[0];
    return `${item?.descricao || 'Sem descrição'} (Saldo: ${item?.qtd_disp || 0})`;
  };

  const groupedItensList = useMemo(() => {
    if (!form.categoria) return [];
    
    const categoryItems = itensTodos.filter((item) => 
      item.categoria === form.categoria && 
      (Number(item.qtd_disp || 0) > 0 || String(item.id) === String(form.item))
    );

    // Group them by groupKey
    const groupsMap = {};
    categoryItems.forEach((item) => {
      const key = getGroupKey(item);
      if (!groupsMap[key]) {
        groupsMap[key] = [];
      }
      groupsMap[key].push(item);
    });

    return Object.keys(groupsMap).map((key) => {
      const items = groupsMap[key];
      return {
        key,
        displayName: getGroupDisplayName(key, items),
        items,
      };
    });
  }, [itensTodos, form.categoria, form.item]);

  const selectedGroupVariations = useMemo(() => {
    if (!selectedGroupKey) return { tamanhos: [], sexos: [], cargos: [] };
    const currentGroup = groupedItensList.find(g => g.key === selectedGroupKey);
    if (!currentGroup) return { tamanhos: [], sexos: [], cargos: [] };

    const items = currentGroup.items;
    const tamanhos = Array.from(new Set(items.map(i => i.tamanho).filter(Boolean))).sort();
    const sexos = Array.from(new Set(items.map(i => i.sexo).filter(Boolean))).sort();
    const cargos = Array.from(new Set(items.map(i => i.cargo).filter(Boolean))).sort();

    return { tamanhos, sexos, cargos };
  }, [groupedItensList, selectedGroupKey]);

  // Automatically reset states when category changes
  useEffect(() => {
    setSelectedGroupKey('');
    setSelectedTamanho('');
    setSelectedSexo('');
    setSelectedCargo('');
  }, [form.categoria]);

  // Auto-select variations if there is only 1 option available
  useEffect(() => {
    if (selectedGroupVariations.tamanhos.length === 1) {
      setSelectedTamanho(selectedGroupVariations.tamanhos[0]);
    } else {
      setSelectedTamanho('');
    }
    if (selectedGroupVariations.sexos.length === 1) {
      setSelectedSexo(selectedGroupVariations.sexos[0]);
    } else {
      setSelectedSexo('');
    }
    if (selectedGroupVariations.cargos.length === 1) {
      setSelectedCargo(selectedGroupVariations.cargos[0]);
    } else {
      setSelectedCargo('');
    }
  }, [selectedGroupVariations]);

  // Dynamically match the item based on chosen variants
  useEffect(() => {
    if (!isCategoryEligibleForGrouping(form.categoria) || !selectedGroupKey) {
      return;
    }
    
    const currentGroup = groupedItensList.find(g => g.key === selectedGroupKey);
    if (!currentGroup) {
      setForm(prev => ({ ...prev, item: '' }));
      return;
    }

    const match = currentGroup.items.find((item) => {
      const matchTam = !selectedTamanho || String(item.tamanho || '') === selectedTamanho;
      const matchSexo = !selectedSexo || String(item.sexo || '') === selectedSexo;
      const matchCargo = !selectedCargo || String(item.cargo || '') === selectedCargo;
      return matchTam && matchSexo && matchCargo;
    });

    if (match) {
      setForm(prev => ({ ...prev, item: String(match.id) }));
    } else {
      setForm(prev => ({ ...prev, item: '' }));
    }
  }, [selectedGroupKey, selectedTamanho, selectedSexo, selectedCargo, groupedItensList, form.categoria]);

  // Synchronize when the modal opens initially with an existing item
  useEffect(() => {
    if (isModalOpen && form.item && itensTodos.length > 0) {
      const itemObj = itensTodos.find(i => String(i.id) === String(form.item));
      if (itemObj && isCategoryEligibleForGrouping(itemObj.categoria)) {
        const key = getGroupKey(itemObj);
        setSelectedGroupKey(key);
        setSelectedTamanho(itemObj.tamanho || '');
        setSelectedSexo(itemObj.sexo || '');
        setSelectedCargo(itemObj.cargo || '');
      }
    }
  }, [isModalOpen, form.item, itensTodos]);

  const itensDaCategoria = useMemo(() => {
    if (!form.categoria) return [];
    return itensTodos.filter((item) => 
      item.categoria === form.categoria && 
      (Number(item.qtd_disp || 0) > 0 || String(item.id) === String(form.item))
    );
  }, [itensTodos, form.categoria, form.item]);

  const selectedItem = useMemo(() => {
    return itensTodos.find((item) => String(item.id) === String(form.item));
  }, [itensTodos, form.item]);

  const selectedArma = useMemo(() => {
    // 1. Se tiver uma série selecionada explícita por busca
    if (serieSelecionada) {
      if (serieSelecionada.id?.startsWith('arma-')) {
        const armaId = serieSelecionada.id.replace('arma-', '');
        const found = armasDisponiveis.find((a) => String(a.id) === String(armaId));
        if (found) return found;
      }
      if (serieSelecionada.id?.startsWith('bem-')) {
        const bemId = serieSelecionada.id.replace('bem-', '');
        const found = bens.find((b) => String(b.id) === String(bemId));
        if (found) {
          return {
            id: found.id,
            numero_serie: found.serie,
            marca: selectedItem?.marca || '',
            modelo: selectedItem?.descricao || '',
            calibre: selectedItem?.calibre || '',
            item_id: found.item_id,
          };
        }
      }
    }

    // 2. Se não tiver série selecionada mas tiver um form.numero_serie preenchido
    if (form.numero_serie) {
      const normalized = normalizeText(form.numero_serie);
      const exactArma = armasDisponiveis.find((a) => normalizeText(a.numero_serie) === normalized);
      if (exactArma) return exactArma;

      const exactBem = bens.find((b) => normalizeText(b.serie) === normalized);
      if (exactBem) {
        return {
          id: exactBem.id,
          numero_serie: exactBem.serie,
          marca: selectedItem?.marca || '',
          modelo: selectedItem?.descricao || '',
          calibre: selectedItem?.calibre || '',
          item_id: exactBem.item_id,
        };
      }
    }

    // 3. Fallback: primeira arma associada ao item selecionado
    if (!selectedItem?.id) return null;
    const armasDesteItem = armasDisponiveis.filter((a) => String(a.item_id || a.item) === String(selectedItem.id));
    if (armasDesteItem.length > 0) return armasDesteItem[0];

    return null;
  }, [armasDisponiveis, bens, selectedItem, serieSelecionada, form.numero_serie]);

  const isItemUniforme = useMemo(() => {
    if (!selectedItem?.categoria) return false;
    return String(selectedItem.categoria).trim().toLowerCase() === 'uniformes';
  }, [selectedItem]);

  const isCategoriaArmas = useMemo(() => {
    return normalizeText(selectedItem?.categoria) === 'armas';
  }, [selectedItem]);

  const itemDetails = useMemo(() => {
    if (!selectedItem) {
      return {
        marca: '—',
        modelo: '—',
        calibre: '—',
        serie: '—',
      };
    }

    const isMunicoes = String(selectedItem.categoria).trim().toLowerCase() === 'municoes' || String(selectedItem.categoria).trim().toLowerCase() === 'munições';

    return {
      marca: selectedArma?.marca || selectedItem.marca || '—',
      modelo: selectedArma?.modelo || selectedItem.modelo || '—',
      calibre: selectedArma?.calibre || selectedItem.calibre || (isMunicoes ? selectedItem.calibre : '—'),
      serie: isItemUniforme || isMunicoes ? 'Não se aplica' : (selectedArma?.numero_serie || selectedItem.serie || '—'),
    };
  }, [selectedItem, selectedArma, isItemUniforme, isCategoriaArmas]);

  const isCautelaPessoal = useMemo(() => {
    if (!isCategoriaArmas) return true;
    const tipo = normalizeText(selectedArma?.tipo);
    if (!tipo) {
      const descricao = normalizeText(selectedItem?.descricao);
      if (descricao.includes('pistola') || descricao.includes('revolver')) {
        return true;
      }
    }
    return tipo === 'pistola' || tipo === 'revolver';
  }, [isCategoriaArmas, selectedArma, selectedItem]);

  const isCautelaUnidade = isCategoriaArmas && !isCautelaPessoal;

  const tomboPlaceholder = useMemo(() => {
    if (isItemUniforme) return 'Não se aplica para uniformes';
    if (isCategoriaArmas) return 'Preenchido automaticamente';
    return 'Não se aplica para esta categoria';
  }, [isCategoriaArmas, isItemUniforme]);

  const findArmaBySerial = (value) => {
    const normalizedSerial = normalizeText(value);
    if (!normalizedSerial) return null;

    const exactMatch = armasBySerial[normalizedSerial];
    if (exactMatch) return exactMatch;

    if (normalizedSerial.length < 3) return null;

    const prefixMatches = armasDisponiveis.filter((arma) => normalizeText(arma?.numero_serie).startsWith(normalizedSerial));
    if (prefixMatches.length === 1) return prefixMatches[0];

    const includesMatches = armasDisponiveis.filter((arma) => normalizeText(arma?.numero_serie).includes(normalizedSerial));
    if (includesMatches.length === 1) return includesMatches[0];

    return null;
  };

  const findItemBySerial = (value) => {
    const normalizedSerial = normalizeText(value);
    if (!normalizedSerial) return null;

    // 1. Exact match in bensBySerial
    const exactBem = bensBySerial[normalizedSerial];
    if (exactBem) {
      const foundItem = itensTodos.find((item) => String(item.id) === String(exactBem.item_id));
      if (foundItem) return foundItem;
    }

    // 2. Fallback check on itensTodos.serie itself
    const exactItem = itensTodos.find((item) => normalizeText(item.serie) === normalizedSerial);
    if (exactItem) return exactItem;

    if (normalizedSerial.length < 3) return null;

    // 3. Prefix match in bens
    const prefixBens = bens.filter((bem) => normalizeText(bem?.serie).startsWith(normalizedSerial));
    if (prefixBens.length === 1) {
      const foundItem = itensTodos.find((item) => String(item.id) === String(prefixBens[0].item_id));
      if (foundItem) return foundItem;
    }

    // 4. Includes match in bens
    const includesBens = bens.filter((bem) => normalizeText(bem?.serie).includes(normalizedSerial));
    if (includesBens.length === 1) {
      const foundItem = itensTodos.find((item) => String(item.id) === String(includesBens[0].item_id));
      if (foundItem) return foundItem;
    }

    // 5. Prefix match in items
    const prefixItens = itensTodos.filter((item) => normalizeText(item.serie).startsWith(normalizedSerial));
    if (prefixItens.length === 1) return prefixItens[0];

    // 6. Includes match in items
    const includesItens = itensTodos.filter((item) => normalizeText(item.serie).includes(normalizedSerial));
    if (includesItens.length === 1) return includesItens[0];

    return null;
  };

  const handleNumeroSerieChange = (value) => {
    // Mantém o valor bruto que está sendo digitado no input do form
    setForm((prev) => ({
      ...prev,
      numero_serie: value,
    }));
    setSerieSelecionada(null);

    const normalized = normalizeText(value);
    if (!normalized) {
      setSugestoesSeries([]);
      // Se apagar a pesquisa, limpa também a categoria e o item localizados
      setForm((prev) => ({
        ...prev,
        categoria: '',
        item: '',
      }));
      return;
    }

    // Filtrar armas disponíveis
    const matchingArmas = armasDisponiveis.filter(arma => 
      normalizeText(arma?.numero_serie).includes(normalized)
    ).map(arma => {
      const parent = itensTodos.find(item => String(item.id) === String(arma.item_id || arma.item));
      return {
        id: `arma-${arma.id}`,
        numero_serie: arma.numero_serie,
        marca: arma.marca || parent?.marca || 'Pistola',
        modelo: arma.modelo || parent?.descricao || '',
        calibre: arma.calibre || parent?.calibre || '9mm',
        categoria: 'Armas',
        item_id: arma.item_id || arma.item,
        item_descricao: parent?.descricao || arma.modelo || ''
      };
    });

    // Filtrar bens individuais disponíveis
    const matchingBens = bens.filter(bem => 
      (bem?.status === 'Disponivel' || bem?.status === 'Disponível') &&
      normalizeText(bem?.serie).includes(normalized)
    ).map(bem => {
      const parent = itensTodos.find(item => String(item.id) === String(bem.item_id));
      return {
        id: `bem-${bem.id}`,
        numero_serie: bem.serie,
        marca: parent?.marca || '',
        modelo: parent?.descricao || '',
        calibre: parent?.calibre || '',
        categoria: parent?.categoria || 'Armas',
        item_id: bem.item_id,
        item_descricao: parent?.descricao || ''
      };
    });

    // Combina removendo duplicados
    const combined = [];
    const addedSerials = new Set();
    [...matchingArmas, ...matchingBens].forEach(item => {
      const norm = normalizeText(item.numero_serie);
      if (norm && !addedSerials.has(norm)) {
        addedSerials.add(norm);
        combined.push(item);
      }
    });

    setSugestoesSeries(combined.slice(0, 10));
  };

  useEffect(() => {
    const matricula = form.matricula.trim();
    if (matricula.length < 1) {
      setLastConfirmedMatricula('');
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const queryDigits = matricula.replace(/\D/g, '');
        let found = policiais.find((p) => {
          const pMat = String(p.matricula || '');
          return pMat === matricula || (queryDigits && pMat.replace(/\D/g, '') === queryDigits);
        });

        if (!found) {
          const response = await apiService.getList('policiais', new URLSearchParams({ search: matricula }));
          const results = response?.results || response || [];
          found = results.find((p) => {
            const pMat = String(p.matricula || '');
            return pMat === matricula || pMat.includes(matricula) || (queryDigits && pMat.replace(/\D/g, '').includes(queryDigits));
          });
        }
        if (!found) return;

        if (found.matricula === lastConfirmedMatricula) return;

        setForm((prev) => ({
          ...prev,
          policial_id: found.id,
          matricula: found.matricula,
          policial_nome: found.nome,
          email_policial: found.email || prev.email_policial || '',
          depto: found.depto,
          lotacao: found.lotacao,
        }));
        setPendingPolicial(found);
        setShowConfirmLotacaoModal(true);
        setLastConfirmedMatricula(found.matricula);
      } catch (err) {
        console.error('Erro ao buscar policial por matricula:', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [form.matricula, policiais, lastConfirmedMatricula]);

  useEffect(() => {
    if (!selectedItem) {
      setForm((prev) => ({
        ...prev,
        numero_serie: '',
        serie_patrimonio: '',
      }));
      setSerieSelecionada(null);
      return;
    }

    let seriePatrimonio = 'Não se aplica para esta categoria';
    if (isItemUniforme) {
      seriePatrimonio = 'Não se aplica para uniformes';
    } else if (isCategoriaArmas) {
      seriePatrimonio = selectedArma?.numero_serie || selectedItem.serie || selectedItem.patrimonio || '—';
    }

    setForm((prev) => {
      const updates = {
        ...prev,
        serie_patrimonio: seriePatrimonio,
      };
      if (isCategoriaArmas && !prev.numero_serie && selectedArma?.numero_serie) {
        updates.numero_serie = selectedArma.numero_serie;
      }
      if (selectedArma?.quantidade_carregadores !== undefined && selectedArma?.quantidade_carregadores !== null) {
        updates.qtd_carregadores = selectedArma.quantidade_carregadores;
      }
      return updates;
    });
  }, [selectedItem, selectedArma, isItemUniforme, isCategoriaArmas]);

  // Policial não é mais apagado automaticamente quando a cautela for classificada como de unidade

  const handleOpenCreateModal = async () => {
    setError('');
    let nextNumber = getFallbackNextNumber(cautelas);
    try {
      const nextNumberData = await apiService.getList('cautelas/next-number');
      if (nextNumberData?.numero) {
        nextNumber = nextNumberData.numero;
      }
    } catch (e) {
      console.warn('Erro ao obter próximo número de cautela do servidor:', e);
    }

    setForm({
      numero: nextNumber,
      data_saida: new Date().toLocaleDateString('sv-SE'),
      data_prev: '',
      matricula: '',
      policial_nome: '',
      depto: '',
      lotacao: '',
      categoria: '',
      item: '',
      numero_serie: '',
      serie_patrimonio: '',
      qtd: 1,
      obs: '',
      policial_id: '',
      delegado_id: '',
      delegado_nome: '',
      delegado_matricula: '',
    });
    setSerieSelecionada(null);
    setSugestoesSeries([]);
    setLastConfirmedMatricula('');
    setIsModalOpen(true);
  };

  const getDaysToExpiration = (dateStr) => {
    if (!dateStr) return null;
    try {
      let dt;
      if (typeof dateStr === 'string' && dateStr.includes('-') && !dateStr.includes('T')) {
        const parts = dateStr.split('-');
        dt = new Date(parts[0], parts[1] - 1, parts[2]);
      } else {
        dt = new Date(dateStr);
      }
      if (isNaN(dt.getTime())) return null;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return Math.ceil((dt - today) / (1000 * 60 * 60 * 24));
    } catch (e) {
      return null;
    }
  };

  const activePolicialExpiringItems = useMemo(() => {
    if (!form.policial_id && !form.matricula) return [];

    const activeOfficerCautelas = cautelas.filter(c => 
      (c.status === 'Ativa' || c.status === 'Em Uso') && 
      ((form.policial_id && String(c.policial_id) === String(form.policial_id)) || 
       (form.matricula && c.matricula && String(c.matricula) === String(form.matricula)))
    );

    const list = [];
    activeOfficerCautelas.forEach(c => {
      const serial = c.serie || c.numero_serie;
      const bem = serial ? (bensBySerial[serial] || bens.find(b => b.serie === serial || b.patrimonio === serial)) : null;
      const itemObj = itensTodos.find(i => String(i.id) === String(c.item_id || c.item));
      const expDate = bem?.dt_val || bem?.validade || bem?.data_validade || itemObj?.dt_val || itemObj?.validade || itemObj?.data_validade || c.dt_val;

      if (expDate) {
        const days = getDaysToExpiration(expDate);
        if (days !== null && days <= 180) {
          list.push({
            id: c.id,
            itemDesc: c.item_desc || itemObj?.descricao || 'Item em Cautela',
            serie: serial || '—',
            dt_val: expDate,
            days,
            source: 'Item em Cautela Ativa do Policial'
          });
        }
      }
    });

    return list;
  }, [form.policial_id, form.matricula, cautelas, bens, bensBySerial, itensTodos]);

  const handleCreate = async () => {
    await executeCreate(false, false);
  };

  const executeCreate = async (bypassDuplicateCheck = false, bypassExpirationCheck = false) => {
    if (!form.numero || !form.data_saida || !form.item) {
      setError('Preencha os campos obrigatórios da cautela.');
      return;
    }

    if (!form.depto || !form.lotacao) {
      setError('Departamento e lotação são obrigatórios.');
      return;
    }

    if (isCautelaPessoal && (!form.policial_id || !form.matricula || !form.policial_nome)) {
      setError('Para cautela pessoal, informe policial e matrícula.');
      return;
    }

    if (form.email_policial && !form.email_policial.trim().toLowerCase().endsWith('@pc.ce.gov.br')) {
      setError('⚠️ O e-mail do policial deve pertencer obrigatoriamente ao domínio institucional @pc.ce.gov.br.');
      return;
    }

    if (isCautelaUnidade && (!form.delegado_nome || !form.delegado_matricula)) {
      setError('Para armamentos em carga da unidade, selecione ou informe o Delegado da Unidade responsável pela assinatura.');
      return;
    }

    // 1. Verificação de número de série já cautelado ativamente ou pendente
    const normalizedSelectedSerial = normalizeText(form.numero_serie);
    if (normalizedSelectedSerial) {
      const alreadyActive = cautelas.find(c => 
        (c.status === "Ativa" || c.status === "Pendente") && 
        normalizeText(c.serie) === normalizedSelectedSerial
      );
      if (alreadyActive) {
        setError(`Atenção: O item com número de série "${form.numero_serie}" já possui cautela (${alreadyActive.status}) para ${alreadyActive.policial_nome || '—'}.`);
        return;
      }
    }

    // 2. Verificação de item semelhante já ativo para o mesmo policial (mesmo item ou mesma categoria)
    if (isCautelaPessoal && form.policial_id && form.item && !bypassDuplicateCheck) {
      const selectedItemObj = itensTodos.find(item => String(item.id) === String(form.item));
      if (selectedItemObj) {
        const activeSimilar = cautelas.find(c => 
          c.status === "Ativa" && 
          String(c.policial_id) === String(form.policial_id) && 
          (String(c.item_id || c.item) === String(selectedItemObj.id) || 
           String(c.categoria || '').toLowerCase() === String(selectedItemObj.categoria || '').toLowerCase())
        );
        if (activeSimilar) {
          setSimilarActiveCautela(activeSimilar);
          setShowConfirmDuplicateModal(true);
          return;
        }
      }
    }

    // 3. Verificação de proximidade de vencimento de itens do policial ou do item sendo cautelado (<= 180 dias / 6 meses)
    if (!bypassExpirationCheck) {
      const expiringList = [...activePolicialExpiringItems];

      // Verificação do novo item a ser cautelado agora
      if (form.item) {
        const selectedItemObj = itensTodos.find(item => String(item.id) === String(form.item));
        const serial = form.numero_serie;
        const bem = serial ? (bensBySerial[serial] || bens.find(b => b.serie === serial || b.patrimonio === serial)) : null;
        const newItemExpDate = bem?.dt_val || bem?.validade || bem?.data_validade || selectedItemObj?.dt_val || selectedItemObj?.validade || selectedItemObj?.data_validade;

        if (newItemExpDate) {
          const days = getDaysToExpiration(newItemExpDate);
          if (days !== null && days <= 180) {
            const alreadyInList = expiringList.some(x => x.itemDesc === (selectedItemObj?.descricao || 'Item Atual') && x.serie === (serial || '—'));
            if (!alreadyInList) {
              expiringList.push({
                itemDesc: selectedItemObj?.descricao || 'Item a ser Cautelado Agora',
                serie: serial || '—',
                dt_val: newItemExpDate,
                days,
                source: 'Item sendo Cautelado Agora'
              });
            }
          }
        }
      }

      if (expiringList.length > 0) {
        setExpiringAlertItems(expiringList);
        setShowExpiringAlertModal(true);
        return;
      }
    }

    try {
      setError('');
      const selectedCatLower = String(form.categoria || selectedItem?.categoria || '').toLowerCase().trim();
      const isArmasCategory = selectedCatLower.includes('arma');
      const armaTipoNorm = normalizeText(selectedArma?.tipo || selectedItem?.tipo || selectedItem?.descricao || '');
      const isRevolverOuEspingarda = armaTipoNorm.includes('revolver') || armaTipoNorm.includes('espingarda');
      const showCarregadores = isArmasCategory && !isRevolverOuEspingarda;

      const payload = {
        numero: form.numero,
        data_saida: form.data_saida,
        data_prev: form.data_prev || null,
        depto: form.depto,
        lotacao: form.lotacao,
        item: form.item,
        qtd: Number(form.qtd || 1),
        qtd_carregadores: showCarregadores ? Number(form.qtd_carregadores !== undefined && form.qtd_carregadores !== null ? form.qtd_carregadores : 2) : null,
        quantidade_carregadores: showCarregadores ? Number(form.qtd_carregadores !== undefined && form.qtd_carregadores !== null ? form.qtd_carregadores : 2) : null,
        obs: form.obs,
        numero_serie: form.numero_serie, // Envia o número de série específico
        serie: form.numero_serie,        // Envia também como serie
        is_cautela_unidade: isCautelaUnidade,
        delegado_id: isCautelaUnidade ? (form.delegado_id || null) : null,
        delegado_nome: isCautelaUnidade ? form.delegado_nome : null,
        delegado_matricula: isCautelaUnidade ? form.delegado_matricula : null,
        policial_nome: isCautelaUnidade ? `UNIDADE: ${form.lotacao || form.depto}` : form.policial_nome,
        email_policial: form.email_policial || '',
        matricula: isCautelaUnidade ? form.delegado_matricula : form.matricula,
        assinatura_digital: form.assinatura_digital || '',
      };
      if (!isCautelaUnidade && form.policial_id) {
        payload.policial_id = form.policial_id;
      }
      await apiService.create('cautelas', payload);
      setForm({
        numero: '',
        data_saida: new Date().toLocaleDateString('sv-SE'),
        data_prev: '',
        matricula: '',
        policial_nome: '',
        email_policial: '',
        depto: '',
        lotacao: '',
        categoria: '',
        item: '',
        numero_serie: '',
        serie_patrimonio: '',
        qtd: 1,
        qtd_carregadores: 2,
        obs: '',
        policial_id: '',
        delegado_id: '',
        delegado_nome: '',
        delegado_matricula: '',
        assinatura_digital: '',
      });
      setSerieSelecionada(null);
      setSugestoesSeries([]);
      setLastConfirmedMatricula('');
      setIsModalOpen(false);
      setShowConfirmDuplicateModal(false);
      setSimilarActiveCautela(null);
      await loadAll();
    } catch (err) {
      setError(err.message || 'Não foi possível registrar cautela.');
    }
  };

  const openBaixaModal = (cautela) => {
    setError('');
    setCautelaBaixa(cautela);
    setBaixaForm({
      data_dev: new Date().toLocaleDateString('sv-SE'),
      condicao_dev: 'Devolvido',
      status_item: 'Disponivel',
      motivo_recolhimento: '',
      nup: '',
      numero_io_bo: '',
      numero_serie_reparo: cautela?.serie || '',
      obs_dev: '',
    });
    setIsBaixaModalOpen(true);
  };

  const handleDevolver = async () => {
    try {
      if (!cautelaBaixa?.id) return;
      const motivoNorm = normalizeText(baixaForm.condicao_dev);

      if (motivoNorm === 'recolhida' && !baixaForm.motivo_recolhimento.trim()) {
        setError('Informe o motivo quando a baixa for Recolhida.');
        return;
      }

      if (motivoNorm === 'recolhida' && !baixaForm.nup.trim()) {
        setError('NUP é obrigatório quando a baixa for Recolhida.');
        return;
      }

      if (motivoNorm === 'apreendida' && !baixaForm.numero_io_bo.trim()) {
        setError('Informe o número do IO ou BO para baixa por Apreendida.');
        return;
      }

      if (motivoNorm === 'em reparo' && !baixaForm.numero_serie_reparo.trim()) {
        setError('Informe o número de série para baixa em reparo.');
        return;
      }

      await apiService.create(`cautelas/${cautelaBaixa.id}/devolver`, baixaForm);
      setIsBaixaModalOpen(false);
      setCautelaBaixa(null);
      await loadAll();
    } catch (err) {
      setError(err.message || 'Não foi possível devolver cautela.');
    }
  };

  const handleOpenAssinarModal = (cautela) => {
    setCautelaParaAssinar(cautela);
    setAssinaturaCapturada('');
    setIsAssinarModalOpen(true);
  };

  const handleConfirmarAssinatura = async () => {
    if (!cautelaParaAssinar) return;
    try {
      setError('');
      const isDev = cautelaParaAssinar?.status === 'Pendente (Devolução)';
      let res;
      if (assinaturaCapturada && assinaturaCapturada.length > 50) {
        res = await apiService.create(`cautelas/${cautelaParaAssinar.id}/assinar`, {
          assinatura_digital: assinaturaCapturada,
          tipo: isDev ? 'devolucao' : 'saida'
        });
      } else {
        // Fallback: Confirm via system digital signature token generator using cautela ID
        res = await apiService.create('cautelas/confirmar-token', {
          id: cautelaParaAssinar.id,
          token: isDev ? (cautelaParaAssinar.token_confirmacao_dev || cautelaParaAssinar.token_confirmacao) : cautelaParaAssinar.token_confirmacao
        });
      }

      const hashId = res.hash_assinatura || res.cautela?.hash_assinatura || res.cautela?.hash_assinatura_dev || ('SIG-2026-' + Date.now().toString(36).toUpperCase());
      const emailDestino = res.email_destino || cautelaParaAssinar.email_policial || cautelaParaAssinar.policial_email || 'o e-mail do policial';

      alert(`✅ Assinatura confirmada com sucesso!\n\n🆔 ID Único da Assinatura: ${hashId}\n📧 Um e-mail de comprovante com o ID único foi enviado para ${emailDestino} para serventia de prova.`);
      
      setIsAssinarModalOpen(false);
      setCautelaParaAssinar(null);
      setAssinaturaCapturada('');
      await loadAll();
    } catch (err) {
      alert(err.message || 'Falha ao salvar a assinatura digital.');
    }
  };

  const handleCancelar = async (id) => {
    try {
      await apiService.remove('cautelas', id);
      await loadAll();
    } catch (err) {
      setError(err.message || 'Não foi possível cancelar cautela.');
    }
  };

  const handleBaixarPdf = async (id, numero) => {
    try {
      await apiService.download(`cautelas/${id}/documento-pdf`, `${numero || 'cautela'}.pdf`);
    } catch (err) {
      setError(err.message || 'Não foi possível baixar o PDF da cautela.');
    }
  };

  return (
    <>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>📜 Controle Histórico de Cautelas</h1>
          <p>Gerenciamento de saída e atribuição de armamento de carga</p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenCreateModal}>➕ Registrar Nova Cautela</button>
      </div>

      {error && <div className="alert alert-danger show">{error}</div>}

      <Modal
        isOpen={isModalOpen}
        title="📜 Registrar Cautela Operacional"
        onClose={() => setIsModalOpen(false)}
        footer={(
          <>
            <button className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleCreate}>💾 Registrar Cautela</button>
          </>
        )}
      >
        {error && <div className="alert alert-danger show" style={{ marginBottom: '16px' }}>{error}</div>}
        <div className="card-title">Nº da Cautela</div>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="caut-numero">Nº da Cautela</label>
            <input id="caut-numero" value={form.numero} onChange={(e) => setForm((prev) => ({ ...prev, numero: e.target.value }))} />
          </div>
          <div className="form-group">
            <label htmlFor="caut-data">Data de Saída *</label>
            <input id="caut-data" type="date" value={form.data_saida} onChange={(e) => setForm((prev) => ({ ...prev, data_saida: e.target.value }))} />
          </div>
          <div className="form-group">
            <label htmlFor="caut-data-prev">Previsão de Devolução</label>
            <input id="caut-data-prev" type="date" value={form.data_prev} onChange={(e) => setForm((prev) => ({ ...prev, data_prev: e.target.value }))} />
          </div>
        </div>

        <div className="card-title mt-16">📦 Item Cautelado</div>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="caut-categoria">Categoria *</label>
            <select
              id="caut-categoria"
              value={form.categoria}
              onChange={(e) => setForm((prev) => ({ ...prev, categoria: e.target.value, item: '', serie_patrimonio: '' }))}
            >
              <option value="">Selecione...</option>
              {categorias.map((categoria, idx) => (
                <option key={`cat-${categoria}-${idx}`} value={categoria}>{categoria}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ position: 'relative' }}>
            <label htmlFor="caut-serie-busca">Nº de Série</label>
            <input
              id="caut-serie-busca"
              value={form.numero_serie}
              placeholder="Digite o número de série para localizar"
              onChange={(e) => handleNumeroSerieChange(e.target.value)}
              autoComplete="off"
            />
            {sugestoesSeries.length > 0 && !serieSelecionada && (
              <div style={{
                position: 'absolute',
                zIndex: 100,
                width: '100%',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e0',
                borderRadius: '4px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                maxHeight: '180px',
                overflowY: 'auto',
                marginTop: '4px',
                top: '100%'
              }}>
                {sugestoesSeries.map((sug) => (
                  <div
                    key={sug.id}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #edf2f7',
                      color: '#2d3748',
                      fontSize: '13px',
                      backgroundColor: '#ffffff',
                      transition: 'background-color 0.1s ease'
                    }}
                    onMouseDown={() => {
                      setForm((prev) => ({
                        ...prev,
                        numero_serie: sug.numero_serie,
                        categoria: sug.categoria,
                        item: String(sug.item_id)
                      }));
                      setSerieSelecionada(sug);
                      setSugestoesSeries([]);
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#f7fafc'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#ffffff'}
                  >
                    <strong>{sug.numero_serie}</strong> - <span style={{ textTransform: 'uppercase', color: '#3182ce', fontWeight: 'bold', fontSize: '10px' }}>{sug.categoria}</span> {sug.marca} {sug.modelo}
                  </div>
                ))}
              </div>
            )}
            {serieSelecionada && (
              <small style={{ color: '#2a9d8f', display: 'block', marginTop: '4px', fontWeight: '500' }}>
                ✓ Item localizado: {serieSelecionada.marca} {serieSelecionada.modelo} ({serieSelecionada.categoria})
              </small>
            )}
          </div>
          {isCategoryEligibleForGrouping(form.categoria) ? (
            <>
              <div className="form-group">
                <label htmlFor="caut-item-grouped">Item *</label>
                <select
                  id="caut-item-grouped"
                  value={selectedGroupKey}
                  onChange={(e) => {
                    setSelectedGroupKey(e.target.value);
                    setSelectedTamanho('');
                    setSelectedSexo('');
                    setSelectedCargo('');
                  }}
                  disabled={!form.categoria}
                >
                  <option value="">{form.categoria ? 'Selecione...' : 'Selecione a categoria primeiro'}</option>
                  {groupedItensList.map((g) => (
                    <option key={g.key} value={g.key}>{g.displayName}</option>
                  ))}
                </select>
              </div>

              {selectedGroupKey && (
                <>
                  {selectedGroupVariations.tamanhos.length > 0 && (
                    <div className="form-group">
                      <label htmlFor="caut-tamanho">Tamanho *</label>
                      <select
                        id="caut-tamanho"
                        value={selectedTamanho}
                        onChange={(e) => setSelectedTamanho(e.target.value)}
                      >
                        <option value="">Selecione o tamanho...</option>
                        {selectedGroupVariations.tamanhos.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedGroupVariations.sexos.length > 0 && (
                    <div className="form-group">
                      <label htmlFor="caut-sexo">Gênero / Sexo *</label>
                      <select
                        id="caut-sexo"
                        value={selectedSexo}
                        onChange={(e) => setSelectedSexo(e.target.value)}
                      >
                        <option value="">Selecione o sexo...</option>
                        {selectedGroupVariations.sexos.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedGroupVariations.cargos.length > 0 && (
                    <div className="form-group">
                      <label htmlFor="caut-cargo">Cargo *</label>
                      <select
                        id="caut-cargo"
                        value={selectedCargo}
                        onChange={(e) => setSelectedCargo(e.target.value)}
                      >
                        <option value="">Selecione o cargo...</option>
                        {selectedGroupVariations.cargos.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="form-group">
              <label htmlFor="caut-item">Item *</label>
              <select
                id="caut-item"
                value={form.item}
                onChange={(e) => setForm((prev) => ({ ...prev, item: e.target.value }))}
                disabled={!form.categoria}
              >
                <option value="">{form.categoria ? 'Selecione...' : 'Selecione a categoria primeiro'}</option>
                {itensDaCategoria.map((item) => (
                  <option key={item.id} value={item.id}>{item.descricao} (Saldo: {item.qtd_disp})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="card-title mt-16">
          {form.categoria && form.categoria.toLowerCase().includes('arma') ? '🔫 Dados da Arma' : '📋 Dados do Item'}
        </div>
        {(() => {
          const currentCatLower = String(form.categoria || selectedItem?.categoria || '').toLowerCase().trim();
          const isArmasCat = currentCatLower.includes('arma');
          const isColetesCat = currentCatLower.includes('colete');
          const isUniformesCat = currentCatLower.includes('uniforme');
          const isMunicoesCat = currentCatLower.includes('muniç') || currentCatLower.includes('munic');
          const isEquipamentosCat = currentCatLower.includes('equipamento');
          const isPecasCat = currentCatLower.includes('peça') || currentCatLower.includes('peca');

          const currentTipoLower = String(selectedItem?.tipo || '').toLowerCase().trim();
          const isDistintivoItem = isEquipamentosCat && (currentTipoLower === 'distintivo' || String(selectedItem?.descricao || '').toLowerCase().includes('distintivo'));
          const isRadioHTItem = isEquipamentosCat && (currentTipoLower.includes('rádio') || currentTipoLower.includes('radio') || currentTipoLower === 'ht');
          const isKitArrombamentoItem = isEquipamentosCat && (currentTipoLower.includes('kit') || currentTipoLower.includes('arrombamento'));

          const currentTipoNorm = normalizeText(selectedArma?.tipo || selectedItem?.tipo || selectedItem?.descricao || itemDetails?.modelo || '');
          const isRevolverOuEspingarda = currentTipoNorm.includes('revolver') || currentTipoNorm.includes('espingarda');
          const showQtdCarregadores = isArmasCat && !isRevolverOuEspingarda;

          // Calibre: show ONLY for Armas or Munições or if calibre is explicitly defined and not '—' AND not in categories without calibre
          const showCalibreField = (isArmasCat || isMunicoesCat || Boolean(selectedItem?.calibre && selectedItem.calibre !== '—')) && !isDistintivoItem && !isColetesCat && !isUniformesCat && !isPecasCat;

          // Modelo: show for Armas, Equipamentos (not Distintivo, not Kit), Peças, Uniformes with model/material
          const showModeloField = isArmasCat || (isEquipamentosCat && !isDistintivoItem && !isKitArrombamentoItem) || isPecasCat || (isUniformesCat && Boolean(selectedItem?.modelo && selectedItem.modelo !== 'Padrão'));

          // Série/Patrimônio: show for Armas, Coletes, Equipamentos, Peças (if applicable). Hide for Uniformes and Munições.
          const showSerieField = !isUniformesCat && !isMunicoesCat;

          // Marca: show for main categories
          const showMarcaField = isArmasCat || isColetesCat || isUniformesCat || isMunicoesCat || isEquipamentosCat || isPecasCat || Boolean(selectedItem?.marca);

          // Cargo: show for Distintivo or Uniformes/Items with cargo
          const showCargoField = isDistintivoItem || Boolean(selectedItem?.cargo || selectedCargo);

          // Nível: show for Coletes
          const showNivelField = isColetesCat || Boolean(selectedItem?.nivel);

          // Tamanho: show for Coletes, Uniformes
          const showTamanhoField = isColetesCat || isUniformesCat || Boolean(selectedItem?.tamanho || selectedTamanho);

          // Sexo: show for Coletes, Uniformes (when set)
          const showSexoField = isColetesCat || isUniformesCat || Boolean(selectedItem?.sexo || selectedSexo);

          // Subtipo / Tipo Munição: show for Munições
          const showSubtipoField = isMunicoesCat || Boolean(selectedItem?.subtipo);
          const showTipoMunicaoField = isMunicoesCat || Boolean(selectedItem?.tipo_municao);

          // Validade: show for Coletes, Munições (when set)
          const showValidadeField = (isColetesCat || isMunicoesCat) && Boolean(selectedItem?.dt_val);

          return (
            <div className="form-grid">
              {/* Nº de Série / Tombo Localizado */}
              {showSerieField && (
                <div className="form-group">
                  <label htmlFor="caut-serie">
                    {isArmasCat ? 'Nº de Série Localizado' : isColetesCat ? 'Nº de Série / Tombo Localizado' : 'Tombo / Nº de Série Localizado'}
                  </label>
                  <input
                    id="caut-serie"
                    value={itemDetails.serie}
                    placeholder={tomboPlaceholder}
                    disabled
                  />
                </div>
              )}

              {/* Marca */}
              {showMarcaField && (
                <div className="form-group">
                  <label htmlFor="caut-marca-item">Marca</label>
                  <input id="caut-marca-item" value={itemDetails.marca} disabled />
                </div>
              )}

              {/* Modelo */}
              {showModeloField && (
                <div className="form-group">
                  <label htmlFor="caut-modelo-item">
                    {isPecasCat ? 'Nomenclatura Técnica / Modelo' : 'Modelo'}
                  </label>
                  <input id="caut-modelo-item" value={selectedItem?.nomenclatura_tecnica || itemDetails.modelo} disabled />
                </div>
              )}

              {/* Calibre */}
              {showCalibreField && (
                <div className="form-group">
                  <label htmlFor="caut-calibre-item">Calibre</label>
                  <input id="caut-calibre-item" value={itemDetails.calibre} disabled />
                </div>
              )}

              {/* Cargo */}
              {showCargoField && (
                <div className="form-group">
                  <label htmlFor="caut-cargo-item">Cargo</label>
                  <input id="caut-cargo-item" value={selectedCargo || selectedItem?.cargo || '—'} disabled />
                </div>
              )}

              {/* Nível Balístico */}
              {showNivelField && (
                <div className="form-group">
                  <label htmlFor="caut-nivel-item">Nível Balístico</label>
                  <input id="caut-nivel-item" value={selectedItem?.nivel || '—'} disabled />
                </div>
              )}

              {/* Tamanho */}
              {showTamanhoField && (
                <div className="form-group">
                  <label htmlFor="caut-tamanho-item">Tamanho</label>
                  <input id="caut-tamanho-item" value={selectedTamanho || selectedItem?.tamanho || '—'} disabled />
                </div>
              )}

              {/* Sexo / Gênero */}
              {showSexoField && (
                <div className="form-group">
                  <label htmlFor="caut-sexo-item">Sexo / Gênero</label>
                  <input id="caut-sexo-item" value={selectedSexo || selectedItem?.sexo || '—'} disabled />
                </div>
              )}

              {/* Tipo de Munição */}
              {showTipoMunicaoField && (
                <div className="form-group">
                  <label htmlFor="caut-tipomun-item">Tipo de Munição</label>
                  <input id="caut-tipomun-item" value={selectedItem?.tipo_municao || 'Operacional'} disabled />
                </div>
              )}

              {/* Subtipo / Projétil */}
              {showSubtipoField && (
                <div className="form-group">
                  <label htmlFor="caut-subtipo-item">Subtipo / Projétil</label>
                  <input id="caut-subtipo-item" value={selectedItem?.subtipo || '—'} disabled />
                </div>
              )}

              {/* Validade */}
              {showValidadeField && (
                <div className="form-group">
                  <label htmlFor="caut-validade-item">Validade / Vencimento</label>
                  <input id="caut-validade-item" value={selectedItem?.dt_val ? new Date(selectedItem.dt_val).toLocaleDateString('pt-BR') : '—'} disabled />
                </div>
              )}

              {/* Specific Rádio HT Fields */}
              {isRadioHTItem && (
                <>
                  {selectedItem?.tipo_radio && (
                    <div className="form-group">
                      <label>Tipo de Rádio</label>
                      <input value={selectedItem.tipo_radio} disabled />
                    </div>
                  )}
                  {selectedItem?.terminal_iss && (
                    <div className="form-group">
                      <label>Terminal ISS</label>
                      <input value={selectedItem.terminal_iss} disabled />
                    </div>
                  )}
                  {selectedItem?.qtd_baterias && (
                    <div className="form-group">
                      <label>Qtd de Baterias</label>
                      <input value={selectedItem.qtd_baterias} disabled />
                    </div>
                  )}
                  {selectedItem?.prefixo_viatura && (
                    <div className="form-group">
                      <label>Prefixo Viatura</label>
                      <input value={selectedItem.prefixo_viatura} disabled />
                    </div>
                  )}
                </>
              )}

              {/* Specific Peças Fields */}
              {isPecasCat && (
                <>
                  {selectedItem?.id_peca && (
                    <div className="form-group">
                      <label>ID Peça</label>
                      <input value={selectedItem.id_peca} disabled />
                    </div>
                  )}
                  {selectedItem?.conjunto_funcional && (
                    <div className="form-group">
                      <label>Conjunto Funcional</label>
                      <input value={selectedItem.conjunto_funcional} disabled />
                    </div>
                  )}
                </>
              )}

              {/* Qtd. de Carregadores */}
              {showQtdCarregadores && (
                <div className="form-group">
                  <label htmlFor="caut-qtd-carregadores">Qtd. de Carregadores *</label>
                  <input
                    id="caut-qtd-carregadores"
                    type="number"
                    min="0"
                    max="20"
                    value={form.qtd_carregadores !== undefined && form.qtd_carregadores !== null ? form.qtd_carregadores : 2}
                    onChange={(e) => setForm((prev) => ({ ...prev, qtd_carregadores: Math.max(0, parseInt(e.target.value) || 0) }))}
                  />
                </div>
              )}

              {/* Quantidade * */}
              <div className="form-group">
                <label htmlFor="caut-qtd">Quantidade *</label>
                <input id="caut-qtd" type="number" min="1" value={form.qtd} onChange={(e) => setForm((prev) => ({ ...prev, qtd: e.target.value }))} />
              </div>

              {/* Disponível em Estoque */}
              <div className="form-group">
                <label htmlFor="caut-disponivel">Disponível em Estoque</label>
                <input id="caut-disponivel" value={selectedItem ? selectedItem.qtd_disp : '—'} disabled />
              </div>

              {/* Observações / Finalidade */}
              <div className="form-group full">
                <label htmlFor="caut-obs">Observações / Finalidade</label>
                <textarea
                  id="caut-obs"
                  placeholder="Descreva a finalidade ou observações relevantes..."
                  value={form.obs}
                  onChange={(e) => setForm((prev) => ({ ...prev, obs: e.target.value }))}
                />
              </div>
            </div>
          );
        })()}

        <div className="card-title mt-16">👮 Vínculo da Cautela</div>
        {isCautelaUnidade && (
          <div className="alert alert-info show" style={{ backgroundColor: '#ebf8ff', borderColor: '#3182ce', color: '#2b6cb0', marginBottom: '16px' }}>
            <strong>🏛️ Armamento em Carga da Unidade ({form.lotacao || form.depto || 'Unidade não selecionada'})</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', lineHeight: '1.4' }}>
              Esta arma (fuzil, espingarda, etc.) é registrada diretamente em <strong>nome e carga da UNIDADE</strong> e não no nome pessoal de um policial.
              Para fins de recebimento e assinatura do termo, informe o <strong>Delegado da Unidade</strong> como recebedor.
            </p>
          </div>
        )}
        <div className="form-grid">
          {!isCautelaUnidade ? (
            <>
              <div className="form-group">
                <label htmlFor="caut-matricula">Matrícula *</label>
                <input
                  id="caut-matricula"
                  placeholder="Ex.: 123.456-7-8"
                  value={form.matricula}
                  onChange={(e) => setForm((prev) => ({ ...prev, matricula: formatMatricula(e.target.value) }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="caut-policial-nome">Nome do Policial *</label>
                <input
                  id="caut-policial-nome"
                  placeholder="Nome completo"
                  value={form.policial_nome}
                  onChange={(e) => setForm((prev) => ({ ...prev, policial_nome: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="caut-email-policial">E-mail do Policial (para confirmação e assinatura digital) *</label>
                <input
                  id="caut-email-policial"
                  type="email"
                  placeholder="nome.sobrenome@pc.ce.gov.br"
                  value={form.email_policial || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, email_policial: e.target.value }))}
                />
                <span style={{ fontSize: '11px', color: '#166534', marginTop: '3px', display: 'block', fontWeight: 'bold' }}>
                  🔒 Somente e-mails institucionais do domínio @pc.ce.gov.br são permitidos.
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="caut-delegado-select">Delegado Recebedor da Unidade *</label>
                <select
                  id="caut-delegado-select"
                  value={form.delegado_id || ''}
                  onChange={(e) => {
                    const selId = e.target.value;
                    if (!selId) {
                      setForm((prev) => ({ ...prev, delegado_id: '', delegado_nome: '', delegado_matricula: '' }));
                      return;
                    }
                    const foundDel = policiais.find((p) => String(p.id) === String(selId));
                    if (foundDel) {
                      setForm((prev) => ({
                        ...prev,
                        delegado_id: foundDel.id,
                        delegado_nome: foundDel.nome,
                        delegado_matricula: foundDel.matricula,
                        depto: prev.depto || foundDel.depto || '',
                        lotacao: prev.lotacao || foundDel.lotacao || '',
                      }));
                    }
                  }}
                >
                  <option value="">{delegadosOpcoes.length > 0 ? 'Selecione o Delegado da Unidade...' : 'Nenhum delegado encontrado na unidade (preencha abaixo)'}</option>
                  {delegadosOpcoes.map((del) => (
                    <option key={`del-${del.id}`} value={del.id}>
                      {del.nome} (Matrícula: {del.matricula}) {del.lotacao ? `- ${del.lotacao}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="caut-delegado-nome">Nome do Delegado (Assinatura) *</label>
                <input
                  id="caut-delegado-nome"
                  placeholder="Ex.: Dr. João Silva"
                  value={form.delegado_nome || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, delegado_nome: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="caut-delegado-mat">Matrícula do Delegado *</label>
                <input
                  id="caut-delegado-mat"
                  placeholder="Ex.: 123.456-7"
                  value={form.delegado_matricula || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, delegado_matricula: formatMatricula(e.target.value) }))}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="caut-depto">Departamento / Região *</label>
            <select
              id="caut-depto"
              value={form.depto}
              onChange={(e) => setForm((prev) => ({ ...prev, depto: e.target.value, lotacao: '' }))}
            >
              <option value="">Selecione o departamento...</option>
              {departamentos.map((depto, idx) => (
                <option key={`dep-${depto.valor}-${idx}`} value={depto.valor}>{depto.rotulo}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="caut-lotacao">Delegacia / Lotação Vinculada *</label>
            <select
              id="caut-lotacao"
              value={form.lotacao}
              onChange={(e) => setForm((prev) => ({ ...prev, lotacao: e.target.value }))}
              disabled={!form.depto}
            >
              <option value="">{form.depto ? 'Selecione a delegacia...' : 'Selecione o departamento primeiro'}</option>
              {lotacoes.map((lotacao, idx) => (
                <option key={`lot-${lotacao}-${idx}`} value={lotacao}>{lotacao}</option>
              ))}
            </select>
          </div>
        </div>

        {activePolicialExpiringItems.length > 0 && (
          <div className="alert alert-warning show" style={{ backgroundColor: '#fffaf0', borderColor: '#dd6b20', color: '#9c4221', marginTop: '16px', padding: '12px 16px' }}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              ⚠️ Alerta de Proximidade de Vencimento do Policial
            </strong>
            <p style={{ margin: '4px 0 6px 0', fontSize: '13px' }}>
              Este policial possui <strong>{activePolicialExpiringItems.length} item(ns)</strong> sob sua cautela com prazo de vencimento em menos de 6 meses (ou vencidos):
            </p>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px' }}>
              {activePolicialExpiringItems.map((it, idx) => (
                <li key={idx} style={{ marginBottom: '2px' }}>
                  <strong>{it.itemDesc}</strong> {it.serie !== '—' ? `(Série: ${it.serie})` : ''} - Validade: <strong>{formatLocalDate(it.dt_val)}</strong>{' '}
                  {it.days < 0 ? (
                    <span style={{ color: '#e53e3e', fontWeight: 'bold' }}>(🔴 Vencido há {Math.abs(it.days)} dias)</span>
                  ) : (
                    <span style={{ color: '#dd6b20', fontWeight: 'bold' }}>(🟠 Vence em {it.days} dias)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card-title mt-16" style={{ marginTop: '16px' }}>📧 Assinatura e Confirmação por E-mail</div>
        <div style={{ background: '#f0f9ff', border: '1px solid #0284c7', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', color: '#0369a1', fontWeight: 'bold', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ✉️ Envio Automático de E-mail de Confirmação
          </div>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#334155', lineHeight: '1.5' }}>
            Ao salvar, um e-mail de confirmação com link individual será enviado para <strong>{form.email_policial || 'o policial'}</strong>.
            A cautela permanecerá com o status <strong style={{ color: '#d97706' }}>🟡 Pendente de Assinatura</strong> até o policial clicar no link do e-mail.
          </p>
          <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: 'bold' }}>
            ✓ Após a confirmação no e-mail pelo policial, a assinatura digital será gerada e anexada automaticamente à cautela.
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isBaixaModalOpen}
        title="Baixa da Cautela"
        onClose={() => setIsBaixaModalOpen(false)}
        footer={(
          <>
            <button className="btn btn-outline" onClick={() => setIsBaixaModalOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleDevolver}>Confirmar Baixa</button>
          </>
        )}
      >
        {error && <div className="alert alert-danger show" style={{ marginBottom: '16px' }}>{error}</div>}
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="baixa-data">Data da Baixa *</label>
            <input
              id="baixa-data"
              type="date"
              value={baixaForm.data_dev}
              onChange={(e) => setBaixaForm((prev) => ({ ...prev, data_dev: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="baixa-motivo">Motivo *</label>
            <select
              id="baixa-motivo"
              value={baixaForm.condicao_dev}
              onChange={(e) => {
                const motivo = e.target.value;
                setBaixaForm((prev) => ({
                  ...prev,
                  condicao_dev: motivo,
                  status_item: mapMotivoToStatus(motivo),
                }));
              }}
            >
              {BAIXA_MOTIVO_OPTIONS.map((motivo, idx) => (
                <option key={`mot-${motivo}-${idx}`} value={motivo}>{motivo}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="baixa-status">Status do Item</label>
            <input
              id="baixa-status"
              value={baixaForm.status_item}
              disabled
            />
          </div>
          {baixaForm.condicao_dev === 'Recolhida' && (
            <div className="form-group full">
              <label htmlFor="baixa-motivo-recolhimento">Motivo da Recolhida *</label>
              <input
                id="baixa-motivo-recolhimento"
                value={baixaForm.motivo_recolhimento}
                placeholder="Ex.: CID.F"
                onChange={(e) => setBaixaForm((prev) => ({ ...prev, motivo_recolhimento: e.target.value }))}
              />
            </div>
          )}
          {baixaForm.condicao_dev === 'Recolhida' && (
            <div className="form-group full">
              <label htmlFor="baixa-nup">NUP *</label>
              <input
                id="baixa-nup"
                value={baixaForm.nup}
                placeholder="Informe o NUP"
                onChange={(e) => setBaixaForm((prev) => ({ ...prev, nup: e.target.value }))}
              />
            </div>
          )}
          {baixaForm.condicao_dev === 'Apreendida' && (
            <div className="form-group full">
              <label htmlFor="baixa-io-bo">Número do IO ou BO *</label>
              <input
                id="baixa-io-bo"
                value={baixaForm.numero_io_bo}
                placeholder="Informe o número do IO ou BO"
                onChange={(e) => setBaixaForm((prev) => ({ ...prev, numero_io_bo: e.target.value }))}
              />
            </div>
          )}
          {baixaForm.condicao_dev === 'Em Reparo' && (
            <div className="form-group full">
              <label htmlFor="baixa-serie-reparo">Número de Série *</label>
              <input
                id="baixa-serie-reparo"
                value={baixaForm.numero_serie_reparo}
                placeholder="Informe o número de série da arma"
                onChange={(e) => setBaixaForm((prev) => ({ ...prev, numero_serie_reparo: e.target.value }))}
              />
            </div>
          )}
          <div className="form-group full">
            <label htmlFor="baixa-obs">Observações</label>
            <textarea
              id="baixa-obs"
              placeholder="Detalhes da baixa"
              value={baixaForm.obs_dev}
              onChange={(e) => setBaixaForm((prev) => ({ ...prev, obs_dev: e.target.value }))}
            />
          </div>
        </div>

        <div style={{ marginTop: '16px', background: '#ecfdf5', border: '1px solid #059669', borderRadius: '8px', padding: '14px' }}>
          <div style={{ fontSize: '13px', color: '#047857', fontWeight: 'bold', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📧 Confirmação e Assinatura de Devolução por E-mail
          </div>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#1e293b', lineHeight: '1.5' }}>
            Ao confirmar a baixa, um e-mail de confirmação será enviado automaticamente para o policial.
            A cautela ficará com o status <strong style={{ color: '#d97706' }}>🟣 Pendente (Devolução)</strong> até que o policial confirme no e-mail.
          </p>
          <div style={{ fontSize: '11px', color: '#047857', fontWeight: 'bold' }}>
            ✓ Após a confirmação no e-mail pelo policial, a devolução é finalizada e a assinatura digital de devolução é anexada.
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showConfirmLotacaoModal}
        title="Confirmar Lotação do Policial"
        onClose={() => setShowConfirmLotacaoModal(false)}
        footer={(
          <>
            <button 
              className="btn btn-outline" 
              onClick={() => {
                setForm((prev) => ({
                  ...prev,
                  depto: '',
                  lotacao: '',
                }));
                setShowConfirmLotacaoModal(false);
              }}
            >
              Não, alterar lotação
            </button>
            <button 
              className="btn btn-primary" 
              onClick={() => {
                setShowConfirmLotacaoModal(false);
              }}
            >
              Sim, permanece nesta lotação
            </button>
          </>
        )}
      >
        <div style={{ padding: '10px 0', fontSize: '15px', lineHeight: '1.6' }}>
          <p>
            O policial <strong>{pendingPolicial?.nome}</strong> (Matrícula: {pendingPolicial?.matricula}) está cadastrado na lotação:
          </p>
          <div style={{ margin: '15px 0', padding: '12px', borderLeft: '4px solid #3b82f6', backgroundColor: '#f3f4f6', borderRadius: '4px' }}>
            <strong>Departamento:</strong> {pendingPolicial?.depto}<br />
            <strong>Lotação:</strong> {pendingPolicial?.lotacao || 'Não especificada'}
          </div>
          <p>Ele permanece atuando nesta mesma lotação para esta cautela?</p>
        </div>
      </Modal>

      <Modal
        isOpen={showConfirmDuplicateModal}
        title="Alerta: Item Semelhante em Uso"
        onClose={() => {
          setShowConfirmDuplicateModal(false);
          setSimilarActiveCautela(null);
        }}
        footer={(
          <>
            <button 
              className="btn btn-outline" 
              onClick={() => {
                setShowConfirmDuplicateModal(false);
                setSimilarActiveCautela(null);
              }}
            >
              Cancelar Cautela
            </button>
            <button 
              className="btn btn-primary" 
              onClick={() => {
                executeCreate(true, false);
              }}
            >
              Sim, gerar outra cautela
            </button>
          </>
        )}
      >
        <div style={{ padding: '10px 0', fontSize: '15px', lineHeight: '1.6' }}>
          <p>
            O policial <strong>{form.policial_nome}</strong> (Matrícula: {form.matricula}) já possui um item semelhante (da mesma categoria <strong>{similarActiveCautela?.categoria}</strong>) ativo em uso:
          </p>
          <div style={{ margin: '15px 0', padding: '12px', borderLeft: '4px solid #ef4444', backgroundColor: '#fef2f2', borderRadius: '4px' }}>
            <strong>Item Cautelado:</strong> {similarActiveCautela?.item_desc}<br />
            <strong>Nº de Série:</strong> {similarActiveCautela?.serie || '—'}<br />
            <strong>Nº da Cautela:</strong> {similarActiveCautela?.numero}<br />
            <strong>Data da Cautela:</strong> {similarActiveCautela?.data_saida}
          </div>
          <p style={{ fontWeight: '500', color: '#111827' }}>
            Deseja confirmar e prosseguir com a geração de outra cautela para ele?
          </p>
        </div>
      </Modal>

      {/* Modal de Alerta de Proximidade de Vencimento de Item / Cautela */}
      <Modal
        isOpen={showExpiringAlertModal}
        title="⚠️ Alerta: Item Próximo ao Vencimento"
        onClose={() => setShowExpiringAlertModal(false)}
        footer={(
          <>
            <button 
              className="btn btn-outline" 
              onClick={() => setShowExpiringAlertModal(false)}
            >
              Cancelar Cautela
            </button>
            <button 
              className="btn btn-warning" 
              onClick={() => {
                setShowExpiringAlertModal(false);
                executeCreate(true, true);
              }}
              style={{ backgroundColor: '#dd6b20', borderColor: '#dd6b20', color: '#fff', fontWeight: 'bold' }}
            >
              ⚠️ Ciente! Prosseguir com Registro
            </button>
          </>
        )}
      >
        <div style={{ padding: '10px 0', fontSize: '14px', lineHeight: '1.6' }}>
          <div style={{ margin: '0 0 15px 0', padding: '12px', borderLeft: '4px solid #dd6b20', backgroundColor: '#fffaf0', borderRadius: '4px', color: '#7b341e' }}>
            <strong>Atenção ao Prazo de Validade!</strong> Foram identificados itens vinculados ao policial ou sendo cautelados com data de validade vencida ou a vencer nos próximos 6 meses (180 dias):
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '250px', overflowY: 'auto', border: '1px solid #feebc8', borderRadius: '6px' }}>
            <table className="table" style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', margin: 0 }}>
              <thead>
                <tr style={{ backgroundColor: '#feebc8', color: '#7b341e' }}>
                  <th style={{ padding: '8px' }}>Item</th>
                  <th style={{ padding: '8px' }}>Série / Ref</th>
                  <th style={{ padding: '8px' }}>Validade</th>
                  <th style={{ padding: '8px' }}>Situação</th>
                  <th style={{ padding: '8px' }}>Origem</th>
                </tr>
              </thead>
              <tbody>
                {expiringAlertItems.map((it, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #feebc8', backgroundColor: it.days < 0 ? '#fff5f5' : '#fffff0' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{it.itemDesc}</td>
                    <td style={{ padding: '8px' }}>{it.serie}</td>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{formatLocalDate(it.dt_val)}</td>
                    <td style={{ padding: '8px' }}>
                      {it.days < 0 ? (
                        <span style={{ color: '#e53e3e', fontWeight: 'bold' }}>🔴 Vencido ({Math.abs(it.days)}d atrás)</span>
                      ) : (
                        <span style={{ color: '#dd6b20', fontWeight: 'bold' }}>🟠 Vence em {it.days} dias</span>
                      )}
                    </td>
                    <td style={{ padding: '8px', fontSize: '11px', color: '#4a5568' }}>{it.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ marginTop: '14px', fontWeight: '500', color: '#2d3748' }}>
            Deseja estar ciente desses prazos de vencimento e prosseguir com a geração da nova cautela?
          </p>
        </div>
      </Modal>

      {/* Modal de Coleta / Inserção de Assinatura Digital */}
      <Modal
        isOpen={isAssinarModalOpen}
        title={`✍️ Coleta de Assinatura Digital - Documento ${cautelaParaAssinar?.numero || ''}`}
        onClose={() => {
          setIsAssinarModalOpen(false);
          setCautelaParaAssinar(null);
        }}
        footer={(
          <>
            <button className="btn btn-outline" onClick={() => {
              setIsAssinarModalOpen(false);
              setCautelaParaAssinar(null);
            }}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleConfirmarAssinatura}>
              Confirmar Assinatura Digital
            </button>
          </>
        )}
      >
        {cautelaParaAssinar && (
          <div>
            <div className="alert alert-info show" style={{ marginBottom: '16px', fontSize: '13px', backgroundColor: '#ebf8ff', borderColor: '#3182ce', color: '#2b6cb0' }}>
              <strong>Policial Recebedor:</strong> {cautelaParaAssinar.policial_nome || '—'} <br />
              <strong>Matrícula:</strong> {cautelaParaAssinar.matricula || '—'} | <strong>Item:</strong> {cautelaParaAssinar.item_desc || '—'} ({cautelaParaAssinar.serie || 's/n'}) <br />
              <strong>E-mail Registrado:</strong> {cautelaParaAssinar.email_policial || cautelaParaAssinar.email || 'Não informado'} <br />
              <strong>Operação:</strong> {cautelaParaAssinar.status === 'Pendente (Devolução)' ? 'Devolução de Material' : 'Retirada / Emissão de Cautela'}
            </div>

            {/* Drawing Canvas Signature Pad */}
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e0', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>
                  ✍️ Desenhar Assinatura Digital (Mouse ou Touch):
                </span>
                {assinaturaCapturada && (
                  <button 
                    type="button" 
                    className="btn btn-xs btn-outline" 
                    onClick={() => setAssinaturaCapturada('')}
                    style={{ fontSize: '11px', color: '#e53e3e', borderColor: '#feb2b2' }}
                  >
                    🗑️ Limpar Desenho
                  </button>
                )}
              </div>

              <div style={{ position: 'relative' }}>
                <canvas
                  id="canvas-signature-pad"
                  width={500}
                  height={130}
                  onMouseDown={(e) => {
                    const canvas = e.currentTarget;
                    const ctx = canvas.getContext('2d');
                    const rect = canvas.getBoundingClientRect();
                    canvas.isDrawing = true;
                    ctx.beginPath();
                    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                  }}
                  onMouseMove={(e) => {
                    const canvas = e.currentTarget;
                    if (!canvas.isDrawing) return;
                    const ctx = canvas.getContext('2d');
                    const rect = canvas.getBoundingClientRect();
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 2.5;
                    ctx.lineCap = 'round';
                    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                    ctx.stroke();
                  }}
                  onMouseUp={(e) => {
                    const canvas = e.currentTarget;
                    canvas.isDrawing = false;
                    setAssinaturaCapturada(canvas.toDataURL('image/png'));
                  }}
                  onMouseLeave={(e) => {
                    const canvas = e.currentTarget;
                    canvas.isDrawing = false;
                  }}
                  onTouchStart={(e) => {
                    const canvas = e.currentTarget;
                    const ctx = canvas.getContext('2d');
                    const rect = canvas.getBoundingClientRect();
                    canvas.isDrawing = true;
                    const touch = e.touches[0];
                    ctx.beginPath();
                    ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
                  }}
                  onTouchMove={(e) => {
                    const canvas = e.currentTarget;
                    if (!canvas.isDrawing) return;
                    const ctx = canvas.getContext('2d');
                    const rect = canvas.getBoundingClientRect();
                    const touch = e.touches[0];
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 2.5;
                    ctx.lineCap = 'round';
                    ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
                    ctx.stroke();
                  }}
                  onTouchEnd={(e) => {
                    const canvas = e.currentTarget;
                    canvas.isDrawing = false;
                    setAssinaturaCapturada(canvas.toDataURL('image/png'));
                  }}
                  style={{
                    width: '100%',
                    height: '130px',
                    background: '#ffffff',
                    border: '2px dashed #94a3b8',
                    borderRadius: '6px',
                    cursor: 'crosshair',
                    touchAction: 'none'
                  }}
                />
                {!assinaturaCapturada && (
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', color: '#a0aec0', fontSize: '12px', textAlign: 'center' }}>
                    ✍️ Desenhe a assinatura com o mouse ou o dedo aqui <br />
                    <span style={{ fontSize: '10px', color: '#cbd5e0' }}>(ou clique abaixo para confirmar via Token Oficial)</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: '#f0f9ff', border: '1px solid #7dd3fc', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', marginBottom: '6px' }}>
                📧 Confirmação e Assinatura por E-mail
              </div>
              <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#334155' }}>
                Você pode reenviar o e-mail com link de confirmação para o policial ou confirmar a assinatura diretamente abaixo:
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => handleReenviarEmail(cautelaParaAssinar)}
                  disabled={sendingEmail}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  📧 Reenviar E-mail de Confirmação
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-success"
                  onClick={() => handleConfirmarTokenEmail(
                    cautelaParaAssinar.status === 'Pendente (Devolução)' ? (cautelaParaAssinar.token_confirmacao_dev || cautelaParaAssinar.token_confirmacao) : cautelaParaAssinar.token_confirmacao,
                    cautelaParaAssinar.id
                  )}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  ⚡ Confirmar e Assinar por E-mail Agora
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Visualização de Detalhes da Cautela (sem abrir PDF) */}
      <Modal
        isOpen={isDetailModalOpen}
        title={`📋 Detalhes da Cautela - ${selectedCautelaDetails?.numero || ''}`}
        onClose={() => setIsDetailModalOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => selectedCautelaDetails && handleBaixarPdf(selectedCautelaDetails.id, selectedCautelaDetails.numero)}
              >
                📄 Baixar PDF
              </button>
              {selectedCautelaDetails && (selectedCautelaDetails.status === 'Pendente' || selectedCautelaDetails.status === 'Pendente de Assinatura' || selectedCautelaDetails.status === 'Pendente (Devolução)') && (
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={() => {
                    const target = selectedCautelaDetails;
                    setIsDetailModalOpen(false);
                    handleOpenAssinarModal(target);
                  }}
                  style={{ backgroundColor: '#d97706', borderColor: '#d97706', color: '#fff' }}
                >
                  ✍️ Coletar Assinatura Digital
                </button>
              )}
              {selectedCautelaDetails && (selectedCautelaDetails.status === 'Ativa' || selectedCautelaDetails.status === 'Pendente' || selectedCautelaDetails.status === 'Em Uso') && (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => {
                    const target = selectedCautelaDetails;
                    setIsDetailModalOpen(false);
                    openBaixaModal(target);
                  }}
                >
                  🔄 Devolver Item
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsDetailModalOpen(false)}
            >
              Fechar
            </button>
          </div>
        }
      >
        {selectedCautelaDetails && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px' }}>
            {/* Banner de Número e Status */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '12px 16px', 
              background: (selectedCautelaDetails.status === 'Ativa' || selectedCautelaDetails.status === 'Em Uso') ? '#fffaf0' : (selectedCautelaDetails.status?.includes('Pendente') ? '#fffbeb' : '#f0fff4'), 
              border: `1px solid ${(selectedCautelaDetails.status === 'Ativa' || selectedCautelaDetails.status === 'Em Uso') ? '#feebc8' : (selectedCautelaDetails.status?.includes('Pendente') ? '#fde68a' : '#c6f6d5')}`, 
              borderRadius: '8px' 
            }}>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#718096', fontWeight: 'bold' }}>Número do Documento</span>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1a202c', fontFamily: 'monospace' }}>{selectedCautelaDetails.numero}</div>
              </div>
              <div>
                {(() => {
                  if (selectedCautelaDetails.status === 'Ativa' || selectedCautelaDetails.status === 'Em Uso') {
                    return <span className="badge badge-orange" style={{ fontSize: '13px', padding: '6px 12px' }}>🔴 Em Uso (Ativa)</span>;
                  }
                  if (selectedCautelaDetails.status === 'Pendente' || selectedCautelaDetails.status === 'Pendente de Assinatura') {
                    return <span className="badge badge-warning" style={{ fontSize: '13px', padding: '6px 12px', backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>🟡 Pendente de Assinatura</span>;
                  }
                  if (selectedCautelaDetails.status === 'Pendente (Devolução)') {
                    return <span className="badge badge-purple" style={{ fontSize: '13px', padding: '6px 12px', backgroundColor: '#f3e8ff', color: '#6b21a8', border: '1px solid #e9d5ff' }}>🟣 Devolução Pendente</span>;
                  }
                  return <span className="badge badge-green" style={{ fontSize: '13px', padding: '6px 12px' }}>🟢 Devolvida / Baixada</span>;
                })()}
              </div>
            </div>

            {/* Grid Material e Detentor */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {/* Material Cautelado */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '14px', background: '#ffffff' }}>
                <div style={{ fontWeight: 'bold', color: '#2b6cb0', marginBottom: '8px', borderBottom: '1px solid #edf2f7', paddingBottom: '4px', fontSize: '14px' }}>
                  📦 Material Cautelado
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div><strong>Categoria:</strong> {selectedCautelaDetails.categoria || '—'}</div>
                  <div><strong>Item / Descrição:</strong> {selectedCautelaDetails.item_desc || '—'}</div>
                  <div>
                    <strong>Série / Patrimônio:</strong>{' '}
                    <span style={{ fontFamily: 'monospace', fontWeight: 'bold', background: '#edf2f7', padding: '2px 6px', borderRadius: '4px', color: '#2d3748' }}>
                      {selectedCautelaDetails.serie || selectedCautelaDetails.numero_serie || '—'}
                    </span>
                  </div>
                  <div><strong>Quantidade:</strong> {selectedCautelaDetails.qtd || 1} un.</div>
                  {(selectedCautelaDetails.qtd_carregadores !== undefined && selectedCautelaDetails.qtd_carregadores !== null && selectedCautelaDetails.qtd_carregadores !== '') && (
                    <div><strong>Qtd. de Carregadores:</strong> {selectedCautelaDetails.qtd_carregadores} un.</div>
                  )}
                </div>
              </div>

              {/* Detentor / Beneficiário */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '14px', background: '#ffffff' }}>
                <div style={{ fontWeight: 'bold', color: '#2b6cb0', marginBottom: '8px', borderBottom: '1px solid #edf2f7', paddingBottom: '4px', fontSize: '14px' }}>
                  👤 Responsável / Lotação
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div>
                    <strong>Policial / Beneficiário:</strong>{' '}
                    {selectedCautelaDetails.is_cautela_unidade || selectedCautelaDetails.policial_nome?.startsWith('UNIDADE:') ? (
                      <span style={{ color: '#1d4ed8', fontWeight: 'bold' }}>🏢 {selectedCautelaDetails.policial_nome || `UNIDADE: ${selectedCautelaDetails.lotacao}`}</span>
                    ) : (
                      selectedCautelaDetails.policial_nome || '—'
                    )}
                  </div>
                  <div><strong>Matrícula:</strong> {selectedCautelaDetails.is_cautela_unidade && selectedCautelaDetails.delegado_matricula ? `(Del.) ${selectedCautelaDetails.delegado_matricula}` : (selectedCautelaDetails.matricula || '—')}</div>
                  <div><strong>Lotação:</strong> {selectedCautelaDetails.lotacao || '—'}</div>
                  <div><strong>Departamento:</strong> {selectedCautelaDetails.depto || '—'}</div>
                  {selectedCautelaDetails.delegado_nome && (
                    <div><strong>Recebedor / Responsável:</strong> {selectedCautelaDetails.delegado_nome}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Seção de Assinatura Digital */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '14px', background: '#ffffff' }}>
              <div style={{ fontWeight: 'bold', color: '#2b6cb0', marginBottom: '8px', borderBottom: '1px solid #edf2f7', paddingBottom: '4px', fontSize: '14px' }}>
                ✍️ Assinatura Digital
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {/* Assinatura de Saída */}
                <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', marginBottom: '6px' }}>
                    ASSINATURA DE RETIRADA / SAÍDA
                  </div>
                  {selectedCautelaDetails.assinatura_digital ? (
                    <div>
                      <img
                        src={selectedCautelaDetails.assinatura_digital}
                        alt="Assinatura Digital de Saída"
                        style={{ maxHeight: '55px', maxWidth: '100%', objectFit: 'contain', background: '#fff', border: '1px dashed #cbd5e1', padding: '4px', borderRadius: '4px' }}
                      />
                      <div style={{ fontSize: '10px', color: '#16a34a', marginTop: '4px', fontWeight: 'bold' }}>
                        ✓ Assinatura Registrada
                      </div>
                      {selectedCautelaDetails.hash_assinatura && (
                        <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#2563eb', fontWeight: 'bold', marginTop: '2px' }}>
                          ID: {selectedCautelaDetails.hash_assinatura}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#d97706', padding: '6px 0' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>⚠️ Pendente de Assinatura via E-mail</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => handleReenviarEmail(selectedCautelaDetails)}
                          disabled={sendingEmail}
                        >
                          📧 Reenviar E-mail
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-success"
                          onClick={() => handleConfirmarTokenEmail(selectedCautelaDetails.token_confirmacao, selectedCautelaDetails.id)}
                        >
                          ⚡ Confirmar (Simular)
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Assinatura de Devolução */}
                {(selectedCautelaDetails.status === 'Devolvido' || selectedCautelaDetails.status === 'Baixada' || selectedCautelaDetails.status === 'Pendente (Devolução)' || selectedCautelaDetails.assinatura_dev) && (
                  <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', marginBottom: '6px' }}>
                      ASSINATURA DE DEVOLUÇÃO
                    </div>
                    {selectedCautelaDetails.assinatura_dev ? (
                      <div>
                        <img
                          src={selectedCautelaDetails.assinatura_dev}
                          alt="Assinatura Digital de Devolução"
                          style={{ maxHeight: '55px', maxWidth: '100%', objectFit: 'contain', background: '#fff', border: '1px dashed #cbd5e1', padding: '4px', borderRadius: '4px' }}
                        />
                        <div style={{ fontSize: '10px', color: '#16a34a', marginTop: '4px', fontWeight: 'bold' }}>
                          ✓ Assinatura Registrada
                        </div>
                        {selectedCautelaDetails.hash_assinatura_dev && (
                          <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#2563eb', fontWeight: 'bold', marginTop: '2px' }}>
                            ID: {selectedCautelaDetails.hash_assinatura_dev}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#d97706', padding: '6px 0' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>⚠️ Pendente de Assinatura via E-mail</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-xs btn-outline"
                            onClick={() => handleReenviarEmail(selectedCautelaDetails)}
                            disabled={sendingEmail}
                          >
                            📧 Reenviar E-mail
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-success"
                            onClick={() => handleConfirmarTokenEmail(selectedCautelaDetails.token_confirmacao_dev || selectedCautelaDetails.token_confirmacao, selectedCautelaDetails.id)}
                          >
                            ⚡ Confirmar (Simular)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Datas & Observações */}

            {/* Datas & Observações */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '14px', background: '#ffffff' }}>
              <div style={{ fontWeight: 'bold', color: '#2b6cb0', marginBottom: '8px', borderBottom: '1px solid #edf2f7', paddingBottom: '4px', fontSize: '14px' }}>
                📅 Emissão & Observações
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '10px' }}>
                <div><strong>Data de Saída / Emissão:</strong> {formatLocalDate(selectedCautelaDetails.data_saida || selectedCautelaDetails.data_cautela)}</div>
                <div><strong>Previsão de Devolução:</strong> {formatLocalDate(selectedCautelaDetails.data_prev)}</div>
              </div>
              <div>
                <strong>Observações Registradas:</strong>
                <p style={{ margin: '4px 0 0 0', color: '#4a5568', fontStyle: selectedCautelaDetails.obs ? 'normal' : 'italic', background: '#f7fafc', padding: '8px 12px', borderRadius: '4px', border: '1px solid #edf2f7' }}>
                  {selectedCautelaDetails.obs || 'Nenhuma observação cadastrada no ato da emissão.'}
                </p>
              </div>
            </div>

            {/* Detalhes de Devolução se aplicável */}
            {selectedCautelaDetails.status !== 'Ativa' && (
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '14px', background: '#f8fafc' }}>
                <div style={{ fontWeight: 'bold', color: '#276749', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', fontSize: '14px' }}>
                  ✅ Histórico de Baixa / Devolução
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  <div><strong>Data de Devolução:</strong> {formatLocalDate(selectedCautelaDetails.data_dev)}</div>
                  <div><strong>Condição / Destino:</strong> {selectedCautelaDetails.condicao_dev || selectedCautelaDetails.status_item || 'Devolvido'}</div>
                  {selectedCautelaDetails.nup && <div><strong>NUP Processo:</strong> {selectedCautelaDetails.nup}</div>}
                  {selectedCautelaDetails.numero_io_bo && <div><strong>Nº IO / BO:</strong> {selectedCautelaDetails.numero_io_bo}</div>}
                </div>
                {selectedCautelaDetails.obs_dev && (
                  <div style={{ marginTop: '10px' }}>
                    <strong>Observações de Devolução:</strong>
                    <p style={{ margin: '4px 0 0 0', color: '#4a5568', background: '#fff', padding: '8px 12px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                      {selectedCautelaDetails.obs_dev}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📋 Cautelas Registradas ({filteredCautelas.length})</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={async () => {
                try {
                  const params = new URLSearchParams();
                  if (searchTerm) params.append('search', searchTerm);
                  await apiService.download('cautelas/relatorio-xlsx', 'relatorio_cautelas.xlsx', params);
                } catch (err) {
                  alert(err.message || 'Falha ao baixar relatório de cautelas.');
                }
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              📊 Exportar Excel (XLSX)
            </button>
            {(searchTerm || statusFilter || deptoFilter || lotacaoFilter || dateFrom || dateTo) && (
              <button
                type="button"
                className="btn btn-xs btn-outline"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('');
                  setDeptoFilter('');
                  setLotacaoFilter('');
                  setDateFrom('');
                  setDateTo('');
                }}
              >
                🔄 Limpar Filtros
              </button>
            )}
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div style={{ padding: '14px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'end' }}>
            
            {/* Text Search */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                🔍 Buscar (Nº Cautela, Policial, Matrícula, Item, Série, Lotação)
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Digite para filtrar..."
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

            {/* Status Filter */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                Status
              </label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
              >
                <option value="">Todos os Status</option>
                <option value="Ativa">🔴 Ativas (Em Uso)</option>
                <option value="Pendente">🟡 Pendentes de Assinatura (Saída)</option>
                <option value="PendenteDev">🟣 Devoluções Pendentes de Assinatura</option>
                <option value="Baixada">🟢 Devolvidas (Baixadas)</option>
              </select>
            </div>

            {/* Depto Filter */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                Departamento
              </label>
              <select
                value={deptoFilter}
                onChange={e => setDeptoFilter(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
              >
                <option value="">Todos os Departamentos</option>
                {departamentos.map(d => (
                  <option key={d.valor} value={d.valor}>{d.rotulo}</option>
                ))}
              </select>
            </div>

            {/* Date From */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                Data Inicial
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

            {/* Date To */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                Data Final
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nº Cautela</th>
                <th>Data Saída</th>
                <th>Policial</th>
                <th>Matrícula</th>
                <th>Lotação</th>
                <th>Item</th>
                <th>Qtd</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="9" className="text-center p-4">Carregando...</td></tr>}
              {!loading && paginatedCautelas.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleViewDetails(row)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563eb',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        padding: 0,
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        textDecoration: 'underline'
                      }}
                      title="Clique para visualizar os detalhes desta cautela"
                    >
                      📋 {row.numero}
                    </button>
                  </td>
                  <td>{formatLocalDate(row.data_saida)}</td>
                  <td>
                    {row.is_cautela_unidade || row.policial_nome?.startsWith('UNIDADE:') ? (
                      <div>
                        <span style={{ fontWeight: '600', color: '#1d4ed8' }}>🏢 {row.policial_nome || `UNIDADE: ${row.lotacao}`}</span>
                        {row.delegado_nome && (
                          <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>
                            ✍️ Recebedor: {row.delegado_nome}
                          </div>
                        )}
                      </div>
                    ) : (
                      row.policial_nome || (row.lotacao ? `UNIDADE: ${row.lotacao}` : '—')
                    )}
                  </td>
                  <td>{row.is_cautela_unidade && row.delegado_matricula ? `(Del.) ${row.delegado_matricula}` : (row.matricula || '—')}</td>
                  <td>{row.lotacao}</td>
                  <td>{row.item_desc}</td>
                  <td>{row.qtd}</td>
                  <td>
                    {(() => {
                      if (row.status === 'Ativa' || row.status === 'Em Uso') {
                        return <span className="badge badge-orange">🔴 Em Uso</span>;
                      }
                      if (row.status === 'Pendente' || row.status === 'Pendente de Assinatura') {
                        return <span className="badge badge-warning" style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>🟡 Pendente Assinatura</span>;
                      }
                      if (row.status === 'Pendente (Devolução)') {
                        return <span className="badge badge-purple" style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', border: '1px solid #e9d5ff' }}>🟣 Devolução Pendente</span>;
                      }
                      return <span className="badge badge-green">🟢 Devolvido</span>;
                    })()}
                  </td>
                  <td>
  <div className="flex items-center gap-2">
    <button 
      className="btn btn-xs btn-outline" 
      onClick={() => handleViewDetails(row)}
      title="Visualizar detalhes na tela"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
    >
      👁️ Detalhes
    </button>
    <button className="btn btn-xs btn-outline" onClick={() => handleBaixarPdf(row.id, row.numero)}>
      PDF
    </button>
    
    {(row.status === 'Pendente' || row.status === 'Pendente de Assinatura' || row.status === 'Pendente (Devolução)') && (
      <>
        <button 
          className="btn btn-xs btn-outline" 
          onClick={() => handleReenviarEmail(row)}
          disabled={sendingEmail}
          title="Reenviar e-mail de confirmação para o policial"
          style={{ borderColor: '#0284c7', color: '#0369a1' }}
        >
          📧 Reenviar E-mail
        </button>
        <button 
          className="btn btn-xs btn-warning" 
          onClick={() => handleOpenAssinarModal(row)}
          title="Coletar / Inserir Assinatura Digital ou Confirmar por E-mail"
          style={{ backgroundColor: '#d97706', borderColor: '#d97706', color: '#fff' }}
        >
          ✍️ Assinar
        </button>
      </>
    )}

    {(row.status === 'Ativa' || row.status === 'Em Uso' || row.status === 'Pendente' || row.status === 'Pendente de Assinatura') && (
      <button className="btn btn-xs btn-success" onClick={() => openBaixaModal(row)} title="Registrar devolução / baixa">
        Devolver
      </button>
    )}

    {(row.status === 'Ativa' || row.status === 'Em Uso' || row.status === 'Pendente' || row.status === 'Pendente de Assinatura') && (
      <button className="btn btn-xs btn-danger" onClick={() => handleCancelar(row.id)} title="Cancelar cautela">
        Cancelar
      </button>
    )}
  </div>
</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }}>
            <span style={{ color: '#4a5568' }}>
              Exibindo <strong>{filteredCautelas.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong> a{' '}
              <strong>{Math.min(filteredCautelas.length, currentPage * itemsPerPage)}</strong> de{' '}
              <strong>{filteredCautelas.length}</strong> cautelas
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                style={{ opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                ◀ Anterior
              </button>
              <span style={{ fontWeight: '500' }}>Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong></span>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                style={{ opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
              >
                Próxima ▶
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default Cautelas;
