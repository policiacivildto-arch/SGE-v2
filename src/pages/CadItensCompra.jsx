import React, { useState, useEffect, useMemo } from 'react';
import { apiService } from '../services/api';
import Modal from '../components/Modal';
import { PECAS_GLOCK_LIST, PECAS_SIG_SAUER_LIST, getSubtiposForCalibre, extractSubtipoFromDesc } from '../constants/inventoryData';
import { useAuth } from '../context/AuthContext';

export const formatCurrencyInput = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    if (isNaN(val) || val === 0) return '';
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  let str = String(val).trim();
  if (!str) return '';

  str = str.replace(/\./g, '');
  const hasComma = str.includes(',');
  if (hasComma) {
    str = str.replace(',', '#');
    str = str.replace(/,/g, '');
    str = str.replace('#', ',');
  }
  str = str.replace(/[^\d,]/g, '');
  if (!str) return '';

  const parts = str.split(',');
  let intPart = parts[0];
  let decPart = parts[1];

  if (intPart) {
    intPart = intPart.replace(/^0+(?=\d)/, '');
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  } else {
    intPart = '0';
  }

  if (decPart !== undefined) {
    decPart = decPart.slice(0, 2);
    return `${intPart},${decPart}`;
  }

  return intPart;
};

export const parseCurrencyBRL = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const clean = String(val).replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

function generateSequentialString(baseStr, index) {
  if (!baseStr) return "";
  const match = baseStr.match(/^(.*?)([0-9]+)$/);
  if (match) {
    const prefix = match[1];
    const numStr = match[2];
    const numLength = numStr.length;
    const startNum = parseInt(numStr, 10);
    const currentNum = startNum + index;
    const currentNumStr = String(currentNum).padStart(numLength, "0");
    return prefix + currentNumStr;
  }
  return `${baseStr}-${String(index + 1).padStart(3, "0")}`;
}

function getSequencePreview(baseStr, qty) {
  if (!baseStr || qty <= 0) return "";
  if (qty === 1) return baseStr;
  const start = baseStr;
  const end = generateSequentialString(baseStr, qty - 1);
  return `${start} a ${end}`;
}

const calcularQtdMin = (categoria, tipo, qtdTotal) => {
  const total = Number(qtdTotal || 0);
  if (!total || total <= 0) return 0;
  
  const cat = (categoria || '').toLowerCase().trim();
  const t = (tipo || '').toLowerCase().trim();
  
  if (cat === 'armas') {
    return Math.ceil(total * 0.05);
  } else if (cat === 'munições' || cat === 'municoes') {
    return Math.ceil(total * 0.20);
  } else if (cat === 'coletes' || cat === 'coletes balísticos' || cat === 'coletes balisticos') {
    return Math.ceil(total * 0.15);
  } else if (cat === 'uniformes' || cat === 'uniformes e enxoval') {
    return Math.ceil(total * 0.15);
  } else if (t === 'algema' || t === 'algemas' || (cat === 'equipamentos' && t.includes('algema'))) {
    return Math.ceil(total * 0.05);
  }
  return 0;
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

const ARMAS_LOOKUP = {
  Pistola: {
    GLOCK: {
      G17: { calibre: '9mm', comp_cano: '114 mm', capacidade: '17', carregadores: '3' },
      G19: { calibre: '9mm', comp_cano: '102 mm', capacidade: '15', carregadores: '3' },
      G26: { calibre: '9mm', comp_cano: '87 mm', capacidade: '10', carregadores: '3' },
    },
    'SIG SAUER': {
      P320: {
        '9mm': { calibre: '9mm', comp_cano: '120 mm', capacidade: '17', carregadores: '3' },
        '.40': { calibre: '.40', comp_cano: '120 mm', capacidade: '14', carregadores: '3' },
      },
    },
    TAURUS: {
      'PT-100': { calibre: '.40', comp_cano: '125 mm', capacidade: '13', carregadores: '3' },
      'PT-101': { calibre: '.40', comp_cano: '125 mm', capacidade: '13', carregadores: '3' },
      'PT-640': { calibre: '.40', comp_cano: '83 mm', capacidade: '10', carregadores: '3' },
      'PT-840': { calibre: '.40', comp_cano: '108,6 mm', capacidade: '15', carregadores: '3' },
      'PT-940': { calibre: '.40', comp_cano: '98 mm', capacidade: '12', carregadores: '3' },
      'PT-24/7': { calibre: '.40', comp_cano: '108,6 mm', capacidade: '15', carregadores: '3' },
    },
    BERETTA: {
      APX: { calibre: '9mm', comp_cano: '108 mm', capacidade: '17', carregadores: '3' },
    },
  },
  'Revólver': {
    TAURUS: {
      Padrão: { calibre: '.38', comp_cano: 'Padrão', capacidade: '6', carregadores: '0' },
    },
  },
  'Fuzil': {
    'RADICAL FIREARMS': {
      'RF 14 5.56': { calibre: '5,56x45mm', comp_cano: '14,5 pol', capacidade: '30', carregadores: '4' },
    },
    IMBEL: {
      IA2: { calibre: '5,56x45mm', comp_cano: '453 mm', capacidade: '30', carregadores: '4' },
    },
    BUSHMASTER: {
      XM15E25: { calibre: '5,56x45mm', comp_cano: '14,5 pol', capacidade: '30', carregadores: '4' },
    },
  },
  'Fuzil Sniper': {
    ARMALITE: {
      AR10: { calibre: '7,62x51mm', comp_cano: '20 pol', capacidade: '30', carregadores: '4' },
    },
    IMBEL: {
      PSG1: { calibre: '7,62x51mm', comp_cano: '20 pol', capacidade: '20', carregadores: '4' },
    },
  },
  Carabina: {
    'SIG SAUER': {
      MPX: { calibre: '9mm', comp_cano: '8 pol', capacidade: '30', carregadores: '4' },
    },
    TAURUS: {
      'CT .40': { calibre: '.40', comp_cano: '200 mm', capacidade: '30', carregadores: '4' },
      'CTT .40': { calibre: '.40', comp_cano: '200 mm', capacidade: '30', carregadores: '4' },
      'SMT .40': { calibre: '.40', comp_cano: '200 mm', capacidade: '30', carregadores: '4' },
      'MT 9mm': { calibre: '9mm', comp_cano: '200 mm', capacidade: '30', carregadores: '4' },
      'MT .40': { calibre: '.40', comp_cano: '200 mm', capacidade: '30', carregadores: '4' },
      MT12: { calibre: '9mm', comp_cano: '200 mm', capacidade: '30', carregadores: '4' },
    },
    HK: {
      MP5KA4: { calibre: '9mm', comp_cano: '115 mm', capacidade: '30', carregadores: '4' },
      MP5A5: { calibre: '9mm', comp_cano: '225 mm', capacidade: '30', carregadores: '4' },
    },
    INA: {
      MB50: { calibre: '.45', comp_cano: '220 mm', capacidade: '25', carregadores: '4' },
    },
  },
  Espingarda: {
    BENELLI: {
      M3A1: { calibre: '12', comp_cano: '18,5 pol', capacidade: '7', carregadores: '0' },
    },
    CBC: {
      586: { calibre: '12', comp_cano: '19 pol', capacidade: '8', carregadores: '0' },
      151: { calibre: '12', comp_cano: '20 pol', capacidade: '8', carregadores: '0' },
      '586P': { calibre: '12', comp_cano: '19 pol', capacidade: '8', carregadores: '0' },
    },
    BOITO: {
      'BSA 5T 84': { calibre: '12', comp_cano: '20 pol', capacidade: '8', carregadores: '0' },
    },
    ROSSI: {
      OVERLAND: { calibre: '12', comp_cano: '20 pol', capacidade: '2', carregadores: '0' },
    },
  },
};

const getGunSpecs = (tipoVal, marcaVal, modeloVal, calibreVal) => {
  if (!tipoVal || !marcaVal || !modeloVal) return null;
  const gunTypeKey = Object.keys(ARMAS_LOOKUP).find(k => String(k).toLowerCase() === String(tipoVal).toLowerCase());
  const gunType = gunTypeKey ? ARMAS_LOOKUP[gunTypeKey] : null;
  if (!gunType) return null;
  const gunBrandKey = Object.keys(gunType).find(k => String(k).toLowerCase() === String(marcaVal).toLowerCase());
  const gunBrand = gunBrandKey ? gunType[gunBrandKey] : null;
  if (!gunBrand) return null;
  const gunModelKey = Object.keys(gunBrand).find(k => String(k).toLowerCase() === String(modeloVal).toLowerCase());
  let gunModel = gunModelKey ? gunBrand[gunModelKey] : null;
  if (!gunModel) return null;
  if (calibreVal && gunModel[calibreVal]) {
    gunModel = gunModel[calibreVal];
  } else if (Object.keys(gunModel).some(key => ['9mm', '.40', '5,56x45mm', '7,62x51mm', '12', '.45', '.38'].includes(key))) {
    const firstCalibre = Object.keys(gunModel)[0];
    gunModel = gunModel[firstCalibre];
  }
  return gunModel;
};

function CadItensCompra() {
  const { can, currentUser } = useAuth();
  const [compras, setCompras] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [inventoryItens, setInventoryItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [compras, search]);

  const totalPages = Math.ceil(compras.length / itemsPerPage) || 1;
  const paginatedCompras = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return compras.slice(start, start + itemsPerPage);
  }, [compras, currentPage]);

  // Modal control
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: '', data: null });

  // Form State
  const [form, setForm] = useState({
    fornecedor_id: '',
    categoria: '',
    tipo: '',
    marca: '',
    modelo: '',
    descricao: '',
    numero_nota_fiscal: '',
    numero_empenho: '',
    numero_tombo: '', // used as patrimonio
    serie: '',
    qtd_total: '',
    qtd_min: '',
    valor_compra: '',
    dt_aq: '',
    dt_val: '',
    obs: '',
    status: 'Aguardando Lançamento',
    calibre: '',
    subtipo: '',
    nivel: '',
    tamanho: '',
    sexo: '',
    cargo: '',
    comprimento_cano: '',
    capacidade: '',
    quantidade_carregadores: '',
    tipo_municao: 'Operacional',
    tipo_radio: '',
    terminal_iss: '',
    qtd_baterias: '',
    prefixo_viatura: '',
    placa_viatura: ''
  });

  // Selection states (for creating new vs choosing existing)
  const [isCustomTipo, setIsCustomTipo] = useState(false);
  const [customTipo, setCustomTipo] = useState('');

  const [isCustomMarca, setIsCustomMarca] = useState(false);
  const [customMarca, setCustomMarca] = useState('');

  const [isCustomModelo, setIsCustomModelo] = useState(false);
  const [customModelo, setCustomModelo] = useState('');

  const [isCustomDescricao, setIsCustomDescricao] = useState(false);
  const [customDescricao, setCustomDescricao] = useState('');

  const [isCustomTipoRadio, setIsCustomTipoRadio] = useState(false);
  const [customTipoRadio, setCustomTipoRadio] = useState('');

  const [isCustomTerminalIss, setIsCustomTerminalIss] = useState(false);
  const [customTerminalIss, setCustomTerminalIss] = useState('');

  const [isCustomQtdBaterias, setIsCustomQtdBaterias] = useState(false);
  const [customQtdBaterias, setCustomQtdBaterias] = useState('');

  const [isCustomPrefixoViatura, setIsCustomPrefixoViatura] = useState(false);
  const [customPrefixoViatura, setCustomPrefixoViatura] = useState('');

  const [isCustomPlacaViatura, setIsCustomPlacaViatura] = useState(false);
  const [customPlacaViatura, setCustomPlacaViatura] = useState('');

  const [isCustomTamanho, setIsCustomTamanho] = useState(false);
  const [customTamanho, setCustomTamanho] = useState('');

  const [isCustomCargo, setIsCustomCargo] = useState(false);
  const [customCargo, setCustomCargo] = useState('');

  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState('');

  const [isBulkLaunch, setIsBulkLaunch] = useState(false);
  const [bulkRows, setBulkRows] = useState([
    { tamanho: '', customTamanho: '', isCustomTamanho: false, sexo: '', cargo: '', customCargo: '', isCustomCargo: false, qtd_total: 1 }
  ]);

  // Fornecedor custom states
  const [isCustomFornecedor, setIsCustomFornecedor] = useState(false);
  const [customFornecedor, setCustomFornecedor] = useState('');

  // Built-in standard defaults by category
  const categoryDefaults = {
    'Armas': {
      tipos: ['Pistola', 'Fuzil', 'Fuzil Sniper', 'Carabina', 'Espingarda', 'Revólver'],
      marcas: ['Glock', 'Taurus', 'Sig Sauer', 'Imbel', 'Beretta', 'Colt', 'Smith & Wesson', 'CZ', 'Benelli', 'Boito', 'Rossi', 'Radical Firearms', 'Bushmaster', 'Armalite', 'HK', 'Ina', 'CBC'],
      modelos: ['G17', 'G19', 'G26', 'P320', 'PT-100', 'PT-101', 'PT-640', 'PT-840', 'PT-940', 'PT-24/7', 'APX', 'RF 14 5.56', 'IA2', 'XM15E25', 'AR10', 'PSG1', 'MPX', 'CT .40', 'CTT .40', 'SMT .40', 'MT 9mm', 'MT .40', 'MT12', 'MP5KA4', 'MP5A5', 'MB50', 'M3A1', '586', '151', '586P', 'BSA 5T 84', 'OVERLAND', 'Padrão']
    },
    'Coletes Balísticos': {
      tipos: ['Colete Balístico'],
      marcas: ['PROTECTA', 'INBRALAND', 'Condor', 'Glágio', 'Inbra', 'CBC', 'Padrão'],
      modelos: ['IIIA', 'III-A', 'II', 'Padrão']
    },
    'Equipamentos': {
      tipos: ['Rádio HT', 'Drones', 'Detector de Metal', 'Algema', 'Kit Arrombamento', 'Distintivo'],
      marcas: ['Condor', 'Motorola', 'Hytera', 'DJI', 'Invictus', 'Padrão'],
      modelos: ['CORRENTE', 'DOBRADIÇA', 'MAVIC MINI', 'MAVIC PRO', 'MAVIC 2 ENTERPRISE', 'MAVIC SPARK', 'PHANTOM 4 PRO', 'MATRICE 300', 'MAVIC 3 PRO', 'MAVIC MINI 2', 'PHANTOM 4 ADVANCED', 'PHANTOM 1', 'MAVIC 3T', 'EP450', 'Padrão']
    },
    'Uniformes': {
      tipos: ['Calça Tática', 'Camisa Gola Polo', 'Cinto Operacional', 'Jaqueta Tática', 'Capa de Chuva', 'Bota Tática'],
      marcas: ['Invictus', 'Atack', 'Feline', 'Padrão'],
      modelos: ['Ripstop', 'Cano Curto', 'Cano Médio', 'Cano Longo', 'BDU', 'Cinto de Guarnição', 'Padrão']
    },
    'Munições': {
      tipos: ['Munição'],
      marcas: ['CBC', 'Federal', 'Magtech'],
      modelos: ['9mm', '.40 S&W', '.380 ACP', '.38 SPL', '12GA', '5.56x45mm', '7.62x51mm', 'Padrão']
    },
    'Peças Glock': {
      tipos: ['Peça de Reposição'],
      marcas: ['Glock'],
      modelos: ['Peça de Reposição']
    },
    'Peças Sig Sauer': {
      tipos: ['Peça de Reposição'],
      marcas: ['Sig Sauer'],
      modelos: ['Peça de Reposição']
    }
  };

  const ARMAS_TIPO_MARCA_MAP = {
    Pistola: {
      'Glock': ['G17', 'G19', 'G26'],
      'Sig Sauer': ['P320'],
      'Taurus': ['PT-100', 'PT-101', 'PT-640', 'PT-840', 'PT-940', 'PT-24/7'],
      'Beretta': ['APX']
    },
    'Revolver': {
      'Taurus': ['Padrão']
    },
    'Revólver': {
      'Taurus': ['Padrão']
    },
    Fuzil: {
      'Radical Firearms': ['RF 14 5.56'],
      'Imbel': ['IA2'],
      'Bushmaster': ['XM15E25']
    },
    'Fuzil Sniper': {
      'Armalite': ['AR10'],
      'Imbel': ['PSG1']
    },
    Carabina: {
      'Sig Sauer': ['MPX'],
      'Taurus': ['CT .40', 'CTT .40', 'SMT .40', 'MT 9mm', 'MT .40', 'MT12'],
      'HK': ['MP5KA4', 'MP5A5'],
      'Ina': ['MB50']
    },
    Espingarda: {
      'Benelli': ['M3A1'],
      'CBC': ['586', '151', '586P'],
      'Boito': ['BSA 5T 84'],
      'Rossi': ['OVERLAND']
    }
  };

  const uniqueTipos = useMemo(() => {
    const defaults = categoryDefaults[form.categoria]?.tipos || [];
    const set = new Set(defaults);
    compras.forEach(c => { if (c.categoria === form.categoria && c.tipo) set.add(c.tipo); });
    inventoryItens.forEach(i => { if (i.categoria === form.categoria && i.tipo) set.add(i.tipo); });
    return Array.from(set).sort();
  }, [compras, inventoryItens, form.categoria]);

  const getMarcasForTipo = (rowTipo) => {
    const tipoVal = rowTipo !== undefined ? rowTipo : (isCustomTipo ? customTipo : form.tipo);
    if (form.categoria === 'Armas' && tipoVal) {
      const tipoLower = String(tipoVal).toLowerCase().trim();
      const matchKey = Object.keys(ARMAS_TIPO_MARCA_MAP).find(k => k.toLowerCase() === tipoLower);
      if (matchKey) {
        const marcasMap = ARMAS_TIPO_MARCA_MAP[matchKey];
        const set = new Set(Object.keys(marcasMap));
        compras.forEach(c => { 
          if (c.categoria === form.categoria && String(c.tipo || '').toLowerCase().trim() === tipoLower && c.marca) {
            set.add(c.marca); 
          } 
        });
        inventoryItens.forEach(i => { 
          if (i.categoria === form.categoria && String(i.tipo || '').toLowerCase().trim() === tipoLower && i.marca) {
            set.add(i.marca); 
          } 
        });
        return Array.from(set).sort();
      }
    }

    const defaults = categoryDefaults[form.categoria]?.marcas || [];
    const set = new Set(defaults);
    compras.forEach(c => { if (c.categoria === form.categoria && c.marca) set.add(c.marca); });
    inventoryItens.forEach(i => { if (i.categoria === form.categoria && i.marca) set.add(i.marca); });
    return Array.from(set).sort();
  };

  const uniqueMarcas = useMemo(() => {
    return getMarcasForTipo(isCustomTipo ? customTipo : form.tipo);
  }, [compras, inventoryItens, form.categoria, form.tipo, isCustomTipo, customTipo]);

  const getModelosForTipoAndBrand = (rowTipo, brand) => {
    const selectedBrand = brand !== undefined ? brand : (isCustomMarca ? customMarca : form.marca);
    const tipoVal = rowTipo !== undefined ? rowTipo : (isCustomTipo ? customTipo : form.tipo);

    if (!selectedBrand) {
      if (form.categoria === 'Armas' && tipoVal) {
        const tipoLower = String(tipoVal).toLowerCase().trim();
        const matchTipoKey = Object.keys(ARMAS_TIPO_MARCA_MAP).find(k => k.toLowerCase() === tipoLower);
        if (matchTipoKey) {
          const brandsMap = ARMAS_TIPO_MARCA_MAP[matchTipoKey];
          const allModels = new Set();
          Object.values(brandsMap).forEach(arr => arr.forEach(m => allModels.add(m)));
          return Array.from(allModels).sort();
        }
      }
      return ['Padrão'];
    }

    const brandLower = selectedBrand.toLowerCase().trim();

    if (form.categoria === 'Armas' && tipoVal) {
      const tipoLower = String(tipoVal).toLowerCase().trim();
      const matchTipoKey = Object.keys(ARMAS_TIPO_MARCA_MAP).find(k => k.toLowerCase() === tipoLower);
      if (matchTipoKey) {
        const brandsMap = ARMAS_TIPO_MARCA_MAP[matchTipoKey];
        const matchBrandKey = Object.keys(brandsMap).find(k => k.toLowerCase() === brandLower);
        if (matchBrandKey) {
          const set = new Set(brandsMap[matchBrandKey]);
          compras.forEach(c => {
            if (c.categoria === form.categoria && 
                String(c.tipo || '').toLowerCase().trim() === tipoLower && 
                c.marca && c.marca.toLowerCase().trim() === brandLower && 
                c.modelo) {
              set.add(c.modelo);
            }
          });
          inventoryItens.forEach(i => {
            if (i.categoria === form.categoria && 
                String(i.tipo || '').toLowerCase().trim() === tipoLower && 
                i.marca && i.marca.toLowerCase().trim() === brandLower && 
                i.modelo) {
              set.add(i.modelo);
            }
          });
          return Array.from(set).sort();
        }
      }
    }

    let defaults = [];
    if (form.categoria === 'Armas') {
      if (brandLower.includes('glock')) defaults = ['G17', 'G19', 'G26', 'Padrão'];
      else if (brandLower.includes('taurus')) defaults = ['PT-100', 'PT-101', 'PT-640', 'PT-840', 'PT-940', 'PT-24/7', 'Padrão'];
      else if (brandLower.includes('sig')) defaults = ['P320', 'MPX', 'Padrão'];
      else if (brandLower.includes('imbel')) defaults = ['IA2', 'Padrão'];
      else defaults = ['Padrão'];
    } else if (form.categoria === 'Coletes Balísticos') {
      defaults = ['III-A', 'II', 'Padrão'];
    } else if (form.categoria === 'Equipamentos') {
      if (tipoVal === 'Algema') defaults = ['CORRENTE', 'DOBRADIÇA', 'Padrão'];
      else if (tipoVal === 'Drones') defaults = ['MAVIC 3T', 'MAVIC MINI', 'MAVIC PRO', 'MAVIC 2 ENTERPRISE', 'MAVIC SPARK', 'PHANTOM 4 PRO', 'MATRICE 300', 'MAVIC 3 PRO', 'MAVIC MINI 2', 'PHANTOM 4 ADVANCED', 'PHANTOM 1'];
      else if (tipoVal === 'Rádio HT') defaults = ['EP450', 'Padrão'];
      else defaults = ['Padrão'];
    } else if (form.categoria === 'Uniformes') {
      if (tipoVal === 'Calça Tática') defaults = ['Ripstop', 'Padrão'];
      else if (tipoVal === 'Cinto Operacional') defaults = ['BDU', 'Cinto de Guarnição'];
      else if (tipoVal === 'Bota Tática') defaults = ['Cano Curto', 'Cano Médio', 'Cano Longo'];
      else defaults = ['Padrão'];
    } else if (form.categoria === 'Munições') {
      defaults = ['9mm', '.40 S&W', '.380 ACP', '.38 SPL', '12GA', '5.56x45mm', '7.62x51mm', 'Padrão'];
    } else {
      defaults = ['Padrão'];
    }

    const set = new Set(defaults);
    compras.forEach(c => {
      if (c.categoria === form.categoria && c.modelo) {
        if (c.marca && c.marca.toLowerCase().trim() === brandLower) {
          set.add(c.modelo);
        }
      }
    });
    inventoryItens.forEach(i => {
      if (i.categoria === form.categoria && i.modelo) {
        if (i.marca && i.marca.toLowerCase().trim() === brandLower) {
          set.add(i.modelo);
        }
      }
    });

    return Array.from(set).sort();
  };

  const uniqueModelos = useMemo(() => {
    return getModelosForTipoAndBrand(isCustomTipo ? customTipo : form.tipo, isCustomMarca ? customMarca : form.marca);
  }, [compras, inventoryItens, form.categoria, form.tipo, form.marca, isCustomMarca, customMarca, isCustomTipo, customTipo]);

  const uniqueDescricoes = useMemo(() => {
    const set = new Set();
    compras.forEach(c => { if (c.categoria === form.categoria && c.descricao) set.add(c.descricao); });
    inventoryItens.forEach(i => { if (i.categoria === form.categoria && i.descricao) set.add(i.descricao); });
    return Array.from(set).sort();
  }, [compras, inventoryItens, form.categoria]);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      const [comprasData, fornecedoresData, itensData] = await Promise.all([
        apiService.getList('compras', params),
        apiService.getList('fornecedores', new URLSearchParams({ page_size: '500' })),
        apiService.getList('itens', new URLSearchParams({ page_size: '500' }))
      ]);

      setCompras(comprasData.results || []);
      setFornecedores(fornecedoresData.results || []);
      setInventoryItens(itensData.results || []);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError('Não foi possível carregar os dados de compras e fornecedores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search]);

  // Automatic Description construction when tipo, marca, or modelo changes
  useEffect(() => {
    if (!isCustomDescricao && !editingId) {
      const cat = form.categoria;
      const isPecasGlock = cat === 'Peças Glock';
      const isPecasSigSauer = cat === 'Peças Sig Sauer';

      if (isPecasGlock || isPecasSigSauer) {
        const desc = [form.nomenclatura_tecnica, form.conjunto_funcional ? `(${form.conjunto_funcional})` : ''].filter(Boolean).join(' ');
        setForm(prev => ({
          ...prev,
          descricao: desc.toUpperCase()
        }));
      } else if (cat === 'Armas') {
        const tipoVal = isCustomTipo ? customTipo : form.tipo;
        const marcaVal = isCustomMarca ? customMarca : form.marca;
        const modeloVal = isCustomModelo ? customModelo : form.modelo;
        const calibreVal = form.calibre;
        
        const desc = [tipoVal, marcaVal, modeloVal, calibreVal].filter(Boolean).join(' ');
        setForm(prev => ({
          ...prev,
          descricao: desc.toUpperCase()
        }));
      } else if (cat === 'Coletes Balísticos') {
        const marcaVal = isCustomMarca ? customMarca : form.marca;
        const nivelVal = form.nivel ? `Nível ${form.nivel}` : '';
        const tamanhoVal = form.tamanho ? `Tam ${form.tamanho}` : '';
        const sexoVal = form.sexo;
        
        const desc = ['Colete', marcaVal, nivelVal, tamanhoVal, sexoVal].filter(Boolean).join(' ');
        setForm(prev => ({
          ...prev,
          descricao: desc.toUpperCase()
        }));
      } else if (cat === 'Uniformes') {
        const tipoVal = isCustomTipo ? customTipo : form.tipo;
        const sexoVal = form.sexo;
        const tamanhoVal = isCustomTamanho ? customTamanho : form.tamanho;
        const cargoVal = isCustomCargo ? customCargo : form.cargo;
        
        const desc = [tipoVal, sexoVal, tamanhoVal, cargoVal].filter(Boolean).join(' ');
        setForm(prev => ({
          ...prev,
          descricao: desc.toUpperCase()
        }));
      } else if (cat === 'Equipamentos' && (isCustomTipo ? customTipo : form.tipo) === 'Distintivo') {
        const tipoVal = isCustomTipo ? customTipo : form.tipo;
        const cargoVal = isCustomCargo ? customCargo : form.cargo;
        
        const desc = [tipoVal, cargoVal].filter(Boolean).join(' ');
        setForm(prev => ({
          ...prev,
          descricao: desc.toUpperCase()
        }));
      } else if (cat === 'Munições' || cat === 'Municoes') {
        const calibreVal = form.calibre;
        const subtipoVal = form.subtipo;
        const tipoMunicaoVal = form.tipo_municao || 'Operacional';
        const marcaVal = isCustomMarca ? customMarca : form.marca;
        
        const desc = ['Munição', calibreVal, subtipoVal, tipoMunicaoVal, marcaVal].filter(Boolean).join(' ');
        setForm(prev => ({
          ...prev,
          descricao: desc.toUpperCase()
        }));
      } else {
        const tipoVal = isCustomTipo ? customTipo : form.tipo;
        const marcaVal = isCustomMarca ? customMarca : form.marca;
        const modeloVal = isCustomModelo ? customModelo : form.modelo;
        
        const parts = [];
        if (tipoVal) parts.push(tipoVal.trim());
        if (marcaVal) parts.push(marcaVal.trim());
        if (modeloVal) parts.push(modeloVal.trim());
        
        setForm(prev => ({
          ...prev,
          descricao: parts.join(' ').toUpperCase()
        }));
      }
    }
  }, [
    form.tipo, form.marca, form.modelo, form.categoria, form.nomenclatura_tecnica, form.conjunto_funcional,
    form.calibre, form.subtipo, form.nivel, form.tamanho, form.sexo, form.cargo, form.tipo_municao,
    isCustomTipo, customTipo, isCustomMarca, customMarca, isCustomModelo, customModelo, isCustomDescricao, editingId,
    isCustomTamanho, customTamanho, isCustomCargo, customCargo
  ]);

  useEffect(() => {
    if (form.categoria === 'Munições' || form.categoria === 'Municoes') {
      const targetModelo = [form.calibre, form.subtipo].filter(Boolean).join(' ');
      setForm(prev => {
        if (prev.modelo !== targetModelo) {
          return { ...prev, modelo: targetModelo };
        }
        return prev;
      });
    }
  }, [form.categoria, form.calibre, form.subtipo]);

  // Weapon Specs Auto-fill
  useEffect(() => {
    if (form.categoria !== 'Armas') return;
    const tipoVal = isCustomTipo ? customTipo : form.tipo;
    const marcaVal = isCustomMarca ? customMarca : form.marca;
    const modeloVal = isCustomModelo ? customModelo : form.modelo;

    if (!tipoVal || !marcaVal || !modeloVal) return;

    const gunTypeKey = Object.keys(ARMAS_LOOKUP).find(k => k.toLowerCase() === tipoVal.toLowerCase());
    const gunType = gunTypeKey ? ARMAS_LOOKUP[gunTypeKey] : null;
    if (gunType) {
      const gunBrandKey = Object.keys(gunType).find(k => k.toLowerCase() === marcaVal.toLowerCase());
      const gunBrand = gunBrandKey ? gunType[gunBrandKey] : null;
      if (gunBrand) {
        const gunModelKey = Object.keys(gunBrand).find(k => k.toLowerCase() === modeloVal.toLowerCase());
        let gunModel = gunModelKey ? gunBrand[gunModelKey] : null;
        if (gunModel) {
          // Se for aninhado por calibre (por ex. P320 tem '9mm' e '.40')
          if (form.calibre && gunModel[form.calibre]) {
            gunModel = gunModel[form.calibre];
          } else if (Object.keys(gunModel).some(key => ['9mm', '.40', '5,56x45mm', '7,62x51mm', '12', '.45', '.38'].includes(key))) {
            const firstCalibre = Object.keys(gunModel)[0];
            gunModel = gunModel[firstCalibre];
          }

          setForm((prev) => {
            const updates = {};
            if (!prev.calibre || prev.calibre === '') {
              updates.calibre = gunModel.calibre;
            }
            if (!prev.comprimento_cano || prev.comprimento_cano === '') {
              updates.comprimento_cano = gunModel.comp_cano;
            }
            if (!prev.capacidade || prev.capacidade === '') {
              updates.capacidade = gunModel.capacidade;
            }
            if (tipoVal !== 'Revolver' && tipoVal !== 'Revólver' && (!prev.quantidade_carregadores || prev.quantidade_carregadores === '')) {
              updates.quantidade_carregadores = gunModel.carregadores;
            }
            if (Object.keys(updates).length > 0) {
              return { ...prev, ...updates };
            }
            return prev;
          });
        }
      }
    }
  }, [form.tipo, form.marca, form.modelo, form.categoria, form.calibre, isCustomTipo, customTipo, isCustomMarca, customMarca, isCustomModelo, customModelo]);

  const handleOpenNew = () => {
    setEditingId(null);
    setForm({
      fornecedor_id: '',
      categoria: '',
      tipo: '',
      marca: '',
      modelo: '',
      descricao: '',
      numero_nota_fiscal: '',
      numero_empenho: '',
      numero_tombo: '',
      serie: '',
      qtd_total: '',
      qtd_min: '',
      valor_compra: '',
      dt_aq: new Date().toISOString().split('T')[0],
      dt_val: '',
      obs: '',
      status: 'Aguardando Lançamento',
      id_peca: '',
      conjunto_funcional: '',
      nomenclatura_tecnica: '',
      funcao_logistica: '',
      calibre: '',
      subtipo: '',
      nivel: '',
      tamanho: '',
      sexo: '',
      cargo: '',
      comprimento_cano: '',
      capacidade: '',
      quantidade_carregadores: '',
      lote: '',
      tipo_municao: 'Operacional',
      tipo_radio: '',
      terminal_iss: '',
      qtd_baterias: '',
      prefixo_viatura: '',
      placa_viatura: ''
    });

    setIsCustomTipo(false);
    setCustomTipo('');
    setIsCustomMarca(false);
    setCustomMarca('');
    setIsCustomModelo(false);
    setCustomModelo('');
    setIsCustomDescricao(false);
    setCustomDescricao('');
    setIsCustomTipoRadio(false);
    setCustomTipoRadio('');
    setIsCustomTerminalIss(false);
    setCustomTerminalIss('');
    setIsCustomQtdBaterias(false);
    setCustomQtdBaterias('');
    setIsCustomPrefixoViatura(false);
    setCustomPrefixoViatura('');
    setIsCustomPlacaViatura(false);
    setCustomPlacaViatura('');
    setIsCustomTamanho(false);
    setCustomTamanho('');
    setIsCustomCargo(false);
    setCustomCargo('');

    setIsCustomFornecedor(false);
    setCustomFornecedor('');
    setSelectedInventoryItemId('');

    setIsBulkLaunch(false);
    setBulkRows([{ tamanho: '', customTamanho: '', isCustomTamanho: false, sexo: '', cargo: '', customCargo: '', isCustomCargo: false, qtd_total: 1 }]);

    setIsModalOpen(true);
  };

  const handleOpenEdit = (comp) => {
    setEditingId(comp.id);
    setForm({
      fornecedor_id: comp.fornecedor_id || '',
      categoria: comp.categoria || '',
      tipo: comp.tipo || '',
      marca: comp.marca || '',
      modelo: comp.modelo || '',
      descricao: comp.descricao || '',
      numero_nota_fiscal: comp.numero_nota_fiscal || '',
      numero_empenho: comp.numero_empenho || '',
      numero_tombo: comp.numero_tombo || '',
      serie: comp.serie || '',
      qtd_total: comp.qtd_total !== undefined && comp.qtd_total !== null ? String(comp.qtd_total) : '',
      qtd_min: comp.qtd_min || '',
      valor_compra: comp.valor_compra ? formatCurrencyInput(comp.valor_compra) : '',
      dt_aq: comp.dt_aq || '',
      dt_val: comp.dt_val || '',
      obs: comp.obs || '',
      status: comp.status || 'Aguardando Lançamento',
      id_peca: comp.id_peca || '',
      conjunto_funcional: comp.conjunto_funcional || '',
      nomenclatura_tecnica: comp.nomenclatura_tecnica || '',
      funcao_logistica: comp.funcao_logistica || '',
      calibre: comp.calibre || '',
      subtipo: comp.subtipo || extractSubtipoFromDesc(comp.descricao || comp.modelo) || '',
      nivel: comp.nivel || '',
      tamanho: comp.tamanho || '',
      sexo: comp.sexo || '',
      cargo: comp.cargo || '',
      comprimento_cano: comp.comprimento_cano || '',
      capacidade: comp.capacidade || '',
      quantidade_carregadores: comp.quantidade_carregadores || '',
      tipo_municao: comp.tipo_municao || 'Operacional',
      tipo_radio: comp.tipo_radio || '',
      terminal_iss: comp.terminal_iss || '',
      qtd_baterias: comp.qtd_baterias || '',
      prefixo_viatura: comp.prefixo_viatura || '',
      placa_viatura: comp.placa_viatura || ''
    });

    // Determine custom status
    const tipoInOptions = uniqueTipos.includes(comp.tipo);
    if (comp.tipo && !tipoInOptions) {
      setIsCustomTipo(true);
      setCustomTipo(comp.tipo);
    } else {
      setIsCustomTipo(false);
      setCustomTipo('');
    }

    const marcaInOptions = uniqueMarcas.includes(comp.marca);
    if (comp.marca && !marcaInOptions) {
      setIsCustomMarca(true);
      setCustomMarca(comp.marca);
    } else {
      setIsCustomMarca(false);
      setCustomMarca('');
    }

    const modeloInOptions = uniqueModelos.includes(comp.modelo);
    if (comp.modelo && !modeloInOptions) {
      setIsCustomModelo(true);
      setCustomModelo(comp.modelo);
    } else {
      setIsCustomModelo(false);
      setCustomModelo('');
    }

    const descInOptions = uniqueDescricoes.includes(comp.descricao);
    if (comp.descricao && !descInOptions) {
      setIsCustomDescricao(true);
      setCustomDescricao(comp.descricao);
    } else {
      setIsCustomDescricao(false);
      setCustomDescricao('');
    }

    if (comp.tipo_radio && !['Fixo', 'Móvel', 'HT'].includes(comp.tipo_radio)) {
      setIsCustomTipoRadio(true);
      setCustomTipoRadio(comp.tipo_radio);
    } else {
      setIsCustomTipoRadio(false);
      setCustomTipoRadio('');
    }

    if (comp.terminal_iss && !['Padrão'].includes(comp.terminal_iss)) {
      setIsCustomTerminalIss(true);
      setCustomTerminalIss(comp.terminal_iss);
    } else {
      setIsCustomTerminalIss(false);
      setCustomTerminalIss('');
    }

    if (comp.qtd_baterias && !['1', '2', '3', '4'].includes(comp.qtd_baterias)) {
      setIsCustomQtdBaterias(true);
      setCustomQtdBaterias(comp.qtd_baterias);
    } else {
      setIsCustomQtdBaterias(false);
      setCustomQtdBaterias('');
    }

    if (comp.prefixo_viatura && !['Padrão'].includes(comp.prefixo_viatura)) {
      setIsCustomPrefixoViatura(true);
      setCustomPrefixoViatura(comp.prefixo_viatura);
    } else {
      setIsCustomPrefixoViatura(false);
      setCustomPrefixoViatura('');
    }

    if (comp.placa_viatura && !['Padrão'].includes(comp.placa_viatura)) {
      setIsCustomPlacaViatura(true);
      setCustomPlacaViatura(comp.placa_viatura);
    } else {
      setIsCustomPlacaViatura(false);
      setCustomPlacaViatura('');
    }

    if (comp.cargo && !['Delegado', 'Delegada', 'Inspetor', 'Escrivão', 'Oficial Investigador', 'Oficial Investigadora', 'DPC', 'OIP', 'IPC', 'EPC'].includes(comp.cargo)) {
      setIsCustomCargo(true);
      setCustomCargo(comp.cargo);
    } else {
      setIsCustomCargo(false);
      setCustomCargo('');
    }

    if (comp.tamanho && !['PP', 'P', 'M', 'G', 'GG', 'EG', 'XG', '38', '40', '42', '44', '46', '48', '50', '52', '33', '34', '35', '36', '37', '39', '41', '43', '45', '47'].includes(comp.tamanho)) {
      setIsCustomTamanho(true);
      setCustomTamanho(comp.tamanho);
    } else {
      setIsCustomTamanho(false);
      setCustomTamanho('');
    }

    setIsCustomFornecedor(false);
    setCustomFornecedor('');

    // Find and set matching inventory item
    const matchingItem = inventoryItens.find(i => 
      String(i.categoria || "").trim().toLowerCase() === String(comp.categoria || "").trim().toLowerCase() &&
      String(i.descricao || "").trim().toLowerCase() === String(comp.descricao || "").trim().toLowerCase()
    );
    setSelectedInventoryItemId(matchingItem ? matchingItem.id : '');

    setIsBulkLaunch(false);
    setBulkRows([{ tamanho: '', customTamanho: '', isCustomTamanho: false, sexo: '', cargo: '', customCargo: '', isCustomCargo: false, qtd_total: 1 }]);

    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      let finalFornecedorId = form.fornecedor_id;

      if (isCustomFornecedor) {
        if (!customFornecedor.trim()) {
          alert('O nome do fornecedor é obrigatório.');
          return;
        }
        const newForn = await apiService.create('fornecedores', {
          nome: customFornecedor.trim(),
          cnpj: '',
          contato: 'Cadastro Rápido',
          tel: '',
          email: '',
          categoria: form.categoria
        });
        finalFornecedorId = newForn.id;
      } else if (!finalFornecedorId) {
        alert('O fornecedor é obrigatório.');
        return;
      }

      const isColetes = form.categoria === 'Coletes Balísticos' || form.categoria === 'Coletes Balisticos';
      const isUniformes = form.categoria === 'Uniformes';
      const isArmas = form.categoria === 'Armas';
      const isMunicoesc = form.categoria === 'Munições' || form.categoria === 'Municoes';
      const isEquip = form.categoria === 'Equipamentos';

      const finalTipo = isCustomTipo ? customTipo : form.tipo;
      const finalMarca = isCustomMarca ? customMarca : form.marca;
      const finalModelo = isCustomModelo ? customModelo : form.modelo;

      const finalTipoRadio = isCustomTipoRadio ? customTipoRadio : form.tipo_radio;
      const finalTerminalIss = isCustomTerminalIss ? customTerminalIss : form.terminal_iss;
      const finalQtdBaterias = isCustomQtdBaterias ? customQtdBaterias : form.qtd_baterias;
      const finalPrefixoViatura = isCustomPrefixoViatura ? customPrefixoViatura : form.prefixo_viatura;
      const finalPlacaViatura = isCustomPlacaViatura ? customPlacaViatura : form.placa_viatura;

      if (isBulkLaunch && !editingId) {
        // Validate each row in the bulk rows list
        for (let i = 0; i < bulkRows.length; i++) {
          const row = bulkRows[i];
          const rowTipo = row.isCustomTipo ? row.customTipo : (row.tipo || form.tipo || (uniqueTipos[0] || ''));
          const finalTam = row.isCustomTamanho ? row.customTamanho : row.tamanho;
          const finalCg = row.isCustomCargo ? row.customCargo : row.cargo;
          const finalMod = row.isCustomModelo ? row.customModelo : row.modelo;

          if (!rowTipo && !isMunicoesc) {
            alert(`Linha ${i + 1}: Selecione o tipo de item.`);
            return;
          }

          if (isColetes) {
            if (!finalTam) {
              alert(`Linha ${i + 1}: Selecione o tamanho.`);
              return;
            }
            if (!row.sexo) {
              alert(`Linha ${i + 1}: Selecione o sexo.`);
              return;
            }
          } else if (isUniformes) {
            if (!finalTam) {
              alert(`Linha ${i + 1}: Selecione o tamanho.`);
              return;
            }
            const rTipoLower = String(rowTipo || '').toLowerCase();
            const rIsPolo = rTipoLower.includes('polo') || rTipoLower.includes('gandola');
            const rIsCalca = rTipoLower.includes('calça') || rTipoLower.includes('calca');
            const rIsJaqueta = rTipoLower.includes('jaqueta');
            const rIsCapa = rTipoLower.includes('capa');
            const rNeedsSexo = rIsPolo || rIsCalca || rIsJaqueta || rIsCapa;
            const rNeedsCargo = rIsPolo;

            if (rNeedsSexo && !row.sexo) {
              alert(`Linha ${i + 1}: Selecione o sexo.`);
              return;
            }
            if (rNeedsCargo && !finalCg) {
              alert(`Linha ${i + 1}: Selecione o cargo.`);
              return;
            }
          } else if (isArmas) {
            if (!finalMod && !form.modelo && !isCustomModelo) {
              alert(`Linha ${i + 1}: Selecione ou informe o modelo.`);
              return;
            }
            if (!row.calibre && !form.calibre) {
              alert(`Linha ${i + 1}: Selecione o calibre.`);
              return;
            }
          } else if (isEquip) {
            if (rowTipo === 'Distintivo') {
              if (!finalCg) {
                alert(`Linha ${i + 1}: Selecione o cargo.`);
                return;
              }
            } else {
              if (!finalMod && !form.modelo && !isCustomModelo && rowTipo !== 'Algema' && rowTipo !== 'Detector de Metal') {
                alert(`Linha ${i + 1}: Selecione ou informe o modelo/variação.`);
                return;
              }
            }
          } else if (isMunicoesc) {
            const cal = row.calibre || form.calibre;
            const sub = row.subtipo || form.subtipo;
            if (!cal) {
              alert(`Linha ${i + 1}: Selecione o calibre.`);
              return;
            }
            if (!sub) {
              alert(`Linha ${i + 1}: Selecione o subtipo/projétil.`);
              return;
            }
          } else if (isPecasGlock || isPecasSigSauer) {
            const pecaNom = row.nomenclatura_tecnica || row.modelo || form.nomenclatura_tecnica;
            if (!pecaNom) {
              alert(`Linha ${i + 1}: Selecione a peça/nomenclatura técnica.`);
              return;
            }
          }

          if (!row.qtd_total || Number(row.qtd_total) <= 0) {
            alert(`Linha ${i + 1}: A quantidade deve ser maior que 0.`);
            return;
          }
        }

        for (const row of bulkRows) {
          const rowTipo = row.isCustomTipo ? row.customTipo : (row.tipo || form.tipo || (uniqueTipos[0] || ''));
          const rowMarca = row.isCustomMarca ? row.customMarca : (row.marca || form.marca || (getMarcasForTipo(rowTipo)[0] || ''));
          const rowCargo = (isUniformes || (isEquip && rowTipo === 'Distintivo')) ? (row.isCustomCargo ? row.customCargo : (row.cargo || form.cargo || '')) : '';
          const rowTamanho = (isColetes || isUniformes) ? (row.isCustomTamanho ? row.customTamanho : (row.tamanho || form.tamanho || '')) : '';
          const rowSexo = (isColetes || isUniformes) ? (row.sexo || form.sexo || '') : '';
          const rowModelo = isMunicoesc ? '' : isColetes ? '' : (row.isCustomModelo ? row.customModelo : (row.modelo || form.modelo || ''));
          const rowQtd = Number(row.qtd_total || 1);
          const rowCalibre = (isArmas || isMunicoesc) ? (row.calibre || form.calibre || '') : '';
          const rowSubtipo = isMunicoesc ? (row.subtipo || form.subtipo || '') : '';
          const rowTipoMunicao = isMunicoesc ? (row.tipo_municao || form.tipo_municao || 'Operacional') : '';
          const rowNivel = isColetes ? (row.nivel || form.nivel || '') : '';
          const rowValorUnitario = parseCurrencyBRL(row.valor_compra !== undefined && row.valor_compra !== '' ? row.valor_compra : form.valor_compra);

          let rowDescricao = '';
          const marcaVal = rowMarca;
          const tipoVal = rowTipo;

          if (isColetes) {
            const nivelVal = rowNivel ? `Nível ${rowNivel}` : '';
            const tamanhoVal = rowTamanho ? `Tam ${rowTamanho}` : '';
            const desc = ['Colete', marcaVal, nivelVal, tamanhoVal, rowSexo].filter(Boolean).join(' ');
            rowDescricao = desc.toUpperCase();
          } else if (isUniformes) {
            const desc = [tipoVal, rowSexo, rowTamanho ? `TAM ${rowTamanho}` : '', rowCargo].filter(Boolean).join(' ');
            rowDescricao = desc.toUpperCase();
          } else if (isArmas) {
            const modVal = rowModelo;
            const calVal = rowCalibre;
            const desc = [tipoVal, marcaVal, modVal, calVal ? `CALIBRE ${calVal}` : ''].filter(Boolean).join(' ');
            rowDescricao = desc.toUpperCase();
          } else if (isEquip) {
            if (tipoVal === 'Distintivo') {
              const desc = [tipoVal, rowCargo].filter(Boolean).join(' ');
              rowDescricao = desc.toUpperCase();
            } else {
              const modVal = rowModelo;
              const desc = [tipoVal, marcaVal, modVal].filter(Boolean).join(' ');
              rowDescricao = desc.toUpperCase();
            }
          } else if (isMunicoesc) {
            const desc = ['Munição', rowCalibre, rowSubtipo, rowTipoMunicao, marcaVal].filter(Boolean).join(' ');
            rowDescricao = desc.toUpperCase();
          } else if (isPecasGlock || isPecasSigSauer) {
            const pecaMarca = form.categoria === 'Peças Glock' ? 'Glock' : 'Sig Sauer';
            const pecaNome = row.nomenclatura_tecnica || rowModelo || 'Peça';
            const pecaConj = row.conjunto_funcional ? `(${row.conjunto_funcional})` : '';
            const desc = [`Peça ${pecaMarca}`, pecaNome, pecaConj].filter(Boolean).join(' ');
            rowDescricao = desc.toUpperCase();
          } else {
            const desc = [form.categoria, tipoVal, marcaVal, rowModelo, rowTamanho].filter(Boolean).join(' ');
            rowDescricao = desc.toUpperCase();
          }

          const rowTombo = row.numero_tombo !== undefined && row.numero_tombo !== '' ? row.numero_tombo : (form.numero_tombo || '');
          const rowSerie = row.serie !== undefined && row.serie !== '' ? row.serie : (form.serie || '');
          const rowSpecs = isArmas ? getGunSpecs(tipoVal, marcaVal, rowModelo, rowCalibre) : null;
          const rowComprimentoCano = isArmas ? (row.comprimento_cano || form.comprimento_cano || rowSpecs?.comp_cano || '') : '';
          const rowCapacidade = isArmas ? (row.capacidade || form.capacidade || rowSpecs?.capacidade || '') : '';
          const rowCarregadores = isArmas ? (row.quantidade_carregadores !== undefined && row.quantidade_carregadores !== '' ? row.quantidade_carregadores : (form.quantidade_carregadores !== undefined && form.quantidade_carregadores !== '' ? form.quantidade_carregadores : (rowSpecs?.carregadores !== undefined ? rowSpecs.carregadores : ''))) : '';
          const rowTipoRadio = isEquip ? (row.isCustomTipoRadio ? row.customTipoRadio : (row.tipo_radio || form.tipo_radio || '')) : '';
          const rowTerminalIss = isEquip ? (row.terminal_iss || form.terminal_iss || '') : '';
          const rowQtdBaterias = isEquip ? (row.isCustomQtdBaterias ? row.customQtdBaterias : (row.qtd_baterias || form.qtd_baterias || '')) : '';
          const rowPrefixoViatura = isEquip ? (row.prefixo_viatura || form.prefixo_viatura || '') : '';
          const rowPlacaViatura = isEquip ? (row.placa_viatura || form.placa_viatura || '') : '';
          const rowIdPeca = (isPecasGlock || isPecasSigSauer) ? (row.id_peca || form.id_peca || '') : '';
          const rowFuncaoLogistica = (isPecasGlock || isPecasSigSauer) ? (row.funcao_logistica || form.funcao_logistica || '') : '';

          const payload = {
            ...form,
            fornecedor_id: finalFornecedorId,
            categoria: form.categoria,
            tipo: tipoVal || form.tipo,
            marca: marcaVal || form.marca,
            modelo: rowModelo,
            calibre: rowCalibre,
            lote: isMunicoesc ? (row.lote || form.lote || '') : (row.lote || form.lote || ''),
            subtipo: rowSubtipo,
            tipo_municao: rowTipoMunicao,
            nivel: rowNivel,
            id_peca: rowIdPeca,
            conjunto_funcional: row.conjunto_funcional || form.conjunto_funcional,
            nomenclatura_tecnica: row.nomenclatura_tecnica || form.nomenclatura_tecnica,
            funcao_logistica: rowFuncaoLogistica,
            cargo: rowCargo,
            tamanho: rowTamanho,
            sexo: rowSexo,
            comprimento_cano: rowComprimentoCano,
            capacidade: rowCapacidade,
            quantidade_carregadores: rowCarregadores,
            tipo_radio: rowTipoRadio,
            terminal_iss: rowTerminalIss,
            qtd_baterias: rowQtdBaterias,
            prefixo_viatura: rowPrefixoViatura,
            placa_viatura: rowPlacaViatura,
            numero_tombo: rowTombo,
            serie: rowSerie,
            descricao: rowDescricao,
            qtd_total: rowQtd,
            qtd_disp: rowQtd,
            qtd_min: calcularQtdMin(form.categoria, tipoVal, rowQtd),
            valor_compra: rowValorUnitario * rowQtd
          };

          await apiService.create('compras', payload);
        }

        setSuccess('Lançamento em lote cadastrado com sucesso!');
      } else {
        const finalCargo = (isUniformes || (isEquip && finalTipo === 'Distintivo')) ? (isCustomCargo ? customCargo : form.cargo) : '';
        const finalTamanho = (isColetes || isUniformes) ? (isCustomTamanho ? customTamanho : form.tamanho) : '';
        const finalSexo = (isColetes || isUniformes) ? (form.sexo || '') : '';
        const finalNivel = isColetes ? (form.nivel || '') : '';
        const finalModelo = isMunicoesc ? '' : isColetes ? '' : (isCustomModelo ? customModelo : form.modelo);
        const finalCalibre = (isArmas || isMunicoesc) ? (form.calibre || '') : '';
        const finalSubtipo = isMunicoesc ? (form.subtipo || extractSubtipoFromDesc(finalDescricao) || extractSubtipoFromDesc(form.modelo) || '') : '';
        const finalTipoMunicao = isMunicoesc ? (form.tipo_municao || 'Operacional') : '';
        const finalDescricao = isCustomDescricao ? customDescricao : form.descricao;

        if (!finalDescricao) {
          alert('A descrição é obrigatória.');
          return;
        }

        const payload = {
          ...form,
          fornecedor_id: finalFornecedorId,
          categoria: form.categoria,
          tipo: finalTipo,
          marca: finalMarca,
          modelo: finalModelo,
          calibre: finalCalibre,
          lote: isMunicoesc ? (form.lote || '') : (form.lote || ''),
          subtipo: finalSubtipo,
          tipo_municao: finalTipoMunicao,
          nivel: finalNivel,
          cargo: finalCargo,
          tamanho: finalTamanho,
          sexo: finalSexo,
          comprimento_cano: isArmas ? (form.comprimento_cano || '') : '',
          capacidade: isArmas ? (form.capacidade || '') : '',
          quantidade_carregadores: isArmas ? (form.quantidade_carregadores !== undefined ? form.quantidade_carregadores : '') : '',
          tipo_radio: isEquip ? finalTipoRadio : '',
          terminal_iss: isEquip ? finalTerminalIss : '',
          qtd_baterias: isEquip ? finalQtdBaterias : '',
          prefixo_viatura: isEquip ? finalPrefixoViatura : '',
          placa_viatura: isEquip ? finalPlacaViatura : '',
          descricao: finalDescricao,
          qtd_total: Number(form.qtd_total || 1),
          qtd_disp: Number(form.qtd_total || 1),
          qtd_min: calcularQtdMin(form.categoria, finalTipo, Number(form.qtd_total || 1)),
          valor_compra: parseCurrencyBRL(form.valor_compra)
        };

        if (editingId) {
          await apiService.update('compras', editingId, payload);
          setSuccess('Item de compra atualizado com sucesso.');
        } else {
          await apiService.create('compras', payload);
          setSuccess('Item de compra cadastrado com sucesso.');
        }
      }

      setIsModalOpen(false);
      loadData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      alert(err.message || 'Erro ao salvar o item de compra.');
    }
  };

  const handleDelete = (id) => {
    setConfirmModal({
      isOpen: true,
      type: 'delete',
      data: id
    });
  };

  const confirmDelete = async () => {
    const id = confirmModal.data;
    if (!id) return;
    try {
      await apiService.remove('compras', id);
      setSuccess('Item de compra removido.');
      setConfirmModal({ isOpen: false, type: '', data: null });
      loadData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      alert(err.message || 'Erro ao remover o item de compra.');
    }
  };

  // Launch item into inventory
  const handleLancarNoInventario = (comp) => {
    if (comp.status === 'Lançado no Inventário') {
      alert('Este item de compra já foi lançado no inventário.');
      return;
    }
    setConfirmModal({
      isOpen: true,
      type: 'lancar',
      data: comp
    });
  };

  const confirmLancarNoInventario = async () => {
    const comp = confirmModal.data;
    if (!comp) return;
    try {
      const isColetesComp = (comp.categoria === 'Coletes Balísticos' || comp.categoria === 'Coletes Balisticos');
      const isUniformesComp = comp.categoria === 'Uniformes';
      const isArmasComp = comp.categoria === 'Armas';
      const isMunicoesComp = (comp.categoria === 'Munições' || comp.categoria === 'Municoes');
      const isEquipComp = comp.categoria === 'Equipamentos';

      // Construct a valid payload for the "itens" resource
      const payload = {
        categoria: comp.categoria || 'Armas',
        marca: comp.marca || '',
        descricao: comp.descricao,
        patrimonio: comp.numero_tombo || '',
        serie: comp.serie || '',
        qtd_total: Number(comp.qtd_total || 1),
        qtd_disp: Number(comp.qtd_total || 1),
        qtd_min: calcularQtdMin(comp.categoria, comp.tipo, Number(comp.qtd_total || 1)),
        status: 'Disponivel',
        dt_aq: comp.dt_aq || '',
        dt_val: comp.dt_val || '',
        valor_compra: Number(comp.valor_compra || 0),
        obs: comp.obs || '',
        fornecedor_id: comp.fornecedor_id || '',
        tipo: comp.tipo || '',
        modelo: isMunicoesComp ? '' : isColetesComp ? '' : (comp.modelo || ''),
        calibre: (isArmasComp || isMunicoesComp) ? (comp.calibre || '') : '',
        subtipo: isMunicoesComp ? (comp.subtipo || extractSubtipoFromDesc(comp.descricao) || extractSubtipoFromDesc(comp.modelo) || '') : '',
        tipo_municao: isMunicoesComp ? (comp.tipo_municao || 'Operacional') : '',
        nivel: isColetesComp ? (comp.nivel || '') : '',
        tamanho: (isColetesComp || isUniformesComp) ? (comp.tamanho || '') : '',
        sexo: (isColetesComp || isUniformesComp) ? (comp.sexo || '') : '',
        cargo: (isUniformesComp || (isEquipComp && comp.tipo === 'Distintivo')) ? (comp.cargo || '') : '',
        comp_cano: isArmasComp ? (comp.comprimento_cano || '') : '',
        capacidade: isArmasComp ? (comp.capacidade || '') : '',
        carregadores: isArmasComp ? (comp.quantidade_carregadores || 0) : 0,
        compra_id: comp.id,
        // Piece-specific fields
        id_peca: comp.id_peca || '',
        conjunto_funcional: comp.conjunto_funcional || '',
        nomenclatura_tecnica: comp.nomenclatura_tecnica || '',
        funcao_logistica: comp.funcao_logistica || '',
        // Radio-specific fields
        tipo_radio: isEquipComp ? (comp.tipo_radio || '') : '',
        terminal_iss: isEquipComp ? (comp.terminal_iss || '') : '',
        qtd_baterias: isEquipComp ? (comp.qtd_baterias || '') : '',
        prefixo_viatura: isEquipComp ? (comp.prefixo_viatura || '') : '',
        placa_viatura: isEquipComp ? (comp.placa_viatura || '') : ''
      };

      // 1. Create the item in inventory
      await apiService.create('itens', payload);

      // 2. Update the status of the purchase record
      await apiService.update('compras', comp.id, {
        ...comp,
        status: 'Lançado no Inventário'
      });

      setSuccess(`"${comp.descricao}" foi lançado no inventário com sucesso!`);
      setConfirmModal({ isOpen: false, type: '', data: null });
      loadData();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      alert(err.message || 'Erro ao lançar item no inventário.');
    }
  };

  const getFornecedorNome = (id) => {
    const f = fornecedores.find(forn => forn.id === id);
    return f ? f.nome : '—';
  };

  const isPecasGlock = form.categoria === 'Peças Glock';
  const isPecasSigSauer = form.categoria === 'Peças Sig Sauer';
  const isUniformes = form.categoria === 'Uniformes';
  const isMunicoes = form.categoria === 'Munições' || form.categoria === 'Municoes';

  const tVal = String(form.tipo || '').toLowerCase();
  const isBota = tVal.includes('bota');
  const isCalca = tVal.includes('calça') || tVal.includes('calca');
  const isCinto = tVal.includes('cinto');
  const isPolo = tVal.includes('polo') || tVal.includes('gandola');
  const isJaqueta = tVal.includes('jaqueta');
  const isCapa = tVal.includes('capa');

  const showSexo = isPolo || isCalca;
  const showCargo = isPolo;
  const showModelo = !isJaqueta && !isCapa;
  const modeloLabel = isCalca ? 'Material' : 'Modelo';

  const isEligibleForBulk = Boolean(form.categoria) && form.categoria !== '';

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>🛍️ Lançamento de Itens de Compra</h1>
          <p>Insira novos itens adquiridos vinculando-os ao fornecedor correspondente, e lance-os no inventário de estoque.</p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenNew}>➕ Novo Item de Compra</button>
      </div>

      {error && <div className="alert alert-danger show">{error}</div>}
      {success && <div className="alert alert-success show">{success}</div>}

      <div className="card">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Buscar por descrição, nota fiscal, empenho, série..."
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e0', borderRadius: '6px', marginBottom: '16px' }}
        />

        {loading ? (
          <p style={{ color: '#718096', textAlign: 'center', padding: '20px' }}>Carregando dados das compras...</p>
        ) : compras.length === 0 ? (
          <p style={{ color: '#718096', textAlign: 'center', padding: '20px' }}>Nenhum item de compra registrado.</p>
        ) : (
          <>
            <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Fornecedor</th>
                  <th>Categoria</th>
                  <th>Tombo/Série</th>
                  <th>Nota / Empenho</th>
                  <th>Quantidade</th>
                  <th>Valor Total</th>
                  <th>Status</th>
                  <th style={{ width: '220px', textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCompras.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: '600', color: '#1a202c' }}>{c.descricao}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                        {c.marca && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Marca:</strong> {c.marca}</span>}
                        {c.modelo && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Mod:</strong> {c.modelo}</span>}
                        {c.calibre && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Calibre:</strong> {c.calibre}</span>}
                        {c.comprimento_cano && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Cano:</strong> {c.comprimento_cano}</span>}
                        {c.capacidade && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Capacidade:</strong> {c.capacidade}</span>}
                        {c.quantidade_carregadores !== undefined && c.quantidade_carregadores !== '' && c.quantidade_carregadores !== null && (
                          <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Carregadores:</strong> {c.quantidade_carregadores}</span>
                        )}
                        {c.nivel && (c.categoria === 'Coletes Balísticos' || c.categoria === 'Coletes Balisticos') && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Nível:</strong> {c.nivel}</span>}
                        {c.tamanho && (c.categoria === 'Coletes Balísticos' || c.categoria === 'Coletes Balisticos' || c.categoria === 'Uniformes') && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Tam:</strong> {c.tamanho}</span>}
                        {c.sexo && (c.categoria === 'Coletes Balísticos' || c.categoria === 'Coletes Balisticos' || c.categoria === 'Uniformes') && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Sexo:</strong> {c.sexo}</span>}
                        {c.cargo && (c.categoria === 'Uniformes' || (c.categoria === 'Equipamentos' && c.tipo === 'Distintivo')) && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Cargo:</strong> {c.cargo}</span>}
                        {c.tipo_municao && (c.categoria === 'Munições' || c.categoria === 'Municoes') && (
                          <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Tipo:</strong> {c.tipo_municao}</span>
                        )}
                        {(c.subtipo || extractSubtipoFromDesc(c.descricao)) && (c.categoria === 'Munições' || c.categoria === 'Municoes') && (
                          <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Subtipo:</strong> {c.subtipo || extractSubtipoFromDesc(c.descricao)}</span>
                        )}
                        {c.tipo_radio && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Tipo Rádio:</strong> {c.tipo_radio}</span>}
                        {c.terminal_iss && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Terminal ISS:</strong> {c.terminal_iss}</span>}
                        {c.qtd_baterias && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Baterias:</strong> {c.qtd_baterias}</span>}
                        {c.prefixo_viatura && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Prefixo Vtr:</strong> {c.prefixo_viatura}</span>}
                        {c.placa_viatura && <span style={{ fontSize: '11px', color: '#4a5568' }}><strong>Placa Vtr:</strong> {c.placa_viatura}</span>}
                      </div>
                    </td>
                    <td>{getFornecedorNome(c.fornecedor_id)}</td>
                    <td><span className="badge badge-gray">{c.categoria}</span></td>
                    <td style={{ fontSize: '12px' }}>
                      <div>Tombo: {getSequencePreview(c.numero_tombo, c.qtd_total) || '—'}</div>
                      <div>Série: {getSequencePreview(c.serie, c.qtd_total) || '—'}</div>
                    </td>
                    <td style={{ fontSize: '12px', color: '#4a5568' }}>
                      <div>NF: {c.numero_nota_fiscal || '—'}</div>
                      <div>Empenho: {c.numero_empenho || '—'}</div>
                    </td>
                    <td style={{ fontWeight: '600' }}>
                      {c.qtd_total}
                      {(c.categoria?.toLowerCase() === 'munições' || c.categoria?.toLowerCase() === 'municoes') && (
                        <div style={{ fontSize: '10px', color: '#718096', fontWeight: 'normal', marginTop: '3px', lineHeight: '1.2' }}>
                          📦 {getAmmunitionDetails(c.descricao || c.modelo, c.qtd_total).lots} lote(s)<br />
                          📥 {getAmmunitionDetails(c.descricao || c.modelo, c.qtd_total).boxes} caixa(s)
                        </div>
                      )}
                    </td>
                    <td>{c.valor_compra ? `R$ ${Number(c.valor_compra).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                    <td>
                      {c.status === 'Lançado no Inventário' ? (
                        <span className="badge badge-green" style={{ fontSize: '10px' }}>✓ INTEGRADO</span>
                      ) : (
                        <span className="badge badge-yellow" style={{ fontSize: '10px' }}>PENDENTE</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {c.status !== 'Lançado no Inventário' ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#3182ce', borderColor: '#3182ce' }}
                            onClick={() => handleLancarNoInventario(c)}
                          >
                            📥 Lançar Estoque
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: '4px 8px', fontSize: '11px', cursor: 'default', color: '#48bb78', borderColor: '#48bb78', backgroundColor: '#f0fff4' }}
                            disabled
                          >
                            ✓ Lançado
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => handleOpenEdit(c)}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn btn-red"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => handleDelete(c.id)}
                        >
                          🗑️
                        </button>
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
                Exibindo <strong>{Math.min(compras.length, (currentPage - 1) * itemsPerPage + 1)}</strong> a{' '}
                <strong>{Math.min(compras.length, currentPage * itemsPerPage)}</strong> de{' '}
                <strong>{compras.length}</strong> compras
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
          </>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        title={editingId ? '✏️ Editar Item de Compra' : '🛍️ Novo Item de Compra'}
        onClose={() => setIsModalOpen(false)}
        footer={(
          <>
            <button className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave}>💾 Salvar</button>
          </>
        )}
      >
        <div className="form-grid">
          <div className="form-group" style={{ gridColumn: 'span 2', backgroundColor: '#f7fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <label style={{ fontWeight: 'bold', color: '#2d3748', fontSize: '13px', display: 'block', marginBottom: '6px' }}>1. Categoria do Item *</label>
            <select
              value={form.categoria}
              onChange={e => {
                const newCat = e.target.value;
                const isGlock = newCat === 'Peças Glock';
                const isSig = newCat === 'Peças Sig Sauer';
                setForm(prev => ({
                  ...prev,
                  categoria: newCat,
                  tipo: (isGlock || isSig) ? 'Peça de Reposição' : '',
                  marca: isGlock ? 'Glock' : isSig ? 'Sig Sauer' : '',
                  modelo: (isGlock || isSig) ? 'Peça de Reposição' : '',
                  descricao: '',
                  calibre: '',
                  subtipo: '',
                  tipo_municao: 'Operacional',
                  nivel: '',
                  tamanho: '',
                  sexo: '',
                  cargo: '',
                  id_peca: '',
                  conjunto_funcional: '',
                  nomenclatura_tecnica: '',
                  funcao_logistica: ''
                }));
                setIsCustomTipo(false);
                setCustomTipo('');
                setIsCustomMarca(false);
                setCustomMarca('');
                setIsCustomModelo(false);
                setCustomModelo('');
                setIsCustomDescricao(false);
                setCustomDescricao('');
              }}
              style={{ fontSize: '13px', fontWeight: '500', padding: '8px 12px' }}
            >
              <option value="">-- Selecione a Categoria Primeiro --</option>
              <option value="Armas">Armas</option>
              <option value="Coletes Balísticos">Coletes Balísticos</option>
              <option value="Equipamentos">Equipamentos</option>
              <option value="Uniformes">Uniformes</option>
              <option value="Munições">Munições</option>
              <option value="Peças Glock">Peças Glock</option>
              <option value="Peças Sig Sauer">Peças Sig Sauer</option>
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Fornecedor *</span>
              {!isCustomFornecedor ? (
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                  onClick={() => {
                    setIsCustomFornecedor(true);
                    setCustomFornecedor('');
                  }}
                >
                  ➕ Cadastrar Novo Fornecedor Rápido
                </button>
              ) : (
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                  onClick={() => {
                    setIsCustomFornecedor(false);
                    setCustomFornecedor('');
                  }}
                >
                  ✖ Escolher Existente
                </button>
              )}
            </label>
            {isCustomFornecedor ? (
              <input
                value={customFornecedor}
                onChange={e => setCustomFornecedor(e.target.value)}
                placeholder="Digite o nome do novo fornecedor..."
                autoFocus
              />
            ) : fornecedores.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ color: '#e53e3e', fontSize: '12px', marginTop: '4px' }}>
                  Aviso: Nenhum fornecedor cadastrado no sistema.
                </div>
                <button
                  type="button"
                  className="btn btn-xs btn-outline"
                  style={{ alignSelf: 'flex-start', padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => {
                    setIsCustomFornecedor(true);
                    setCustomFornecedor('');
                  }}
                >
                  ➕ Cadastrar Fornecedor Agora
                </button>
              </div>
            ) : (
              <select
                value={form.fornecedor_id}
                onChange={e => {
                  if (e.target.value === '__NEW__') {
                    setIsCustomFornecedor(true);
                    setCustomFornecedor('');
                  } else {
                    setForm({ ...form, fornecedor_id: e.target.value });
                  }
                }}
              >
                <option value="">-- Selecione o Fornecedor --</option>
                {fornecedores.map(f => (
                  <option key={f.id} value={f.id}>{f.nome} (CNPJ: {f.cnpj || '—'})</option>
                ))}
                <option value="__NEW__">➕ Cadastrar Novo Fornecedor...</option>
              </select>
            )}
          </div>

          <div className="form-group" style={{ gridColumn: 'span 2', borderBottom: '1px solid #edf2f7', paddingBottom: '12px', marginBottom: '8px' }}>
            <label style={{ fontWeight: '600', color: '#2b6cb0' }}>🔗 Vincular a Item Existente no Inventário (Opcional)</label>
            <select
              value={selectedInventoryItemId}
              onChange={e => {
                const val = e.target.value;
                setSelectedInventoryItemId(val);
                if (val) {
                  const selectedItem = inventoryItens.find(i => i.id === val);
                  if (selectedItem) {
                    const detectedSub = selectedItem.subtipo || extractSubtipoFromDesc(selectedItem.descricao || selectedItem.modelo);
                    setForm(prev => ({
                      ...prev,
                      categoria: selectedItem.categoria || 'Armas',
                      tipo: selectedItem.tipo || '',
                      marca: selectedItem.marca || '',
                      modelo: selectedItem.modelo || '',
                      calibre: selectedItem.calibre || prev.calibre || '',
                      subtipo: detectedSub || prev.subtipo || '',
                      tipo_municao: selectedItem.tipo_municao || prev.tipo_municao || 'Operacional',
                      nivel: selectedItem.nivel || prev.nivel || '',
                      tamanho: selectedItem.tamanho || prev.tamanho || '',
                      sexo: selectedItem.sexo || prev.sexo || '',
                      cargo: selectedItem.cargo || prev.cargo || '',
                      descricao: selectedItem.descricao || ''
                    }));
                    setIsCustomTipo(false);
                    setCustomTipo('');
                    setIsCustomMarca(false);
                    setCustomMarca('');
                    setIsCustomModelo(false);
                    setCustomModelo('');
                    setIsCustomDescricao(false);
                    setCustomDescricao('');
                  }
                }
              }}
              style={{ borderColor: '#bee3f8', backgroundColor: '#f7fafc' }}
            >
              <option value="">-- Criar Novo Item de Inventário --</option>
              {inventoryItens.map(item => (
                <option key={item.id} value={item.id}>
                  [{item.categoria}] {item.descricao}
                </option>
              ))}
            </select>
            <p style={{ fontSize: '11px', color: '#718096', marginTop: '4px', margin: 0 }}>
              💡 Selecione um item existente para garantir que os saldos sejam unificados no mesmo registro de inventário.
            </p>
          </div>

          {isEligibleForBulk && !editingId && (
            <div className="form-group" style={{ gridColumn: 'span 2', backgroundColor: '#ebf8ff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #bee3f8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>📦</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#2b6cb0' }}>Lançamento de Múltiplos Itens em Lote</h4>
                  <p style={{ margin: 0, fontSize: '11px', color: '#495057' }}>Deseja incluir as quantidades por cada modelo, tamanho, tipo ou variação de uma vez neste lançamento?</p>
                </div>
              </div>
              <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '8px', fontWeight: '600', fontSize: '13px', color: '#2b6cb0' }}>
                <input
                  type="checkbox"
                  checked={isBulkLaunch}
                  onChange={e => {
                    setIsBulkLaunch(e.target.checked);
                    if (e.target.checked) {
                      const rowTipo = isCustomTipo ? customTipo : (form.tipo || (uniqueTipos[0] || ''));
                      const rowMarca = isCustomMarca ? customMarca : (form.marca || (getMarcasForTipo(rowTipo)[0] || ''));
                      const rowModelo = isCustomModelo ? customModelo : (form.modelo || '');
                      const specs = form.categoria === 'Armas' ? getGunSpecs(rowTipo, rowMarca, rowModelo, form.calibre) : null;
                      const isColetesOrUniformes = form.categoria === 'Coletes Balísticos' || form.categoria === 'Uniformes';
                      const isColetesCat = form.categoria === 'Coletes Balísticos';

                      setBulkRows([{
                        tipo: rowTipo, customTipo: customTipo || '', isCustomTipo: isCustomTipo || false,
                        marca: rowMarca, customMarca: customMarca || '', isCustomMarca: isCustomMarca || false,
                        modelo: rowModelo, customModelo: customModelo || '', isCustomModelo: isCustomModelo || false,
                        tamanho: form.tamanho || '', customTamanho: customTamanho || '', isCustomTamanho: isCustomTamanho || false,
                        sexo: isColetesOrUniformes ? (form.sexo || 'Masculino') : '',
                        cargo: form.cargo || '', customCargo: customCargo || '', isCustomCargo: isCustomCargo || false,
                        calibre: form.calibre || specs?.calibre || (form.categoria === 'Munições' ? '9mm' : ''),
                        subtipo: form.subtipo || (form.categoria === 'Munições' ? 'Ogival' : ''),
                        tipo_municao: form.tipo_municao || 'Operacional',
                        nivel: isColetesCat ? (form.nivel || 'IIIA') : '',
                        comprimento_cano: form.comprimento_cano || specs?.comp_cano || '',
                        capacidade: form.capacidade || specs?.capacidade || '',
                        quantidade_carregadores: (form.quantidade_carregadores !== undefined && form.quantidade_carregadores !== '')
                          ? form.quantidade_carregadores
                          : (specs?.carregadores !== undefined ? specs.carregadores : ''),
                        tipo_radio: form.tipo_radio || '', customTipoRadio: customTipoRadio || '', isCustomTipoRadio: isCustomTipoRadio || false,
                        terminal_iss: form.terminal_iss || '',
                        qtd_baterias: form.qtd_baterias || '', customQtdBaterias: customQtdBaterias || '', isCustomQtdBaterias: isCustomQtdBaterias || false,
                        prefixo_viatura: form.prefixo_viatura || '',
                        placa_viatura: form.placa_viatura || '',
                        id_peca: form.id_peca || '',
                        conjunto_funcional: form.conjunto_funcional || '',
                        nomenclatura_tecnica: form.nomenclatura_tecnica || '',
                        funcao_logistica: form.funcao_logistica || '',
                        numero_tombo: form.numero_tombo || '',
                        serie: form.serie || '',
                        qtd_total: '',
                        valor_compra: form.valor_compra !== undefined && form.valor_compra !== null ? form.valor_compra : ''
                      }]);
                    }
                  }}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                Ativar Lote
              </label>
            </div>
          )}

          {form.categoria ? (
            <>
              {!isPecasGlock && !isPecasSigSauer ? (
            <>
              {/* Tipo Selector */}
              {!isBulkLaunch && form.categoria !== 'Munições' && form.categoria !== 'Municoes' && (
                <div className="form-group">
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Tipo *</span>
                    {!isCustomTipo ? (
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                        onClick={() => {
                          setIsCustomTipo(true);
                          setCustomTipo(form.tipo);
                        }}
                      >
                        ➕ Digitar Novo
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                        onClick={() => {
                          setIsCustomTipo(false);
                          setCustomTipo('');
                        }}
                      >
                        ✖ Escolher Existente
                      </button>
                    )}
                  </label>
                  {isCustomTipo ? (
                    <input
                      value={customTipo}
                      onChange={e => setCustomTipo(e.target.value)}
                      placeholder="Digite o novo tipo..."
                      autoFocus
                    />
                  ) : (
                    <select
                      value={form.tipo}
                      onChange={e => {
                        if (e.target.value === '__NEW__') {
                          setIsCustomTipo(true);
                          setCustomTipo('');
                        } else {
                          setForm({ ...form, tipo: e.target.value });
                        }
                      }}
                    >
                      <option value="">-- Selecione o Tipo --</option>
                      {uniqueTipos.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                      <option value="__NEW__">➕ Cadastrar Novo Tipo...</option>
                    </select>
                  )}
                </div>
              )}

              {/* Marca Selector */}
              {!isBulkLaunch && form.tipo !== 'Distintivo' && (
                <div className="form-group">
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Marca</span>
                    {!isCustomMarca ? (
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                        onClick={() => {
                          setIsCustomMarca(true);
                          setCustomMarca(form.marca);
                          setForm(prev => ({ ...prev, modelo: '' }));
                          setIsCustomModelo(false);
                          setCustomModelo('');
                        }}
                      >
                        ➕ Digitar Nova
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                        onClick={() => {
                          setIsCustomMarca(false);
                          setCustomMarca('');
                          setForm(prev => ({ ...prev, marca: '', modelo: '' }));
                          setIsCustomModelo(false);
                          setCustomModelo('');
                        }}
                      >
                        ✖ Escolher Existente
                      </button>
                    )}
                  </label>
                  {isCustomMarca ? (
                    <input
                      value={customMarca}
                      onChange={e => {
                        setCustomMarca(e.target.value);
                        setForm(prev => ({ ...prev, modelo: '' }));
                        setIsCustomModelo(false);
                        setCustomModelo('');
                      }}
                      placeholder="Digite a nova marca..."
                      autoFocus
                    />
                  ) : (
                    <select
                      value={form.marca}
                      onChange={e => {
                        if (e.target.value === '__NEW__') {
                          setIsCustomMarca(true);
                          setCustomMarca('');
                          setForm({ ...form, marca: '', modelo: '' });
                          setIsCustomModelo(false);
                          setCustomModelo('');
                        } else {
                          setForm({ ...form, marca: e.target.value, modelo: '' });
                          setIsCustomModelo(false);
                          setCustomModelo('');
                        }
                      }}
                    >
                      <option value="">-- Selecione a Marca --</option>
                      {uniqueMarcas.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      <option value="__NEW__">➕ Cadastrar Novo Marca...</option>
                    </select>
                  )}
                </div>
              )}

              {/* Modelo Selector */}
              {!isBulkLaunch && form.tipo !== 'Distintivo' && form.categoria !== 'Munições' && form.categoria !== 'Coletes Balísticos' && !(form.categoria === 'Uniformes' && (isJaqueta || isCapa)) && (
                <div className="form-group">
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{form.categoria === 'Uniformes' ? modeloLabel : 'Modelo'}</span>
                    {!isCustomModelo ? (
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                        onClick={() => {
                          setIsCustomModelo(true);
                          setCustomModelo(form.modelo);
                        }}
                      >
                        ➕ Digitar Novo
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                        onClick={() => {
                          setIsCustomModelo(false);
                          setCustomModelo('');
                        }}
                      >
                        ✖ Escolher Existente
                      </button>
                    )}
                  </label>
                  {isCustomModelo ? (
                    <input
                      value={customModelo}
                      onChange={e => setCustomModelo(e.target.value)}
                      placeholder={`Digite o novo ${form.categoria === 'Uniformes' ? modeloLabel.toLowerCase() : 'modelo'}...`}
                      autoFocus
                    />
                  ) : (
                    <select
                      value={form.modelo}
                      onChange={e => {
                        if (e.target.value === '__NEW__') {
                          setIsCustomModelo(true);
                          setCustomModelo('');
                        } else {
                          setForm({ ...form, modelo: e.target.value });
                        }
                      }}
                    >
                      <option value="">-- Selecione o {form.categoria === 'Uniformes' ? modeloLabel : 'Modelo'} --</option>
                      {uniqueModelos.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      <option value="__NEW__">➕ Cadastrar Novo Modelo...</option>
                    </select>
                  )}
                </div>
              )}

              {/* Subcampos específicos por categoria */}
              {form.categoria === 'Armas' && !isBulkLaunch && (
                <>
                  <div className="form-group">
                    <label>Calibre *</label>
                    <input
                      value={form.calibre || ''}
                      onChange={e => setForm({ ...form, calibre: e.target.value })}
                      placeholder="Ex: 9mm, .40, 5,56x45mm"
                      list="comp-armas-calibres"
                    />
                    <datalist id="comp-armas-calibres">
                      <option value="9mm" />
                      <option value=".40" />
                      <option value="5,56x45mm" />
                      <option value="7,62x51mm" />
                      <option value="12" />
                      <option value=".45" />
                      <option value=".38" />
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label>Comprimento do Cano</label>
                    <input
                      value={form.comprimento_cano || ''}
                      onChange={e => setForm({ ...form, comprimento_cano: e.target.value })}
                      placeholder="Ex: 114 mm, 102 mm"
                    />
                  </div>
                  <div className="form-group">
                    <label>Capacidade do Carregador</label>
                    <input
                      value={form.capacidade || ''}
                      onChange={e => setForm({ ...form, capacidade: e.target.value })}
                      placeholder="Ex: 17, 15, 10"
                    />
                  </div>
                  {form.tipo !== 'Revolver' && form.tipo !== 'Revólver' && (
                    <div className="form-group">
                      <label>Nº de Carregadores</label>
                      <input
                        type="number"
                        min="0"
                        value={form.quantidade_carregadores || ''}
                        onChange={e => setForm({ ...form, quantidade_carregadores: e.target.value })}
                        placeholder="Ex: 3, 4"
                      />
                    </div>
                  )}
                </>
              )}

              {form.categoria === 'Coletes Balísticos' && !isBulkLaunch && (
                <>
                  <div className="form-group">
                    <label>Nível *</label>
                    <select
                      value={form.nivel || ''}
                      onChange={e => setForm({ ...form, nivel: e.target.value })}
                    >
                      <option value="">Selecione...</option>
                      <option value="IIIA">IIIA</option>
                      <option value="II">II</option>
                    </select>
                  </div>
                  {!isBulkLaunch && (
                    <>
                      <div className="form-group">
                        <label>Tamanho *</label>
                        <select
                          value={form.tamanho || ''}
                          onChange={e => setForm({ ...form, tamanho: e.target.value })}
                        >
                          <option value="">Selecione...</option>
                          <option value="PP">PP</option>
                          <option value="P">P</option>
                          <option value="M">M</option>
                          <option value="G">G</option>
                          <option value="GG">GG</option>
                          <option value="XG">XG</option>
                          <option value="XXG">XXG</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Sexo *</label>
                        <select
                          value={form.sexo || ''}
                          onChange={e => setForm({ ...form, sexo: e.target.value })}
                        >
                          <option value="">Selecione...</option>
                          <option value="Masculino">Masculino</option>
                          <option value="Feminino">Feminino</option>
                          <option value="Unissex">Unissex</option>
                        </select>
                      </div>
                    </>
                  )}
                </>
              )}

              {form.categoria === 'Uniformes' && !isBulkLaunch && (
                <>
                  {/* Tamanho Selector */}
                  <div className="form-group">
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Tamanho *</span>
                      {!isCustomTamanho ? (
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                          onClick={() => {
                            setIsCustomTamanho(true);
                            setCustomTamanho(form.tamanho || '');
                          }}
                        >
                          ➕ Digitar Novo
                        </button>
                      ) : (
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                          onClick={() => {
                            setIsCustomTamanho(false);
                            setCustomTamanho('');
                          }}
                        >
                          ✖ Escolher Existente
                        </button>
                      )}
                    </label>
                    {isCustomTamanho ? (
                      <input
                        value={customTamanho}
                        onChange={e => setCustomTamanho(e.target.value)}
                        placeholder="Digite o novo tamanho..."
                        autoFocus
                      />
                    ) : (
                      <select
                        value={form.tamanho || ''}
                        onChange={e => {
                          if (e.target.value === '__NEW__') {
                            setIsCustomTamanho(true);
                            setCustomTamanho('');
                          } else {
                            setForm({ ...form, tamanho: e.target.value });
                          }
                        }}
                      >
                        <option value="">Selecione o Tamanho...</option>
                        {(isBota ? ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'] :
                          isCalca ? ['38', '40', '42', '44', '46', '48', '50', '52'] :
                          ['PP', 'P', 'M', 'G', 'GG', 'EG', 'XG']
                        ).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                        <option value="__NEW__">➕ Cadastrar Novo Tamanho...</option>
                      </select>
                    )}
                  </div>

                  {showSexo && (
                    <div className="form-group">
                      <label>Sexo *</label>
                      <select
                        value={form.sexo || ''}
                        onChange={e => setForm({ ...form, sexo: e.target.value })}
                      >
                        <option value="">Selecione...</option>
                        <option value="Masculino">Masculino</option>
                        <option value="Feminino">Feminino</option>
                        <option value="Unissex">Unissex</option>
                      </select>
                    </div>
                  )}

                  {showCargo && (
                    <div className="form-group">
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Cargo *</span>
                        {!isCustomCargo ? (
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                            onClick={() => {
                              setIsCustomCargo(true);
                              setCustomCargo(form.cargo || '');
                            }}
                          >
                             ➕ Digitar Novo
                          </button>
                        ) : (
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                            onClick={() => {
                              setIsCustomCargo(false);
                              setCustomCargo('');
                            }}
                          >
                            ✖ Escolher Existente
                          </button>
                        )}
                      </label>
                      {isCustomCargo ? (
                        <input
                          value={customCargo}
                          onChange={e => setCustomCargo(e.target.value)}
                          placeholder="Digite o novo cargo..."
                          autoFocus
                        />
                      ) : (
                        <select
                          value={form.cargo || ''}
                          onChange={e => {
                            if (e.target.value === '__NEW__') {
                              setIsCustomCargo(true);
                              setCustomCargo('');
                            } else {
                              setForm({ ...form, cargo: e.target.value });
                            }
                          }}
                        >
                          <option value="">Selecione o Cargo...</option>
                          {['DPC', 'OIP', 'IPC', 'EPC'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          <option value="__NEW__">➕ Cadastrar Novo Cargo...</option>
                        </select>
                      )}
                    </div>
                  )}
                </>
              )}

              {form.categoria === 'Equipamentos' && (
                <>
                  {/* Algema Tipo check */}
                  {(isCustomTipo ? customTipo : form.tipo) === 'Algema' && !isBulkLaunch && (
                    <div className="form-group">
                      <label>Modelo de Algema *</label>
                      <select
                        value={form.modelo || ''}
                        onChange={e => setForm({ ...form, modelo: e.target.value })}
                      >
                        <option value="">Selecione...</option>
                        <option value="Corrente">Corrente</option>
                        <option value="Dobradiça">Dobradiça</option>
                      </select>
                    </div>
                  )}

                  {/* Distintivo Cargo Field */}
                  {(isCustomTipo ? customTipo : form.tipo) === 'Distintivo' && !isBulkLaunch && (
                    <div className="form-group">
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Cargo *</span>
                        {!isCustomCargo ? (
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                            onClick={() => {
                              setIsCustomCargo(true);
                              setCustomCargo(form.cargo || '');
                            }}
                          >
                            ➕ Digitar Novo
                          </button>
                        ) : (
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                            onClick={() => {
                              setIsCustomCargo(false);
                              setCustomCargo('');
                            }}
                          >
                            ✖ Escolher Existente
                          </button>
                        )}
                      </label>
                      {isCustomCargo ? (
                        <input
                          value={customCargo}
                          onChange={e => setCustomCargo(e.target.value)}
                          placeholder="Digite o novo cargo..."
                          autoFocus
                        />
                      ) : (
                        <select
                          value={form.cargo || ''}
                          onChange={e => {
                            if (e.target.value === '__NEW__') {
                              setIsCustomCargo(true);
                              setCustomCargo('');
                            } else {
                              setForm({ ...form, cargo: e.target.value });
                            }
                          }}
                        >
                          <option value="">Selecione o Cargo...</option>
                          {['Delegado', 'Delegada', 'Inspetor', 'Escrivão', 'Oficial Investigador', 'Oficial Investigadora'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          <option value="__NEW__">➕ Cadastrar Novo Cargo...</option>
                        </select>
                      )}
                    </div>
                  )}

                  {/* Radio HT fields */}
                  {(isCustomTipo ? customTipo : form.tipo) === 'Rádio HT' && !isBulkLaunch && (
                    <>
                      {/* Tipo de Rádio */}
                      <div className="form-group">
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Tipo de Rádio *</span>
                          {!isCustomTipoRadio ? (
                            <button
                              type="button"
                              style={{ background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                              onClick={() => {
                                setIsCustomTipoRadio(true);
                                setCustomTipoRadio(form.tipo_radio || '');
                              }}
                            >
                              ➕ Digitar Novo
                            </button>
                          ) : (
                            <button
                              type="button"
                              style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                              onClick={() => {
                                setIsCustomTipoRadio(false);
                                setCustomTipoRadio('');
                              }}
                            >
                              ✖ Escolher Existente
                            </button>
                          )}
                        </label>
                        {isCustomTipoRadio ? (
                          <input
                            value={customTipoRadio}
                            onChange={e => setCustomTipoRadio(e.target.value)}
                            placeholder="Digite o novo tipo de rádio..."
                            autoFocus
                          />
                        ) : (
                          <select
                            value={form.tipo_radio || ''}
                            onChange={e => {
                              if (e.target.value === '__NEW__') {
                                setIsCustomTipoRadio(true);
                                setCustomTipoRadio('');
                              } else {
                                setForm({ ...form, tipo_radio: e.target.value });
                              }
                            }}
                          >
                            <option value="">Selecione...</option>
                            <option value="Fixo">Fixo</option>
                            <option value="Móvel">Móvel</option>
                            <option value="HT">HT</option>
                            <option value="__NEW__">➕ Cadastrar Novo...</option>
                          </select>
                        )}
                      </div>

                      {/* Terminal ISS */}
                      <div className="form-group">
                        <label>Terminal ISS</label>
                        <input
                          value={form.terminal_iss || ''}
                          onChange={e => setForm({ ...form, terminal_iss: e.target.value })}
                          placeholder="Digite o Terminal ISS..."
                        />
                      </div>

                      {/* Qtd Baterias (só para HT) */}
                      {(isCustomTipoRadio ? customTipoRadio : form.tipo_radio) === 'HT' && (
                        <div className="form-group">
                          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Qtd Baterias (Só para HT)</span>
                            {!isCustomQtdBaterias ? (
                              <button
                                type="button"
                                style={{ background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                                onClick={() => {
                                  setIsCustomQtdBaterias(true);
                                  setCustomQtdBaterias(form.qtd_baterias || '');
                                }}
                              >
                                ➕ Digitar Novo
                              </button>
                            ) : (
                              <button
                                type="button"
                                style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                                onClick={() => {
                                  setIsCustomQtdBaterias(false);
                                  setCustomQtdBaterias('');
                                }}
                              >
                                ✖ Escolher Existente
                              </button>
                            )}
                          </label>
                          {isCustomQtdBaterias ? (
                            <input
                              value={customQtdBaterias}
                              onChange={e => setCustomQtdBaterias(e.target.value)}
                              placeholder="Digite a quantidade..."
                              autoFocus
                            />
                          ) : (
                            <select
                              value={form.qtd_baterias || ''}
                              onChange={e => {
                                if (e.target.value === '__NEW__') {
                                  setIsCustomQtdBaterias(true);
                                  setCustomQtdBaterias('');
                                } else {
                                  setForm({ ...form, qtd_baterias: e.target.value });
                                }
                              }}
                            >
                              <option value="">Selecione...</option>
                              <option value="1">1</option>
                              <option value="2">2</option>
                              <option value="3">3</option>
                              <option value="4">4</option>
                              <option value="__NEW__">➕ Cadastrar Novo...</option>
                            </select>
                          )}
                        </div>
                      )}

                      {/* Prefixo Viatura e Placa Viatura (só para Móvel) */}
                      {(isCustomTipoRadio ? customTipoRadio : form.tipo_radio) === 'Móvel' && (
                        <>
                          <div className="form-group">
                            <label>Prefixo Viatura (Só para Móvel)</label>
                            <input
                              value={form.prefixo_viatura || ''}
                              onChange={e => setForm({ ...form, prefixo_viatura: e.target.value })}
                              placeholder="Digite o Prefixo da Viatura..."
                            />
                          </div>
                          <div className="form-group">
                            <label>Placa Viatura (Só para Móvel)</label>
                            <input
                              value={form.placa_viatura || ''}
                              onChange={e => setForm({ ...form, placa_viatura: e.target.value })}
                              placeholder="Digite a Placa da Viatura..."
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {form.categoria === 'Munições' && !isBulkLaunch && (
                <>
                  <div className="form-group">
                    <label>Calibre *</label>
                    <select
                      value={form.calibre || ''}
                      onChange={e => {
                        const newCalibre = e.target.value;
                        const availableSubtipos = getSubtiposForCalibre(newCalibre);
                        const nextSubtipo = availableSubtipos.includes(form.subtipo) ? form.subtipo : (availableSubtipos[0] || '');
                        setForm({ ...form, calibre: newCalibre, subtipo: nextSubtipo });
                      }}
                      required
                    >
                      <option value="">-- Selecione o Calibre --</option>
                      <option value="9mm">9mm (9x19mm)</option>
                      <option value=".40 S&W">.40 S&W</option>
                      <option value="5,56x45mm">5,56x45mm NATO</option>
                      <option value="7,62x51mm">7,62x51mm NATO</option>
                      <option value=".380 ACP">.380 ACP</option>
                      <option value=".38 SPL">.38 SPL</option>
                      <option value="12 GA">12 GA (Calibre 12)</option>
                      <option value=".45 ACP">.45 ACP</option>
                      <option value=".357 Magnum">.357 Magnum</option>
                      <option value=".50 BMG">.50 BMG</option>
                      <option value=".308 Win">.308 Win</option>
                      <option value=".22 LR">.22 LR</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Subtipo / Projétil *</label>
                    <select
                      value={form.subtipo || ''}
                      onChange={e => setForm({ ...form, subtipo: e.target.value })}
                      required
                    >
                      <option value="">-- Selecione o Subtipo --</option>
                      {getSubtiposForCalibre(form.calibre, form.subtipo).map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Tipo de Munição *</label>
                    <select
                      value={form.tipo_municao || 'Operacional'}
                      onChange={e => setForm({ ...form, tipo_municao: e.target.value })}
                    >
                      <option value="Operacional">Operacional</option>
                      <option value="Treina">Treina</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Nº do Lote de Munição *</label>
                    <input
                      type="text"
                      value={form.lote || ''}
                      onChange={e => setForm({ ...form, lote: e.target.value })}
                      placeholder="Ex: LOTE 2024-CBC-01"
                      required
                    />
                  </div>
                </>
              )}
            </>
          ) : !isBulkLaunch ? (
            <>
              {/* Peça Predefinida Dropdown */}
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Peça Predefinida</label>
                <select
                  value=""
                  onChange={(e) => {
                    const idx = e.target.value;
                    if (idx === "") {
                      setForm(p => ({
                        ...p,
                        id_peca: "",
                        conjunto_funcional: "",
                        nomenclatura_tecnica: "",
                        funcao_logistica: "",
                        marca: isPecasGlock ? "Glock" : "Sig Sauer",
                        modelo: "Peça de Reposição"
                      }));
                    } else {
                      const list = isPecasGlock ? PECAS_GLOCK_LIST : PECAS_SIG_SAUER_LIST;
                      const item = list[Number(idx)];
                      if (item) {
                        setForm(p => ({
                          ...p,
                          id_peca: item.id_peca,
                          conjunto_funcional: item.conjunto_funcional,
                          nomenclatura_tecnica: item.nomenclatura_tecnica,
                          funcao_logistica: item.funcao_logistica,
                          marca: isPecasGlock ? "Glock" : "Sig Sauer",
                          modelo: item.nomenclatura_tecnica
                        }));
                      }
                    }
                  }}
                >
                  <option value="">Personalizada / Outra...</option>
                  {(isPecasGlock ? PECAS_GLOCK_LIST : PECAS_SIG_SAUER_LIST).map((peca, index) => (
                    <option key={index} value={index}>
                      {peca.id_peca} - {peca.nomenclatura_tecnica} ({peca.conjunto_funcional})
                    </option>
                  ))}
                </select>
              </div>

              {/* ID Peça */}
              <div className="form-group">
                <label>ID Peça *</label>
                <input
                  value={form.id_peca || ''}
                  onChange={(e) => setForm((p) => ({ ...p, id_peca: e.target.value }))}
                  placeholder="Ex.: 1"
                />
              </div>

              {/* Conjunto Funcional */}
              <div className="form-group">
                <label>Conjunto Funcional *</label>
                <input
                  value={form.conjunto_funcional || ''}
                  onChange={(e) => setForm((p) => ({ ...p, conjunto_funcional: e.target.value }))}
                  placeholder="Ex.: Alimentação"
                />
              </div>

              {/* Nomenclatura Técnica */}
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Nomenclatura Técnica *</label>
                <input
                  value={form.nomenclatura_tecnica || ''}
                  onChange={(e) => setForm((p) => ({ ...p, nomenclatura_tecnica: e.target.value }))}
                  placeholder="Ex.: Corpo do Carregador"
                />
              </div>

              {/* Função Logística */}
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Função Logística / Descrição Técnica</label>
                <input
                  value={form.funcao_logistica || ''}
                  onChange={(e) => setForm((p) => ({ ...p, funcao_logistica: e.target.value }))}
                  placeholder="Ex.: Tubo de polímero com alma metálica"
                />
              </div>
            </>
          ) : null}

          {/* Descrição Selector */}
          {!isBulkLaunch ? (
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Descrição Completa do Item *</span>
                {!isCustomDescricao ? (
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                    onClick={() => {
                      setIsCustomDescricao(true);
                      setCustomDescricao(form.descricao);
                    }}
                  >
                    ➕ Digitar Nova
                  </button>
                ) : (
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                    onClick={() => {
                      setIsCustomDescricao(false);
                      setCustomDescricao('');
                    }}
                  >
                    ✖ Usar Gerada
                  </button>
                )}
              </label>
              {isCustomDescricao ? (
                <input
                  value={customDescricao}
                  onChange={e => setCustomDescricao(e.target.value)}
                  placeholder="Ex: PISTOLA GLOCK G17 GEN5 CALIBRE 9MM"
                  autoFocus
                />
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    value={form.descricao}
                    onChange={e => {
                      if (e.target.value === '__NEW__') {
                        setIsCustomDescricao(true);
                        setCustomDescricao('');
                      } else {
                        setForm({ ...form, descricao: e.target.value });
                      }
                    }}
                    style={{ flex: 1 }}
                  >
                    <option value="">-- Selecione a Descrição --</option>
                    {uniqueDescricoes.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                    {form.descricao && !uniqueDescricoes.includes(form.descricao) && (
                      <option value={form.descricao}>{form.descricao} (Gerado)</option>
                    )}
                    <option value="__NEW__">➕ Cadastrar Nova Descrição...</option>
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="form-group" style={{ gridColumn: 'span 2', backgroundColor: '#f7fafc', padding: '12px', borderRadius: '6px', border: '1px dashed #cbd5e0' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#4a5568', fontWeight: '500' }}>
                📝 <strong>Descrição Automática:</strong> Como você está realizando um lançamento em lote, a descrição de cada item será gerada automaticamente de forma padronizada (Ex.: "COLETE [MARCA] NÍVEL [NÍVEL] TAM [TAMANHO] [SEXO]" ou "[TIPO] [SEXO] [TAMANHO] [CARGO]") garantindo a padronização do inventário.
              </p>
            </div>
          )}

          {!isBulkLaunch && !isUniformes && !isMunicoes && !isPecasGlock && !isPecasSigSauer && (
            <>
              {/* Tombo / Patrimonio with sequential generator info */}
              <div className="form-group">
                <label>Tombo / Patrimônio Inicial</label>
                <input
                  value={form.numero_tombo}
                  onChange={e => setForm({ ...form, numero_tombo: e.target.value })}
                  placeholder="Ex: TOM000 ou 1000"
                />
                {form.numero_tombo && (
                  <div style={{ fontSize: '11px', color: '#2b6cb0', marginTop: '4px', backgroundColor: '#ebf8ff', padding: '4px 8px', borderRadius: '4px', border: '1px solid #bee3f8' }}>
                    ℹ️ Seqüência gerada: <strong>{getSequencePreview(form.numero_tombo, Number(form.qtd_total || 1))}</strong>
                  </div>
                )}
              </div>

              {/* Serie with sequential generator info */}
              <div className="form-group">
                <label>Número de Série Inicial</label>
                <input
                  value={form.serie}
                  onChange={e => setForm({ ...form, serie: e.target.value })}
                  placeholder="Ex: cnw000"
                />
                {form.serie && (
                  <div style={{ fontSize: '11px', color: '#2b6cb0', marginTop: '4px', backgroundColor: '#ebf8ff', padding: '4px 8px', borderRadius: '4px', border: '1px solid #bee3f8' }}>
                    ℹ️ Seqüência gerada: <strong>{getSequencePreview(form.serie, Number(form.qtd_total || 1))}</strong>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="form-group">
            <label>Número Nota Fiscal</label>
            <input
              value={form.numero_nota_fiscal}
              onChange={e => setForm({ ...form, numero_nota_fiscal: e.target.value })}
              placeholder="Ex: NF-10928"
            />
          </div>

          <div className="form-group">
            <label>Número de Empenho</label>
            <input
              value={form.numero_empenho}
              onChange={e => setForm({ ...form, numero_empenho: e.target.value })}
              placeholder="Ex: NE-2026-0091"
            />
          </div>

          {!isBulkLaunch && (
            <>
              <div className="form-group">
                <label>Quantidade Total adquirida *</label>
                <input
                  type="text"
                  value={form.qtd_total !== undefined && form.qtd_total !== null ? form.qtd_total : ''}
                  onChange={e => setForm({ ...form, qtd_total: e.target.value.replace(/\D/g, '') })}
                  placeholder="Ex: 100"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid #cbd5e0', borderRadius: '6px', fontWeight: 'bold' }}
                />
                {(form.categoria?.toLowerCase() === 'munições' || form.categoria?.toLowerCase() === 'municoes') && (
                  <div style={{ fontSize: '12px', color: '#2b6cb0', marginTop: '6px', backgroundColor: '#ebf8ff', padding: '8px 10px', borderRadius: '4px', border: '1px solid #bee3f8', lineHeight: '1.4' }}>
                    {form.lote && <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>🏷️ Nº do Lote Informado: {form.lote}</div>}
                    📦 Equivale a: <strong>{getAmmunitionDetails(isCustomTipo ? customTipo : form.tipo || form.descricao || form.modelo, Number(form.qtd_total || 1)).lots} lote(s)</strong> e <strong>{getAmmunitionDetails(isCustomTipo ? customTipo : form.tipo || form.descricao || form.modelo, Number(form.qtd_total || 1)).boxes} caixa(s)</strong>.<br />
                    <span style={{ fontSize: '11px', color: '#4a5568' }}>
                      (Cálculo: {getAmmunitionDetails(isCustomTipo ? customTipo : form.tipo || form.descricao || form.modelo, Number(form.qtd_total || 1)).unitsPerLot} un. por lote / {getAmmunitionDetails(isCustomTipo ? customTipo : form.tipo || form.descricao || form.modelo, Number(form.qtd_total || 1)).unitsPerBox} un. por caixa)
                    </span>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Estoque Crítico (Calculado automaticamente)</label>
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: '#f7fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: '#4a5568',
                  fontWeight: '600',
                  minHeight: '38px',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  {calcularQtdMin(form.categoria, isCustomTipo ? customTipo : form.tipo, Number(form.qtd_total || 1))} unidades ({
                    form.categoria?.toLowerCase() === 'armas' ? '5% (Armas)' :
                    (form.categoria?.toLowerCase() === 'munições' || form.categoria?.toLowerCase() === 'municoes') ? '20% (Munições)' :
                    (form.categoria?.toLowerCase()?.includes('colete')) ? '15% (Coletes)' :
                    (form.categoria?.toLowerCase()?.includes('uniforme')) ? '15% (Uniformes)' :
                    ((isCustomTipo ? customTipo : form.tipo)?.toLowerCase()?.includes('algema')) ? '5% (Algemas)' :
                    'Isento de estoque mínimo'
                  })
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label>Valor Total da Compra</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ 
                padding: '8px 12px', 
                background: '#edf2f7', 
                border: '1px solid #cbd5e0', 
                borderRight: 'none', 
                borderRadius: '6px 0 0 6px', 
                fontWeight: 'bold', 
                color: '#4a5568',
                fontSize: '14px'
              }}>R$</span>
              <input
                type="text"
                value={form.valor_compra !== undefined && form.valor_compra !== null ? form.valor_compra : ''}
                onChange={e => {
                  const raw = e.target.value;
                  setForm({ ...form, valor_compra: formatCurrencyInput(raw) });
                }}
                onBlur={() => {
                  if (form.valor_compra) {
                    const parsed = parseCurrencyBRL(form.valor_compra);
                    setForm({ ...form, valor_compra: formatCurrencyInput(parsed) });
                  }
                }}
                placeholder="0,00"
                style={{ 
                  flex: 1, 
                  padding: '8px 12px', 
                  border: '1px solid #cbd5e0', 
                  borderRadius: '0 6px 6px 0',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#2d3748'
                }}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Data de Aquisição</label>
            <input
              type="date"
              value={form.dt_aq}
              onChange={e => setForm({ ...form, dt_aq: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label>Data de Validade/Vencimento (Se aplicável)</label>
            <input
              type="date"
              value={form.dt_val}
              onChange={e => setForm({ ...form, dt_val: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label>Observações</label>
            <textarea
              value={form.obs}
              onChange={e => setForm({ ...form, obs: e.target.value })}
              placeholder="Outros dados importantes da aquisição..."
              style={{ width: '100%', minHeight: '80px', padding: '8px', border: '1px solid #ccc', borderRadius: '6px' }}
            />
          </div>

          {isBulkLaunch && isEligibleForBulk && (
            <div className="form-group" style={{ gridColumn: 'span 2', borderTop: '2px solid #e2e8f0', paddingTop: '20px', marginTop: '16px' }}>
              {/* HEADER BAR FOR BULK LAUNCH */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', backgroundColor: '#ebf8ff', padding: '14px 18px', borderRadius: '8px', border: '1px solid #cbd5e0', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', color: '#2b6cb0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📦 <span>Lançamento em Lote — Caixas de Itens ({form.categoria})</span>
                    <span style={{ backgroundColor: '#3182ce', color: '#fff', fontSize: '11px', padding: '2px 10px', borderRadius: '12px', fontWeight: 'bold' }}>
                      {bulkRows.length} {bulkRows.length === 1 ? 'item / caixa' : 'itens / caixas'}
                    </span>
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#4a5568' }}>
                    Cada caixa abaixo representa um item individual do lote com seus campos e especificações.
                  </p>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const lastRow = bulkRows[bulkRows.length - 1];
                    const rowTipo = lastRow?.tipo || form.tipo || (uniqueTipos[0] || '');
                    const rowMarca = lastRow?.marca || form.marca || (getMarcasForTipo(rowTipo)[0] || '');
                    const rowModelo = lastRow?.modelo || form.modelo || '';
                    const specs = form.categoria === 'Armas' ? getGunSpecs(rowTipo, rowMarca, rowModelo, lastRow?.calibre || form.calibre) : null;
                    const isColetesOrUniformes = form.categoria === 'Coletes Balísticos' || form.categoria === 'Uniformes';
                    const isColetesCat = form.categoria === 'Coletes Balísticos';
                    setBulkRows([...bulkRows, {
                      tipo: rowTipo,
                      customTipo: lastRow?.customTipo || '',
                      isCustomTipo: lastRow?.isCustomTipo || false,
                      marca: rowMarca,
                      customMarca: lastRow?.customMarca || '',
                      isCustomMarca: lastRow?.isCustomMarca || false,
                      tamanho: '', customTamanho: '', isCustomTamanho: false,
                      sexo: isColetesOrUniformes ? (lastRow?.sexo || 'Masculino') : '',
                      cargo: '', customCargo: '', isCustomCargo: false,
                      modelo: rowModelo, customModelo: lastRow?.customModelo || '', isCustomModelo: lastRow?.isCustomModelo || false,
                      calibre: lastRow?.calibre || specs?.calibre || form.calibre || (form.categoria === 'Munições' ? '9mm' : ''),
                      subtipo: lastRow?.subtipo || form.subtipo || (form.categoria === 'Munições' ? 'Ogival' : ''),
                      tipo_municao: lastRow?.tipo_municao || form.tipo_municao || 'Operacional',
                      nivel: isColetesCat ? (lastRow?.nivel || form.nivel || 'IIIA') : '',
                      comprimento_cano: lastRow?.comprimento_cano || form.comprimento_cano || specs?.comp_cano || '',
                      capacidade: lastRow?.capacidade || form.capacidade || specs?.capacidade || '',
                      quantidade_carregadores: (lastRow?.quantidade_carregadores !== undefined && lastRow?.quantidade_carregadores !== '')
                        ? lastRow.quantidade_carregadores
                        : ((form.quantidade_carregadores !== undefined && form.quantidade_carregadores !== '') ? form.quantidade_carregadores : (specs?.carregadores !== undefined ? specs.carregadores : '')),
                      tipo_radio: lastRow?.tipo_radio || form.tipo_radio || '',
                      customTipoRadio: '', isCustomTipoRadio: false,
                      terminal_iss: lastRow?.terminal_iss || form.terminal_iss || '',
                      qtd_baterias: lastRow?.qtd_baterias || form.qtd_baterias || '',
                      customQtdBaterias: '', isCustomQtdBaterias: false,
                      prefixo_viatura: lastRow?.prefixo_viatura || form.prefixo_viatura || '',
                      placa_viatura: lastRow?.placa_viatura || form.placa_viatura || '',
                      id_peca: '', conjunto_funcional: '', nomenclatura_tecnica: '', funcao_logistica: '',
                      numero_tombo: '',
                      serie: '',
                      qtd_total: '',
                      valor_compra: lastRow?.valor_compra !== undefined && lastRow.valor_compra !== null ? lastRow.valor_compra : (form.valor_compra || '')
                    }]);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '12px', fontWeight: 'bold' }}
                >
                  ➕ Adicionar Novo Item ao Lote
                </button>
              </div>

              {/* LIST OF ITEM CARD BOXES */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {bulkRows.map((row, index) => {
                  const rowTipoVal = row.isCustomTipo ? row.customTipo : (row.tipo || form.tipo || uniqueTipos[0] || '');
                  const rowMarcaVal = row.isCustomMarca ? row.customMarca : (row.marca || form.marca || (getMarcasForTipo(rowTipoVal)[0] || ''));

                  const tValLower = String(rowTipoVal || '').toLowerCase();
                  const rowIsBota = tValLower.includes('bota');
                  const rowIsCalca = tValLower.includes('calça') || tValLower.includes('calca');
                  const rowIsPolo = tValLower.includes('polo') || tValLower.includes('gandola');
                  const rowIsJaqueta = tValLower.includes('jaqueta');
                  const rowIsCapa = tValLower.includes('capa');

                  const rowShowSexo = rowIsPolo || rowIsCalca || rowIsJaqueta || rowIsCapa;
                  const rowShowCargo = rowIsPolo;

                  const sizesOptions = form.categoria === 'Coletes Balísticos' 
                    ? ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG']
                    : rowIsBota ? ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47']
                    : rowIsCalca ? ['38', '40', '42', '44', '46', '48', '50', '52']
                    : ['PP', 'P', 'M', 'G', 'GG', 'EG', 'XG', 'Único'];

                  const cargosOptions = ['DPC', 'OIP', 'IPC', 'EPC', 'Delegado', 'Delegada', 'Inspetor', 'Escrivão', 'Oficial Investigador', 'Oficial Investigadora'];
                  const calibresList = ['9mm', '.40 S&W', '5,56x45mm', '7,62x51mm', '.380 ACP', '.38 SPL', '12 GA', '.45 ACP', '.357 Magnum', '.50 BMG', '.308 Win', '.22 LR'];

                  const updateBulkRow = (idx, field, val) => {
                    setBulkRows(bulkRows.map((r, i) => i === idx ? { ...r, [field]: val } : r));
                  };

                  const removeBulkRow = (idx) => {
                    if (bulkRows.length > 1) {
                      setBulkRows(bulkRows.filter((_, i) => i !== idx));
                    } else {
                      const rowTipo = form.tipo || (uniqueTipos[0] || '');
                      setBulkRows([{
                        tipo: rowTipo,
                        customTipo: '', isCustomTipo: false,
                        marca: form.marca || (getMarcasForTipo(rowTipo)[0] || ''),
                        customMarca: '', isCustomMarca: false,
                        tamanho: '', customTamanho: '', isCustomTamanho: false,
                        sexo: 'Masculino', cargo: '', customCargo: '', isCustomCargo: false,
                        modelo: '', customModelo: '', isCustomModelo: false,
                        calibre: form.calibre || (form.categoria === 'Munições' ? '9mm' : ''),
                        subtipo: form.subtipo || (form.categoria === 'Munições' ? 'Ogival' : ''),
                        tipo_municao: form.tipo_municao || 'Operacional',
                        nivel: form.nivel || 'IIIA',
                        comprimento_cano: form.comprimento_cano || '',
                        capacidade: form.capacidade || '',
                        quantidade_carregadores: form.quantidade_carregadores || '',
                        tipo_radio: form.tipo_radio || '', customTipoRadio: '', isCustomTipoRadio: false,
                        terminal_iss: form.terminal_iss || '',
                        qtd_baterias: form.qtd_baterias || '', customQtdBaterias: '', isCustomQtdBaterias: false,
                        prefixo_viatura: form.prefixo_viatura || '',
                        placa_viatura: form.placa_viatura || '',
                        id_peca: '', conjunto_funcional: '', nomenclatura_tecnica: '', funcao_logistica: '',
                        numero_tombo: '',
                        serie: '',
                        qtd_total: 1,
                        valor_compra: form.valor_compra || 0
                      }]);
                    }
                  };

                  // Auto-generate item preview title for card header
                  let rowPreviewTitle = '';
                  if (form.categoria === 'Munições') {
                    rowPreviewTitle = `Munição ${row.calibre || form.calibre || '9mm'} ${row.subtipo || form.subtipo || ''} (${row.tipo_municao || 'Operacional'}) ${rowMarcaVal ? '- ' + rowMarcaVal : ''}`;
                  } else if (form.categoria === 'Armas') {
                    rowPreviewTitle = `Arma: ${rowTipoVal || ''} ${rowMarcaVal || ''} ${row.modelo || ''} ${row.calibre ? '(' + row.calibre + ')' : ''}`.trim();
                  } else if (form.categoria === 'Coletes Balísticos') {
                    rowPreviewTitle = `Colete ${rowMarcaVal || ''} Nível ${row.nivel || 'IIIA'} Tam ${row.tamanho || ''}`.trim();
                  } else if (form.categoria === 'Uniformes') {
                    rowPreviewTitle = `Uniforme: ${rowTipoVal || ''} ${row.modelo ? '- ' + row.modelo : ''} Tam ${row.tamanho || ''}`.trim();
                  } else if (form.categoria === 'Equipamentos') {
                    rowPreviewTitle = `Equipamento: ${rowTipoVal || ''} ${rowMarcaVal || ''} ${row.modelo || ''}`.trim();
                  } else if (isPecasGlock || isPecasSigSauer) {
                    rowPreviewTitle = `Peça: ${row.nomenclatura_tecnica || row.modelo || 'Predefinida'}`;
                  } else {
                    rowPreviewTitle = `${form.categoria} — ${rowTipoVal || ''} ${rowMarcaVal || ''}`.trim();
                  }

                  const rowValorUnit = parseCurrencyBRL(row.valor_compra !== undefined && row.valor_compra !== '' ? row.valor_compra : form.valor_compra);
                  const rowQtdNum = Number(row.qtd_total || 1);
                  const rowSubtotal = rowQtdNum * rowValorUnit;

                  return (
                    <div 
                      key={index} 
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e0',
                        borderRadius: '10px',
                        padding: '16px 20px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {/* CARD HEADER */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ backgroundColor: '#2b6cb0', color: '#ffffff', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                            CAIXA DE ITEM #{index + 1}
                          </span>
                          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#2d3748' }}>
                            {rowPreviewTitle || `Item #${index + 1}`}
                          </h4>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const duplicatedRow = JSON.parse(JSON.stringify(row));
                              const newRows = [...bulkRows];
                              newRows.splice(index + 1, 0, duplicatedRow);
                              setBulkRows(newRows);
                            }}
                            className="btn btn-outline"
                            style={{ padding: '4px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                            title="Duplicar esta caixa de item"
                          >
                            📋 Duplicar Caixa
                          </button>

                          <button
                            type="button"
                            onClick={() => removeBulkRow(index)}
                            style={{ padding: '4px 10px', fontSize: '11px', backgroundColor: '#fff5f5', color: '#e53e3e', border: '1px solid #feb2b2', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}
                            title="Excluir esta caixa do lote"
                          >
                            🗑️ Excluir Item
                          </button>
                        </div>
                      </div>

                      {/* CARD FIELDS GRID */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', alignItems: 'flex-start' }}>
                        
                        {/* TIPO */}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                            Tipo do Item *
                          </label>
                          {row.isCustomTipo ? (
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <input
                                value={row.customTipo}
                                onChange={e => updateBulkRow(index, 'customTipo', e.target.value)}
                                placeholder="Digite o novo tipo..."
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #3182ce', borderRadius: '4px' }}
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => updateBulkRow(index, 'isCustomTipo', false)}
                                style={{ background: 'none', border: 'none', color: '#e53e3e', fontSize: '13px', cursor: 'pointer', padding: '0 4px' }}
                                title="Voltar para lista"
                              >
                                ✖
                              </button>
                            </div>
                          ) : (
                            <select
                              value={rowTipoVal}
                              onChange={e => {
                                if (e.target.value === '__NEW__') {
                                  updateBulkRow(index, 'isCustomTipo', true);
                                  updateBulkRow(index, 'customTipo', '');
                                } else {
                                  const newTipo = e.target.value;
                                  const availableMarcas = getMarcasForTipo(newTipo);
                                  const currentMarca = row.isCustomMarca ? row.customMarca : row.marca;
                                  const nextMarca = availableMarcas.includes(currentMarca) ? currentMarca : (availableMarcas[0] || '');
                                  const availableModels = getModelosForTipoAndBrand(newTipo, nextMarca);
                                  const selectedModel = availableModels.includes(row.modelo) ? row.modelo : (availableModels[0] || '');
                                  const specs = form.categoria === 'Armas' ? getGunSpecs(newTipo, nextMarca, selectedModel, row.calibre) : null;
                                  setBulkRows(bulkRows.map((r, i) => i === index ? {
                                    ...r,
                                    tipo: newTipo,
                                    marca: nextMarca,
                                    modelo: selectedModel,
                                    calibre: r.calibre || specs?.calibre || form.calibre || '',
                                    comprimento_cano: specs?.comp_cano || r.comprimento_cano || form.comprimento_cano || '',
                                    capacidade: specs?.capacidade || r.capacidade || form.capacidade || '',
                                    quantidade_carregadores: specs?.carregadores !== undefined ? specs.carregadores : (r.quantidade_carregadores !== undefined ? r.quantidade_carregadores : (form.quantidade_carregadores || ''))
                                  } : r));
                                }
                              }}
                              style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                            >
                              <option value="">-- Selecione o Tipo --</option>
                              {uniqueTipos.map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                              <option value="__NEW__">➕ Digitar Novo...</option>
                            </select>
                          )}
                        </div>

                        {/* MARCA */}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                            Marca *
                          </label>
                          {row.isCustomMarca ? (
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <input
                                value={row.customMarca}
                                onChange={e => updateBulkRow(index, 'customMarca', e.target.value)}
                                placeholder="Digite a nova marca..."
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #3182ce', borderRadius: '4px' }}
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => updateBulkRow(index, 'isCustomMarca', false)}
                                style={{ background: 'none', border: 'none', color: '#e53e3e', fontSize: '13px', cursor: 'pointer', padding: '0 4px' }}
                                title="Voltar para lista"
                              >
                                ✖
                              </button>
                            </div>
                          ) : (
                            <select
                              value={rowMarcaVal}
                              onChange={e => {
                                if (e.target.value === '__NEW__') {
                                  updateBulkRow(index, 'isCustomMarca', true);
                                  updateBulkRow(index, 'customMarca', '');
                                } else {
                                  const newMarca = e.target.value;
                                  const availableModels = getModelosForTipoAndBrand(rowTipoVal, newMarca);
                                  const selectedModel = availableModels.includes(row.modelo) ? row.modelo : (availableModels[0] || '');
                                  const specs = form.categoria === 'Armas' ? getGunSpecs(rowTipoVal, newMarca, selectedModel, row.calibre) : null;
                                  setBulkRows(bulkRows.map((r, i) => i === index ? {
                                    ...r,
                                    marca: newMarca,
                                    modelo: selectedModel,
                                    calibre: r.calibre || specs?.calibre || form.calibre || '',
                                    comprimento_cano: specs?.comp_cano || r.comprimento_cano || form.comprimento_cano || '',
                                    capacidade: specs?.capacidade || r.capacidade || form.capacidade || '',
                                    quantidade_carregadores: specs?.carregadores !== undefined ? specs.carregadores : (r.quantidade_carregadores !== undefined ? r.quantidade_carregadores : (form.quantidade_carregadores || ''))
                                  } : r));
                                }
                              }}
                              style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                            >
                              <option value="">-- Selecione a Marca --</option>
                              {getMarcasForTipo(rowTipoVal).map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                              <option value="__NEW__">➕ Digitar Nova...</option>
                            </select>
                          )}
                        </div>

                        {/* COLETES BALÍSTICOS FIELDS */}
                        {form.categoria === 'Coletes Balísticos' && (
                          <>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Nível Balístico *
                              </label>
                              <select
                                value={row.nivel || form.nivel || 'IIIA'}
                                onChange={e => updateBulkRow(index, 'nivel', e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                              >
                                <option value="IIIA">IIIA</option>
                                <option value="II">II</option>
                              </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Tamanho *
                              </label>
                              {row.isCustomTamanho ? (
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  <input
                                    value={row.customTamanho}
                                    onChange={e => updateBulkRow(index, 'customTamanho', e.target.value)}
                                    placeholder="Digite o tamanho..."
                                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #3182ce', borderRadius: '4px' }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateBulkRow(index, 'isCustomTamanho', false)}
                                    style={{ background: 'none', border: 'none', color: '#e53e3e', fontSize: '13px', cursor: 'pointer' }}
                                  >
                                    ✖
                                  </button>
                                </div>
                              ) : (
                                <select
                                  value={row.tamanho || ''}
                                  onChange={e => {
                                    if (e.target.value === '__NEW__') {
                                      updateBulkRow(index, 'isCustomTamanho', true);
                                      updateBulkRow(index, 'customTamanho', '');
                                    } else {
                                      updateBulkRow(index, 'tamanho', e.target.value);
                                    }
                                  }}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                >
                                  <option value="">Selecione...</option>
                                  {sizesOptions.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                  <option value="__NEW__">➕ Outro...</option>
                                </select>
                              )}
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Sexo *
                              </label>
                              <select
                                value={row.sexo || ''}
                                onChange={e => updateBulkRow(index, 'sexo', e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                              >
                                <option value="">Selecione...</option>
                                <option value="Masculino">Masculino</option>
                                <option value="Feminino">Feminino</option>
                                <option value="Unissex">Unissex</option>
                              </select>
                            </div>
                          </>
                        )}

                        {/* UNIFORMES FIELDS */}
                        {form.categoria === 'Uniformes' && (
                          <>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Modelo / Variação
                              </label>
                              {rowIsBota ? (
                                <select
                                  value={row.modelo || ''}
                                  onChange={e => updateBulkRow(index, 'modelo', e.target.value)}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                >
                                  <option value="">Selecione...</option>
                                  <option value="Cano Curto">Cano Curto</option>
                                  <option value="Cano Médio">Cano Médio</option>
                                  <option value="Cano Longo">Cano Longo</option>
                                </select>
                              ) : rowIsCalca ? (
                                <select
                                  value={row.modelo || ''}
                                  onChange={e => updateBulkRow(index, 'modelo', e.target.value)}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                >
                                  <option value="">Selecione...</option>
                                  <option value="Ripstop">Ripstop</option>
                                  <option value="BDU">BDU</option>
                                  <option value="Padrão">Padrão</option>
                                </select>
                              ) : row.isCustomModelo ? (
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  <input
                                    value={row.customModelo}
                                    onChange={e => updateBulkRow(index, 'customModelo', e.target.value)}
                                    placeholder="Digite o modelo..."
                                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #3182ce', borderRadius: '4px' }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateBulkRow(index, 'isCustomModelo', false)}
                                    style={{ background: 'none', border: 'none', color: '#e53e3e', fontSize: '13px', cursor: 'pointer' }}
                                  >
                                    ✖
                                  </button>
                                </div>
                              ) : (
                                <select
                                  value={row.modelo || ''}
                                  onChange={e => {
                                    if (e.target.value === '__NEW__') {
                                      updateBulkRow(index, 'isCustomModelo', true);
                                      updateBulkRow(index, 'customModelo', '');
                                    } else {
                                      updateBulkRow(index, 'modelo', e.target.value);
                                    }
                                  }}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                >
                                  <option value="">Selecione...</option>
                                  {getModelosForTipoAndBrand(rowTipoVal, rowMarcaVal).map(m => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                  <option value="__NEW__">➕ Outro...</option>
                                </select>
                              )}
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Tamanho *
                              </label>
                              {row.isCustomTamanho ? (
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  <input
                                    value={row.customTamanho}
                                    onChange={e => updateBulkRow(index, 'customTamanho', e.target.value)}
                                    placeholder="Digite..."
                                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #3182ce', borderRadius: '4px' }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateBulkRow(index, 'isCustomTamanho', false)}
                                    style={{ background: 'none', border: 'none', color: '#e53e3e', fontSize: '13px', cursor: 'pointer' }}
                                  >
                                    ✖
                                  </button>
                                </div>
                              ) : (
                                <select
                                  value={row.tamanho || ''}
                                  onChange={e => {
                                    if (e.target.value === '__NEW__') {
                                      updateBulkRow(index, 'isCustomTamanho', true);
                                      updateBulkRow(index, 'customTamanho', '');
                                    } else {
                                      updateBulkRow(index, 'tamanho', e.target.value);
                                    }
                                  }}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                >
                                  <option value="">Selecione...</option>
                                  {sizesOptions.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                  <option value="__NEW__">➕ Outro...</option>
                                </select>
                              )}
                            </div>

                            {rowShowSexo && (
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                  Sexo *
                                </label>
                                <select
                                  value={row.sexo || ''}
                                  onChange={e => updateBulkRow(index, 'sexo', e.target.value)}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                >
                                  <option value="">Selecione...</option>
                                  <option value="Masculino">Masculino</option>
                                  <option value="Feminino">Feminino</option>
                                  <option value="Unissex">Unissex</option>
                                </select>
                              </div>
                            )}

                            {rowShowCargo && (
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                  Cargo *
                                </label>
                                {row.isCustomCargo ? (
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <input
                                      value={row.customCargo}
                                      onChange={e => updateBulkRow(index, 'customCargo', e.target.value)}
                                      placeholder="Digite o cargo..."
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #3182ce', borderRadius: '4px' }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateBulkRow(index, 'isCustomCargo', false)}
                                      style={{ background: 'none', border: 'none', color: '#e53e3e', fontSize: '13px', cursor: 'pointer' }}
                                    >
                                      ✖
                                    </button>
                                  </div>
                                ) : (
                                  <select
                                    value={row.cargo || ''}
                                    onChange={e => {
                                      if (e.target.value === '__NEW__') {
                                        updateBulkRow(index, 'isCustomCargo', true);
                                        updateBulkRow(index, 'customCargo', '');
                                      } else {
                                        updateBulkRow(index, 'cargo', e.target.value);
                                      }
                                    }}
                                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                  >
                                    <option value="">Selecione...</option>
                                    {cargosOptions.map(c => (
                                      <option key={c} value={c}>{c}</option>
                                    ))}
                                    <option value="__NEW__">➕ Outro...</option>
                                  </select>
                                )}
                              </div>
                            )}
                          </>
                        )}

                        {/* ARMAS FIELDS */}
                        {form.categoria === 'Armas' && (
                          <>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Modelo *
                              </label>
                              {row.isCustomModelo ? (
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  <input
                                    value={row.customModelo}
                                    onChange={e => updateBulkRow(index, 'customModelo', e.target.value)}
                                    placeholder="Digite o modelo..."
                                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #3182ce', borderRadius: '4px' }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateBulkRow(index, 'isCustomModelo', false)}
                                    style={{ background: 'none', border: 'none', color: '#e53e3e', fontSize: '13px', cursor: 'pointer' }}
                                  >
                                    ✖
                                  </button>
                                </div>
                              ) : (
                                <select
                                  value={row.modelo || ''}
                                  onChange={e => {
                                    if (e.target.value === '__NEW__') {
                                      updateBulkRow(index, 'isCustomModelo', true);
                                      updateBulkRow(index, 'customModelo', '');
                                    } else {
                                      const selectedModel = e.target.value;
                                      const specs = form.categoria === 'Armas' ? getGunSpecs(rowTipoVal, rowMarcaVal, selectedModel, row.calibre || form.calibre) : null;
                                      setBulkRows(bulkRows.map((r, i) => i === index ? {
                                        ...r,
                                        modelo: selectedModel,
                                        calibre: r.calibre || specs?.calibre || form.calibre || '',
                                        comprimento_cano: specs?.comp_cano || r.comprimento_cano || form.comprimento_cano || '',
                                        capacidade: specs?.capacidade || r.capacidade || form.capacidade || '',
                                        quantidade_carregadores: specs?.carregadores !== undefined ? specs.carregadores : (r.quantidade_carregadores !== undefined ? r.quantidade_carregadores : (form.quantidade_carregadores || ''))
                                      } : r));
                                    }
                                  }}
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                >
                                  <option value="">Selecione...</option>
                                  {getModelosForTipoAndBrand(rowTipoVal, rowMarcaVal).map(m => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                  <option value="__NEW__">➕ Digitar Novo...</option>
                                </select>
                              )}
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Calibre *
                              </label>
                              <select
                                value={row.calibre || ''}
                                onChange={e => {
                                  const selectedCalibre = e.target.value;
                                  const specs = form.categoria === 'Armas' ? getGunSpecs(rowTipoVal, rowMarcaVal, row.modelo || form.modelo, selectedCalibre) : null;
                                  setBulkRows(bulkRows.map((r, i) => i === index ? {
                                    ...r,
                                    calibre: selectedCalibre,
                                    comprimento_cano: specs?.comp_cano || r.comprimento_cano || form.comprimento_cano || '',
                                    capacidade: specs?.capacidade || r.capacidade || form.capacidade || '',
                                    quantidade_carregadores: specs?.carregadores !== undefined ? specs.carregadores : (r.quantidade_carregadores !== undefined ? r.quantidade_carregadores : (form.quantidade_carregadores || ''))
                                  } : r));
                                }}
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                              >
                                <option value="">-- Selecione o Calibre --</option>
                                {calibresList.map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Comprimento do Cano
                              </label>
                              <input
                                value={row.comprimento_cano || ''}
                                onChange={e => updateBulkRow(index, 'comprimento_cano', e.target.value)}
                                placeholder="Ex: 114 mm, 102 mm"
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                              />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Capacidade do Carregador
                              </label>
                              <input
                                value={row.capacidade || ''}
                                onChange={e => updateBulkRow(index, 'capacidade', e.target.value)}
                                placeholder="Ex: 17, 15, 10"
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                              />
                            </div>

                            {rowTipoVal !== 'Revolver' && rowTipoVal !== 'Revólver' && (
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                  Nº de Carregadores
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={row.quantidade_carregadores !== undefined ? row.quantidade_carregadores : ''}
                                  onChange={e => updateBulkRow(index, 'quantidade_carregadores', e.target.value)}
                                  placeholder="Ex: 3"
                                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                />
                              </div>
                            )}
                          </>
                        )}

                        {/* EQUIPAMENTOS FIELDS */}
                        {form.categoria === 'Equipamentos' && (
                          <>
                            {rowTipoVal !== 'Distintivo' && (
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                  Modelo / Variação
                                </label>
                                {rowTipoVal === 'Algema' ? (
                                  <select
                                    value={row.modelo || ''}
                                    onChange={e => updateBulkRow(index, 'modelo', e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                  >
                                    <option value="">Selecione...</option>
                                    <option value="Corrente">Corrente</option>
                                    <option value="Dobradiça">Dobradiça</option>
                                  </select>
                                ) : row.isCustomModelo ? (
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <input
                                      value={row.customModelo}
                                      onChange={e => updateBulkRow(index, 'customModelo', e.target.value)}
                                      placeholder="Digite o modelo..."
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #3182ce', borderRadius: '4px' }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateBulkRow(index, 'isCustomModelo', false)}
                                      style={{ background: 'none', border: 'none', color: '#e53e3e', fontSize: '13px', cursor: 'pointer' }}
                                    >
                                      ✖
                                    </button>
                                  </div>
                                ) : (
                                  <select
                                    value={row.modelo || ''}
                                    onChange={e => {
                                      if (e.target.value === '__NEW__') {
                                        updateBulkRow(index, 'isCustomModelo', true);
                                        updateBulkRow(index, 'customModelo', '');
                                      } else {
                                        updateBulkRow(index, 'modelo', e.target.value);
                                      }
                                    }}
                                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                  >
                                    <option value="">Selecione...</option>
                                    {getModelosForTipoAndBrand(rowTipoVal, rowMarcaVal).map(m => (
                                      <option key={m} value={m}>{m}</option>
                                    ))}
                                    <option value="__NEW__">➕ Digitar Novo...</option>
                                  </select>
                                )}
                              </div>
                            )}

                            {rowTipoVal === 'Distintivo' && (
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                  Cargo *
                                </label>
                                {row.isCustomCargo ? (
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <input
                                      value={row.customCargo}
                                      onChange={e => updateBulkRow(index, 'customCargo', e.target.value)}
                                      placeholder="Digite o cargo..."
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #3182ce', borderRadius: '4px' }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateBulkRow(index, 'isCustomCargo', false)}
                                      style={{ background: 'none', border: 'none', color: '#e53e3e', fontSize: '13px', cursor: 'pointer' }}
                                    >
                                      ✖
                                    </button>
                                  </div>
                                ) : (
                                  <select
                                    value={row.cargo || ''}
                                    onChange={e => {
                                      if (e.target.value === '__NEW__') {
                                        updateBulkRow(index, 'isCustomCargo', true);
                                        updateBulkRow(index, 'customCargo', '');
                                      } else {
                                        updateBulkRow(index, 'cargo', e.target.value);
                                      }
                                    }}
                                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                  >
                                    <option value="">Selecione...</option>
                                    {cargosOptions.map(c => (
                                      <option key={c} value={c}>{c}</option>
                                    ))}
                                    <option value="__NEW__">➕ Outro...</option>
                                  </select>
                                )}
                              </div>
                            )}

                            {rowTipoVal === 'Rádio HT' && (
                              <>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                    Tipo de Rádio *
                                  </label>
                                  {row.isCustomTipoRadio ? (
                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                      <input
                                        value={row.customTipoRadio}
                                        onChange={e => updateBulkRow(index, 'customTipoRadio', e.target.value)}
                                        placeholder="Digite o tipo de rádio..."
                                        style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #3182ce', borderRadius: '4px' }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => updateBulkRow(index, 'isCustomTipoRadio', false)}
                                        style={{ background: 'none', border: 'none', color: '#e53e3e', fontSize: '13px', cursor: 'pointer' }}
                                      >
                                        ✖
                                      </button>
                                    </div>
                                  ) : (
                                    <select
                                      value={row.tipo_radio || ''}
                                      onChange={e => {
                                        if (e.target.value === '__NEW__') {
                                          updateBulkRow(index, 'isCustomTipoRadio', true);
                                          updateBulkRow(index, 'customTipoRadio', '');
                                        } else {
                                          updateBulkRow(index, 'tipo_radio', e.target.value);
                                        }
                                      }}
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                    >
                                      <option value="">Selecione...</option>
                                      <option value="Fixo">Fixo</option>
                                      <option value="Móvel">Móvel</option>
                                      <option value="HT">HT</option>
                                      <option value="__NEW__">➕ Digitar Novo...</option>
                                    </select>
                                  )}
                                </div>

                                <div className="form-group" style={{ marginBottom: 0 }}>
                                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                    Terminal ISS
                                  </label>
                                  <input
                                    value={row.terminal_iss || ''}
                                    onChange={e => updateBulkRow(index, 'terminal_iss', e.target.value)}
                                    placeholder="Terminal ISS..."
                                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                  />
                                </div>

                                {(row.tipo_radio === 'HT' || rowTipoVal === 'Rádio HT') && (
                                  <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                      Qtd de Baterias
                                    </label>
                                    <select
                                      value={row.qtd_baterias || ''}
                                      onChange={e => updateBulkRow(index, 'qtd_baterias', e.target.value)}
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                    >
                                      <option value="">Selecione...</option>
                                      <option value="1">1</option>
                                      <option value="2">2</option>
                                      <option value="3">3</option>
                                      <option value="4">4</option>
                                    </select>
                                  </div>
                                )}

                                {row.tipo_radio === 'Móvel' && (
                                  <>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                        Prefixo Viatura
                                      </label>
                                      <input
                                        value={row.prefixo_viatura || ''}
                                        onChange={e => updateBulkRow(index, 'prefixo_viatura', e.target.value)}
                                        placeholder="Ex: VTR-240"
                                        style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                      />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                        Placa Viatura
                                      </label>
                                      <input
                                        value={row.placa_viatura || ''}
                                        onChange={e => updateBulkRow(index, 'placa_viatura', e.target.value)}
                                        placeholder="Ex: BRA2E19"
                                        style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                                      />
                                    </div>
                                  </>
                                )}
                              </>
                            )}
                          </>
                        )}

                        {/* MUNIÇÕES FIELDS */}
                        {form.categoria === 'Munições' && (
                          <>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Calibre *
                              </label>
                              <select
                                value={row.calibre || ''}
                                onChange={e => {
                                  const newCal = e.target.value;
                                  const availSub = getSubtiposForCalibre(newCal);
                                  const nextSub = availSub.includes(row.subtipo) ? row.subtipo : (availSub[0] || '');
                                  setBulkRows(bulkRows.map((r, i) => i === index ? { ...r, calibre: newCal, subtipo: nextSub } : r));
                                }}
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                              >
                                <option value="">-- Selecione o Calibre --</option>
                                {calibresList.map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Subtipo / Projétil *
                              </label>
                              <select
                                value={row.subtipo || ''}
                                onChange={e => {
                                  const selectedSub = e.target.value;
                                  let derivedCal = row.calibre;
                                  if (['SS109', 'OTM', 'SAT'].includes(selectedSub)) {
                                    derivedCal = '5,56x45mm';
                                  } else if (['3T', 'SG', 'Balote', 'Antimotim'].includes(selectedSub)) {
                                    derivedCal = '12 GA';
                                  } else if (!derivedCal) {
                                    derivedCal = '9mm';
                                  }
                                  setBulkRows(bulkRows.map((r, i) => i === index ? { ...r, subtipo: selectedSub, calibre: derivedCal } : r));
                                }}
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                              >
                                <option value="">-- Selecione o Subtipo --</option>
                                {getSubtiposForCalibre(row.calibre || form.calibre || '9mm', row.subtipo).map(st => (
                                  <option key={st} value={st}>{st}</option>
                                ))}
                              </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Finalidade (Operacional / Treina) *
                              </label>
                              <select
                                value={row.tipo_municao || 'Operacional'}
                                onChange={e => updateBulkRow(index, 'tipo_municao', e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                              >
                                <option value="Operacional">Operacional</option>
                                <option value="Treina">Treina</option>
                              </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Nº do Lote de Munição *
                              </label>
                              <input
                                type="text"
                                value={row.lote || ''}
                                onChange={e => updateBulkRow(index, 'lote', e.target.value)}
                                placeholder="Ex: LOTE 2024-CBC-01"
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                              />
                            </div>
                          </>
                        )}

                        {/* PEÇAS GLOCK / SIG SAUER FIELDS */}
                        {(isPecasGlock || isPecasSigSauer) && (
                          <>
                            <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Peça Predefinida / Nomenclatura Técnica *
                              </label>
                              <select
                                value=""
                                onChange={(e) => {
                                  const idx = e.target.value;
                                  const list = isPecasGlock ? PECAS_GLOCK_LIST : PECAS_SIG_SAUER_LIST;
                                  const item = list[Number(idx)];
                                  if (item) {
                                    setBulkRows(bulkRows.map((r, i) => i === index ? {
                                      ...r,
                                      id_peca: item.id_peca,
                                      conjunto_funcional: item.conjunto_funcional,
                                      nomenclatura_tecnica: item.nomenclatura_tecnica,
                                      modelo: item.nomenclatura_tecnica
                                    } : r));
                                  }
                                }}
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                              >
                                <option value="">{row.nomenclatura_tecnica ? `${row.id_peca ? row.id_peca + ' - ' : ''}${row.nomenclatura_tecnica}` : 'Selecione a peça predefinida...'}</option>
                                {(isPecasGlock ? PECAS_GLOCK_LIST : PECAS_SIG_SAUER_LIST).map((p, pIdx) => (
                                  <option key={pIdx} value={pIdx}>
                                    {p.id_peca} - {p.nomenclatura_tecnica} ({p.conjunto_funcional})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                ID Peça
                              </label>
                              <input
                                value={row.id_peca || ''}
                                onChange={e => updateBulkRow(index, 'id_peca', e.target.value)}
                                placeholder="Ex: 1, 23..."
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                              />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Conjunto Funcional
                              </label>
                              <input
                                value={row.conjunto_funcional || ''}
                                onChange={e => updateBulkRow(index, 'conjunto_funcional', e.target.value)}
                                placeholder="Ex: Ferrolho / Armação..."
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                              />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4a5568', display: 'block', marginBottom: '4px' }}>
                                Função Logística / Descrição Técnica
                              </label>
                              <input
                                value={row.funcao_logistica || ''}
                                onChange={e => updateBulkRow(index, 'funcao_logistica', e.target.value)}
                                placeholder="Descrição técnica..."
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                              />
                            </div>
                          </>
                        )}

                        {/* TOMBO & NÚMERO DE SÉRIE CAMPOS INDIVIDUAIS DO ITEM */}
                        {!isUniformes && !isMunicoes && !isPecasGlock && !isPecasSigSauer && (
                          <>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#2b6cb0', display: 'block', marginBottom: '4px' }}>
                                Tombo / Patrimônio Inicial
                              </label>
                              <input
                                value={row.numero_tombo || ''}
                                onChange={e => updateBulkRow(index, 'numero_tombo', e.target.value)}
                                placeholder="Ex: TOM000 ou 1000"
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px', backgroundColor: '#f7fafc' }}
                              />
                              {row.numero_tombo && (
                                <div style={{ fontSize: '10px', color: '#2b6cb0', marginTop: '3px' }}>
                                  ℹ️ Seqüência: <strong>{getSequencePreview(row.numero_tombo, Number(row.qtd_total || 1))}</strong>
                                </div>
                              )}
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#2b6cb0', display: 'block', marginBottom: '4px' }}>
                                Nº de Série Inicial
                              </label>
                              <input
                                value={row.serie || ''}
                                onChange={e => updateBulkRow(index, 'serie', e.target.value)}
                                placeholder="Ex: CNW000"
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px', backgroundColor: '#f7fafc' }}
                              />
                              {row.serie && (
                                <div style={{ fontSize: '10px', color: '#2b6cb0', marginTop: '3px' }}>
                                  ℹ️ Seqüência: <strong>{getSequencePreview(row.serie, Number(row.qtd_total || 1))}</strong>
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {/* QUANTIDADE ADQUIRIDA */}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#2b6cb0', display: 'block', marginBottom: '4px' }}>
                            Qtd Adquirida (Unidades) *
                          </label>
                          <input
                            type="text"
                            value={row.qtd_total !== undefined && row.qtd_total !== null ? row.qtd_total : ''}
                            onChange={e => updateBulkRow(index, 'qtd_total', e.target.value.replace(/\D/g, ''))}
                            placeholder="1"
                            style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e0', borderRadius: '4px', fontWeight: 'bold' }}
                          />
                        </div>

                        {/* VALOR UNITÁRIO (R$) */}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#2b6cb0', display: 'block', marginBottom: '4px' }}>
                            Valor Unitário (R$) *
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #cbd5e0', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#fff' }}>
                            <span style={{ padding: '6px 8px', backgroundColor: '#edf2f7', color: '#4a5568', fontSize: '12px', fontWeight: 'bold', borderRight: '1px solid #cbd5e0' }}>R$</span>
                            <input
                              type="text"
                              value={row.valor_compra !== undefined && row.valor_compra !== null ? row.valor_compra : ''}
                              onChange={e => updateBulkRow(index, 'valor_compra', formatCurrencyInput(e.target.value))}
                              onBlur={() => {
                                if (row.valor_compra) {
                                  updateBulkRow(index, 'valor_compra', formatCurrencyInput(parseCurrencyBRL(row.valor_compra)));
                                }
                              }}
                              placeholder="0,00"
                              style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: 'none', textAlign: 'right', fontWeight: 'bold' }}
                            />
                          </div>
                        </div>

                        {/* SUBTOTAL CARD DISPLAY */}
                        <div className="form-group" style={{ marginBottom: 0, backgroundColor: '#f7fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#718096', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                            Subtotal Desta Caixa
                          </span>
                          <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#2b6cb0', marginTop: '2px' }}>
                            R$ {rowSubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>

              {/* BOTTOM FOOTER SUMMARY AND ADD BUTTON */}
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ebf8ff', padding: '14px 18px', borderRadius: '8px', border: '1px solid #bee3f8', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      const lastRow = bulkRows[bulkRows.length - 1];
                      const rowTipo = lastRow?.tipo || form.tipo || (uniqueTipos[0] || '');
                      const rowMarca = lastRow?.marca || form.marca || (getMarcasForTipo(rowTipo)[0] || '');
                      setBulkRows([...bulkRows, {
                        tipo: rowTipo,
                        customTipo: lastRow?.customTipo || '',
                        isCustomTipo: lastRow?.isCustomTipo || false,
                        marca: rowMarca,
                        customMarca: lastRow?.customMarca || '',
                        isCustomMarca: lastRow?.isCustomMarca || false,
                        tamanho: '', customTamanho: '', isCustomTamanho: false,
                        sexo: lastRow?.sexo || 'Masculino',
                        cargo: '', customCargo: '', isCustomCargo: false,
                        modelo: '', customModelo: '', isCustomModelo: false,
                        calibre: lastRow?.calibre || form.calibre || (form.categoria === 'Munições' ? '9mm' : ''),
                        subtipo: lastRow?.subtipo || form.subtipo || (form.categoria === 'Munições' ? 'Ogival' : ''),
                        tipo_municao: lastRow?.tipo_municao || form.tipo_municao || 'Operacional',
                        nivel: lastRow?.nivel || form.nivel || 'IIIA',
                        id_peca: '', conjunto_funcional: '', nomenclatura_tecnica: '',
                        qtd_total: '',
                        valor_compra: lastRow?.valor_compra !== undefined && lastRow.valor_compra !== null ? lastRow.valor_compra : (form.valor_compra || '')
                      }]);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    ➕ Adicionar Outra Caixa de Item ao Lote
                  </button>

                  <span style={{ fontSize: '12px', color: '#2b6cb0', fontWeight: '600' }}>
                    📦 Total: <strong>{bulkRows.length}</strong> caixa(s) / <strong>{bulkRows.reduce((acc, r) => acc + (Number(r.qtd_total) || 1), 0)}</strong> unidade(s)
                  </span>
                </div>

                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#2c5282' }}>
                  Valor Total Estimado do Lote: R$ {bulkRows.reduce((acc, r) => acc + ((Number(r.qtd_total) || 1) * parseCurrencyBRL(r.valor_compra !== undefined && r.valor_compra !== '' ? r.valor_compra : form.valor_compra)), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
            </>
          ) : (
            <div style={{ gridColumn: 'span 2', padding: '24px', textAlign: 'center', backgroundColor: '#f7fafc', borderRadius: '8px', color: '#4a5568', border: '1px dashed #cbd5e0', marginTop: '12px' }}>
              ℹ️ Por favor, <strong>selecione uma Categoria</strong> acima para carregar as opções e campos específicos deste item.
            </div>
          )}
        </div>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        title={confirmModal.type === 'lancar' ? '📥 Confirmar Lançamento no Inventário' : '🗑️ Confirmar Remoção'}
        onClose={() => setConfirmModal({ isOpen: false, type: '', data: null })}
        footer={(
          <>
            <button 
              className="btn btn-outline" 
              onClick={() => setConfirmModal({ isOpen: false, type: '', data: null })}
            >
              Cancelar
            </button>
            <button 
              className={confirmModal.type === 'lancar' ? "btn btn-primary" : "btn btn-red"} 
              onClick={confirmModal.type === 'lancar' ? confirmLancarNoInventario : confirmDelete}
            >
              {confirmModal.type === 'lancar' ? 'Confirmar Lançamento' : 'Confirmar Remoção'}
            </button>
          </>
        )}
      >
        {confirmModal.type === 'lancar' && confirmModal.data && (
          <div>
            <p style={{ marginBottom: '12px', fontSize: '14px', lineHeight: '1.5' }}>
              Deseja lançar o item <strong>{confirmModal.data.descricao}</strong> no inventário de estoque ativo?
            </p>
            <div style={{ backgroundColor: '#f7fafc', padding: '12px', borderRadius: '6px', fontSize: '13px', border: '1px solid #e2e8f0' }}>
              <div style={{ marginBottom: '4px' }}><strong>Categoria:</strong> {confirmModal.data.categoria}</div>
              <div style={{ marginBottom: '4px' }}><strong>Quantidade:</strong> {confirmModal.data.qtd_total} unidades</div>
              {confirmModal.data.marca && <div style={{ marginBottom: '4px' }}><strong>Marca:</strong> {confirmModal.data.marca}</div>}
              {confirmModal.data.modelo && <div style={{ marginBottom: '4px' }}><strong>Modelo:</strong> {confirmModal.data.modelo}</div>}
              {confirmModal.data.numero_tombo && <div style={{ marginBottom: '4px' }}><strong>Tombo Inicial:</strong> {confirmModal.data.numero_tombo}</div>}
              {confirmModal.data.serie && <div style={{ marginBottom: '4px' }}><strong>Série Inicial:</strong> {confirmModal.data.serie}</div>}
            </div>
            <p style={{ marginTop: '12px', fontSize: '12px', color: '#718096' }}>
              {(confirmModal.data.categoria?.toLowerCase() === 'munições' || confirmModal.data.categoria?.toLowerCase() === 'municoes') ? (
                <span>
                  ℹ️ <strong>Munições são itens de consumo em massa:</strong> Isso criará o registro de estoque unificado para a quantidade de <strong>{confirmModal.data.qtd_total} unidades</strong> ({getAmmunitionDetails(confirmModal.data.descricao || confirmModal.data.modelo, confirmModal.data.qtd_total).lots} lote(s) e {getAmmunitionDetails(confirmModal.data.descricao || confirmModal.data.modelo, confirmModal.data.qtd_total).boxes} caixa(s)). Não serão gerados registros individuais por projétil no banco de dados, garantindo máxima performance do sistema.
                </span>
              ) : (
                `Isso criará o item de estoque e gerará ${confirmModal.data.qtd_total} bem(bens) individuais no sistema.`
              )}
            </p>
          </div>
        )}

        {confirmModal.type === 'delete' && (
          <div>
            <p style={{ fontSize: '14px' }}>
              Deseja realmente remover este registro de compra? Esta ação não pode ser desfeita e removerá os dados permanentemente.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default CadItensCompra;
