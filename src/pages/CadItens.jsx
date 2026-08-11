import React, { useEffect, useRef, useState, useMemo } from 'react';
import { apiService } from '../services/api';
import Modal from '../components/Modal';
import { getMenuOptions } from '../services/menuOptions';
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

/* eslint-disable react/prop-types */

const INVENTARIO_ARMAS = {
  categoria: 'Armas',
  tipos: {
    Pistola: {
      calibres: ['9mm', '.40'],
      marcas: {
        GLOCK: ['G17', 'G19', 'G26'],
        'SIG SAUER': ['P320'],
        TAURUS: ['PT-100', 'PT-101', 'PT-640', 'PT-840', 'PT-940', 'PT-24/7'],
        BERETTA: ['APX'],
      },
    },
    'Revólver': {
      calibres: ['.38'],
      marcas: {
        TAURUS: ['Padrão'],
      },
    },
    'Fuzil': {
      calibres: ['5,56x45mm'],
      marcas: {
        'RADICAL FIREARMS': ['RF 14 5.56'],
        IMBEL: ['IA2'],
        BUSHMASTER: ['XM15E25'],
      },
    },
    'Fuzil Sniper': {
      calibres: ['7,62x51mm'],
      marcas: {
        ARMALITE: ['AR10'],
        IMBEL: ['PSG1'],
      },
    },
    Carabina: {
      calibres: ['9mm', '.40', '.45'],
      marcas: {
        'SIG SAUER': ['MPX'],
        TAURUS: ['CT .40', 'CTT .40', 'SMT .40', 'MT 9mm', 'MT .40', 'MT12'],
        HK: ['MP5KA4', 'MP5A5'],
        INA: ['MB50'],
      },
    },
    Espingarda: {
      calibres: ['12'],
      marcas: {
        BENELLI: ['M3A1'],
        CBC: ['586', '151', '586P'],
        BOITO: ['BSA 5T 84'],
        ROSSI: ['OVERLAND'],
      },
    },
  },
};

const CALIBRES_AUTOMATICOS_ARMAS = {
  Pistola: {
    GLOCK: {
      G17: ['9mm'],
      G19: ['9mm'],
      G26: ['9mm'],
    },
    'SIG SAUER': {
      P320: ['9mm', '.40'],
    },
    TAURUS: {
      'PT-100': ['.40'],
      'PT-101': ['.40'],
      'PT-640': ['.40'],
      'PT-840': ['.40'],
      'PT-940': ['.40'],
      'PT-24/7': ['.40'],
    },
    BERETTA: {
      APX: ['9mm'],
    },
  },
  'Revólver': {
    TAURUS: {
      Padrão: ['.38'],
    },
  },
  'Fuzil': {
    'RADICAL FIREARMS': {
      'RF 14 5.56': ['5,56x45mm'],
    },
    IMBEL: {
      IA2: ['5,56x45mm'],
    },
    BUSHMASTER: {
      XM15E25: ['5,56x45mm'],
    },
  },
  'Fuzil Sniper': {
    ARMALITE: {
      AR10: ['7,62x51mm'],
    },
    IMBEL: {
      PSG1: ['7,62x51mm'],
    },
  },
  Carabina: {
    'SIG SAUER': {
      MPX: ['9mm'],
    },
    TAURUS: {
      'CT .40': ['.40'],
      'CTT .40': ['.40'],
      'SMT .40': ['.40'],
      'MT 9mm': ['9mm'],
      'MT .40': ['.40'],
      MT12: ['9mm'],
    },
    HK: {
      MP5KA4: ['9mm'],
      MP5A5: ['9mm'],
    },
    INA: {
      MB50: ['.45'],
    },
  },
  Espingarda: {
    BENELLI: {
      M3A1: ['12'],
    },
    CBC: {
      586: ['12'],
      151: ['12'],
      '586P': ['12'],
    },
    BOITO: {
      'BSA 5T 84': ['12'],
    },
    ROSSI: {
      OVERLAND: ['12'],
    },
  },
};

const INVENTARIO_COLETES = {
  categoria: 'Coletes',
  marcas: ['Protecta', 'Imbraland'],
  niveis: ['IIIA'],
  tamanhos: ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'],
  sexos: ['Feminino', 'Masculino'],
};

const MODELOS_DRONES = [
  'MAVIC 3T',
  'MAVIC MINI',
  'MAVIC PRO',
  'MAVIC 2 ENTERPRISE',
  'MAVIC SPARK',
  'PHANTOM 4 PRO',
  'MATRICE 300',
  'MAVIC 3 PRO',
  'MAVIC MINI 2',
  'PHANTOM 4 ADVANCED',
  'PHANTOM 1'
];

const INVENTARIO_EQUIPAMENTOS = {
  categoria: 'Equipamentos',
  tipos: {
    'Rádio HT': {
      marcas: ['Hytera', 'Motorola'],
      modelos: [],
      marcaObrigatoria: true,
      modeloObrigatorio: false,
    },
    Drones: {
      marcas: ['DJI'],
      modelos: MODELOS_DRONES,
      marcaObrigatoria: true,
      modeloObrigatorio: true,
    },
    'Detector de Metal': {
      marcas: [],
      modelos: [],
      marcaObrigatoria: false,
      modeloObrigatorio: false,
    },
    Algema: {
      marcas: [],
      modelos: ['CORRENTE', 'DOBRADIÇA'],
      marcaObrigatoria: false,
      modeloObrigatorio: true,
    },
    'Kit Arrombamento': {
      marcas: [],
      modelos: [],
      marcaObrigatoria: false,
      modeloObrigatorio: false,
    },
    Distintivo: {
      marcas: [],
      modelos: [],
      marcaObrigatoria: false,
      modeloObrigatorio: false,
    },
  },
};

const INVENTARIO_UNIFORMES = {
  categoria: 'Uniformes',
  sexos: ['Unissex', 'Masculino', 'Feminino'],
  tamanhos: ['PP', 'P', 'M', 'G', 'GG', 'EG', 'XG'],
  cargos: ['DPC', 'OIP', 'IPC', 'EPC'],
  tipos: {
    'Calça Tática': { exigeSexo: true, exigeTamanho: true, exigeCargo: false },
    'Camisa Gola Polo': { exigeSexo: true, exigeTamanho: true, exigeCargo: true },
    'Cinto Operacional': { exigeSexo: false, exigeTamanho: true, exigeCargo: false },
    'Jaqueta Tática': { exigeSexo: false, exigeTamanho: true, exigeCargo: false },
    'Capa de Chuva': { exigeSexo: false, exigeTamanho: true, exigeCargo: false },
    'Bota Tática': { exigeSexo: false, exigeTamanho: true, exigeCargo: false }
  },
};

const CATEGORIAS_INVENTARIO = [
  INVENTARIO_ARMAS.categoria,
  INVENTARIO_COLETES.categoria,
  INVENTARIO_EQUIPAMENTOS.categoria,
  INVENTARIO_UNIFORMES.categoria,
  'Munições',
  'Peças Glock',
  'Peças Sig Sauer',
];

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

const ITEM_STATUS_OPTIONS = [
  'Disponivel',
  'Em Uso',
  'Manutencao',
  'Inservivel',
  'Perdida',
  'Furtada',
  'Roubada',
  'Destruida',
  'Recolhida',
  'Ressarcida',
  'Apreendida',
];

function getDescricaoMunicao(calibre, marca, subtipo, tipoMunicao) {
  return ['Munição', calibre, subtipo, tipoMunicao, marca].filter(Boolean).join(' ');
}

function getDescricaoArma(tipo, marca, modelo, calibre) {
  return [tipo, marca, modelo, calibre].filter(Boolean).join(' ');
}

function getDescricaoColete(marca, nivel, tamanho, sexo) {
  return ['Colete', marca, `Nivel ${nivel}`, `Tam ${tamanho}`, sexo].filter(Boolean).join(' ');
}

function getDescricaoEquipamento(tipo, marca, modelo, cargo) {
  if (tipo === 'Distintivo') {
    return [tipo, cargo].filter(Boolean).join(' ');
  }
  return [tipo, marca, modelo].filter(Boolean).join(' ');
}

function getDescricaoUniforme(tipo, sexo, tamanho, cargo) {
  return [tipo, sexo, `Tam ${tamanho}`, cargo].filter(Boolean).join(' ');
}

const MODELO_PLANILHA_HEADERS = [
  'categoria',
  'tipo',
  'calibre',
  'marca',
  'modelo',
  'nivel',
  'tamanho',
  'sexo',
  'cargo',
  'serie',
  'qtd_total',
  'qtd_disp',
  'qtd_min',
  'status',
  'descricao',
  'patrimonio',
  'dt_aq',
  'dt_val',
  'obs',
];

const MODELO_PLANILHA_EXEMPLOS = [
  {
    categoria: 'Armas',
    tipo: 'Pistola',
    calibre: '9mm',
    marca: 'Glock',
    modelo: 'G17',
    nivel: '',
    tamanho: '',
    sexo: '',
    cargo: '',
    serie: 'ARM-0001',
    qtd_total: '10',
    qtd_disp: '10',
    qtd_min: '2',
    status: 'Disponivel',
    descricao: '',
    patrimonio: '',
    dt_aq: '',
    dt_val: '',
    obs: '',
  },
  {
    categoria: 'Coletes',
    tipo: '',
    calibre: '',
    marca: 'Protecta',
    modelo: '',
    nivel: 'IIIA',
    tamanho: 'M',
    sexo: 'Masculino',
    cargo: '',
    serie: 'COL-001',
    qtd_total: '8',
    qtd_disp: '8',
    qtd_min: '2',
    status: 'Disponivel',
    descricao: '',
    patrimonio: '',
    dt_aq: '',
    dt_val: '',
    obs: '',
  },
  {
    categoria: 'Equipamentos',
    tipo: 'Drones',
    calibre: '',
    marca: 'DJI',
    modelo: 'MAVIC 3T',
    nivel: '',
    tamanho: '',
    sexo: '',
    cargo: '',
    serie: 'DRN-001',
    qtd_total: '2',
    qtd_disp: '2',
    qtd_min: '1',
    status: 'Disponivel',
    descricao: '',
    patrimonio: '',
    dt_aq: '',
    dt_val: '',
    obs: '',
  },
  {
    categoria: 'Uniformes',
    tipo: 'Calça Tática',
    calibre: '',
    marca: '',
    modelo: '',
    nivel: '',
    tamanho: 'G',
    sexo: 'Feminino',
    cargo: '',
    serie: '',
    qtd_total: '20',
    qtd_disp: '20',
    qtd_min: '5',
    status: 'Disponivel',
    descricao: '',
    patrimonio: '',
    dt_aq: '',
    dt_val: '',
    obs: '',
  },
];

function normalizarTexto(valor) {
  return String(valor || '').trim();
}

function normalizarSerie(valor) {
  return String(valor || '').replace(/\s+/g, '').toUpperCase();
}

function detectarSeparadorCsv(linha) {
  const texto = String(linha || '');
  const pontosVirgula = (texto.match(/;/g) || []).length;
  const virgulas = (texto.match(/,/g) || []).length;
  return pontosVirgula >= virgulas ? ';' : ',';
}

function parseLinhaCsv(linha, separador) {
  const out = [];
  let atual = '';
  let emAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const ch = linha[i];
    if (ch === '"') {
      if (emAspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else {
        emAspas = !emAspas;
      }
      continue;
    }

    if (ch === separador && !emAspas) {
      out.push(atual.trim());
      atual = '';
      continue;
    }

    atual += ch;
  }

  out.push(atual.trim());
  return out;
}

function parseInteiroPositivo(valor, fallback) {
  const n = Number.parseInt(String(valor || '').trim(), 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

function escapeCsv(valor) {
  const texto = String(valor ?? '');
  if (texto.includes(';') || texto.includes('"') || texto.includes('\n')) {
    return `"${texto.replaceAll('"', '""')}"`;
  }
  return texto;
}

function montarDescricaoImportacao(registro) {
  const categoria = normalizarTexto(registro.categoria);
  const catLower = (categoria || '').toLowerCase();
  if (catLower === INVENTARIO_ARMAS.categoria.toLowerCase() || catLower === 'armas') {
    return getDescricaoArma(registro.tipo, registro.marca, registro.modelo, registro.calibre);
  }
  if (catLower === INVENTARIO_COLETES.categoria.toLowerCase() || catLower === 'coletes') {
    return getDescricaoColete(registro.marca, registro.nivel, registro.tamanho, registro.sexo);
  }
  if (catLower === INVENTARIO_EQUIPAMENTOS.categoria.toLowerCase() || catLower === 'equipamentos') {
    return getDescricaoEquipamento(registro.tipo, registro.marca, registro.modelo, registro.cargo);
  }
  if (catLower === INVENTARIO_UNIFORMES.categoria.toLowerCase() || catLower === 'uniformes' || catLower.includes('uniforme')) {
    return getDescricaoUniforme(registro.tipo, registro.sexo, registro.tamanho, registro.cargo);
  }
  if (catLower === 'munições' || catLower === 'municoes' || catLower.includes('muni')) {
    return getDescricaoMunicao(registro.calibre, registro.marca, registro.subtipo || extractSubtipoFromDesc(registro.descricao), registro.tipo_municao);
  }
  return '';
}

function getCalibresDoModeloArma(tipo, marca, modelo, tipoArmaAtual) {
  if (!tipo || !marca || !modelo) return [];
  const porTipo = CALIBRES_AUTOMATICOS_ARMAS[tipo] || {};
  const porMarca = porTipo[marca] || {};
  const porModelo = porMarca[modelo] || [];
  if (porModelo.length > 0) return porModelo;
  return tipoArmaAtual ? tipoArmaAtual.calibres : [];
}

function mapToSelectOptions(values) {
  return values.map((value) => ({ value, label: value }));
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function CadItens() {
  const { can, currentUser } = useAuth();
  const fileInputRef = useRef(null);

  const getArmasMarcas = () => {
    if (form.tipo === 'Pistola') return ['Glock', 'Sig Sauer', 'Taurus', 'Bereta'];
    if (form.tipo === 'Fuzil') return ['Radical Firearms', 'Imbel', 'Bushmaster'];
    if (form.tipo === 'Fuzil Sniper') return ['Armalite', 'Imbel'];
    if (form.tipo === 'Carabina') return ['SigSauer', 'Taurus', 'HK', 'INA'];
    if (form.tipo === 'Espingarda') return ['Benelli', 'CBC', 'Boito', 'Rossi'];
    return [];
  };

  const getArmasModelos = () => {
    if (form.tipo === 'Pistola') {
      if (form.marca === 'Glock') return ['G17', 'G19', 'G26'];
      if (form.marca === 'Sig Sauer') return ['P320'];
      if (form.marca === 'Taurus') return ['PT-100', 'PT-101', 'PT-640', 'PT-840', 'PT-940', 'PT-24/7'];
      if (form.marca === 'Bereta') return ['APX'];
    }
    if (form.tipo === 'Fuzil') {
      if (form.marca === 'Radical Firearms') return ['RF 14'];
      if (form.marca === 'Imbel') return ['IA2'];
      if (form.marca === 'Bushmaster') return ['XM15E25'];
    }
    if (form.tipo === 'Fuzil Sniper') {
      if (form.marca === 'Armalite') return ['AR10'];
      if (form.marca === 'Imbel') return ['PSG1'];
    }
    if (form.tipo === 'Carabina') {
      if (form.marca === 'SigSauer') return ['MPX'];
      if (form.marca === 'Taurus') return ['CT .40', 'CTT .40', 'SMT .40', 'MT 9mm', 'MT .40', 'MT12 (9mm)'];
      if (form.marca === 'HK') return ['MP5KA4', 'MP5A5'];
      if (form.marca === 'INA') return ['MB50'];
    }
    if (form.tipo === 'Espingarda') {
      if (form.marca === 'Benelli') return ['M3A1'];
      if (form.marca === 'CBC') return ['586', '151', '586P'];
      if (form.marca === 'Boito') return ['BSA 5T 84'];
      if (form.marca === 'Rossi') return ['OVERLAND'];
    }
    return [];
  };

  const getArmasCalibres = () => {
    if (form.tipo === 'Pistola') return ['9mm', '.40', '.380'];
    if (form.tipo === 'Fuzil') return ['5,56x45mm'];
    if (form.tipo === 'Fuzil Sniper') return ['7,62x51mm'];
    if (form.tipo === 'Carabina') return ['9mm', '.40', '.45'];
    if (form.tipo === 'Espingarda') return ['12'];
    if (form.tipo === 'Revolver') return ['.38', '.357'];
    return [];
  };

  const [rows, setRows] = useState([]);
  const [groupByVariation, setGroupByVariation] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [categoriasMenu, setCategoriasMenu] = useState([]);
  const [selectedItemDetails, setSelectedItemDetails] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [bensIndividuais, setBensIndividuais] = useState([]);
  const [loadingBens, setLoadingBens] = useState(false);
  const [itemCompras, setItemCompras] = useState([]);
  const [loadingCompras, setLoadingCompras] = useState(false);
  const [fornecedores, setFornecedores] = useState([]);
  const [selectedCompraDetails, setSelectedCompraDetails] = useState(null);
  const [bensFilters, setBensFilters] = useState({
    patrimonio: '',
    serie: '',
    status: '',
    tamanho: '',
    sexo: '',
  });
  const [editingBemId, setEditingBemId] = useState(null);
  const [bemForm, setBemForm] = useState({
    patrimonio: '',
    serie: '',
    status: 'Disponivel',
    tamanho: '',
    sexo: '',
    dt_val: '',
    obs: '',
  });
  const [editingId, setEditingId] = useState(null);
  const [tiposArmasMenu, setTiposArmasMenu] = useState([]);
  const [tiposEquipamentosMenu, setTiposEquipamentosMenu] = useState([]);
  const [tiposUniformesMenu, setTiposUniformesMenu] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeDestId, setMergeDestId] = useState('');
  const [merging, setMerging] = useState(false);

  const [bensPage, setBensPage] = useState(1);
  const bensItemsPerPage = 50;

  const [inventoryPage, setInventoryPage] = useState(1);
  const inventoryItemsPerPage = 50;

  const [customFieldsActive, setCustomFieldsActive] = useState({});
  const [customFieldsVal, setCustomFieldsVal] = useState({});

  useEffect(() => {
    setBensPage(1);
  }, [bensFilters, bensIndividuais, selectedItemDetails]);

  useEffect(() => {
    setInventoryPage(1);
  }, [search, statusFilter, groupByVariation]);

  const [form, setForm] = useState({
    categoria: INVENTARIO_ARMAS.categoria,
    tipo: '',
    calibre: '',
    subtipo: '',
    marca: '',
    modelo: '',
    nivel: '',
    tamanho: '',
    sexo: '',
    cargo: '',
    patrimonio: '',
    serie: '',
    qtd_total: 1,
    qtd_disp: 1,
    qtd_min: 1,
    status: 'Disponivel',
    dt_val: '',
    comp_cano: '',
    capacidade: '',
    carregadores: '',
    tipo_radio: '',
    terminal_iss: '',
    qtd_baterias: '',
    prefixo_viatura: '',
    placa_viatura: '',
    material: '',
    tipo_elo: '',
    itens_kit: '',
    lote: '',
    tipo_municao: 'Operacional',
    fornecedor_id: '',
    dt_aq: '',
    valor_compra: '',
    id_peca: '',
    conjunto_funcional: '',
    nomenclatura_tecnica: '',
    funcao_logistica: '',
  });

  const renderSelectOrInput = (id, label, fieldName, options, isRequired = false) => {
    const isCustom = !!customFieldsActive[fieldName];
    const currentVal = form[fieldName] || '';

    const combinedOptions = [];
    // Ensure unique values and preserve order
    options.forEach(opt => {
      if (opt && !combinedOptions.includes(opt)) {
        combinedOptions.push(opt);
      }
    });
    if (currentVal && !combinedOptions.includes(currentVal)) {
      combinedOptions.push(currentVal);
    }

    const handleSelectChange = (e) => {
      const val = e.target.value;
      if (val === '__NEW__') {
        setCustomFieldsActive(prev => ({ ...prev, [fieldName]: true }));
        setCustomFieldsVal(prev => ({ ...prev, [fieldName]: '' }));
        setForm(p => ({ ...p, [fieldName]: '' }));
      } else {
        setForm(p => {
          const updated = { ...p, [fieldName]: val };
          if (fieldName === 'tipo') {
            updated.marca = '';
            updated.modelo = '';
            updated.tipo_radio = '';
            updated.terminal_iss = '';
            updated.qtd_baterias = '';
            updated.prefixo_viatura = '';
            updated.placa_viatura = '';
            updated.material = '';
            updated.tipo_elo = '';
            updated.itens_kit = '';
          }
          if (fieldName === 'modelo' && p.categoria === 'Armas') {
            updated.calibre = '';
            updated.comp_cano = '';
            updated.capacidade = '';
            updated.carregadores = '';
          }
          return updated;
        });
      }
    };

    const handleInputChange = (e) => {
      const val = e.target.value;
      setCustomFieldsVal(prev => ({ ...prev, [fieldName]: val }));
      setForm(p => ({ ...p, [fieldName]: val }));
    };

    const handleCancelCustom = () => {
      setCustomFieldsActive(prev => ({ ...prev, [fieldName]: false }));
      setForm(p => ({ ...p, [fieldName]: '' }));
    };

    return (
      <div className="form-group" key={fieldName}>
        <label htmlFor={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{label} {isRequired ? '*' : ''}</span>
          {isCustom && (
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
              onClick={handleCancelCustom}
            >
              ✖ Escolher Existente
            </button>
          )}
        </label>
        {isCustom ? (
          <input
            id={id}
            value={customFieldsVal[fieldName] || ''}
            onChange={handleInputChange}
            placeholder={`Digite o novo ${label.toLowerCase()}...`}
            className="form-control"
            style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
            autoFocus
          />
        ) : (
          <select
            id={id}
            value={currentVal}
            onChange={handleSelectChange}
            className="form-control"
            style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
          >
            <option value="">Selecione...</option>
            {combinedOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
            <option value="__NEW__">➕ Cadastrar Novo...</option>
          </select>
        )}
      </div>
    );
  };

  const isArmas = form.categoria === INVENTARIO_ARMAS.categoria;
  const isColetes = form.categoria === INVENTARIO_COLETES.categoria;
  const isEquipamentos = form.categoria === INVENTARIO_EQUIPAMENTOS.categoria;
  const isUniformes = form.categoria === INVENTARIO_UNIFORMES.categoria;
  const isMunicoes = form.categoria === 'Munições';
  const isPecasGlock = form.categoria === 'Peças Glock';
  const isPecasSigSauer = form.categoria === 'Peças Sig Sauer';

  const tipoArmaAtual = form.tipo ? INVENTARIO_ARMAS.tipos[form.tipo] : null;
  const tipoEquipamentoAtual = form.tipo ? INVENTARIO_EQUIPAMENTOS.tipos[form.tipo] : null;
  const tipoUniformeAtual = form.tipo ? INVENTARIO_UNIFORMES.tipos[form.tipo] : null;

  let tipoOptions = [];
  if (isArmas) {
    tipoOptions = tiposArmasMenu.length > 0 ? tiposArmasMenu : mapToSelectOptions(Object.keys(INVENTARIO_ARMAS.tipos));
  }
  if (isEquipamentos) {
    tipoOptions = tiposEquipamentosMenu.length > 0 ? tiposEquipamentosMenu : mapToSelectOptions(Object.keys(INVENTARIO_EQUIPAMENTOS.tipos));
  }
  if (isUniformes) {
    tipoOptions = tiposUniformesMenu.length > 0 ? tiposUniformesMenu : mapToSelectOptions(Object.keys(INVENTARIO_UNIFORMES.tipos));
  }

  const categoriaOptions = categoriasMenu.length > 0 ? categoriasMenu : mapToSelectOptions(CATEGORIAS_INVENTARIO);

  const calibresDoModeloArma = getCalibresDoModeloArma(form.tipo, form.marca, form.modelo, tipoArmaAtual);
  const calibreOptions = isArmas ? calibresDoModeloArma : [];
  const calibreAutomatico = isArmas && calibreOptions.length === 1;
  let marcaOptions = [];
  if (isColetes) {
    marcaOptions = INVENTARIO_COLETES.marcas;
  }
  if (isArmas) {
    marcaOptions = tipoArmaAtual ? Object.keys(tipoArmaAtual.marcas) : [];
  }
  if (isEquipamentos) {
    marcaOptions = tipoEquipamentoAtual ? tipoEquipamentoAtual.marcas : [];
  }

  let modeloOptions = [];
  if (isArmas && tipoArmaAtual && form.marca) {
    modeloOptions = tipoArmaAtual.marcas[form.marca] || [];
  }
  if (isEquipamentos) {
    modeloOptions = tipoEquipamentoAtual ? tipoEquipamentoAtual.modelos : [];
  }

  let marcaPlaceholder = 'Selecione...';
  if (isArmas) {
    marcaPlaceholder = form.tipo ? 'Selecione...' : 'Selecione o tipo primeiro';
  }
  if (isEquipamentos) {
    marcaPlaceholder = marcaOptions.length ? 'Selecione...' : 'Não se aplica';
  }

  let modeloPlaceholder = 'Selecione...';
  if (isArmas) {
    modeloPlaceholder = form.marca ? 'Selecione...' : 'Selecione a marca primeiro';
  }

  let calibrePlaceholder = 'Selecione o tipo primeiro';
  if (form.tipo) {
    calibrePlaceholder = form.modelo ? 'Selecione...' : 'Selecione o modelo primeiro';
  }
  if (isEquipamentos) {
    if (!form.tipo) {
      modeloPlaceholder = 'Selecione o tipo primeiro';
    } else if (modeloOptions.length === 0) {
      modeloPlaceholder = 'Não se aplica';
    } else {
      modeloPlaceholder = 'Selecione...';
    }
  }

  let descricao = getDescricaoColete(form.marca, form.nivel, form.tamanho, form.sexo);
  if (isArmas) {
    descricao = getDescricaoArma(form.tipo, form.marca, form.modelo, form.calibre);
  }
  if (isEquipamentos) {
    descricao = getDescricaoEquipamento(form.tipo, form.marca, form.modelo, form.cargo);
  }
  if (isUniformes) {
    descricao = getDescricaoUniforme(form.tipo, form.sexo, form.tamanho, form.cargo);
  }
  if (isMunicoes) {
    descricao = getDescricaoMunicao(form.calibre, form.marca, form.subtipo, form.tipo_municao);
  }
  if (isPecasGlock || isPecasSigSauer) {
    descricao = [form.nomenclatura_tecnica, form.conjunto_funcional ? `(${form.conjunto_funcional})` : ''].filter(Boolean).join(' ');
  }

  useEffect(() => {
    if (isMunicoes) {
      setForm(prev => {
        if (prev.modelo !== prev.calibre) {
          return { ...prev, modelo: prev.calibre };
        }
        return prev;
      });
    }
  }, [isMunicoes, form.calibre]);

  useEffect(() => {
    if (!isArmas) return;
    if (!form.tipo || !form.marca || !form.modelo) return;

    const gunTypeKey = Object.keys(ARMAS_LOOKUP).find(k => k.toLowerCase() === form.tipo?.toLowerCase());
    const gunType = gunTypeKey ? ARMAS_LOOKUP[gunTypeKey] : null;
    if (gunType) {
      const gunBrandKey = Object.keys(gunType).find(k => k.toLowerCase() === form.marca?.toLowerCase());
      const gunBrand = gunBrandKey ? gunType[gunBrandKey] : null;
      if (gunBrand) {
        const gunModelKey = Object.keys(gunBrand).find(k => k.toLowerCase() === form.modelo?.toLowerCase());
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
            if (!prev.comp_cano || prev.comp_cano === '') {
              updates.comp_cano = gunModel.comp_cano;
            }
            if (!prev.capacidade || prev.capacidade === '') {
              updates.capacidade = gunModel.capacidade;
            }
            if (form.tipo !== 'Revolver' && form.tipo !== 'Revólver' && (!prev.carregadores || prev.carregadores === '')) {
              updates.carregadores = gunModel.carregadores;
            }
            if (Object.keys(updates).length > 0) {
              return { ...prev, ...updates };
            }
            return prev;
          });
        }
      }
    }
  }, [isArmas, form.tipo, form.marca, form.modelo, form.calibre]);

  useEffect(() => {
    if (!isArmas) return;
    if (!form.modelo) return;
    if (calibreOptions.length === 0) return;

    if (calibreOptions.length === 1) {
      if (form.calibre !== calibreOptions[0]) {
        setForm((prev) => ({ ...prev, calibre: calibreOptions[0] }));
      }
      return;
    }

    if (form.calibre && !calibreOptions.includes(form.calibre)) {
      setForm((prev) => ({ ...prev, calibre: '' }));
    }
  }, [isArmas, form.modelo, form.calibre, calibreOptions]);

  const loadRows = async () => {
    try {
      const params = new URLSearchParams({ page_size: '500', ordering: 'descricao' });
      if (search.trim()) params.append('search', search.trim());
      const data = await apiService.getList('itens', params);
      setRows(data.results || []);
    } catch (err) {
      setError(err.message || 'Falha ao carregar itens.');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => loadRows(), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const loadMenus = async () => {
      try {
        const [categorias, tiposArmas, tiposEquipamentos, tiposUniformes, fornecedoresData] = await Promise.all([
          getMenuOptions('item_categoria'),
          getMenuOptions('item_tipo_armas'),
          getMenuOptions('item_tipo_equipamentos'),
          getMenuOptions('item_tipo_uniformes'),
          apiService.getList('fornecedores', new URLSearchParams({ page_size: '500' }))
        ]);
        setCategoriasMenu(categorias);
        setTiposArmasMenu(tiposArmas);
        setTiposEquipamentosMenu(tiposEquipamentos);
        setTiposUniformesMenu(tiposUniformes);
        setFornecedores(fornecedoresData?.results || []);
      } catch {
        // fallback para constantes locais
      }
    };

    loadMenus();
  }, []);

  const handleDownloadModelo = () => {
    const lines = [];
    lines.push(MODELO_PLANILHA_HEADERS.join(';'));
    MODELO_PLANILHA_EXEMPLOS.forEach((registro) => {
      const row = MODELO_PLANILHA_HEADERS.map((header) => escapeCsv(registro[header] || ''));
      lines.push(row.join(';'));
    });

    const csvContent = `\uFEFF${lines.join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo_itens_importacao.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleOpenImport = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  };

  const handleDownloadInventario = async () => {
    try {
      setError('');
      setSuccess('');
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      await apiService.download('itens/relatorio-xlsx', 'relatorio_inventario.xlsx', params);
    } catch (err) {
      setError(err.message || 'Falha ao baixar planilha de inventário.');
    }
  };

  // eslint-disable-next-line sonarjs/cognitive-complexity
  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError('');
    setSuccess('');

    try {
      const content = await file.text();
      const linhas = String(content)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (linhas.length < 2) {
        setError('Planilha vazia ou sem linhas de dados.');
        return;
      }

      const separador = detectarSeparadorCsv(linhas[0]);

      const normalizarHeader = (h) => {
        return String(h || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9_]/g, '')
          .trim();
      };

      const headersOriginais = parseLinhaCsv(linhas[0], separador);
      const headersNormalizados = headersOriginais.map(normalizarHeader);

      const findHeaderIndex = (campo) => {
        const hNorm = normalizarHeader(campo);
        let index = headersNormalizados.indexOf(hNorm);
        if (index >= 0) return index;

        const aliases = {
          categoria: ['categoria', 'cat', 'aba'],
          tipo: ['tipo', 'subtipo', 'colunaa', 'tipoitem'],
          calibre: ['calibre', 'cal'],
          marca: ['marca', 'fabricante', 'fabric'],
          modelo: ['modelo', 'mod'],
          nivel: ['nivel', 'niveldeprotecao', 'classe', 'protecao'],
          tamanho: ['tamanho', 'tam'],
          sexo: ['sexo', 'genero', 'gen'],
          cargo: ['cargo', 'funcao'],
          serie: ['serie', 'nserie', 'numerodeserie', 'numserie', 'serienumero', 'chassi'],
          qtd_total: ['qtdtotal', 'quantidadetotal', 'total', 'qtd', 'quantidade'],
          qtd_disp: ['qtddisp', 'quantidadedisponivel', 'disponivel', 'qtd_disponivel'],
          qtd_min: ['qtdmin', 'quantidademinima', 'minimo', 'estoqueminimo', 'qtd_minima', 'seguranca'],
          status: ['status', 'situacao', 'estado'],
          descricao: ['descricao', 'desc', 'nome', 'detalhe'],
          patrimonio: ['patrimonio', 'npatrimonio', 'tombo', 'pat', 'numpatrimonio', 'numeropatrimonio'],
          dt_aq: ['dtaq', 'dataaquisicao', 'data', 'dt_aquisicao', 'aquisicao', 'data_aq'],
          dt_val: ['dtval', 'datavalidade', 'validade', 'vencimento', 'dt_validade', 'validade_data'],
          obs: ['obs', 'observacao', 'observacoes', 'detalhes', 'comentarios']
        };

        const list = aliases[campo] || [];
        for (const alias of list) {
          const aliasNorm = normalizarHeader(alias);
          const idx = headersNormalizados.indexOf(aliasNorm);
          if (idx >= 0) return idx;
        }

        for (let i = 0; i < headersNormalizados.length; i++) {
          const h = headersNormalizados[i];
          for (const alias of list) {
            const aliasNorm = normalizarHeader(alias);
            if (h.includes(aliasNorm) || aliasNorm.includes(h)) {
              return i;
            }
          }
        }

        return -1;
      };

      const mapearCategoriaOficial = (catRaw) => {
        const c = String(catRaw || '').toLowerCase().trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        
        if (c.includes('glock') && (c.includes('peca') || c.includes('part') || c.includes('repo'))) return 'Peças Glock';
        if ((c.includes('sig') || c.includes('sauer')) && (c.includes('peca') || c.includes('part') || c.includes('repo'))) return 'Peças Sig Sauer';
        if (c === 'armas' || c === 'arma') return 'Armas';
        if (c.includes('munico') || c === 'municoes' || c === 'municao' || c.includes('muni')) return 'Munições';
        if (c.includes('colete')) return 'Coletes Balísticos';
        if (c.includes('uniforme') || c.includes('enxoval') || c.includes('fardamento')) return 'Uniformes';
        if (c.includes('equip') || c.includes('epi')) return 'Equipamentos';
        return 'Armas';
      };

      const detectarCategoriaPorHeadersEFilename = (filename, hNorms) => {
        const f = String(filename || '').toLowerCase();
        
        if (f.includes('glock') && (f.includes('peca') || f.includes('part') || f.includes('repo'))) return 'Peças Glock';
        if ((f.includes('sig') || f.includes('sauer')) && (f.includes('peca') || f.includes('part') || f.includes('repo'))) return 'Peças Sig Sauer';
        if (f.includes('arma')) return 'Armas';
        if (f.includes('muni')) return 'Munições';
        if (f.includes('colete')) return 'Coletes Balísticos';
        if (f.includes('uniforme') || f.includes('enxoval') || f.includes('fardamento')) return 'Uniformes';
        if (f.includes('equip') || f.includes('epi')) return 'Equipamentos';

        if (hNorms.includes('nivel') || hNorms.includes('protecao')) return 'Coletes Balísticos';
        if (hNorms.includes('cargo')) return 'Uniformes';
        if (hNorms.includes('calibre')) {
          if (hNorms.includes('serie') || hNorms.includes('patrimonio') || hNorms.includes('chassi')) {
            return 'Armas';
          }
          return 'Munições';
        }
        if (hNorms.includes('tamanho') && !hNorms.includes('nivel') && !hNorms.includes('protecao')) {
          return 'Uniformes';
        }
        if (hNorms.includes('material') || hNorms.includes('elo')) {
          return 'Equipamentos';
        }
        
        return 'Armas';
      };

      const iCategoria = findHeaderIndex('categoria');
      const iDescricao = findHeaderIndex('descricao');

      let detectedCategory = '';
      if (iCategoria < 0) {
        detectedCategory = detectarCategoriaPorHeadersEFilename(file.name, headersNormalizados);
      }

      let sucesso = 0;
      let falha = 0;
      const erros = [];

      const getColVal = (cols, campo) => {
        const index = findHeaderIndex(campo);
        if (index < 0 || index >= cols.length) return '';
        return normalizarTexto(cols[index]);
      };

      for (let i = 1; i < linhas.length; i += 1) {
        const cols = parseLinhaCsv(linhas[i], separador);
        
        const catRaw = iCategoria >= 0 ? normalizarTexto(cols[iCategoria]) : detectedCategory;
        const categoriaMapeada = mapearCategoriaOficial(catRaw);

        const registro = {
          categoria: categoriaMapeada,
          tipo: getColVal(cols, 'tipo'),
          calibre: getColVal(cols, 'calibre'),
          marca: getColVal(cols, 'marca'),
          modelo: getColVal(cols, 'modelo'),
          nivel: getColVal(cols, 'nivel'),
          tamanho: getColVal(cols, 'tamanho'),
          sexo: getColVal(cols, 'sexo'),
          cargo: getColVal(cols, 'cargo'),
          serie: normalizarSerie(getColVal(cols, 'serie')),
          status: getColVal(cols, 'status') || 'Disponível',
          patrimonio: getColVal(cols, 'patrimonio'),
          dt_aq: getColVal(cols, 'dt_aq'),
          dt_val: getColVal(cols, 'dt_val'),
          obs: getColVal(cols, 'obs'),
        };

        const qtdTotal = parseInteiroPositivo(getColVal(cols, 'qtd_total'), 1);
        const qtdDisp = parseInteiroPositivo(getColVal(cols, 'qtd_disp'), qtdTotal);

        const descricaoPlanilha = iDescricao >= 0 ? normalizarTexto(cols[iDescricao]) : '';
        const descricaoGerada = montarDescricaoImportacao(registro);
        const descricaoFinal = descricaoPlanilha || descricaoGerada;

        if (!registro.categoria) {
          falha += 1;
          erros.push(`Linha ${i + 1}: categoria vazia.`);
          continue;
        }

        if (!descricaoFinal) {
          falha += 1;
          erros.push(`Linha ${i + 1}: descricao nao informada e nao foi possivel gerar automaticamente.`);
          continue;
        }

        try {
          let compCano = '';
          let capacidade = '';
          let carregadores = '';
          if (registro.categoria?.toLowerCase() === 'armas') {
            const gunType = ARMAS_LOOKUP[registro.tipo];
            if (gunType) {
              const gunBrand = gunType[registro.marca];
              if (gunBrand) {
                let gunModel = gunBrand[registro.modelo];
                if (gunModel) {
                  if (registro.calibre && gunModel[registro.calibre]) {
                    gunModel = gunModel[registro.calibre];
                  } else if (Object.keys(gunModel).some(key => ['9mm', '.40', '5,56x45mm', '7,62x51mm', '12', '.45', '.38'].includes(key))) {
                    const firstCalibre = Object.keys(gunModel)[0];
                    gunModel = gunModel[firstCalibre];
                  }
                  compCano = gunModel.comp_cano || '';
                  capacidade = gunModel.capacidade || '';
                  carregadores = gunModel.carregadores || '';
                }
              }
            }
          }

          const isMunImport = registro.categoria?.toLowerCase() === 'munições' || registro.categoria?.toLowerCase() === 'municoes';

          await apiService.create('itens', {
            categoria: registro.categoria,
            tipo: registro.tipo,
            marca: registro.marca,
            modelo: registro.modelo,
            calibre: registro.calibre,
            nivel: registro.nivel,
            tamanho: registro.tamanho,
            sexo: registro.sexo,
            cargo: registro.cargo,
            comp_cano: compCano,
            capacidade: capacidade,
            carregadores: carregadores,
            tipo_municao: isMunImport ? (registro.tipo && registro.tipo.toLowerCase().includes('trein') ? 'Treina' : 'Operacional') : '',
            subtipo: isMunImport ? (getColVal(cols, 'subtipo') || extractSubtipoFromDesc(descricaoFinal) || '') : '',
            descricao: descricaoFinal,
            serie: registro.categoria === INVENTARIO_UNIFORMES.categoria ? '' : registro.serie,
            qtd_total: qtdTotal,
            qtd_disp: qtdDisp,
            qtd_min: calcularQtdMin(registro.categoria, registro.tipo, qtdTotal),
            status: registro.status,
            patrimonio: registro.patrimonio,
            dt_aq: registro.dt_aq || null,
            dt_val: registro.dt_val || null,
            obs: registro.obs,
          });
          sucesso += 1;
        } catch (err) {
          falha += 1;
          erros.push(`Linha ${i + 1}: ${err.message || 'erro ao cadastrar.'}`);
        }
      }

      await loadRows();

      if (falha > 0) {
        const detalhes = erros.slice(0, 6).join(' | ');
        setError(`Importacao concluida com ${sucesso} sucesso(s) e ${falha} falha(s). ${detalhes}`);
      } else {
        setSuccess(`Importacao concluida com ${sucesso} item(ns) cadastrado(s).`);
      }
    } catch (err) {
      setError(err.message || 'Falha ao importar planilha.');
    } finally {
      setImporting(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setCustomFieldsActive({});
    setCustomFieldsVal({});
    setForm({
      categoria: INVENTARIO_ARMAS.categoria,
      tipo: '',
      calibre: '',
      marca: '',
      modelo: '',
      nivel: '',
      tamanho: '',
      sexo: '',
      cargo: '',
      patrimonio: '',
      serie: '',
      qtd_total: 1,
      qtd_disp: 1,
      qtd_min: 1,
      status: 'Disponivel',
      dt_val: '',
      comp_cano: '',
      capacidade: '',
      carregadores: '',
      tipo_radio: '',
      terminal_iss: '',
      qtd_baterias: '',
      prefixo_viatura: '',
      placa_viatura: '',
      material: '',
      tipo_elo: '',
      itens_kit: '',
      lote: '',
      tipo_municao: 'Operacional',
      subtipo: '',
      fornecedor_id: '',
      dt_aq: '',
      valor_compra: '',
      id_peca: '',
      conjunto_funcional: '',
      nomenclatura_tecnica: '',
      funcao_logistica: '',
    });
  };

  // eslint-disable-next-line sonarjs/cognitive-complexity
  const handleAdd = async () => {
    if (isArmas && (!form.tipo || !form.calibre || !form.marca || !form.modelo)) {
      setError('Preencha tipo, calibre, marca e modelo para armas.');
      return;
    }

    if (isColetes && (!form.marca || !form.nivel || !form.tamanho || !form.sexo || !form.dt_val)) {
      setError('Preencha marca, nível, tamanho, sexo e data de vencimento para coletes.');
      return;
    }

    if (isMunicoes && (!form.tipo_municao || !form.calibre || !form.marca || !form.dt_val)) {
      setError('Preencha tipo, calibre, marca e data de validade/vencimento para munições.');
      return;
    }

    if (isEquipamentos) {
      if (!form.tipo) {
        setError('Preencha o tipo para equipamentos.');
        return;
      }

      if (form.tipo === 'Distintivo' && !form.cargo) {
        setError('Preencha o cargo para o distintivo.');
        return;
      }

      const marcaObrigatoria = tipoEquipamentoAtual ? tipoEquipamentoAtual.marcaObrigatoria : false;
      const modeloObrigatorio = tipoEquipamentoAtual ? tipoEquipamentoAtual.modeloObrigatorio : false;

      if (marcaObrigatoria && !form.marca) {
        setError('Preencha a marca para esse tipo de equipamento.');
        return;
      }

      if (modeloObrigatorio && !form.modelo) {
        setError('Preencha o modelo para esse tipo de equipamento.');
        return;
      }
    }

    if (isUniformes) {
      if (!form.tipo) {
        setError('Preencha o tipo para uniformes.');
        return;
      }

      const exigeSexo = tipoUniformeAtual ? tipoUniformeAtual.exigeSexo : false;
      const exigeTamanho = tipoUniformeAtual ? tipoUniformeAtual.exigeTamanho : false;
      const exigeCargo = tipoUniformeAtual ? tipoUniformeAtual.exigeCargo : false;

      if (exigeSexo && !form.sexo) {
        setError('Preencha o sexo para esse tipo de uniforme.');
        return;
      }

      if (exigeTamanho && !form.tamanho) {
        setError('Preencha o tamanho para esse tipo de uniforme.');
        return;
      }

      if (exigeCargo && !form.cargo) {
        setError('Preencha o cargo para esse tipo de uniforme.');
        return;
      }
    }

    if ((isPecasGlock || isPecasSigSauer) && (!form.id_peca || !form.conjunto_funcional || !form.nomenclatura_tecnica)) {
      setError('Preencha ID Peça, Conjunto Funcional e Nomenclatura Técnica para peças.');
      return;
    }

    if (!isUniformes && !isMunicoes && !isPecasGlock && !isPecasSigSauer && (!form.patrimonio || !form.patrimonio.trim())) {
      setError('Número do Tombo / Patrimônio é obrigatório.');
      return;
    }

    if (!isUniformes && !isMunicoes && !isPecasGlock && !isPecasSigSauer && (!form.serie || !form.serie.trim())) {
      setError('Número de Série é obrigatório.');
      return;
    }

    try {
      setError('');
      setSuccess('');
      const payload = {
        categoria: form.categoria,
        marca: form.marca,
        descricao,
        patrimonio: isMunicoes || isPecasGlock || isPecasSigSauer ? '' : form.patrimonio,
        serie: isUniformes || isMunicoes || isPecasGlock || isPecasSigSauer ? '' : form.serie,
        qtd_total: Number(form.qtd_total || 1),
        qtd_disp: Number(form.qtd_total || 1),
        qtd_min: calcularQtdMin(form.categoria, form.tipo, form.qtd_total),
        status: form.status,
        dt_val: form.dt_val || '',
        tipo: form.tipo,
        modelo: form.modelo,
        calibre: form.calibre,
        nivel: form.nivel,
        tamanho: form.tamanho,
        sexo: form.sexo,
        cargo: form.cargo,
        comp_cano: form.comp_cano,
        capacidade: form.capacidade,
        carregadores: form.carregadores,
        tipo_radio: form.tipo_radio,
        terminal_iss: form.terminal_iss,
        qtd_baterias: form.qtd_baterias,
        prefixo_viatura: form.prefixo_viatura,
        placa_viatura: form.placa_viatura,
        material: form.material,
        tipo_elo: form.tipo_elo,
        itens_kit: form.itens_kit,
        tipo_municao: form.tipo_municao,
        subtipo: isMunicoes ? (form.subtipo || extractSubtipoFromDesc(descricao) || extractSubtipoFromDesc(form.modelo) || '') : '',
        lote: form.lote || '',
        fornecedor_id: form.fornecedor_id || '',
        dt_aq: form.dt_aq || '',
        valor_compra: form.valor_compra ? Number(form.valor_compra) : '',
        id_peca: form.id_peca || '',
        conjunto_funcional: form.conjunto_funcional || '',
        nomenclatura_tecnica: form.nomenclatura_tecnica || '',
        funcao_logistica: form.funcao_logistica || '',
      };

      if (editingId) {
        await apiService.update('itens', editingId, payload);
        setSuccess('Item atualizado com sucesso!');
      } else {
        await apiService.create('itens', payload);
        setSuccess('Item cadastrado com sucesso!');
      }
      resetForm();
      setIsModalOpen(false);
      await loadRows();
    } catch (err) {
      setError(err.message || 'Falha ao salvar item.');
    }
  };

  const handleEdit = (item) => {
    setError('');
    setSuccess('');
    setEditingId(item.id);
    setCustomFieldsActive({});
    setCustomFieldsVal({});
    
    // Extract tipo/modelo/calibre/nivel if possible or map appropriately
    let formTipo = '';
    let formCalibre = '';
    
    if (item.categoria === INVENTARIO_ARMAS.categoria) {
      const parts = item.descricao.split(' ');
      formTipo = parts[0] || '';
      formCalibre = item.descricao.toLowerCase().includes('calibre') ? item.descricao.split(/calibre/i)[1]?.trim() : '';
    }

    const detectedSub = item.subtipo || extractSubtipoFromDesc(item.descricao || item.modelo);

    setForm({
      categoria: item.categoria || INVENTARIO_ARMAS.categoria,
      tipo: item.tipo || formTipo,
      calibre: item.calibre || formCalibre,
      subtipo: detectedSub,
      marca: item.marca || '',
      modelo: item.modelo || item.descricao || '',
      nivel: item.nivel || '',
      tamanho: item.tamanho || '',
      sexo: item.sexo || '',
      cargo: item.cargo || '',
      patrimonio: item.patrimonio || '',
      serie: item.serie || '',
      qtd_total: item.qtd_total ?? 1,
      qtd_disp: item.qtd_disp ?? 1,
      qtd_min: item.qtd_min ?? 1,
      status: item.status || 'Disponivel',
      dt_val: item.dt_val || '',
      comp_cano: item.comp_cano || '',
      capacidade: item.capacidade || '',
      carregadores: item.carregadores || '',
      tipo_radio: item.tipo_radio || '',
      terminal_iss: item.terminal_iss || '',
      qtd_baterias: item.qtd_baterias || '',
      prefixo_viatura: item.prefixo_viatura || '',
      placa_viatura: item.placa_viatura || '',
      material: item.material || '',
      tipo_elo: item.tipo_elo || '',
      itens_kit: item.itens_kit || '',
      lote: item.lote || '',
      tipo_municao: item.tipo_municao || 'Operacional',
      fornecedor_id: item.fornecedor_id || '',
      dt_aq: item.dt_aq || '',
      valor_compra: item.valor_compra || '',
      id_peca: item.id_peca || '',
      conjunto_funcional: item.conjunto_funcional || '',
      nomenclatura_tecnica: item.nomenclatura_tecnica || '',
      funcao_logistica: item.funcao_logistica || '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await apiService.remove('itens', id);
      await loadRows();
    } catch (err) {
      setError(err.message || 'Falha ao excluir item.');
    }
  };

  const loadBensIndividuais = async (target) => {
    setLoadingBens(true);
    try {
      if (!target) {
        setBensIndividuais([]);
        return;
      }
      const isGroupRow = typeof target === 'object' && target.isGroup;
      const variations = typeof target === 'object' ? target.variations : [];

      if (isGroupRow && Array.isArray(variations) && variations.length > 0) {
        const promises = variations.map(v => 
          apiService.getList(`itens/${v.id}/bens`).catch(() => [])
        );
        const results = await Promise.all(promises);
        const allBens = results.flatMap(res => res?.results || res || []);
        setBensIndividuais(allBens);
      } else {
        const itemId = typeof target === 'object' ? (target.item?.id || target.id) : target;
        if (!itemId) {
          setBensIndividuais([]);
          return;
        }
        const data = await apiService.getList(`itens/${itemId}/bens`);
        setBensIndividuais(data?.results || data || []);
      }
    } catch (err) {
      console.error('Erro ao carregar bens individuais:', err);
      setBensIndividuais([]);
    } finally {
      setLoadingBens(false);
    }
  };

  const loadComprasDoItem = async (target) => {
    setLoadingCompras(true);
    try {
      if (!target) {
        setItemCompras([]);
        return;
      }
      const isGroupRow = typeof target === 'object' && target.isGroup;
      const variations = typeof target === 'object' ? target.variations : [];

      let fetchedCompras = [];
      if (isGroupRow && Array.isArray(variations) && variations.length > 0) {
        const promises = variations.map(v => 
          apiService.getList(`itens/${v.id}/compras`).catch(() => [])
        );
        const results = await Promise.all(promises);
        const all = results.flatMap(res => res?.results || res || []);
        const map = new Map();
        all.forEach(c => map.set(c.id, c));
        fetchedCompras = Array.from(map.values());
      } else {
        const itemId = typeof target === 'object' ? (target.item?.id || target.id) : target;
        if (itemId) {
          const data = await apiService.getList(`itens/${itemId}/compras`);
          fetchedCompras = data?.results || data || [];
        }
      }

      if (fetchedCompras.length === 0 && target) {
        const mainItem = typeof target === 'object' ? (target.item || target) : target;
        if (mainItem && (mainItem.dt_aq || mainItem.valor_compra || mainItem.fornecedor_nome || mainItem.patrimonio || mainItem.numero_nota_fiscal)) {
          fetchedCompras = [{
            id: 'synth-' + (mainItem.id || '1'),
            numero_nota_fiscal: mainItem.numero_nota_fiscal || mainItem.patrimonio || 'Lançamento Inicial',
            numero_empenho: mainItem.numero_empenho || '—',
            dt_aq: mainItem.dt_aq || '',
            fornecedor_nome: mainItem.fornecedor_nome || 'Lançamento no Inventário',
            qtd_total: mainItem.qtd_total || 1,
            valor_compra: mainItem.valor_compra || 0,
            lote: mainItem.lote || '—',
            obs: mainItem.obs || 'Registro inicial no inventário'
          }];
        }
      }

      setItemCompras(fetchedCompras);
    } catch (err) {
      console.error('Erro ao carregar aquisições do item:', err);
      setItemCompras([]);
    } finally {
      setLoadingCompras(false);
    }
  };

  const handleOpenDetails = async (row) => {
    setSelectedItemDetails(row);
    setBensIndividuais([]);
    setItemCompras([]);
    setBensFilters({
      patrimonio: '',
      serie: '',
      status: '',
      tamanho: '',
      sexo: '',
    });
    setIsDetailModalOpen(true);
    await Promise.all([
      loadBensIndividuais(row),
      loadComprasDoItem(row)
    ]);
  };

  const handleEditBem = (bem) => {
    setEditingBemId(bem.id);
    setBemForm({
      patrimonio: bem.patrimonio || '',
      serie: bem.serie || '',
      status: bem.status || 'Disponivel',
      tamanho: bem.tamanho || '',
      sexo: bem.sexo || '',
      dt_val: bem.dt_val || '',
      obs: bem.obs || '',
    });
  };

  const handleSaveBem = async (bemId) => {
    try {
      setError('');
      await apiService.update(`bens`, bemId, {
        patrimonio: bemForm.patrimonio,
        serie: bemForm.serie,
        status: bemForm.status,
        tamanho: bemForm.tamanho,
        sexo: bemForm.sexo,
        dt_val: bemForm.dt_val,
        obs: bemForm.obs,
      });
      setEditingBemId(null);
      if (selectedItemDetails) {
        await loadBensIndividuais(selectedItemDetails);
        await loadRows();
      }
    } catch (err) {
      setError(err.message || 'Erro ao salvar bem individual.');
    }
  };

  const handleMergeItems = async () => {
    if (!mergeSourceId || !mergeDestId) {
      setError('Por favor, selecione ambos os itens.');
      return;
    }
    if (mergeSourceId === mergeDestId) {
      setError('O item de origem e destino não podem ser o mesmo.');
      return;
    }
    try {
      setError('');
      setSuccess('');
      setMerging(true);
      const res = await apiService.create('itens/mesclar', {
        item_origem_id: mergeSourceId,
        item_destino_id: mergeDestId
      });
      setSuccess(res.message || 'Itens mesclados com sucesso!');
      setIsMergeModalOpen(false);
      setMergeSourceId('');
      setMergeDestId('');
      await loadRows();
    } catch (err) {
      setError(err.message || 'Falha ao mesclar itens.');
    } finally {
      setMerging(false);
    }
  };

  const handleUpdateStatus = async (id, novoStatus) => {
    try {
      setError('');
      await apiService.update('itens', id, { status: novoStatus });
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status: novoStatus } : row)));
    } catch (err) {
      setError(err.message || 'Falha ao atualizar status do item.');
    }
  };

  const selectedCat = selectedItemDetails?.categoria;
  const isSelectedArmasCat = selectedCat === 'Armas';
  const isSelectedColetesCat = selectedCat === 'Coletes' || selectedCat === 'Coletes Balísticos';
  const isSelectedEquipamentosCat = selectedCat === 'Equipamentos';
  const isSelectedUniformesCat = selectedCat === 'Uniformes';
  const isSelectedMunicoesCat = Boolean(selectedCat && String(selectedCat).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('muni'));

  // Determine details modal table headers and colSpan
  let detailsTableHeaders = [];
  let detailsColSpan = 7;

  if (isSelectedArmasCat || isSelectedEquipamentosCat) {
    detailsTableHeaders = ['Tombo', 'Série', 'Status', 'Origem', 'Ações'];
    detailsColSpan = 5;
  } else if (isSelectedColetesCat) {
    detailsTableHeaders = ['Tombo', 'Série', 'Status', 'Tam', 'Sexo', 'Validade', 'Origem', 'Ações'];
    detailsColSpan = 8;
  } else if (isSelectedUniformesCat) {
    detailsTableHeaders = ['Tombo', 'Status', 'Tam', 'Sexo', 'Origem', 'Ações'];
    detailsColSpan = 6;
  } else if (isSelectedMunicoesCat) {
    detailsTableHeaders = ['Status', 'Ações'];
    detailsColSpan = 2;
  } else {
    detailsTableHeaders = ['Tombo', 'Série', 'Status', 'Tam', 'Sexo', 'Validade', 'Origem', 'Ações'];
    detailsColSpan = 8;
  }

  const isCategoryEligibleForGrouping = (categoria) => {
    const cat = String(categoria || '').trim().toLowerCase();
    return cat.includes('uniforme') || cat.includes('colete') || cat.includes('equipamento');
  };

  const getItemGroupKey = (item) => {
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

  const getGroupBaseDescription = (item) => {
    if (!item) return '';
    const cat = String(item.categoria || '').trim().toLowerCase();
    const tipo = String(item.tipo || '').trim().toUpperCase();
    const marca = String(item.marca || '').trim().toUpperCase();
    const nivel = String(item.nivel || '').trim().toUpperCase();

    if (cat.includes('colete')) {
      return `COLETE ${marca} ${nivel}`.trim();
    }
    if (cat.includes('uniforme')) {
      return `${tipo} ${marca}`.trim();
    }
    if (cat.includes('equipamento') && tipo.includes('DISTINTIVO')) {
      return `DISTINTIVO ${tipo} ${marca}`.trim();
    }
    return item.descricao || '';
  };

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const filteredRowsByStatus = useMemo(() => {
    return rows.filter(item => {
      if (statusFilter === 'Todos') return true;
      if (statusFilter === 'Disponíveis') {
        return Number(item.qtd_disp || 0) > 0;
      }
      if (statusFilter === 'Em Uso') {
        const emUso = Math.max(0, Number(item.qtd_total || 0) - Number(item.qtd_disp || 0));
        return emUso > 0 || String(item.status || '').toLowerCase() === 'em uso';
      }
      if (statusFilter === 'Estoque Crítico') {
        return Number(item.qtd_disp || 0) <= Number(item.qtd_min || 1);
      }
      return true;
    });
  }, [rows, statusFilter]);

  const processedRows = useMemo(() => {
    const itemsToProcess = filteredRowsByStatus;
    if (!groupByVariation) {
      return itemsToProcess.map(item => ({
        id: item.id,
        isGroup: false,
        key: `SINGLE|${item.id}`,
        item,
        variations: [item],
        descricao: item.descricao,
        categoria: item.categoria,
        tipo: item.tipo,
        qtd_total: item.qtd_total,
        qtd_disp: item.qtd_disp,
        qtd_min: item.qtd_min,
        compra_excluida: item.compra_excluida,
        tipo_municao: item.tipo_municao,
      }));
    }

    const groups = {};
    itemsToProcess.forEach((item) => {
      const key = getItemGroupKey(item);
      if (key.startsWith('ITEM|')) {
        groups[item.id] = {
          id: item.id,
          isGroup: false,
          key: `SINGLE|${item.id}`,
          item,
          variations: [item],
          descricao: item.descricao,
          categoria: item.categoria,
          tipo: item.tipo,
          qtd_total: item.qtd_total,
          qtd_disp: item.qtd_disp,
          qtd_min: item.qtd_min,
          compra_excluida: item.compra_excluida,
          tipo_municao: item.tipo_municao,
        };
      } else {
        if (!groups[key]) {
          groups[key] = {
            id: key,
            isGroup: true,
            key,
            baseDescription: getGroupBaseDescription(item),
            categoria: item.categoria,
            tipo: item.tipo,
            qtd_total: 0,
            qtd_disp: 0,
            qtd_min: 0,
            compra_excluida: false,
            variations: [],
          };
        }
        groups[key].qtd_total += Number(item.qtd_total || 0);
        groups[key].qtd_disp += Number(item.qtd_disp || 0);
        groups[key].qtd_min = Math.max(groups[key].qtd_min, Number(item.qtd_min || 0));
        if (item.compra_excluida) {
          groups[key].compra_excluida = true;
        }
        groups[key].variations.push(item);
      }
    });

    return Object.values(groups);
  }, [filteredRowsByStatus, groupByVariation]);

  const filteredBensIndividuais = useMemo(() => {
    return bensIndividuais.filter((bem) => {
      if (bensFilters.patrimonio && !String(bem.patrimonio || '').toLowerCase().includes(bensFilters.patrimonio.toLowerCase())) {
        return false;
      }
      if (bensFilters.serie && !String(bem.serie || '').toLowerCase().includes(bensFilters.serie.toLowerCase())) {
        return false;
      }
      if (bensFilters.status) {
        const normFilter = String(bensFilters.status).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const normStatus = String(bem.status || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (normStatus !== normFilter) {
          return false;
        }
      }
      if (bensFilters.tamanho && !String(bem.tamanho || '').toLowerCase().includes(bensFilters.tamanho.toLowerCase())) {
        return false;
      }
      if (bensFilters.sexo && bem.sexo !== bensFilters.sexo) {
        return false;
      }
      return true;
    });
  }, [bensIndividuais, bensFilters]);

  const paginatedBensIndividuais = useMemo(() => {
    const start = (bensPage - 1) * bensItemsPerPage;
    return filteredBensIndividuais.slice(start, start + bensItemsPerPage);
  }, [filteredBensIndividuais, bensPage]);

  const bensTotalPages = Math.ceil(filteredBensIndividuais.length / bensItemsPerPage) || 1;

  const paginatedProcessedRows = useMemo(() => {
    const start = (inventoryPage - 1) * inventoryItemsPerPage;
    return processedRows.slice(start, start + inventoryItemsPerPage);
  }, [processedRows, inventoryPage]);

  const inventoryTotalPages = Math.ceil(processedRows.length / inventoryItemsPerPage) || 1;

  return (
    <>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>📦 Carga Geral do Inventário</h1>
          <p>Material bélico, munições, EPIs e ativos do Estoque Central</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center' }} onClick={() => {
            setMergeSourceId('');
            setMergeDestId('');
            setIsMergeModalOpen(true);
          }}>
            🔗 Mesclar Itens Duplicados
          </button>
          <button className="btn btn-outline" onClick={handleDownloadInventario}>⬇️ Baixar Dados do Inventário</button>
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} style={{ display: 'none' }} />
      {error && <div className="alert alert-danger show">{error}</div>}
      {success && <div className="alert alert-success show">{success}</div>}

      <Modal
        isOpen={isModalOpen}
        title="📦 Cadastro de Item Bélico / Logística"
        onClose={() => setIsModalOpen(false)}
        footer={(
          <>
            <button className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleAdd}>💾 Salvar</button>
          </>
        )}
      >
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="it-cat">Categoria *</label>
            <select
              id="it-cat"
              value={form.categoria}
              onChange={(e) => {
                const cat = e.target.value;
                setForm({
                  categoria: cat,
                  tipo: '',
                  calibre: '',
                  subtipo: '',
                  marca: '',
                  modelo: '',
                  nivel: '',
                  tamanho: '',
                  sexo: '',
                  cargo: '',
                  patrimonio: '',
                  serie: '',
                  qtd_total: 1,
                  qtd_disp: 1,
                  qtd_min: 1,
                  status: 'Disponivel',
                  dt_val: '',
                  comp_cano: '',
                  capacidade: '',
                  carregadores: '',
                  tipo_radio: '',
                  terminal_iss: '',
                  qtd_baterias: '',
                  prefixo_viatura: '',
                  placa_viatura: '',
                  material: '',
                  tipo_elo: '',
                  itens_kit: '',
                  tipo_municao: 'Operacional',
                  id_peca: '',
                  conjunto_funcional: '',
                  nomenclatura_tecnica: '',
                  funcao_logistica: '',
                });
              }}
            >
              {categoriaOptions.map((categoria) => (
                <option key={categoria.value} value={categoria.value}>{categoria.label}</option>
              ))}
            </select>
          </div>

          {isArmas && (
            <>
              {renderSelectOrInput('it-tipo', 'Tipo', 'tipo', ['Pistola', 'Fuzil', 'Fuzil Sniper', 'Carabina', 'Espingarda', 'Revolver'], true)}
              {renderSelectOrInput('it-marca', 'Marca', 'marca', getArmasMarcas(), true)}
              {renderSelectOrInput('it-modelo', 'Modelo', 'modelo', getArmasModelos(), true)}
              {renderSelectOrInput('it-calibre', 'Calibre', 'calibre', getArmasCalibres(), true)}

              {renderSelectOrInput('it-comp-cano', 'Comprimento do Cano', 'comp_cano', ['114 mm (4,49 pol)', '102 mm', '76 mm', 'Padrão'], false)}
              {renderSelectOrInput('it-capacidade', 'Capacidade', 'capacidade', ['17', '15', '18', '20', '6', 'Padrão'], false)}

              {form.tipo !== 'Revolver' && renderSelectOrInput('it-carregadores', 'Nº de Carregadores', 'carregadores', ['3', '2', '4', '1', 'Padrão'], false)}
            </>
          )}

          {isColetes && (
            <>
              {renderSelectOrInput('it-marca', 'Marca', 'marca', ['Protecta', 'Inbraland', 'Condor', 'Glágio', 'CBC', 'Padrão'], true)}
              {renderSelectOrInput('it-nivel', 'Nível', 'nivel', ['IIIA', 'III-A', 'II', 'Padrão'], true)}
              {renderSelectOrInput('it-tamanho', 'Tamanho', 'tamanho', ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'], true)}
              {renderSelectOrInput('it-sexo', 'Sexo', 'sexo', ['Masculino', 'Feminino', 'Unissex'], true)}

              <div className="form-group">
                <label htmlFor="it-dt-val">Data de Vencimento / Validade *</label>
                <input
                  id="it-dt-val"
                  type="date"
                  value={form.dt_val}
                  onChange={(e) => setForm((p) => ({ ...p, dt_val: e.target.value }))}
                  className="form-control"
                  style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
              </div>
            </>
          )}

          {isEquipamentos && (
            <>
              {renderSelectOrInput('it-tipo-equip', 'Tipo', 'tipo', ['Rádio HT', 'Drones', 'Detector de Metal', 'Algema', 'Kit Arrombamento', 'Distintivo'], true)}

              {form.tipo && form.tipo !== 'Kit Arrombamento' && form.tipo !== 'Distintivo' && (
                <>
                  {renderSelectOrInput('it-marca', 'Marca', 'marca', form.tipo === 'Drones' ? ['DJI'] : form.tipo === 'Rádio HT' ? ['Hytera', 'Motorola'] : ['Padrão'], form.tipo !== 'Algema' && form.tipo !== 'Detector de Metal')}

                  {form.tipo !== 'Rádio HT' && (
                    <>
                      {form.tipo === 'Algema' && renderSelectOrInput('it-modelo', 'Modelo', 'modelo', ['CORRENTE', 'DOBRADIÇA'], true)}
                      {form.tipo === 'Drones' && renderSelectOrInput('it-modelo', 'Modelo', 'modelo', MODELOS_DRONES, true)}
                      {form.tipo !== 'Algema' && form.tipo !== 'Drones' && renderSelectOrInput('it-modelo', 'Modelo', 'modelo', ['Padrão'], false)}
                    </>
                  )}
                </>
              )}

              {form.tipo === 'Distintivo' && (
                <>
                  {renderSelectOrInput('it-cargo', 'Cargo', 'cargo', ['Delegado', 'Delegada', 'Inspetor', 'Escrivão', 'Oficial Investigador', 'Oficial Investigadora'], true)}
                </>
              )}

              {form.tipo === 'Rádio HT' && (
                <>
                  {renderSelectOrInput('it-tipo-radio', 'Tipo de Rádio', 'tipo_radio', ['Fixo', 'Móvel', 'HT'], true)}

                  <div className="form-group">
                    <label htmlFor="it-terminal-iss">Terminal ISS *</label>
                    <input
                      id="it-terminal-iss"
                      value={form.terminal_iss}
                      onChange={(e) => setForm((p) => ({ ...p, terminal_iss: e.target.value }))}
                      placeholder="Ex.: ISS-9482"
                      className="form-control"
                      style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                  </div>

                  {form.tipo_radio === 'HT' && renderSelectOrInput('it-qtd-baterias', 'Qtd de Baterias', 'qtd_baterias', ['1', '2', '3', '4'], true)}

                  {form.tipo_radio === 'Móvel' && (
                    <>
                      <div className="form-group">
                        <label htmlFor="it-prefixo-viatura">Prefixo da Viatura *</label>
                        <input
                          id="it-prefixo-viatura"
                          value={form.prefixo_viatura}
                          onChange={(e) => setForm((p) => ({ ...p, prefixo_viatura: e.target.value }))}
                          placeholder="Ex.: VTR-240"
                          className="form-control"
                          style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="it-placa-viatura">Placa da Viatura *</label>
                        <input
                          id="it-placa-viatura"
                          value={form.placa_viatura}
                          onChange={(e) => setForm((p) => ({ ...p, placa_viatura: e.target.value }))}
                          placeholder="Ex.: BRA2E19"
                          className="form-control"
                          style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              {form.tipo === 'Kit Arrombamento' && (
                <>
                  {renderSelectOrInput('it-marca', 'Marca', 'marca', ['Padrão'], false)}
                  {renderSelectOrInput('it-modelo', 'Modelo', 'modelo', ['Padrão'], false)}

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label htmlFor="it-itens-kit">Itens Integrantes do Kit *</label>
                    <textarea
                      id="it-itens-kit"
                      value={form.itens_kit}
                      onChange={(e) => setForm((p) => ({ ...p, itens_kit: e.target.value }))}
                      placeholder="Ex.: Alavanca, Martelo Dinâmico, Corta-frio..."
                      style={{ width: '100%', height: '80px', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {isUniformes && form.tipo && (
            <>
              {renderSelectOrInput('it-tipo-uni', 'Tipo de Uniforme', 'tipo', ['Calça Tática', 'Camisa Gola Polo', 'Cinto Operacional', 'Jaqueta Tática', 'Capa de Chuva', 'Bota Tática'], true)}

              {(() => {
                const t = String(form.tipo || '').toLowerCase();
                const isBota = t.includes('bota');
                const isCalca = t.includes('calça') || t.includes('calca');
                const isCinto = t.includes('cinto');
                const isPolo = t.includes('polo') || t.includes('gandola');
                const isJaqueta = t.includes('jaqueta');
                const isCapa = t.includes('capa');

                const showSexo = isPolo || isCalca;
                const showCargo = isPolo;
                const showModelo = !isJaqueta && !isCapa;
                const modeloLabel = isCalca ? 'Material' : 'Modelo';
                const modeloOptions = isBota ? ['Cano Curto', 'Cano Médio', 'Cano Longo'] :
                                      isCinto ? ['BDU', 'Cinto de Guarnição'] :
                                      isCalca ? ['Ripstop', 'Padrão'] : ['Padrão'];

                const sizeOptions = isBota ? Array.from({ length: 16 }, (_, i) => String(33 + i)) :
                                    isCalca ? ['38', '40', '42', '44', '46', '48', '50', '52'] :
                                    ['PP', 'P', 'M', 'G', 'GG', 'EG', 'XG'];

                return (
                  <>
                    {renderSelectOrInput('it-marca', 'Marca', 'marca', ['Invictus', 'Atack', 'Feline', 'Padrão'], true)}
                    {renderSelectOrInput('it-tamanho', 'Tamanho', 'tamanho', sizeOptions, true)}
                    {showSexo && renderSelectOrInput('it-sexo', 'Sexo', 'sexo', ['Masculino', 'Feminino', 'Unissex'], true)}
                    {showCargo && renderSelectOrInput('it-cargo', 'Cargo', 'cargo', ['DPC', 'OIP', 'IPC', 'EPC'], true)}
                    {showModelo && renderSelectOrInput('it-modelo', modeloLabel, 'modelo', modeloOptions, true)}
                  </>
                );
              })()}
            </>
          )}

          {isUniformes && !form.tipo && (
            <>
              {renderSelectOrInput('it-tipo-uni', 'Tipo de Uniforme', 'tipo', ['Calça Tática', 'Camisa Gola Polo', 'Cinto Operacional', 'Jaqueta Tática', 'Capa de Chuva', 'Bota Tática'], true)}
            </>
          )}

          {isMunicoes && (
            <>
              {renderSelectOrInput('it-tipo-mun', 'Tipo de Munição', 'tipo_municao', ['Operacional', 'Treina'], true)}
              {renderSelectOrInput('it-calibre', 'Calibre', 'calibre', ['9mm', '.40 S&W', '5,56x45mm', '7,62x51mm', '.380 ACP', '.38 SPL', '12 GA', '.45 ACP', '.357 Magnum', '.50 BMG', '.308 Win', '.22 LR'], true)}
              {renderSelectOrInput('it-subtipo', 'Subtipo / Projétil', 'subtipo', getSubtiposForCalibre(form.calibre, form.subtipo), true)}
              {renderSelectOrInput('it-marca', 'Marca', 'marca', ['CBC'], true)}

              <div className="form-group">
                <label htmlFor="it-lote">Nº do Lote de Munição *</label>
                <input
                  id="it-lote"
                  type="text"
                  value={form.lote || ''}
                  onChange={(e) => setForm((p) => ({ ...p, lote: e.target.value }))}
                  className="form-control"
                  placeholder="Ex: LOTE 2024-CBC-01"
                  style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="it-dt-val">Validade / Vencimento *</label>
                <input
                  id="it-dt-val"
                  type="date"
                  value={form.dt_val}
                  onChange={(e) => setForm((p) => ({ ...p, dt_val: e.target.value }))}
                  className="form-control"
                  style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
              </div>
            </>
          )}

          {(isPecasGlock || isPecasSigSauer) && (
            <>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="it-peca-predefinida">Peça Predefinida</label>
                <select
                  id="it-peca-predefinida"
                  className="form-control"
                  style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                  onChange={(e) => {
                    const idx = e.target.value;
                    if (idx === "") {
                      setForm(p => ({
                        ...p,
                        id_peca: "",
                        conjunto_funcional: "",
                        nomenclatura_tecnica: "",
                        funcao_logistica: "",
                        marca: isPecasGlock ? "GLOCK" : "SIG SAUER",
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
                          marca: isPecasGlock ? "GLOCK" : "SIG SAUER",
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

              <div className="form-group">
                <label htmlFor="it-id-peca">ID Peça *</label>
                <input
                  id="it-id-peca"
                  value={form.id_peca || ''}
                  onChange={(e) => setForm((p) => ({ ...p, id_peca: e.target.value }))}
                  placeholder="Ex.: 1"
                  className="form-control"
                  style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="it-conjunto-funcional">Conjunto Funcional *</label>
                <input
                  id="it-conjunto-funcional"
                  list="pecas-conjuntos"
                  value={form.conjunto_funcional || ''}
                  onChange={(e) => setForm((p) => ({ ...p, conjunto_funcional: e.target.value }))}
                  placeholder="Ex.: Alimentação"
                  className="form-control"
                  style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
                <datalist id="pecas-conjuntos">
                  <option value="Alimentação" />
                  <option value="Conjunto da Armação" />
                  <option value="Conjunto do Ferrolho" />
                  <option value="Ergonomia / Acessório" />
                  <option value="Mecanismo de Controle" />
                  <option value="Mecanismo de Disparo" />
                  <option value="Mecanismo de Pontaria" />
                  <option value="Mecanismo de Segurança" />
                  <option value="Mecanismo de Trancamento" />
                  <option value="Ergonomia e Chassi" />
                  <option value="Mecanismo de Percussão" />
                </datalist>
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="it-nomenclatura-tecnica">Nomenclatura Técnica da Peça *</label>
                <input
                  id="it-nomenclatura-tecnica"
                  value={form.nomenclatura_tecnica || ''}
                  onChange={(e) => setForm((p) => ({ ...p, nomenclatura_tecnica: e.target.value, modelo: e.target.value }))}
                  placeholder="Ex.: Corpo do Carregador Gen5"
                  className="form-control"
                  style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="it-funcao-logistica">Função Logística Operacional</label>
                <textarea
                  id="it-funcao-logistica"
                  value={form.funcao_logistica || ''}
                  onChange={(e) => setForm((p) => ({ ...p, funcao_logistica: e.target.value }))}
                  placeholder="Descrição da função"
                  style={{ width: '100%', height: '80px', padding: '6px', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical' }}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="it-desc">Descrição *</label>
            <input id="it-desc" value={descricao} disabled style={{ background: '#f0f0f0', color: '#666', width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }} />
          </div>

          {!isUniformes && !isMunicoes && !isPecasGlock && !isPecasSigSauer && (
            <div className="form-group">
              <label htmlFor="it-patrimonio">Número do Tombo / Patrimônio *</label>
              <input id="it-patrimonio" value={form.patrimonio} onChange={(e) => setForm((p) => ({ ...p, patrimonio: e.target.value }))} placeholder="Ex.: TOM-0001" className="form-control" style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }} />
            </div>
          )}

          {!isUniformes && !isMunicoes && !isPecasGlock && !isPecasSigSauer && (
            <div className="form-group">
              <label htmlFor="it-serie">Série *</label>
              <input id="it-serie" value={form.serie} onChange={(e) => setForm((p) => ({ ...p, serie: normalizarSerie(e.target.value) }))} placeholder="Ex.: ABC000" className="form-control" style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }} />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="it-total">Qtd Total *</label>
            <input
              id="it-total"
              type="text"
              value={form.qtd_total !== undefined && form.qtd_total !== null ? form.qtd_total : ''}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                setForm((p) => ({ ...p, qtd_total: digits, qtd_disp: digits }));
              }}
              placeholder="Ex: 100"
              className="form-control"
              style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>

          <div className="form-group">
            <label>Estoque Crítico (Calculado automaticamente)</label>
            <div style={{
              padding: '8px 12px',
              backgroundColor: '#f7fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              fontSize: '13px',
              color: '#4a5568',
              fontWeight: '600'
            }}>
              {calcularQtdMin(form.categoria, form.tipo, form.qtd_total)} unidades ({
                form.categoria?.toLowerCase() === 'armas' ? '5% (Armas)' :
                (form.categoria?.toLowerCase() === 'munições' || form.categoria?.toLowerCase() === 'municoes') ? '20% (Munições)' :
                (form.categoria?.toLowerCase()?.includes('colete')) ? '15% (Coletes)' :
                (form.categoria?.toLowerCase()?.includes('uniforme')) ? '15% (Uniformes)' :
                (form.tipo?.toLowerCase()?.includes('algema')) ? '5% (Algemas)' :
                'Isento de estoque mínimo'
              })
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="it-status">Status</label>
            <select id="it-status" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
              {ITEM_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="it-fornecedor">Fornecedor</label>
            <select id="it-fornecedor" value={form.fornecedor_id} onChange={(e) => setForm((p) => ({ ...p, fornecedor_id: e.target.value }))}>
              <option value="">Selecione...</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="it-dt-aq">Data de Aquisição</label>
            <input
              id="it-dt-aq"
              type="date"
              value={form.dt_aq}
              onChange={(e) => setForm((p) => ({ ...p, dt_aq: e.target.value }))}
              className="form-control"
              style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="it-valor-compra">Valor da Compra</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ 
                padding: '6px 10px', 
                background: '#edf2f7', 
                border: '1px solid #ccc', 
                borderRight: 'none', 
                borderRadius: '4px 0 0 4px', 
                fontWeight: 'bold', 
                color: '#4a5568',
                fontSize: '13px'
              }}>R$</span>
              <input
                id="it-valor-compra"
                type="text"
                value={form.valor_compra !== undefined && form.valor_compra !== null ? form.valor_compra : ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  setForm((p) => ({ ...p, valor_compra: formatCurrencyInput(raw) }));
                }}
                onBlur={() => {
                  if (form.valor_compra) {
                    const parsed = parseCurrencyBRL(form.valor_compra);
                    setForm((p) => ({ ...p, valor_compra: formatCurrencyInput(parsed) }));
                  }
                }}
                placeholder="0,00"
                className="form-control"
                style={{ 
                  flex: 1, 
                  padding: '6px 10px', 
                  border: '1px solid #ccc', 
                  borderRadius: '0 4px 4px 0',
                  fontSize: '13px',
                  fontWeight: '600'
                }}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal de Detalhes Individuais do Item */}
      <Modal
        isOpen={isDetailModalOpen}
        title="ℹ️ Detalhes do Item Inventariado"
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedItemDetails(null);
        }}
        footer={(
          <button className="btn btn-primary" onClick={() => {
            setIsDetailModalOpen(false);
            setSelectedItemDetails(null);
          }}>Fechar</button>
        )}
      >
        {selectedItemDetails && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ borderBottom: '1px solid #eee', paddingBottom: '12px' }}>
              <span className="badge badge-green" style={{ textTransform: 'uppercase', fontSize: '11px' }}>
                {selectedItemDetails.categoria}
              </span>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '8px', color: 'var(--text-color)' }}>
                {selectedItemDetails.descricao}
              </h3>

              {/* Specific details of the item according to its data */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', background: '#f8f9fa', padding: '8px 12px', borderRadius: '6px', border: '1px solid #eef0f2' }}>
                {isSelectedArmasCat && (
                  <>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Tipo:</strong> {selectedItemDetails.tipo || '—'}</span>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Marca:</strong> {selectedItemDetails.marca || '—'}</span>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Modelo:</strong> {selectedItemDetails.modelo || '—'}</span>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Calibre:</strong> {selectedItemDetails.calibre || '—'}</span>
                    {selectedItemDetails.comp_cano && (
                      <>
                        <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                        <span style={{ fontSize: '11px', color: '#555' }}><strong>Cano:</strong> {selectedItemDetails.comp_cano}</span>
                      </>
                    )}
                    {selectedItemDetails.capacidade && (
                      <>
                        <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                        <span style={{ fontSize: '11px', color: '#555' }}><strong>Capacidade:</strong> {selectedItemDetails.capacidade}</span>
                      </>
                    )}
                    {selectedItemDetails.carregadores && (
                      <>
                        <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                        <span style={{ fontSize: '11px', color: '#555' }}><strong>Carregadores:</strong> {selectedItemDetails.carregadores}</span>
                      </>
                    )}
                  </>
                )}
                {isSelectedColetesCat && (
                  <>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Marca:</strong> {selectedItemDetails.marca || '—'}</span>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Nível:</strong> {selectedItemDetails.nivel || '—'}</span>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Tamanho:</strong> {selectedItemDetails.tamanho || '—'}</span>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Sexo:</strong> {selectedItemDetails.sexo || '—'}</span>
                  </>
                )}
                {isSelectedEquipamentosCat && (
                  <>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Tipo:</strong> {selectedItemDetails.tipo || '—'}</span>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Marca:</strong> {selectedItemDetails.marca || '—'}</span>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Modelo:</strong> {selectedItemDetails.modelo || '—'}</span>
                    {selectedItemDetails.tipo_radio && (
                      <>
                        <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                        <span style={{ fontSize: '11px', color: '#555' }}><strong>Tipo Rádio:</strong> {selectedItemDetails.tipo_radio}</span>
                      </>
                    )}
                    {selectedItemDetails.terminal_iss && (
                      <>
                        <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                        <span style={{ fontSize: '11px', color: '#555' }}><strong>Terminal ISS:</strong> {selectedItemDetails.terminal_iss}</span>
                      </>
                    )}
                    {selectedItemDetails.qtd_baterias && (
                      <>
                        <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                        <span style={{ fontSize: '11px', color: '#555' }}><strong>Baterias:</strong> {selectedItemDetails.qtd_baterias}</span>
                      </>
                    )}
                    {selectedItemDetails.prefixo_viatura && (
                      <>
                        <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                        <span style={{ fontSize: '11px', color: '#555' }}><strong>Prefixo:</strong> {selectedItemDetails.prefixo_viatura}</span>
                      </>
                    )}
                    {selectedItemDetails.placa_viatura && (
                      <>
                        <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                        <span style={{ fontSize: '11px', color: '#555' }}><strong>Placa:</strong> {selectedItemDetails.placa_viatura}</span>
                      </>
                    )}
                  </>
                )}
                {isSelectedUniformesCat && (
                  <>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Tipo:</strong> {selectedItemDetails.tipo || '—'}</span>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Tamanho:</strong> {selectedItemDetails.tamanho || '—'}</span>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Sexo:</strong> {selectedItemDetails.sexo || '—'}</span>
                    {selectedItemDetails.cargo && (
                      <>
                        <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                        <span style={{ fontSize: '11px', color: '#555' }}><strong>Cargo:</strong> {selectedItemDetails.cargo}</span>
                      </>
                    )}
                  </>
                )}
                {isSelectedMunicoesCat && (
                  <>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Tipo de Munição:</strong> {selectedItemDetails.tipo_municao || 'Operacional'}</span>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Calibre:</strong> {selectedItemDetails.calibre || '—'}</span>
                    {(selectedItemDetails.subtipo || extractSubtipoFromDesc(selectedItemDetails.descricao)) && (
                      <>
                        <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                        <span style={{ fontSize: '11px', color: '#555' }}><strong>Subtipo:</strong> {selectedItemDetails.subtipo || extractSubtipoFromDesc(selectedItemDetails.descricao)}</span>
                      </>
                    )}
                    <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                    <span style={{ fontSize: '11px', color: '#555' }}><strong>Marca:</strong> {selectedItemDetails.marca || '—'}</span>
                    {selectedItemDetails.lote && (
                      <>
                        <span style={{ fontSize: '11px', color: '#ccc' }}>|</span>
                        <span style={{ fontSize: '11px', color: '#2b6cb0', fontWeight: 'bold' }}><strong>Lote:</strong> {selectedItemDetails.lote}</span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Qtd Total</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>{selectedItemDetails.qtd_total}</span>
              </div>
              <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Qtd Disponível</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: Number(selectedItemDetails.qtd_disp) <= Number(selectedItemDetails.qtd_min) ? '#e63946' : '#2a9d8f' }}>{selectedItemDetails.qtd_disp}</span>
              </div>
              <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Qtd Mínima</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#666' }}>{selectedItemDetails.qtd_min}</span>
              </div>
            </div>

            {/* Tabela de Bens Individuais */}
            {!isSelectedMunicoesCat && (
              <div style={{ marginTop: '8px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📋 Relação de Bens Individuais ({filteredBensIndividuais.length} de {bensIndividuais.length})
                </h4>
                <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                    <thead style={{ background: '#f8f9fa', position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        {detailsTableHeaders.map((hdr) => (
                          <th key={hdr} style={{ padding: '6px 8px', fontWeight: '600', textAlign: hdr === 'Ações' ? 'center' : 'left' }}>{hdr}</th>
                        ))}
                      </tr>
                      {/* Linha de filtros das colunas */}
                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                        {detailsTableHeaders.map((hdr) => {
                          if (hdr === 'Tombo') {
                            return (
                              <th key="filter-tombo" style={{ padding: '4px 8px' }}>
                                <input
                                  placeholder="Filtrar..."
                                  value={bensFilters.patrimonio}
                                  onChange={(e) => setBensFilters(prev => ({ ...prev, patrimonio: e.target.value }))}
                                  style={{ width: '100%', fontSize: '10px', padding: '2px 4px', border: '1px solid #cbd5e0', borderRadius: '3px', fontWeight: 'normal' }}
                                />
                              </th>
                            );
                          }
                          if (hdr === 'Série') {
                            return (
                              <th key="filter-serie" style={{ padding: '4px 8px' }}>
                                <input
                                  placeholder="Filtrar..."
                                  value={bensFilters.serie}
                                  onChange={(e) => setBensFilters(prev => ({ ...prev, serie: e.target.value }))}
                                  style={{ width: '100%', fontSize: '10px', padding: '2px 4px', border: '1px solid #cbd5e0', borderRadius: '3px', fontWeight: 'normal' }}
                                />
                              </th>
                            );
                          }
                          if (hdr === 'Status') {
                            return (
                              <th key="filter-status" style={{ padding: '4px 8px' }}>
                                <select
                                  value={bensFilters.status}
                                  onChange={(e) => setBensFilters(prev => ({ ...prev, status: e.target.value }))}
                                  style={{ width: '100%', fontSize: '10px', padding: '2px 4px', border: '1px solid #cbd5e0', borderRadius: '3px', fontWeight: 'normal' }}
                                >
                                  <option value="">Todos</option>
                                  <option value="Disponivel">Disponível</option>
                                  <option value="Em Uso">Em Uso</option>
                                  <option value="Manutencao">Em Manutenção</option>
                                  <option value="Inservivel">Inservível</option>
                                  <option value="Perdida">Perdido / Extraviado</option>
                                  <option value="Furtada">Furtado</option>
                                  <option value="Roubada">Roubado</option>
                                  <option value="Destruida">Destruído</option>
                                  <option value="Recolhida">Recolhido</option>
                                  <option value="Ressarcida">Ressarcido</option>
                                  <option value="Apreendida">Apreendido</option>
                                  
                                </select>
                              </th>
                            );
                          }
                          if (hdr === 'Tam') {
                            return (
                              <th key="filter-tam" style={{ padding: '4px 8px' }}>
                                <input
                                  placeholder="Filt..."
                                  value={bensFilters.tamanho}
                                  onChange={(e) => setBensFilters(prev => ({ ...prev, tamanho: e.target.value }))}
                                  style={{ width: '100%', fontSize: '10px', padding: '2px 4px', border: '1px solid #cbd5e0', borderRadius: '3px', fontWeight: 'normal' }}
                                />
                              </th>
                            );
                          }
                          if (hdr === 'Sexo') {
                            return (
                              <th key="filter-sexo" style={{ padding: '4px 8px' }}>
                                <select
                                  value={bensFilters.sexo}
                                  onChange={(e) => setBensFilters(prev => ({ ...prev, sexo: e.target.value }))}
                                  style={{ width: '100%', fontSize: '10px', padding: '2px 4px', border: '1px solid #cbd5e0', borderRadius: '3px', fontWeight: 'normal' }}
                                >
                                  <option value="">Todos</option>
                                  <option value="Masculino">Masc</option>
                                  <option value="Feminino">Fem</option>
                                  <option value="Unissex">Uni</option>
                                </select>
                              </th>
                            );
                          }
                          return <th key={`filter-empty-${hdr}`} style={{ padding: '4px 8px' }}></th>;
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {loadingBens ? (
                        <tr>
                          <td colSpan={detailsColSpan} style={{ padding: '12px', textAlign: 'center', color: '#888' }}>Carregando itens individuais...</td>
                        </tr>
                      ) : bensIndividuais.length === 0 ? (
                        <tr>
                          <td colSpan={detailsColSpan} style={{ padding: '14px', textAlign: 'center', background: '#f8fafc' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#2b6cb0' }}>
                                ℹ️ Item Controlado em Volume Global / Lote (Sem Tombos Individuais)
                              </span>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>
                                Este material (ex: Botas, Uniformes, Munições, Peças) é gerido por volume global e não possui tombos por unidade. Acompanhe as aquisições e Notas Fiscais na tabela abaixo.
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredBensIndividuais.length === 0 ? (
                        <tr>
                          <td colSpan={detailsColSpan} style={{ padding: '12px', textAlign: 'center', color: '#888' }}>Nenhum item corresponde aos filtros aplicados.</td>
                        </tr>
                      ) : (
                        paginatedBensIndividuais.map((bem) => {
                          const isEditing = editingBemId === bem.id;
                          return (
                            <tr key={bem.id} style={{ borderBottom: '1px solid #eee' }}>
                              {/* TOMBO */}
                              <td style={{ padding: '6px 8px' }}>
                                {isEditing ? (
                                  <input
                                    value={bemForm.patrimonio}
                                    onChange={(e) => setBemForm({ ...bemForm, patrimonio: e.target.value })}
                                    style={{ padding: '2px 4px', fontSize: '10px', width: '80px', border: '1px solid #ccc', borderRadius: '3px' }}
                                  />
                                ) : (
                                  <span style={{ fontFamily: 'monospace' }}>{bem.patrimonio || '—'}</span>
                                )}
                              </td>

                              {/* SERIE (Only if not uniforms) */}
                              {!isSelectedUniformesCat && (
                                <td style={{ padding: '6px 8px' }}>
                                  {isEditing ? (
                                    <input
                                      value={bemForm.serie}
                                      onChange={(e) => setBemForm({ ...bemForm, serie: e.target.value })}
                                      style={{ padding: '2px 4px', fontSize: '10px', width: '80px', border: '1px solid #ccc', borderRadius: '3px' }}
                                    />
                                  ) : (
                                    <span style={{ fontFamily: 'monospace' }}>{bem.serie || '—'}</span>
                                  )}
                                </td>
                              )}

                              {/* STATUS */}
                              <td style={{ padding: '6px 8px' }}>
                                {isEditing ? (
                                  <select
                                    value={bemForm.status}
                                    onChange={(e) => setBemForm({ ...bemForm, status: e.target.value })}
                                    style={{ padding: '2px 4px', fontSize: '10px', width: '115px', border: '1px solid #ccc', borderRadius: '3px' }}
                                  >
                                    <option value="Disponivel">Disponível</option>
                                    <option value="Em Uso">Em Uso</option>
                                    <option value="Manutencao">Em Manutenção</option>
                                    <option value="Inservivel">Inservível</option>
                                    <option value="Perdida">Perdido / Extraviado</option>
                                    <option value="Furtada">Furtado</option>
                                    <option value="Roubada">Roubado</option>
                                    <option value="Destruida">Destruído</option>
                                    <option value="Recolhida">Recolhido</option>
                                    <option value="Ressarcida">Ressarcido</option>
                                    <option value="Apreendida">Apreendido</option>
                                  </select>
                                ) : (
                                  <span className={`badge ${
                                    bem.status === 'Disponivel' ? 'badge-green' :
                                    bem.status === 'Em Uso' ? 'badge-blue' :
                                    bem.status === 'Manutencao' ? 'badge-yellow' : 'badge-red'
                                  }`} style={{ fontSize: '10px', padding: '2px 4px' }}>
                                    {bem.status === 'Disponivel' ? 'Disponível' :
                                     bem.status === 'Em Uso' ? 'Em Uso' :
                                     bem.status === 'Manutencao' ? 'Em Manutenção' :
                                     bem.status === 'Inservivel' ? 'Inservível' :
                                     bem.status === 'Perdida' ? 'Perdido' :
                                     bem.status === 'Furtada' ? 'Furtado' :
                                     bem.status === 'Roubada' ? 'Roubado' :
                                     bem.status === 'Destruida' ? 'Destruído' :
                                     bem.status === 'Recolhida' ? 'Recolhido' :
                                     bem.status === 'Ressarcida' ? 'Ressarcido' :
                                     bem.status === 'Apreendida' ? 'Apreendido' :
                                     bem.status || 'Disponível'}
                                  </span>
                                )}
                              </td>

                              {/* TAMANHO (Only for coletes and uniforms) */}
                              {(isSelectedColetesCat || isSelectedUniformesCat) && (
                                <td style={{ padding: '6px 8px' }}>
                                  {isEditing ? (
                                    <input
                                      value={bemForm.tamanho}
                                      onChange={(e) => setBemForm({ ...bemForm, tamanho: e.target.value })}
                                      style={{ padding: '2px 4px', fontSize: '10px', width: '35px', border: '1px solid #ccc', borderRadius: '3px' }}
                                    />
                                  ) : (
                                    <span>{bem.tamanho || '—'}</span>
                                  )}
                                </td>
                              )}

                              {/* SEXO (Only for coletes and uniforms) */}
                              {(isSelectedColetesCat || isSelectedUniformesCat) && (
                                <td style={{ padding: '6px 8px' }}>
                                  {isEditing ? (
                                    <select
                                      value={bemForm.sexo}
                                      onChange={(e) => setBemForm({ ...bemForm, sexo: e.target.value })}
                                      style={{ padding: '2px 4px', fontSize: '10px', width: '55px', border: '1px solid #ccc', borderRadius: '3px' }}
                                    >
                                      <option value="">—</option>
                                      <option value="Masculino">Masculino</option>
                                      <option value="Feminino">Feminino</option>
                                      <option value="Unissex">Unissex</option>
                                    </select>
                                  ) : (
                                    <span>{bem.sexo || '—'}</span>
                                  )}
                                </td>
                              )}

                              {/* VALIDADE (Only for coletes) */}
                              {isSelectedColetesCat && (
                                <td style={{ padding: '6px 8px' }}>
                                  {isEditing ? (
                                    <input
                                      type="date"
                                      value={bemForm.dt_val}
                                      onChange={(e) => setBemForm({ ...bemForm, dt_val: e.target.value })}
                                      style={{ padding: '2px 4px', fontSize: '10px', width: '95px', border: '1px solid #ccc', borderRadius: '3px' }}
                                    />
                                  ) : (
                                    <span>{formatLocalDate(bem.dt_val)}</span>
                                  )}
                                </td>
                              )}

                              {/* ORIGEM */}
                              <td style={{ padding: '6px 8px' }}>
                                {bem.compra ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedCompraDetails(bem.compra)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#3182ce',
                                      cursor: 'pointer',
                                      fontSize: '11px',
                                      textDecoration: 'underline',
                                      padding: 0,
                                      fontWeight: '500'
                                    }}
                                  >
                                    📄 NF {bem.compra.numero_nota_fiscal || 'Sem Nº'}
                                  </button>
                                ) : bem.compra_excluida ? (
                                  <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '11px' }} title="O lançamento de compra de origem deste item foi excluído">
                                    ⚠️ Lançamento Excluído
                                  </span>
                                ) : (
                                  <span style={{ color: '#a0aec0' }}>—</span>
                                )}
                              </td>

                              {/* ACTIONS */}
                              <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                {isEditing ? (
                                  <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                                    <button className="btn btn-xs btn-primary" style={{ padding: '2px 4px', fontSize: '9px' }} onClick={() => handleSaveBem(bem.id)}>Salvar</button>
                                    <button className="btn btn-xs btn-outline" style={{ padding: '2px 4px', fontSize: '9px' }} onClick={() => setEditingBemId(null)}>X</button>
                                  </div>
                                ) : (
                                  <button className="btn btn-xs btn-outline" style={{ padding: '2px 6px', fontSize: '9px' }} onClick={() => handleEditBem(bem)}>✏️</button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {bensTotalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', padding: '6px 10px', background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '11px' }}>
                    <span style={{ color: '#4a5568' }}>
                      Exibindo <strong>{Math.min(filteredBensIndividuais.length, (bensPage - 1) * bensItemsPerPage + 1)}</strong> a{' '}
                      <strong>{Math.min(filteredBensIndividuais.length, bensPage * bensItemsPerPage)}</strong> de{' '}
                      <strong>{filteredBensIndividuais.length}</strong> itens
                    </span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        onClick={() => setBensPage(prev => Math.max(1, prev - 1))}
                        disabled={bensPage === 1}
                        style={{ opacity: bensPage === 1 ? 0.5 : 1, cursor: bensPage === 1 ? 'not-allowed' : 'pointer' }}
                      >
                        ◀ Anterior
                      </button>
                      <span>Página <strong>{bensPage}</strong> de <strong>{bensTotalPages}</strong></span>
                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        onClick={() => setBensPage(prev => Math.min(bensTotalPages, prev + 1))}
                        disabled={bensPage === bensTotalPages}
                        style={{ opacity: bensPage === bensTotalPages ? 0.5 : 1, cursor: bensPage === bensTotalPages ? 'not-allowed' : 'pointer' }}
                      >
                        Próxima ▶
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Seção de Aquisições & Entradas por Nota Fiscal (Histórico de Lotes / Compras Globais) */}
            <div style={{ marginTop: '12px', borderTop: '1px solid #edf2f7', paddingTop: '12px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📦 Aquisições & Entradas por Nota Fiscal ({itemCompras.length} {itemCompras.length === 1 ? 'Lote/NF' : 'Lotes/NFs'})
                </span>
                <span style={{ fontSize: '10px', color: '#718096', fontWeight: 'normal' }}>
                  Histórico de compras e notas fiscais vinculadas a este item
                </span>
              </h4>

              <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#ffffff' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                  <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1, borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '8px 10px', fontWeight: '600' }}>Nota Fiscal</th>
                      <th style={{ padding: '8px 10px', fontWeight: '600' }}>Empenho</th>
                      <th style={{ padding: '8px 10px', fontWeight: '600' }}>Data Entrada</th>
                      <th style={{ padding: '8px 10px', fontWeight: '600' }}>Fornecedor</th>
                      <th style={{ padding: '8px 10px', fontWeight: '600', textAlign: 'center' }}>Qtd Lote</th>
                      <th style={{ padding: '8px 10px', fontWeight: '600', textAlign: 'right' }}>Valor Total</th>
                      <th style={{ padding: '8px 10px', fontWeight: '600', textAlign: 'center' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingCompras ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '12px', textAlign: 'center', color: '#888' }}>
                          Carregando histórico de compras e notas fiscais...
                        </td>
                      </tr>
                    ) : itemCompras.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '12px', textAlign: 'center', color: '#666' }}>
                          Nenhuma nota fiscal ou compra vinculada diretamente a este item.
                        </td>
                      </tr>
                    ) : (
                      itemCompras.map((compra) => (
                        <tr key={compra.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#2b6cb0' }}>
                            📄 {compra.numero_nota_fiscal || 'Sem Nº NF'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#4a5568', fontFamily: 'monospace' }}>
                            {compra.numero_empenho || '—'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#4a5568' }}>
                            {compra.dt_aq ? formatLocalDate(compra.dt_aq) : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#2d3748' }}>
                            {compra.fornecedor_nome || getFornecedorNome(compra.fornecedor_id) || '—'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 'bold' }}>
                            <span className="badge badge-blue" style={{ fontSize: '10px' }}>
                              {compra.qtd_total || 1} un
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '600', color: '#2f855a' }}>
                            {compra.valor_compra 
                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(compra.valor_compra) 
                              : 'R$ 0,00'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-xs btn-outline"
                              onClick={() => setSelectedCompraDetails(compra)}
                              style={{ fontSize: '10px', padding: '2px 6px' }}
                            >
                              👁️ Ver NF
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedItemDetails.obs && (
              <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '6px' }}>
                <span style={{ fontSize: '10px', color: '#666', display: 'block', marginBottom: '2px', textTransform: 'uppercase' }}>Observações</span>
                <p style={{ fontSize: '11px', margin: 0, color: '#555', fontStyle: 'italic' }}>{selectedItemDetails.obs}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal de Detalhes da Compra Origem */}
      <Modal
        isOpen={!!selectedCompraDetails}
        title="📄 Detalhes da Compra Origem"
        onClose={() => setSelectedCompraDetails(null)}
        footer={(
          <button className="btn btn-primary" onClick={() => setSelectedCompraDetails(null)}>Fechar</button>
        )}
      >
        {selectedCompraDetails && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', lineHeight: '1.6' }}>
            <div style={{ backgroundColor: '#f7fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ marginBottom: '8px', borderBottom: '1px solid #edf2f7', paddingBottom: '8px' }}>
                <strong>Fornecedor:</strong> {selectedCompraDetails.fornecedor_nome || 'Não informado'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div><strong>Nota Fiscal:</strong> {selectedCompraDetails.numero_nota_fiscal || 'Não informado'}</div>
                <div><strong>Empenho:</strong> {selectedCompraDetails.numero_empenho || 'Não informado'}</div>
                <div>
                  <strong>Valor da Compra:</strong> {selectedCompraDetails.valor_compra 
                    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedCompraDetails.valor_compra) 
                    : 'R$ 0,00'}
                </div>
                <div>
                  <strong>Data de Aquisição:</strong> {selectedCompraDetails.dt_aq 
                    ? formatLocalDate(selectedCompraDetails.dt_aq) 
                    : 'Não informada'}
                </div>
              </div>
            </div>
            <p style={{ fontSize: '11px', color: '#718096', margin: 0 }}>
              Esta informação refere-se à nota fiscal de aquisição deste item específico, gerada no momento do lançamento de compras.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isMergeModalOpen}
        title="🔗 Mesclar / Unificar Itens de Inventário"
        onClose={() => setIsMergeModalOpen(false)}
        footer={(
          <>
            <button className="btn btn-outline" onClick={() => setIsMergeModalOpen(false)}>Cancelar</button>
            <button 
              className="btn btn-primary" 
              onClick={handleMergeItems} 
              disabled={merging || !mergeSourceId || !mergeDestId}
            >
              {merging ? 'Mesclando...' : '🔗 Confirmar Mesclagem'}
            </button>
          </>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13px', color: '#4a5568', margin: 0 }}>
            Esta ação permite unificar dois registros de inventário que representam o mesmo item (ex: se foram cadastrados com descrições ligeiramente diferentes).
          </p>
          <div style={{ backgroundColor: '#ebf8ff', borderLeft: '4px solid #3182ce', padding: '10px', borderRadius: '4px' }}>
            <p style={{ fontSize: '12px', color: '#2b6cb0', margin: 0 }}>
              <strong>Atenção:</strong> Todos os bens individuais (tombo, número de série, etc.) e cautelas ativas do <strong>Item de Origem</strong> serão migrados para o <strong>Item de Destino</strong>. Ao final, o item de origem será <strong>excluído permanentemente</strong>.
            </p>
          </div>
          
          <div className="form-group">
            <label style={{ fontWeight: '500', display: 'block', marginBottom: '4px' }}>Item de Origem (Será Excluído) *</label>
            <select
              value={mergeSourceId}
              onChange={e => setMergeSourceId(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
            >
              <option value="">-- Selecione o item que deseja remover --</option>
              {rows.map(row => (
                <option key={row.id} value={row.id} disabled={row.id === mergeDestId}>
                  [{row.categoria}] {row.descricao} (Qtd: {row.qtd_total})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label style={{ fontWeight: '500', display: 'block', marginBottom: '4px' }}>Item de Destino (Será Mantido e Unificado) *</label>
            <select
              value={mergeDestId}
              onChange={e => setMergeDestId(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
            >
              <option value="">-- Selecione o item que será mantido --</option>
              {rows.map(row => (
                <option key={row.id} value={row.id} disabled={row.id === mergeSourceId}>
                  [{row.categoria}] {row.descricao} (Qtd: {row.qtd_total})
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', marginBottom: '16px', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: '280px', display: 'flex', gap: '8px' }}>
            <input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="🔍 Buscar por descrição, série, categoria..." 
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e0', borderRadius: '6px' }} 
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '13px', background: '#fff', color: '#4a5568', cursor: 'pointer' }}
            >
              <option value="Todos">Todos os Status</option>
              <option value="Disponíveis">Disponível</option>
              <option value="Em Uso">Em Uso</option>
              <option value="Estoque Crítico">Estoque Crítico (Abaixo do Mínimo)</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f7fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', color: '#4a5568', margin: 0 }}>
              <input 
                type="checkbox" 
                checked={groupByVariation} 
                onChange={(e) => setGroupByVariation(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              📦 Agrupar Variações (Tamanho / Gênero)
            </label>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Descrição (Clique para Detalhes)</th>
                <th>Categoria</th>
                <th>Tipo</th>
                <th>Total</th>
                <th>Disp.</th>
                <th>Mín.</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProcessedRows.map((row) => {
                if (row.isGroup) {
                  const isExpanded = Boolean(expandedGroups[row.key]);
                  return (
                    <React.Fragment key={row.key}>
                      <tr 
                        style={{ 
                          background: isExpanded ? '#f1f5f9' : '#f8fafc', 
                          borderBottom: '1px solid #cbd5e1',
                          borderLeft: '4px solid #3b82f6',
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => toggleGroup(row.key)}
                              style={{
                                background: isExpanded ? '#dbeafe' : '#e2e8f0',
                                border: 'none',
                                borderRadius: '4px',
                                width: '22px',
                                height: '22px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: isExpanded ? '#1d4ed8' : '#475569',
                                transition: 'all 0.15s ease',
                                padding: 0
                              }}
                              title={isExpanded ? "Recolher variações" : "Expandir variações"}
                            >
                              <svg 
                                width="12" 
                                height="12" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="currentColor" 
                                strokeWidth="2.5" 
                                strokeLinecap="round" 
                                strokeLinejoin="round"
                                style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
                              >
                                <polyline points="9 18 15 12 9 6"></polyline>
                              </svg>
                            </button>
                            <button
                              type="button"
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                margin: 0,
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontWeight: '600',
                                fontSize: '13px',
                                color: '#0f172a',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                              onClick={() => toggleGroup(row.key)}
                              title="Clique para expandir/recolher variações"
                            >
                              <span style={{ transition: 'color 0.15s' }} className="hover:text-blue-600">
                                {row.baseDescription}
                              </span>
                              <span 
                                style={{ 
                                  background: '#e2e8f0', 
                                  color: '#334155', 
                                  fontSize: '11px', 
                                  fontWeight: '600', 
                                  padding: '2px 8px', 
                                  borderRadius: '12px',
                                  lineHeight: '1.2'
                                }}
                              >
                                {row.variations.length} {row.variations.length === 1 ? 'variação' : 'variações'}
                              </span>
                            </button>
                          </div>
                        </td>
                        <td style={{ fontSize: '12px', color: '#475569', fontWeight: '500' }}>{row.categoria}</td>
                        <td>
                          <span className="badge badge-outline" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {row.tipo || '-'}
                          </span>
                        </td>
                        <td><div style={{ fontWeight: '700', color: '#0f172a' }}>{row.qtd_total}</div></td>
                        <td><div style={{ fontWeight: '700', color: '#166534' }}>{row.qtd_disp}</div></td>
                        <td style={{ color: '#64748b', fontSize: '12px' }}>{row.qtd_min}</td>
                        <td>
                          <button 
                            className="btn btn-xs" 
                            onClick={() => toggleGroup(row.key)}
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '5px',
                              background: isExpanded ? '#eff6ff' : '#ffffff',
                              border: '1px solid #cbd5e1',
                              color: isExpanded ? '#1d4ed8' : '#334155',
                              fontWeight: '500',
                              borderRadius: '5px',
                              padding: '4px 8px'
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              {isExpanded ? (
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                              ) : (
                                <>
                                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                  <line x1="12" y1="11" x2="12" y2="17"></line>
                                  <line x1="9" y1="14" x2="15" y2="14"></line>
                                </>
                              )}
                            </svg>
                            {isExpanded ? 'Recolher' : 'Ver Variações'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && row.variations.map((v, idx) => {
                        return (
                          <tr 
                            key={v.id} 
                            style={{ 
                              background: '#ffffff', 
                              borderBottom: idx === row.variations.length - 1 ? '1px solid #cbd5e1' : '1px solid #f1f5f9',
                              transition: 'background-color 0.15s ease'
                            }}
                            className="hover:bg-slate-50"
                          >
                            <td style={{ paddingLeft: '36px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8' }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 18l6-6-6-6" />
                                  </svg>
                                </div>
                                <button
                                  type="button"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    margin: 0,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontWeight: '500',
                                    fontSize: '13px',
                                    color: '#1e293b',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    flexWrap: 'wrap'
                                  }}
                                  onClick={() => handleOpenDetails(v)}
                                  title="Clique para visualizar detalhes individuais"
                                >
                                  <span className="hover:text-blue-600 hover:underline" style={{ transition: 'color 0.15s' }}>
                                    {v.descricao}
                                  </span>
                                  {v.compra_excluida && (
                                    <span 
                                      style={{ 
                                        backgroundColor: '#fef2f2', 
                                        color: '#dc2626', 
                                        fontSize: '10px', 
                                        padding: '2px 6px', 
                                        borderRadius: '4px',
                                        fontWeight: '500',
                                        border: '1px solid #fecaca',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                      }}
                                      title="O lançamento de compra de origem deste item foi excluído"
                                    >
                                      ⚠️ Lançamento Excluído
                                    </span>
                                  )}
                                </button>
                              </div>
                            </td>
                            <td style={{ fontSize: '11px', color: '#64748b' }}>{v.categoria}</td>
                            <td style={{ fontSize: '11px', color: '#64748b' }}>{v.tipo || '-'}</td>
                            <td>
                              <div style={{ fontWeight: '600', fontSize: '12px', color: '#0f172a' }}>{v.qtd_total}</div>
                            </td>
                            <td>
                              <div style={{ fontWeight: '600', fontSize: '12px', color: '#166534' }}>{v.qtd_disp}</div>
                            </td>
                            <td style={{ fontSize: '12px', color: '#64748b' }}>{v.qtd_min}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                {can('edit', 'estoque', v) && (
                                  <button 
                                    className="btn btn-xs" 
                                    onClick={() => handleEdit(v)} 
                                    title="Editar Item"
                                    style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                  >
                                    ✏️ Editar
                                  </button>
                                )}
                                {can('delete', 'estoque') && (
                                  <button 
                                    className="btn btn-xs" 
                                    onClick={() => handleDelete(v.id)} 
                                    title="Excluir Item"
                                    style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                  >
                                    🗑️ Excluir
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                } else {
                  const item = row.item;
                  return (
                    <tr key={row.key} style={{ borderBottom: '1px solid #e2e8f0' }} className="hover:bg-slate-50">
                      <td style={{ padding: '10px 12px' }}>
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            margin: 0,
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontWeight: '600',
                            fontSize: '13px',
                            color: '#1e293b',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap'
                          }}
                          onClick={() => handleOpenDetails(item)}
                          title="Clique para visualizar detalhes individuais"
                        >
                          <span className="hover:text-blue-600 hover:underline" style={{ transition: 'color 0.15s' }}>
                            {item.descricao}
                          </span>
                          {item.compra_excluida && (
                            <span 
                              style={{ 
                                backgroundColor: '#fef2f2', 
                                color: '#dc2626', 
                                fontSize: '10px', 
                                padding: '2px 6px', 
                                borderRadius: '4px',
                                fontWeight: '500',
                                border: '1px solid #fecaca',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title="O lançamento de compra de origem deste item foi excluído"
                            >
                              ⚠️ Lançamento Excluído
                            </span>
                          )}
                        </button>
                      </td>
                      <td style={{ fontSize: '12px', color: '#475569', fontWeight: '500' }}>{item.categoria}</td>
                      <td>
                        {item.categoria === 'Munições' ? (
                          <span className={`badge ${item.tipo_municao === 'Treina' ? 'badge-yellow' : 'badge-green'}`} style={{ textTransform: 'uppercase' }}>
                            {item.tipo_municao || 'Operacional'}
                          </span>
                        ) : (
                          <span className="badge badge-outline" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                            {item.tipo || '-'}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: '700', color: '#0f172a' }}>{item.qtd_total}</div>
                        {(item.categoria?.toLowerCase() === 'munições' || item.categoria?.toLowerCase() === 'municoes') && (
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', fontWeight: 'normal', lineHeight: '1.2' }}>
                            {item.lote && <div style={{ fontWeight: 'bold', color: '#1d4ed8' }}>🏷️ Lote: {item.lote}</div>}
                            📦 {getAmmunitionDetails(item.descricao, item.qtd_total).lots} lote(s)<br />
                            📥 {getAmmunitionDetails(item.descricao, item.qtd_total).boxes} caixa(s)
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: '700', color: '#166534' }}>{item.qtd_disp}</div>
                        {(item.categoria?.toLowerCase() === 'munições' || item.categoria?.toLowerCase() === 'municoes') && (
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', fontWeight: 'normal', lineHeight: '1.2' }}>
                            📦 {getAmmunitionDetails(item.descricao, item.qtd_disp).lots} lote(s)<br />
                            📥 {getAmmunitionDetails(item.descricao, item.qtd_disp).boxes} caixa(s)
                          </div>
                        )}
                      </td>
                      <td style={{ color: '#64748b', fontSize: '12px' }}>{item.qtd_min}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {can('edit', 'estoque', item) && (
                            <button 
                              className="btn btn-xs" 
                              onClick={() => handleEdit(item)} 
                              title="Editar Item"
                              style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              ✏️ Editar
                            </button>
                          )}
                          {can('delete', 'estoque') && (
                            <button 
                              className="btn btn-xs" 
                              onClick={() => handleDelete(item.id)} 
                              title="Excluir Item"
                              style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              🗑️ Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
        </div>

        {inventoryTotalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }}>
            <span style={{ color: '#4a5568' }}>
              Exibindo <strong>{Math.min(processedRows.length, (inventoryPage - 1) * inventoryItemsPerPage + 1)}</strong> a{' '}
              <strong>{Math.min(processedRows.length, inventoryPage * inventoryItemsPerPage)}</strong> de{' '}
              <strong>{processedRows.length}</strong> itens
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setInventoryPage(prev => Math.max(1, prev - 1))}
                disabled={inventoryPage === 1}
                style={{ opacity: inventoryPage === 1 ? 0.5 : 1, cursor: inventoryPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                ◀ Anterior
              </button>
              <span style={{ fontWeight: '500' }}>Página <strong>{inventoryPage}</strong> de <strong>{inventoryTotalPages}</strong></span>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setInventoryPage(prev => Math.min(inventoryTotalPages, prev + 1))}
                disabled={inventoryPage === inventoryTotalPages}
                style={{ opacity: inventoryPage === inventoryTotalPages ? 0.5 : 1, cursor: inventoryPage === inventoryTotalPages ? 'not-allowed' : 'pointer' }}
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

export default CadItens;
