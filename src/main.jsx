import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Sidebar from './components/Sidebar';
import CadItens from './pages/CadItens';
import CadItensCompra from './pages/CadItensCompra';
import CadLotacoes from './pages/CadLotacoes';
import Cautelas from './pages/Cautelas';
import NovoServico from './pages/NovoServico';
import Modal from './components/Modal';
import { apiService } from './services/api';
import DashboardDetalhes from './components/DashboardDetalhes';
import { GlockIcon, MunicoesIcon } from './components/CategoryIcons';
import { getSavedDeptosList, getDeptoSigla, matchDeptoFlex, buildLotacaoToDeptoMap, normalizeStr } from './utils/deptoUtils';
import { AuthProvider, useAuth } from './context/AuthContext';
import UserHeaderBar from './components/UserHeaderBar';
import LoginPage from './pages/LoginPage';
import './index.css';

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

const getAmmunitionDetails = (description, quantity) => {
  const desc = String(description || "").toLowerCase();
  let unitsPerLot = 2000;
  let unitsPerBox = 50;

  if (desc.includes("5.56") || desc.includes("5,56") || desc.includes("7.62") || desc.includes("7,62") || desc.includes(".308") || desc.includes("308")) {
    unitsPerLot = 2000;
    unitsPerBox = 50;
  } else if (desc.includes("12") || desc.includes("calibre 12") || desc.includes("12ga") || desc.includes("c12") || desc.includes("ga12")) {
    unitsPerLot = 5000;
    unitsPerBox = 25;
  } else {
    unitsPerLot = 2000;
    unitsPerBox = 50;
  }

  const lots = Math.ceil(quantity / unitsPerLot);
  const boxes = Math.ceil(quantity / unitsPerBox);

  return { lots, boxes, unitsPerLot, unitsPerBox };
};

/* eslint-disable react/prop-types */

function App() {
  const { currentUser, initializing } = useAuth();
  const [activePage, setActivePage] = useState('pg-dash-estoque');
  const [counts, setCounts] = useState({
    itens: 0,
    policiais: 0,
    cautelas: 0,
    servicos: 0,
    lotacoes: 0,
  });

  const loadGlobalCounts = async () => {
    try {
      const [itensData, policiaisData, cautelasData, servicosData, lotacoesData] = await Promise.all([
        apiService.getList('itens', new URLSearchParams({ page_size: '1' })),
        apiService.getList('policiais', new URLSearchParams({ page_size: '1' })),
        apiService.getList('cautelas', new URLSearchParams({ page_size: '1' })),
        apiService.getList('servicos', new URLSearchParams({ page_size: '1' })),
        apiService.getList('lotacoes', new URLSearchParams({ page_size: '1' })),
      ]);

      setCounts({
        itens: itensData.count || 0,
        policiais: policiaisData.count || 0,
        cautelas: cautelasData.count || 0,
        servicos: servicosData.count || 0,
        lotacoes: lotacoesData.count || 0,
      });
    } catch (err) {
      console.error('Erro ao buscar estatísticas globais:', err);
    }
  };

  useEffect(() => {
    if (currentUser) loadGlobalCounts();
  }, [activePage, currentUser]);

  if (initializing) {
    return (
      <div style={{
        minHeight: '100vh', width: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', color: '#94a3b8'
      }}>
        Carregando...
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  // Render the current view
  const renderContent = () => {
    switch (activePage) {
      case 'pg-cad-itens':
        return <CadItens />;
      
      case 'pg-cad-lotacao':
        return <CadLotacoes />;

      case 'pg-cautelas':
        return <Cautelas />;

      case 'pg-novo-servico':
        return <NovoServico onNavigate={(page) => setActivePage(page)} />;

      case 'pg-dash-estoque':
        return <DashboardEstoqueView counts={counts} onNavigate={setActivePage} />;

      case 'pg-dash-servicos':
        return <DashboardServicosView counts={counts} onNavigate={setActivePage} />;

      case 'pg-cad-policiais':
        return <CadPoliciaisView />;

      case 'pg-cad-fornecedor':
        return <CadFornecedorView />;

      case 'pg-item-compra':
        return <CadItensCompra />;

      case 'pg-cad-menus':
        return <CadMenusView />;

      case 'pg-relatorios':
        return <RelatoriosView />;

      case 'pg-relatorios-servicos':
        return <RelatoriosServicosView />;

      default:
        return (
          <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
            <h2>Página em Construção</h2>
            <p>A seção correspondente a <strong>{activePage}</strong> está sendo integrada.</p>
            <button className="btn btn-primary" onClick={() => setActivePage('pg-dash-estoque')}>
              Voltar ao Dashboard de Estoque
            </button>
          </div>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      <UserHeaderBar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar onNavigate={setActivePage} activePage={activePage} />
        <main className="main-content" style={{ flex: 1 }}>
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

// ==========================================
// VIEW: Dashboard Estoque
// ==========================================
function DashboardEstoqueView({ counts, onNavigate }) {
  const [items, setItems] = useState([]);
  const [allBens, setAllBens] = useState([]);
  const [allCautelas, setAllCautelas] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [lotacoes, setLotacoes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Interactive Filters
  const [selectedStatus, setSelectedStatus] = useState('Todos');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedDepto, setSelectedDepto] = useState('Todos');
  const [selectedLotacao, setSelectedLotacao] = useState('Todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyCritical, setShowOnlyCritical] = useState(false);
  const [dashboardTab, setDashboardTab] = useState('geral'); // 'geral' | 'detalhado'
  const [isExpiringAlertExpanded, setIsExpiringAlertExpanded] = useState(true);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Calculate Expiring (<= 180 days) and Expired (< 0 days) items for Dashboard Alert
  const expiringAndExpiredDashboardItems = React.useMemo(() => {
    const list = [];

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

    const activeCautelaBySerialMap = new Map();
    const activeCautelaByItemMap = new Map();

    allCautelas.forEach(c => {
      if (c && (c.status === 'Ativa' || c.status === 'Em Uso')) {
        const itemId = c.item_id || c.item;
        const serial = String(c.serie || c.numero_serie || '').toLowerCase().trim();
        if (serial) {
          activeCautelaBySerialMap.set(serial, c);
        }
        if (itemId !== undefined) {
          const arr = activeCautelaByItemMap.get(String(itemId)) || [];
          arr.push(c);
          activeCautelaByItemMap.set(String(itemId), arr);
        }
      }
    });

    const itemsMap = new Map();
    items.forEach(i => itemsMap.set(String(i.id), i));

    const trackedBensItemIds = new Set();
    allBens.forEach(b => {
      if (b && b.item_id !== undefined) {
        trackedBensItemIds.add(String(b.item_id));
      }
    });

    // 1. Process individual physical assets (Bens)
    allBens.forEach(b => {
      const parent = itemsMap.get(String(b.item_id));
      const expDate = b.validade || b.data_validade || b.dt_val || parent?.validade || parent?.data_validade || parent?.dt_val;
      const days = getDaysToExpiration(expDate);

      if (days !== null && days <= 180) {
        const serial = String(b.serie || '').toLowerCase().trim();
        const pat = String(b.patrimonio || '').toLowerCase().trim();
        const activeC = (serial && activeCautelaBySerialMap.get(serial)) || (pat && activeCautelaBySerialMap.get(pat));

        list.push({
          id: `bem_${b.id}`,
          descricao: parent ? parent.descricao : (b.descricao || 'Item Físico'),
          serie: b.serie || b.patrimonio || '—',
          categoria: parent ? parent.categoria : 'Equipamentos',
          dt_val: expDate,
          days,
          isAcautelado: Boolean(activeC),
          posseNome: activeC ? (activeC.policial_nome || activeC.delegado_nome || 'Unidade') : 'Estoque Central (SGA)',
          posseLotacao: activeC ? (activeC.lotacao || activeC.depto || 'Lotação') : 'Almoxarifado'
        });
      }
    });

    // 2. Process items without individual bens (e.g. Munições or bulk items with dt_val)
    items.forEach(i => {
      if (!trackedBensItemIds.has(String(i.id))) {
        const expDate = i.validade || i.data_validade || i.dt_val;
        const days = getDaysToExpiration(expDate);

        if (days !== null && days <= 180) {
          const activeCautelas = activeCautelaByItemMap.get(String(i.id)) || [];
          const isAcautelado = activeCautelas.length > 0;

          list.push({
            id: `item_${i.id}`,
            descricao: i.descricao,
            serie: i.lote ? `Lote: ${i.lote}` : '—',
            categoria: i.categoria,
            dt_val: expDate,
            days,
            isAcautelado,
            posseNome: isAcautelado ? `${activeCautelas.length} cautela(s) ativa(s)` : 'Estoque Central (SGA)',
            posseLotacao: isAcautelado ? activeCautelas.map(c => c.policial_nome || c.lotacao).filter(Boolean).join(', ') : 'Almoxarifado'
          });
        }
      }
    });

    return list.sort((a, b) => a.days - b.days);
  }, [items, allBens, allCautelas]);

  const dashboardExpiredCount = expiringAndExpiredDashboardItems.filter(x => x.days < 0).length;
  const dashboardWarningCount = expiringAndExpiredDashboardItems.filter(x => x.days >= 0).length;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStatus, selectedCategory, selectedDepto, selectedLotacao, searchQuery, showOnlyCritical]);



  // Load complete relational data for full dashboard intelligence
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const [itensData, bensData, cautelasData, deptoData, lotData] = await Promise.all([
          apiService.getList('itens', new URLSearchParams({ page_size: '2000' })),
          apiService.getList('bens', new URLSearchParams({ page_size: '5000' })),
          apiService.getList('cautelas', new URLSearchParams({ page_size: '5000' })),
          apiService.getList('departamentos', new URLSearchParams({ page_size: '500' })),
          apiService.getList('lotacoes', new URLSearchParams({ page_size: '500' })),
        ]);

        setItems(itensData.results || itensData || []);
        setAllBens(bensData.results || bensData || []);
        setAllCautelas(cautelasData.results || cautelasData || []);
        setDepartamentos(deptoData.results || deptoData || []);
        setLotacoes(lotData.results || lotData || []);
      } catch (err) {
        console.error('Erro ao buscar dados do dashboard:', err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, []);

  // Consolidate individual assets and bulk items into a unified Display Unit list
  const displayUnits = React.useMemo(() => {
    const list = [];

    // Precalculate maps/sets for O(1) fast lookup
    const itemsMap = new Map();
    items.forEach(i => {
      if (i && i.id !== undefined) {
        itemsMap.set(String(i.id), i);
      }
    });

    const activeCautelasMap = new Map();
    const bulkCautelasMap = new Map();
    allCautelas.forEach(c => {
      if (c && (String(c.status).toLowerCase().includes('ativa') || String(c.status).toLowerCase().includes('em uso')) && (c.item_id !== undefined || c.item !== undefined)) {
        const itemId = c.item_id || c.item;
        const s = String(c.serie || c.numero_serie || '').toLowerCase().trim();
        if (s) {
          activeCautelasMap.set(`${itemId}_${s}`, c);
        }

        const listArr = bulkCautelasMap.get(String(itemId)) || [];
        listArr.push(c);
        bulkCautelasMap.set(String(itemId), listArr);
      }
    });

    const trackedItemIds = new Set();
    allBens.forEach(b => {
      if (b && b.item_id !== undefined) {
        trackedItemIds.add(String(b.item_id));
      }
    });

    // Add individually tracked assets (Bens)
    allBens.forEach(b => {
      const parent = itemsMap.get(String(b.item_id));
      const parentCat = parent ? parent.categoria : 'Equipamentos';
      const parentDesc = parent ? parent.descricao : 'Item sem descrição';
      const parentMarca = parent ? parent.marca : '';
      const parentModelo = parent ? parent.modelo : '';

      // Check if currently in active custody (Cautela Ativa) by serie or patrimonio
      const normS = String(b.serie || '').toLowerCase().trim();
      const normP = String(b.patrimonio || '').toLowerCase().trim();
      const activeCautela = (normS && activeCautelasMap.get(`${b.item_id}_${normS}`)) || 
                            (normP && activeCautelasMap.get(`${b.item_id}_${normP}`));

      const depto = activeCautela ? (activeCautela.depto || activeCautela.departamento || lotacaoToDeptoMap.get(normalizeStr(activeCautela.lotacao)) || activeCautela.lotacao || 'Não Informado') : 'Estoque Central (SGA)';
      const lotacao = activeCautela ? (activeCautela.lotacao || activeCautela.depto || 'Estoque Central') : 'Estoque Central';
      const policial_nome = activeCautela ? activeCautela.policial_nome : '';
      const matricula = activeCautela ? activeCautela.matricula : '';

      const status = activeCautela ? 'Em Uso' : (b.status || 'Disponivel');
      const isCritical = parent ? (Number(parent.qtd_disp || 0) <= Number(parent.qtd_min || 0)) : false;

      list.push({
        type: 'individual',
        id: `bem-${b.id}`,
        item_id: b.item_id,
        patrimonio: b.patrimonio || parent?.patrimonio || '—',
        serie: b.serie || '—',
        descricao: `${parentDesc} ${parentMarca} ${parentModelo}`.trim(),
        categoria: parentCat,
        status: status,
        depto: depto,
        lotacao: lotacao,
        policial_nome: policial_nome,
        matricula: matricula,
        qtd: 1,
        isCritical: isCritical
      });
    });

    // Add bulk-tracked items (Munições, Uniformes, or items with no individual registered bens)
    items.forEach(item => {
      const isTracked = trackedItemIds.has(String(item.id));
      if (!isTracked) {
        const qtyDisp = Number(item.qtd_disp || 0);
        const qtyTotal = Number(item.qtd_total || 0);
        const qtyInUse = Math.max(0, qtyTotal - qtyDisp);
        const isCritical = Number(item.qtd_disp || 0) <= Number(item.qtd_min || 0);

        if (qtyDisp > 0) {
          list.push({
            type: 'bulk-disponivel',
            id: `bulk-disp-${item.id}`,
            item_id: item.id,
            patrimonio: item.patrimonio || '—',
            serie: 'Lote / Sem Série',
            descricao: item.descricao,
            categoria: item.categoria,
            status: 'Disponivel',
            depto: 'Estoque Central (SGA)',
            lotacao: 'Estoque Central',
            policial_nome: '',
            matricula: '',
            qtd: qtyDisp,
            isCritical: isCritical
          });
        }

        if (qtyInUse > 0) {
          const bulkCautelas = bulkCautelasMap.get(String(item.id)) || [];
          if (bulkCautelas.length > 0) {
            bulkCautelas.forEach(c => {
              list.push({
                type: 'bulk-em-uso',
                id: `bulk-use-${item.id}-${c.id}`,
                item_id: item.id,
                patrimonio: item.patrimonio || '—',
                serie: 'Lote / Sem Série',
                descricao: item.descricao,
                categoria: item.categoria,
                status: 'Em Uso',
                depto: c.depto || c.departamento || lotacaoToDeptoMap.get(normalizeStr(c.lotacao)) || c.lotacao || 'Não Informado',
                lotacao: c.lotacao || 'Não Informado',
                policial_nome: c.policial_nome,
                matricula: c.matricula,
                qtd: c.qtd || 1,
                isCritical: isCritical
              });
            });
          } else {
            list.push({
              type: 'bulk-em-uso',
              id: `bulk-use-fallback-${item.id}`,
              item_id: item.id,
              patrimonio: item.patrimonio || '—',
              serie: 'Lote / Sem Série',
              descricao: item.descricao,
              categoria: item.categoria,
              status: 'Em Uso',
              depto: 'Vários Departamentos',
              lotacao: 'Várias Unidades',
              policial_nome: 'Policial não identificado',
              matricula: '',
              qtd: qtyInUse,
              isCritical: isCritical
            });
          }
        }
      }
    });

    return list;
  }, [items, allBens, allCautelas]);

  // Aggregate stats
  const stats = React.useMemo(() => {
    let totalItemsCount = 0;
    let totalAvailable = 0;
    let totalInUse = 0;
    let totalOther = 0;

    displayUnits.forEach(u => {
      const q = u.qtd || 1;
      totalItemsCount += q;
      if (u.status === 'Disponivel') {
        totalAvailable += q;
      } else if (u.status === 'Em Uso') {
        totalInUse += q;
      } else {
        totalOther += q;
      }
    });

    const lowStockItems = items.filter(i => Number(i.qtd_disp || 0) <= Number(i.qtd_min || 0));

    return {
      total: totalItemsCount,
      available: totalAvailable,
      inUse: totalInUse,
      critical: lowStockItems.length,
      other: totalOther,
      lowStockItems
    };
  }, [displayUnits, items]);

  // Map status labels & colors (Dashboard View)
  const STATUS_DETAILS = {
    'Todos': { label: 'Todos os Status', color: '#4a5568', bg: '#edf2f7' },
    'Disponivel': { label: 'Disponível', color: '#2f855a', bg: '#c6f6d5' },
    'Em Uso': { label: 'Em Uso', color: '#2b6cb0', bg: '#bee3f8' },
    'Manutencao': { label: 'Em Manutenção', color: '#b7791f', bg: '#feebc8' },
    'Inservivel': { label: 'Inservível', color: '#9b2c2c', bg: '#fed7d7' },
    'Perdida': { label: 'Perdido / Extraviado', color: '#c53030', bg: '#fed7d7' },
    'Furtada': { label: 'Furtado', color: '#9b2c2c', bg: '#fed7d7' },
    'Roubada': { label: 'Roubado', color: '#9b2c2c', bg: '#fed7d7' },
    'Destruida': { label: 'Destruído', color: '#e53e3e', bg: '#fed7d7' },
    'Recolhida': { label: 'Recolhido', color: '#4a5568', bg: '#edf2f7' },
    'Ressarcida': { label: 'Ressarcido', color: '#2c5282', bg: '#e2e8f0' }
  };

  // Map lotação -> department from Cadastros -> Unidades for fast lookup
  const lotacaoToDeptoMap = React.useMemo(() => buildLotacaoToDeptoMap(lotacoes), [lotacoes]);

  // Helper to filter display units excluding a specific filter key (to enable classic cross-filtering/BI)
  const getFilteredUnitsExcept = (excludeFilterKey) => {
    return displayUnits.filter(u => {
      // 1. Critical stock filter
      if (showOnlyCritical) {
        if (!u.isCritical) {
          return false;
        }
      }

      // 2. Status filter
      if (excludeFilterKey !== 'status' && selectedStatus !== 'Todos') {
        if (String(u.status).toLowerCase().trim() !== String(selectedStatus).toLowerCase().trim()) {
          return false;
        }
      }

      // 3. Category filter
      if (excludeFilterKey !== 'category' && selectedCategory !== 'Todas') {
        const uCat = String(u.categoria || '').toLowerCase().trim();
        const sCat = String(selectedCategory).toLowerCase().trim();
        if (!uCat.includes(sCat) && !sCat.includes(uCat)) {
          return false;
        }
      }

      // 4. Department filter
      if (excludeFilterKey !== 'depto' && selectedDepto !== 'Todos') {
        const uDepto = u.depto || lotacaoToDeptoMap.get(normalizeStr(u.lotacao));
        if (!matchDeptoFlex(uDepto, selectedDepto)) {
          return false;
        }
      }

      // 5. Unit/Location filter
      if (excludeFilterKey !== 'lotacao' && selectedLotacao !== 'Todas') {
        if (String(u.lotacao).toLowerCase().trim() !== String(selectedLotacao).toLowerCase().trim()) {
          return false;
        }
      }

      // 6. Keyword Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const descMatch = String(u.descricao || '').toLowerCase().includes(q);
        const patMatch = String(u.patrimonio || '').toLowerCase().includes(q);
        const serieMatch = String(u.serie || '').toLowerCase().includes(q);
        const polMatch = String(u.policial_nome || '').toLowerCase().includes(q);
        const matMatch = String(u.matricula || '').toLowerCase().includes(q);

        if (!descMatch && !patMatch && !serieMatch && !polMatch && !matMatch) {
          return false;
        }
      }

      return true;
    });
  };

  // Status statistics aggregation for chart (filtered by everything except status)
  const statusStats = React.useMemo(() => {
    const counts = {};
    // Prepopulate status keys to ensure options always exist
    Object.keys(STATUS_DETAILS).forEach(k => {
      if (k !== 'Todos') counts[k] = 0;
    });

    const filteredUnits = getFilteredUnitsExcept('status');
    filteredUnits.forEach(u => {
      const s = u.status || 'Disponivel';
      counts[s] = (counts[s] || 0) + (u.qtd || 1);
    });

    return Object.entries(counts).map(([statusKey, val]) => {
      const info = STATUS_DETAILS[statusKey] || { label: statusKey, color: '#718096', bg: '#edf2f7' };
      return {
        key: statusKey,
        name: info.label,
        count: val,
        color: info.color,
        bg: info.bg
      };
    }).sort((a, b) => b.count - a.count);
  }, [displayUnits, selectedCategory, selectedDepto, selectedLotacao, searchQuery, showOnlyCritical]);

  // Category statistics aggregation for chart (filtered by everything except category)
  const categoryStats = React.useMemo(() => {
    const counts = {
      'Armas': 0,
      'Coletes': 0,
      'Munições': 0,
      'Equipamentos': 0,
      'Uniformes': 0
    };

    const filteredUnits = getFilteredUnitsExcept('category');
    filteredUnits.forEach(u => {
      const cat = String(u.categoria || '').toLowerCase();
      let mapped = 'Equipamentos';
      if (cat.includes('arma')) mapped = 'Armas';
      else if (cat.includes('colete')) mapped = 'Coletes';
      else if (cat.includes('muni')) mapped = 'Munições';
      else if (cat.includes('uni')) mapped = 'Uniformes';

      counts[mapped] = (counts[mapped] || 0) + (u.qtd || 1);
    });

    const categoryColors = {
      'Armas': '#1a365d',
      'Coletes': '#3182ce',
      'Munições': '#d69e2e',
      'Equipamentos': '#48bb78',
      'Uniformes': '#805ad5',
    };

    return Object.entries(counts).map(([cat, val]) => ({
      name: cat,
      count: val,
      color: categoryColors[cat] || '#718096'
    })).sort((a, b) => b.count - a.count);
  }, [displayUnits, selectedStatus, selectedDepto, selectedLotacao, searchQuery, showOnlyCritical]);

  // Department statistics aggregation (filtered by everything except department)
  const deptoStats = React.useMemo(() => {
    const counts = {};
    const filteredUnits = getFilteredUnitsExcept('depto');
    filteredUnits.forEach(u => {
      let uDepto = u.depto || lotacaoToDeptoMap.get(normalizeStr(u.lotacao));
      if (!uDepto || uDepto === 'Estoque Central (SGA)' || uDepto === 'Não Informado') {
        uDepto = 'Estoque Central';
      }
      counts[uDepto] = (counts[uDepto] || 0) + (u.qtd || 1);
    });

    return Object.entries(counts).map(([dep, val]) => ({
      name: dep,
      count: val,
      color: dep === 'Estoque Central' ? '#2b6cb0' : '#3182ce'
    })).sort((a, b) => b.count - a.count);
  }, [displayUnits, selectedCategory, selectedStatus, selectedLotacao, searchQuery, showOnlyCritical, lotacaoToDeptoMap]);

  // Location/Unit statistics aggregation (filtered by everything except location)
  const lotacaoStats = React.useMemo(() => {
    const counts = {};
    const filteredUnits = getFilteredUnitsExcept('lotacao');
    filteredUnits.forEach(u => {
      let uLot = u.lotacao;
      if (!uLot || uLot === 'Almoxarifado' || uLot === 'Estoque Central' || uLot === 'Não Informado') {
        uLot = 'Estoque Central';
      }
      counts[uLot] = (counts[uLot] || 0) + (u.qtd || 1);
    });

    return Object.entries(counts).map(([lot, val]) => ({
      name: lot,
      count: val,
      color: lot === 'Estoque Central' ? '#2b6cb0' : '#48bb78'
    })).sort((a, b) => b.count - a.count);
  }, [displayUnits, selectedCategory, selectedStatus, selectedDepto, searchQuery, showOnlyCritical]);

  // Filter application
  const filteredDisplayUnits = React.useMemo(() => {
    return displayUnits.filter(u => {
      // 1. Critical stock filter
      if (showOnlyCritical) {
        if (!u.isCritical) {
          return false;
        }
      }

      // 2. Status filter
      if (selectedStatus !== 'Todos') {
        if (String(u.status).toLowerCase().trim() !== String(selectedStatus).toLowerCase().trim()) {
          return false;
        }
      }

      // 3. Category filter
      if (selectedCategory !== 'Todas') {
        const uCat = String(u.categoria || '').toLowerCase().trim();
        const sCat = String(selectedCategory).toLowerCase().trim();
        if (!uCat.includes(sCat) && !sCat.includes(uCat)) {
          return false;
        }
      }

      // 4. Department filter
      if (selectedDepto !== 'Todos') {
        const uDepto = u.depto || lotacaoToDeptoMap.get(normalizeStr(u.lotacao));
        if (!matchDeptoFlex(uDepto, selectedDepto)) {
          return false;
        }
      }

      // 5. Unit filter
      if (selectedLotacao !== 'Todas') {
        if (String(u.lotacao).toLowerCase().trim() !== String(selectedLotacao).toLowerCase().trim()) {
          return false;
        }
      }

      // 6. Keyword Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const descMatch = String(u.descricao || '').toLowerCase().includes(q);
        const patMatch = String(u.patrimonio || '').toLowerCase().includes(q);
        const serieMatch = String(u.serie || '').toLowerCase().includes(q);
        const polMatch = String(u.policial_nome || '').toLowerCase().includes(q);
        const matMatch = String(u.matricula || '').toLowerCase().includes(q);

        if (!descMatch && !patMatch && !serieMatch && !polMatch && !matMatch) {
          return false;
        }
      }

      return true;
    });
  }, [displayUnits, items, selectedStatus, selectedCategory, selectedDepto, selectedLotacao, searchQuery, showOnlyCritical]);

  const paginatedUnits = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredDisplayUnits.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredDisplayUnits, currentPage]);

  const totalPages = Math.ceil(filteredDisplayUnits.length / itemsPerPage);

  const handleResetFilters = () => {
    setSelectedStatus('Todos');
    setSelectedCategory('Todas');
    setSelectedDepto('Todos');
    setSelectedLotacao('Todas');
    setSearchQuery('');
    setShowOnlyCritical(false);
  };

  const hasActiveFilters = selectedStatus !== 'Todos' || selectedCategory !== 'Todas' || selectedDepto !== 'Todos' || selectedLotacao !== 'Todas' || searchQuery !== '' || showOnlyCritical;

  // Combined Departments for Dashboard dropdown (synced with Cadastros -> Unidades)
  const allDashboardDeptos = React.useMemo(() => {
    const map = new Map();

    getSavedDeptosList().forEach(name => {
      if (name) {
        const norm = normalizeStr(name);
        if (!map.has(norm)) {
          map.set(norm, { name, sigla: getDeptoSigla(name) });
        }
      }
    });

    lotacoes.forEach(l => {
      if (l && l.depto) {
        const norm = normalizeStr(l.depto);
        if (!map.has(norm)) {
          map.set(norm, { name: l.depto, sigla: getDeptoSigla(l.depto) });
        }
      }
    });

    departamentos.forEach(d => {
      if (d && d.nome) {
        const norm = normalizeStr(d.nome);
        if (!map.has(norm)) {
          map.set(norm, { name: d.nome, sigla: d.sigla || getDeptoSigla(d.nome) });
        }
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' })
    );
  }, [lotacoes, departamentos]);

  // Filtered Lotações for Dashboard dropdown
  const allDashboardLotacoes = React.useMemo(() => {
    const map = new Map();

    lotacoes.forEach(l => {
      if (l && l.nome) {
        const lDepto = l.depto || l.departamento;
        if (selectedDepto === 'Todos' || matchDeptoFlex(lDepto, selectedDepto)) {
          const norm = normalizeStr(l.nome);
          if (!map.has(norm)) map.set(norm, l.nome);
        }
      }
    });

    displayUnits.forEach(u => {
      if (u && u.lotacao && u.lotacao !== 'Almoxarifado' && u.lotacao !== 'Estoque Central') {
        const uDepto = u.depto || lotacaoToDeptoMap.get(normalizeStr(u.lotacao));
        if (selectedDepto === 'Todos' || matchDeptoFlex(uDepto, selectedDepto)) {
          const norm = normalizeStr(u.lotacao);
          if (!map.has(norm)) map.set(norm, u.lotacao);
        }
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
    );
  }, [lotacoes, displayUnits, selectedDepto, lotacaoToDeptoMap]);

  // Custom Interactive Donut Chart for Category breakdown
  const InteractiveDonutChart = ({ title, data, selectedValue, onSelect }) => {
    const total = data.reduce((sum, d) => sum + d.count, 0);
    let accumulatedPercent = 0;

    return (
      <div className="card" style={{ padding: '20px 24px', margin: 0, display: 'flex', flexDirection: 'column', height: '350px', boxSizing: 'border-box' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1a365d', flexShrink: 0 }}>{title}</h3>
        {total === 0 ? (
          <p style={{ color: '#a0aec0', fontSize: '13px', textAlign: 'center', padding: '40px 0', margin: 'auto' }}>
            Sem itens cadastrados sob os filtros atuais.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'space-between', flex: 1, overflow: 'hidden' }}>
            {/* Donut SVG */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0, padding: '2px 0' }}>
              <div style={{ position: 'relative', width: '115px', height: '115px' }}>
                <svg width="100%" height="100%" viewBox="0 0 42 42" className="donut-svg">
                  <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#edf2f7" strokeWidth="4.5" />
                  {data.map((item, idx) => {
                    const percent = (item.count / total) * 100;
                    if (percent === 0) return null;
                    const strokeDasharray = `${percent} ${100 - percent}`;
                    const strokeDashoffset = 100 - accumulatedPercent + 25;
                    accumulatedPercent += percent;
                    const isSelected = selectedValue === item.name;

                    return (
                      <circle
                        key={idx}
                        cx="21"
                        cy="21"
                        r="15.915"
                        fill="transparent"
                        stroke={item.color}
                        strokeWidth={isSelected ? "6" : "4.5"}
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        style={{ 
                          transition: 'all 0.3s ease', 
                          cursor: 'pointer',
                          opacity: (selectedValue === 'Todas' || isSelected) ? 1 : 0.4
                        }}
                        onClick={() => onSelect(isSelected ? 'Todas' : item.name)}
                        title={`${item.name}: ${item.count} un. (${percent.toFixed(1)}%)`}
                      />
                    );
                  })}
                </svg>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <span style={{ fontSize: '17px', fontWeight: 'bold', color: '#1a202c', display: 'block' }}>{total}</span>
                  <span style={{ fontSize: '9px', color: '#718096', textTransform: 'uppercase', fontWeight: 'bold' }}>Unidades</span>
                </div>
              </div>
            </div>

            {/* Legends List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', maxHeight: '130px', paddingRight: '4px' }}>
              {data.map((item, idx) => {
                const isSelected = selectedValue === item.name;
                const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;
                return (
                  <div 
                    key={idx} 
                    onClick={() => onSelect(isSelected ? 'Todas' : item.name)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      fontSize: '11px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#ebf8ff' : 'transparent',
                      border: isSelected ? `1px solid ${item.color}` : '1px solid transparent',
                      transition: 'all 0.15s ease',
                      opacity: (selectedValue === 'Todas' || isSelected) ? 1 : 0.7
                    }}
                    className="hover:bg-slate-50"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color }} />
                      <span style={{ fontWeight: isSelected ? 'bold' : '500', color: isSelected ? '#1a365d' : '#4a5568' }}>{item.name}</span>
                    </div>
                    <span style={{ fontWeight: '700', color: '#2d3748' }}>
                      {item.count} <span style={{ fontSize: '9px', fontWeight: 'normal', color: '#718096' }}>({pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Custom Interactive Grid of Bento cards with Radial Gauges for Status
  const StatusGridCards = ({ title, data, selectedValue, onSelect }) => {
    const total = data.reduce((sum, d) => sum + d.count, 0);

    return (
      <div className="card" style={{ padding: '20px 24px', margin: 0, display: 'flex', flexDirection: 'column', height: '350px', boxSizing: 'border-box' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1a365d', flexShrink: 0 }}>{title}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
          {data.map((s) => {
            const isActive = selectedValue === s.key;
            const pct = total > 0 ? (s.count / total) * 100 : 0;
            
            const radius = 10;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (pct / 100) * circumference;

            return (
              <div
                key={s.key}
                onClick={() => onSelect(isActive ? 'Todos' : s.key)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid ' + (isActive ? s.color : '#e2e8f0'),
                  backgroundColor: isActive ? s.bg : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                  minHeight: '70px'
                }}
                className="hover:bg-slate-50 hover:shadow-sm"
                title={`Filtrar por: ${s.name}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px' }}>
                  <span style={{ 
                    fontSize: '11px', 
                    fontWeight: 'bold', 
                    color: isActive ? '#1a202c' : '#4a5568',
                    lineHeight: '1.2',
                    maxWidth: '75%'
                  }}>
                    {s.name}
                  </span>
                  
                  {/* Small Circular Progress */}
                  <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
                    <circle cx="12" cy="12" r={radius} fill="none" stroke="#edf2f7" strokeWidth="2.5" />
                    <circle 
                      cx="12" 
                      cy="12" 
                      r={radius} 
                      fill="none" 
                      stroke={s.color} 
                      strokeWidth="3" 
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                    />
                  </svg>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '4px' }}>
                  <span style={{ fontSize: '17px', fontWeight: '800', color: s.color }}>
                    {s.count}
                  </span>
                  <span style={{ fontSize: '9px', color: '#718096', fontWeight: 'bold' }}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Custom Interactive Vertical Column Chart for Departments
  const InteractiveVerticalColumnChart = ({ title, data, selectedValue, onSelect, valueSuffix = "unidades" }) => {
    const maxVal = Math.max(...data.map(d => d.count), 1);
    
    return (
      <div className="card" style={{ padding: '20px 24px', margin: 0, display: 'flex', flexDirection: 'column', height: '310px', boxSizing: 'border-box' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1a365d', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {title}
        </h3>
        {data.length === 0 ? (
          <p style={{ color: '#a0aec0', fontSize: '13px', textAlign: 'center', padding: '60px 0', margin: 'auto' }}>
            Sem carga ativa alocada sob os filtros de status selecionados.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 }}>
            {/* SVG Column Chart with full horizontal expansion */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'flex-end', 
              justifyContent: 'space-around', 
              gap: '16px', 
              height: '180px', 
              paddingTop: '28px',
              paddingBottom: '8px', 
              borderBottom: '1.5px solid #cbd5e0', 
              position: 'relative',
              overflowX: 'auto',
              scrollbarWidth: 'thin',
              paddingLeft: '12px',
              paddingRight: '12px'
            }}>
              {data.map((item, idx) => {
                const isSelected = selectedValue === item.name;
                const pct = (item.count / maxVal) * 100;
                const colHeight = Math.max(8, (pct / 100) * 100); // Scale max height to 100px leaving 80px for floating badges & text

                const displayName = item.name.startsWith('Departamento de ') 
                  ? item.name.replace('Departamento de ', 'Dep. ') 
                  : item.name;

                return (
                  <div 
                    key={idx}
                    onClick={() => onSelect(isSelected ? 'Todos' : item.name)}
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      cursor: 'pointer',
                      flexShrink: 0,
                      width: data.length > 8 ? '70px' : `${100 / data.length}%`,
                      maxWidth: '110px',
                      position: 'relative',
                      transition: 'transform 0.2s ease',
                    }}
                    title={`Clique para filtrar: ${item.name} (${item.count} ${valueSuffix})`}
                    className="hover:scale-105"
                  >
                    {/* Floating Value Badge */}
                    <span style={{ 
                      fontSize: '12px', 
                      fontWeight: '800', 
                      color: isSelected ? '#1b5e20' : '#1a365d', 
                      marginBottom: '6px',
                      textAlign: 'center',
                      backgroundColor: '#ffffff',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      whiteSpace: 'nowrap'
                    }}>
                      {item.count}
                    </span>

                    {/* Column bar */}
                    <div 
                      style={{ 
                        width: '26px', 
                        height: `${colHeight}px`, 
                        backgroundColor: isSelected ? '#1b5e20' : (item.name === 'Estoque Central' ? '#2b6cb0' : '#2e7d32'),
                        borderRadius: '4px 4px 0 0',
                        transition: 'all 0.3s ease',
                        boxShadow: isSelected ? '0 0 8px rgba(27, 94, 32, 0.4)' : 'none',
                        border: isSelected ? '1px solid #113f14' : 'none'
                      }}
                    />

                    {/* Short abbreviation under bar */}
                    <span 
                      style={{ 
                        fontSize: '10.5px', 
                        fontWeight: '600', 
                        color: isSelected ? '#1b5e20' : '#4a5568', 
                        marginTop: '8px', 
                        textAlign: 'center', 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        width: '100%' 
                      }}
                      title={item.name}
                    >
                      {displayName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Custom Interactive Leaderboard Grid for Locations/Units
  const InteractiveLeaderboardGrid = ({ title, data, selectedValue, onSelect, valueSuffix = "unidades" }) => {
    const total = data.reduce((sum, d) => sum + d.count, 0);
    const maxVal = Math.max(...data.map(d => d.count), 1);
    const rankColors = ['#ecc94b', '#cbd5e0', '#ed8936', '#4299e1', '#48bb78'];

    return (
      <div className="card" style={{ padding: '20px 24px', margin: 0, display: 'flex', flexDirection: 'column', height: '350px', boxSizing: 'border-box' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1a365d', flexShrink: 0 }}>{title}</h3>
        {data.length === 0 ? (
          <p style={{ color: '#a0aec0', fontSize: '13px', textAlign: 'center', padding: '40px 0', margin: 'auto' }}>
            Sem carga ativa alocada sob os filtros de status selecionados.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
            {data.map((item, idx) => {
              const isSelected = selectedValue === item.name;
              const pct = (item.count / maxVal) * 100;
              const totalPct = total > 0 ? ((item.count / total) * 100).toFixed(0) : 0;
              const rankColor = rankColors[idx] || '#cbd5e0';

              return (
                <div 
                  key={idx}
                  onClick={() => onSelect(isSelected ? 'Todas' : item.name)}
                  style={{ 
                    cursor: 'pointer', 
                    padding: '8px', 
                    borderRadius: '6px',
                    backgroundColor: isSelected ? '#f0fff4' : 'transparent',
                    border: isSelected ? '1px solid #48bb78' : '1px solid #edf2f7',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                  className="hover:bg-slate-50"
                  title={`Filtrar por: ${item.name}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '80%' }}>
                      {/* Rank Indicator */}
                      <span style={{ 
                        fontSize: '9px', 
                        fontWeight: '900', 
                        color: idx < 3 ? '#ffffff' : '#718096', 
                        backgroundColor: idx < 3 ? rankColor : '#edf2f7',
                        borderRadius: '50%',
                        width: '18px',
                        height: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        #{idx + 1}
                      </span>
                      
                      <span style={{ 
                        fontWeight: isSelected ? 'bold' : '600', 
                        color: isSelected ? '#276749' : '#2d3748',
                        fontSize: '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {item.name}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1a202c' }}>
                        {item.count}
                      </span>
                      <span style={{ fontSize: '10px', color: '#718096' }}>
                        ({totalPct}%)
                      </span>
                    </div>
                  </div>

                  {/* Tiny progress line */}
                  <div style={{ width: '100%', height: '4px', backgroundColor: '#edf2f7', borderRadius: '2px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${pct}%`, 
                        height: '100%', 
                        backgroundColor: idx === 0 ? '#d69e2e' : idx === 1 ? '#718096' : idx === 2 ? '#dd6b20' : '#48bb78', 
                        borderRadius: '2px',
                        transition: 'width 0.4s ease'
                      }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>📊 Central Inteligente de Estoque</h1>
        <p>Visão geral em tempo real com auditoria relacional, gráficos interativos, controle de estados e drill-down de cautelas.</p>
      </div>

      {/* Sub-Abas do Dashboard */}
      <div style={{ display: 'flex', borderBottom: '2px solid #edf2f7', marginBottom: '20px', gap: '24px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setDashboardTab('geral')}
          style={{
            padding: '12px 4px',
            fontSize: '15px',
            fontWeight: dashboardTab === 'geral' ? 'bold' : '500',
            color: dashboardTab === 'geral' ? '#1a365d' : '#718096',
            borderBottom: dashboardTab === 'geral' ? '3px solid #1a365d' : '3px solid transparent',
            background: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderTop: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '-2px'
          }}
        >
          📊 Painel Geral e Métricas
        </button>
        <button 
          onClick={() => setDashboardTab('detalhado')}
          style={{
            padding: '12px 4px',
            fontSize: '15px',
            fontWeight: dashboardTab === 'detalhado' ? 'bold' : '500',
            color: dashboardTab === 'detalhado' ? '#1a365d' : '#718096',
            borderBottom: dashboardTab === 'detalhado' ? '3px solid #1a365d' : '3px solid transparent',
            background: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderTop: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '-2px'
          }}
        >
          🔍 Detalhado por Categoria e Gráficos Avançados
        </button>
        <button 
          onClick={() => setDashboardTab('vencimentos')}
          style={{
            padding: '12px 4px',
            fontSize: '15px',
            fontWeight: dashboardTab === 'vencimentos' ? 'bold' : '500',
            color: dashboardTab === 'vencimentos' ? (dashboardExpiredCount > 0 ? '#c53030' : '#dd6b20') : '#718096',
            borderBottom: dashboardTab === 'vencimentos' ? (dashboardExpiredCount > 0 ? '3px solid #c53030' : '3px solid #dd6b20') : '3px solid transparent',
            background: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderTop: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '-2px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>⚠️ Alerta de Vencimentos</span>
          {expiringAndExpiredDashboardItems.length > 0 && (
            <span style={{
              backgroundColor: dashboardExpiredCount > 0 ? '#e53e3e' : '#dd6b20',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 'bold',
              padding: '2px 8px',
              borderRadius: '12px'
            }}>
              {expiringAndExpiredDashboardItems.length}
            </span>
          )}
        </button>
      </div>

      {dashboardTab === 'detalhado' ? (
        <DashboardDetalhes 
          items={items} 
          allBens={allBens} 
          allCautelas={allCautelas} 
          STATUS_DETAILS={STATUS_DETAILS} 
          onNavigate={onNavigate} 
        />
      ) : dashboardTab === 'vencimentos' ? (
        <div className="card" style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#1a365d', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚠️ Auditoria e Alerta de Vencimentos (Estoque & Cautelas)
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#4a5568' }}>
                Monitoramento preventivo de itens com validade expirada ou com vencimento nos próximos 6 meses (180 dias).
              </p>
            </div>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setDashboardTab('geral')}
            >
              ← Voltar ao Painel Geral
            </button>
          </div>

          {/* Cards Resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#fffaf0', border: '1px solid #feebc8' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#dd6b20', textTransform: 'uppercase' }}>Total em Alerta (≤ 6 Meses)</span>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#c05621', marginTop: '4px' }}>{expiringAndExpiredDashboardItems.length}</div>
              <span style={{ fontSize: '11px', color: '#7b341e' }}>Estoque Central + Cautelas Ativas</span>
            </div>
            <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#fff5f5', border: '1px solid #fed7d7' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#e53e3e', textTransform: 'uppercase' }}>🔴 Já Vencidos</span>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#9b2c2c', marginTop: '4px' }}>{dashboardExpiredCount}</div>
              <span style={{ fontSize: '11px', color: '#9b2c2c' }}>Ação imediata necessária</span>
            </div>
            <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#fffff0', border: '1px solid #fefcbf' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#d69e2e', textTransform: 'uppercase' }}>🟠 A Vencer (1 a 180 dias)</span>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#b7791f', marginTop: '4px' }}>{dashboardWarningCount}</div>
              <span style={{ fontSize: '11px', color: '#744210' }}>Planejamento de substituição</span>
            </div>
          </div>

          {/* Tabela Completa */}
          {expiringAndExpiredDashboardItems.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f7fafc', borderRadius: '8px', color: '#4a5568' }}>
              <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>✅</span>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#2f855a' }}>Nenhum Item Próximo ao Vencimento</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>Todos os itens e materiais do acervo possuem validade superior a 6 meses ou não requerem controle de data.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: '#edf2f7', color: '#2d3748', fontWeight: 'bold', borderBottom: '2px solid #cbd5e0' }}>
                    <th style={{ padding: '10px 14px' }}>Status / Prazo</th>
                    <th style={{ padding: '10px 14px' }}>Descrição do Item</th>
                    <th style={{ padding: '10px 14px' }}>Série / Lote</th>
                    <th style={{ padding: '10px 14px' }}>Categoria</th>
                    <th style={{ padding: '10px 14px' }}>Localização / Posse Atual</th>
                    <th style={{ padding: '10px 14px' }}>Data de Validade</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringAndExpiredDashboardItems.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #edf2f7', backgroundColor: item.days < 0 ? '#fff5f5' : '#ffffff' }}>
                      <td style={{ padding: '10px 14px' }}>
                        {item.days < 0 ? (
                          <span style={{ backgroundColor: '#e53e3e', color: '#ffffff', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px', display: 'inline-block' }}>
                            🔴 VENCIDO ({Math.abs(item.days)}d atrás)
                          </span>
                        ) : (
                          <span style={{ backgroundColor: '#dd6b20', color: '#ffffff', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px', display: 'inline-block' }}>
                            🟠 Vence em {item.days} dias
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 'bold', color: '#1a202c' }}>{item.descricao}</td>
                      <td style={{ padding: '10px 14px' }}>{item.serie}</td>
                      <td style={{ padding: '10px 14px' }}>{item.categoria}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {item.isAcautelado ? (
                          <span style={{ color: '#2b6cb0', fontWeight: '600' }}>
                            📜 Cautela: {item.posseNome} <span style={{ color: '#718096', fontWeight: 'normal' }}>({item.posseLotacao})</span>
                          </span>
                        ) : (
                          <span style={{ color: '#2f855a', fontWeight: '600' }}>
                            📦 Estoque Central (SGA)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 'bold', color: '#2d3748' }}>{formatLocalDate(item.dt_val)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Banner de resumo de Alerta de Vencimento no Painel Geral */}
          {expiringAndExpiredDashboardItems.length > 0 && (
            <div className="card" style={{
              backgroundColor: dashboardExpiredCount > 0 ? '#fff5f5' : '#fffaf0',
              border: dashboardExpiredCount > 0 ? '2px solid #e53e3e' : '2px solid #dd6b20',
              borderRadius: '8px',
              padding: '14px 20px',
              marginBottom: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>⚠️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: dashboardExpiredCount > 0 ? '#9b2c2c' : '#9c4221' }}>
                    Alerta de Vencimentos de Itens ({expiringAndExpiredDashboardItems.length})
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#4a5568' }}>
                    Há <strong style={{ color: '#c53030' }}>{dashboardExpiredCount} item(ns) VENCIDOS</strong> e <strong style={{ color: '#dd6b20' }}>{dashboardWarningCount} a vencer em até 6 meses</strong> no estoque ou acautelados.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDashboardTab('vencimentos')}
                className="btn btn-sm"
                style={{
                  backgroundColor: dashboardExpiredCount > 0 ? '#e53e3e' : '#dd6b20',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
              >
                Ver Aba de Vencimentos →
              </button>
            </div>
          )}

          {/* Top Interactive Metric Counters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '24px' }}>
        <div 
          onClick={handleResetFilters}
          style={{ 
            padding: '16px 20px', 
            minHeight: '110px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderLeft: '4px solid #1a365d', 
            cursor: 'pointer',
            backgroundColor: !hasActiveFilters ? '#f7fafc' : '#ffffff',
            transform: !hasActiveFilters ? 'scale(1.02)' : 'none',
            transition: 'all 0.2s ease',
            border: !hasActiveFilters ? '1px solid #cbd5e0' : '1px solid transparent'
          }} 
          className="card hover:shadow-md"
          title="Clique para ver todos os itens"
        >
          <span style={{ fontSize: '11px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase' }}>Total em Acervo</span>
          <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#1a202c', display: 'block', marginTop: '2px' }}>
            {loading ? '...' : stats.total}
          </span>
          <span style={{ fontSize: '10px', color: '#a0aec0', display: 'block', marginTop: '2px' }}>Clique para redefinir filtros</span>
        </div>

        <div 
          onClick={() => {
            setSelectedStatus(selectedStatus === 'Disponivel' ? 'Todos' : 'Disponivel');
            setShowOnlyCritical(false);
          }}
          style={{ 
            padding: '16px 20px', 
            minHeight: '110px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderLeft: '4px solid #48bb78', 
            cursor: 'pointer',
            backgroundColor: selectedStatus === 'Disponivel' ? '#f0fff4' : '#ffffff',
            transform: selectedStatus === 'Disponivel' ? 'scale(1.02)' : 'none',
            transition: 'all 0.2s ease',
            border: selectedStatus === 'Disponivel' ? '1px solid #c6f6d5' : '1px solid transparent'
          }} 
          className="card hover:shadow-md"
          title="Clique para filtrar apenas Disponíveis"
        >
          <span style={{ fontSize: '11px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase' }}>Estoque Disponível</span>
          <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#2f855a', display: 'block', marginTop: '2px' }}>
            {loading ? '...' : stats.available}
          </span>
          <span style={{ fontSize: '10px', color: '#718096', display: 'block', marginTop: '2px' }}>
            {selectedStatus === 'Disponivel' ? '🎯 Filtrando Disponíveis' : 'Clique para filtrar'}
          </span>
        </div>

        <div 
          onClick={() => {
            setSelectedStatus(selectedStatus === 'Em Uso' ? 'Todos' : 'Em Uso');
            setShowOnlyCritical(false);
          }}
          style={{ 
            padding: '16px 20px', 
            minHeight: '110px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderLeft: '4px solid #3182ce', 
            cursor: 'pointer',
            backgroundColor: selectedStatus === 'Em Uso' ? '#ebf8ff' : '#ffffff',
            transform: selectedStatus === 'Em Uso' ? 'scale(1.02)' : 'none',
            transition: 'all 0.2s ease',
            border: selectedStatus === 'Em Uso' ? '1px solid #bee3f8' : '1px solid transparent'
          }} 
          className="card hover:shadow-md"
          title="Clique para filtrar apenas Em Uso"
        >
          <span style={{ fontSize: '11px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase' }}>Em Carga / Cautela</span>
          <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#2b6cb0', display: 'block', marginTop: '2px' }}>
            {loading ? '...' : stats.inUse}
          </span>
          <span style={{ fontSize: '10px', color: '#718096', display: 'block', marginTop: '2px' }}>
            {selectedStatus === 'Em Uso' ? '🎯 Filtrando Em Carga' : 'Clique para filtrar'}
          </span>
        </div>

        <div 
          onClick={() => {
            setShowOnlyCritical(!showOnlyCritical);
            setSelectedStatus('Todos');
          }}
          style={{ 
            padding: '16px 20px', 
            minHeight: '110px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderLeft: '4px solid #e53e3e', 
            cursor: 'pointer',
            backgroundColor: showOnlyCritical ? '#fff5f5' : '#ffffff',
            transform: showOnlyCritical ? 'scale(1.02)' : 'none',
            transition: 'all 0.2s ease',
            border: showOnlyCritical ? '1px solid #fed7d7' : '1px solid transparent'
          }} 
          className="card hover:shadow-md"
          title="Clique para filtrar Estoque Crítico"
        >
          <span style={{ fontSize: '11px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase' }}>Alertas Críticos</span>
          <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#e53e3e', display: 'block', marginTop: '2px' }}>
            {loading ? '...' : stats.critical}
          </span>
          <span style={{ fontSize: '10px', color: '#e53e3e', display: 'block', marginTop: '2px' }}>
            {showOnlyCritical ? '🎯 Filtrando Críticos' : 'Clique para ver alertas'}
          </span>
        </div>
      </div>

      {/* Active Filters Bar and Control Strip */}
      <div className="card" style={{ padding: '20px', marginBottom: '24px', borderLeft: '4px solid #cbd5e0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#4a5568' }}>Filtros Ativos:</span>
            {!hasActiveFilters ? (
              <span style={{ fontSize: '13px', color: '#718096', fontStyle: 'italic' }}>Nenhum filtro aplicado (exibindo acervo geral)</span>
            ) : (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {selectedCategory !== 'Todas' && (
                  <span className="badge badge-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                    📁 Categoria: {selectedCategory} 
                    <button onClick={() => setSelectedCategory('Todas')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2b6cb0', fontWeight: 'bold' }}>×</button>
                  </span>
                )}
                {selectedStatus !== 'Todos' && (
                  <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                    📈 Estado: {STATUS_DETAILS[selectedStatus]?.label || selectedStatus} 
                    <button onClick={() => setSelectedStatus('Todos')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2f855a', fontWeight: 'bold' }}>×</button>
                  </span>
                )}
                {selectedDepto !== 'Todos' && (
                  <span className="badge badge-orange" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                    🏢 Depto: {selectedDepto} 
                    <button onClick={() => setSelectedDepto('Todos')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#c05621', fontWeight: 'bold' }}>×</button>
                  </span>
                )}
                {selectedLotacao !== 'Todas' && (
                  <span className="badge badge-purple" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                    📍 Lotação: {selectedLotacao} 
                    <button onClick={() => setSelectedLotacao('Todas')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b46c1', fontWeight: 'bold' }}>×</button>
                  </span>
                )}
                {showOnlyCritical && (
                  <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                    ⚠️ Somente Estoque Crítico
                    <button onClick={() => setShowOnlyCritical(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9b2c2c', fontWeight: 'bold' }}>×</button>
                  </span>
                )}
                {searchQuery && (
                  <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                    🔍 Busca: "{searchQuery}" 
                    <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#4a5568', fontWeight: 'bold' }}>×</button>
                  </span>
                )}
                <button 
                  onClick={handleResetFilters}
                  style={{ 
                    fontSize: '11px', 
                    padding: '2px 8px', 
                    borderRadius: '4px', 
                    border: '1px solid #cbd5e0', 
                    backgroundColor: '#fff', 
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    color: '#4a5568'
                  }}
                  className="hover:bg-gray-100"
                >
                  🧹 Limpar Tudo
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="btn btn-xs btn-outline"
              onClick={handleResetFilters}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}
              title="Desmarcar todos os filtros e redefinir para o padrão"
            >
              🧹 Limpar Filtros
            </button>
            <button className="btn btn-xs btn-outline" onClick={() => onNavigate('pg-relatorios-servicos')}>
              📋 Ver Relatórios Completos
            </button>
          </div>
        </div>

        {/* Dropdowns filters panel */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginTop: '20px', borderTop: '1px solid #edf2f7', paddingTop: '20px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#718096' }}>Categoria</label>
            <select 
              value={selectedCategory} 
              onChange={e => setSelectedCategory(e.target.value)}
              style={{ width: '100%', padding: '6px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
            >
              <option value="Todas">Todas as Categorias</option>
              <option value="Armas">Armas</option>
              <option value="Coletes">Coletes Balísticos</option>
              <option value="Munições">Munições</option>
              <option value="Equipamentos">Equipamentos</option>
              <option value="Uniformes">Uniformes</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#718096' }}>Estado / Situação</label>
            <select 
              value={selectedStatus} 
              onChange={e => setSelectedStatus(e.target.value)}
              style={{ width: '100%', padding: '6px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
            >
              <option value="Todos">Qualquer Status</option>
              {Object.entries(STATUS_DETAILS).map(([key, info]) => (
                key !== 'Todos' && <option key={key} value={key}>{info.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#718096' }}>Departamento</label>
            <select 
              value={selectedDepto} 
              onChange={e => {
                setSelectedDepto(e.target.value);
                setSelectedLotacao('Todas');
              }}
              style={{ width: '100%', padding: '6px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
            >
              <option value="Todos">Todos os Departamentos</option>
              <option value="Estoque Central (SGA)">Estoque Central (SGA)</option>
              {allDashboardDeptos.map(d => (
                <option key={d.name} value={d.name}>{d.name} ({d.sigla})</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#718096' }}>Lotação / Unidade</label>
            <select 
              value={selectedLotacao} 
              onChange={e => setSelectedLotacao(e.target.value)}
              style={{ width: '100%', padding: '6px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
            >
              <option value="Todas">{selectedDepto !== 'Todos' ? 'Todas as Unidades do Depto' : 'Todas as Unidades'}</option>
              <option value="Estoque Central">Estoque Central (SGA)</option>
              {allDashboardLotacoes.map(lName => (
                <option key={lName} value={lName}>{lName}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Top 2 Charts - Side by Side Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {/* Category Donut Chart */}
        <InteractiveDonutChart 
          title="📁 Itens por Categoria (Clique para filtrar)" 
          data={categoryStats} 
          selectedValue={selectedCategory} 
          onSelect={setSelectedCategory} 
        />
        
        {/* Status Bento Grid */}
        <StatusGridCards 
          title="📈 Status do Item" 
          data={statusStats} 
          selectedValue={selectedStatus} 
          onSelect={setSelectedStatus} 
        />
      </div>

      {/* Leaderboard Chart */}
      <div style={{ marginBottom: '24px' }}>
        <InteractiveLeaderboardGrid 
          title="📍 Carga por Unidade" 
          data={lotacaoStats} 
          selectedValue={selectedLotacao} 
          onSelect={setSelectedLotacao} 
          valueSuffix="un." 
        />
      </div>

      {/* Full-width Departments Column Chart */}
      <div style={{ marginBottom: '24px' }}>
        <InteractiveVerticalColumnChart 
          title="🏢 Inventário por Departamento" 
          data={deptoStats} 
          selectedValue={selectedDepto} 
          onSelect={setSelectedDepto} 
          valueSuffix="un." 
        />
      </div>
      </>
      )}
    </div>
  );
}

// ==========================================
// VIEW: Dashboard Serviços
// ==========================================
function DashboardServicosView({ counts, onNavigate }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dashboardTab, setDashboardTab] = useState('geral'); // 'geral' | 'detalhado'

  // Interactive filters
  const [selectedStatus, setSelectedStatus] = useState('Todos');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedArmeiro, setSelectedArmeiro] = useState('Todos');
  const [selectedLotacao, setSelectedLotacao] = useState('Todas');
  const [searchQuery, setSearchQuery] = useState('');

  // Read-only modal state
  const [selectedService, setSelectedService] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const handleRowClick = (service) => {
    setSelectedService(service);
    setIsDetailModalOpen(true);
  };

  useEffect(() => {
    const loadServices = async () => {
      try {
        setLoading(true);
        // Fetch up to 2000 services for full analytics support
        const data = await apiService.getList('servicos', new URLSearchParams({ page_size: '2000' }));
        setServices(data.results || data || []);
      } catch (err) {
        console.error('Erro ao carregar serviços para o painel:', err);
      } finally {
        setLoading(false);
      }
    };
    loadServices();
  }, []);

  const handleResetFilters = () => {
    setSelectedStatus('Todos');
    setSelectedCategory('Todas');
    setSelectedArmeiro('Todos');
    setSelectedLotacao('Todas');
    setSearchQuery('');
  };

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

  const STATUS_MAP = {
    'Aberto': { label: 'Aberto 📝', color: '#dd6b20', bg: '#fffaf0' },
    'Em Andamento': { label: 'Em Andamento ⚙️', color: '#3182ce', bg: '#ebf8ff' },
    'Aguardando Peça': { label: 'Aguardando Peça ⏳', color: '#ecc94b', bg: '#fefcbf' },
    'Concluído': { label: 'Concluído ✅', color: '#48bb78', bg: '#f0fff4' },
  };

  const getFilteredServicesExcept = (excludeKey) => {
    return services.filter(s => {
      if (excludeKey !== 'status' && selectedStatus !== 'Todos') {
        if (String(s.status || '').toLowerCase().trim() !== String(selectedStatus).toLowerCase().trim()) {
          return false;
        }
      }
      if (excludeKey !== 'category' && selectedCategory !== 'Todas') {
        const cat = String(s.categoria || s.item_categoria || '').toLowerCase();
        const sel = String(selectedCategory).toLowerCase();
        if (!cat.includes(sel) && !sel.includes(cat)) {
          return false;
        }
      }
      if (excludeKey !== 'armeiro' && selectedArmeiro !== 'Todos') {
        if (String(s.armeiro || '').toLowerCase().trim() !== String(selectedArmeiro).toLowerCase().trim()) {
          return false;
        }
      }
      if (excludeKey !== 'lotacao' && selectedLotacao !== 'Todas') {
        const lotStr = String(s.lotacao || s.depto || '').toLowerCase().trim();
        if (lotStr !== String(selectedLotacao).toLowerCase().trim()) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const code = String(s.codigo || '').toLowerCase().includes(q);
        const arm = String(s.armeiro || '').toLowerCase().includes(q);
        const pol = String(s.policial_nome || '').toLowerCase().includes(q);
        const mat = String(s.matricula || '').toLowerCase().includes(q);
        const model = String(s.modelo || '').toLowerCase().includes(q);
        const brand = String(s.marca || '').toLowerCase().includes(q);
        const serie = String(s.serie || '').toLowerCase().includes(q);
        const type = String(s.tipo || '').toLowerCase().includes(q);

        if (!code && !arm && !pol && !mat && !model && !brand && !serie && !type) {
          return false;
        }
      }
      return true;
    });
  };

  const filteredServices = getFilteredServicesExcept('none');

  const [servicosCurrentPage, setServicosCurrentPage] = React.useState(1);
  const servicosItemsPerPage = 50;

  React.useEffect(() => {
    setServicosCurrentPage(1);
  }, [selectedStatus, selectedCategory, selectedArmeiro, selectedLotacao, searchQuery]);

  const servicosTotalPages = Math.ceil(filteredServices.length / servicosItemsPerPage) || 1;
  const paginatedServices = React.useMemo(() => {
    const start = (servicosCurrentPage - 1) * servicosItemsPerPage;
    return filteredServices.slice(start, start + servicosItemsPerPage);
  }, [filteredServices, servicosCurrentPage]);

  // Dynamic filter values
  const uniqueArmeiros = React.useMemo(() => {
    const set = new Set();
    services.forEach(s => { if (s.armeiro) set.add(s.armeiro); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }, [services]);

  const uniqueLotacoes = React.useMemo(() => {
    const set = new Set();
    services.forEach(s => {
      const loc = s.lotacao || s.depto;
      if (loc) set.add(loc);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }, [services]);

  // Aggregate Metrics for counter cards
  const metrics = React.useMemo(() => {
    const stats = { total: 0, concluido: 0, andamento: 0, aguardando: 0 };
    const filtered = getFilteredServicesExcept('status');
    stats.total = filtered.length;
    filtered.forEach(s => {
      const status = s.status || 'Aberto';
      if (status === 'Concluído') stats.concluido++;
      else if (status === 'Em Andamento') stats.andamento++;
      else if (status === 'Aguardando Peça') stats.aguardando++;
    });
    return stats;
  }, [services, selectedCategory, selectedArmeiro, selectedLotacao, searchQuery]);

  // Status statistics for Interactive Donut
  const statusStats = React.useMemo(() => {
    const counts = { 'Aberto': 0, 'Em Andamento': 0, 'Aguardando Peça': 0, 'Concluído': 0 };
    const filtered = getFilteredServicesExcept('status');
    filtered.forEach(s => {
      const st = s.status || 'Aberto';
      if (counts[st] !== undefined) counts[st]++;
      else counts[st] = (counts[st] || 0) + 1;
    });
    return Object.entries(counts).map(([key, val]) => {
      const info = STATUS_MAP[key] || { label: key, color: '#718096', bg: '#edf2f7' };
      return { key, name: info.label.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim(), count: val, color: info.color, bg: info.bg };
    });
  }, [services, selectedCategory, selectedArmeiro, selectedLotacao, searchQuery]);

  // Category stats for radial gauge grid
  const categoryStats = React.useMemo(() => {
    const counts = { 'Armas': 0, 'Coletes': 0, 'Munições': 0, 'Equipamentos': 0, 'Uniformes': 0 };
    const filtered = getFilteredServicesExcept('category');
    filtered.forEach(s => {
      const cat = String(s.categoria || s.item_categoria || '').toLowerCase();
      let mapped = 'Equipamentos';
      if (cat.includes('arma')) mapped = 'Armas';
      else if (cat.includes('colete')) mapped = 'Coletes';
      else if (cat.includes('muni')) mapped = 'Munições';
      else if (cat.includes('uni')) mapped = 'Uniformes';
      counts[mapped]++;
    });
    const colors = {
      'Armas': '#1a365d',
      'Coletes': '#3182ce',
      'Munições': '#d69e2e',
      'Equipamentos': '#48bb78',
      'Uniformes': '#805ad5',
    };
    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      color: colors[name] || '#718096'
    })).sort((a, b) => b.count - a.count);
  }, [services, selectedStatus, selectedArmeiro, selectedLotacao, searchQuery]);

  // Armorers Top 5
  const armeiroStats = React.useMemo(() => {
    const counts = {};
    const filtered = getFilteredServicesExcept('armeiro');
    filtered.forEach(s => {
      if (s.armeiro) counts[s.armeiro] = (counts[s.armeiro] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      color: '#3182ce'
    })).sort((a, b) => b.count - a.count);
  }, [services, selectedStatus, selectedCategory, selectedLotacao, searchQuery]);

  // Units Top 5 requesting services
  const unitStats = React.useMemo(() => {
    const counts = {};
    const filtered = getFilteredServicesExcept('lotacao');
    filtered.forEach(s => {
      const loc = s.lotacao || s.depto;
      if (loc) counts[loc] = (counts[loc] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      color: '#48bb78'
    })).sort((a, b) => b.count - a.count);
  }, [services, selectedStatus, selectedCategory, selectedArmeiro, searchQuery]);

  // Replaced parts stats for detailed dashboard
  const replacedPartsStats = React.useMemo(() => {
    const counts = {};
    services.forEach(s => {
      if (s.pecas_substituidas && typeof s.pecas_substituidas === 'object') {
        Object.entries(s.pecas_substituidas).forEach(([partName, qty]) => {
          if (qty > 0) counts[partName] = (counts[partName] || 0) + Number(qty);
        });
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [services]);

  // Armeros detailed analytics list
  const armerosDetailedList = React.useMemo(() => {
    const armorersData = {};
    services.forEach(s => {
      if (!s.armeiro) return;
      if (!armorersData[s.armeiro]) {
        armorersData[s.armeiro] = { name: s.armeiro, total: 0, completed: 0, pending: 0, partsUsed: 0 };
      }
      const data = armorersData[s.armeiro];
      data.total++;
      if (s.status === 'Concluído') data.completed++;
      else data.pending++;

      if (s.pecas_substituidas && typeof s.pecas_substituidas === 'object') {
        Object.values(s.pecas_substituidas).forEach(qty => {
          data.partsUsed += Number(qty || 0);
        });
      }
    });
    return Object.values(armorersData).sort((a, b) => b.total - a.total);
  }, [services]);

  const hasActiveFilters = selectedStatus !== 'Todos' || selectedCategory !== 'Todas' || selectedArmeiro !== 'Todos' || selectedLotacao !== 'Todas' || searchQuery !== '';

  // Custom Local Components for Services
  const ServiceDonutChart = ({ title, data, selectedValue, onSelect }) => {
    const total = data.reduce((sum, d) => sum + d.count, 0);
    let accumulatedPercent = 0;

    return (
      <div className="card" style={{ padding: '20px 24px', margin: 0, display: 'flex', flexDirection: 'column', height: '350px', boxSizing: 'border-box' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1a365d', flexShrink: 0 }}>{title}</h3>
        {total === 0 ? (
          <p style={{ color: '#a0aec0', fontSize: '13px', textAlign: 'center', padding: '40px 0', margin: 'auto' }}>
            Nenhum serviço correspondente.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'space-between', flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0, padding: '2px 0' }}>
              <div style={{ position: 'relative', width: '115px', height: '115px' }}>
                <svg width="100%" height="100%" viewBox="0 0 42 42" className="donut-svg">
                  <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#edf2f7" strokeWidth="4.5" />
                  {data.map((item, idx) => {
                    const percent = (item.count / total) * 100;
                    if (percent === 0) return null;
                    const strokeDasharray = `${percent} ${100 - percent}`;
                    const strokeDashoffset = 100 - accumulatedPercent + 25;
                    accumulatedPercent += percent;
                    const isSelected = selectedValue === item.key;

                    return (
                      <circle
                        key={idx}
                        cx="21"
                        cy="21"
                        r="15.915"
                        fill="transparent"
                        stroke={item.color}
                        strokeWidth={isSelected ? "6" : "4.5"}
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        style={{ 
                          transition: 'all 0.3s ease', 
                          cursor: 'pointer',
                          opacity: (selectedValue === 'Todos' || isSelected) ? 1 : 0.4
                        }}
                        onClick={() => onSelect(isSelected ? 'Todos' : item.key)}
                        title={`${item.name}: ${item.count} un. (${percent.toFixed(1)}%)`}
                      />
                    );
                  })}
                </svg>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <span style={{ fontSize: '17px', fontWeight: 'bold', color: '#1a202c', display: 'block' }}>{total}</span>
                  <span style={{ fontSize: '9px', color: '#718096', textTransform: 'uppercase', fontWeight: 'bold' }}>Serviços</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', maxHeight: '130px', paddingRight: '4px' }}>
              {data.map((item, idx) => {
                const isSelected = selectedValue === item.key;
                const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;
                return (
                  <div 
                    key={idx} 
                    onClick={() => onSelect(isSelected ? 'Todos' : item.key)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      fontSize: '11px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#ebf8ff' : 'transparent',
                      border: isSelected ? `1px solid ${item.color}` : '1px solid transparent',
                      transition: 'all 0.15s ease',
                      opacity: (selectedValue === 'Todos' || isSelected) ? 1 : 0.7
                    }}
                    className="hover:bg-slate-50"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color }} />
                      <span style={{ fontWeight: isSelected ? 'bold' : '500', color: isSelected ? '#1a365d' : '#4a5568' }}>{item.name}</span>
                    </div>
                    <span style={{ fontWeight: '700', color: '#2d3748' }}>
                      {item.count} <span style={{ fontSize: '9px', fontWeight: 'normal', color: '#718096' }}>({pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const ServiceCategoryBentoCards = ({ title, data, selectedValue, onSelect }) => {
    const total = data.reduce((sum, d) => sum + d.count, 0);

    return (
      <div className="card" style={{ padding: '20px 24px', margin: 0, display: 'flex', flexDirection: 'column', height: '350px', boxSizing: 'border-box' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1a365d', flexShrink: 0 }}>{title}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
          {data.map((s) => {
            const isActive = selectedValue === s.name;
            const pct = total > 0 ? (s.count / total) * 100 : 0;
            const radius = 10;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (pct / 100) * circumference;

            return (
              <div
                key={s.name}
                onClick={() => onSelect(isActive ? 'Todas' : s.name)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid ' + (isActive ? s.color : '#e2e8f0'),
                  backgroundColor: isActive ? '#f0fff4' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                  minHeight: '75px'
                }}
                className="hover:bg-slate-50 hover:shadow-sm"
                title={`Filtrar por: ${s.name}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px' }}>
                  <span style={{ 
                    fontSize: '11px', 
                    fontWeight: 'bold', 
                    color: isActive ? '#22543d' : '#4a5568',
                    lineHeight: '1.2',
                    maxWidth: '75%'
                  }}>
                    {s.name}
                  </span>
                  <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
                    <circle cx="12" cy="12" r={radius} fill="none" stroke="#edf2f7" strokeWidth="2.5" />
                    <circle 
                      cx="12" 
                      cy="12" 
                      r={radius} 
                      fill="none" 
                      stroke={s.color} 
                      strokeWidth="3" 
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                    />
                  </svg>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '6px' }}>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: s.color }}>
                    {s.count}
                  </span>
                  <span style={{ fontSize: '9px', color: '#718096', fontWeight: 'bold' }}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const ServiceVerticalColumnChart = ({ title, data, selectedValue, onSelect }) => {
    const maxVal = Math.max(...data.map(d => d.count), 1);
    
    return (
      <div className="card" style={{ padding: '20px 24px', margin: 0, display: 'flex', flexDirection: 'column', height: '280px', boxSizing: 'border-box' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1a365d', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {title}
        </h3>
        {data.length === 0 ? (
          <p style={{ color: '#a0aec0', fontSize: '13px', textAlign: 'center', padding: '40px 0', margin: 'auto' }}>
            Nenhum armeiro ativo nesta seleção.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 }}>
            {/* SVG Column Chart with full horizontal expansion */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'flex-end', 
              justifyContent: 'space-around', 
              gap: '12px', 
              height: '160px', 
              paddingBottom: '4px', 
              borderBottom: '1.5px solid #cbd5e0', 
              position: 'relative',
              overflowX: 'auto',
              scrollbarWidth: 'thin',
              paddingLeft: '12px',
              paddingRight: '12px'
            }}>
              {data.map((item, idx) => {
                const isSelected = selectedValue === item.name;
                const pct = (item.count / maxVal) * 100;
                const colHeight = Math.max(12, (pct / 100) * 120); // Scale max height to 120px

                return (
                  <div 
                    key={idx}
                    onClick={() => onSelect(isSelected ? 'Todos' : item.name)}
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      cursor: 'pointer',
                      flexShrink: 0,
                      width: data.length > 8 ? '60px' : `${100 / data.length}%`,
                      maxWidth: '100px',
                      position: 'relative',
                      transition: 'transform 0.2s ease',
                    }}
                    title={`Clique para filtrar: ${item.name} (${item.count} ordens)`}
                    className="hover:scale-105"
                  >
                    {/* Floating Value */}
                    <span style={{ 
                      fontSize: '11px', 
                      fontWeight: '700', 
                      color: '#1a365d', 
                      marginBottom: '6px',
                      textAlign: 'center'
                    }}>
                      {item.count}
                    </span>

                    {/* Column bar */}
                    <div 
                      style={{ 
                        width: '24px', 
                        height: `${colHeight}px`, 
                        backgroundColor: isSelected ? '#1b5e20' : '#2e7d32',
                        borderRadius: '4px 4px 0 0',
                        transition: 'all 0.3s ease',
                        boxShadow: isSelected ? '0 0 8px rgba(27, 94, 32, 0.4)' : 'none',
                        border: isSelected ? '1px solid #113f14' : 'none'
                      }}
                    />

                    {/* Short abbreviation under bar */}
                    <span style={{ 
                      fontSize: '10px', 
                      fontWeight: 'bold', 
                      color: isSelected ? '#1b5e20' : '#718096', 
                      marginTop: '8px', 
                      textAlign: 'center', 
                      whiteSpace: 'nowrap', 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      width: '100%' 
                    }}>
                      {item.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const ServiceLeaderboardGrid = ({ title, data, selectedValue, onSelect }) => {
    const total = data.reduce((sum, d) => sum + d.count, 0);
    const maxVal = Math.max(...data.map(d => d.count), 1);
    const rankColors = ['#ecc94b', '#cbd5e0', '#ed8936', '#4299e1', '#48bb78'];

    return (
      <div className="card" style={{ padding: '20px 24px', margin: 0, display: 'flex', flexDirection: 'column', height: '350px', boxSizing: 'border-box' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1a365d', flexShrink: 0 }}>{title}</h3>
        {data.length === 0 ? (
          <p style={{ color: '#a0aec0', fontSize: '13px', textAlign: 'center', padding: '40px 0', margin: 'auto' }}>
            Nenhuma unidade solicitante ativa nesta seleção.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
            {data.map((item, idx) => {
              const isSelected = selectedValue === item.name;
              const pct = (item.count / maxVal) * 100;
              const totalPct = total > 0 ? ((item.count / total) * 100).toFixed(0) : 0;
              const rankColor = rankColors[idx] || '#cbd5e0';

              return (
                <div 
                  key={idx}
                  onClick={() => onSelect(isSelected ? 'Todas' : item.name)}
                  style={{ 
                    cursor: 'pointer', 
                    padding: '8px', 
                    borderRadius: '6px',
                    backgroundColor: isSelected ? '#f0fff4' : 'transparent',
                    border: isSelected ? '1px solid #48bb78' : '1px solid #edf2f7',
                    transition: 'all 0.15s ease'
                  }}
                  className="hover:bg-slate-50"
                  title={`Filtrar por: ${item.name}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '80%' }}>
                      <span style={{ 
                        fontSize: '9px', 
                        fontWeight: '900', 
                        color: idx < 3 ? '#ffffff' : '#718096', 
                        backgroundColor: idx < 3 ? rankColor : '#edf2f7',
                        borderRadius: '50%',
                        width: '18px',
                        height: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        #{idx + 1}
                      </span>
                      
                      <span style={{ 
                        fontWeight: isSelected ? 'bold' : '600', 
                        color: isSelected ? '#276749' : '#2d3748',
                        fontSize: '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {item.name}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1a202c' }}>
                        {item.count}
                      </span>
                      <span style={{ fontSize: '10px', color: '#718096' }}>
                        ({totalPct}%)
                      </span>
                    </div>
                  </div>

                  <div style={{ width: '100%', height: '4px', backgroundColor: '#edf2f7', borderRadius: '2px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${pct}%`, 
                        backgroundColor: idx === 0 ? '#d69e2e' : idx === 1 ? '#718096' : idx === 2 ? '#dd6b20' : '#48bb78', 
                        borderRadius: '2px',
                        transition: 'width 0.4s ease'
                      }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>🔧 Central Inteligente de Armaria e Serviços</h1>
        <p>Visão geral de manutenção de ativos, histórico de reparos, controle de pecas sobressalentes e armoristas.</p>
      </div>

      {/* Sub-Tabs Selector */}
      <div style={{ display: 'flex', borderBottom: '2px solid #edf2f7', marginBottom: '20px', gap: '24px' }}>
        <button 
          onClick={() => setDashboardTab('geral')}
          style={{
            padding: '12px 4px',
            fontSize: '15px',
            fontWeight: dashboardTab === 'geral' ? 'bold' : '500',
            color: dashboardTab === 'geral' ? '#1a365d' : '#718096',
            borderBottom: dashboardTab === 'geral' ? '3px solid #1a365d' : '3px solid transparent',
            background: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderTop: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '-2px'
          }}
        >
          📊 Painel Geral de Serviços
        </button>
        <button 
          onClick={() => setDashboardTab('detalhado')}
          style={{
            padding: '12px 4px',
            fontSize: '15px',
            fontWeight: dashboardTab === 'detalhado' ? 'bold' : '500',
            color: dashboardTab === 'detalhado' ? '#1a365d' : '#718096',
            borderBottom: dashboardTab === 'detalhado' ? '3px solid #1a365d' : '3px solid transparent',
            background: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderTop: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '-2px'
          }}
        >
          🔍 Analítico de Armeiros e Peças
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: '#718096' }}>
          <p style={{ fontSize: '15px', fontWeight: 'bold' }}>Carregando dados relacionais da armaria...</p>
        </div>
      ) : (
        <>
        {dashboardTab === 'geral' ? (
          <>
          {/* Metrics Counter Cards with Quick Filters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
            <div 
              className="card hover:shadow-md" 
              onClick={() => setSelectedStatus('Todos')}
              style={{ 
                padding: '16px 20px', 
                minHeight: '110px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderLeft: '4px solid #1a365d', 
                cursor: 'pointer', 
                backgroundColor: selectedStatus === 'Todos' ? '#f7fafc' : '#ffffff',
                border: selectedStatus === 'Todos' ? '1px solid #1a365d' : '1px solid transparent',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase' }}>🔧 Ordens Totais</span>
                {selectedStatus === 'Todos' && <span style={{ fontSize: '10px', backgroundColor: '#1a365d', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>Filtro Ativo</span>}
              </div>
              <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#1a202c', display: 'block', marginTop: '2px' }}>{metrics.total}</span>
            </div>

            <div 
              className="card hover:shadow-md" 
              onClick={() => setSelectedStatus('Concluído')}
              style={{ 
                padding: '16px 20px', 
                minHeight: '110px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderLeft: '4px solid #48bb78', 
                cursor: 'pointer', 
                backgroundColor: selectedStatus === 'Concluído' ? '#f0fff4' : '#ffffff',
                border: selectedStatus === 'Concluído' ? '1px solid #48bb78' : '1px solid transparent',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase' }}>✅ Concluídos</span>
                {selectedStatus === 'Concluído' && <span style={{ fontSize: '10px', backgroundColor: '#48bb78', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>Filtro Ativo</span>}
              </div>
              <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#2f855a', display: 'block', marginTop: '2px' }}>{metrics.concluido}</span>
            </div>

            <div 
              className="card hover:shadow-md" 
              onClick={() => setSelectedStatus('Em Andamento')}
              style={{ 
                padding: '16px 20px', 
                minHeight: '110px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderLeft: '4px solid #3182ce', 
                cursor: 'pointer', 
                backgroundColor: selectedStatus === 'Em Andamento' ? '#ebf8ff' : '#ffffff',
                border: selectedStatus === 'Em Andamento' ? '1px solid #3182ce' : '1px solid transparent',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase' }}>⚙️ Em Andamento</span>
                {selectedStatus === 'Em Andamento' && <span style={{ fontSize: '10px', backgroundColor: '#3182ce', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>Filtro Ativo</span>}
              </div>
              <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#2b6cb0', display: 'block', marginTop: '2px' }}>{metrics.andamento}</span>
            </div>

            <div 
              className="card hover:shadow-md" 
              onClick={() => setSelectedStatus('Aguardando Peça')}
              style={{ 
                padding: '16px 20px', 
                minHeight: '110px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderLeft: '4px solid #ecc94b', 
                cursor: 'pointer', 
                backgroundColor: selectedStatus === 'Aguardando Peça' ? '#fefcbf' : '#ffffff',
                border: selectedStatus === 'Aguardando Peça' ? '1px solid #ecc94b' : '1px solid transparent',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase' }}>⏳ Aguardando Peça</span>
                {selectedStatus === 'Aguardando Peça' && <span style={{ fontSize: '10px', backgroundColor: '#ecc94b', color: '#1a202c', padding: '2px 6px', borderRadius: '4px' }}>Filtro Ativo</span>}
              </div>
              <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#b7791f', display: 'block', marginTop: '2px' }}>{metrics.aguardando}</span>
            </div>
          </div>

          {/* Interactive Charts - Vertical Stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
            <ServiceDonutChart 
              title="📈 Status das Ordens de Manutenção"
              data={statusStats}
              selectedValue={selectedStatus}
              onSelect={setSelectedStatus}
            />

            <ServiceCategoryBentoCards 
              title="📁 Ordens por Categoria"
              data={categoryStats}
              selectedValue={selectedCategory}
              onSelect={setSelectedCategory}
            />

            <ServiceLeaderboardGrid 
              title="📍 Unidades Solicitantes"
              data={unitStats}
              selectedValue={selectedLotacao}
              onSelect={setSelectedLotacao}
            />
          </div>

          {/* Full-width Armeiro column chart */}
          <div style={{ marginBottom: '20px' }}>
            <ServiceVerticalColumnChart 
              title="🛠️ Carga por Armeiro"
              data={armeiroStats}
              selectedValue={selectedArmeiro}
              onSelect={setSelectedArmeiro}
            />
          </div>

          {/* Search and Filters Dropdown panel */}
          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1a365d' }}>⚙️ Painel de Filtros Avançados</h3>
                {hasActiveFilters && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {selectedStatus !== 'Todos' && (
                      <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                        Status: {selectedStatus} 
                        <button onClick={() => setSelectedStatus('Todos')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#276749', fontWeight: 'bold' }}>×</button>
                      </span>
                    )}
                    {selectedCategory !== 'Todas' && (
                      <span className="badge badge-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                        Categoria: {selectedCategory} 
                        <button onClick={() => setSelectedCategory('Todas')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2b6cb0', fontWeight: 'bold' }}>×</button>
                      </span>
                    )}
                    {selectedArmeiro !== 'Todos' && (
                      <span className="badge badge-orange" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                        👤 Armeiro: {selectedArmeiro} 
                        <button onClick={() => setSelectedArmeiro('Todos')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#c05621', fontWeight: 'bold' }}>×</button>
                      </span>
                    )}
                    {selectedLotacao !== 'Todas' && (
                      <span className="badge badge-purple" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                        📍 Unidade: {selectedLotacao} 
                        <button onClick={() => setSelectedLotacao('Todas')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b46c1', fontWeight: 'bold' }}>×</button>
                      </span>
                    )}
                    {searchQuery && (
                      <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                        🔍 Busca: "{searchQuery}" 
                        <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#4a5568', fontWeight: 'bold' }}>×</button>
                      </span>
                    )}
                    <button onClick={handleResetFilters} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', border: '1px solid #cbd5e0', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 'bold', color: '#4a5568' }} className="hover:bg-gray-100">
                      🧹 Limpar Filtros
                    </button>
                  </div>
                )}
              </div>
              <button className="btn btn-xs btn-outline" onClick={() => onNavigate('pg-registros')}>
                📋 Ver Histórico Completo
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '16px', borderTop: '1px solid #edf2f7', paddingTop: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#718096' }}>Status</label>
                <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}>
                  <option value="Todos">Todos os Status</option>
                  <option value="Aberto">Aberto</option>
                  <option value="Em Andamento">Em Andamento</option>
                  <option value="Aguardando Peça">Aguardando Peça</option>
                  <option value="Concluído">Concluído</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#718096' }}>Categoria</label>
                <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}>
                  <option value="Todas">Todas as Categorias</option>
                  <option value="Armas">Armas</option>
                  <option value="Coletes">Coletes Balísticos</option>
                  <option value="Munições">Munições</option>
                  <option value="Equipamentos">Equipamentos</option>
                  <option value="Uniformes">Uniformes</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#718096' }}>Responsável (Armeiro)</label>
                <select value={selectedArmeiro} onChange={e => setSelectedArmeiro(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}>
                  <option value="Todos">Todos os Armeiros</option>
                  {uniqueArmeiros.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#718096' }}>Origem (Lotação / Unidade)</label>
                <select value={selectedLotacao} onChange={e => setSelectedLotacao(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}>
                  <option value="Todas">Todas as Unidades</option>
                  {uniqueLotacoes.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Table list card */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1a365d' }}>📋 Serviços Encontrados ({filteredServices.length})</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#718096' }}>Consulte ordens de serviço detalhadas sob a filtragem ativa.</p>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="🔍 Buscar código, arma, policial..."
                  style={{ padding: '6px 12px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px', width: '250px' }}
                />
                <button className="btn btn-xs btn-outline" onClick={() => window.print()}>
                  🖨️ Imprimir Lista
                </button>
              </div>
            </div>

            {filteredServices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#718096' }}>
                <p style={{ fontSize: '14px', margin: 0 }}>Nenhuma ordem de serviço correspondente localizada.</p>
                <button onClick={handleResetFilters} className="btn btn-xs btn-outline" style={{ marginTop: '12px' }}>Resetar Filtros</button>
              </div>
            ) : (
              <>
                <div className="table-wrap" style={{ margin: 0, maxHeight: '450px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f7fafc', zIndex: 10 }}>
                    <tr>
                      <th>Código</th>
                      <th>Data Rec.</th>
                      <th>Armeiro</th>
                      <th>Policial / Matrícula</th>
                      <th>Equipamento / Série</th>
                      <th>Tipo de Serviço</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'center' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedServices.map((s, index) => {
                      const statusStyle = STATUS_MAP[s.status] || { color: '#718096', bg: '#edf2f7' };
                      return (
                        <tr key={s.id || index}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{s.codigo}</td>
                          <td>{formatLocalDate(s.data_rec)}</td>
                          <td style={{ fontWeight: '500' }}>{s.armeiro}</td>
                          <td>
                            <div style={{ fontWeight: '600' }}>{s.policial_nome}</div>
                            <div style={{ fontSize: '10px', color: '#718096' }}>Matrícula: {s.matricula || '—'}</div>
                          </td>
                          <td>
                            <div><span className="badge badge-neutral" style={{ fontSize: '9px', padding: '1px 4px', textTransform: 'uppercase' }}>{s.categoria || 'Armas'}</span></div>
                            <div style={{ fontWeight: '600', marginTop: '2px' }}>{s.marca} {s.modelo}</div>
                            <div style={{ fontSize: '11px', color: '#e53e3e', fontFamily: 'monospace', fontWeight: 'bold' }}>Série: {s.serie}</div>
                          </td>
                          <td style={{ fontSize: '12px', fontWeight: '500' }}>{s.tipo}</td>
                          <td>
                            <span 
                              style={{ 
                                fontSize: '10px', 
                                fontWeight: 'bold', 
                                color: statusStyle.color, 
                                backgroundColor: statusStyle.bg,
                                padding: '3px 8px',
                                borderRadius: '12px',
                                display: 'inline-block',
                                border: `1px solid ${statusStyle.color}40`
                              }}
                            >
                              {statusStyle.label || s.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              className="btn btn-xs btn-outline" 
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              onClick={() => handleRowClick(s)}
                            >
                              🔍 Detalhes
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {servicosTotalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }}>
                  <span style={{ color: '#4a5568' }}>
                    Exibindo <strong>{Math.min(filteredServices.length, (servicosCurrentPage - 1) * servicosItemsPerPage + 1)}</strong> a{' '}
                    <strong>{Math.min(filteredServices.length, servicosCurrentPage * servicosItemsPerPage)}</strong> de{' '}
                    <strong>{filteredServices.length}</strong> ordens de serviço
                  </span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => setServicosCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={servicosCurrentPage === 1}
                      style={{ opacity: servicosCurrentPage === 1 ? 0.5 : 1, cursor: servicosCurrentPage === 1 ? 'not-allowed' : 'pointer' }}
                    >
                      ◀ Anterior
                    </button>
                    <span style={{ fontWeight: '500' }}>Página <strong>{servicosCurrentPage}</strong> de <strong>{servicosTotalPages}</strong></span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => setServicosCurrentPage(prev => Math.min(servicosTotalPages, prev + 1))}
                      disabled={servicosCurrentPage === servicosTotalPages}
                      style={{ opacity: servicosCurrentPage === servicosTotalPages ? 0.5 : 1, cursor: servicosCurrentPage === servicosTotalPages ? 'not-allowed' : 'pointer' }}
                    >
                      Próxima ▶
                    </button>
                  </div>
                </div>
              )}
              </>
            )}
          </div>
          </>
        ) : (
          <>
          {/* Detailed Analítico tab: Replaced parts breakdown and Armorer cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            
            {/* Left Column: Top Replaced Parts Leaderboard */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '700', color: '#1a365d' }}>⚙️ Peças de Reposição Mais Substituídas</h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#718096' }}>Análise de desgaste e consumo de insumos na armaria geral.</p>
              
              {replacedPartsStats.length === 0 ? (
                <p style={{ color: '#a0aec0', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>Sem histórico de peças substituídas registrado.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {replacedPartsStats.map((part, idx) => {
                    const maxCount = Math.max(...replacedPartsStats.map(p => p.count), 1);
                    const pct = (part.count / maxCount) * 100;
                    return (
                      <div key={idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '600', color: '#2d3748' }}>🔧 {part.name}</span>
                          <span style={{ fontWeight: 'bold', color: '#1a365d' }}>{part.count} unidades</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: '#edf2f7', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#3182ce', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Armorers general performance list */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '700', color: '#1a365d' }}>👤 Estatísticas de Carga por Armeiro</h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#718096' }}>Produtividade, conclusões e consumo de materiais por operador.</p>
              
              {armerosDetailedList.length === 0 ? (
                <p style={{ color: '#a0aec0', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>Nenhum armeiro registrado.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '350px' }}>
                  {armerosDetailedList.map((arm, idx) => {
                    const completedPct = arm.total > 0 ? (arm.completed / arm.total) * 100 : 0;
                    return (
                      <div key={idx} style={{ padding: '10px', border: '1px solid #edf2f7', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#2d3748' }}>👤 {arm.name}</span>
                          <span className="badge badge-neutral" style={{ fontSize: '10px' }}>{arm.total} ordens atendidas</span>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '11px', color: '#4a5568' }}>
                          <div>Concluídos: <strong style={{ color: '#48bb78' }}>{arm.completed}</strong></div>
                          <div>Pendentes: <strong style={{ color: '#dd6b20' }}>{arm.pending}</strong></div>
                          <div>Peças Usadas: <strong style={{ color: '#3182ce' }}>{arm.partsUsed}</strong></div>
                        </div>

                        {/* Progress bar of resolution */}
                        <div style={{ marginTop: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#718096', marginBottom: '2px' }}>
                            <span>Taxa de Resolução</span>
                            <strong>{completedPct.toFixed(0)}%</strong>
                          </div>
                          <div style={{ width: '100%', height: '5px', backgroundColor: '#edf2f7', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${completedPct}%`, height: '100%', backgroundColor: '#48bb78', borderRadius: '3px' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* All services drilldown with details accordion */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700', color: '#1a365d' }}>🔍 Listagem Completa de Ordens</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {services.slice(0, 15).map(s => {
                const statusStyle = STATUS_MAP[s.status] || { color: '#718096', bg: '#edf2f7' };
                return (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#ffffff' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#1a365d' }}>{s.codigo}</span>
                        <span className="badge badge-neutral" style={{ fontSize: '10px' }}>{s.tipo}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#4a5568', marginTop: '4px' }}>
                        Equipamento: <strong>{s.marca} {s.modelo}</strong> (Série: {s.serie}) — Armeiro: <strong>{s.armeiro}</strong>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', color: statusStyle.color, backgroundColor: statusStyle.bg, padding: '3px 8px', borderRadius: '12px', border: `1px solid ${statusStyle.color}40` }}>
                        {s.status}
                      </span>
                      <button className="btn btn-xs btn-outline" onClick={() => handleRowClick(s)}>Visualizar Ficha</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </>
        )}
        </>
      )}

      {/* Read-Only Details Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        title={`Ficha de Manutenção - ${selectedService?.codigo || ''}`}
        onClose={() => setIsDetailModalOpen(false)}
        footer={
          <button className="btn btn-primary" onClick={() => setIsDetailModalOpen(false)}>
            Fechar Visualização
          </button>
        }
      >
        {selectedService && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #edf2f7', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase', display: 'block' }}>Tipo de Ordem</span>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#2b6cb0' }}>{selectedService.tipo || 'Manutenção Corretiva'}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase', display: 'block' }}>Status Atual</span>
                <span style={{ 
                  fontSize: '12px', 
                  fontWeight: 'bold', 
                  color: STATUS_MAP[selectedService.status]?.color || '#4a5568',
                  backgroundColor: STATUS_MAP[selectedService.status]?.bg || '#edf2f7',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  display: 'inline-block',
                  marginTop: '2px',
                  border: `1px solid ${(STATUS_MAP[selectedService.status]?.color || '#718096')}30`
                }}>
                  {selectedService.status}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase', display: 'block' }}>Data de Recebimento</span>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>{formatLocalDate(selectedService.data_rec)}</span>
              </div>
              {selectedService.data_dev && (
                <div>
                  <span style={{ fontSize: '11px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase', display: 'block' }}>Data de Devolução</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#2f855a' }}>{formatLocalDate(selectedService.data_dev)}</span>
                </div>
              )}
            </div>

            {/* Personnel block */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', backgroundColor: '#f7fafc', padding: '12px', borderRadius: '6px', border: '1px solid #edf2f7' }}>
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '11px', fontWeight: 'bold', color: '#718096', textTransform: 'uppercase' }}>👤 Armeiro Responsável</h4>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{selectedService.armeiro}</div>
                <div style={{ fontSize: '11px', color: '#718096' }}>Armaria Geral - Estoque Central SGA</div>
              </div>
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '11px', fontWeight: 'bold', color: '#718096', textTransform: 'uppercase' }}>👮 Policial Atendido</h4>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{selectedService.policial_nome}</div>
                <div style={{ fontSize: '11px', color: '#718096' }}>
                  Matrícula: {selectedService.matricula || '—'} <br />
                  Unidade: {selectedService.lotacao || selectedService.depto || '—'}
                </div>
              </div>
            </div>

            {/* Equipment block */}
            <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 'bold', color: '#1a365d', textTransform: 'uppercase', borderBottom: '1px solid #edf2f7', paddingBottom: '4px' }}>
                🔫 Especificação do Equipamento
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '12px' }}>
                <div>
                  <strong style={{ color: '#718096' }}>Categoria:</strong> <br />
                  <span className="badge badge-neutral" style={{ fontSize: '10px', textTransform: 'uppercase', marginTop: '2px' }}>{selectedService.categoria || 'Armas'}</span>
                </div>
                <div>
                  <strong style={{ color: '#718096' }}>Marca / Modelo:</strong> <br />
                  <span style={{ fontWeight: 'bold' }}>{selectedService.marca || '—'} {selectedService.modelo || '—'}</span>
                </div>
                <div>
                  <strong style={{ color: '#718096' }}>Número de Série:</strong> <br />
                  <span style={{ fontWeight: 'bold', fontFamily: 'monospace', color: '#e53e3e' }}>{selectedService.serie || '—'}</span>
                </div>
              </div>
            </div>

            {/* Description and Work */}
            <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#fff' }}>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '12px', fontWeight: 'bold', color: '#1a365d', textTransform: 'uppercase' }}>🛠️ Trabalho Realizado / Relatório de Defeito</h4>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap', color: '#2d3748' }}>
                {selectedService.trabalho_realizado || 'Nenhum trabalho específico detalhado até o momento.'}
              </p>
            </div>

            {/* Replaced Parts List inside Modal */}
            <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#fff' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 'bold', color: '#1a365d', textTransform: 'uppercase', borderBottom: '1px solid #edf2f7', paddingBottom: '4px' }}>
                ⚙️ Peças Reconstituídas / Substituídas
              </h4>
              
              {!selectedService.pecas_substituidas || Object.keys(selectedService.pecas_substituidas).filter(k => selectedService.pecas_substituidas[k] > 0).length === 0 ? (
                <p style={{ margin: 0, fontSize: '12px', color: '#a0aec0', fontStyle: 'italic' }}>Nenhuma peça sobressalente foi substituída nesta ordem de serviço.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {Object.entries(selectedService.pecas_substituidas).map(([name, qty]) => {
                    if (Number(qty || 0) <= 0) return null;
                    return (
                      <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '4px 8px', backgroundColor: '#f7fafc', borderRadius: '4px', border: '1px solid #edf2f7' }}>
                        <span style={{ fontWeight: '500' }}>🔧 {name}</span>
                        <span className="badge badge-blue" style={{ fontSize: '10px', fontWeight: 'bold' }}>{qty} un.</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const PECAS_REPOSICAO_TABELAS = {
  Pistolas: [
    'Mola Recuperadora com Guia',
    'Percussor / Percutor',
    'Mola do Percussor',
    'Extrator',
    'Mola do Extrator',
    'Pino do Extrator',
    'Ejetor',
    'Retém do Ferrolho',
    'Mola do Retém do Ferrolho',
    'Retém do Carregador',
    'Mola do Retém do Carregador',
    'Barra de Gatilho (Trigger Bar)',
    'Desconector',
    'Mola do Gatilho',
    'Alça de Mira',
    'Massa de Mira',
    'Pinos de Fixação (Kit)',
    'Placa de Cobertura do Ferrolho (Slide Cover Plate)',
    'Mola do Cão',
    'Cão (Hammer)',
    'Transportador do Carregador (Follower)',
    'Mola do Carregador',
  ],
  'Fuzis & Carabinas': [
    'Mola Recuperadora / Buffer Spring',
    'Ferrolho (Bolt)',
    'Pino Percutor (Firing Pin)',
    'Mola do Percutor',
    'Extrator (Extractor)',
    'Mola do Extrator',
    'Ejetor (Ejector)',
    'Anéis do Ferrolho (Gas Rings)',
    'Chave de Gases (Gas Key)',
    'Alça de Mira / Massa de Mira',
    'Guarda-Mão (Handguard)',
    'Retém do Carregador (Magazine Release)',
    'Mola do Retém do Carregador',
    'Retém do Ferrolho (Bolt Catch)',
    'Eixo do Gatilho',
    'Mola do Gatilho',
    'Mola do Cão (Hammer Spring)',
    'Seletor de Tiro (Safety Selector)',
    'Guia de Mola'
  ],
  Espingardas: [
    'Mola Recuperadora',
    'Percussor',
    'Mola do Percussor',
    'Extrator',
    'Mola do Extrator',
    'Ejetor',
    'Mola do Ejetor',
    'Retém do Cartucho',
    'Elevador',
    'Mola do Tubo Depósito',
    'Chaveta do Cano',
    'Alça de Mira / Massa de Mira',
    'Coronha (Buttstock)',
    'Guarda-Mão (Forend)',
    'Telha',
    'Cão',
    'Mola do Cão'
  ],
  'Revólveres': [
    'Percussor (Firing Pin)',
    'Mola do Percussor',
    'Cão (Hammer)',
    'Mola Real (Mainspring)',
    'Gatilho (Trigger)',
    'Mola de Retorno do Gatilho',
    'Retém do Tambor',
    'Mola do Retém do Tambor',
    'Eixo do Extrator',
    'Estrela do Extrator',
    'Mola do Extrator',
    'Vareta do Extrator',
    'Massa de Mira',
    'Alça de Mira Regulável'
  ]
};

// ==========================================
// VIEW: Registros de Serviço
// ==========================================
function RegistrosServicoView() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // States for Modal and Editing
  const [selectedServico, setSelectedServico] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [editTrabalhoRealizado, setEditTrabalhoRealizado] = useState('');
  const [editDataDev, setEditDataDev] = useState('');
  const [editPecasSubstituidas, setEditPecasSubstituidas] = useState({});
  const [activePecaTab, setActivePecaTab] = useState('Pistolas');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const loadData = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      const data = await apiService.getList('servicos', params);
      setRows(data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => loadData(), 200);
    return () => clearTimeout(timer);
  }, [search]);

  const handleRowClick = (servico) => {
    setSelectedServico(servico);
    setEditStatus(servico.status || 'Aberto');
    setEditTrabalhoRealizado(servico.trabalho_realizado || '');
    setEditDataDev(servico.data_dev || '');
    setEditPecasSubstituidas(servico.pecas_substituidas || {});

    // Auto detect active parts tab based on details
    const modelLower = (servico.modelo || '').toLowerCase();
    const brandLower = (servico.marca || '').toLowerCase();
    const catLower = (servico.categoria || '').toLowerCase();
    if (modelLower.includes('revolver') || modelLower.includes('revólver') || brandLower.includes('revolver') || brandLower.includes('revólver')) {
      setActivePecaTab('Revólveres');
    } else if (modelLower.includes('espingarda') || brandLower.includes('espingarda') || catLower.includes('espingarda')) {
      setActivePecaTab('Espingardas');
    } else if (modelLower.includes('fuzil') || modelLower.includes('carabina') || brandLower.includes('fuzil') || brandLower.includes('carabina')) {
      setActivePecaTab('Fuzis & Carabinas');
    } else {
      setActivePecaTab('Pistolas');
    }

    setMessage('');
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedServico) return;
    setSaving(true);
    setMessage('');
    try {
      await apiService.patch(`servicos/${selectedServico.id}`, {
        status: editStatus,
        trabalho_realizado: editTrabalhoRealizado,
        data_dev: editDataDev || null,
        pecas_substituidas: editPecasSubstituidas,
      });
      setMessage('Alterações salvas com sucesso!');
      loadData();
      setTimeout(() => {
        setIsModalOpen(false);
        setSelectedServico(null);
      }, 1000);
    } catch (err) {
      console.error(err);
      setMessage('Erro ao salvar as alterações.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPDF = async (e) => {
    if (e) e.stopPropagation();
    if (!selectedServico) return;
    try {
      await apiService.download(`servicos/${selectedServico.id}/documento-pdf`, `servico_${selectedServico.codigo || 'ordem'}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Erro ao fazer download do relatório em PDF.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>📋 Registros de Serviços de Armas</h1>
        <p>Visualize e filtre todo o histórico de manutenção, reposição de armas e relatórios de defeitos.</p>
      </div>

      <div className="card">
        <div className="search-bar">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Buscar por código, policial, matrícula, série de arma ou unidade..."
          />
        </div>

        {loading ? (
          <p>Carregando histórico...</p>
        ) : rows.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#718096', padding: '24px 0' }}>Nenhum serviço correspondente encontrado.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Data Rec.</th>
                  <th>Armeiro</th>
                  <th>Policial</th>
                  <th>VTR/Unidade</th>
                  <th>Item / Nº de Série</th>
                  <th>Tipo de Serviço</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} onClick={() => handleRowClick(row)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{row.codigo}</td>
                    <td>{row.data_rec ? formatLocalDate(row.data_rec) : '—'}</td>
                    <td>{row.armeiro}</td>
                    <td>
                      <div><strong>{row.policial_nome}</strong></div>
                      <div style={{ fontSize: '11px', color: '#718096' }}>Matrícula: {row.matricula || '—'}</div>
                    </td>
                    <td>{row.lotacao || row.depto || '—'}</td>
                    <td>
                      <div><span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#3182ce', fontWeight: 'bold' }}>{row.categoria || 'Armas'}</span></div>
                      <div><strong>{row.marca || 'Pistola'} {row.modelo || '—'}</strong> ({row.calibre || '—'})</div>
                      <div style={{ fontSize: '11px', color: '#e53e3e', fontWeight: 'bold', fontFamily: 'monospace' }}>Série: {row.serie || '—'}</div>
                    </td>
                    <td>{row.tipo}</td>
                    <td>
                      <span className={`badge ${row.status === 'Concluído' ? 'badge-green' : 'badge-yellow'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-xs btn-outline" onClick={() => handleRowClick(row)}>
                        🔍 Detalhes / Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details & Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        title={`Ordem de Serviço - ${selectedServico?.codigo || ''}`}
        onClose={() => setIsModalOpen(false)}
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setIsModalOpen(false)} disabled={saving}>
              Fechar
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </>
        }
      >
        {selectedServico && (
          <div>
            {message && (
              <div style={{
                padding: '12px',
                marginBottom: '16px',
                borderRadius: '4px',
                backgroundColor: message.includes('sucesso') ? '#e6fffa' : '#fff5f5',
                color: message.includes('sucesso') ? '#234e52' : '#742a2a',
                border: `1px solid ${message.includes('sucesso') ? '#b2f5ea' : '#fed7d7'}`,
                fontWeight: '500',
                fontSize: '14px'
              }}>
                {message}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button className="btn btn-outline" onClick={handleDownloadPDF} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                📄 Gerar Relatório PDF
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              {/* Col 1: Ordem & Policial */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', backgroundColor: 'var(--card-bg, #fff)' }}>
                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #edf2f7', paddingBottom: '6px', marginBottom: '10px', color: '#2b6cb0' }}>
                  Dados do Policial e Serviço
                </h3>
                <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Tipo:</strong> {selectedServico.tipo}</p>
                <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Armeiro:</strong> {selectedServico.armeiro}</p>
                <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Policial:</strong> {selectedServico.policial_nome || '—'}</p>
                <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Matrícula:</strong> {selectedServico.matricula || '—'}</p>
                <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Unidade / Lotação:</strong> {selectedServico.lotacao || selectedServico.depto || '—'}</p>
              </div>

              {/* Col 2: Item / Armamento */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', backgroundColor: 'var(--card-bg, #fff)' }}>
                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #edf2f7', paddingBottom: '6px', marginBottom: '10px', color: '#2b6cb0' }}>
                  Especificação do Item
                </h3>
                <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Categoria:</strong> {selectedServico.categoria || 'Armas'}</p>
                <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Marca:</strong> {selectedServico.marca || 'Pistola'}</p>
                <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Modelo:</strong> {selectedServico.modelo || '—'}</p>
                <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Calibre:</strong> {selectedServico.calibre || '—'}</p>
                <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Nº de Série:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#e53e3e' }}>{selectedServico.serie || '—'}</span></p>
              </div>
            </div>

            {/* Descrição Inicial */}
            <div style={{ marginBottom: '16px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', backgroundColor: '#f8fafc' }}>
              <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: '#4a5568' }}>Descrição do Defeito / Solicitação Inicial</h4>
              <p style={{ fontSize: '13px', margin: 0, whiteSpace: 'pre-line', color: '#2d3748' }}>{selectedServico.descricao || 'Sem observações adicionais.'}</p>
            </div>

            {/* Formulário de Edição */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#1a202c' }}>
                🔧 Atualizar Situação e Parecer Técnico
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#4a5568' }}>
                    Status do Serviço *
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => {
                      setEditStatus(e.target.value);
                      if (e.target.value === 'Concluído' && !editDataDev) {
                        setEditDataDev(new Date().toLocaleDateString('sv-SE'));
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e0',
                      backgroundColor: '#fff',
                      fontSize: '13px',
                      color: '#000'
                    }}
                  >
                    {['Aberto', 'Em Andamento', 'Aguardando Peça', 'Aguardando Teste', 'Encaminhado à Fábrica', 'Concluído'].map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#4a5568' }}>
                    Data de Devolução / Conclusão
                  </label>
                  <input
                    type="date"
                    value={editDataDev}
                    onChange={(e) => setEditDataDev(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e0',
                      backgroundColor: '#fff',
                      fontSize: '13px',
                      color: '#000'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#4a5568' }}>
                  Trabalho Realizado / Parecer Técnico (o que foi feito no item) *
                </label>
                <textarea
                  value={editTrabalhoRealizado}
                  onChange={(e) => setEditTrabalhoRealizado(e.target.value)}
                  placeholder="Descreva as ações tomadas, peças substituídas ou parecer final..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e0',
                    fontSize: '13px',
                    color: '#000',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Opção de incluir a substituição das peças constantes nas abas da planilha */}
              <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '10px', color: '#2b6cb0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ⚙️ Substituição de Peças (Abas da Planilha)
                </h4>
                
                {/* Tabs */}
                <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #cbd5e0', marginBottom: '12px', paddingBottom: '4px', overflowX: 'auto' }}>
                  {Object.keys(PECAS_REPOSICAO_TABELAS).map((tabName) => (
                    <button
                      key={tabName}
                      type="button"
                      onClick={() => setActivePecaTab(tabName)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        border: 'none',
                        borderBottom: activePecaTab === tabName ? '2px solid #3182ce' : '2px solid transparent',
                        backgroundColor: activePecaTab === tabName ? '#ebf8ff' : 'transparent',
                        color: activePecaTab === tabName ? '#2b6cb0' : '#4a5568',
                        cursor: 'pointer',
                        borderRadius: '4px 4px 0 0',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {tabName}
                    </button>
                  ))}
                </div>

                {/* Parts list inside active tab */}
                <div style={{
                  maxHeight: '180px',
                  overflowY: 'auto',
                  border: '1px solid #cbd5e0',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  backgroundColor: '#f8fafc',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px'
                }}>
                  {PECAS_REPOSICAO_TABELAS[activePecaTab]?.map((peca) => {
                    const currentQty = editPecasSubstituidas[peca] || 0;
                    return (
                      <div
                        key={peca}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '4px',
                          backgroundColor: currentQty > 0 ? '#f0fff4' : '#fff',
                          borderColor: currentQty > 0 ? '#c6f6d5' : '#e2e8f0',
                          fontSize: '12px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span style={{ fontWeight: currentQty > 0 ? '600' : 'normal', color: currentQty > 0 ? '#22543d' : '#2d3748', flex: 1, paddingRight: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={peca}>
                          {peca}
                        </span>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditPecasSubstituidas(prev => ({
                                ...prev,
                                [peca]: Math.max(0, (prev[peca] || 0) - 1)
                              }));
                            }}
                            style={{
                              width: '20px',
                              height: '20px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '4px',
                              border: '1px solid #cbd5e0',
                              backgroundColor: '#fff',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              fontSize: '12px'
                            }}
                          >
                            -
                          </button>
                          
                          <span style={{ width: '16px', textAlign: 'center', fontWeight: 'bold' }}>
                            {currentQty}
                          </span>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setEditPecasSubstituidas(prev => ({
                                ...prev,
                                [peca]: (prev[peca] || 0) + 1
                              }));
                            }}
                            style={{
                              width: '20px',
                              height: '20px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '4px',
                              border: '1px solid #cbd5e0',
                              backgroundColor: '#fff',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              fontSize: '12px'
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Summary of substituted pieces */}
                {Object.keys(editPecasSubstituidas).some(k => editPecasSubstituidas[k] > 0) && (
                  <div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: '#ebf8ff', borderRadius: '4px', border: '1px solid #bee3f8' }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#2b6cb0', marginBottom: '4px' }}>
                      Resumo das Peças Substituídas:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {Object.entries(editPecasSubstituidas).map(([peca, qty]) => {
                        if (qty <= 0) return null;
                        return (
                          <span
                            key={peca}
                            style={{
                              backgroundColor: '#fff',
                              border: '1px solid #90cdf4',
                              color: '#2b6cb0',
                              fontSize: '11px',
                              fontWeight: '600',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            {peca} ({qty})
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ==========================================
// VIEW: Cadastro de Policiais
// ==========================================
const formatMatricula = (val) => {
  if (val === undefined || val === null) return '';
  const valStr = String(val);
  const digits = valStr.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 7) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}-${digits.slice(6, 7)}-${digits.slice(7)}`;
};

const formatCpf = (val) => {
  if (val === undefined || val === null) return '';
  const valStr = String(val);
  const digits = valStr.replace(/\D/g, '');
  if (digits.length <= 11) {
    const sliced = digits.slice(0, 11);
    if (sliced.length <= 3) return sliced;
    if (sliced.length <= 6) return `${sliced.slice(0, 3)}.${sliced.slice(3)}`;
    if (sliced.length <= 9) return `${sliced.slice(0, 3)}.${sliced.slice(3, 6)}.${sliced.slice(6)}`;
    return `${sliced.slice(0, 3)}.${sliced.slice(3, 6)}.${sliced.slice(6, 9)}-${sliced.slice(9)}`;
  } else {
    const sliced = digits.slice(0, 14);
    if (sliced.length <= 3) return sliced;
    if (sliced.length <= 6) return `${sliced.slice(0, 3)}.${sliced.slice(3)}`;
    if (sliced.length <= 9) return `${sliced.slice(0, 3)}.${sliced.slice(3, 6)}.${sliced.slice(6)}`;
    if (sliced.length <= 12) return `${sliced.slice(0, 3)}.${sliced.slice(3, 6)}.${sliced.slice(6, 9)}.${sliced.slice(9)}`;
    return `${sliced.slice(0, 3)}.${sliced.slice(3, 6)}.${sliced.slice(6, 9)}.${sliced.slice(9, 12)}-${sliced.slice(12)}`;
  }
};

function generatePageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = [1];
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

function CadPoliciaisView() {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ matricula: '', cpf: '', nome: '', cargo: '', depto: '', lotacao: '' });

  const [cargosMenu, setCargosMenu] = useState([]);
  const [departamentosMenu, setDepartamentosMenu] = useState([]);
  const [lotacoesMenu, setLotacoesMenu] = useState([]);

  // Batch states
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchPreview, setBatchPreview] = useState([]);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, successes: 0, failures: 0 });
  const [batchShowPreview, setBatchShowPreview] = useState(false);

  const findCargoValue = (text) => {
    if (!text) return '';
    const normalized = text.trim().toLowerCase();
    const found = cargosMenu.find(c => c.rotulo.toLowerCase() === normalized || c.valor.toLowerCase() === normalized);
    return found ? found.valor : text.trim();
  };

  const findDeptoValue = (text) => {
    if (!text) return '';
    const normalized = text.trim().toLowerCase();
    const found = departamentosMenu.find(d => d.rotulo.toLowerCase() === normalized || d.valor.toLowerCase() === normalized);
    return found ? found.valor : text.trim();
  };

  const handleProcessBatchText = () => {
    if (!batchText.trim()) {
      alert('Por favor, cole ou digite as informações primeiro.');
      return;
    }

    const lines = batchText.split('\n');
    const parsed = [];

    // Skip header if detected
    let startIndex = 0;
    const firstLineLower = lines[0].toLowerCase();
    const isHeader = firstLineLower.includes('matrícula') || firstLineLower.includes('matricula') || firstLineLower.includes('nome') || firstLineLower.includes('cpf') || firstLineLower.includes('cargo');
    if (isHeader) {
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      let parts = [];
      if (line.includes('\t')) {
        parts = line.split('\t');
      } else if (line.includes(';')) {
        parts = line.split(';');
      } else {
        parts = line.split(',');
      }

      parts = parts.map(p => p.trim());

      const rawMatricula = parts[0] || '';
      const rawNome = parts[1] || '';
      const rawCpf = parts[2] || '';
      const rawCargoInput = parts[3] || '';
      const rawDeptoInput = parts[4] || '';
      const rawLotacao = parts[5] || '';

      const matchedCargo = findCargoValue(rawCargoInput);
      const matchedDepto = findDeptoValue(rawDeptoInput);

      const formattedMat = formatMatricula(rawMatricula);
      const formattedCpfVal = formatCpf(rawCpf);

      const isInvalidMatricula = !rawMatricula || rawMatricula.toUpperCase().startsWith('SM-') || rawMatricula.includes('#REF!');

      const item = {
        matricula: formattedMat,
        nome: rawNome,
        cpf: formattedCpfVal,
        cargo: matchedCargo,
        depto: matchedDepto,
        lotacao: rawLotacao,
        rawCargo: rawCargoInput,
        rawDepto: rawDeptoInput,
        isValid: !!(!isInvalidMatricula && rawNome && matchedCargo)
      };

      parsed.push(item);
    }

    setBatchPreview(parsed);
    setBatchShowPreview(true);
  };

  const handleSaveBatch = async () => {
    const validItems = batchPreview.filter(item => item.isValid);
    if (validItems.length === 0) {
      alert('Nenhum registro válido para importar.');
      return;
    }

    setIsSavingBatch(true);
    setBatchProgress({ current: 0, total: validItems.length, successes: 0, failures: 0 });

    let successes = 0;
    let failures = 0;

    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];
      try {
        const payload = {
          matricula: item.matricula,
          nome: item.nome,
          cpf: item.cpf || null,
          cargo: item.cargo,
          depto: item.depto || null,
          lotacao: item.lotacao || null
        };
        await apiService.create('policiais', payload);
        successes++;
      } catch (err) {
        console.error('Erro ao importar policial:', item, err);
        failures++;
      }
      setBatchProgress(prev => ({
        ...prev,
        current: i + 1,
        successes,
        failures
      }));
    }

    setIsSavingBatch(false);
    setIsBatchModalOpen(false);
    setBatchText('');
    setBatchPreview([]);
    setBatchShowPreview(false);
    await loadRows();
    alert(`Importação concluída! Sucesso: ${successes}, Erros: ${failures}`);
  };

  const loadDropdowns = async () => {
    try {
      const [cargosData, deptosData, lotacoesData] = await Promise.all([
        apiService.getList('opcoes-menu', new URLSearchParams({ grupo: 'cargo_policial', ativo: 'true', page_size: '500' })),
        apiService.getList('opcoes-menu', new URLSearchParams({ grupo: 'departamento', ativo: 'true', page_size: '500' })),
        apiService.getList('lotacoes', new URLSearchParams({ page_size: '500' })),
      ]);
      setCargosMenu(cargosData.results || cargosData || []);

      const savedDeptos = localStorage.getItem('sga_deptos_config');
      let customDeptos = [];
      if (savedDeptos) {
        try {
          const parsed = JSON.parse(savedDeptos);
          if (parsed && typeof parsed === 'object') {
            customDeptos = Object.keys(parsed).map(name => ({
              id: `local-${name}`,
              valor: name,
              rotulo: parsed[name]?.sigla || name
            }));
          }
        } catch (e) {
          console.error(e);
        }
      }
      
      if (customDeptos.length === 0) {
        const defaults = {
          'Departamento de Polícia da Capital': { sigla: 'DPC' },
          'Departamento de Polícia Metropolitana': { sigla: 'DPM' },
          'Departamento de Polícia do Interior Norte': { sigla: 'DPI Norte' },
          'Departamento de Polícia do Interior Sul': { sigla: 'DPI Sul' },
          'Departamento Tecnico Operacional': { sigla: 'DTO' },
          'Coordenadoria de Logistica': { sigla: 'COLOG' },
          'Coordenadoria de Operacoes e Recursos Especiais': { sigla: 'CORE' },
          'Departamento de Homicidios e Protecao a Pessoa': { sigla: 'DHPP' },
          'Departamento de Inteligencia Policial': { sigla: 'DIP' },
          'Assessoria de Controle Interno': { sigla: 'ASCOI' },
          'Assessoria de Comunicação': { sigla: 'ASCOM' },
          'Assessoria de Segurança Institucional': { sigla: 'ASI' },
          'Assessoria ao Sistema de Justiça': { sigla: 'ASJ' },
          'Assessoria Jurídica': { sigla: 'ASJUR' },
          'Controladoria Geral de Disciplina': { sigla: 'CGD' },
          'Coordenadoria de Saúde do Policial Civil': { sigla: 'CO-SAÚDE' },
          'Coordenadoria de Administração e Finanças': { sigla: 'COAFI' },
          'Coordenadoria de Desenvolvimento Institucional e Planejamento': { sigla: 'CODIP' },
          'Coordenadoria de Gestão de Pessoas': { sigla: 'COGEP' },
          'Coordenadoria de Plantões': { sigla: 'COPLAN' },
          'Corregedoria-Geral de Polícia Civil': { sigla: 'CORREGEDORIA' },
          'Coordenadoria de Tecnologia da Informação e Comunicação': { sigla: 'COTIC' },
          'Departamento de Combate a Crimes contra o Patrimônio': { sigla: 'DEPATRI' },
          'Departamento de Homicídios e Proteção à Pessoa da RMF': { sigla: 'DH-RMF' }
        };
        customDeptos = Object.keys(defaults).map(name => ({
          id: `local-default-${name}`,
          valor: name,
          rotulo: defaults[name].sigla
        }));
      }

      setDepartamentosMenu(customDeptos);
      setLotacoesMenu(lotacoesData.results || lotacoesData || []);
    } catch (err) {
      console.error('Erro ao carregar opções suspensas para policiais:', err);
    }
  };

  const loadRows = async () => {
    try {
      const params = new URLSearchParams({ page_size: '3000' });
      if (search) params.append('search', search);
      const data = await apiService.getList('policiais', params);
      setRows(data.results || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadDropdowns();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    const timer = setTimeout(() => loadRows(), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm({ matricula: '', cpf: '', nome: '', email: '', cargo: '', depto: '', lotacao: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (row) => {
    setEditingId(row.id);
    setForm({
      ...row,
      matricula: formatMatricula(row.matricula),
      cpf: formatCpf(row.cpf)
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (!form.matricula || !form.nome || !form.cargo) {
        alert('Por favor, preencha os campos obrigatórios (Matrícula, Nome, Cargo).');
        return;
      }
      if (form.email && !form.email.trim().toLowerCase().endsWith('@pc.ce.gov.br')) {
        alert('⚠️ O e-mail do policial deve pertencer obrigatoriamente ao domínio institucional @pc.ce.gov.br');
        return;
      }
      if (editingId) {
        await apiService.update('policiais', editingId, form);
      } else {
        await apiService.create('policiais', form);
      }
      setIsModalOpen(false);
      loadRows();
    } catch (err) {
      alert(err.message);
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const handleDeleteClick = (row) => {
    setDeleteConfirmId(row.id);
    setDeleteConfirmName(row.nome);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await apiService.remove('policiais', deleteConfirmId);
      setDeleteConfirmId(null);
      setDeleteConfirmName('');
      loadRows();
    } catch (err) {
      alert(err.message);
    }
  };

  const getCargoLabel = (value) => {
    const found = cargosMenu.find(c => c.valor === value);
    return found ? found.rotulo : value;
  };

  const getDeptoLabel = (value) => {
    const found = departamentosMenu.find(d => d.valor === value);
    return found ? found.rotulo : value;
  };

  const totalItems = rows.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const pageToUse = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = (pageToUse - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const currentRows = rows.slice(startIndex, endIndex);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>👮 Gestão de Policiais</h1>
          <p>Cadastre e gerencie a ficha técnica dos policiais associados a armaria.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-outline" onClick={() => {
            setBatchText('');
            setBatchPreview([]);
            setBatchShowPreview(false);
            setIsBatchModalOpen(true);
          }}>📥 Inclusão em Lote</button>
          <button className="btn btn-primary" onClick={handleOpenAdd}>➕ Novo Policial</button>
        </div>
      </div>

      <div className="card">
        <div className="search-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="🔍 Buscar por nome, matrícula, cpf, cargo..." 
            style={{ flex: 1, minWidth: '280px' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#4a5568', whiteSpace: 'nowrap' }}>
            <span>Itens por página:</span>
            <select 
              value={pageSize} 
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e0', backgroundColor: '#fff', fontSize: '14px', cursor: 'pointer' }}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Matrícula</th>
                <th>Nome</th>
                <th>CPF</th>
                <th>Cargo</th>
                <th>Departamento</th>
                <th>Lotação / Unidade</th>
                <th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#718096', padding: '24px' }}>
                    Nenhum policial encontrado.
                  </td>
                </tr>
              ) : (
                currentRows.map(row => (
                  <tr key={row.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{row.matricula}</td>
                    <td><strong>{row.nome}</strong></td>
                    <td>{row.cpf || '—'}</td>
                    <td>{getCargoLabel(row.cargo)}</td>
                    <td>{getDeptoLabel(row.depto) || '—'}</td>
                    <td>{row.lotacao || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        {can('edit', 'cadastros', row) && (
                          <button className="btn btn-xs btn-outline" onClick={() => handleOpenEdit(row)}>✏️</button>
                        )}
                        {can('delete', 'cadastros') && (
                          <button className="btn btn-xs btn-danger" onClick={() => handleDeleteClick(row)}>🗑️</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Barra de Paginação */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderTop: '1px solid #e2e8f0', marginTop: '12px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontSize: '14px', color: '#4a5568', fontWeight: '500' }}>
            {totalItems > 0 ? (
              <>Exibindo <strong>{startIndex + 1}</strong>–<strong>{endIndex}</strong> de <strong>{totalItems}</strong> policiais</>
            ) : (
              <>0 policiais encontrados</>
            )}
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setCurrentPage(1)}
              disabled={pageToUse === 1}
              style={{ opacity: pageToUse === 1 ? 0.4 : 1, cursor: pageToUse === 1 ? 'not-allowed' : 'pointer', padding: '4px 8px' }}
              title="Primeira Página"
            >
              «
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={pageToUse === 1}
              style={{ opacity: pageToUse === 1 ? 0.4 : 1, cursor: pageToUse === 1 ? 'not-allowed' : 'pointer', padding: '4px 10px' }}
            >
              Anterior
            </button>

            {/* Números das páginas */}
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', margin: '0 4px' }}>
              {generatePageNumbers(pageToUse, totalPages).map((p, idx) => {
                if (p === '...') {
                  return <span key={`ellipsis-${idx}`} style={{ padding: '0 4px', color: '#a0aec0' }}>...</span>;
                }
                const isCurrent = p === pageToUse;
                return (
                  <button
                    key={`page-${p}`}
                    type="button"
                    className={`btn btn-sm ${isCurrent ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setCurrentPage(p)}
                    style={{ minWidth: '32px', padding: '4px 8px', fontWeight: isCurrent ? 'bold' : 'normal' }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={pageToUse === totalPages}
              style={{ opacity: pageToUse === totalPages ? 0.4 : 1, cursor: pageToUse === totalPages ? 'not-allowed' : 'pointer', padding: '4px 10px' }}
            >
              Próxima
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setCurrentPage(totalPages)}
              disabled={pageToUse === totalPages}
              style={{ opacity: pageToUse === totalPages ? 0.4 : 1, cursor: pageToUse === totalPages ? 'not-allowed' : 'pointer', padding: '4px 8px' }}
              title="Última Página"
            >
              »
            </button>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div className="card" style={{ width: '450px', backgroundColor: '#fff', margin: 0 }}>
            <h3>{editingId ? '✏️ Editar Policial' : '➕ Novo Policial'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
              <div className="form-group">
                <label>Matrícula *</label>
                <input 
                  value={form.matricula} 
                  onChange={(e) => setForm({ ...form, matricula: formatMatricula(e.target.value) })} 
                  placeholder="Ex.: 123.456-7-8" 
                />
              </div>
              <div className="form-group">
                <label>Nome Completo *</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: João da Silva" />
              </div>
              <div className="form-group">
                <label>CPF</label>
                <input 
                  value={form.cpf} 
                  onChange={(e) => setForm({ ...form, cpf: formatCpf(e.target.value) })} 
                  placeholder="Ex.: 111.222.333.444-55" 
                />
              </div>
              <div className="form-group">
                <label>E-mail Institucional (@pc.ce.gov.br)</label>
                <input 
                  type="email"
                  value={form.email || ''} 
                  onChange={(e) => setForm({ ...form, email: e.target.value })} 
                  placeholder="nome.sobrenome@pc.ce.gov.br" 
                />
                <span style={{ fontSize: '11px', color: '#166534', marginTop: '2px', display: 'block' }}>
                  🔒 Somente e-mails do domínio @pc.ce.gov.br são aceitos.
                </span>
              </div>
              <div className="form-group">
                <label>Cargo *</label>
                <select 
                  value={form.cargo} 
                  onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff' }}
                >
                  <option value="">Selecione um Cargo</option>
                  {cargosMenu.map((c) => (
                    <option key={c.id || c.valor} value={c.valor}>{c.rotulo}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Departamento</label>
                <select 
                  value={form.depto} 
                  onChange={(e) => setForm({ ...form, depto: e.target.value, lotacao: '' })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff' }}
                >
                  <option value="">Selecione um Departamento</option>
                  {departamentosMenu.map((d) => (
                    <option key={d.id || d.valor} value={d.valor}>{d.rotulo}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Lotação / Unidade</label>
                <select 
                  value={form.lotacao} 
                  onChange={(e) => setForm({ ...form, lotacao: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff' }}
                  disabled={!form.depto}
                >
                  <option value="">{form.depto ? 'Selecione uma Lotação' : 'Selecione o departamento'}</option>
                  {lotacoesMenu
                    .filter((l) => !form.depto || l.depto === form.depto)
                    .map((l) => (
                      <option key={l.id || l.nome} value={l.nome}>{l.nome}</option>
                    ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSave}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={isBatchModalOpen}
        title="📥 Inclusão de Policiais em Lote"
        onClose={() => {
          if (!isSavingBatch) setIsBatchModalOpen(false);
        }}
        footer={(
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            {batchShowPreview ? (
              <button className="btn btn-outline" onClick={() => setBatchShowPreview(false)} disabled={isSavingBatch}>
                ⬅️ Voltar para Edição
              </button>
            ) : (
              <div></div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-outline" onClick={() => setIsBatchModalOpen(false)} disabled={isSavingBatch}>
                Cancelar
              </button>
              {batchShowPreview ? (
                <button className="btn btn-primary" onClick={handleSaveBatch} disabled={isSavingBatch || batchPreview.filter(x => x.isValid).length === 0}>
                  {isSavingBatch ? `Gravando... (${batchProgress.current}/${batchProgress.total})` : `Confirmar e Importar ${batchPreview.filter(x => x.isValid).length} Policiais`}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleProcessBatchText}>
                  Analisar Dados ➔
                </button>
              )}
            </div>
          </div>
        )}
      >
        {!batchShowPreview ? (
          <div>
            <div style={{ padding: '12px', backgroundColor: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe', marginBottom: '16px', fontSize: '13px', color: '#1e3a8a', lineHeight: '1.5' }}>
              <strong>Como funciona a importação em lote:</strong>
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                <li>Copie colunas do <strong>Excel</strong> ou <strong>Google Sheets</strong> e cole aqui diretamente.</li>
                <li>Ou digite os dados separados por <strong>ponto-e-vírgula (;)</strong>, um policial por linha.</li>
                <li><strong>Campos na ordem:</strong> Matrícula; Nome Completo; CPF; Cargo; Departamento; Lotação/Unidade</li>
                <li>Os campos Matrícula, Nome e Cargo são <strong>obrigatórios</strong>.</li>
                <li>O sistema tentará mapear automaticamente nomes de cargos e departamentos para as opções cadastradas.</li>
              </ul>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontWeight: '600', marginBottom: '6px', display: 'block' }}>Cole os dados dos Policiais aqui:</label>
              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder="Exemplo de linha:&#10;30058410;KLEVER FARIAS;123.456.789-00;Delegado;Coordenadoria;Divisão de Roubos e Furtos"
                rows={12}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e0',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  backgroundColor: '#fafafa',
                  resize: 'vertical'
                }}
              />
            </div>
          </div>
        ) : (
          <div>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>📋 Prévia dos Policiais Identificados</h4>
            
            {isSavingBatch && (
              <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>
                  <span>Progresso do Processamento</span>
                  <span>{batchProgress.current} / {batchProgress.total}</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%`, height: '100%', backgroundColor: '#22c55e', transition: 'width 0.1s' }}></div>
                </div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px', color: '#166534' }}>
                  <span>✅ Sucessos: {batchProgress.successes}</span>
                  <span>❌ Erros: {batchProgress.failures}</span>
                </div>
              </div>
            )}

            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
              Foram encontrados <strong>{batchPreview.length}</strong> policiais. Linhas válidas estão em verde. Linhas inválidas (sem matrícula, nome ou cargo mapeável) estão em vermelho e serão desconsideradas.
            </p>

            <div className="table-wrap" style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', margin: 0 }}>
              <table style={{ fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>
                  <tr>
                    <th>Status</th>
                    <th>Matrícula *</th>
                    <th>Nome Completo *</th>
                    <th>Cargo *</th>
                    <th>Depto</th>
                    <th>Lotação</th>
                  </tr>
                </thead>
                <tbody>
                  {batchPreview.map((item, idx) => (
                    <tr key={idx} style={{ backgroundColor: item.isValid ? '#f0fdf4' : '#fef2f2' }}>
                      <td>
                        {item.isValid ? (
                          <span style={{ color: '#166534', fontWeight: 'bold' }}>✓ Válido</span>
                        ) : (
                          <span style={{ color: '#991b1b', fontWeight: 'bold' }}>✗ Inválido</span>
                        )}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{item.matricula || <span style={{ color: '#b91c1c', fontStyle: 'italic' }}>Ausente</span>}</td>
                      <td><strong>{item.nome || <span style={{ color: '#b91c1c', fontStyle: 'italic' }}>Ausente</span>}</strong></td>
                      <td>
                        {item.cargo ? (
                          <span>{getCargoLabel(item.cargo)}</span>
                        ) : (
                          <span style={{ color: '#b91c1c', fontStyle: 'italic' }}>Inválido ({item.rawCargo || 'Vazio'})</span>
                        )}
                      </td>
                      <td>{getDeptoLabel(item.depto) || item.rawDepto || '—'}</td>
                      <td>{item.lotacao || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {deleteConfirmId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div className="card" style={{ width: '400px', backgroundColor: '#fff', margin: 0, padding: '24px', borderRadius: '8px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', fontWeight: '700', margin: '0 0 12px 0' }}>⚠️ Confirmar Exclusão</h3>
            <p style={{ fontSize: '14px', color: '#4a5568', margin: '0 0 20px 0', lineHeight: '1.5' }}>
              Tem certeza que deseja excluir o cadastro do policial <strong>{deleteConfirmName}</strong>? Esta ação não poderá ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => { setDeleteConfirmId(null); setDeleteConfirmName(''); }}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleConfirmDelete}>Confirmar Exclusão</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VIEW: Cadastro de Fornecedor
// ==========================================
function CadFornecedorView() {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ nome: '', cnpj: '', contato: '', tel: '', email: '', categoria: '' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const loadData = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      const data = await apiService.getList('fornecedores', params);
      setRows(data.results || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, [search]);

  const handleSave = async () => {
    try {
      if (!form.nome) return alert('O nome do fornecedor é obrigatório.');
      if (editingId) {
        await apiService.update('fornecedores', editingId, form);
      } else {
        await apiService.create('fornecedores', form);
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEdit = (fornecedor) => {
    setEditingId(fornecedor.id);
    setForm({
      nome: fornecedor.nome || '',
      cnpj: fornecedor.cnpj || '',
      contato: fornecedor.contato || '',
      tel: fornecedor.tel || '',
      email: fornecedor.email || '',
      categoria: fornecedor.categoria || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id, nome) => {
    if (!confirm(`Tem certeza que deseja excluir o fornecedor "${nome}"?`)) return;
    try {
      await apiService.delete('fornecedores', id);
      loadData();
    } catch (err) {
      alert('Erro ao excluir fornecedor: ' + err.message);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>🏭 Fornecedores & Fabricantes</h1>
          <p>Gerencie os fornecedores cadastrados de insumos, coletes e armamentos.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm({ nome: '', cnpj: '', contato: '', tel: '', email: '', categoria: '' }); setIsModalOpen(true); }}>➕ Novo Fornecedor</button>
      </div>

      <div className="card">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Buscar por fabricante, CNPJ..." style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: '6px' }} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>CNPJ</th>
                <th>Contato</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Categoria</th>
                <th style={{ textAlign: 'center', width: '120px' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.nome}</strong></td>
                  <td>{r.cnpj || '—'}</td>
                  <td>{r.contato || '—'}</td>
                  <td>{r.tel || '—'}</td>
                  <td>{r.email || '—'}</td>
                  <td>{r.categoria || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      {can('edit', 'cadastros', r) && (
                        <button className="btn btn-xs btn-outline" onClick={() => handleEdit(r)} title="Editar fornecedor">✏️ Editar</button>
                      )}
                      {can('delete', 'cadastros') && (
                        <button className="btn btn-xs btn-outline" style={{ color: '#e53e3e', borderColor: '#feb2b2' }} onClick={() => handleDelete(r.id, r.nome)} title="Excluir fornecedor">🗑️</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div className="card" style={{ width: '400px', backgroundColor: '#fff', margin: 0 }}>
            <h3>{editingId ? '✏️ Editar Fornecedor' : '➕ Novo Fornecedor'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
              <div className="form-group"><label>Nome *</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
              <div className="form-group"><label>CNPJ</label><input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} /></div>
              <div className="form-group"><label>Contato</label><input value={form.contato} onChange={e => setForm({ ...form, contato: e.target.value })} /></div>
              <div className="form-group"><label>Telefone</label><input value={form.tel} onChange={e => setForm({ ...form, tel: e.target.value })} /></div>
              <div className="form-group"><label>E-mail</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div className="form-group"><label>Categoria</label><input value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} /></div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Fechar</button>
                <button className="btn btn-primary" onClick={handleSave}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VIEW: Cadastro de Menus Suspensos
// ==========================================
function CadMenusView() {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [grupo, setGrupo] = useState('armas-marcas');
  const [valor, setValor] = useState('');
  const [rotulo, setRotulo] = useState('');

  const loadData = async () => {
    try {
      const data = await apiService.getList('opcoes-menu', new URLSearchParams({ grupo }));
      setRows(data.results || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, [grupo]);

  const handleAdd = async () => {
    if (!valor || !rotulo) return alert('Preencha os campos valor e rótulo');
    try {
      await apiService.create('opcoes-menu', { grupo, valor, rotulo, ordem: 1, ativo: true });
      setValor('');
      setRotulo('');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiService.remove('opcoes-menu', id);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>🧩 Cadastro de Menus Suspensos</h1>
        <p>Gerencie as marcas, modelos, calibres e outros metadados do sistema.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
        <div className="card">
          <h3>Selecione o Grupo</h3>
          <select value={grupo} onChange={e => setGrupo(e.target.value)} style={{ width: '100%', padding: '8px', marginTop: '12px', border: '1px solid #ccc', borderRadius: '4px' }}>
            <option value="armas-marcas">Marcas de Armas</option>
            <option value="armas-modelos">Modelos de Armas</option>
            <option value="armas-calibres">Calibres de Armas</option>
            <option value="coletes-tamanhos">Tamanhos de Coletes</option>
            <option value="coletes-marcas">Fabricantes de Coletes</option>
            <option value="cargo_policial">Cargos de Policiais</option>
            <option value="departamento">Departamentos</option>
          </select>

          <h3 style={{ marginTop: '24px' }}>Adicionar Opção</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
            <div className="form-group"><label>Chave / Valor *</label><input value={valor} onChange={e => setValor(e.target.value)} placeholder="Ex.: GLOCK" /></div>
            <div className="form-group"><label>Exibição / Rótulo *</label><input value={rotulo} onChange={e => setRotulo(e.target.value)} placeholder="Ex.: Glock G17" /></div>
            {can('add', 'cadastros') && (
              <button className="btn btn-primary" onClick={handleAdd}>Adicionar</button>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Lista de Opções Disponíveis</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Valor</th><th>Rótulo</th><th style={{ textAlign: 'center' }}>Ações</th></tr></thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: '#888' }}>Nenhuma opção cadastrada neste grupo.</td></tr>
                ) : (
                  rows.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontFamily: 'monospace' }}>{r.valor}</td>
                      <td>{r.rotulo}</td>
                      <td style={{ textAlign: 'center' }}>
                        {can('delete', 'cadastros') && (
                          <button className="btn btn-xs btn-danger" onClick={() => handleDelete(r.id)}>Excluir</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// VIEW: Relatórios de Serviços de Armaria
// ==========================================
function RelatoriosServicosView() {
  const [servicos, setServicos] = useState([]);
  const [lotacoes, setLotacoes] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [policiais, setPoliciais] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedOSModal, setSelectedOSModal] = useState(null);

  // Edit OS Modal State
  const [editingOS, setEditingOS] = useState(null);
  const [editForm, setEditForm] = useState({
    status: '',
    armeiro: '',
    tipo: '',
    data_rec: '',
    data_dev: '',
    descricao: '',
    trabalho_realizado: '',
    pecas_substituidas: {},
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSuccess, setEditSuccess] = useState('');
  const [customPecaInput, setCustomPecaInput] = useState('');

  const handleOpenEditOS = (s) => {
    setEditingOS(s);
    setEditForm({
      status: s.status || 'Em Andamento',
      armeiro: s.armeiro || '',
      tipo: s.tipo || '',
      data_rec: (s.data_rec || s.criado_em || '').split('T')[0] || new Date().toISOString().split('T')[0],
      data_dev: (s.data_dev || '').split('T')[0] || '',
      descricao: s.descricao || '',
      trabalho_realizado: s.trabalho_realizado || '',
      pecas_substituidas: typeof s.pecas_substituidas === 'object' && s.pecas_substituidas !== null ? { ...s.pecas_substituidas } : {},
    });
    setEditSuccess('');
    setCustomPecaInput('');
  };

  const handlePecaQtyChange = (pecaName, newQty) => {
    const qty = Math.max(0, parseInt(newQty, 10) || 0);
    setEditForm(prev => {
      const updated = { ...prev.pecas_substituidas };
      if (qty > 0) {
        updated[pecaName] = qty;
      } else {
        delete updated[pecaName];
      }
      return { ...prev, pecas_substituidas: updated };
    });
  };

  const handleAddCustomPeca = () => {
    if (!customPecaInput.trim()) return;
    const name = customPecaInput.trim();
    setEditForm(prev => ({
      ...prev,
      pecas_substituidas: {
        ...prev.pecas_substituidas,
        [name]: (prev.pecas_substituidas[name] || 0) + 1
      }
    }));
    setCustomPecaInput('');
  };

  const handleSaveEditOS = async () => {
    if (!editingOS) return;
    setSavingEdit(true);
    setEditSuccess('');
    try {
      const today = new Date().toISOString().split('T')[0];
      const payload = {
        status: editForm.status,
        armeiro: editForm.armeiro,
        tipo: editForm.tipo,
        data_rec: editForm.data_rec,
        data_dev: editForm.status === 'Concluído' && !editForm.data_dev ? today : editForm.data_dev,
        descricao: editForm.descricao,
        trabalho_realizado: editForm.trabalho_realizado,
        pecas_substituidas: editForm.pecas_substituidas,
      };

      const updated = await apiService.update('servicos', editingOS.id, payload);

      setServicos(prev => prev.map(item => item.id === editingOS.id ? { ...item, ...payload, ...(updated || {}) } : item));
      
      if (selectedOSModal && selectedOSModal.id === editingOS.id) {
        setSelectedOSModal(prev => ({ ...prev, ...payload, ...(updated || {}) }));
      }

      setEditSuccess(`Ordem de Serviço Nº ${editingOS.codigo} atualizada com sucesso!`);
      setTimeout(() => {
        setEditingOS(null);
        setEditSuccess('');
      }, 1200);
    } catch (err) {
      console.error('Erro ao atualizar Ordem de Serviço:', err);
      alert(`Erro ao salvar alterações na OS: ${err.message || 'Falha de comunicação'}`);
    } finally {
      setSavingEdit(false);
    }
  };

  // Filters
  const [policialSearch, setPolicialSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [lotacaoFilter, setLotacaoFilter] = useState('');
  const [deptoFilter, setDeptoFilter] = useState('');
  const [tipoServicoFilter, setTipoServicoFilter] = useState('');
  const [armeiroFilter, setArmeiroFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Lote Search Mode
  const [isLoteMode, setIsLoteMode] = useState(false);
  const [loteQuery, setLoteQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [servData, lotData, depData, polData] = await Promise.all([
          apiService.getList('servicos', new URLSearchParams({ page_size: '5000' })),
          apiService.getList('lotacoes', new URLSearchParams({ page_size: '500' })),
          apiService.getList('departamentos', new URLSearchParams({ page_size: '500' })),
          apiService.getList('policiais', new URLSearchParams({ page_size: '2000' })).catch(() => [])
        ]);
        setServicos(servData.results || servData || []);
        setLotacoes(lotData.results || lotData || []);
        setDepartamentos(depData.results || depData || []);
        setPoliciais(polData.results || polData || []);
      } catch (err) {
        console.error('Erro ao carregar dados do relatório de serviços:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Normalization helper for accent-insensitive and case-insensitive matching
  const normalizeStr = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // Helper to extract department sigla
  const getDeptoSigla = (deptoName) => {
    if (!deptoName) return '';
    const upper = String(deptoName).toUpperCase();
    if (upper.includes('CAPITAL') || upper === 'DPC') return 'DPC';
    if (upper.includes('METROPOLITANA') || upper === 'DPM') return 'DPM';
    if (upper.includes('INTERIOR NORTE') || upper.includes('DPI NORTE')) return 'DPI NORTE';
    if (upper.includes('INTERIOR SUL') || upper.includes('DPI SUL')) return 'DPI SUL';
    if (upper.includes('TECNICO') || upper.includes('TÉCNICO') || upper === 'DTO') return 'DTO';
    if (upper.includes('INTELIGENCIA') || upper.includes('INTELIGÊNCIA') || upper === 'DIP') return 'DIP';
    if (upper.includes('HOMICIDIOS') || upper.includes('HOMICÍDIOS') || upper === 'DHPP') return 'DHPP';
    if (upper.includes('LOGISTICA') || upper.includes('LOGÍSTICA') || upper === 'COLOG') return 'COLOG';
    if (upper.includes('RECURSOS ESPECIAIS') || upper === 'CORE') return 'CORE';
    return upper.replace(/[^A-Z]/g, '');
  };

  // Helper for flexible department matching
  const matchDeptoFlex = (itemDepto, filterDepto) => {
    if (!filterDepto) return true;
    if (!itemDepto) return false;
    const normItem = normalizeStr(itemDepto);
    const normFilter = normalizeStr(filterDepto);
    if (normItem === normFilter) return true;
    if (normItem.includes(normFilter) || normFilter.includes(normItem)) return true;

    const siglaItem = getDeptoSigla(itemDepto);
    const siglaFilter = getDeptoSigla(filterDepto);
    if (siglaItem && siglaFilter && siglaItem === siglaFilter) return true;

    return false;
  };

  const relatorioLotacaoMap = React.useMemo(() => buildLotacaoToDeptoMap(lotacoes), [lotacoes]);

  // Unique & Combined Lotações for dropdown filter (filtered by selected deptoFilter)
  const allLotacoesOptions = React.useMemo(() => {
    const map = new Map();

    const addUnit = (unitName, deptoName) => {
      if (!unitName) return;
      const uName = String(unitName).trim();
      if (!uName) return;
      const effectiveDepto = deptoName || relatorioLotacaoMap.get(normalizeStr(uName));
      if (matchDeptoFlex(effectiveDepto, deptoFilter)) {
        const norm = normalizeStr(uName);
        if (!map.has(norm)) map.set(norm, uName);
      }
    };

    lotacoes.forEach(l => {
      if (l) {
        addUnit(l.nome || l.lotacao || l.unidade, l.depto || l.departamento);
      }
    });

    servicos.forEach(s => {
      if (s) {
        addUnit(s.lotacao || s.unidade || s.nome_unidade, s.depto || s.departamento);
      }
    });

    policiais.forEach(p => {
      if (p) {
        addUnit(p.lotacao, p.depto);
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
    );
  }, [lotacoes, servicos, policiais, deptoFilter, relatorioLotacaoMap]);

  // Unique & Combined Departamentos for dropdown filter
  const allDepartamentosOptions = React.useMemo(() => {
    const map = new Map();
    const addDepto = (d) => {
      if (!d) return;
      const name = typeof d === 'string' ? d : (d.nome || d.rotulo || d.valor || d.depto);
      if (name && typeof name === 'string' && name.trim()) {
        const norm = normalizeStr(name);
        if (!map.has(norm)) map.set(norm, name.trim());
      }
    };

    getSavedDeptosList().forEach(addDepto);
    departamentos.forEach(addDepto);
    servicos.forEach(s => addDepto(s.depto));
    lotacoes.forEach(l => addDepto(l.depto));
    policiais.forEach(p => addDepto(p.depto));

    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
    );
  }, [departamentos, servicos, lotacoes, policiais]);

  // Unique & Combined Tipos de Serviço for dropdown filter
  const allTiposOptions = React.useMemo(() => {
    const defaultTipos = [
      'Manutenção',
      'Limpeza',
      'Reposição de Peça',
      'Reposição de Arma'
    ];
    const map = new Map();
    defaultTipos.forEach(t => map.set(normalizeStr(t), t));
    servicos.forEach(s => {
      if (s && s.tipo) {
        const norm = normalizeStr(s.tipo);
        if (!map.has(norm)) map.set(norm, s.tipo);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }, [servicos]);

  // Unique Armeiros for dropdown filter
  const allArmeirosOptions = React.useMemo(() => {
    const defaultArmeiros = ['Thales', 'Santiago', 'Sales', 'Raimundo'];
    const map = new Map();
    defaultArmeiros.forEach(a => map.set(normalizeStr(a), a));
    servicos.forEach(s => {
      if (s && s.armeiro) {
        const norm = normalizeStr(s.armeiro);
        if (!map.has(norm)) map.set(norm, s.armeiro);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }, [servicos]);

  // Standard Status options for dropdown filter
  const allStatusOptions = React.useMemo(() => {
    const base = [
      { value: 'Todos', label: 'Todas as Situações' },
      { value: 'Aberto', label: 'Aberto' },
      { value: 'Em Andamento', label: 'Em Andamento' },
      { value: 'Aguardando Peça', label: 'Aguardando Peça' },
      { value: 'Aguardando Teste', label: 'Aguardando Teste' },
      { value: 'Encaminhado à Fábrica', label: 'Encaminhado à Fábrica' },
      { value: 'Concluído', label: 'Concluído' }
    ];
    // Add any extra unique statuses from DB
    const existingNorms = new Set(base.map(b => normalizeStr(b.value)));
    servicos.forEach(s => {
      if (s && s.status) {
        const norm = normalizeStr(s.status);
        if (!existingNorms.has(norm)) {
          existingNorms.add(norm);
          base.push({ value: s.status, label: s.status });
        }
      }
    });
    return base;
  }, [servicos]);

  // Filtered Services Logic
  const filteredServicos = React.useMemo(() => {
    return servicos.filter(s => {
      // If Batch / Lote Mode
      if (isLoteMode && loteQuery.trim()) {
        const lines = loteQuery
          .split(/[\n,;]+/)
          .map(x => normalizeStr(x))
          .filter(Boolean);
        if (lines.length > 0) {
          const matchOS = lines.some(q => normalizeStr(s.codigo).includes(q));
          const matchSerie = lines.some(q => normalizeStr(s.serie).includes(q));
          const matchPol = lines.some(q => normalizeStr(s.matricula).includes(q));
          return matchOS || matchSerie || matchPol;
        }
      }

      // Normal Filters
      if (policialSearch.trim()) {
        const pQ = normalizeStr(policialSearch);
        const matchNome = normalizeStr(s.policial_nome).includes(pQ);
        const matchMat = normalizeStr(s.matricula).includes(pQ);
        const matchCpf = normalizeStr(s.policial_cpf).includes(pQ);
        if (!matchNome && !matchMat && !matchCpf) return false;
      }

      if (itemSearch.trim()) {
        const iQ = normalizeStr(itemSearch);
        const matchCod = normalizeStr(s.codigo).includes(iQ);
        const matchMarca = normalizeStr(s.marca).includes(iQ);
        const matchModelo = normalizeStr(s.modelo).includes(iQ);
        const matchSerie = normalizeStr(s.serie).includes(iQ);
        const matchCal = normalizeStr(s.calibre).includes(iQ);
        const matchDesc = normalizeStr(s.descricao).includes(iQ);
        if (!matchCod && !matchMarca && !matchModelo && !matchSerie && !matchCal && !matchDesc) return false;
      }

      if (lotacaoFilter) {
        const targetNorm = normalizeStr(lotacaoFilter);
        const itemNorm = normalizeStr(s.lotacao);
        if (itemNorm !== targetNorm) return false;
      }

      if (deptoFilter) {
        const sDepto = s.depto || s.departamento || relatorioLotacaoMap.get(normalizeStr(s.lotacao));
        if (!matchDeptoFlex(sDepto, deptoFilter)) return false;
      }

      if (tipoServicoFilter) {
        const targetNorm = normalizeStr(tipoServicoFilter);
        const itemNorm = normalizeStr(s.tipo);
        if (itemNorm !== targetNorm) return false;
      }

      if (armeiroFilter) {
        const targetNorm = normalizeStr(armeiroFilter);
        const itemNorm = normalizeStr(s.armeiro);
        if (itemNorm !== targetNorm) return false;
      }

      if (statusFilter !== 'Todos') {
        const targetNorm = normalizeStr(statusFilter);
        const itemNorm = normalizeStr(s.status);
        if (targetNorm === 'concluido') {
          if (itemNorm !== 'concluido' && !itemNorm.includes('devolv')) return false;
        } else if (targetNorm === 'em andamento') {
          if (itemNorm === 'concluido' || itemNorm === 'cancelado') return false;
        } else {
          if (itemNorm !== targetNorm) return false;
        }
      }

      if (dataInicio) {
        const dtRec = (s.data_rec || s.criado_em || '').split('T')[0];
        if (dtRec < dataInicio) return false;
      }

      if (dataFim) {
        const dtRec = (s.data_rec || s.criado_em || '').split('T')[0];
        if (dtRec > dataFim) return false;
      }

      return true;
    });
  }, [servicos, isLoteMode, loteQuery, policialSearch, itemSearch, lotacaoFilter, deptoFilter, tipoServicoFilter, armeiroFilter, statusFilter, dataInicio, dataFim]);

  useEffect(() => {
    setCurrentPage(1);
  }, [policialSearch, itemSearch, lotacaoFilter, deptoFilter, tipoServicoFilter, armeiroFilter, statusFilter, dataInicio, dataFim, isLoteMode, loteQuery]);

  const totalPages = Math.ceil(filteredServicos.length / itemsPerPage) || 1;
  const paginatedServicosList = React.useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredServicos.slice(start, start + itemsPerPage);
  }, [filteredServicos, currentPage]);

  // Replaced parts summary across filtered services
  const pecasSummary = React.useMemo(() => {
    const map = {};
    filteredServicos.forEach(s => {
      if (s.pecas_substituidas && typeof s.pecas_substituidas === 'object') {
        Object.entries(s.pecas_substituidas).forEach(([peca, qty]) => {
          const count = Number(qty) || 0;
          if (count > 0) {
            map[peca] = (map[peca] || 0) + count;
          }
        });
      }
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredServicos]);

  const handleClearFilters = () => {
    setPolicialSearch('');
    setItemSearch('');
    setLotacaoFilter('');
    setDeptoFilter('');
    setTipoServicoFilter('');
    setArmeiroFilter('');
    setStatusFilter('Todos');
    setDataInicio('');
    setDataFim('');
    setLoteQuery('');
  };

  const handlePrintOSCard = (s) => {
    const pecasList = Object.entries(s.pecas_substituidas || {})
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([peca, qty]) => `<li><strong>${peca}:</strong> ${qty} un.</li>`)
      .join('');

    const printWin = window.open('', '_blank', 'width=800,height=900');
    if (!printWin) return;

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Ordem de Serviço - ${s.codigo}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #1a202c; font-size: 13px; line-height: 1.5; }
            .header { text-align: center; border-bottom: 2px solid #1a365d; padding-bottom: 12px; margin-bottom: 20px; }
            .header h1 { font-size: 18px; margin: 0; color: #1a365d; text-transform: uppercase; }
            .header h2 { font-size: 14px; margin: 4px 0 0 0; color: #4a5568; font-weight: normal; }
            .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; }
            .badge-green { background: #c6f6d5; color: #22543d; }
            .badge-yellow { background: #fefcbf; color: #744210; }
            .box { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin-bottom: 16px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
            .label { font-size: 10px; text-transform: uppercase; color: #718096; font-weight: bold; display: block; }
            .val { font-size: 13px; font-weight: bold; color: #2d3748; }
            .signatures { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; }
            .line { border-top: 1px solid #718096; margin-top: 40px; padding-top: 6px; font-weight: bold; font-size: 12px; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div style="text-align: right; margin-bottom: 10px;">
            <button onclick="window.print()" style="padding: 8px 16px; background: #2b6cb0; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">🖨️ Imprimir OS</button>
          </div>
          <div class="header">
            <img src="/brasao_pcce.png" alt="Brasão PC-CE" style="height: 65px; width: auto; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto;" />
            <h1>POLÍCIA CIVIL DO ESTADO DO CEARÁ</h1>
            <h2>GOVERNO DO ESTADO • SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL</h2>
            <h2>DEPARTAMENTO TÉCNICO OPERACIONAL</h2>
            <h2>SEÇÃO DE AQUISIÇÃO, LOGÍSTICA E TIRO - DTO</h2>
            <div style="margin-top: 10px; font-size: 16px; font-weight: bold; color: #1a365d;">
              ORDEM DE SERVIÇO Nº ${s.codigo}
            </div>
          </div>

          <div class="box">
            <div class="grid">
              <div>
                <span class="label">Data de Recebimento</span>
                <span class="val">${formatLocalDate(s.data_rec || s.criado_em)}</span>
              </div>
              <div>
                <span class="label">Situação Atual</span>
                <span class="val">${s.status}</span>
              </div>
            </div>
          </div>

          <div class="box">
            <h3 style="margin: 0 0 10px 0; font-size: 13px; color: #1a365d; border-bottom: 1px solid #cbd5e0; padding-bottom: 4px;">👤 DADOS DO POLICIAL SOLICITANTE</h3>
            <div class="grid">
              <div>
                <span class="label">Nome do Policial</span>
                <span class="val">${s.policial_nome || '—'}</span>
              </div>
              <div>
                <span class="label">Matrícula</span>
                <span class="val">${s.matricula || '—'}</span>
              </div>
              <div>
                <span class="label">Unidade / Lotação</span>
                <span class="val">${s.lotacao || '—'}</span>
              </div>
              <div>
                <span class="label">Departamento</span>
                <span class="val">${s.depto || '—'}</span>
              </div>
            </div>
          </div>

          <div class="box">
            <h3 style="margin: 0 0 10px 0; font-size: 13px; color: #1a365d; border-bottom: 1px solid #cbd5e0; padding-bottom: 4px;">🔫 DADOS DO EQUIPAMENTO / ARMAMENTO</h3>
            <div class="grid">
              <div>
                <span class="label">Especificação</span>
                <span class="val">${s.marca || ''} ${s.modelo || ''}</span>
              </div>
              <div>
                <span class="label">Nº de Série</span>
                <span class="val" style="color: #c53030;">${s.serie || '—'}</span>
              </div>
              <div>
                <span class="label">Calibre</span>
                <span class="val">${s.calibre || '—'}</span>
              </div>
              <div>
                <span class="label">Categoria</span>
                <span class="val">${s.categoria || 'Armamento'}</span>
              </div>
            </div>
          </div>

          <div class="box">
            <h3 style="margin: 0 0 10px 0; font-size: 13px; color: #1a365d; border-bottom: 1px solid #cbd5e0; padding-bottom: 4px;">🛠️ DETALHES DO SERVIÇO & PARECER TÉCNICO</h3>
            <div style="margin-bottom: 10px;">
              <span class="label">Tipo de Serviço</span>
              <span class="val" style="color: #2b6cb0;">${s.tipo}</span>
            </div>
            <div style="margin-bottom: 10px;">
              <span class="label">Armeiro Responsável</span>
              <span class="val">${s.armeiro || '—'}</span>
            </div>
            <div style="margin-bottom: 10px;">
              <span class="label">Descrição do Problema / Solicitação</span>
              <div style="background: #fff; padding: 8px; border: 1px solid #cbd5e0; border-radius: 4px; margin-top: 4px;">${s.descricao || 'Sem descrição cadastrada.'}</div>
            </div>
            <div>
              <span class="label">Parecer Técnico / Trabalho Realizado</span>
              <div style="background: #fff; padding: 8px; border: 1px solid #cbd5e0; border-radius: 4px; margin-top: 4px;">${s.trabalho_realizado || 'Pendente / Em análise.'}</div>
            </div>
          </div>

          <div class="box">
            <h3 style="margin: 0 0 10px 0; font-size: 13px; color: #1a365d; border-bottom: 1px solid #cbd5e0; padding-bottom: 4px;">⚙️ PEÇAS SUBSTITUÍDAS</h3>
            ${pecasList ? `<ul style="margin: 0; padding-left: 20px;">${pecasList}</ul>` : '<p style="margin:0; color: #718096;">Nenhuma peça substituída nesta ordem de serviço.</p>'}
          </div>

          <div class="signatures">
            <div>
              <div class="line">
                ${s.armeiro || 'Armeiro Responsável'}<br/>
                <span style="font-weight: normal; font-size: 11px; color: #718096;">Seção de Aquisição, Logística e Tiro - DTO</span>
              </div>
            </div>
            <div>
              <div class="line">
                ${s.policial_nome || 'Policial Responsável'}<br/>
                <span style="font-weight: normal; font-size: 11px; color: #718096;">Matrícula: ${s.matricula || '—'}</span>
              </div>
            </div>
          </div>

          <div style="margin-top: 40px; padding-top: 12px; border-top: 1px solid #cbd5e0; text-align: center; font-size: 11px; color: #4a5568;">
            <strong>Av. Professor Guilhon, s/n, Aeroporto, 4º Andar, Fortaleza/CE – CEP 60415-330</strong> | <strong>Tel. 3101-7300.</strong>
          </div>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  return (
    <div className="view-container">
      {/* View Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1a365d', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            📑 Relatórios e Fichas de Serviços da Armaria
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#4a5568', fontSize: '14px' }}>
            Relatório consolidado de ordens de serviço, manutenção de armamento, troca de peças e laudos técnicos.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-outline" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            🖨️ Imprimir Relatório Consolidado
          </button>
        </div>
      </div>

      {/* KPI Cards Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ margin: 0, padding: '16px', borderLeft: '4px solid #2b6cb0', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#718096', textTransform: 'uppercase' }}>Total de Ordens de Serviço</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2b6cb0', marginTop: '4px' }}>{servicos.length}</div>
          <div style={{ fontSize: '11px', color: '#a0aec0', marginTop: '2px' }}>no sistema de armaria</div>
        </div>

        <div className="card" style={{ margin: 0, padding: '16px', borderLeft: '4px solid #dd6b20', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#718096', textTransform: 'uppercase' }}>Em Andamento / Abertas</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dd6b20', marginTop: '4px' }}>
            {servicos.filter(s => s.status !== 'Concluído' && s.status !== 'Cancelado').length}
          </div>
          <div style={{ fontSize: '11px', color: '#a0aec0', marginTop: '2px' }}>aguardando reparo / devolução</div>
        </div>

        <div className="card" style={{ margin: 0, padding: '16px', borderLeft: '4px solid #38a169', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#718096', textTransform: 'uppercase' }}>Concluídas e Devolvidas</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#38a169', marginTop: '4px' }}>
            {servicos.filter(s => s.status === 'Concluído').length}
          </div>
          <div style={{ fontSize: '11px', color: '#a0aec0', marginTop: '2px' }}>manutenções finalizadas</div>
        </div>

        <div className="card" style={{ margin: 0, padding: '16px', borderLeft: '4px solid #805ad5', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#718096', textTransform: 'uppercase' }}>Com Troca de Peças</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#805ad5', marginTop: '4px' }}>
            {servicos.filter(s => s.pecas_substituidas && Object.values(s.pecas_substituidas).some(q => Number(q) > 0)).length}
          </div>
          <div style={{ fontSize: '11px', color: '#a0aec0', marginTop: '2px' }}>com insumos empregados</div>
        </div>
      </div>

      {/* Replaced Parts Summary Card (if any) */}
      {pecasSummary.length > 0 && (
        <div className="card" style={{ margin: '0 0 24px 0', padding: '16px 20px', background: '#f7fafc', border: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 'bold', color: '#2d3748', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ⚙️ Peças e Componentes Substituídos no Período Selecionado:
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {pecasSummary.map(([peca, qty]) => (
              <span key={peca} style={{ fontSize: '12px', fontWeight: 'bold', backgroundColor: '#ebf8ff', color: '#2b6cb0', padding: '4px 10px', borderRadius: '16px', border: '1px solid #bee3f8', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span>{peca}</span>
                <span style={{ backgroundColor: '#2b6cb0', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '10px' }}>{qty} un.</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter Panel */}
      <div className="card" style={{ margin: '0 0 24px 0', padding: '20px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', borderBottom: '1px solid #edf2f7', paddingBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#1a365d' }}>
            🔍 Painel de Pesquisa e Filtros
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn btn-xs ${!isLoteMode ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setIsLoteMode(false)}
            >
              🔍 Filtros Detalhados
            </button>
            <button
              className={`btn btn-xs ${isLoteMode ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setIsLoteMode(true)}
            >
              📦 Busca por Lote de OSs / Séries
            </button>
          </div>
        </div>

        {!isLoteMode ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '16px 20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>
                👤 Policial (Nome / Matrícula)
              </label>
              <input
                type="text"
                value={policialSearch}
                onChange={e => setPolicialSearch(e.target.value)}
                placeholder="Ex: Silva ou 12345..."
                style={{ width: '100%', padding: '6px 10px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>
                <GlockIcon size={16} /> Equipamento / Série / OS
              </label>
              <input
                type="text"
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                placeholder="Ex: Taurus, PT92, OS-001..."
                style={{ width: '100%', padding: '6px 10px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>
                🏛️ Departamento
              </label>
              <select
                value={deptoFilter}
                onChange={e => {
                  setDeptoFilter(e.target.value);
                  setLotacaoFilter('');
                }}
                style={{ width: '100%', padding: '6px 10px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
              >
                <option value="">Todos os Departamentos</option>
                {allDepartamentosOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>
                🏢 Lotação / Unidade
              </label>
              <select
                value={lotacaoFilter}
                onChange={e => setLotacaoFilter(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
              >
                <option value="">{deptoFilter ? 'Todas as Unidades do Depto' : 'Todas as Unidades'}</option>
                {allLotacoesOptions.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>
                🛠️ Tipo de Serviço
              </label>
              <select
                value={tipoServicoFilter}
                onChange={e => setTipoServicoFilter(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
              >
                <option value="">Todos os Tipos</option>
                {allTiposOptions.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>
                👨‍🔧 Armeiro Responsável
              </label>
              <select
                value={armeiroFilter}
                onChange={e => setArmeiroFilter(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
              >
                <option value="">Todos os Armeiros</option>
                {allArmeirosOptions.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>
                📌 Situação
              </label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
              >
                {allStatusOptions.map(st => (
                  <option key={st.value} value={st.value}>{st.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>
                📅 Data Inicial
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={e => setDataInicio(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>
                📅 Data Final
              </label>
              <input
                type="date"
                value={dataFim}
                onChange={e => setDataFim(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
              />
            </div>
          </div>
        ) : (
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#2d3748', marginBottom: '6px' }}>
              📋 Insira múltiplos códigos de OS ou números de série (um por linha ou separados por vírgula):
            </label>
            <textarea
              value={loteQuery}
              onChange={e => setLoteQuery(e.target.value)}
              rows={4}
              placeholder="Ex: OS-001&#10;OS-002&#10;K12345&#10;T98765"
              style={{ width: '100%', padding: '10px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px', fontFamily: 'monospace' }}
            />
          </div>
        )}

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #edf2f7', paddingTop: '12px' }}>
          <span style={{ fontSize: '13px', color: '#718096', fontWeight: 'bold' }}>
            Exibindo {filteredServicos.length} de {servicos.length} ordens de serviço
          </span>
          <button className="btn btn-xs btn-outline" onClick={handleClearFilters}>
            🧹 Limpar Filtros
          </button>
        </div>
      </div>

      {/* Main Results Table Card */}
      <div className="card" style={{ margin: 0, padding: '20px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div className="table-wrap" style={{ margin: 0 }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: '30px', color: '#718096' }}>Carregando histórico de serviços da armaria...</p>
          ) : filteredServicos.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>OS / Código</th>
                  <th>Recebido em</th>
                  <th>Policial Solicitante</th>
                  <th>Lotação / Depto</th>
                  <th>Equipamento</th>
                  <th>Nº Série</th>
                  <th>Armeiro</th>
                  <th>Serviço / Manutenção</th>
                  <th>Parecer Técnico</th>
                  <th>Peças Substituídas</th>
                  <th>Situação</th>
                  <th style={{ textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedServicosList.map(s => {
                  const pecasArray = Object.entries(s.pecas_substituidas || {})
                    .filter(([_, qty]) => Number(qty) > 0);
                  return (
                    <tr 
                      key={s.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedOSModal(s)}
                    >
                      <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                        <button
                          className="btn btn-xs btn-outline"
                          style={{ padding: '2px 6px', fontSize: '11px', fontWeight: 'bold', color: '#2b6cb0', borderColor: '#bee3f8', backgroundColor: '#ebf8ff' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOSModal(s);
                          }}
                        >
                          {s.codigo} 🔎
                        </button>
                      </td>
                      <td>{formatLocalDate(s.data_rec || s.criado_em)}</td>
                      <td>
                        <div><strong style={{ color: '#1a365d' }}>👤 {s.policial_nome}</strong></div>
                        <div style={{ fontSize: '11px', color: '#718096' }}>Matrícula: {s.matricula || '—'}</div>
                      </td>
                      <td>
                        <div>{s.lotacao || '—'}</div>
                        <div style={{ fontSize: '11px', color: '#718096' }}>Depto: {s.depto || '—'}</div>
                      </td>
                      <td>
                        <div><strong>{s.marca} {s.modelo}</strong></div>
                        <div style={{ fontSize: '11px', color: '#718096' }}>Calibre: {s.calibre || '—'}</div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#e53e3e' }}>
                        {s.serie || '—'}
                      </td>
                      <td>{s.armeiro || '—'}</td>
                      <td>
                        <span style={{ fontWeight: '600', color: '#2b6cb0' }}>{s.tipo}</span>
                        {s.descricao && (
                          <p style={{ fontSize: '11px', color: '#718096', margin: '4px 0 0 0', maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.descricao}
                          </p>
                        )}
                      </td>
                      <td>
                        {s.trabalho_realizado ? (
                          <p style={{ fontSize: '12px', margin: 0, maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.trabalho_realizado}
                          </p>
                        ) : (
                          <span style={{ color: '#a0aec0', fontSize: '11px' }}>—</span>
                        )}
                      </td>
                      <td>
                        {pecasArray.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '160px' }}>
                            {pecasArray.map(([peca, qty]) => (
                              <span key={peca} style={{ fontSize: '9px', backgroundColor: '#ebf8ff', color: '#2b6cb0', padding: '1px 4px', borderRadius: '3px', border: '1px solid #bee3f8' }}>
                                {peca} ({qty})
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#a0aec0', fontSize: '11px' }}>Nenhuma</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${s.status === 'Concluído' ? 'badge-green' : 'badge-yellow'}`}>
                          {s.status}
                        </span>
                        {s.data_dev && (
                          <div style={{ fontSize: '10px', color: '#718096', marginTop: '4px' }}>
                            Dev. {formatLocalDate(s.data_dev)}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button
                            className="btn btn-xs btn-primary"
                            style={{ padding: '3px 8px', fontWeight: 'bold', backgroundColor: '#2563eb', borderColor: '#2563eb' }}
                            title="Editar dados da Ordem de Serviço (Status, Parecer, Peças...)"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditOS(s);
                            }}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            className="btn btn-xs btn-outline"
                            style={{ padding: '3px 8px', fontWeight: 'bold' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOSModal(s);
                            }}
                          >
                            🔎 Ficha
                          </button>
                          <button
                            className="btn btn-xs btn-outline"
                            style={{ padding: '3px 8px' }}
                            title="Imprimir Ordem de Serviço"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrintOSCard(s);
                            }}
                          >
                            🖨️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p style={{ textAlign: 'center', color: '#718096', padding: '30px', margin: 0 }}>
              Nenhuma ordem de serviço cadastrada ou encontrada com os filtros atuais.
            </p>
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }}>
            <span style={{ color: '#4a5568' }}>
              Exibindo <strong>{Math.min(filteredServicos.length, (currentPage - 1) * itemsPerPage + 1)}</strong> a{' '}
              <strong>{Math.min(filteredServicos.length, currentPage * itemsPerPage)}</strong> de{' '}
              <strong>{filteredServicos.length}</strong> ordens de serviço
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

      {/* OS Detail Modal */}
      {selectedOSModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2200, padding: '16px' }}>
          <div className="card" style={{ width: '700px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#fff', margin: 0, padding: '24px', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#1a365d', fontSize: '18px', fontWeight: 'bold' }}>
                  🛠️ Ficha de Ordem de Serviço Nº {selectedOSModal.codigo}
                </h3>
                <p style={{ margin: '4px 0 0 0', color: '#718096', fontSize: '13px' }}>
                  Recebido em: <strong>{formatLocalDate(selectedOSModal.data_rec || selectedOSModal.criado_em)}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedOSModal(null)}
                style={{ background: 'none', border: 'none', fontSize: '22px', fontWeight: 'bold', cursor: 'pointer', color: '#a0aec0' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#f7fafc', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '16px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#718096', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>👤 Policial</span>
                <span style={{ fontWeight: 'bold', color: '#2d3748' }}>{selectedOSModal.policial_nome}</span>
                <div style={{ fontSize: '11px', color: '#718096' }}>Matrícula: {selectedOSModal.matricula || '—'}</div>
              </div>
              <div>
                <span style={{ color: '#718096', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>🏢 Unidade / Depto</span>
                <span style={{ fontWeight: 'bold', color: '#2d3748' }}>{selectedOSModal.lotacao || '—'}</span>
                <div style={{ fontSize: '11px', color: '#718096' }}>{selectedOSModal.depto || '—'}</div>
              </div>
              <div>
                <span style={{ color: '#718096', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><GlockIcon size={14} /> Equipamento</span>
                <span style={{ fontWeight: 'bold', color: '#2d3748' }}>{selectedOSModal.marca} {selectedOSModal.modelo}</span>
                <div style={{ fontSize: '11px', color: '#718096' }}>Calibre: {selectedOSModal.calibre || '—'}</div>
              </div>
              <div>
                <span style={{ color: '#718096', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>🔢 Nº de Série</span>
                <span style={{ fontWeight: 'bold', color: '#c53030', fontFamily: 'monospace' }}>{selectedOSModal.serie || '—'}</span>
              </div>
            </div>

            <div style={{ marginBottom: '16px', fontSize: '13px' }}>
              <div style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#1a365d', display: 'block', marginBottom: '2px' }}>🛠️ Tipo de Serviço:</strong>
                <span style={{ color: '#2b6cb0', fontWeight: 'bold' }}>{selectedOSModal.tipo}</span>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#1a365d', display: 'block', marginBottom: '2px' }}>👨‍🔧 Armeiro Responsável:</strong>
                <span>{selectedOSModal.armeiro || 'Não especificado'}</span>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#1a365d', display: 'block', marginBottom: '2px' }}>📝 Descrição do Problema:</strong>
                <div style={{ background: '#edf2f7', padding: '10px', borderRadius: '4px', color: '#2d3748' }}>
                  {selectedOSModal.descricao || 'Sem descrição cadastrada.'}
                </div>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#1a365d', display: 'block', marginBottom: '2px' }}>📋 Parecer Técnico / Trabalho Realizado:</strong>
                <div style={{ background: '#edf2f7', padding: '10px', borderRadius: '4px', color: '#2d3748' }}>
                  {selectedOSModal.trabalho_realizado || 'Trabalho em andamento / pendente.'}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '20px', background: '#f7fafc', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <strong style={{ color: '#1a365d', fontSize: '13px', display: 'block', marginBottom: '8px' }}>⚙️ Peças Substituídas:</strong>
              {Object.entries(selectedOSModal.pecas_substituidas || {}).filter(([_, qty]) => Number(qty) > 0).length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {Object.entries(selectedOSModal.pecas_substituidas || {}).filter(([_, qty]) => Number(qty) > 0).map(([peca, qty]) => (
                    <span key={peca} style={{ fontSize: '12px', fontWeight: 'bold', backgroundColor: '#ebf8ff', color: '#2b6cb0', padding: '4px 8px', borderRadius: '4px', border: '1px solid #bee3f8' }}>
                      {peca}: {qty} un.
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: '12px', color: '#718096' }}>Nenhuma peça substituída cadastrada nesta OS.</span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-outline" onClick={() => handlePrintOSCard(selectedOSModal)}>
                  🖨️ Imprimir Ficha da OS
                </button>
                <button className="btn btn-primary" style={{ backgroundColor: '#2563eb', borderColor: '#2563eb' }} onClick={() => handleOpenEditOS(selectedOSModal)}>
                  ✏️ Editar Esta OS
                </button>
              </div>
              <button className="btn btn-outline" onClick={() => setSelectedOSModal(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit OS Modal */}
      {editingOS && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2300, padding: '16px' }}>
          <div className="card" style={{ width: '750px', maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', backgroundColor: '#fff', margin: 0, padding: '24px', borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#1a365d', fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ✏️ Atualizar Ordem de Serviço Nº {editingOS.codigo}
                </h3>
                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
                  Policial: <strong>{editingOS.policial_nome}</strong> ({editingOS.matricula || '—'}) | Arma: <strong>{editingOS.marca} {editingOS.modelo} ({editingOS.serie || 'S/N'})</strong>
                </p>
              </div>
              <button
                onClick={() => setEditingOS(null)}
                style={{ background: 'none', border: 'none', fontSize: '22px', fontWeight: 'bold', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            {editSuccess && (
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', marginBottom: '16px' }}>
                ✓ {editSuccess}
              </div>
            )}

            {/* Grid 1: Status, Armeiro, Tipo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px 20px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  📌 Situação / Status *
                </label>
                <select
                  value={editForm.status}
                  onChange={e => {
                    const newStatus = e.target.value;
                    setEditForm(prev => ({
                      ...prev,
                      status: newStatus,
                      data_dev: newStatus === 'Concluído' && !prev.data_dev ? new Date().toISOString().split('T')[0] : prev.data_dev
                    }));
                  }}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 'bold', color: '#1e293b' }}
                >
                  <option value="Aberto">Aberto</option>
                  <option value="Em Andamento">Em Andamento</option>
                  <option value="Aguardando Peça">Aguardando Peça</option>
                  <option value="Aguardando Teste">Aguardando Teste</option>
                  <option value="Encaminhado à Fábrica">Encaminhado à Fábrica</option>
                  <option value="Concluído">Concluído (Finalizado)</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  👨‍🔧 Armeiro Responsável
                </label>
                <input
                  type="text"
                  value={editForm.armeiro}
                  onChange={e => setEditForm(prev => ({ ...prev, armeiro: e.target.value }))}
                  placeholder="Ex: Thales, Santiago, Sales..."
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  🛠️ Tipo de Serviço
                </label>
                <input
                  type="text"
                  value={editForm.tipo}
                  onChange={e => setEditForm(prev => ({ ...prev, tipo: e.target.value }))}
                  placeholder="Ex: Manutenção, Limpeza, Troca de Peças..."
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                />
              </div>
            </div>

            {/* Grid 2: Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px 20px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  📅 Data de Recebimento
                </label>
                <input
                  type="date"
                  value={editForm.data_rec}
                  onChange={e => setEditForm(prev => ({ ...prev, data_rec: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  🏁 Data de Devolução / Conclusão
                </label>
                <input
                  type="date"
                  value={editForm.data_dev}
                  onChange={e => setEditForm(prev => ({ ...prev, data_dev: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                📝 Descrição do Problema / Solicitação
              </label>
              <textarea
                value={editForm.descricao}
                onChange={e => setEditForm(prev => ({ ...prev, descricao: e.target.value }))}
                rows={2}
                placeholder="Descrição enviada ou relatada pelo policial..."
                style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '4px' }}>
                📋 Parecer Técnico / Trabalho Realizado pelo Armeiro
              </label>
              <textarea
                value={editForm.trabalho_realizado}
                onChange={e => setEditForm(prev => ({ ...prev, trabalho_realizado: e.target.value }))}
                rows={3}
                placeholder="Informe detalhadamente os procedimentos efetuados, testes e estado final da arma..."
                style={{ width: '100%', padding: '10px', fontSize: '13px', border: '1px solid #3b82f6', borderRadius: '6px', backgroundColor: '#f0f9ff' }}
              />
            </div>

            {/* Peças Substituídas Section */}
            <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <strong style={{ fontSize: '13px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ⚙️ Peças e Insumos Substituídos
                </strong>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Ajuste a quantidade utilizada</span>
              </div>

              {/* Sugestões de Peças Rápida */}
              <div style={{ marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '6px' }}>Adicionar peça rápida:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[
                    'Percursor',
                    'Mola Recuperadora',
                    'Extrator',
                    'Cão',
                    'Trava da Agulha',
                    'Ferrolho',
                    'Carregador',
                    'Pino do Percussor',
                    'Retém do Carregador',
                    'Alça / Massa de Mira'
                  ].map(peca => (
                    <button
                      key={peca}
                      type="button"
                      onClick={() => handlePecaQtyChange(peca, (editForm.pecas_substituidas[peca] || 0) + 1)}
                      style={{ padding: '3px 8px', fontSize: '11px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', cursor: 'pointer', color: '#334155', fontWeight: '500' }}
                    >
                      + {peca}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input para peça customizada */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <input
                  type="text"
                  value={customPecaInput}
                  onChange={e => setCustomPecaInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomPeca(); } }}
                  placeholder="Ou digite o nome de outra peça e pressione Enter..."
                  style={{ flex: 1, padding: '6px 10px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                />
                <button
                  type="button"
                  onClick={handleAddCustomPeca}
                  style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 'bold', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  ➕ Adicionar Peça
                </button>
              </div>

              {/* Lista de Peças Selecionadas */}
              {Object.keys(editForm.pecas_substituidas).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(editForm.pecas_substituidas).map(([peca, qty]) => (
                    <div key={peca} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>{peca}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => handlePecaQtyChange(peca, qty - 1)}
                          style={{ width: '26px', height: '26px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f1f5f9', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                        >
                          -
                        </button>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', minWidth: '24px', textAlign: 'center', color: '#0369a1' }}>
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => handlePecaQtyChange(peca, qty + 1)}
                          style={{ width: '26px', height: '26px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f1f5f9', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePecaQtyChange(peca, 0)}
                          style={{ marginLeft: '6px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                          title="Remover peça"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '8px' }}>
                  Nenhuma peça selecionada para esta ordem de serviço.
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setEditingOS(null)}
                disabled={savingEdit}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ backgroundColor: '#16a34a', borderColor: '#16a34a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={handleSaveEditOS}
                disabled={savingEdit}
              >
                {savingEdit ? '⏳ Salvando...' : '💾 Salvar Alterações na OS'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VIEW: Relatórios
// ==========================================
function RelatoriosView() {
  const [selectedItemForAudit, setSelectedItemForAudit] = useState(null);
  const [selectedItemBens, setSelectedItemBens] = useState([]);
  const [loadingBens, setLoadingBens] = useState(false);
  const [allBens, setAllBens] = useState([]);

  // Card C Bens Filters
  const [bemSearch, setBemSearch] = useState('');
  const [bemStatusFilter, setBemStatusFilter] = useState('Todos');

  // Entry Batch Modal
  const [showEntryBatchModal, setShowEntryBatchModal] = useState(false);
  const [modalSearchSerie, setModalSearchSerie] = useState('');

  // Cautela / Movement Details Modal
  const [selectedCautelaModal, setSelectedCautelaModal] = useState(null);

  // Print Report Modal
  const [printModalReport, setPrintModalReport] = useState(null);

  const handleOpenPrintReport = (type, title, data) => {
    setPrintModalReport({ type, title, data, date: new Date().toLocaleString('pt-BR') });
  };

  // ==========================================
  // STATE: Inventário Consolidado
  // ==========================================
  const [categoria, setCategoria] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchInventario, setSearchInventario] = useState('');
  const [statusInventario, setStatusInventario] = useState('Todos');

  // ==========================================
  // STATE: Histórico Avançado & Auditoria Geral
  // ==========================================
  const [searchPolicial, setSearchPolicial] = useState('');
  const [searchSerie, setSearchSerie] = useState('');
  const [lotacaoFilter, setLotacaoFilter] = useState('');
  const [deptoFilter, setDeptoFilter] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('');
  const [statusCautelaFilter, setStatusCautelaFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Batch search
  const [isBatchSearch, setIsBatchSearch] = useState(false);
  const [batchText, setBatchText] = useState('');

  // Dropdowns lists
  const [lotacoes, setLotacoes] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);

  // Loaded database
  const [cautelas, setCautelas] = useState([]);
  const [searchingHistorico, setSearchingHistorico] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const relatorioCautelaLotacaoMap = React.useMemo(() => buildLotacaoToDeptoMap(lotacoes), [lotacoes]);

  // Combined Departments for Relatórios dropdown (synced with Cadastros -> Unidades & cautelas)
  const allRelatorioDeptosOptions = React.useMemo(() => {
    const map = new Map();

    const addDepto = (d) => {
      if (!d) return;
      const name = typeof d === 'string' ? d : (d.nome || d.rotulo || d.valor || d.depto);
      if (name && typeof name === 'string' && name.trim()) {
        const norm = normalizeStr(name);
        if (!map.has(norm)) map.set(norm, name.trim());
      }
    };

    getSavedDeptosList().forEach(addDepto);
    departamentos.forEach(addDepto);
    lotacoes.forEach(l => addDepto(l.depto || l.departamento));
    cautelas.forEach(c => addDepto(c.depto || c.departamento));

    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
    );
  }, [departamentos, lotacoes, cautelas]);

  // Filtered Lotações for Relatórios dropdown
  const allRelatorioLotacoesOptions = React.useMemo(() => {
    const map = new Map();

    const addUnit = (unitName, deptoName) => {
      if (!unitName) return;
      const uName = String(unitName).trim();
      if (!uName) return;
      const effectiveDepto = deptoName || relatorioCautelaLotacaoMap.get(normalizeStr(uName));
      if (matchDeptoFlex(effectiveDepto, deptoFilter)) {
        const norm = normalizeStr(uName);
        if (!map.has(norm)) map.set(norm, uName);
      }
    };

    lotacoes.forEach(l => {
      if (l) addUnit(l.nome || l.lotacao || l.unidade, l.depto || l.departamento);
    });

    cautelas.forEach(c => {
      if (c) addUnit(c.lotacao, c.depto || c.departamento);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
    );
  }, [lotacoes, cautelas, deptoFilter, relatorioCautelaLotacaoMap]);

  // Fetch dropdowns and pre-load full history on mount so user has immediate insights
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const [lotData, depData] = await Promise.all([
          apiService.getList('lotacoes', new URLSearchParams({ page_size: '500' })),
          apiService.getList('departamentos', new URLSearchParams({ page_size: '500' }))
        ]);
        setLotacoes(lotData.results || lotData || []);
        setDepartamentos(depData.results || depData || []);
      } catch (err) {
        console.error('Erro ao buscar dropdowns de relatórios:', err);
      }
    };
    fetchDropdowns();

    // Preload history and individual assets
    const preloadHistory = async () => {
      setSearchingHistorico(true);
      try {
        const [cautelasData, bensData] = await Promise.all([
          apiService.getList('cautelas', new URLSearchParams({ page_size: '5000' })),
          apiService.getList('bens', new URLSearchParams({ page_size: '5000' }))
        ]);
        setCautelas(cautelasData.results || cautelasData || []);
        setAllBens(bensData.results || bensData || []);
        setHasSearched(true);
      } catch (err) {
        console.error('Erro ao pre-carregar histórico:', err);
      } finally {
        setSearchingHistorico(false);
      }
    };
    preloadHistory();
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoria && categoria !== 'Todas') {
        params.append('categoria', categoria);
      }
      const data = await apiService.getList('itens', params);
      setResults(data.results || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate when category changes
  useEffect(() => {
    handleGenerate();
  }, [categoria]);

  // Load individual assets (bens) when an item is selected for audit
  useEffect(() => {
    if (selectedItemForAudit) {
      setLoadingBens(true);
      const term = searchInventario.trim();
      setBemSearch(term);
      setModalSearchSerie(term);
      setBemStatusFilter('Todos');
      apiService.getList(`itens/${selectedItemForAudit.id}/bens`)
        .then(data => {
          const res = data.results || data || [];
          if (res.length > 0) {
            setSelectedItemBens(res);
          } else {
            const localBens = allBens.filter(b => String(b.item_id) === String(selectedItemForAudit.id));
            setSelectedItemBens(localBens);
          }
        })
        .catch(err => {
          console.error('Erro ao carregar bens do item:', err);
          const localBens = allBens.filter(b => String(b.item_id) === String(selectedItemForAudit.id));
          setSelectedItemBens(localBens);
        })
        .finally(() => {
          setLoadingBens(false);
        });
    } else {
      setSelectedItemBens([]);
    }
  }, [selectedItemForAudit, allBens, searchInventario]);

  // Comprehensive search matcher function (matches main item fields, individual asset serials, cautela records, or range)
  const checkItemMatchesQuery = React.useCallback((r, query) => {
    if (!query) return true;
    const q = query.toLowerCase().trim();
    if (!q) return true;

    if (String(r.descricao || '').toLowerCase().includes(q)) return true;
    if (String(r.marca || '').toLowerCase().includes(q)) return true;
    if (String(r.modelo || '').toLowerCase().includes(q)) return true;
    if (String(r.calibre || '').toLowerCase().includes(q)) return true;
    if (String(r.serie || '').toLowerCase().includes(q)) return true;
    if (String(r.numero_empenho || '').toLowerCase().includes(q)) return true;
    if (String(r.numero_nota_fiscal || '').toLowerCase().includes(q)) return true;

    // Check in individual assets (allBens)
    const bemMatch = allBens.some(b => String(b.item_id) === String(r.id) && (
      String(b.serie || '').toLowerCase().includes(q) ||
      String(b.patrimonio || '').toLowerCase().includes(q)
    ));
    if (bemMatch) return true;

    // Check in cautelas
    const cautelaMatch = cautelas.some(c => String(c.item_id || c.item) === String(r.id) && (
      String(c.serie || '').toLowerCase().includes(q) ||
      String(c.policial_nome || '').toLowerCase().includes(q) ||
      String(c.matricula || '').toLowerCase().includes(q)
    ));
    if (cautelaMatch) return true;

    // Check sequential serial range if r.serie is base serial (e.g., CNW000 and qtd_total = 50 -> CNW000 to CNW049)
    if (r.serie && Number(r.qtd_total || 1) > 1) {
      const matchBase = String(r.serie).match(/^([A-Za-z\-_]*?)(\d+)$/);
      const matchQ = q.match(/^([a-za-z\-_]*?)(\d+)$/);
      if (matchBase && matchQ && matchBase[1].toLowerCase() === matchQ[1].toLowerCase()) {
        const startNum = parseInt(matchBase[2], 10);
        const qNum = parseInt(matchQ[2], 10);
        if (!isNaN(startNum) && !isNaN(qNum) && qNum >= startNum && qNum < startNum + Number(r.qtd_total)) {
          return true;
        }
      }
    }

    return false;
  }, [allBens, cautelas]);

  const filteredInventarioResults = React.useMemo(() => {
    return results.filter(r => {
      // Search term
      if (searchInventario.trim() && !checkItemMatchesQuery(r, searchInventario)) {
        return false;
      }
      
      // Status option
      if (statusInventario !== 'Todos') {
        if (statusInventario === 'Disponíveis') {
          return Number(r.qtd_disp || 0) > 0;
        }
        if (statusInventario === 'Em Uso') {
          const emUso = Math.max(0, Number(r.qtd_total || 0) - Number(r.qtd_disp || 0));
          return emUso > 0 || String(r.status || '').toLowerCase() === 'em uso' || Number(r.qtd_disp || 0) === 0;
        }
        if (statusInventario === 'Estoque Crítico') {
          return Number(r.qtd_disp || 0) <= Number(r.qtd_min || 1);
        }

        const normFilter = String(statusInventario).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const normStatus = String(r.status || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const hasBemMatch = allBens.some(b => {
          if (String(b.item_id) !== String(r.id)) return false;
          const bNorm = String(b.status || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          return bNorm === normFilter;
        });
        return normStatus === normFilter || hasBemMatch;
      }
      return true;
    });
  }, [results, searchInventario, statusInventario, checkItemMatchesQuery]);

  const handleFilterHistorico = async () => {
    setSearchingHistorico(true);
    try {
      const [cautelasData, bensData] = await Promise.all([
        apiService.getList('cautelas', new URLSearchParams({ page_size: '5000' })),
        apiService.getList('bens', new URLSearchParams({ page_size: '5000' }))
      ]);

      setCautelas(cautelasData.results || cautelasData || []);
      setAllBens(bensData.results || bensData || []);
      setHasSearched(true);

      // Auto-select matching inventory item if query corresponds to a specific item or serial
      const q = (searchSerie || batchText || '').toLowerCase().trim();
      if (q && results && results.length > 0) {
        const matches = results.filter(r => checkItemMatchesQuery(r, q));
        if (matches.length > 0) {
          setSelectedItemForAudit(matches[0]);
        }
      }
    } catch (err) {
      alert('Erro ao carregar dados do histórico: ' + err.message);
    } finally {
      setSearchingHistorico(false);
    }
  };

  const handleClearFilters = () => {
    setSearchPolicial('');
    setSearchSerie('');
    setLotacaoFilter('');
    setDeptoFilter('');
    setCategoriaFilter('');
    setStatusCautelaFilter('');
    setDateFrom('');
    setDateTo('');
    setBatchText('');
    setIsBatchSearch(false);
  };

  // 1. Calculations of active locations & history for the selected item
  const locationDistribution = React.useMemo(() => {
    if (!selectedItemForAudit) return [];
    // Filter active cautelas for this item
    const activeCautelas = cautelas.filter(c => 
      (String(c.item_id || c.item) === String(selectedItemForAudit.id)) && 
      (c.status === 'Ativa' || c.status === 'Em Uso')
    );
    const counts = {};
    activeCautelas.forEach(c => {
      const loc = c.lotacao || 'Sem Lotação Especificada';
      counts[loc] = (counts[loc] || 0) + Number(c.qtd || 1);
    });
    return Object.entries(counts)
      .map(([lotacao, qtd]) => ({ lotacao, qtd }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [selectedItemForAudit, cautelas]);

  const filteredSelectedItemBens = React.useMemo(() => {
    return selectedItemBens.filter(b => {
      if (bemSearch.trim()) {
        const q = bemSearch.toLowerCase().trim();
        const matchSerie = String(b.serie || '').toLowerCase().includes(q);
        const matchPatr = String(b.patrimonio || '').toLowerCase().includes(q);
        if (!matchSerie && !matchPatr) return false;
      }
      if (bemStatusFilter !== 'Todos') {
        const normStatus = String(b.status || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (bemStatusFilter === 'Disponíveis') {
          if (normStatus === 'em uso') return false;
        } else if (bemStatusFilter === 'Em Uso') {
          if (normStatus !== 'em uso') return false;
        }
      }
      return true;
    });
  }, [selectedItemBens, bemSearch, bemStatusFilter]);

  const itemCautelasHistory = React.useMemo(() => {
    if (!selectedItemForAudit) return [];
    const filteredCautelas = cautelas.filter(c => String(c.item_id || c.item) === String(selectedItemForAudit.id));
    const itemBens = allBens.filter(b => String(b.item_id) === String(selectedItemForAudit.id));
    const events = [];

    // 1. Entrada em Estoque (Compra / Inclusão inicial do item)
    let displaySerieEntry = selectedItemForAudit.serie || 'LOTE / DIVERSOS';
    if (Number(selectedItemForAudit.qtd_total || 1) > 1 && selectedItemForAudit.serie) {
      const matchBase = String(selectedItemForAudit.serie).match(/^([A-Za-z\-_]*?)(\d+)$/);
      if (matchBase) {
        const prefix = matchBase[1];
        const startNumStr = matchBase[2];
        const startNum = parseInt(startNumStr, 10);
        const endNum = startNum + Number(selectedItemForAudit.qtd_total) - 1;
        const endNumStr = String(endNum).padStart(startNumStr.length, '0');
        displaySerieEntry = `${prefix}${startNumStr} a ${prefix}${endNumStr} (${selectedItemForAudit.qtd_total} un.)`;
      } else {
        displaySerieEntry = `${selectedItemForAudit.serie} (Lote de ${selectedItemForAudit.qtd_total} un.)`;
      }
    }

    events.push({
      id: `entry-${selectedItemForAudit.id}`,
      numero: selectedItemForAudit.numero_nota_fiscal 
        ? `NF: ${selectedItemForAudit.numero_nota_fiscal}` 
        : (selectedItemForAudit.numero_empenho ? `Emp: ${selectedItemForAudit.numero_empenho}` : `CAD-${String(selectedItemForAudit.id).slice(0, 8).toUpperCase()}`),
      data_evento: selectedItemForAudit.dt_aq || selectedItemForAudit.criado_em || selectedItemForAudit.created_at || new Date().toISOString(),
      tipo_evento: 'Entrada em Estoque',
      tipo: 'Entrada',
      policial_nome: 'Armaria / Estoque Central',
      matricula: 'SGA',
      lotacao: 'Estoque Central da Armaria',
      depto: 'Armaria',
      serie: displaySerieEntry,
      detalhes: `Inclusão do item no inventário de estoque. Qtd Total Adquirida: ${selectedItemForAudit.qtd_total || 1} un. ${selectedItemForAudit.fornecedor_nome ? 'Fornecedor: ' + selectedItemForAudit.fornecedor_nome + '.' : ''} ${selectedItemForAudit.valor_compra ? 'Valor Compra: R$ ' + Number(selectedItemForAudit.valor_compra).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}`
    });

    // 2. Movimentações de Cautela e Carga
    filteredCautelas.forEach(c => {
      // Saída (Geração de Cautela / Carga)
      events.push({
        id: `${c.id}-saida`,
        numero: c.numero,
        data_evento: c.data_saida || c.data_cautela || c.criado_em || c.data,
        tipo_evento: c.tipo_cautela === 'Carga' ? 'Saída (Carga de Item)' : 'Saída (Geração de Cautela)',
        tipo: 'Saída',
        policial_nome: c.policial_nome,
        matricula: c.matricula,
        lotacao: c.lotacao,
        depto: c.depto,
        serie: c.serie,
        detalhes: c.obs ? `Obs: ${c.obs}` : 'Material retirado pelo policial.',
        originalCautela: c
      });

      // Devolução / Recolhimento / Retorno
      const isDevolvida = String(c.status).toLowerCase() === 'devolvido' || 
                          String(c.status).toLowerCase() === 'devolvida' || 
                          !!c.data_devolucao || 
                          !!c.data_dev;
      if (isDevolvida) {
        const cond = String(c.condicao_dev || c.motivo || '').toLowerCase();
        let tipoDev = 'Devolução';
        let labelDev = c.tipo_cautela === 'Carga' ? 'Devolução (Baixa de Carga)' : 'Devolução (Recebimento de Item)';

        if (cond.includes('repar') || cond.includes('manuten') || cond.includes('oficina')) {
          tipoDev = 'Manutenção';
          labelDev = 'Envio p/ Manutenção (Reparo Técnico)';
        } else if (cond.includes('recolh')) {
          tipoDev = 'Recolhimento';
          labelDev = `Recolhimento Administrativo ${c.nup ? '(NUP: ' + c.nup + ')' : ''}`;
        } else if (cond.includes('apreend')) {
          tipoDev = 'Apreensão';
          labelDev = `Apreensão / Custódia ${c.numero_io_bo ? '(BO/IO: ' + c.numero_io_bo + ')' : ''}`;
        } else if (cond.includes('destru') || cond.includes('inserv') || cond.includes('baixa')) {
          tipoDev = 'Destruição';
          labelDev = 'Baixa Definitiva / Destruição do Item';
        }

        events.push({
          id: `${c.id}-devolucao`,
          numero: c.numero,
          data_evento: c.data_devolucao || c.data_dev || c.atualizado_em || c.criado_em || c.data,
          tipo_evento: labelDev,
          tipo: tipoDev,
          policial_nome: c.policial_nome,
          matricula: c.matricula,
          lotacao: c.lotacao,
          depto: c.depto,
          serie: c.serie,
          detalhes: c.condicao_dev ? `Condição/Motivo de devolução: ${c.condicao_dev}. ${c.obs_dev ? 'Obs: ' + c.obs_dev : ''}` : 'Material devolvido à armaria.',
          originalCautela: c
        });
      }
    });

    // 3. Eventos de Manutenção / Reparo nos Bens Individuais
    itemBens.forEach(b => {
      const st = String(b.status || '').toLowerCase();
      if (st === 'em reparo' || st === 'manutenção' || st === 'oficina' || b.data_manutencao) {
        events.push({
          id: `manut-${b.id}`,
          numero: `MANUT-${String(b.id).slice(0, 6).toUpperCase()}`,
          data_evento: b.data_manutencao || b.data_baixa || b.created_at || new Date().toISOString(),
          tipo_evento: 'Envio para Manutenção / Oficina',
          tipo: 'Manutenção',
          policial_nome: 'Oficina da Armaria / Manutenção Técnica',
          matricula: 'TÉC-ARM',
          lotacao: 'Oficina Central da Armaria',
          depto: 'Armaria / Manutenção',
          serie: b.serie || b.patrimonio || selectedItemForAudit.serie,
          detalhes: `Série/Patrimônio ${b.serie || b.patrimonio} encaminhado para reparo/manutenção técnica. ${b.obs ? 'Observações: ' + b.obs : ''}`
        });
      }

      // 4. Eventos de Saída Final / Baixa Definitiva / Destruição nos Bens Individuais
      const isBaixado = st === 'baixado' || st === 'destruído' || st === 'destruido' || st === 'inservível' || st === 'inservivel' || st === 'descarte' || st === 'baixa definitiva' || !!b.data_baixa || !!b.destruicao_data;
      if (isBaixado) {
        events.push({
          id: `destr-${b.id}`,
          numero: b.destruicao_termo ? `TERMO: ${b.destruicao_termo}` : (b.nup_baixa ? `NUP: ${b.nup_baixa}` : `BAIXA-${String(b.id).slice(0, 6).toUpperCase()}`),
          data_evento: b.destruicao_data || b.data_baixa || b.updated_at || new Date().toISOString(),
          tipo_evento: 'Baixa Definitiva / Destruição',
          tipo: 'Destruição',
          policial_nome: 'Comissão de Baixa e Destruição',
          matricula: 'COMIS-BAIXA',
          lotacao: 'Estoque Central / Comissão de Descarte',
          depto: 'Armaria',
          serie: b.serie || b.patrimonio || selectedItemForAudit.serie,
          detalhes: `Saída final do acervo por Baixa Definitiva / Destruição. ${b.laudo_tecnico ? 'Laudo: ' + b.laudo_tecnico + '.' : ''} ${b.motivo_baixa ? 'Motivo: ' + b.motivo_baixa + '.' : 'Inservível / Fim de vida útil.'} ${b.obs ? 'Obs: ' + b.obs : ''}`
        });
      }
    });

    // 5. Baixa Definitiva no nível do Item Principal (se aplicável)
    const itemStatus = String(selectedItemForAudit.status || '').toLowerCase();
    if ((itemStatus === 'baixado' || itemStatus === 'destruído' || itemStatus === 'destruido' || itemStatus === 'inservível' || itemStatus === 'baixa definitiva' || selectedItemForAudit.data_baixa) && !events.some(e => e.tipo === 'Destruição')) {
      events.push({
        id: `destr-item-${selectedItemForAudit.id}`,
        numero: selectedItemForAudit.nup_baixa ? `NUP: ${selectedItemForAudit.nup_baixa}` : `BAIXA-G-${String(selectedItemForAudit.id).slice(0, 6).toUpperCase()}`,
        data_evento: selectedItemForAudit.data_baixa || selectedItemForAudit.updated_at || new Date().toISOString(),
        tipo_evento: 'Baixa Definitiva / Destruição do Lote',
        tipo: 'Destruição',
        policial_nome: 'Comissão de Baixa e Destruição',
        matricula: 'COMIS-BAIXA',
        lotacao: 'Estoque Central da Armaria',
        depto: 'Armaria',
        serie: displaySerieEntry,
        detalhes: `Lote/Item retirado definitivamente do acervo por Baixa/Destruição. Motivo: ${selectedItemForAudit.motivo_baixa || 'Processo de Descarte Regulamentar.'}`
      });
    }

    // 6. Se o item não tem movimentações além da entrada, adiciona status explícito
    if (events.length === 1 && events[0].tipo === 'Entrada') {
      events.push({
        id: `status-${selectedItemForAudit.id}`,
        numero: '—',
        data_evento: new Date().toISOString(),
        tipo_evento: 'Em Estoque (Nunca Cautelado)',
        tipo: 'Status',
        policial_nome: '— (Permanência em Estoque)',
        matricula: '—',
        lotacao: 'Estoque Central da Armaria',
        depto: 'Armaria',
        serie: selectedItemForAudit.serie || '—',
        detalhes: `Este item permanece no estoque central da Armaria e NUNCA foi cautelado para nenhum policial (${selectedItemForAudit.qtd_disp}/${selectedItemForAudit.qtd_total} unidades disponíveis).`
      });
    }

    // Sort chronologically in descending order (most recent first)
    events.sort((a, b) => new Date(b.data_evento).getTime() - new Date(a.data_evento).getTime());

    // Apply search filter if searchInventario query is active
    const q = (searchInventario || '').trim().toLowerCase();
    if (q) {
      const filteredBySearch = events.filter(evt => {
        if (evt.tipo === 'Entrada') return true; // Always keep entry event as context
        const matchSerie = String(evt.serie || '').toLowerCase().includes(q);
        const matchPol = String(evt.policial_nome || '').toLowerCase().includes(q);
        const matchMat = String(evt.matricula || '').toLowerCase().includes(q);
        const matchNum = String(evt.numero || '').toLowerCase().includes(q);
        const matchDet = String(evt.detalhes || '').toLowerCase().includes(q);
        return matchSerie || matchPol || matchMat || matchNum || matchDet;
      });

      // If no cautela/movement event matched, check if this term is a serial number or individual asset in itemBens/allBens
      const nonEntryEvents = filteredBySearch.filter(e => e.tipo !== 'Entrada');
      if (nonEntryEvents.length === 0) {
        const matchingBem = itemBens.find(b => 
          String(b.serie || '').toLowerCase().includes(q) || String(b.patrimonio || '').toLowerCase().includes(q)
        );
        const serialLabel = matchingBem ? (matchingBem.serie || matchingBem.patrimonio) : searchInventario.toUpperCase();
        const bemStatus = matchingBem ? (matchingBem.status || 'Disponível') : 'Disponível';

        filteredBySearch.push({
          id: `search-status-${serialLabel}`,
          numero: '—',
          data_evento: new Date().toISOString(),
          tipo_evento: `Status da Série ${serialLabel}`,
          tipo: 'Status',
          policial_nome: bemStatus === 'Em Uso' ? 'Em Carga Ativa' : '— (Em Estoque na Armaria)',
          matricula: '—',
          lotacao: 'Estoque Central da Armaria',
          depto: 'Armaria',
          serie: serialLabel,
          detalhes: `A série ${serialLabel} encontra-se registrada no acervo com o status "${bemStatus}". Nenhuma movimentação de cautela anterior foi registrada sob o termo "${searchInventario}".`
        });
      }

      return filteredBySearch;
    }

    return events;
  }, [selectedItemForAudit, cautelas, searchInventario, allBens]);

  // Compila o histórico global unificado de movimentações (Entradas, Cautelas, Devoluções, Manutenção, Destruição)
  const allGlobalMovements = React.useMemo(() => {
    const list = [];

    // 1. Entradas de Estoque (a partir do cadastro de itens no inventário)
    results.forEach(item => {
      list.push({
        id: `ent-${item.id}`,
        numero: item.numero_nota_fiscal ? `NF: ${item.numero_nota_fiscal}` : (item.numero_empenho ? `EMP: ${item.numero_empenho}` : `CAD-${String(item.id).slice(0, 6).toUpperCase()}`),
        data_evento: item.data_entrada || item.data_aquisicao || item.criado_em || item.created_at || new Date().toISOString(),
        tipo_evento: 'Entrada Inicial no Estoque',
        tipo: 'Entrada',
        policial_nome: 'Acervo da Armaria / Fornecedor',
        matricula: 'ESTOQUE',
        cpf: '—',
        lotacao: item.lotacao || 'Estoque Central da Armaria',
        depto: item.depto || item.departamento || 'Armaria',
        categoria: item.categoria || '—',
        item_desc: `${item.descricao || ''} ${item.marca || ''} ${item.modelo || ''}`.trim() || item.item_desc || 'Item de Estoque',
        serie: item.serie || (Number(item.qtd_total || 1) > 1 ? `Lote (${item.qtd_total} un.)` : 'Sem Série'),
        detalhes: `Entrada e cadastramento do item no acervo. NF: ${item.numero_nota_fiscal || '—'} | Empenho: ${item.numero_empenho || '—'} | Qtd: ${item.qtd_total || 1} un.`,
        originalItem: item
      });
    });

    // 2. Cautelas e Devoluções
    cautelas.forEach(c => {
      // Evento de Cautela
      list.push({
        id: `caut-${c.id}`,
        numero: c.numero || `CAUT-${c.id}`,
        data_evento: c.data_cautela || c.data_saida || c.criado_em || c.data,
        tipo_evento: c.status === 'Substituida' ? 'Substituição / Transferência de Carga' : 'Emissão / Retirada de Cautela',
        tipo: 'Cautela',
        policial_nome: c.policial_nome || '—',
        matricula: c.matricula || '—',
        cpf: c.cpf || '—',
        lotacao: c.lotacao || '—',
        depto: c.depto || c.departamento || '—',
        categoria: c.categoria || '—',
        item_desc: c.item_desc || c.item || '—',
        serie: c.serie || '—',
        detalhes: c.obs ? `Cautela registrada. Observação: ${c.obs}` : `Material cautelado em carga para o policial ${c.policial_nome}.`,
        originalCautela: c,
        status_cautela: c.status
      });

      // Evento de Devolução (se devolvida ou com data de devolução)
      if (c.status === 'Devolvida' || c.data_devolucao || c.condicao_dev) {
        list.push({
          id: `dev-${c.id}`,
          numero: `${c.numero || 'DEV'}-DEV`,
          data_evento: c.data_devolucao || c.data_dev || c.atualizado_em || c.criado_em,
          tipo_evento: c.condicao_dev === 'Avaria' || c.condicao_dev === 'Manutenção' ? 'Devolução com Avaria / Envio p/ Oficina' : 'Devolução / Baixa de Cautela',
          tipo: 'Devolução',
          policial_nome: c.policial_nome || '—',
          matricula: c.matricula || '—',
          cpf: c.cpf || '—',
          lotacao: c.lotacao || '—',
          depto: c.depto || c.departamento || '—',
          categoria: c.categoria || '—',
          item_desc: c.item_desc || c.item || '—',
          serie: c.serie || '—',
          detalhes: c.condicao_dev ? `Devolução de material. Condição: ${c.condicao_dev}. ${c.obs_dev ? 'Obs: ' + c.obs_dev : ''}` : 'Material devolvido à armaria e descarregado.',
          originalCautela: c,
          status_cautela: 'Devolvida'
        });
      }
    });

    // 3. Manutenção (em bens individuais)
    allBens.forEach(b => {
      const st = String(b.status || '').toLowerCase();
      if (st === 'em reparo' || st === 'manutenção' || st === 'oficina' || b.data_manutencao) {
        list.push({
          id: `manut-${b.id}`,
          numero: `MANUT-${String(b.id).slice(0, 6).toUpperCase()}`,
          data_evento: b.data_manutencao || b.created_at || new Date().toISOString(),
          tipo_evento: 'Envio para Manutenção / Oficina',
          tipo: 'Manutenção',
          policial_nome: 'Oficina da Armaria / Manutenção Técnica',
          matricula: 'TÉC-ARM',
          cpf: '—',
          lotacao: 'Oficina Central da Armaria',
          depto: 'Armaria / Manutenção',
          categoria: b.categoria || 'Equipamentos',
          item_desc: b.descricao || b.item_desc || 'Item em Manutenção',
          serie: b.serie || b.patrimonio || '—',
          detalhes: `Encaminhado para reparo/manutenção técnica. ${b.obs ? 'Obs: ' + b.obs : ''}`,
          originalBem: b
        });
      }

      // 4. Baixa Definitiva / Destruição
      const isBaixado = st === 'baixado' || st === 'destruído' || st === 'destruido' || st === 'inservível' || st === 'inservivel' || st === 'descarte' || !!b.data_baixa || !!b.destruicao_data;
      if (isBaixado) {
        list.push({
          id: `destr-${b.id}`,
          numero: b.destruicao_termo ? `TERMO: ${b.destruicao_termo}` : (b.nup_baixa ? `NUP: ${b.nup_baixa}` : `BAIXA-${String(b.id).slice(0, 6).toUpperCase()}`),
          data_evento: b.destruicao_data || b.data_baixa || b.updated_at || new Date().toISOString(),
          tipo_evento: 'Baixa Definitiva / Destruição',
          tipo: 'Destruição',
          policial_nome: 'Comissão de Baixa e Destruição',
          matricula: 'COMIS-BAIXA',
          cpf: '—',
          lotacao: 'Estoque Central / Comissão de Descarte',
          depto: 'Armaria',
          categoria: b.categoria || 'Equipamentos',
          item_desc: b.descricao || b.item_desc || 'Item Baixado/Destruído',
          serie: b.serie || b.patrimonio || '—',
          detalhes: `Saída definitiva do acervo por Baixa Definitiva / Destruição. ${b.laudo_tecnico ? 'Laudo: ' + b.laudo_tecnico + '.' : ''} ${b.motivo_baixa ? 'Motivo: ' + b.motivo_baixa + '.' : ''}`,
          originalBem: b
        });
      }
    });

    // Ordenação cronológica decrescente (mais recentes primeiro)
    list.sort((a, b) => new Date(b.data_evento).getTime() - new Date(a.data_evento).getTime());

    return list;
  }, [results, cautelas, allBens]);

  // Perform dynamic filtering client-side for GENERAL Auditoria & Historical Movements
  const filteredData = React.useMemo(() => {
    if (!hasSearched) return { cautelas: [], movements: [] };

    // If an item is selected for auditing, use itemCautelasHistory directly
    if (selectedItemForAudit) {
      return {
        cautelas: itemCautelasHistory.filter(h => h.originalCautela).map(h => h.originalCautela),
        movements: itemCautelasHistory
      };
    }

    // 1. Process batch tokens if batch mode is selected
    let batchTokens = [];
    if (isBatchSearch && batchText.trim()) {
      batchTokens = batchText
        .split(/[\n,;/\t]+/)
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0);
    }

    // 2. Filter Movements
    const finalMovements = allGlobalMovements.filter(m => {
      // Batch mode
      if (isBatchSearch && batchTokens.length > 0) {
        const mSerie = String(m.serie || '').toLowerCase().trim();
        const mMatricula = String(m.matricula || '').toLowerCase().trim();
        const mPolicialName = String(m.policial_nome || '').toLowerCase().trim();
        const mNumero = String(m.numero || '').toLowerCase().trim();

        const matchesBatch = batchTokens.some(token => 
          mSerie.includes(token) || 
          mMatricula.includes(token) || 
          mPolicialName.includes(token) ||
          mNumero.includes(token)
        );
        if (!matchesBatch) return false;
      } else {
        // Normal Filters
        if (searchPolicial.trim()) {
          const q = searchPolicial.toLowerCase().trim();
          const pName = String(m.policial_nome || '').toLowerCase();
          const pMat = String(m.matricula || '').toLowerCase();
          const pCpf = String(m.cpf || '').toLowerCase();
          if (!pName.includes(q) && !pMat.includes(q) && !pCpf.includes(q)) return false;
        }

        if (searchSerie.trim()) {
          const q = searchSerie.toLowerCase().trim();
          const itemDesc = String(m.item_desc || '').toLowerCase();
          const itemSerie = String(m.serie || '').toLowerCase();
          const itemNum = String(m.numero || '').toLowerCase();
          const itemDet = String(m.detalhes || '').toLowerCase();
          if (!itemDesc.includes(q) && !itemSerie.includes(q) && !itemNum.includes(q) && !itemDet.includes(q)) return false;
        }
      }

      // Lotação / Unidade Filter
      if (lotacaoFilter) {
        const filterVal = lotacaoFilter.toLowerCase().trim();
        const itemLot = String(m.lotacao || '').toLowerCase().trim();
        if (itemLot !== filterVal) return false;
      }

      // Departamento Filter
      if (deptoFilter) {
        const itemDepto = m.depto || relatorioCautelaLotacaoMap.get(normalizeStr(m.lotacao));
        if (!matchDeptoFlex(itemDepto, deptoFilter)) return false;
      }

      // Categoria Filter
      if (categoriaFilter) {
        const filterVal = categoriaFilter.toLowerCase().trim();
        const itemCat = String(m.categoria || '').toLowerCase().trim();
        if (!itemCat.includes(filterVal) && !filterVal.includes(itemCat)) return false;
      }

      // Status / Tipo Movimentação Filter
      if (statusCautelaFilter) {
        const filterVal = statusCautelaFilter.toLowerCase().trim();
        if (filterVal === 'ativa' || filterVal === 'em uso') {
          if (m.tipo !== 'Cautela' || (m.status_cautela && m.status_cautela !== 'Ativa' && m.status_cautela !== 'Em Uso')) return false;
        } else if (filterVal === 'devolvida') {
          if (m.tipo !== 'Devolução') return false;
        } else if (filterVal === 'entrada') {
          if (m.tipo !== 'Entrada') return false;
        } else if (filterVal === 'manutenção' || filterVal === 'manutencao') {
          if (m.tipo !== 'Manutenção') return false;
        } else if (filterVal === 'destruição' || filterVal === 'destruicao') {
          if (m.tipo !== 'Destruição') return false;
        } else {
          const mTipo = String(m.tipo || '').toLowerCase();
          if (mTipo !== filterVal) return false;
        }
      }

      // Period Filter
      const itemDateStr = m.data_evento || '';
      if (itemDateStr) {
        const itemTime = new Date(itemDateStr).getTime();
        if (dateFrom) {
          const fromTime = new Date(`${dateFrom}T00:00:00`).getTime();
          if (itemTime < fromTime) return false;
        }
        if (dateTo) {
          const toTime = new Date(`${dateTo}T23:59:59`).getTime();
          if (itemTime > toTime) return false;
        }
      }

      return true;
    });

    const finalCautelas = finalMovements.filter(m => m.originalCautela).map(m => m.originalCautela);

    return {
      movements: finalMovements,
      cautelas: finalCautelas
    };
  }, [allGlobalMovements, searchPolicial, searchSerie, lotacaoFilter, deptoFilter, categoriaFilter, statusCautelaFilter, dateFrom, dateTo, isBatchSearch, batchText, hasSearched, selectedItemForAudit, itemCautelasHistory]);

  // Aggregate stats from the filtered historical data
  const stats = React.useMemo(() => {
    const totalMovements = filteredData.movements.length;
    const ativas = filteredData.movements.filter(m => m.tipo === 'Cautela' && (m.status_cautela === 'Ativa' || m.status_cautela === 'Em Uso')).length;
    const devolvidas = filteredData.movements.filter(m => m.tipo === 'Devolução').length;
    const entradas = filteredData.movements.filter(m => m.tipo === 'Entrada').length;

    return {
      totalMovements,
      totalCautelas: filteredData.cautelas.length,
      ativas,
      devolvidas,
      entradas
    };
  }, [filteredData]);

  const matchingInventoryItems = React.useMemo(() => {
    if (!hasSearched) return [];
    const term = (searchSerie || batchText || '').toLowerCase().trim();
    if (!term) return [];
    return results.filter(r => checkItemMatchesQuery(r, term));
  }, [hasSearched, searchSerie, batchText, results, checkItemMatchesQuery]);

  return (
    <div>
      <div className="page-header">
        <h1>📑 Central de Relatórios e Auditoria Analítica</h1>
        <p>Gere inventários consolidados, controle níveis de estoque com alertas, audite a distribuição geográfica de cargas ativas por unidade e rastreie o histórico completo de movimentações.</p>
      </div>

      {/* KPI METRICS OVERVIEW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '16px', borderLeft: '4px solid #1a365d', margin: 0, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '11px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase' }}>Cargas em Uso Ativo</span>
          <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#1a365d', display: 'block', marginTop: '4px' }}>
            {cautelas.filter(c => c.status === 'Ativa' || c.status === 'Em Uso').length}
          </span>
          <span style={{ fontSize: '11px', color: '#a0aec0' }}>Materiais atualmente com policiais</span>
        </div>

        <div className="card" style={{ padding: '16px', borderLeft: '4px solid #e53e3e', margin: 0, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '11px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase' }}>Alertas de Estoque Crítico</span>
          <span style={{ fontSize: '24px', fontWeight: 'bold', color: results.filter(r => Number(r.qtd_disp || 0) <= Number(r.qtd_min || 1)).length > 0 ? '#e53e3e' : '#2d3748', display: 'block', marginTop: '4px' }}>
            {results.filter(r => Number(r.qtd_disp || 0) <= Number(r.qtd_min || 1)).length}
          </span>
          <span style={{ fontSize: '11px', color: '#a0aec0' }}>Itens iguais ou abaixo do mínimo</span>
        </div>

        <div className="card" style={{ padding: '16px', borderLeft: '4px solid #3182ce', margin: 0, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '11px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase' }}>Itens no Inventário</span>
          <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#3182ce', display: 'block', marginTop: '4px' }}>
            {results.length}
          </span>
          <span style={{ fontSize: '11px', color: '#a0aec0' }}>Modelos/Itens cadastrados</span>
        </div>

        <div className="card" style={{ padding: '16px', borderLeft: '4px solid #48bb78', margin: 0, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '11px', color: '#718096', fontWeight: 'bold', textTransform: 'uppercase' }}>Devoluções Concluídas</span>
          <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#48bb78', display: 'block', marginTop: '4px' }}>
            {cautelas.filter(c => c.status === 'Devolvida').length}
          </span>
          <span style={{ fontSize: '11px', color: '#a0aec0' }}>Materiais devolvidos à armaria</span>
        </div>
      </div>

      {/* SECTION 1: INVENTÁRIO CONSOLIDADO COM FILTROS */}
      <div className="card" style={{ marginBottom: '24px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #edf2f7', paddingBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1a365d' }}>📊 Inventário Consolidado e Controle de Estoque</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#718096' }}>Selecione um item abaixo para realizar uma auditoria analítica detalhada com distribuição por unidade, bens individuais e histórico completo.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-xs btn-outline" onClick={() => handleOpenPrintReport('inventario', 'Inventário Consolidado e Controle de Estoque', { items: filteredInventarioResults })}>🖨️ Imprimir Inventário</button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: '20px', rowGap: '16px', marginBottom: '16px', width: '100%', boxSizing: 'border-box' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 0 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#4a5568' }}>Filtrar Categoria</label>
            <select value={categoria} onChange={e => { setCategoria(e.target.value); setSelectedItemForAudit(null); }} style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}>
              <option value="">Todas as Categorias</option>
              <option value="Armas">Armas</option>
              <option value="Coletes Balísticos">Coletes Balísticos</option>
              <option value="Equipamentos">Equipamentos</option>
              <option value="Uniformes">Uniformes</option>
              <option value="Munições">Munições</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0, minWidth: 0 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#4a5568' }}>Status de Estoque</label>
            <select value={statusInventario} onChange={e => setStatusInventario(e.target.value)} style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}>
              <option value="Todos">Todos os Status</option>
              <option value="Disponíveis">Disponível</option>
              <option value="Em Uso">Em Uso</option>
              <option value="Estoque Crítico">Estoque Crítico (Abaixo do Mínimo)</option>
              <option value="Manutencao">Em Manutenção</option>
              <option value="Inservivel">Inservível</option>
              <option value="Perdida">Perdido / Extraviado</option>
              <option value="Furtada">Furtado</option>
              <option value="Roubada">Roubado</option>
              <option value="Destruida">Destruído</option>
              <option value="Recolhida">Recolhido</option>
              <option value="Ressarcida">Ressarcido</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0, minWidth: 0 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#4a5568' }}>Buscar por Texto (Descrição/Marca/Modelo)</label>
            <input
              type="text"
              value={searchInventario}
              onChange={e => setSearchInventario(e.target.value)}
              placeholder="Ex: Glock, PT100, Protecta..."
              style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Consolidated Table */}
        <div className="table-wrap" style={{ margin: 0, maxHeight: '350px', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th>Descrição do Item</th>
                <th>Marca / Modelo</th>
                <th style={{ textAlign: 'center' }}>Total</th>
                <th style={{ textAlign: 'center' }}>Disponível</th>
                <th style={{ textAlign: 'center' }}>Em Uso</th>
                <th style={{ textAlign: 'center' }}>Estoque Mín.</th>
                <th>Status Estoque</th>
                <th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventarioResults.length > 0 ? (
                filteredInventarioResults.map(r => {
                  const emUso = Math.max(0, Number(r.qtd_total || 0) - Number(r.qtd_disp || 0));
                  const isLowStock = Number(r.qtd_disp || 0) <= Number(r.qtd_min || 0);
                  const isSelected = selectedItemForAudit && selectedItemForAudit.id === r.id;

                  return (
                    <tr 
                      key={r.id} 
                      style={{ 
                        backgroundColor: isSelected ? '#ebf8ff' : 'transparent', 
                        borderLeft: isSelected ? '4px solid #2b6cb0' : 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s'
                      }}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedItemForAudit(null);
                        } else {
                          setSelectedItemForAudit(r);
                          setTimeout(() => {
                            document.getElementById('audit-details-section')?.scrollIntoView({ behavior: 'smooth' });
                          }, 100);
                        }
                      }}
                      title="Clique em qualquer lugar da linha para auditar este item"
                    >
                      <td>
                        <div style={{ fontWeight: '600', color: isSelected ? '#1a365d' : '#2b6cb0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>🔎</span> {r.descricao}
                        </div>
                        <div style={{ fontSize: '10px', color: '#718096' }}>Categoria: {r.categoria}</div>
                      </td>
                      <td>
                        <div>{r.marca || '—'}</div>
                        <div style={{ fontSize: '10px', color: '#718096' }}>{r.modelo || '—'}</div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{r.qtd_total}</td>
                      <td style={{ textAlign: 'center', color: r.qtd_disp > 0 ? '#2f855a' : '#718096', fontWeight: 'bold' }}>{r.qtd_disp}</td>
                      <td style={{ textAlign: 'center', color: emUso > 0 ? '#3182ce' : '#718096', fontWeight: 'bold' }}>{emUso}</td>
                      <td style={{ textAlign: 'center', color: '#4a5568' }}>{r.qtd_min || '0'}</td>
                      <td>
                        {isLowStock ? (
                          <span className="badge badge-red" style={{ fontSize: '10px' }}>CRÍTICO</span>
                        ) : r.qtd_disp === 0 ? (
                          <span className="badge badge-yellow" style={{ fontSize: '10px' }}>EM USO</span>
                        ) : (
                          <span className="badge badge-green" style={{ fontSize: '10px' }}>ESTÁVEL</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          className="btn btn-xs" 
                          style={{ 
                            backgroundColor: isSelected ? '#1a365d' : '#ebf8ff', 
                            color: isSelected ? '#fff' : '#2b6cb0', 
                            border: '1px solid ' + (isSelected ? '#1a365d' : '#bee3f8'),
                            padding: '4px 10px',
                            fontWeight: '600'
                          }}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedItemForAudit(null);
                            } else {
                              setSelectedItemForAudit(r);
                              // Smooth scroll to audit details
                              setTimeout(() => {
                                document.getElementById('audit-details-section')?.scrollIntoView({ behavior: 'smooth' });
                              }, 100);
                            }
                          }}
                        >
                          {isSelected ? '❌ Fechar' : '🔍 Auditar Item'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: '#718096', padding: '24px' }}>Nenhum item correspondente aos critérios.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: CONSOLIDATED AUDIT ANALYSIS BLOCK */}
      <div id="audit-details-section">
        {selectedItemForAudit ? (
          /* ITEM-SPECIFIC DEEP AUDITING VIEW */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', marginBottom: '24px' }}>
            
            {/* Left Column: Asset Status, Serial List, and Location Distribution */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Card A: Item Stats Overview */}
              <div className="card" style={{ margin: 0, padding: '20px', background: '#1a365d', color: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <span style={{ fontSize: '10px', background: '#2b6cb0', color: '#fff', padding: '2px 6px', borderRadius: '3px', textTransform: 'uppercase', fontWeight: 'bold' }}>{selectedItemForAudit.categoria}</span>
                    <h3 style={{ margin: '8px 0 0 0', fontSize: '18px', fontWeight: 'bold' }}>{selectedItemForAudit.descricao}</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#90cdf4' }}>{selectedItemForAudit.marca} {selectedItemForAudit.modelo}</p>
                  </div>
                  <button 
                    onClick={() => setSelectedItemForAudit(null)}
                    style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}
                    title="Fechar auditoria do item"
                  >
                    ✕
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px', borderTop: '1px solid #2b6cb0', paddingTop: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#90cdf4', display: 'block' }}>Estoque Total</span>
                    <strong style={{ fontSize: '20px' }}>{selectedItemForAudit.qtd_total}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#90cdf4', display: 'block' }}>Disponível</span>
                    <strong style={{ fontSize: '20px', color: '#48bb78' }}>{selectedItemForAudit.qtd_disp}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#90cdf4', display: 'block' }}>Em Uso Policial</span>
                    <strong style={{ fontSize: '20px', color: '#63b3ed' }}>{Math.max(0, Number(selectedItemForAudit.qtd_total || 0) - Number(selectedItemForAudit.qtd_disp || 0))}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#90cdf4', display: 'block' }}>Estoque Mínimo</span>
                    <strong style={{ fontSize: '20px' }}>{selectedItemForAudit.qtd_min || '0'}</strong>
                  </div>
                </div>
              </div>

              {/* Card B: Geographic Location Distribution (Lotação) */}
              <div className="card" style={{ margin: 0, padding: '20px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold', color: '#1a365d', borderBottom: '1px solid #edf2f7', paddingBottom: '8px' }}>
                  🗺️ Distribuição Geográfica (Cargas Ativas)
                </h3>
                {locationDistribution.length > 0 ? (
                  <div className="table-wrap" style={{ margin: 0, maxHeight: '200px', overflowY: 'auto' }}>
                    <table style={{ fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#f7fafc' }}>
                          <th>Unidade / Lotação</th>
                          <th style={{ textAlign: 'center', width: '70px' }}>Qtd</th>
                        </tr>
                      </thead>
                      <tbody>
                        {locationDistribution.map(dist => (
                          <tr key={dist.lotacao}>
                            <td style={{ fontWeight: '500' }}>{dist.lotacao}</td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#2b6cb0' }}>{dist.qtd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: '#718096', margin: 0, textAlign: 'center', padding: '16px 0' }}>Não há unidades com cargas ativas deste item no momento.</p>
                )}
              </div>

              {/* Card C: Individual Assets Breakdown (Bens) */}
              <div className="card" style={{ margin: 0, padding: '20px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', borderBottom: '1px solid #edf2f7', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#1a365d' }}>
                      📦 Relação Analítica de Bens ({selectedItemBens.length})
                    </h3>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        className={`btn btn-xs ${bemStatusFilter === 'Todos' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setBemStatusFilter('Todos')}
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                      >
                        Todos
                      </button>
                      <button 
                        className={`btn btn-xs ${bemStatusFilter === 'Disponíveis' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setBemStatusFilter('Disponíveis')}
                        style={{ padding: '2px 8px', fontSize: '11px', color: bemStatusFilter === 'Disponíveis' ? '#fff' : '#276749' }}
                      >
                        Disp. ({selectedItemBens.filter(b => String(b.status).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") !== 'em uso').length})
                      </button>
                      <button 
                        className={`btn btn-xs ${bemStatusFilter === 'Em Uso' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setBemStatusFilter('Em Uso')}
                        style={{ padding: '2px 8px', fontSize: '11px', color: bemStatusFilter === 'Em Uso' ? '#fff' : '#c53030' }}
                      >
                        Em Uso ({selectedItemBens.filter(b => String(b.status).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'em uso').length})
                      </button>
                    </div>
                  </div>
                  {selectedItemBens.length > 2 && (
                    <input 
                      type="text"
                      value={bemSearch}
                      onChange={e => setBemSearch(e.target.value)}
                      placeholder="🔍 Digite para filtrar nº de série (ex: CNW002)..."
                      style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                    />
                  )}
                </div>

                {loadingBens ? (
                  <p style={{ textAlign: 'center', color: '#718096', fontSize: '13px', margin: 0, padding: '16px 0' }}>Buscando número de séries...</p>
                ) : filteredSelectedItemBens.length > 0 ? (
                  <div className="table-wrap" style={{ margin: 0, maxHeight: '280px', overflowY: 'auto' }}>
                    <table style={{ fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#f7fafc' }}>
                          <th>Série / Patrimônio</th>
                          <th>Detalhes</th>
                          <th style={{ width: '130px' }}>Status / Detentor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSelectedItemBens.map(b => {
                          const isEmUso = String(b.status).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'em uso';
                          const activeC = isEmUso ? cautelas.find(c => {
                            const isAtiva = String(c.status).toLowerCase().includes('ativa') || String(c.status).toLowerCase().includes('em uso');
                            if (!isAtiva) return false;
                            const cSer = String(c.serie || '').toLowerCase().trim();
                            const bSer = String(b.serie || '').toLowerCase().trim();
                            const bPat = String(b.patrimonio || '').toLowerCase().trim();
                            return cSer && ((bSer && cSer === bSer) || (bPat && cSer === bPat));
                          }) : null;

                          return (
                            <tr 
                              key={b.id || b.serie}
                              style={{ cursor: 'pointer' }}
                              onClick={() => {
                                if (activeC) {
                                  setSelectedCautelaModal(activeC);
                                } else {
                                  setModalSearchSerie(b.serie || '');
                                  setShowEntryBatchModal(true);
                                }
                              }}
                              title={activeC ? "Clique para ver a cautela/carga em uso" : "Clique para ver detalhes do lote de entrada"}
                            >
                              <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                                <div style={{ color: '#2b6cb0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>🔎</span> {b.serie || 'S/N'}
                                </div>
                                {b.patrimonio && <div style={{ fontSize: '10px', color: '#718096', fontWeight: 'normal' }}>Patr: {b.patrimonio}</div>}
                              </td>
                              <td>
                                <div>{b.tamanho || b.calibre || '—'}</div>
                                {b.sexo && <div style={{ fontSize: '10px', color: '#718096' }}>Masc/Fem: {b.sexo}</div>}
                              </td>
                              <td>
                                <span className={`badge ${isEmUso ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                                  {String(b.status || (isEmUso ? 'EM USO' : 'DISPONÍVEL')).toUpperCase()}
                                </span>
                                {activeC && (
                                  <div style={{ fontSize: '10px', color: '#2b6cb0', marginTop: '2px', fontWeight: 'bold' }} title={`Unidade: ${activeC.lotacao || '—'}`}>
                                    👤 {activeC.policial_nome}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: '#718096', margin: 0, textAlign: 'center', padding: '16px 0' }}>
                    {selectedItemBens.length === 0 ? 'Nenhum número de série ou lote individual registrado.' : 'Nenhum bem individual corresponde aos filtros aplicados.'}
                  </p>
                )}
              </div>

            </div>

            {/* Right Column: Historical Audit (Cautelas and Cargas specifically for this item) */}
            <div className="card" style={{ margin: 0, padding: '20px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #edf2f7', paddingBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1a365d' }}>
                  📜 Histórico Completo de Movimentações ({itemCautelasHistory.length})
                </h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {selectedItemForAudit && (
                    <button 
                      className="btn btn-xs btn-primary" 
                      onClick={() => {
                        setModalSearchSerie(searchInventario.trim());
                        setShowEntryBatchModal(true);
                      }}
                      title="Ver detalhes da Nota Fiscal, Empenho e Relação Completa das Séries Deste Lote"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      📦 Ver Entrada de Estoque / Séries ({selectedItemForAudit.qtd_total || 1} un.)
                    </button>
                  )}
                  <button className="btn btn-xs btn-outline" onClick={() => handleOpenPrintReport('item-audit', `Auditoria do Item - ${selectedItemForAudit?.nome || selectedItemForAudit?.descricao || 'Equipamento'}`, { item: selectedItemForAudit, events: itemCautelasHistory })}>🖨️ Imprimir Auditoria do Item</button>
                </div>
              </div>

              {/* Origin / Entry Card Banner */}
              {selectedItemForAudit && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '12px 14px', marginBottom: '12px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#15803d', display: 'block', marginBottom: '2px' }}>
                        📦 Origem no Acervo (Entrada Inicial em Estoque)
                      </span>
                      <strong style={{ fontSize: '13px', color: '#166534' }}>
                        {selectedItemForAudit.descricao} ({selectedItemForAudit.marca} {selectedItemForAudit.modelo})
                      </strong>
                      <div style={{ color: '#15803d', marginTop: '4px', fontSize: '11px' }}>
                        📅 Data Entrada: <strong>{formatLocalDate(selectedItemForAudit.dt_aq || selectedItemForAudit.criado_em)}</strong> | 📄 NF: <strong>{selectedItemForAudit.numero_nota_fiscal || 'N/A'}</strong> | 📋 Empenho: <strong>{selectedItemForAudit.numero_empenho || 'N/A'}</strong> | 🏭 Fornecedor: <strong>{selectedItemForAudit.fornecedor_nome || 'Não informado'}</strong> | 🔢 Qtd Lote: <strong>{selectedItemForAudit.qtd_total || 1} un.</strong>
                      </div>
                    </div>
                    <button 
                      className="btn btn-xs btn-outline"
                      style={{ color: '#15803d', borderColor: '#86efac', backgroundColor: '#fff', fontWeight: 'bold' }}
                      onClick={() => {
                        setModalSearchSerie(searchInventario.trim());
                        setShowEntryBatchModal(true);
                      }}
                    >
                      🔎 Ver Ficha de Compra e Séries
                    </button>
                  </div>
                </div>
              )}

              {/* Search Filter Banner */}
              {searchInventario.trim() && (
                <div style={{ background: '#ebf8ff', border: '1px solid #90cdf4', borderRadius: '6px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px', color: '#2b6cb0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>🎯</span>
                    <div>
                      <strong>Filtrando movimentações por:</strong> <span style={{ background: '#fff', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #cbd5e0', color: '#1e293b' }}>{searchInventario}</span>
                      <div style={{ fontSize: '11px', color: '#4a5568', marginTop: '2px' }}>
                        {itemCautelasHistory.filter(e => e.tipo !== 'Entrada').length > 0 
                          ? `Exibindo ${itemCautelasHistory.filter(e => e.tipo !== 'Entrada').length} registro(s) específico(s) correspondente(s) ao termo/série pesquisado.`
                          : `O termo/série "${searchInventario}" pertence a este lote e encontra-se registrado no acervo.`}
                      </div>
                    </div>
                  </div>
                  <button 
                    className="btn btn-xs btn-outline" 
                    onClick={() => setSearchInventario('')}
                    style={{ fontSize: '11px', color: '#2b6cb0', borderColor: '#90cdf4', backgroundColor: '#fff', fontWeight: '600' }}
                  >
                    Exibir Todo o Histórico do Modelo ({selectedItemForAudit.qtd_total} un.)
                  </button>
                </div>
              )}

              {/* Cautelas / Movimentações List */}
              <div className="table-wrap" style={{ margin: 0, maxHeight: '550px', overflowY: 'auto' }}>
                {itemCautelasHistory.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Nº Doc / Registro</th>
                        <th>Data / Hora</th>
                        <th>Tipo de Movimento</th>
                        <th>Policial / Responsável</th>
                        <th>Unidade / Depto</th>
                        <th>Nº Série</th>
                        <th>Observações / Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemCautelasHistory.map(evt => {
                        const isEntrada = evt.tipo === 'Entrada';
                        const isMatchSerie = searchInventario.trim() && String(evt.serie || '').toLowerCase().includes(searchInventario.trim().toLowerCase());
                        return (
                          <tr 
                            key={evt.id} 
                            style={{ 
                              backgroundColor: isMatchSerie ? '#fefce8' : (isEntrada ? '#f0fdf4' : 'transparent'), 
                              borderLeft: isEntrada ? '4px solid #16a34a' : (isMatchSerie ? '4px solid #eab308' : 'none'),
                              cursor: 'pointer' 
                            }}
                            onClick={() => {
                              if (isEntrada) {
                                setModalSearchSerie(searchInventario.trim());
                                setShowEntryBatchModal(true);
                              } else {
                                setSelectedCautelaModal(evt);
                              }
                            }}
                            title={isEntrada ? "Clique para ver detalhes do lote de entrada no inventário" : "Clique para ver a ficha detalhada desta movimentação"}
                          >
                            <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                              <button
                                className="btn btn-xs btn-outline"
                                style={{ padding: '2px 6px', fontSize: '11px', fontWeight: 'bold', color: isEntrada ? '#15803d' : '#2b6cb0', borderColor: isEntrada ? '#86efac' : '#bee3f8', backgroundColor: isEntrada ? '#dcfce7' : '#ebf8ff', cursor: 'pointer' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isEntrada) {
                                    setModalSearchSerie(searchInventario.trim());
                                    setShowEntryBatchModal(true);
                                  } else {
                                    setSelectedCautelaModal(evt);
                                  }
                                }}
                                title="Abrir detalhes deste evento"
                              >
                                {evt.numero} 🔎
                              </button>
                            </td>
                            <td>{formatLocalDate(evt.data_evento)}</td>
                            <td>
                              <span className={`badge ${
                                evt.tipo === 'Saída' ? 'badge-red' : 
                                evt.tipo === 'Entrada' ? 'badge-green' : 
                                evt.tipo === 'Status' ? 'badge-blue' : 
                                evt.tipo === 'Manutenção' ? 'badge-yellow' : 
                                evt.tipo === 'Destruição' ? 'badge-purple' : 
                                evt.tipo === 'Recolhimento' || evt.tipo === 'Apreensão' ? 'badge-orange' : 
                                'badge-green'
                              }`}>
                                {isEntrada ? '📦 ENTRADA EM ESTOQUE (INÍCIO DO HISTÓRICO)' : evt.tipo_evento.toUpperCase()}
                              </span>
                            </td>
                            <td>
                              <div><strong style={{ color: '#1a365d' }}>👤 {evt.policial_nome}</strong></div>
                              <div style={{ fontSize: '11px', color: '#718096' }}>Matrícula: {evt.matricula || '—'}</div>
                            </td>
                            <td>
                              <div>{evt.lotacao || '—'}</div>
                              <div style={{ fontSize: '11px', color: '#718096' }}>Depto: {evt.depto || '—'}</div>
                            </td>
                            <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                              {isMatchSerie ? (
                                <div style={{ background: '#fef08a', color: '#854d0e', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fde047', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                                  🎯 {evt.serie || '—'}
                                </div>
                              ) : (
                                <div style={{ color: isEntrada ? '#2b6cb0' : '#e53e3e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>🔎</span> {evt.serie || '—'}
                                </div>
                              )}
                              {isEntrada && (
                                <button
                                  className="btn btn-xs btn-outline"
                                  style={{ fontSize: '10px', padding: '1px 5px', marginTop: '4px', borderColor: '#bee3f8', color: '#2b6cb0', backgroundColor: '#ebf8ff', cursor: 'pointer' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModalSearchSerie(searchInventario.trim());
                                    setShowEntryBatchModal(true);
                                  }}
                                  title="Clique para ver a relação de todas as séries e detalhes da compra"
                                >
                                  🔎 Ver Séries do Lote
                                </button>
                              )}
                            </td>
                            <td>
                              <div style={{ fontSize: '12px', color: '#4a5568' }}>{evt.detalhes}</div>
                              <div style={{ marginTop: '6px' }}>
                                <button
                                  className={`btn btn-xs ${isEntrada ? 'btn-primary' : 'btn-outline'}`}
                                  style={{ fontSize: '11px', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isEntrada) {
                                      setModalSearchSerie(searchInventario.trim());
                                      setShowEntryBatchModal(true);
                                    } else {
                                      setSelectedCautelaModal(evt);
                                    }
                                  }}
                                >
                                  🔎 {isEntrada ? `Ver Detalhes da Entrada (${selectedItemForAudit?.qtd_total || 1} un.)` : 'Ver Ficha Completa da Cautela'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ textAlign: 'center', color: '#718096', padding: '32px 0', margin: 0 }}>Nenhum histórico de movimentação encontrado para este item.</p>
                )}
              </div>

              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-xs" style={{ backgroundColor: '#edf2f7', color: '#4a5568' }} onClick={() => setSelectedItemForAudit(null)}>
                  ⬅️ Voltar para Auditoria Geral de Outros Itens
                </button>
              </div>
            </div>

          </div>
        ) : (
          /* GENERAL ADVANCED AUDITING VIEW */
          <div>
            <div className="card" style={{ marginBottom: '24px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1a365d' }}>🔍 Auditoria Geral e Pesquisa de Vínculos Avançada</h3>
                <button
                  className="btn btn-xs btn-outline"
                  onClick={() => setIsBatchSearch(!isBatchSearch)}
                  style={{ backgroundColor: isBatchSearch ? '#ebf8ff' : 'transparent', color: isBatchSearch ? '#2b6cb0' : '#4a5568' }}
                >
                  {isBatchSearch ? '📝 Voltar para Filtros Normais' : '📋 Pesquisa em Lote (Múltiplas Séries)'}
                </button>
              </div>

              {!isBatchSearch ? (
                /* FILTROS NORMAIS */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', columnGap: '20px', rowGap: '16px', width: '100%', boxSizing: 'border-box' }}>
                  <div className="form-group" style={{ margin: 0, minWidth: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Policial (Nome, Matrícula ou CPF)</label>
                    <input
                      type="text"
                      value={searchPolicial}
                      onChange={e => setSearchPolicial(e.target.value)}
                      placeholder="Busca por policial..."
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0, minWidth: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Arma / Série (Nº Série ou Item)</label>
                    <input
                      type="text"
                      value={searchSerie}
                      onChange={e => setSearchSerie(e.target.value)}
                      placeholder="Busca por série ou item..."
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0, minWidth: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Departamento</label>
                    <select
                      value={deptoFilter}
                      onChange={e => {
                        setDeptoFilter(e.target.value);
                        setLotacaoFilter('');
                      }}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    >
                      <option value="">Todos os Departamentos</option>
                      {allRelatorioDeptosOptions.map(dName => (
                        <option key={dName} value={dName}>{dName} ({getDeptoSigla(dName)})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0, minWidth: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Delegacia / Lotação</label>
                    <select
                      value={lotacaoFilter}
                      onChange={e => setLotacaoFilter(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    >
                      <option value="">{deptoFilter ? 'Todas as Unidades do Depto' : 'Todas as Unidades'}</option>
                      {allRelatorioLotacoesOptions.map(lName => (
                        <option key={lName} value={lName}>{lName}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0, minWidth: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Categoria do Item</label>
                    <select
                      value={categoriaFilter}
                      onChange={e => setCategoriaFilter(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    >
                      <option value="">Todas</option>
                      <option value="Armas">Armas</option>
                      <option value="Coletes Balísticos">Coletes Balísticos</option>
                      <option value="Munições">Munições</option>
                      <option value="Equipamentos">Equipamentos</option>
                      <option value="Uniformes">Uniformes</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0, minWidth: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Tipo / Situação de Movimentação</label>
                    <select
                      value={statusCautelaFilter}
                      onChange={e => setStatusCautelaFilter(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    >
                      <option value="">Todas as Movimentações (Entrada, Cautela, Devolução, etc.)</option>
                      <option value="Entrada">📥 Somente Entradas em Estoque</option>
                      <option value="Ativa">📤 Somente Cautelas Ativas (Em Uso)</option>
                      <option value="Devolvida">↩️ Somente Devoluções de Cautela</option>
                      <option value="Manutenção">🔧 Somente Em Manutenção / Oficina</option>
                      <option value="Destruição">💥 Somente Baixas Definitivas / Destruição</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0, minWidth: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Período (De)</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0, minWidth: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Período (Até)</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              ) : (
                /* PESQUISA EM LOTE */
                <div style={{ backgroundColor: '#f7fafc', padding: '16px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '13px', display: 'block', marginBottom: '4px' }}>
                      Lista de Itens para Pesquisa em Lote
                    </label>
                    <span style={{ fontSize: '11px', color: '#718096', display: 'block', marginBottom: '8px' }}>
                      Cole múltiplos <strong>Números de Série</strong>, <strong>Matrículas de Policiais</strong> ou <strong>Números de Cautela</strong> (digite um por linha, ou separados por vírgula ou ponto-e-vírgula). O sistema filtrará todo o histórico correspondente a estes dados.
                    </span>
                    <textarea
                      rows={4}
                      value={batchText}
                      onChange={e => setBatchText(e.target.value)}
                      placeholder="Exemplo:&#10;G171024&#10;PT100305&#10;M90204&#10;123456"
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e0',
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        color: '#000'
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px', borderTop: '1px solid #edf2f7', paddingTop: '16px' }}>
                <button className="btn btn-outline" onClick={handleClearFilters}>
                  🧹 Limpar Filtros
                </button>
                <button className="btn btn-primary" onClick={handleFilterHistorico} disabled={searchingHistorico} style={{ minWidth: '160px' }}>
                  {searchingHistorico ? '🔄 Buscando dados...' : '🔍 Pesquisar Histórico'}
                </button>
              </div>
            </div>

            {/* General Results List */}
            <div className="card" style={{ padding: '20px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              {matchingInventoryItems.length > 0 && (
                <div style={{ backgroundColor: '#ebf8ff', border: '1px solid #bee3f8', padding: '14px 16px', borderRadius: '6px', marginBottom: '20px' }}>
                  <div style={{ fontWeight: 'bold', color: '#1a365d', fontSize: '14px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>💡</span> Item(ns) cadastrado(s) no Estoque correspondente(s) a esta pesquisa ({matchingInventoryItems.length}):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {matchingInventoryItems.map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '10px 14px', borderRadius: '6px', border: '1px solid #cbd5e0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                        <div>
                          <strong style={{ color: '#1a365d', fontSize: '14px' }}>{item.descricao}</strong>
                          <span style={{ fontSize: '12px', color: '#718096', marginLeft: '8px' }}>({item.marca} {item.modelo} - Categoria: {item.categoria})</span>
                          <div style={{ fontSize: '12px', color: '#4a5568', marginTop: '4px' }}>
                            Estoque Total: <strong>{item.qtd_total}</strong> | Disponível: <strong style={{ color: '#2f855a' }}>{item.qtd_disp}</strong> | Em Uso/Cautelado: <strong style={{ color: '#3182ce' }}>{Math.max(0, Number(item.qtd_total || 0) - Number(item.qtd_disp || 0))}</strong>
                          </div>
                        </div>
                        <button 
                          className="btn btn-xs btn-primary"
                          style={{ padding: '6px 12px', fontWeight: 'bold' }}
                          onClick={() => {
                            setSelectedItemForAudit(item);
                            setTimeout(() => {
                              document.getElementById('audit-details-section')?.scrollIntoView({ behavior: 'smooth' });
                            }, 100);
                          }}
                        >
                          🔍 Ver Histórico Completo do Item
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #edf2f7', paddingBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1a365d' }}>
                    📜 Histórico Geral de Movimentações ({filteredData.movements.length})
                  </h3>
                  <span style={{ fontSize: '12px', color: '#718096' }}>
                    Exibindo todas as movimentações de acervo: entradas, cautelas, devoluções, manutenções e baixas/destruições.
                  </span>
                </div>
                <button className="btn btn-xs btn-outline" onClick={() => handleOpenPrintReport('historico-geral', 'Histórico Geral de Movimentações e Cargas', { movements: filteredData.movements, cautelas: filteredData.cautelas })}>🖨️ Imprimir Histórico Geral</button>
              </div>

              {/* General Movements Table */}
              <div className="table-wrap" style={{ margin: 0 }}>
                {filteredData.movements.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Nº Registro / Termo</th>
                        <th>Data Evento</th>
                        <th>Tipo de Movimentação</th>
                        <th>Policial / Agente / Responsável</th>
                        <th>Lotação / Unidade</th>
                        <th>Item / Descrição</th>
                        <th>Nº de Série</th>
                        <th>Detalhes / Histórico</th>
                        <th style={{ textAlign: 'center' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.movements.map(m => {
                        let badgeBg = '#edf2f7';
                        let badgeColor = '#2d3748';
                        let badgeBorder = '#cbd5e0';
                        let labelTxt = m.tipo_evento || m.tipo;

                        if (m.tipo === 'Entrada') {
                          badgeBg = '#f0fdf4';
                          badgeColor = '#15803d';
                          badgeBorder = '#bbf7d0';
                          labelTxt = '📥 Entrada Estoque';
                        } else if (m.tipo === 'Cautela') {
                          badgeBg = '#eff6ff';
                          badgeColor = '#1d4ed8';
                          badgeBorder = '#bfdbfe';
                          labelTxt = m.status_cautela === 'Substituida' ? '🔄 Transferência' : '📤 Cautela / Carga';
                        } else if (m.tipo === 'Devolução') {
                          badgeBg = '#f0fdf4';
                          badgeColor = '#166534';
                          badgeBorder = '#86efac';
                          labelTxt = '↩️ Devolução';
                        } else if (m.tipo === 'Manutenção') {
                          badgeBg = '#fff7ed';
                          badgeColor = '#c2410c';
                          badgeBorder = '#fed7aa';
                          labelTxt = '🔧 Manutenção';
                        } else if (m.tipo === 'Destruição') {
                          badgeBg = '#fef2f2';
                          badgeColor = '#b91c1c';
                          badgeBorder = '#fecaca';
                          labelTxt = '💥 Baixa / Destruição';
                        }

                        return (
                          <tr 
                            key={m.id}
                            style={{ cursor: m.originalCautela ? 'pointer' : 'default' }}
                            onClick={() => {
                              if (m.originalCautela) {
                                setSelectedCautelaModal(m.originalCautela);
                                const matchItem = results.find(r => String(r.id) === String(m.originalCautela.item_id || m.originalCautela.item));
                                if (matchItem) setSelectedItemForAudit(matchItem);
                              }
                            }}
                          >
                            <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                              {m.originalCautela ? (
                                <button
                                  className="btn btn-xs btn-outline"
                                  style={{ padding: '2px 6px', fontSize: '11px', fontWeight: 'bold', color: '#2b6cb0', borderColor: '#bee3f8', backgroundColor: '#ebf8ff', cursor: 'pointer' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCautelaModal(m.originalCautela);
                                    const matchItem = results.find(r => String(r.id) === String(m.originalCautela.item_id || m.originalCautela.item));
                                    if (matchItem) setSelectedItemForAudit(matchItem);
                                  }}
                                >
                                  {m.numero} 🔎
                                </button>
                              ) : (
                                <span style={{ padding: '2px 6px', fontSize: '11px', backgroundColor: '#f1f5f9', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                  {m.numero}
                                </span>
                              )}
                            </td>
                            <td style={{ fontSize: '12px' }}>{formatLocalDate(m.data_evento)}</td>
                            <td>
                              <span style={{ 
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: '700',
                                backgroundColor: badgeBg,
                                color: badgeColor,
                                border: `1px solid ${badgeBorder}`
                              }}>
                                {labelTxt}
                              </span>
                            </td>
                            <td>
                              <div><strong style={{ color: '#1a365d' }}>👤 {m.policial_nome}</strong></div>
                              {m.matricula && m.matricula !== '—' && (
                                <div style={{ fontSize: '11px', color: '#718096' }}>Matrícula: {m.matricula}</div>
                              )}
                            </td>
                            <td>
                              <div>{m.lotacao || '—'}</div>
                              {m.depto && m.depto !== '—' && (
                                <div style={{ fontSize: '11px', color: '#718096' }}>Depto: {m.depto}</div>
                              )}
                            </td>
                            <td>
                              {m.categoria && m.categoria !== '—' && (
                                <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#2b6cb0', fontWeight: 'bold', display: 'block' }}>
                                  {m.categoria}
                                </span>
                              )}
                              <strong style={{ color: '#2d3748' }}>{m.item_desc}</strong>
                            </td>
                            <td style={{ fontFamily: 'monospace', fontWeight: 'bold', color: m.serie !== 'Sem Série' && m.serie !== '—' ? '#e53e3e' : '#718096' }}>
                              {m.serie || '—'}
                            </td>
                            <td style={{ fontSize: '12px', color: '#4a5568', maxWidth: '280px', lineHeight: '1.3' }}>
                              {m.detalhes}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {m.originalCautela ? (
                                <button 
                                  className="btn btn-xs btn-primary"
                                  style={{ padding: '3px 8px', fontWeight: 'bold' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCautelaModal(m.originalCautela);
                                    const matchItem = results.find(r => String(r.id) === String(m.originalCautela.item_id || m.originalCautela.item));
                                    if (matchItem) setSelectedItemForAudit(matchItem);
                                  }}
                                >
                                  🔎 Ver Cautela
                                </button>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#a0aec0' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ textAlign: 'center', color: '#718096', padding: '24px 0', margin: 0 }}>Nenhuma movimentação correspondente a estes filtros.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Detalhes da Entrada de Estoque / Séries do Lote */}
      {showEntryBatchModal && selectedItemForAudit && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2200, padding: '16px' }}>
          <div className="card" style={{ width: '850px', maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', margin: 0, padding: '24px', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#1a365d', fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📦 Detalhes da Entrada no Inventário & Relação de Séries
                </h3>
                <p style={{ margin: '4px 0 0 0', color: '#4a5568', fontSize: '13px' }}>
                  <strong>{selectedItemForAudit.descricao}</strong> — {selectedItemForAudit.marca} {selectedItemForAudit.modelo} ({selectedItemForAudit.categoria})
                </p>
              </div>
              <button 
                onClick={() => setShowEntryBatchModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '22px', fontWeight: 'bold', cursor: 'pointer', color: '#a0aec0', padding: '0 4px' }}
              >
                ✕
              </button>
            </div>

            {/* Grid de Informações de Aquisição / Nota Fiscal / Empenho */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: '#f7fafc', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '16px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#718096', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>📄 Nota Fiscal</span>
                <span style={{ fontWeight: 'bold', color: '#2d3748' }}>{selectedItemForAudit.numero_nota_fiscal || '—'}</span>
              </div>
              <div>
                <span style={{ color: '#718096', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>📋 Nº Empenho</span>
                <span style={{ fontWeight: 'bold', color: '#2d3748' }}>{selectedItemForAudit.numero_empenho || '—'}</span>
              </div>
              <div>
                <span style={{ color: '#718096', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>🏭 Fornecedor / Fabricante</span>
                <span style={{ fontWeight: 'bold', color: '#2d3748' }}>{selectedItemForAudit.fornecedor_nome || '—'}</span>
              </div>
              <div>
                <span style={{ color: '#718096', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>💰 Valor Total Compra</span>
                <span style={{ fontWeight: 'bold', color: '#2b6cb0' }}>
                  {selectedItemForAudit.valor_compra ? `R$ ${Number(selectedItemForAudit.valor_compra).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                </span>
              </div>
              <div>
                <span style={{ color: '#718096', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>📅 Data da Entrada</span>
                <span style={{ fontWeight: 'bold', color: '#2d3748' }}>
                  {formatLocalDate(selectedItemForAudit.dt_aq || selectedItemForAudit.criado_em)}
                </span>
              </div>
              <div>
                <span style={{ color: '#718096', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>🔢 Qtd Adquirida no Lote</span>
                <span style={{ fontWeight: 'bold', color: '#2d3748' }}>
                  {selectedItemForAudit.qtd_total || 1} un. ({selectedItemForAudit.qtd_disp || 0} disp. / {Math.max(0, Number(selectedItemForAudit.qtd_total || 0) - Number(selectedItemForAudit.qtd_disp || 0))} em uso)
                </span>
              </div>
            </div>

            {/* Cabeçalho da Tabela de Séries com Busca */}
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <h4 style={{ margin: 0, color: '#2d3748', fontSize: '14px', fontWeight: 'bold' }}>
                📋 Relação de Séries / Bens Individuais do Lote ({selectedItemBens.length}):
              </h4>
              <input 
                type="text"
                value={modalSearchSerie}
                onChange={e => setModalSearchSerie(e.target.value)}
                placeholder="🔍 Filtrar número de série nesta entrada (ex: CNW002)..."
                style={{ width: '280px', maxWidth: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
              />
            </div>

            {/* Tabela com rolagem */}
            <div className="table-wrap" style={{ flex: 1, maxHeight: '360px', overflowY: 'auto', border: '1px solid #edf2f7', borderRadius: '4px' }}>
              <table style={{ fontSize: '12px', width: '100%' }}>
                <thead>
                  <tr style={{ background: '#f7fafc', position: 'sticky', top: 0, zIndex: 5 }}>
                    <th style={{ width: '40px' }}>#</th>
                    <th>Nº de Série</th>
                    <th>Patrimônio / Tombo</th>
                    <th>Tamanho / Detalhes</th>
                    <th>Status Atual</th>
                    <th>Detentor / Localização</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItemBens
                    .filter(b => {
                      if (!modalSearchSerie.trim()) return true;
                      const q = modalSearchSerie.toLowerCase().trim();
                      return String(b.serie || '').toLowerCase().includes(q) || String(b.patrimonio || '').toLowerCase().includes(q);
                    })
                    .map((b, idx) => {
                      const isEmUso = String(b.status).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'em uso';
                      const activeC = isEmUso ? cautelas.find(c => {
                        const isAtiva = String(c.status).toLowerCase().includes('ativa') || String(c.status).toLowerCase().includes('em uso');
                        if (!isAtiva) return false;
                        const cSer = String(c.serie || '').toLowerCase().trim();
                        const bSer = String(b.serie || '').toLowerCase().trim();
                        const bPat = String(b.patrimonio || '').toLowerCase().trim();
                        return cSer && ((bSer && cSer === bSer) || (bPat && cSer === bPat));
                      }) : null;

                      return (
                        <tr key={b.id || idx}>
                          <td style={{ color: '#a0aec0', fontSize: '11px' }}>{idx + 1}</td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#1a365d' }}>{b.serie || 'S/N'}</td>
                          <td>{b.patrimonio || '—'}</td>
                          <td>{b.tamanho || b.calibre || '—'}</td>
                          <td>
                            <span className={`badge ${isEmUso ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                              {isEmUso ? 'EM USO' : 'DISPONÍVEL'}
                            </span>
                          </td>
                          <td>
                            {activeC ? (
                              <div>
                                <strong style={{ color: '#2b6cb0' }}>👤 {activeC.policial_nome}</strong>
                                <div style={{ fontSize: '10px', color: '#718096' }}>{activeC.lotacao || '—'} ({activeC.depto || '—'})</div>
                              </div>
                            ) : (
                              <span style={{ color: '#38a169', fontSize: '11px', fontWeight: 'bold' }}>🏢 Estoque Central / Armaria</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  {selectedItemBens.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: '#718096', padding: '24px' }}>
                        Nenhum número de série individual cadastrado diretamente para este item.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-outline" onClick={() => setShowEntryBatchModal(false)}>
                Fechar Detalhes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Detalhes da Cautela / Movimentação */}
      {selectedCautelaModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '16px' }}>
          <div className="card" style={{ width: '750px', maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', margin: 0, padding: '24px', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, color: '#1a365d', fontSize: '18px', fontWeight: 'bold' }}>
                    📜 Ficha Detalhada da Cautela / Carga
                  </h3>
                  <span className={`badge ${selectedCautelaModal.status === 'Ativa' || selectedCautelaModal.status === 'Em Uso' ? 'badge-red' : 'badge-green'}`}>
                    {selectedCautelaModal.status === 'Ativa' || selectedCautelaModal.status === 'Em Uso' ? 'EM USO ATIVO' : 'DEVOLVIDA'}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0 0', color: '#718096', fontSize: '13px' }}>
                  Documento / Registro Nº: <strong style={{ color: '#2b6cb0', fontFamily: 'monospace' }}>{selectedCautelaModal.numero || selectedCautelaModal.id}</strong>
                </p>
              </div>
              <button 
                onClick={() => setSelectedCautelaModal(null)}
                style={{ background: 'none', border: 'none', fontSize: '22px', fontWeight: 'bold', cursor: 'pointer', color: '#a0aec0', padding: '0 4px' }}
              >
                ✕
              </button>
            </div>

            {/* Informações em Cards / Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              {/* Card Policial */}
              <div style={{ backgroundColor: '#ebf8ff', padding: '14px', borderRadius: '6px', border: '1px solid #bee3f8' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#2b6cb0', display: 'block', marginBottom: '6px' }}>
                  👤 Policial Responsável / Detentor
                </span>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#1a365d' }}>
                  {selectedCautelaModal.policial_nome || '—'}
                </div>
                <div style={{ fontSize: '12px', color: '#4a5568', marginTop: '4px' }}>
                  Matrícula: <strong>{selectedCautelaModal.matricula || '—'}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#4a5568', marginTop: '2px' }}>
                  Lotação: <strong>{selectedCautelaModal.lotacao || '—'}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#4a5568', marginTop: '2px' }}>
                  Departamento: <strong>{selectedCautelaModal.depto || '—'}</strong>
                </div>
              </div>

              {/* Card Material */}
              <div style={{ backgroundColor: '#f7fafc', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#4a5568', display: 'block', marginBottom: '6px' }}>
                  📦 Material / Equipamento Cautelado
                </span>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#2d3748' }}>
                  {selectedCautelaModal.item_desc || selectedItemForAudit?.descricao || 'Equipamento de Armaria'}
                </div>
                <div style={{ fontSize: '12px', color: '#718096', marginTop: '2px' }}>
                  Categoria: <strong>{selectedCautelaModal.categoria || selectedItemForAudit?.categoria || 'Armamentos/Equipamentos'}</strong>
                </div>
                <div style={{ fontSize: '13px', color: '#e53e3e', fontWeight: 'bold', marginTop: '6px', fontFamily: 'monospace' }}>
                  Nº DE SÉRIE: {selectedCautelaModal.serie || 'S/N'}
                </div>
                {(selectedCautelaModal.qtd_carregadores !== undefined && selectedCautelaModal.qtd_carregadores !== null && selectedCautelaModal.qtd_carregadores !== '') && (
                  <div style={{ fontSize: '12px', color: '#4a5568', marginTop: '4px' }}>
                    Carregadores: <strong>{selectedCautelaModal.qtd_carregadores} un.</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Grid de Datas e Locais */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #edf2f7', marginBottom: '16px', fontSize: '12px' }}>
              <div>
                <span style={{ color: '#718096', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>📅 Data da Cautela</span>
                <span style={{ fontWeight: 'bold', color: '#2d3748' }}>{formatLocalDate(selectedCautelaModal.data_cautela || selectedCautelaModal.data_evento || selectedCautelaModal.criado_em)}</span>
              </div>
              <div>
                <span style={{ color: '#718096', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>🔄 Status / Devolução</span>
                <span style={{ fontWeight: 'bold', color: selectedCautelaModal.status === 'Devolvida' ? '#38a169' : '#e53e3e' }}>
                  {selectedCautelaModal.status === 'Devolvida' ? `Devolvido em ${formatLocalDate(selectedCautelaModal.data_devolucao || selectedCautelaModal.atualizado_em)}` : 'Em Carga Ativa com o Policial'}
                </span>
              </div>
              <div>
                <span style={{ color: '#718096', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>🏢 Unidade de Origem/Emissão</span>
                <span style={{ fontWeight: 'bold', color: '#2d3748' }}>Estoque Central / Armaria</span>
              </div>
            </div>

            {/* Observações */}
            <div style={{ backgroundColor: '#fff8f0', border: '1px solid #feebc8', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
              <span style={{ color: '#c05621', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                📝 Observações / Finalidade Registrada
              </span>
              <p style={{ margin: 0, fontSize: '13px', color: '#7b341e' }}>
                {selectedCautelaModal.observacoes || selectedCautelaModal.detalhes || 'Saída para serviço operacional regulamentar.'}
              </p>
            </div>

            {/* Botões de Ação */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-xs btn-primary"
                  onClick={() => {
                    const matchItem = results.find(r => String(r.id) === String(selectedCautelaModal.item_id || selectedCautelaModal.item)) || selectedItemForAudit;
                    if (matchItem) {
                      setSelectedItemForAudit(matchItem);
                      setSelectedCautelaModal(null);
                      setTimeout(() => {
                        document.getElementById('audit-details-section')?.scrollIntoView({ behavior: 'smooth' });
                      }, 100);
                    } else {
                      setSelectedCautelaModal(null);
                    }
                  }}
                >
                  🔍 Ir para Auditoria deste Item
                </button>
                <button
                  className="btn btn-xs btn-outline"
                  onClick={() => {
                    const matchItem = selectedItemForAudit || results.find(r => String(r.id) === String(selectedCautelaModal.item_id || selectedCautelaModal.item));
                    if (matchItem) {
                      setSelectedItemForAudit(matchItem);
                    }
                    setModalSearchSerie(selectedCautelaModal.serie || '');
                    setSelectedCautelaModal(null);
                    setShowEntryBatchModal(true);
                  }}
                >
                  📦 Ver Lote / Entrada de Estoque
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-xs btn-outline" onClick={() => handleOpenPrintReport('ficha-cautela', `Ficha de Movimentação - ${selectedCautelaModal?.numero || 'Doc'}`, { cautela: selectedCautelaModal })}>
                  🖨️ Imprimir Ficha
                </button>
                <button className="btn btn-outline" onClick={() => setSelectedCautelaModal(null)}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Completo de Impressão e PDF de Auditoria e Relatórios */}
      {printModalReport && (
        <div className="print-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }}>
          <style>{`
            @media print {
              body > *:not(.print-modal-overlay) {
                display: none !important;
              }
              .print-modal-overlay {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: auto !important;
                background: #ffffff !important;
                z-index: 999999 !important;
                padding: 0 !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}</style>

          <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', maxWidth: '960px', width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
            {/* Modal Header Controls */}
            <div className="no-print" style={{ padding: '14px 20px', background: '#1e293b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🖨️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#f8fafc' }}>
                    Visualização e Impressão de Documento
                  </h3>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {printModalReport.title} • {printModalReport.date}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => window.print()}
                  style={{ fontWeight: 'bold', background: '#2563eb', borderColor: '#1d4ed8', color: '#ffffff', padding: '6px 16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  🖨️ Imprimir Agora / Salvar PDF
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => setPrintModalReport(null)}
                  style={{ color: '#e2e8f0', borderColor: '#475569' }}
                >
                  ✖️ Fechar
                </button>
              </div>
            </div>

            {/* Document Body */}
            <div id="printable-report-content" style={{ padding: '28px', overflowY: 'auto', flex: 1, color: '#0f172a', fontFamily: 'sans-serif', background: '#fff' }}>
              {/* Document Header */}
              <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                  <img src="/brasao_pcce.png" alt="Brasão PC-CE" style={{ height: '60px', width: 'auto', objectFit: 'contain' }} />
                </div>
                <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.5px' }}>
                  POLÍCIA CIVIL DO ESTADO DO CEARÁ
                </h2>
                <h3 style={{ margin: '3px 0 0 0', fontSize: '11px', color: '#334155', fontWeight: '700' }}>
                  GOVERNO DO ESTADO • SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL
                </h3>
                <h3 style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#0f172a', fontWeight: '800' }}>
                  DEPARTAMENTO TÉCNICO OPERACIONAL
                </h3>
                <h4 style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#334155', fontWeight: '700' }}>
                  SEÇÃO DE AQUISIÇÃO, LOGÍSTICA E TIRO - DTO
                </h4>
                <div style={{ marginTop: '10px', display: 'inline-block', padding: '4px 12px', background: '#f1f5f9', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', color: '#1e293b', border: '1px solid #cbd5e1' }}>
                  {printModalReport.title.toUpperCase()}
                </div>
              </div>

              {/* ITEM AUDIT */}
              {printModalReport.type === 'item-audit' && (
                <div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '12px' }}>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold', display: 'block' }}>Modelo / Descrição</span>
                      <strong style={{ fontSize: '14px', color: '#0f172a' }}>{printModalReport.data.item?.nome || printModalReport.data.item?.descricao || '—'}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold', display: 'block' }}>Categoria & Calibre</span>
                      <strong>{printModalReport.data.item?.categoria || '—'} • {printModalReport.data.item?.calibre || 'N/A'}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold', display: 'block' }}>Acervo / Estoque</span>
                      <strong>Total: {printModalReport.data.item?.qtd_total || 1} un. | Disp: {printModalReport.data.item?.qtd_disp || 0} un.</strong>
                    </div>
                  </div>

                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 'bold', color: '#1e293b', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>
                    📜 Histórico Cronológico de Movimentações ({printModalReport.data.events?.length || 0} registros)
                  </h4>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', color: '#1e293b' }}>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Nº Doc / Reg</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Data / Hora</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Tipo de Movimento</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Policial / Responsável</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Unidade / Depto</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Nº Série</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Detalhes / Obs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(printModalReport.data.events || []).map((evt, idx) => (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px', fontWeight: 'bold', fontFamily: 'monospace' }}>{evt.numero || '—'}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px' }}>{formatLocalDate(evt.data_evento)}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px', fontWeight: 'bold' }}>{evt.tipo_evento || evt.tipo}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px' }}>{evt.policial_nome || '—'}<br/><span style={{ fontSize: '10px', color: '#64748b' }}>Matr: {evt.matricula || '—'}</span></td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px' }}>{evt.lotacao || '—'}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px', fontFamily: 'monospace', fontWeight: 'bold' }}>{evt.serie || '—'}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px', fontSize: '10px' }}>{evt.detalhes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* HISTORICO GERAL DE MOVIMENTAÇÕES */}
              {printModalReport.type === 'historico-geral' && (
                <div>
                  <div style={{ marginBottom: '10px', fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>
                    Total de Registros de Movimentações e Cargas Exibidos: {(printModalReport.data.movements || printModalReport.data.cautelas || []).length}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', color: '#1e293b' }}>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Nº Registro</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Data</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Tipo Evento</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Policial / Responsável</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Lotação / Depto</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Item / Descrição</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Nº Série</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Detalhes / Observações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {((printModalReport.data.movements && printModalReport.data.movements.length > 0) ? printModalReport.data.movements : (printModalReport.data.cautelas || [])).map((m, idx) => (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px', fontWeight: 'bold', fontFamily: 'monospace' }}>{m.numero || '—'}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px' }}>{formatLocalDate(m.data_evento || m.data_cautela || m.data_saida)}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px', fontWeight: 'bold' }}>{m.tipo_evento || m.tipo || m.status}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px' }}>{m.policial_nome || '—'}<br/><span style={{ fontSize: '10px', color: '#64748b' }}>Matr: {m.matricula || '—'}</span></td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px' }}>{m.lotacao || '—'}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px' }}>{m.item_desc || m.item || '—'}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px', fontFamily: 'monospace', fontWeight: 'bold' }}>{m.serie || 's/n'}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '8px', fontSize: '10px' }}>{m.detalhes || m.obs || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* INVENTARIO */}
              {printModalReport.type === 'inventario' && (
                <div>
                  <div style={{ marginBottom: '10px', fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>
                    Itens Mapeados no Estoque: {printModalReport.data.items?.length || 0}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', color: '#1e293b' }}>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Item / Modelo</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Categoria</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Calibre</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Total Adquirido</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Disp. Armaria</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Em Carga / Uso</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '8px' }}>Status Estoque</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(printModalReport.data.items || []).map((r, idx) => {
                        const emUso = Math.max(0, Number(r.qtd_total || 0) - Number(r.qtd_disp || 0));
                        return (
                          <tr key={idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px', fontWeight: 'bold' }}>{r.nome || r.descricao}</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px' }}>{r.categoria}</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px' }}>{r.calibre || 'N/A'}</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px', fontWeight: 'bold' }}>{r.qtd_total || 1} un.</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px', color: '#2563eb', fontWeight: 'bold' }}>{r.qtd_disp || 0} un.</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px', color: '#dc2626', fontWeight: 'bold' }}>{emUso} un.</td>
                            <td style={{ border: '1px solid #e2e8f0', padding: '8px', fontWeight: 'bold' }}>{r.status || 'Regular'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* FICHA CAUTELA */}
              {printModalReport.type === 'ficha-cautela' && printModalReport.data.cautela && (
                <div>
                  <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                      Documento Nº: {printModalReport.data.cautela.numero || 'CAU-N/A'}
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                      <div>
                        <strong>Policial Responsável:</strong> {printModalReport.data.cautela.policial_nome}<br/>
                        <strong>Matrícula:</strong> {printModalReport.data.cautela.matricula || '—'}<br/>
                        <strong>Lotação:</strong> {printModalReport.data.cautela.lotacao || '—'}
                      </div>
                      <div>
                        <strong>Item:</strong> {printModalReport.data.cautela.item_desc || printModalReport.data.cautela.item}<br/>
                        <strong>Nº de Série:</strong> {printModalReport.data.cautela.serie || 's/n'}<br/>
                        <strong>Data Emissão:</strong> {formatLocalDate(printModalReport.data.cautela.data_cautela || printModalReport.data.cautela.data_saida)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Official Signature Lines */}
              <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'space-around', textAlign: 'center', fontSize: '11px' }}>
                <div style={{ borderTop: '1px solid #475569', width: '240px', paddingTop: '6px' }}>
                  <strong>Chefe da Seção de Aquisição, Logística e Tiro (DTO)</strong><br/>
                  <span>Polícia Civil do Estado do Ceará</span>
                </div>
                <div style={{ borderTop: '1px solid #475569', width: '240px', paddingTop: '6px' }}>
                  <strong>Vistoriador / Auditado em</strong><br/>
                  <span>{new Date().toLocaleDateString('pt-BR')}</span>
                </div>
              </div>

              {/* Official Address Footer */}
              <div style={{ marginTop: '30px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: '11px', color: '#64748b' }}>
                <strong>Av. Professor Guilhon, s/n, Aeroporto, 4º Andar, Fortaleza/CE – CEP 60415-330</strong> | <strong>Tel. 3101-7300.</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
