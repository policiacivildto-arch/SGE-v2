// src/components/DashboardDetalhes.jsx
import React, { useState, useMemo, useCallback } from 'react';
import { GlockIcon, MunicoesIcon } from './CategoryIcons';

// Date utility formatter
const normalizeStr = (s) => {
  if (s === null || s === undefined) return '';
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const matchItemToFilter = (item, filter, allBens = [], allCautelas = []) => {
  if (!filter || !item) return true;
  const { type, value } = filter;
  if (!value) return true;

  const valNorm = normalizeStr(value);
  const valNormAlt = valNorm.includes('5.56') ? valNorm.replace(/5\.56/g, '5,56') : valNorm.includes('5,56') ? valNorm.replace(/5,56/g, '5.56') : valNorm;

  if (type === 'depto') {
    const itemBens = allBens.filter(b => b.item_id === item.id);
    if (itemBens.length > 0) {
      return itemBens.some(b => {
        const activeC = findActiveCautelaForBen(allCautelas, item.id, b);
        const dep = activeC 
          ? (activeC.depto || activeC.departamento || activeC.lotacao || 'Não Informado')
          : (b.depto || item.depto || 'Estoque Central');
        const dNorm = normalizeStr(dep);
        return dNorm === valNorm || dNorm === valNormAlt;
      });
    }
    if (valNorm.includes('estoque central')) {
      if (Number(item.qtd_disp || 0) > 0) return true;
    }
    const itemCautelas = allCautelas.filter(c => (c.status === 'Ativa' || c.status === 'Em Uso') && String(c.item_id || c.item) === String(item.id));
    if (itemCautelas.some(c => {
      const dep = c.depto || c.departamento || c.lotacao || '';
      return normalizeStr(dep) === valNorm;
    })) return true;

    return normalizeStr(item.depto || item.departamento || '') === valNorm;
  }

  if (type === 'status') {
    const itemBens = allBens.filter(b => b.item_id === item.id);
    if (itemBens.length > 0) {
      return itemBens.some(b => {
        const activeC = findActiveCautelaForBen(allCautelas, item.id, b);
        const st = activeC ? 'Em Uso' : (b.status || 'Disponivel');
        return normalizeStr(st) === valNorm;
      });
    }
    if (valNorm === 'disponivel') {
      return Number(item.qtd_disp || 0) > 0;
    }
    if (valNorm === 'em uso') {
      return (Number(item.qtd_total || 0) - Number(item.qtd_disp || 0)) > 0;
    }
    return normalizeStr(item.status || '') === valNorm;
  }

  if (type === 'model') {
    const isMun = (item.categoria || '').toLowerCase().includes('muni');
    const itemMod = isMun && item.calibre ? item.calibre : item.modelo;
    const modelLabel = (item.marca || itemMod)
      ? `${item.marca || ''} ${itemMod || ''}`.trim()
      : (item.descricao || 'Não Especificado');

    const labelNorm = normalizeStr(modelLabel);
    const modNorm = normalizeStr(item.modelo || '');
    const calNorm = normalizeStr(item.calibre || '');
    const marcaNorm = normalizeStr(item.marca || '');
    const descNorm = normalizeStr(item.descricao || '');

    if (labelNorm === valNorm || labelNorm === valNormAlt) return true;
    if (modNorm && (modNorm === valNorm || modNorm === valNormAlt)) return true;
    if (calNorm && (calNorm === valNorm || calNorm === valNormAlt)) return true;
    if (marcaNorm && (marcaNorm === valNorm || marcaNorm === valNormAlt)) return true;
    if (descNorm && (descNorm.includes(valNorm) || descNorm.includes(valNormAlt))) return true;

    if (calNorm && (valNorm.includes(calNorm) || valNormAlt.includes(calNorm))) return true;
    if (modNorm && (valNorm.includes(modNorm) || valNormAlt.includes(modNorm))) return true;

    if (isMun) {
      const is556Val = valNorm.includes('5,56') || valNorm.includes('5.56');
      const is556Item = calNorm.includes('5,56') || calNorm.includes('5.56') || descNorm.includes('5,56') || descNorm.includes('5.56') || modNorm.includes('5,56') || modNorm.includes('5.56');
      if (is556Val && is556Item) return true;
    }

    return false;
  }

  if (type === 'type') {
    const t = item.subtipo || item.tipo_municao || item.tipo || item.calibre || item.categoria_equip || 'Geral';
    const tNorm = normalizeStr(t);
    if (tNorm === valNorm || tNorm === valNormAlt) return true;
    if (normalizeStr(item.tipo || '') === valNorm) return true;
    if (normalizeStr(item.subtipo || '') === valNorm) return true;
    if (normalizeStr(item.tipo_municao || '') === valNorm) return true;
    if (normalizeStr(item.calibre || '') === valNorm || normalizeStr(item.calibre || '') === valNormAlt) return true;
    return false;
  }

  if (type === 'subtipo') {
    const sub = item.subtipo || item.projetil || 'Geral';
    const subNorm = normalizeStr(sub);
    return subNorm === valNorm || subNorm === valNormAlt;
  }

  if (type === 'tipo_municao') {
    const tm = item.tipo_municao || (String(item.descricao || item.tipo || '').toLowerCase().includes('trein') ? 'Treina' : 'Operacional');
    return normalizeStr(tm) === valNorm;
  }

  if (type === 'size') {
    if (normalizeStr(item.tamanho || '') === valNorm) return true;
    const itemBens = allBens.filter(b => b.item_id === item.id);
    return itemBens.some(b => normalizeStr(b.tamanho || '') === valNorm);
  }

  if (type === 'sex') {
    const itemSex = item.sexo ? (item.sexo.toLowerCase().includes('masc') ? 'masculino' : item.sexo.toLowerCase().includes('fem') ? 'feminino' : normalizeStr(item.sexo)) : null;
    if (itemSex === valNorm) return true;
    const itemBens = allBens.filter(b => b.item_id === item.id);
    return itemBens.some(b => {
      const sx = b.sexo ? (b.sexo.toLowerCase().includes('masc') ? 'masculino' : b.sexo.toLowerCase().includes('fem') ? 'feminino' : normalizeStr(b.sexo)) : null;
      return sx === valNorm;
    });
  }

  if (type === 'color') {
    if (normalizeStr(item.cor || '') === valNorm) return true;
    const itemBens = allBens.filter(b => b.item_id === item.id);
    return itemBens.some(b => normalizeStr(b.cor || '') === valNorm);
  }

  if (type === 'cargo') {
    if (normalizeStr(item.cargo || '') === valNorm) return true;
    const itemBens = allBens.filter(b => b.item_id === item.id);
    if (itemBens.some(b => normalizeStr(b.cargo || '') === valNorm)) return true;
    const itemCautelas = allCautelas.filter(c => (c.status === 'Ativa' || c.status === 'Em Uso') && String(c.item_id || c.item) === String(item.id));
    return itemCautelas.some(c => {
      const cg = c.cargo || c.cargo_policial || c.cargo_nome || c.policial_cargo || '';
      return normalizeStr(cg) === valNorm;
    });
  }

  if (type === 'expiration') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const checkExp = (dateStr) => {
      if (!dateStr) return 'semData';
      try {
        let dt;
        if (typeof dateStr === 'string' && dateStr.includes('-') && !dateStr.includes('T')) {
          const parts = dateStr.split('-');
          dt = new Date(parts[0], parts[1] - 1, parts[2]);
        } else {
          dt = new Date(dateStr);
        }
        if (isNaN(dt.getTime())) return 'semData';
        const diffDays = Math.ceil((dt - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return 'vencidos';
        if (diffDays <= 180) return 'aVencer6Meses';
        return 'validos';
      } catch (e) {
        return 'semData';
      }
    };

    const valDate = item.validade || item.data_validade || item.dt_val;
    if (checkExp(valDate) === value) return true;

    const itemBens = allBens.filter(b => b.item_id === item.id);
    return itemBens.some(b => checkExp(b.validade || b.data_validade) === value);
  }

  if (type === 'stockLevel') {
    const isLow = Number(item.qtd_disp || 0) <= Number(item.qtd_min || 0);
    if (value === 'critico') return isLow;
    if (value === 'ok') return !isLow;
  }

  return true;
};

// Date utility formatter
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

// Helper to find active cautela for a specific physical asset (by serial or patrimonio)
const findActiveCautelaForBen = (allCautelas, itemId, bem) => {
  if (!allCautelas || !bem) return null;
  const norm = (s) => String(s || '').toLowerCase().trim();
  const bSer = norm(bem.serie);
  const bPat = norm(bem.patrimonio);
  
  return allCautelas.find(c => {
    const isAtiva = c.status === 'Ativa' || c.status === 'Em Uso';
    const sameItem = String(c.item_id || c.item) === String(itemId || bem.item_id);
    if (!isAtiva || !sameItem) return false;
    
    const cSer = norm(c.serie || c.numero_serie);
    if (!cSer) return false;
    
    return (bSer && cSer === bSer) || (bPat && cSer === bPat);
  }) || null;
};

export default function DashboardDetalhes({ items, allBens, allCautelas, STATUS_DETAILS, onNavigate }) {
  const [activeCategory, setActiveCategory] = useState('Armas');
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [itemSearch, setItemSearch] = useState('');
  const [selectedChartFilter, setSelectedChartFilter] = useState(null);

  const handleToggleChartFilter = (type, value, label) => {
    if (selectedChartFilter?.type === type && selectedChartFilter?.value === value) {
      setSelectedChartFilter(null);
    } else {
      setSelectedChartFilter({ type, value, label });
    }
  };

  // 1. Map categorizations
  const getMappedCategory = (cat) => {
    const c = String(cat || '').toLowerCase();
    if (c.includes('arma')) return 'Armas';
    if (c.includes('colete')) return 'Coletes';
    if (c.includes('muni')) return 'Munições';
    if (c.includes('uni')) return 'Uniformes';
    return 'Equipamentos';
  };

  // Filter items that belong to the active category
  const filteredItemsByCategory = useMemo(() => {
    return items.filter(item => getMappedCategory(item.categoria) === activeCategory);
  }, [items, activeCategory]);

  // Aggregate Category Counts
  const categorySummaryCounts = useMemo(() => {
    const counts = {
      'Armas': 0,
      'Coletes': 0,
      'Munições': 0,
      'Equipamentos': 0,
      'Uniformes': 0
    };
    items.forEach(item => {
      const cat = getMappedCategory(item.categoria);
      counts[cat] += Number(item.qtd_total || 0);
    });
    return counts;
  }, [items]);

  // Filter items by selected chart element (Department, Status, Model, Type, Size, Sex, Color, Expiration, Stock Level)
  const filteredChartItems = useMemo(() => {
    if (!selectedChartFilter) return filteredItemsByCategory;
    return filteredItemsByCategory.filter(item => matchItemToFilter(item, selectedChartFilter, allBens, allCautelas));
  }, [filteredItemsByCategory, selectedChartFilter, allBens, allCautelas]);

  // Search filtered items within the category and chart filter
  const searchedItems = useMemo(() => {
    if (!itemSearch.trim()) return filteredChartItems;
    const q = itemSearch.toLowerCase().trim();
    return filteredChartItems.filter(item => 
      String(item.descricao || '').toLowerCase().includes(q) ||
      String(item.marca || '').toLowerCase().includes(q) ||
      String(item.modelo || '').toLowerCase().includes(q) ||
      String(item.calibre || '').toLowerCase().includes(q) ||
      String(item.tipo || '').toLowerCase().includes(q)
    );
  }, [filteredChartItems, itemSearch]);

  // Helper to match item/ben/cautela against active chart filter
  const matchItemOrBen = useCallback((item, b, activeCautela, filter) => {
    if (!filter) return true;
    const { type, value } = filter;
    const valLower = normalizeStr(value);

    if (type === 'depto') {
      const dep = activeCautela 
        ? (activeCautela.depto || activeCautela.departamento || activeCautela.lotacao || 'Não Informado')
        : (b ? (b.depto || item?.depto || 'Estoque Central') : (item?.depto || item?.departamento || 'Estoque Central'));
      return normalizeStr(dep) === valLower;
    }

    if (type === 'status') {
      const st = activeCautela ? 'Em Uso' : (b ? (b.status || 'Disponivel') : null);
      if (st) return normalizeStr(st) === valLower;
      if (valLower === 'disponivel') return Number(item?.qtd_disp || 0) > 0;
      if (valLower === 'em uso') return (Number(item?.qtd_total || 0) - Number(item?.qtd_disp || 0)) > 0;
      return normalizeStr(item?.status || '') === valLower;
    }

    if (b) {
      if (type === 'size') {
        return normalizeStr(b.tamanho || item?.tamanho) === valLower;
      }
      if (type === 'sex') {
        const rawSex = b.sexo || item?.sexo;
        const sx = rawSex ? (rawSex.toLowerCase().includes('masc') ? 'masculino' : rawSex.toLowerCase().includes('fem') ? 'feminino' : rawSex.toLowerCase()) : null;
        return sx === valLower;
      }
      if (type === 'color') {
        return normalizeStr(b.cor || item?.cor) === valLower;
      }
      if (type === 'expiration') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateStr = b.validade || b.data_validade || item?.validade || item?.data_validade || item?.dt_val;
        if (!dateStr) return value === 'semData';
        try {
          let dt;
          if (typeof dateStr === 'string' && dateStr.includes('-') && !dateStr.includes('T')) {
            const parts = dateStr.split('-');
            dt = new Date(parts[0], parts[1] - 1, parts[2]);
          } else {
            dt = new Date(dateStr);
          }
          if (isNaN(dt.getTime())) return value === 'semData';
          const diffDays = Math.ceil((dt - today) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) return value === 'vencidos';
          if (diffDays <= 180) return value === 'aVencer6Meses';
          return value === 'validos';
        } catch (e) {
          return value === 'semData';
        }
      }
    }

    return matchItemToFilter(item, filter, allBens, allCautelas);
  }, [allBens, allCautelas]);
  // 3. Category Specific Detailed Analytics (Department, Models, Expiration, Sizes, Sex, Colors, Calibers)
  const categoryAnalyticsData = useMemo(() => {
    const itemIds = new Set(filteredChartItems.map(i => i.id));
    const allCategoryBens = allBens.filter(b => itemIds.has(b.item_id));

    // Filter bens matching selected filter
    const relevantBens = allCategoryBens.filter(b => {
      const parentItem = filteredChartItems.find(i => i.id === b.item_id) || {};
      const activeCautela = findActiveCautelaForBen(allCautelas, b.item_id, b);
      return matchItemOrBen(parentItem, b, activeCautela, selectedChartFilter);
    });

    const deptoMap = {};
    const statusMap = {};
    const modelMap = {};
    const typeMap = {};
    const subtipoMap = {};
    const tipoMunicaoMap = {};
    const sizeMap = {};
    const sexMap = {};
    const colorMap = {};
    const cargoMap = {};
    const expirationMap = {
      vencidos: 0,
      aVencer6Meses: 0,
      validos: 0,
      semData: 0
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const calculateExpiration = (dateStr, qty = 1) => {
      if (!dateStr) {
        expirationMap.semData += qty;
        return;
      }
      try {
        let dt;
        if (typeof dateStr === 'string' && dateStr.includes('-') && !dateStr.includes('T')) {
          const parts = dateStr.split('-');
          dt = new Date(parts[0], parts[1] - 1, parts[2]);
        } else {
          dt = new Date(dateStr);
        }
        if (isNaN(dt.getTime())) {
          expirationMap.semData += qty;
          return;
        }
        const diffDays = Math.ceil((dt - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          expirationMap.vencidos += qty;
        } else if (diffDays <= 180) {
          expirationMap.aVencer6Meses += qty;
        } else {
          expirationMap.validos += qty;
        }
      } catch (e) {
        expirationMap.semData += qty;
      }
    };

    // 1. Process Individual Bens
    relevantBens.forEach(b => {
      const parentItem = filteredChartItems.find(i => i.id === b.item_id) || {};

      const activeCautela = findActiveCautelaForBen(allCautelas, b.item_id, b);

      // Department
      const dep = activeCautela 
        ? (activeCautela.depto || activeCautela.departamento || activeCautela.lotacao || 'Não Informado')
        : (b.depto || parentItem.depto || 'Estoque Central');
      deptoMap[dep] = (deptoMap[dep] || 0) + 1;

      // Status
      const st = activeCautela ? 'Em Uso' : (b.status || 'Disponivel');
      statusMap[st] = (statusMap[st] || 0) + 1;

      // Model
      const isMunParent = (parentItem.categoria || '').toLowerCase().includes('muni');
      const parentMod = isMunParent && parentItem.calibre ? parentItem.calibre : parentItem.modelo;
      const modelLabel = (parentItem.marca || parentMod)
        ? `${parentItem.marca || ''} ${parentMod || ''}`.trim()
        : (parentItem.descricao || 'Não Especificado');
      modelMap[modelLabel] = (modelMap[modelLabel] || 0) + 1;

      // Type / Subtype / Caliber
      const t = parentItem.subtipo || parentItem.tipo_municao || parentItem.tipo || parentItem.calibre || parentItem.categoria_equip || 'Geral';
      typeMap[t] = (typeMap[t] || 0) + 1;

      // Subtipo / Projétil
      const sub = parentItem.subtipo || parentItem.projetil || 'Geral';
      subtipoMap[sub] = (subtipoMap[sub] || 0) + 1;

      // Tipo de Munição (Operacional x Treina)
      const tm = parentItem.tipo_municao || (String(parentItem.descricao || parentItem.tipo || '').toLowerCase().includes('trein') ? 'Treina' : 'Operacional');
      tipoMunicaoMap[tm] = (tipoMunicaoMap[tm] || 0) + 1;

      // Size
      const sz = b.tamanho || parentItem.tamanho;
      if (sz) {
        sizeMap[sz] = (sizeMap[sz] || 0) + 1;
      }

      // Sex
      const sx = b.sexo || parentItem.sexo;
      if (sx) {
        const formattedSex = sx.toLowerCase().includes('masc') ? 'Masculino' : sx.toLowerCase().includes('fem') ? 'Feminino' : sx;
        sexMap[formattedSex] = (sexMap[formattedSex] || 0) + 1;
      }

      // Color
      const col = b.cor || parentItem.cor;
      if (col) {
        colorMap[col] = (colorMap[col] || 0) + 1;
      }

      // Cargo
      const cg = b.cargo || parentItem.cargo || (activeCautela && (activeCautela.cargo || activeCautela.cargo_policial || activeCautela.cargo_nome || activeCautela.policial_cargo));
      if (cg) {
        cargoMap[cg] = (cargoMap[cg] || 0) + 1;
      }

      // Expiration
      const valDate = b.validade || b.data_validade || parentItem.validade || parentItem.data_validade || parentItem.dt_val;
      calculateExpiration(valDate, 1);
    });

    // 2. Process Items without individual bens
    filteredChartItems.forEach(item => {
      const hasIndBens = allCategoryBens.some(b => b.item_id === item.id);
      if (!hasIndBens) {
        const qtyTotal = Number(item.qtd_total || 0);
        const qtyDisp = Number(item.qtd_disp || 0);
        const qtyInUse = Math.max(0, qtyTotal - qtyDisp);

        // Model
        const isMunItem = (item.categoria || '').toLowerCase().includes('muni');
        const itemMod = isMunItem && item.calibre ? item.calibre : item.modelo;
        const modelLabel = (item.marca || itemMod)
          ? `${item.marca || ''} ${itemMod || ''}`.trim()
          : (item.descricao || 'Não Especificado');
        modelMap[modelLabel] = (modelMap[modelLabel] || 0) + qtyTotal;

        // Status
        if (selectedChartFilter?.type === 'status') {
          if (String(selectedChartFilter.value).toLowerCase() === 'disponivel') {
            if (qtyDisp > 0) statusMap['Disponivel'] = (statusMap['Disponivel'] || 0) + qtyDisp;
          } else if (String(selectedChartFilter.value).toLowerCase() === 'em uso') {
            if (qtyInUse > 0) statusMap['Em Uso'] = (statusMap['Em Uso'] || 0) + qtyInUse;
          }
        } else {
          if (qtyDisp > 0) statusMap['Disponivel'] = (statusMap['Disponivel'] || 0) + qtyDisp;
          if (qtyInUse > 0) statusMap['Em Uso'] = (statusMap['Em Uso'] || 0) + qtyInUse;
        }

        // Department
        if (selectedChartFilter?.type === 'depto') {
          const filterDep = String(selectedChartFilter.value).toLowerCase();
          if (filterDep.includes('estoque central')) {
            if (qtyDisp > 0) {
              deptoMap['Estoque Central'] = (deptoMap['Estoque Central'] || 0) + qtyDisp;
            }
          } else {
            const itemActiveCautelas = allCautelas.filter(c => c.status === 'Ativa' && c.item_id === item.id);
            itemActiveCautelas.forEach(c => {
              const dep = c.depto || c.departamento || c.lotacao || 'Não Informado';
              if (String(dep).toLowerCase() === filterDep) {
                deptoMap[dep] = (deptoMap[dep] || 0) + Number(c.qtd || 1);
              }
            });
          }
        } else {
          if (qtyDisp > 0) {
            deptoMap['Estoque Central'] = (deptoMap['Estoque Central'] || 0) + qtyDisp;
          }
          const itemActiveCautelas = allCautelas.filter(c => c.status === 'Ativa' && c.item_id === item.id);
          itemActiveCautelas.forEach(c => {
            const dep = c.depto || c.departamento || c.lotacao || 'Não Informado';
            deptoMap[dep] = (deptoMap[dep] || 0) + Number(c.qtd || 1);
          });
        }

        // Type / Calibre
        const t = item.subtipo || item.tipo_municao || item.tipo || item.calibre || item.categoria_equip || 'Geral';
        typeMap[t] = (typeMap[t] || 0) + qtyTotal;

        // Subtipo / Projétil
        const sub = item.subtipo || item.projetil || 'Geral';
        subtipoMap[sub] = (subtipoMap[sub] || 0) + qtyTotal;

        // Tipo de Munição (Operacional x Treina)
        const tm = item.tipo_municao || (String(item.descricao || item.tipo || '').toLowerCase().includes('trein') ? 'Treina' : 'Operacional');
        tipoMunicaoMap[tm] = (tipoMunicaoMap[tm] || 0) + qtyTotal;

        // Size
        if (item.tamanho) {
          sizeMap[item.tamanho] = (sizeMap[item.tamanho] || 0) + qtyTotal;
        }

        // Sex
        if (item.sexo) {
          const formattedSex = item.sexo.toLowerCase().includes('masc') ? 'Masculino' : item.sexo.toLowerCase().includes('fem') ? 'Feminino' : item.sexo;
          sexMap[formattedSex] = (sexMap[formattedSex] || 0) + qtyTotal;
        }

        // Color
        if (item.cor) {
          colorMap[item.cor] = (colorMap[item.cor] || 0) + qtyTotal;
        }

        // Cargo
        const cg = item.cargo;
        if (cg) {
          cargoMap[cg] = (cargoMap[cg] || 0) + qtyTotal;
        } else {
          const itemActiveCautelas = allCautelas.filter(c => (c.status === 'Ativa' || c.status === 'Em Uso') && String(c.item_id || c.item) === String(item.id));
          if (itemActiveCautelas.length > 0) {
            itemActiveCautelas.forEach(c => {
              const cCargo = c.cargo || c.cargo_policial || c.cargo_nome || c.policial_cargo;
              if (cCargo) cargoMap[cCargo] = (cargoMap[cCargo] || 0) + Number(c.qtd || 1);
            });
          }
        }

        // Expiration
        const valDate = item.validade || item.data_validade || item.dt_val;
        calculateExpiration(valDate, qtyTotal);
      }
    });

    return {
      deptoMap,
      statusMap,
      modelMap,
      typeMap,
      subtipoMap,
      tipoMunicaoMap,
      sizeMap,
      sexMap,
      colorMap,
      cargoMap,
      expirationMap
    };
  }, [filteredChartItems, allBens, allCautelas, selectedChartFilter, matchItemOrBen]);

  // 2. Advanced Interactive Chart Data: Segment Distribution within selected category by status
  const currentCategoryStatusChartData = useMemo(() => {
    const statusCounts = categoryAnalyticsData.statusMap || {};
    const colors = {
      'Disponivel': '#48bb78',  // Green
      'Em Uso': '#3182ce',      // Blue
      'Manutencao': '#ecc94b',  // Yellow/Gold
      'Inservivel': '#e53e3e',  // Red
      'Perdida': '#9b2c2c',     // Dark Red
      'Furtada': '#742a2a',
      'Roubada': '#5c2323',
      'Destruida': '#1a202c',
      'Recolhida': '#718096',
    };

    return Object.entries(statusCounts).map(([statusKey, val]) => {
      const info = STATUS_DETAILS[statusKey] || { label: statusKey, color: '#718096' };
      return {
        key: statusKey,
        name: info.label,
        count: val,
        color: colors[statusKey] || info.color || '#a0aec0'
      };
    }).sort((a, b) => b.count - a.count);
  }, [categoryAnalyticsData, STATUS_DETAILS]);

  // 4. Horizontal Progress Bar Chart Component
  const HorizontalBarChart = ({ title, dataMap, maxDisplay = 6, barColor = '#3182ce', unit = 'un.', filterType, selectedFilter, onSelectFilter }) => {
    const entries = Object.entries(dataMap || {})
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const total = entries.reduce((acc, curr) => acc + curr.count, 0);
    const displayEntries = entries.slice(0, maxDisplay);
    const otherCount = entries.slice(maxDisplay).reduce((acc, curr) => acc + curr.count, 0);

    if (otherCount > 0) {
      displayEntries.push({ name: 'Outros', count: otherCount });
    }

    const maxVal = Math.max(...displayEntries.map(e => e.count), 1);

    return (
      <div className="card" style={{ padding: '20px 24px', margin: 0, height: '350px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, width: '100%' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1a365d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '75%' }}>{title}</h3>
            <span style={{ fontSize: '10px', color: '#718096', fontWeight: '600', backgroundColor: '#edf2f7', padding: '2px 8px', borderRadius: '12px', flexShrink: 0 }}>
              💡 Clique p/ Filtrar
            </span>
          </div>
          {displayEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#718096', fontSize: '13px' }}>
              Nenhum dado registrado para esta classificação.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
              {displayEntries.map((item, idx) => {
                const pct = total > 0 ? (item.count / total) * 100 : 0;
                const barWidth = Math.max(4, (item.count / maxVal) * 100);
                const isSelected = selectedFilter?.type === filterType && String(selectedFilter?.value).toLowerCase() === String(item.name).toLowerCase();

                return (
                  <div 
                    key={idx} 
                    onClick={() => onSelectFilter && onSelectFilter(filterType, item.name, `${title.replace(/^[^\s]+\s/, '')}: ${item.name}`)}
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '3px',
                      cursor: 'pointer',
                      padding: '4px 6px',
                      borderRadius: '6px',
                      backgroundColor: isSelected ? '#ebf8ff' : 'transparent',
                      border: isSelected ? '1px solid #3182ce' : '1px solid transparent',
                      transition: 'all 0.15s ease',
                      minWidth: 0
                    }}
                    className="hover:bg-slate-50"
                    title={`Clique para filtrar por ${item.name}`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', minWidth: 0 }}>
                      <span style={{ fontWeight: isSelected ? '700' : '600', color: isSelected ? '#1a365d' : '#2d3748', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                        {item.name}
                      </span>
                      <span style={{ fontWeight: 'bold', color: isSelected ? '#2b6cb0' : '#1a365d', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {item.count} {unit} <span style={{ fontSize: '10px', fontWeight: 'normal', color: '#718096' }}>({pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: '#edf2f7', borderRadius: '4px', overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          width: `${barWidth}%`, 
                          height: '100%', 
                          backgroundColor: isSelected ? '#2b6cb0' : (item.name === 'Outros' ? '#a0aec0' : barColor), 
                          borderRadius: '4px',
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
        <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '10px', marginTop: '12px', fontSize: '11px', color: '#718096', fontStyle: 'italic', textAlign: 'center' }}>
          Total de registros consolidados: <strong>{total} {unit}</strong>
        </div>
      </div>
    );
  };

  // 5. Expiration Status Dashboard Card
  const ExpirationStatusChart = ({ title, expirationMap, unit = 'un.', selectedFilter, onSelectFilter }) => {
    const { vencidos = 0, aVencer6Meses = 0, validos = 0, semData = 0 } = expirationMap || {};
    const totalWithDate = vencidos + aVencer6Meses + validos;
    const grandTotal = totalWithDate + semData;

    const pctExpired = grandTotal > 0 ? (vencidos / grandTotal) * 100 : 0;
    const pctWarning = grandTotal > 0 ? (aVencer6Meses / grandTotal) * 100 : 0;
    const pctValid = grandTotal > 0 ? (validos / grandTotal) * 100 : 0;
    const pctSemData = grandTotal > 0 ? (semData / grandTotal) * 100 : 0;

    const isSelected = (val) => selectedFilter?.type === 'expiration' && selectedFilter?.value === val;

    return (
      <div className="card" style={{ padding: '20px 24px', margin: 0, height: '350px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, width: '100%' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1a365d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '75%' }}>{title}</h3>
            <span style={{ fontSize: '10px', color: '#718096', fontWeight: '600', backgroundColor: '#edf2f7', padding: '2px 8px', borderRadius: '12px', flexShrink: 0 }}>
              💡 Clique p/ Filtrar
            </span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
            <div 
              onClick={() => onSelectFilter && onSelectFilter('expiration', 'vencidos', 'Validade: Vencidos')}
              style={{ 
                backgroundColor: isSelected('vencidos') ? '#fed7d7' : '#fff5f5', 
                border: isSelected('vencidos') ? '2px solid #e53e3e' : '1px solid #feb2b2', 
                borderRadius: '6px', 
                padding: '8px 4px', 
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Filtrar por itens Vencidos"
            >
              <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#c53030', display: 'block', textTransform: 'uppercase' }}>Vencidos</span>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#9b2c2c', display: 'block', marginTop: '2px' }}>{vencidos}</span>
            </div>

            <div 
              onClick={() => onSelectFilter && onSelectFilter('expiration', 'aVencer6Meses', 'Validade: A vencer até 6 meses')}
              style={{ 
                backgroundColor: isSelected('aVencer6Meses') ? '#feebc8' : '#fffff0', 
                border: isSelected('aVencer6Meses') ? '2px solid #dd6b20' : '1px solid #fefcbf', 
                borderRadius: '6px', 
                padding: '8px 4px', 
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Filtrar por itens a vencer até 6m"
            >
              <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#b7791f', display: 'block', textTransform: 'uppercase' }}>Até 6m</span>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#d69e2e', display: 'block', marginTop: '2px' }}>{aVencer6Meses}</span>
            </div>

            <div 
              onClick={() => onSelectFilter && onSelectFilter('expiration', 'validos', 'Validade: Válidos')}
              style={{ 
                backgroundColor: isSelected('validos') ? '#c6f6d5' : '#f0fff4', 
                border: isSelected('validos') ? '2px solid #38a169' : '1px solid #9ae6b4', 
                borderRadius: '6px', 
                padding: '8px 4px', 
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Filtrar por itens Válidos"
            >
              <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#276749', display: 'block', textTransform: 'uppercase' }}>Válidos</span>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#2f855a', display: 'block', marginTop: '2px' }}>{validos}</span>
            </div>

            <div 
              onClick={() => onSelectFilter && onSelectFilter('expiration', 'semData', 'Validade: Sem Data Informada')}
              style={{ 
                backgroundColor: isSelected('semData') ? '#e2e8f0' : '#f7fafc', 
                border: isSelected('semData') ? '2px solid #4a5568' : '1px solid #e2e8f0', 
                borderRadius: '6px', 
                padding: '8px 4px', 
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Filtrar por itens Sem Data de Validade"
            >
              <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#718096', display: 'block', textTransform: 'uppercase' }}>Sem Data</span>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginTop: '2px' }}>{semData}</span>
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <span style={{ fontSize: '11px', color: '#4a5568', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
              Distribuição Temporal de Validade Técnico-Operacional
            </span>
            <div style={{ width: '100%', height: '14px', backgroundColor: '#edf2f7', borderRadius: '6px', overflow: 'hidden', display: 'flex', cursor: 'pointer' }}>
              <div onClick={() => onSelectFilter && onSelectFilter('expiration', 'vencidos', 'Validade: Vencidos')} style={{ width: `${pctExpired}%`, backgroundColor: '#e53e3e', height: '100%', opacity: isSelected('vencidos') ? 1 : 0.8 }} title={`Vencidos: ${vencidos} (${pctExpired.toFixed(1)}%)`} />
              <div onClick={() => onSelectFilter && onSelectFilter('expiration', 'aVencer6Meses', 'Validade: A vencer até 6m')} style={{ width: `${pctWarning}%`, backgroundColor: '#ecc94b', height: '100%', opacity: isSelected('aVencer6Meses') ? 1 : 0.8 }} title={`A vencer até 6m: ${aVencer6Meses} (${pctWarning.toFixed(1)}%)`} />
              <div onClick={() => onSelectFilter && onSelectFilter('expiration', 'validos', 'Validade: Válidos')} style={{ width: `${pctValid}%`, backgroundColor: '#48bb78', height: '100%', opacity: isSelected('validos') ? 1 : 0.8 }} title={`Válidos: ${validos} (${pctValid.toFixed(1)}%)`} />
              <div onClick={() => onSelectFilter && onSelectFilter('expiration', 'semData', 'Validade: Sem Data')} style={{ width: `${pctSemData}%`, backgroundColor: '#cbd5e0', height: '100%', opacity: isSelected('semData') ? 1 : 0.8 }} title={`Sem Data: ${semData} (${pctSemData.toFixed(1)}%)`} />
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '10px', marginTop: '12px', fontSize: '11px', color: '#718096', fontStyle: 'italic', textAlign: 'center' }}>
          Auditoria preventiva de prazos de validade e descarte.
        </div>
      </div>
    );
  };

  // 6. SVG Donut/Pie Chart Component for Category Status Breakdown
  const DonutPieChart = ({ data, title, selectedFilter, onSelectFilter }) => {
    const total = data.reduce((sum, d) => sum + d.count, 0);
    let accumulatedPercent = 0;

    return (
      <div className="card" style={{ padding: '20px 24px', margin: 0, height: '350px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, width: '100%' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1a365d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '75%' }}>{title}</h3>
            <span style={{ fontSize: '10px', color: '#718096', fontWeight: '600', backgroundColor: '#edf2f7', padding: '2px 8px', borderRadius: '12px', flexShrink: 0 }}>
              💡 Clique p/ Filtrar
            </span>
          </div>
          {data.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#718096', fontSize: '13px' }}>
              Nenhum item cadastrado nesta categoria.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', justifyContent: 'center', padding: '10px 0' }}>
              <div style={{ position: 'relative', width: '130px', height: '130px' }}>
                <svg width="100%" height="100%" viewBox="0 0 42 42" className="donut-svg">
                  {/* Empty/fallback circle */}
                  <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#edf2f7" strokeWidth="4.5" />
                  
                  {data.map((item, idx) => {
                    const percent = (item.count / total) * 100;
                    const strokeDasharray = `${percent} ${100 - percent}`;
                    const strokeDashoffset = 100 - accumulatedPercent + 25; // +25 starts at top (12 o'clock)
                    accumulatedPercent += percent;

                    const isSelected = selectedFilter?.type === 'status' && String(selectedFilter?.value).toLowerCase() === String(item.name).toLowerCase();

                    return (
                      <circle
                        key={idx}
                        cx="21"
                        cy="21"
                        r="15.915"
                        fill="transparent"
                        stroke={item.color}
                        strokeWidth={isSelected ? "6.5" : "4.5"}
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        style={{ 
                          transition: 'all 0.3s ease',
                          cursor: 'pointer',
                          opacity: (!selectedFilter || isSelected) ? 1 : 0.5
                        }}
                        onClick={() => onSelectFilter && onSelectFilter('status', item.name, `Status: ${item.name}`)}
                        title={`Status ${item.name}: ${item.count} un. (${percent.toFixed(1)}%) - Clique para filtrar`}
                      />
                    );
                  })}
                </svg>
                {/* Center count info */}
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#1a202c', display: 'block' }}>{total}</span>
                  <span style={{ fontSize: '9px', color: '#718096', textTransform: 'uppercase', fontWeight: 'bold' }}>Peças</span>
                </div>
              </div>

              {/* Legends with detail and percentage */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1', minWidth: '150px' }}>
                {data.map((item, idx) => {
                  const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;
                  const isSelected = selectedFilter?.type === 'status' && String(selectedFilter?.value).toLowerCase() === String(item.name).toLowerCase();

                  return (
                    <div 
                      key={idx} 
                      onClick={() => onSelectFilter && onSelectFilter('status', item.name, `Status: ${item.name}`)}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#ebf8ff' : 'transparent',
                        border: isSelected ? `1px solid ${item.color}` : '1px solid transparent',
                        transition: 'all 0.15s ease'
                      }}
                      className="hover:bg-slate-50"
                      title={`Clique para filtrar por status ${item.name}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: item.color }} />
                        <span style={{ fontWeight: isSelected ? '700' : '500', color: isSelected ? '#1a365d' : '#4a5568' }}>{item.name}</span>
                      </div>
                      <span style={{ fontWeight: '700', color: '#2d3748', marginLeft: '8px' }}>
                        {item.count} <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#718096' }}>({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '10px', marginTop: '12px', fontSize: '11px', color: '#718096', fontStyle: 'italic', textAlign: 'center' }}>
          Visualização analítica de estados físicos por amostragem.
        </div>
      </div>
    );
  };

  // 4. SVG Vertical Column Chart for Stock limits vs Critical limits
  const StockLevelBarChart = ({ data, title, selectedFilter, onSelectFilter }) => {
    // Select top 6 items with critical levels or simply the largest quantities
    const displayItems = [...data]
      .sort((a, b) => {
        const ratioA = Number(a.qtd_disp || 0) / Number(a.qtd_min || 1);
        const ratioB = Number(b.qtd_disp || 0) / Number(b.qtd_min || 1);
        if (ratioA !== ratioB) return ratioA - ratioB;
        return Number(b.qtd_total || 0) - Number(a.qtd_total || 0);
      })
      .slice(0, 6);

    const maxVal = Math.max(
      ...displayItems.flatMap(i => [Number(i.qtd_disp || 0), Number(i.qtd_min || 0)]),
      10
    );

    const isSelected = (level) => selectedFilter?.type === 'stockLevel' && selectedFilter?.value === level;

    return (
      <div className="card" style={{ padding: '20px 24px', margin: 0, height: '350px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, width: '100%' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1a365d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '75%' }}>{title}</h3>
            <span style={{ fontSize: '10px', color: '#718096', fontWeight: '600', backgroundColor: '#edf2f7', padding: '2px 8px', borderRadius: '12px', flexShrink: 0 }}>
              💡 Clique p/ Filtrar
            </span>
          </div>
          {displayItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#718096', fontSize: '13px' }}>
              Nenhum item com dados de estoque cadastrados.
            </div>
          ) : (
            <div style={{ display: 'flex', height: '175px', alignItems: 'flex-end', gap: '20px', paddingBottom: '12px', borderBottom: '1px solid #edf2f7', overflowX: 'auto', marginTop: '6px' }}>
              {displayItems.map((item, idx) => {
                const isUnderStock = Number(item.qtd_disp || 0) <= Number(item.qtd_min || 0);
                const dispHeight = Math.max(6, (Number(item.qtd_disp || 0) / maxVal) * 95);
                const minHeight = Math.max(6, (Number(item.qtd_min || 0) / maxVal) * 95);

                return (
                  <div key={item.id} style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '65px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '130px', width: '100%', justifyContent: 'center', position: 'relative', paddingTop: '30px' }}>
                      {/* Available bar */}
                      <div 
                        onClick={() => onSelectFilter && onSelectFilter('stockLevel', isUnderStock ? 'critico' : 'ok', `Nível de Estoque: ${isUnderStock ? 'Abaixo do Mínimo' : 'Disponível OK'}`)}
                        style={{ 
                          width: '18px', 
                          height: `${dispHeight}px`, 
                          backgroundColor: isUnderStock ? '#e53e3e' : '#3182ce', 
                          borderRadius: '3px 3px 0 0',
                          position: 'relative',
                          transition: 'height 0.3s ease',
                          cursor: 'pointer',
                          opacity: (!selectedFilter || isSelected(isUnderStock ? 'critico' : 'ok')) ? 1 : 0.4
                        }}
                        title={`Estoque Disponível: ${item.qtd_disp} - Clique para filtrar por este nível`}
                      >
                        <span style={{ position: 'absolute', top: '-22px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', fontWeight: '800', color: isUnderStock ? '#c53030' : '#1e3a8a', whiteSpace: 'nowrap', backgroundColor: '#ffffff', padding: '1px 3px', borderRadius: '3px', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
                          {item.qtd_disp}
                        </span>
                      </div>

                      {/* Minimum Safety Limit bar */}
                      <div 
                        style={{ 
                          width: '18px', 
                          height: `${minHeight}px`, 
                          backgroundColor: '#cbd5e0', 
                          borderRadius: '3px 3px 0 0',
                          position: 'relative',
                          transition: 'height 0.3s ease',
                          borderLeft: '1px dashed #718096'
                        }}
                        title={`Estoque Mínimo Exigido: ${item.qtd_min}`}
                      >
                        <span style={{ position: 'absolute', top: '-22px', left: '50%', transform: 'translateX(-50%)', fontSize: '11px', fontWeight: '700', color: '#4a5568', whiteSpace: 'nowrap', backgroundColor: '#ffffff', padding: '1px 3px', borderRadius: '3px', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
                          {item.qtd_min}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: '10px', color: '#2d3748', textAlign: 'center', marginTop: '10px', fontWeight: '600', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.descricao}>
                      {item.descricao}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '12px', fontSize: '11px', flexWrap: 'wrap' }}>
          <div 
            onClick={() => onSelectFilter && onSelectFilter('stockLevel', 'ok', 'Nível de Estoque: Disponível OK')}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', backgroundColor: isSelected('ok') ? '#ebf8ff' : 'transparent', border: isSelected('ok') ? '1px solid #3182ce' : '1px solid transparent' }}
          >
            <span style={{ width: '10px', height: '10px', backgroundColor: '#3182ce', borderRadius: '2px' }} />
            <span style={{ color: '#4a5568', fontWeight: isSelected('ok') ? 'bold' : 'normal' }}>Disponível OK</span>
          </div>
          <div 
            onClick={() => onSelectFilter && onSelectFilter('stockLevel', 'critico', 'Nível de Estoque: Abaixo do Mínimo')}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', backgroundColor: isSelected('critico') ? '#fff5f5' : 'transparent', border: isSelected('critico') ? '1px solid #e53e3e' : '1px solid transparent' }}
          >
            <span style={{ width: '10px', height: '10px', backgroundColor: '#e53e3e', borderRadius: '2px' }} />
            <span style={{ color: '#e53e3e', fontWeight: isSelected('critico') ? 'bold' : '500' }}>Abaixo do Mínimo</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', backgroundColor: '#cbd5e0', borderRadius: '2px' }} />
            <span style={{ color: '#718096' }}>Estoque de Segurança</span>
          </div>
        </div>
      </div>
    );
  };

  // 5. Utilization Category Gauges (Radial Meters)
  const categoryGauges = useMemo(() => {
    const categories = ['Armas', 'Coletes', 'Munições', 'Equipamentos', 'Uniformes'];
    
    return categories.map(cat => {
      let total = 0;
      let disp = 0;
      
      items.forEach(item => {
        if (getMappedCategory(item.categoria) === cat) {
          total += Number(item.qtd_total || 0);
          disp += Number(item.qtd_disp || 0);
        }
      });

      const inUse = Math.max(0, total - disp);
      const pct = total > 0 ? (inUse / total) * 100 : 0;
      
      const colors = {
        'Armas': '#1a365d',
        'Coletes': '#3182ce',
        'Munições': '#ecc94b',
        'Equipamentos': '#48bb78',
        'Uniformes': '#805ad5'
      };

      return {
        name: cat,
        total,
        inUse,
        pct,
        color: colors[cat] || '#718096'
      };
    });
  }, [items]);

  const toggleItemExpansion = (itemId) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  return (
    <div>
      {/* Category selector row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { id: 'Armas', label: 'Armas', icon: <GlockIcon size={32} />, bg: '#1a365d' },
          { id: 'Coletes', label: 'Coletes Balísticos', icon: '🛡️', bg: '#3182ce' },
          { id: 'Munições', label: 'Munições', icon: <MunicoesIcon size={32} />, bg: '#d69e2e' },
          { id: 'Equipamentos', label: 'Equipamentos e EPI', icon: '⚙️', bg: '#48bb78' },
          { id: 'Uniformes', label: 'Uniformes e Vestuário', icon: '👕', bg: '#805ad5' }
        ].map(cat => {
          const isActive = activeCategory === cat.id;
          const totalInCat = categorySummaryCounts[cat.id] || 0;
          return (
            <div
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                setExpandedItemId(null);
                setItemSearch('');
                setSelectedChartFilter(null);
              }}
              style={{
                padding: '16px',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: isActive ? '#f7fafc' : '#ffffff',
                border: isActive ? `2px solid ${cat.bg}` : '1px solid #edf2f7',
                boxShadow: isActive ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none',
                transform: isActive ? 'translateY(-2px)' : 'none',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
              className="hover:shadow-md"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '24px', display: 'flex', alignItems: 'center', minHeight: '32px' }}>{cat.icon}</span>
                <span 
                  style={{ 
                    fontSize: '11px', 
                    fontWeight: 'bold', 
                    color: '#fff', 
                    backgroundColor: cat.bg,
                    padding: '2px 8px',
                    borderRadius: '10px'
                  }}
                >
                  {totalInCat} un.
                </span>
              </div>
              <div style={{ marginTop: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: isActive ? '#1a202c' : '#718096', display: 'block' }}>
                  {cat.label}
                </span>
                <span style={{ fontSize: '10px', color: '#a0aec0', display: 'block', marginTop: '2px' }}>
                  {isActive ? '🎯 Ativo no painel' : 'Clique para analisar'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Utilization Category Gauges (Radial Meters) */}
      <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 16px 0', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', color: '#718096', textAlign: 'center' }}>
          📈 Taxa de Cautela de Ativos por Categoria (Em Carga vs Estoque)
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '20px' }}>
          {categoryGauges.map((gauge) => {
            const r = 16;
            const circ = 2 * Math.PI * r;
            const strokeDashoffset = circ - (gauge.pct / 100) * circ;
            const isSelectedGauge = gauge.name === activeCategory;

            return (
              <div 
                key={gauge.name}
                onClick={() => {
                  setActiveCategory(gauge.name);
                  setExpandedItemId(null);
                  setItemSearch('');
                  setSelectedChartFilter(null);
                }}
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  textAlign: 'center', 
                  padding: '10px', 
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: isSelectedGauge ? '#ebf8ff' : 'transparent',
                  border: isSelectedGauge ? '1px solid #90cdf4' : '1px solid transparent',
                  transition: 'all 0.15s ease'
                }}
                className="hover:bg-slate-50"
              >
                <span style={{ fontSize: '12px', fontWeight: '600', color: isSelectedGauge ? '#2b6cb0' : '#4a5568' }}>
                  {gauge.name}
                </span>
                <div style={{ position: 'relative', width: '56px', height: '56px', marginTop: '6px' }}>
                  <svg width="56" height="56" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r={r} fill="transparent" stroke="#edf2f7" strokeWidth="4" />
                    <circle
                      cx="20"
                      cy="20"
                      r={r}
                      fill="transparent"
                      stroke={gauge.color}
                      strokeWidth="4"
                      strokeDasharray={circ}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      transform="rotate(-90 20 20)"
                      style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                    />
                  </svg>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '10px', fontWeight: 'bold', color: '#2d3748' }}>
                    {gauge.pct.toFixed(0)}%
                  </div>
                </div>
                <div style={{ fontSize: '10px', color: '#718096', marginTop: '6px' }}>
                  <strong>{gauge.inUse}</strong> de {gauge.total} un.
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Advanced Category-Specific Chart Section */}
      <div style={{ marginBottom: '24px' }}>
        {activeCategory === 'Armas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <HorizontalBarChart 
              title="🏢 Armas por Departamento / Lotação" 
              dataMap={categoryAnalyticsData.deptoMap} 
              barColor="#1a365d" 
              filterType="depto"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <DonutPieChart 
              data={currentCategoryStatusChartData} 
              title="🍕 Armas por Status" 
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <HorizontalBarChart 
              title="🔫 Quantidades Totais por Modelo" 
              dataMap={categoryAnalyticsData.modelMap} 
              barColor="#2b6cb0" 
              filterType="model"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <HorizontalBarChart 
              title="🎯 Tipo de Arma" 
              dataMap={categoryAnalyticsData.typeMap} 
              barColor="#319795" 
              filterType="type"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
          </div>
        )}

        {activeCategory === 'Coletes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <HorizontalBarChart 
              title="🏢 Coletes por Departamento / Lotação" 
              dataMap={categoryAnalyticsData.deptoMap} 
              barColor="#3182ce" 
              filterType="depto"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <DonutPieChart 
              data={currentCategoryStatusChartData} 
              title="🍕 Coletes por Status" 
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <HorizontalBarChart 
              title="🛡️ Coletes por Modelo" 
              dataMap={categoryAnalyticsData.modelMap} 
              barColor="#2b6cb0" 
              filterType="model"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <ExpirationStatusChart 
              title="⏳ Vencimento" 
              expirationMap={categoryAnalyticsData.expirationMap} 
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <HorizontalBarChart 
              title="📐 Coletes por Tamanho" 
              dataMap={categoryAnalyticsData.sizeMap} 
              barColor="#805ad5" 
              filterType="size"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <HorizontalBarChart 
              title="👤 Coletes por Sexo" 
              dataMap={categoryAnalyticsData.sexMap} 
              barColor="#d69e2e" 
              filterType="sex"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
          </div>
        )}

        {activeCategory === 'Munições' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <HorizontalBarChart 
              title="💥 Munições por Subtipo / Projétil" 
              dataMap={categoryAnalyticsData.subtipoMap} 
              barColor="#d69e2e" 
              filterType="subtipo"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <HorizontalBarChart 
              title="🎯 Munições por Calibre / Modelo" 
              dataMap={categoryAnalyticsData.modelMap} 
              barColor="#dd6b20" 
              filterType="model"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <HorizontalBarChart 
              title="🏢 Munições por Departamento / Lotação" 
              dataMap={categoryAnalyticsData.deptoMap} 
              barColor="#3182ce" 
              filterType="depto"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <HorizontalBarChart 
              title="🎯 Munições por Finalidade (Operacional x Treina)" 
              dataMap={categoryAnalyticsData.tipoMunicaoMap} 
              barColor="#319795" 
              filterType="tipo_municao"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <DonutPieChart 
              data={currentCategoryStatusChartData} 
              title="🍕 Munições por Status (Estoque Central x Carga)" 
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <ExpirationStatusChart 
              title="⏳ Vencimento dos Lotes de Munição" 
              expirationMap={categoryAnalyticsData.expirationMap} 
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
          </div>
        )}

        {activeCategory === 'Equipamentos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <HorizontalBarChart 
              title="⚙️ Equipamentos por Categoria / Subgrupo" 
              dataMap={categoryAnalyticsData.typeMap} 
              barColor="#38a169" 
              filterType="type"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            {selectedChartFilter?.type === 'type' && (
              String(selectedChartFilter.value).toLowerCase().includes('distintivo') ? (
                <HorizontalBarChart 
                  title="🛡️ Distintivos por Cargo" 
                  dataMap={categoryAnalyticsData.cargoMap} 
                  barColor="#2f855a" 
                  filterType="cargo"
                  selectedFilter={selectedChartFilter}
                  onSelectFilter={handleToggleChartFilter}
                />
              ) : (
                <HorizontalBarChart 
                  title={`📦 Modelos de ${selectedChartFilter.value}`} 
                  dataMap={categoryAnalyticsData.modelMap} 
                  barColor="#2f855a" 
                  filterType="model"
                  selectedFilter={selectedChartFilter}
                  onSelectFilter={handleToggleChartFilter}
                />
              )
            )}
            <HorizontalBarChart 
              title="🏢 Equipamentos por Departamento / Lotação" 
              dataMap={categoryAnalyticsData.deptoMap} 
              barColor="#3182ce" 
              filterType="depto"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <DonutPieChart 
              data={currentCategoryStatusChartData} 
              title="🍕 Equipamentos por Status / Conservação" 
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <StockLevelBarChart 
              data={filteredChartItems} 
              title="📊 Níveis de Estoque x Mínimo Exigido" 
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
          </div>
        )}

        {activeCategory === 'Uniformes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <HorizontalBarChart 
              title="👕 Uniformes por Peça / Categoria" 
              dataMap={categoryAnalyticsData.typeMap} 
              barColor="#805ad5" 
              filterType="type"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            {selectedChartFilter?.type === 'type' && (
              <HorizontalBarChart 
                title={`📦 Modelos de ${selectedChartFilter.value}`} 
                dataMap={categoryAnalyticsData.modelMap} 
                barColor="#6b46c1" 
                filterType="model"
                selectedFilter={selectedChartFilter}
                onSelectFilter={handleToggleChartFilter}
              />
            )}
            <HorizontalBarChart 
              title="🏢 Uniformes por Departamento / Lotação" 
              dataMap={categoryAnalyticsData.deptoMap} 
              barColor="#3182ce" 
              filterType="depto"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <HorizontalBarChart 
              title="📐 Uniformes por Tamanho / Numeração" 
              dataMap={categoryAnalyticsData.sizeMap} 
              barColor="#6b46c1" 
              filterType="size"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <HorizontalBarChart 
              title="👤 Uniformes por Sexo / Modelagem" 
              dataMap={categoryAnalyticsData.sexMap} 
              barColor="#b794f4" 
              filterType="sex"
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <DonutPieChart 
              data={currentCategoryStatusChartData} 
              title="🍕 Uniformes por Status (Estoque x Carga)" 
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
            <StockLevelBarChart 
              data={filteredChartItems} 
              title="📊 Balanço de Estoque Mínimo" 
              selectedFilter={selectedChartFilter}
              onSelectFilter={handleToggleChartFilter}
            />
          </div>
        )}
      </div>

      {/* Expandable Drilldown Item list */}
      <div className="card" style={{ padding: '24px' }}>
        {selectedChartFilter && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            backgroundColor: '#ebf8ff', 
            border: '1px solid #90cdf4', 
            borderRadius: '6px', 
            padding: '10px 16px', 
            marginBottom: '16px' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#2b6cb0', fontWeight: '600' }}>
              <span>🎯 Filtro ativo do gráfico:</span>
              <span style={{ backgroundColor: '#2b6cb0', color: '#fff', padding: '2px 10px', borderRadius: '12px', fontSize: '12px' }}>
                {selectedChartFilter.label || `${selectedChartFilter.type}: ${selectedChartFilter.value}`}
              </span>
            </div>
            <button
              onClick={() => setSelectedChartFilter(null)}
              style={{
                backgroundColor: '#e2e8f0',
                color: '#2d3748',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 12px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
              className="hover:bg-slate-300"
            >
              🧹 Limpar Filtro do Gráfico
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1a365d' }}>
              🔍 Catálogo Analítico de {activeCategory} ({searchedItems.length} tipos de itens)
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#718096' }}>
              Consulte especificações detalhadas, gráficos de alocação de carga e audite números de séries individuais.
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <input 
              type="text"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              placeholder={`🔍 Filtrar em ${activeCategory}...`}
              style={{ padding: '6px 12px', fontSize: '13px', border: '1px solid #cbd5e0', borderRadius: '4px', width: '250px' }}
            />
          </div>
        </div>

        {searchedItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#718096' }}>
            Nenhum item localizado nesta categoria para a busca realizada.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {searchedItems.map(item => {
              const isExpanded = expandedItemId === item.id;
              
              const qtyDisp = Number(item.qtd_disp || 0);
              const qtyTotal = Number(item.qtd_total || 0);

              // Count other statuses if we have individual assets
              const itemBens = allBens.filter(b => b.item_id === item.id);
              const countOtherStatus = itemBens.filter(b => {
                const st = (b.status || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                return st === 'manutencao' || st === 'reparo' || st === 'inservivel' || st === 'danificado' || st === 'baixado';
              }).length;

              const qtyInUse = Math.max(0, qtyTotal - qtyDisp - countOtherStatus);

              const pctDisp = qtyTotal > 0 ? (qtyDisp / qtyTotal) * 100 : 100;
              const pctInUse = qtyTotal > 0 ? (qtyInUse / qtyTotal) * 100 : 0;
              const pctOther = qtyTotal > 0 ? (countOtherStatus / qtyTotal) * 100 : 0;

              const isLowStock = qtyDisp <= Number(item.qtd_min || 0);

              return (
                <div 
                  key={item.id} 
                  style={{ 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '8px', 
                    overflow: 'hidden',
                    backgroundColor: isExpanded ? '#fcfcfc' : '#ffffff',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {/* Accordion Header */}
                  <div 
                    onClick={() => toggleItemExpansion(item.id)}
                    style={{ 
                      padding: '14px 18px', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                    className="hover:bg-slate-50"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1' }}>
                      <span style={{ fontSize: '18px', display: 'flex', alignItems: 'center' }}>
                        {activeCategory === 'Armas' ? <GlockIcon size={22} /> : activeCategory === 'Coletes' ? '🛡️' : activeCategory === 'Munições' ? <MunicoesIcon size={22} /> : activeCategory === 'Equipamentos' ? '⚙️' : '👕'}
                      </span>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: '#1a202c' }}>
                          {item.descricao} {item.marca && <span style={{ fontWeight: '500', color: '#718096', fontSize: '12px' }}>({item.marca} {item.modelo})</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                            Ref: #{item.id}
                          </span>
                          {item.calibre && (
                            <span className="badge badge-blue" style={{ fontSize: '10px' }}>
                              Calibre: {item.calibre}
                            </span>
                          )}
                          {item.tamanho && (
                            <span className="badge badge-purple" style={{ fontSize: '10px' }}>
                              Tam: {item.tamanho} {item.sexo ? `(${item.sexo})` : ''}
                            </span>
                          )}
                          {isLowStock && Number(item.qtd_min || 0) > 0 && (
                            <span className="badge badge-red" style={{ fontSize: '9px', fontWeight: 'bold' }}>
                              ⚠️ ESTOQUE CRÍTICO
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '11px', color: '#718096', display: 'block', textTransform: 'uppercase', fontWeight: 'bold' }}>Qtd. Disponível</span>
                        <span style={{ fontSize: '16px', fontWeight: 'bold', color: isLowStock ? '#e53e3e' : '#2f855a' }}>
                          {qtyDisp} <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#718096' }}>de {qtyTotal} un.</span>
                        </span>
                      </div>
                      
                      {/* Accordion Arrow icon */}
                      <span style={{ fontSize: '14px', color: '#a0aec0', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        ▼
                      </span>
                    </div>
                  </div>

                  {/* Accordion Content */}
                  {isExpanded && (
                    <div style={{ padding: '20px', borderTop: '1px solid #edf2f7', backgroundColor: '#fcfcfc' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                        
                        {/* Column 1: Technical Specs */}
                        <div style={{ padding: '12px', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #edf2f7' }}>
                          <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 'bold', color: '#1a365d', textTransform: 'uppercase', borderBottom: '1px solid #edf2f7', paddingBottom: '4px' }}>
                            📋 Ficha Técnica
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                            {activeCategory === 'Armas' && (
                              <>
                                <div><strong>Tipo de Armamento:</strong> {item.tipo || '—'}</div>
                                <div><strong>Calibre:</strong> {item.calibre || '—'}</div>
                                <div><strong>Marca / Modelo:</strong> {item.marca || '—'} {item.modelo || '—'}</div>
                                <div><strong>Nº Registro / SIGMA:</strong> {item.num_registro || '—'}</div>
                              </>
                            )}
                            {activeCategory === 'Coletes' && (
                              <>
                                <div><strong>Marca:</strong> {item.marca || '—'}</div>
                                <div><strong>Nível Balístico:</strong> {item.nivel || '—'}</div>
                                <div><strong>Tamanho / Gênero:</strong> {item.tamanho || '—'} / {item.sexo || '—'}</div>
                                <div><strong>Validade do Lote:</strong> <span style={{ color: new Date(item.dt_val) < new Date() ? '#e53e3e' : 'inherit', fontWeight: new Date(item.dt_val) < new Date() ? 'bold' : 'normal' }}>{formatLocalDate(item.dt_val)}</span></div>
                                <div><strong>Lote:</strong> {item.lote || '—'}</div>
                              </>
                            )}
                            {activeCategory === 'Munições' && (
                              <>
                                <div><strong>Tipo de Munição:</strong> {item.tipo_municao || '—'}</div>
                                <div><strong>Calibre:</strong> {item.calibre || '—'}</div>
                                <div><strong>Marca / Modelo:</strong> {item.marca || '—'} / {item.modelo || '—'}</div>
                                <div><strong>Validade:</strong> {formatLocalDate(item.dt_val)}</div>
                                <div><strong>Lote Fabricação:</strong> {item.lote_fabricacao || '—'}</div>
                              </>
                            )}
                            {activeCategory === 'Equipamentos' && (
                              <>
                                <div><strong>Tipo de Equipamento:</strong> {item.tipo || '—'}</div>
                                <div><strong>Marca / Modelo:</strong> {item.marca || '—'} {item.modelo || '—'}</div>
                                <div><strong>Patrimônio Principal:</strong> {item.patrimonio || '—'}</div>
                              </>
                            )}
                            {activeCategory === 'Uniformes' && (
                              <>
                                <div><strong>Tipo de Uniforme:</strong> {item.tipo || '—'}</div>
                                <div><strong>Tamanho:</strong> {item.tamanho || '—'}</div>
                                <div><strong>Gênero / Corte:</strong> {item.sexo || '—'}</div>
                                <div><strong>Cor Padrão:</strong> {item.cor || 'Preto'}</div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Column 2: Distribution Analytics Meter */}
                        <div style={{ padding: '12px', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #edf2f7', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 'bold', color: '#1a365d', textTransform: 'uppercase', borderBottom: '1px solid #edf2f7', paddingBottom: '4px' }}>
                              📈 Alocação do Estoque
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px', marginTop: '6px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#48bb78', fontWeight: '500' }}>● Disponível em Estoque Central</span>
                                <span style={{ fontWeight: 'bold' }}>{qtyDisp} un. ({pctDisp.toFixed(0)}%)</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#3182ce', fontWeight: '500' }}>● Em Carga (Cautelas Ativas)</span>
                                <span style={{ fontWeight: 'bold' }}>{qtyInUse} un. ({pctInUse.toFixed(0)}%)</span>
                              </div>
                              {countOtherStatus > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: '#ecc94b', fontWeight: '500' }}>● Outros Estados (Reparo/Inservível)</span>
                                  <span style={{ fontWeight: 'bold' }}>{countOtherStatus} un. ({pctOther.toFixed(0)}%)</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Multi-colored progress bar */}
                          <div style={{ marginTop: '12px' }}>
                            <div style={{ width: '100%', height: '10px', backgroundColor: '#edf2f7', borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
                              <div style={{ width: `${pctDisp}%`, backgroundColor: '#48bb78', height: '100%' }} title={`Disponível: ${pctDisp.toFixed(0)}%`} />
                              <div style={{ width: `${pctInUse}%`, backgroundColor: '#3182ce', height: '100%' }} title={`Em Carga: ${pctInUse.toFixed(0)}%`} />
                              <div style={{ width: `${pctOther}%`, backgroundColor: '#ecc94b', height: '100%' }} title={`Outros estados: ${pctOther.toFixed(0)}%`} />
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* Drill down table: nested lists of individual physical goods (Bens) OR nested active bulk cautelas */}
                      <div style={{ border: '1px solid #edf2f7', borderRadius: '6px', backgroundColor: '#ffffff', padding: '16px' }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 'bold', color: '#1a365d', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          🔎 Auditoria Física de Acervo ({itemBens.length > 0 ? `${itemBens.length} Bens Individuais` : 'Controle por Lote/Volume'})
                        </h4>

                        {itemBens.length > 0 ? (
                          // Table of individually registered physical assets
                          <div className="table-wrap" style={{ margin: 0, maxHeight: '250px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ backgroundColor: '#f7fafc' }}>
                                  <th style={{ padding: '8px' }}>Patrimônio</th>
                                  <th style={{ padding: '8px' }}>Nº de Série</th>
                                  <th style={{ padding: '8px' }}>Situação Física</th>
                                  <th style={{ padding: '8px' }}>Localização Atual / Portador</th>
                                  <th style={{ padding: '8px' }}>Departamento / Lotação</th>
                                </tr>
                              </thead>
                              <tbody>
                                {itemBens.map(bem => {
                                  // Find active cautela for this serial number or tombo
                                  const activeCautela = findActiveCautelaForBen(allCautelas, item.id, bem);

                                  const status = activeCautela ? 'Em Uso' : (bem.status || 'Disponivel');
                                  const statusStyle = STATUS_DETAILS[status] || { color: '#718096', bg: '#edf2f7' };

                                  return (
                                    <tr key={bem.id}>
                                      <td style={{ padding: '8px', fontFamily: 'monospace' }}>{bem.patrimonio || '—'}</td>
                                      <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 'bold' }}>{bem.serie || 'Sem Série'}</td>
                                      <td style={{ padding: '8px' }}>
                                        <span 
                                          style={{ 
                                            fontSize: '10px', 
                                            fontWeight: 'bold', 
                                            color: statusStyle.color, 
                                            backgroundColor: statusStyle.bg,
                                            padding: '2px 6px',
                                            borderRadius: '10px',
                                            border: `1px solid ${statusStyle.color}30`
                                          }}
                                        >
                                          {STATUS_DETAILS[status]?.label || status}
                                        </span>
                                      </td>
                                      <td style={{ padding: '8px' }}>
                                        {activeCautela ? (
                                          <div>
                                            👤 <strong>{activeCautela.policial_nome}</strong> 
                                            <span style={{ fontSize: '10px', color: '#718096', marginLeft: '4px' }}>(Matrícula: {activeCautela.matricula || '—'})</span>
                                          </div>
                                        ) : (
                                          <span style={{ color: '#a0aec0', fontStyle: 'italic' }}>Estoque Central</span>
                                        )}
                                      </td>
                                      <td style={{ padding: '8px' }}>
                                        {activeCautela ? (
                                          <div>{activeCautela.lotacao} <span style={{ fontSize: '10px', color: '#718096' }}>({activeCautela.depto})</span></div>
                                        ) : (
                                          <span style={{ color: '#a0aec0' }}>Estoque Central Geral</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          // Table of bulk cautelas (e.g. ammunition, uniform allotments)
                          (() => {
                            const activeBulkCautelas = allCautelas.filter(c => c.status === 'Ativa' && c.item_id === item.id);
                            if (activeBulkCautelas.length === 0) {
                              return (
                                <div style={{ textAlign: 'center', padding: '20px', color: '#a0aec0', fontSize: '12px', border: '1px dashed #cbd5e0', borderRadius: '4px' }}>
                                  Este item é controlado em lote. Todo o volume total ({qtyTotal} un.) está disponível no estoque e nenhuma unidade está cautelada atualmente.
                                </div>
                              );
                            }
                            return (
                              <div className="table-wrap" style={{ margin: 0, maxHeight: '250px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr style={{ backgroundColor: '#f7fafc' }}>
                                      <th style={{ padding: '8px' }}>Quantidade Emitida</th>
                                      <th style={{ padding: '8px' }}>Portador</th>
                                      <th style={{ padding: '8px' }}>Destino (Lotação / Departamento)</th>
                                      <th style={{ padding: '8px' }}>Data de Emissão</th>
                                      <th style={{ padding: '8px' }}>Tipo de Carga</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {activeBulkCautelas.map(c => (
                                      <tr key={c.id}>
                                        <td style={{ padding: '8px', fontWeight: 'bold', color: '#2b6cb0' }}>{c.qtd || 1} un.</td>
                                        <td style={{ padding: '8px' }}>
                                          👤 <strong>{c.policial_nome}</strong> 
                                          <span style={{ fontSize: '10px', color: '#718096', marginLeft: '4px' }}>(Matrícula: {c.matricula || '—'})</span>
                                        </td>
                                        <td style={{ padding: '8px' }}>{c.lotacao} <span style={{ fontSize: '10px', color: '#718096' }}>({c.depto})</span></td>
                                        <td style={{ padding: '8px' }}>{formatLocalDate(c.data_cautela)}</td>
                                        <td style={{ padding: '8px' }}>
                                          <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                                            {c.tipo_cautela || 'Temporária'}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
