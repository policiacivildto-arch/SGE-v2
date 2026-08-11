import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import Modal from '../components/Modal';
import { DEFAULT_DEPTOS_CONFIG } from '../utils/deptoUtils';

/* eslint-disable react/prop-types */

function CadLotacoes() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ depto: '', nome: '', cidade: '', resp: '', area_atuacao: '', ais: '', tel: '', end: '', seccional: '' });

  // Batch states
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchPreview, setBatchPreview] = useState([]);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, successes: 0, failures: 0 });
  const [batchShowPreview, setBatchShowPreview] = useState(false);
  const [batchType, setBatchType] = useState('units'); // 'units' or 'deptos'
  const [batchDeptoLock, setBatchDeptoLock] = useState(null); // string | null

  // Detailed Modal states
  const [selectedDeptoName, setSelectedDeptoName] = useState(null);
  const [subSearch, setSubSearch] = useState('');

  // Department configurations (Siglas and Responsibles)
  const [deptosConfig, setDeptosConfig] = useState(() => {
    const saved = localStorage.getItem('sga_deptos_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return parsed;
        }
      } catch (e) {
        // use default
      }
    }
    return DEFAULT_DEPTOS_CONFIG;
  });

  // Department editing/creation states
  const [isDeptoModalOpen, setIsDeptoModalOpen] = useState(false);
  const [editingDeptoName, setEditingDeptoName] = useState('');
  const [isNewDepto, setIsNewDepto] = useState(false);
  const [deptoForm, setDeptoForm] = useState({ name: '', sigla: '', resp: '' });
  const [isSavingDepto, setIsSavingDepto] = useState(false);

  // Department exclusion state
  const [deptoToDelete, setDeptoToDelete] = useState(null);
  const [isDeletingDepto, setIsDeletingDepto] = useState(false);

  // Custom Delete Confirm state (for units)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const saveDeptosConfig = (newConfig) => {
    setDeptosConfig(newConfig);
    localStorage.setItem('sga_deptos_config', JSON.stringify(newConfig));
  };

  const loadRows = async () => {
    try {
      const params = new URLSearchParams({ page_size: '500', ordering: 'depto' });
      const data = await apiService.getList('lotacoes', params);
      setRows(data.results || []);
    } catch (err) {
      setError(err.message || 'Falha ao carregar unidades.');
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  // Check if department has seccionais
  const hasSeccional = (deptoName) => {
    if (!deptoName) return false;
    const upper = deptoName.toUpperCase();
    return upper.includes('CAPITAL') || upper.includes('DPC') ||
           upper.includes('METROPOLITANA') || upper.includes('DPM') ||
           upper.includes('INTERIOR NORTE') || upper.includes('DPI NORTE') || upper.includes('DPI-NORTE') || upper.includes('DPI_NORTE') ||
           upper.includes('INTERIOR SUL') || upper.includes('DPI SUL') || upper.includes('DPI-SUL') || upper.includes('DPI_SUL');
  };

  // Helper to normalize the Seccional value of a unit
  const getUnitSeccional = (unit) => {
    if (unit.seccional) return unit.seccional;
    if (unit.resp && !isNaN(Number(unit.resp))) {
      return `${unit.resp}ª Seccional`;
    }
    if (unit.resp && unit.resp.toLowerCase().includes('seccional')) {
      return unit.resp;
    }
    return 'Sem Seccional Vinculada';
  };

  // Helper to generate initials as Sigla for newly created departments
  const getDeptoSigla = (deptoName) => {
    if (!deptoName) return '—';
    const upper = deptoName.toUpperCase();
    if (upper.includes('CAPITAL')) return 'DPC';
    if (upper.includes('METROPOLITANA')) return 'DPM';
    if (upper.includes('INTERIOR NORTE')) return 'DPI Norte';
    if (upper.includes('INTERIOR SUL')) return 'DPI Sul';
    if (upper.includes('TECNICO OPERACIONAL') || upper.includes('TÉCNICO OPERACIONAL')) return 'DTO';
    if (upper.includes('INTELIGENCIA') || upper.includes('INTELIGÊNCIA')) return 'DIP';
    if (upper.includes('HOMICIDIOS') || upper.includes('HOMICÍDIOS')) return 'DHPP';
    if (upper.includes('LOGISTICA') || upper.includes('LOGÍSTICA')) return 'COLOG';
    if (upper.includes('RECURSOS ESPECIAIS')) return 'CORE';

    const words = deptoName.split(/\s+/).filter(w => w.length > 2 && !['DOS', 'DAS', 'CON', 'PARA', 'PELO', 'PELA', 'UMA', 'UNS', 'POR', 'SOB'].includes(w.toUpperCase()));
    if (words.length > 0) {
      return words.map(w => w[0].toUpperCase()).join('');
    }
    return deptoName.substring(0, 5).toUpperCase();
  };

  // Group units by department
  const deptoGroups = React.useMemo(() => {
    const groups = {};
    
    // Pre-initialize groups for all known/configured departments
    Object.keys(deptosConfig).forEach(name => {
      groups[name] = [];
    });

    // Populate with actual loaded units
    rows.forEach(unit => {
      const deptoName = unit.depto || 'Não Informado';
      if (!groups[deptoName]) {
        groups[deptoName] = [];
      }
      groups[deptoName].push(unit);
    });

    // Map into complete structured group objects
    return Object.keys(groups).map(name => {
      const config = deptosConfig[name] || {};
      const sigla = config.sigla || getDeptoSigla(name);
      const resp = config.resp || 'Não Informado';
      const unitsCount = groups[name].length;
      return {
        name,
        sigla,
        resp,
        unitsCount,
        units: groups[name]
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }, [rows, deptosConfig]);

  // Filter department groups based on search
  const filteredDeptoGroups = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return deptoGroups;

    return deptoGroups.filter(g => {
      const nameMatches = g.name.toLowerCase().includes(query);
      const siglaMatches = g.sigla.toLowerCase().includes(query);
      const respMatches = g.resp.toLowerCase().includes(query);
      
      const hasMatchingUnit = g.units.some(u => 
        (u.nome && u.nome.toLowerCase().includes(query)) ||
        (u.cidade && u.cidade.toLowerCase().includes(query)) ||
        (u.ais && u.ais.toLowerCase().includes(query)) ||
        (getUnitSeccional(u).toLowerCase().includes(query))
      );

      return nameMatches || siglaMatches || respMatches || hasMatchingUnit;
    });
  }, [deptoGroups, search]);

  // Active department details from the selected name
  const activeDeptoDetails = React.useMemo(() => {
    if (!selectedDeptoName) return null;
    return deptoGroups.find(g => g.name === selectedDeptoName);
  }, [deptoGroups, selectedDeptoName]);

  // Filter units inside the active department modal
  const filteredActiveUnits = React.useMemo(() => {
    if (!activeDeptoDetails) return [];
    const query = subSearch.trim().toLowerCase();
    if (!query) return activeDeptoDetails.units;

    return activeDeptoDetails.units.filter(u => 
      (u.nome && u.nome.toLowerCase().includes(query)) ||
      (u.cidade && u.cidade.toLowerCase().includes(query)) ||
      (u.ais && u.ais.toLowerCase().includes(query)) ||
      (getUnitSeccional(u).toLowerCase().includes(query))
    );
  }, [activeDeptoDetails, subSearch]);

  // Group units by seccional inside the active department modal (if applicable)
  const groupedActiveUnitsBySeccional = React.useMemo(() => {
    if (!activeDeptoDetails) return {};
    const groups = {};
    filteredActiveUnits.forEach(u => {
      const sec = getUnitSeccional(u);
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push(u);
    });
    return groups;
  }, [activeDeptoDetails, filteredActiveUnits]);

  // Handle Save (Create & Edit) of individual units
  const handleSave = async () => {
    if (!form.depto || !form.nome || !form.cidade) {
      setError('Por favor, preencha todos os campos obrigatórios (Departamento, Nome e Área de Atuação).');
      return;
    }

    try {
      setError('');
      const payload = {
        ...form,
        seccional: hasSeccional(form.depto) ? form.seccional : null
      };

      if (editingId) {
        await apiService.update('lotacoes', editingId, payload);
      } else {
        await apiService.create('lotacoes', payload);
      }

      setForm({ depto: '', nome: '', cidade: '', resp: '', area_atuacao: '', ais: '', tel: '', end: '', seccional: '' });
      setEditingId(null);
      setIsModalOpen(false);
      await loadRows();
    } catch (err) {
      setError(err.message || 'Falha ao salvar unidade operacional.');
    }
  };

  const handleOpenEdit = (unit) => {
    setEditingId(unit.id);
    setForm({
      depto: unit.depto || '',
      nome: unit.nome || '',
      cidade: unit.cidade || '',
      resp: unit.resp || '',
      area_atuacao: unit.area_atuacao || '',
      ais: unit.ais || '',
      tel: unit.tel || '',
      end: unit.end || '',
      seccional: unit.seccional || ''
    });
    setIsModalOpen(true);
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm({ depto: selectedDeptoName || '', nome: '', cidade: '', resp: '', area_atuacao: '', ais: '', tel: '', end: '', seccional: '' });
    setIsModalOpen(true);
  };

  const handleDeleteClick = (unit) => {
    setDeleteConfirmId(unit.id);
    setDeleteConfirmName(unit.nome);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await apiService.remove('lotacoes', deleteConfirmId);
      setDeleteConfirmId(null);
      setDeleteConfirmName('');
      await loadRows();
    } catch (err) {
      setError(err.message || 'Falha ao excluir unidade.');
    }
  };

  // Save changes to department details (Sigla & Responsible)
  const handleOpenNewDepto = () => {
    setIsNewDepto(true);
    setEditingDeptoName('');
    setDeptoForm({
      name: '',
      sigla: '',
      resp: ''
    });
    setIsDeptoModalOpen(true);
  };

  const handleOpenEditDepto = (group) => {
    setIsNewDepto(false);
    setEditingDeptoName(group.name);
    setDeptoForm({
      name: group.name,
      sigla: group.sigla,
      resp: group.resp
    });
    setIsDeptoModalOpen(true);
  };

  const handleSaveDepto = async () => {
    if (!deptoForm.name.trim()) {
      alert('Por favor, digite o nome do departamento.');
      return;
    }

    setIsSavingDepto(true);
    try {
      const newName = deptoForm.name.trim();

      if (isNewDepto) {
        // Create new department in config
        if (deptosConfig[newName]) {
          alert('Já existe um departamento cadastrado com este nome.');
          setIsSavingDepto(false);
          return;
        }

        const updated = {
          ...deptosConfig,
          [newName]: {
            sigla: deptoForm.sigla.trim() || getDeptoSigla(newName),
            resp: deptoForm.resp.trim() || 'Não Informado'
          }
        };
        saveDeptosConfig(updated);
        setIsDeptoModalOpen(false);
      } else {
        // Edit existing department in config
        const oldName = editingDeptoName;
        
        // If the name changed, we must update all units that belong to oldName to have newName
        if (oldName !== newName) {
          // Find all units belonging to oldName
          const unitsToUpdate = rows.filter(u => u.depto === oldName);
          
          // Let's update each unit in the backend
          for (let i = 0; i < unitsToUpdate.length; i++) {
            const unit = unitsToUpdate[i];
            await apiService.update('lotacoes', unit.id, {
              ...unit,
              depto: newName
            });
          }
        }

        // Update deptosConfig mapping
        const updated = { ...deptosConfig };
        delete updated[oldName];
        updated[newName] = {
          sigla: deptoForm.sigla.trim() || getDeptoSigla(newName),
          resp: deptoForm.resp.trim() || 'Não Informado'
        };

        saveDeptosConfig(updated);
        
        // If we are currently viewing this department in detail modal, update its active name
        if (selectedDeptoName === oldName) {
          setSelectedDeptoName(newName);
        }

        setIsDeptoModalOpen(false);
        await loadRows();
      }
    } catch (err) {
      alert('Erro ao salvar as configurações do departamento: ' + err.message);
    } finally {
      setIsSavingDepto(false);
    }
  };

  const handleDeleteDeptoClick = (groupName) => {
    setDeptoToDelete(groupName);
  };

  const handleConfirmDeleteDepto = async () => {
    if (!deptoToDelete) return;

    setIsDeletingDepto(true);
    try {
      // Find and delete all units under this department
      const unitsToDelete = rows.filter(u => u.depto === deptoToDelete);
      for (let i = 0; i < unitsToDelete.length; i++) {
        await apiService.remove('lotacoes', unitsToDelete[i].id);
      }

      // Remove from config
      const updated = { ...deptosConfig };
      delete updated[deptoToDelete];
      saveDeptosConfig(updated);

      // If we had this department's modal detail opened, close it
      if (selectedDeptoName === deptoToDelete) {
        setSelectedDeptoName(null);
      }

      setDeptoToDelete(null);
      await loadRows();
    } catch (err) {
      alert('Erro ao excluir departamento: ' + err.message);
    } finally {
      setIsDeletingDepto(false);
    }
  };

  // Batch import handling
  const handleBatchFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setBatchText(event.target?.result || '');
    };
    reader.readAsText(file);
  };

  const handleProcessBatchText = () => {
    if (!batchText.trim()) {
      alert('Por favor, cole ou digite as informações primeiro.');
      return;
    }

    const lines = batchText.split('\n');
    const parsed = [];

    // Check if first line might be a header line to ignore it
    let startIndex = 0;
    const firstLineLower = lines[0].toLowerCase();
    
    let isHeader = false;
    if (batchType === 'units') {
      isHeader = firstLineLower.includes('depto') || firstLineLower.includes('departamento') || firstLineLower.includes('nome') || firstLineLower.includes('cidade') || firstLineLower.includes('área') || firstLineLower.includes('ais');
    } else {
      isHeader = firstLineLower.includes('depto') || firstLineLower.includes('departamento') || firstLineLower.includes('sigla') || firstLineLower.includes('resp') || firstLineLower.includes('diretor') || firstLineLower.includes('responsável');
    }

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

      if (batchType === 'units') {
        let deptoValue = '';
        let seccionalValue = '';
        let nomeValue = '';
        let cidadeValue = '';
        let aisValue = '';

        if (batchDeptoLock) {
          deptoValue = batchDeptoLock;
          if (hasSeccional(batchDeptoLock)) {
            if (parts.length >= 4) {
              seccionalValue = parts[0] || '';
              nomeValue = parts[1] || '';
              cidadeValue = parts[2] || '';
              aisValue = parts[3] || '';
            } else {
              seccionalValue = '';
              nomeValue = parts[0] || '';
              cidadeValue = parts[1] || '';
              aisValue = parts[2] || '';
            }
          } else {
            nomeValue = parts[0] || '';
            cidadeValue = parts[1] || '';
            aisValue = parts[2] || '';
          }
        } else {
          deptoValue = parts[0] || '';
          if (hasSeccional(deptoValue)) {
            if (parts.length >= 5) {
              seccionalValue = parts[1] || '';
              nomeValue = parts[2] || '';
              cidadeValue = parts[3] || '';
              aisValue = parts[4] || '';
            } else {
              seccionalValue = '';
              nomeValue = parts[1] || '';
              cidadeValue = parts[2] || '';
              aisValue = parts[3] || '';
            }
          } else {
            nomeValue = parts[1] || '';
            cidadeValue = parts[2] || '';
            aisValue = parts[3] || '';
          }
        }

        const item = {
          depto: deptoValue,
          seccional: seccionalValue,
          nome: nomeValue,
          cidade: cidadeValue,
          ais: aisValue,
          isValid: !!(deptoValue && nomeValue && cidadeValue)
        };
        parsed.push(item);
      } else {
        // deptos
        const nameValue = parts[0] || '';
        const siglaValue = parts[1] || '';
        const respValue = parts[2] || '';

        const item = {
          name: nameValue,
          sigla: siglaValue || getDeptoSigla(nameValue),
          resp: respValue || 'Não Informado',
          isValid: !!nameValue
        };
        parsed.push(item);
      }
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

    if (batchType === 'units') {
      for (let i = 0; i < validItems.length; i++) {
         const item = validItems[i];
         try {
           const payload = {
             depto: item.depto,
             nome: item.nome,
             cidade: item.cidade,
             resp: null,
             area_atuacao: null,
             ais: item.ais || null,
             tel: null,
             end: null,
             seccional: item.seccional || null
           };
          await apiService.create('lotacoes', payload);
          successes++;
        } catch (err) {
          console.error('Erro ao importar unidade:', item, err);
          failures++;
        }
        setBatchProgress(prev => ({
          ...prev,
          current: i + 1,
          successes,
          failures
        }));
      }
    } else {
      // deptos batch creation
      const updated = { ...deptosConfig };
      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        try {
          updated[item.name] = {
            sigla: item.sigla,
            resp: item.resp
          };
          successes++;
        } catch (err) {
          console.error('Erro ao importar depto:', item, err);
          failures++;
        }
        setBatchProgress(prev => ({
          ...prev,
          current: i + 1,
          successes,
          failures
        }));
      }
      saveDeptosConfig(updated);
    }

    setIsSavingBatch(false);
    setIsBatchModalOpen(false);
    setBatchText('');
    setBatchPreview([]);
    setBatchShowPreview(false);
    setBatchDeptoLock(null);
    await loadRows();
    alert(`Importação concluída! Sucesso: ${successes}, Erros: ${failures}`);
  };

  return (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-section, #print-section * {
            visibility: visible;
          }
          #print-section {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: #fff !important;
            color: #000 !important;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="page-header flex justify-between items-center">
        <div>
          <h1>🏢 Cadastro de Unidades</h1>
          <p>Configuração territorial e circunscricional das unidades operacionais por departamento</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={handleOpenNewDepto}>➕ Novo Departamento</button>
          <button className="btn btn-outline" onClick={() => {
            setBatchText('');
            setBatchPreview([]);
            setBatchShowPreview(false);
            setBatchType('units');
            setBatchDeptoLock(null);
            setIsBatchModalOpen(true);
          }}>📥 Inclusão em Lote</button>
          <button className="btn btn-primary" onClick={handleOpenCreate}>➕ Nova Unidade</button>
        </div>
      </div>
      
      {error && <div className="alert alert-danger show">{error}</div>}

      {/* Main Department List Card */}
      <div className="card">
        <div className="search-bar">
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="🔍 Buscar por departamento, sigla, responsável, delegacia ou AIS..." 
            style={{ width: '100%' }} 
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '150px' }}>Sigla</th>
                <th>Departamento</th>
                <th>Responsável / Diretor</th>
                <th style={{ width: '220px', textAlign: 'center' }}>Quantidade de Unidades</th>
                <th style={{ width: '180px', textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeptoGroups.map((group) => (
                <tr key={group.name}>
                  <td>
                    <span className="badge badge-primary" style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 'bold' }}>
                      {group.sigla}
                    </span>
                  </td>
                  <td>
                    <button 
                      className="link-btn" 
                      onClick={() => {
                        setSelectedDeptoName(group.name);
                        setSubSearch('');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#1a365d',
                        fontWeight: '700',
                        fontSize: '14px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline'
                      }}
                    >
                      {group.name}
                    </button>
                  </td>
                  <td style={{ color: '#4a5568', fontWeight: '500' }}>
                    👤 {group.resp}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700', fontSize: '15px', color: '#2b6cb0' }}>
                    {group.unitsCount} unidades
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button 
                        className="btn btn-xs btn-outline" 
                        title="Editar Departamento"
                        onClick={() => handleOpenEditDepto(group)}
                      >
                        ✏️ Editar
                      </button>
                      <button 
                        className="btn btn-xs btn-danger" 
                        title="Excluir Departamento"
                        onClick={() => handleDeleteDeptoClick(group.name)}
                      >
                        🗑️ Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Department Modal Window */}
      {selectedDeptoName && activeDeptoDetails && (
        <Modal
          isOpen={!!selectedDeptoName}
          title={`🏢 Detalhes: ${activeDeptoDetails.name} (${activeDeptoDetails.sigla})`}
          onClose={() => setSelectedDeptoName(null)}
          footer={(
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-outline" onClick={handleOpenCreate}>➕ Adicionar Unidade Individual</button>
                <button className="btn btn-outline" onClick={() => {
                  setBatchText('');
                  setBatchPreview([]);
                  setBatchShowPreview(false);
                  setBatchType('units');
                  setBatchDeptoLock(activeDeptoDetails.name);
                  setIsBatchModalOpen(true);
                }}>📥 Importar Unidades em Lote</button>
              </div>
              <button className="btn btn-primary" onClick={() => setSelectedDeptoName(null)}>Fechar</button>
            </div>
          )}
        >
          <div id="print-section">
            {/* Header Oficial Polícia Civil do Estado do Ceará */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '12px', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '800' }}>POLÍCIA CIVIL DO ESTADO DO CEARÁ</h2>
              <h3 style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#334155', fontWeight: '700' }}>GOVERNO DO ESTADO • SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL</h3>
              <h3 style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#0f172a', fontWeight: '800' }}>DEPARTAMENTO TÉCNICO OPERACIONAL</h3>
              <h4 style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#334155', fontWeight: '700' }}>SEÇÃO DE AQUISIÇÃO, LOGÍSTICA E TIRO - DTO</h4>
            </div>

            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
              <input 
                value={subSearch} 
                onChange={(e) => setSubSearch(e.target.value)} 
                placeholder="🔍 Filtrar unidades neste departamento..." 
                style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e0' }}
              />
              <button className="btn btn-outline" onClick={() => window.print()}>🖨️ Imprimir Relatório</button>
            </div>

            {/* Department Info Block */}
            <div style={{ padding: '16px', backgroundColor: '#f7fafc', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                <div><strong>Diretor / Responsável:</strong> 👤 {activeDeptoDetails.resp}</div>
                <div><strong>Total de Unidades Alocadas:</strong> 📦 {activeDeptoDetails.unitsCount} unidades</div>
                <div style={{ gridColumn: 'span 2' }}><strong>Departamento:</strong> {activeDeptoDetails.name}</div>
              </div>
            </div>

            {/* Units list resembling inventory presentation */}
            {filteredActiveUnits.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#a0aec0', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                Nenhuma unidade operacional correspondente localizada nesta visualização.
              </div>
            ) : hasSeccional(activeDeptoDetails.name) ? (
              /* Division by Seccional for Capital, Metropolitana, Interior Norte and Interior Sul */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {Object.keys(groupedActiveUnitsBySeccional).sort().map(seccionalName => {
                  const unitsInSeccional = groupedActiveUnitsBySeccional[seccionalName];
                  return (
                    <div key={seccionalName} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ backgroundColor: '#edf2f7', padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '700', color: '#2d3748', fontSize: '14px' }}>
                          📍 {seccionalName}
                        </span>
                        <span className="badge badge-primary" style={{ fontSize: '11px' }}>
                          {unitsInSeccional.length} {unitsInSeccional.length === 1 ? 'delegacia' : 'delegacias'}
                        </span>
                      </div>
                      <div className="table-wrap" style={{ margin: 0, borderRadius: 0, border: 'none' }}>
                        <table style={{ fontSize: '13px' }}>
                           <thead>
                            <tr>
                              <th>Nome da Unidade</th>
                              <th>Área de Atuação</th>
                              <th style={{ width: '100px' }}>AIS</th>
                              <th className="no-print" style={{ width: '120px', textAlign: 'center' }}>Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {unitsInSeccional.map(unit => (
                              <tr key={unit.id}>
                                <td style={{ fontWeight: '600', color: '#1a202c' }}>{unit.nome}</td>
                                <td>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {unit.cidade.split(',').map((tag, idx) => (
                                      <span key={idx} style={{ display: 'inline-block', backgroundColor: '#e2e8f0', color: '#4a5568', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                                        {tag.trim()}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td style={{ fontWeight: '500' }}><span className="badge badge-yellow">{unit.ais || '—'}</span></td>
                                <td className="no-print" style={{ textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                    <button className="btn btn-xs btn-outline" onClick={() => handleOpenEdit(unit)}>✏️</button>
                                    <button className="btn btn-xs btn-danger" onClick={() => handleDeleteClick(unit)}>🗑️</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Flat list for departments without Seccionais */
              <div className="table-wrap" style={{ border: '1px solid #e2e8f0' }}>
                <table style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>Nome da Unidade</th>
                      <th>Área de Atuação</th>
                      <th style={{ width: '120px' }}>AIS</th>
                      <th className="no-print" style={{ width: '120px', textAlign: 'center' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActiveUnits.map(unit => (
                      <tr key={unit.id}>
                        <td style={{ fontWeight: '600', color: '#1a202c' }}>{unit.nome}</td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {unit.cidade.split(',').map((tag, idx) => (
                              <span key={idx} style={{ display: 'inline-block', backgroundColor: '#e2e8f0', color: '#4a5568', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                                {tag.trim()}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ fontWeight: '500' }}><span className="badge badge-yellow">{unit.ais || '—'}</span></td>
                        <td className="no-print" style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button className="btn btn-xs btn-outline" onClick={() => handleOpenEdit(unit)}>✏️</button>
                            <button className="btn btn-xs btn-danger" onClick={() => handleDeleteClick(unit)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Editing/Creation Department Info Modal */}
      {isDeptoModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div className="card" style={{ width: '500px', backgroundColor: '#fff', margin: 0, padding: '24px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: '#1a365d' }}>
              {isNewDepto ? "➕ Novo Departamento" : `✏️ Configurar: ${editingDeptoName}`}
            </h3>
            
            <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: '16px', marginBottom: '24px' }}>
              <div className="form-group">
                <label>Nome do Departamento *</label>
                <input 
                  value={deptoForm.name} 
                  onChange={(e) => setDeptoForm(p => ({ ...p, name: e.target.value }))} 
                  placeholder="Ex: Departamento de Inteligência Policial"
                />
              </div>
              <div className="form-group">
                <label>Sigla do Departamento</label>
                <input 
                  value={deptoForm.sigla} 
                  onChange={(e) => setDeptoForm(p => ({ ...p, sigla: e.target.value.toUpperCase() }))} 
                  placeholder="Ex: DIP"
                />
              </div>
              <div className="form-group">
                <label>Diretor / Responsável pelo Departamento</label>
                <input 
                  value={deptoForm.resp} 
                  onChange={(e) => setDeptoForm(p => ({ ...p, resp: e.target.value }))} 
                  placeholder="Ex: Dr. Fábio Facó"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setIsDeptoModalOpen(false)} disabled={isSavingDepto}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveDepto} disabled={isSavingDepto}>
                {isSavingDepto ? "Salvando..." : "💾 Salvar Alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Unit Edit / Creation Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div className="card" style={{ width: '650px', backgroundColor: '#fff', margin: 0, padding: '24px', borderRadius: '8px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '700', color: '#1a365d' }}>
              {editingId ? "✏️ Editar Unidade Operacional" : "🏢 Cadastrar Nova Unidade Operacional"}
            </h2>
            
            <div className="form-grid" style={{ gap: '16px', marginBottom: '24px' }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="lot-depto">Departamento *</label>
                <select 
                  id="lot-depto" 
                  value={form.depto} 
                  onChange={(e) => setForm((p) => ({ ...p, depto: e.target.value }))}
                >
                  <option value="">Selecione o Departamento...</option>
                  {Array.from(new Set([
                    ...Object.keys(deptosConfig || {}),
                    ...rows.map(r => r.depto).filter(Boolean)
                  ])).sort().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="lot-nome">Nome da Unidade *</label>
                <input id="lot-nome" value={form.nome} placeholder="Ex: 11ª Delegacia Metropolitana" onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} />
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="lot-cidade">Área de Atuação (Municípios ou Bairros) *</label>
                <input id="lot-cidade" value={form.cidade} placeholder="Ex: Aldeota, Meireles, Fortaleza, etc. (separados por vírgula)" onChange={(e) => setForm((p) => ({ ...p, cidade: e.target.value }))} />
              </div>

              <div className="form-group">
                <label htmlFor="lot-ais">AIS (Área Integrada de Segurança)</label>
                <input id="lot-ais" value={form.ais} placeholder="Ex: AIS 01, AIS 12" onChange={(e) => setForm((p) => ({ ...p, ais: e.target.value }))} />
              </div>

              {hasSeccional(form.depto) ? (
                <div className="form-group">
                  <label htmlFor="lot-seccional">Seccional (Subdivisão) *</label>
                  <input 
                    id="lot-seccional" 
                    list="seccionais-autocomplete"
                    value={form.seccional || ''} 
                    placeholder="Ex: 1ª Seccional, 6ª Seccional"
                    onChange={(e) => setForm((p) => ({ ...p, seccional: e.target.value }))} 
                  />
                  <datalist id="seccionais-autocomplete">
                    {form.depto.toLowerCase().includes('capital') ? (
                      Array.from({ length: 25 }, (_, i) => `${i + 1}ª Seccional`).map(s => (
                        <option key={s} value={s} />
                      ))
                    ) : form.depto.toLowerCase().includes('metropolitana') ? (
                      Array.from({ length: 10 }, (_, i) => `${i + 1}ª Seccional Metropolitana`).map(s => (
                        <option key={s} value={s} />
                      ))
                    ) : form.depto.toLowerCase().includes('norte') ? (
                      Array.from({ length: 10 }, (_, i) => `${i + 1}ª Seccional do Interior Norte`).map(s => (
                        <option key={s} value={s} />
                      ))
                    ) : (
                      Array.from({ length: 10 }, (_, i) => `${i + 1}ª Seccional do Interior Sul`).map(s => (
                        <option key={s} value={s} />
                      ))
                    )}
                  </datalist>
                </div>
              ) : (
                <div className="form-group">
                  <label htmlFor="lot-resp">Responsável pela Unidade</label>
                  <input id="lot-resp" value={form.resp} placeholder="Ex: Delegado Titular" onChange={(e) => setForm((p) => ({ ...p, resp: e.target.value }))} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave}>💾 Salvar Registro</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Import Modal */}
      <Modal
        isOpen={isBatchModalOpen}
        title={batchType === 'deptos' ? "📥 Inclusão de Departamentos em Lote" : batchDeptoLock ? `📥 Inclusão em Lote no Depto: ${batchDeptoLock}` : "📥 Inclusão de Unidades em Lote"}
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
                  {isSavingBatch ? `Gravando... (${batchProgress.current}/${batchProgress.total})` : `Confirmar e Importar ${batchPreview.filter(x => x.isValid).length} ${batchType === 'units' ? 'Unidades' : 'Departamentos'}`}
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
            {!batchDeptoLock && (
              <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '16px' }}>
                <button 
                  type="button"
                  style={{
                    padding: '8px 16px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    border: 'none',
                    background: 'none',
                    color: batchType === 'units' ? '#2b6cb0' : '#718096',
                    borderBottom: batchType === 'units' ? '3px solid #2b6cb0' : 'none',
                    cursor: 'pointer',
                    marginBottom: '-2px'
                  }}
                  onClick={() => setBatchType('units')}
                >
                  🏢 Unidades Operacionais
                </button>
                <button 
                  type="button"
                  style={{
                    padding: '8px 16px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    border: 'none',
                    background: 'none',
                    color: batchType === 'deptos' ? '#2b6cb0' : '#718096',
                    borderBottom: batchType === 'deptos' ? '3px solid #2b6cb0' : 'none',
                    cursor: 'pointer',
                    marginBottom: '-2px'
                  }}
                  onClick={() => setBatchType('deptos')}
                >
                  💼 Departamentos
                </button>
              </div>
            )}

            {batchType === 'units' ? (
              <div style={{ padding: '12px', backgroundColor: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe', marginBottom: '16px', fontSize: '13px', color: '#1e3a8a', lineHeight: '1.5' }}>
                <strong>Como funciona a importação de unidades em lote:</strong>
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  <li>Copie colunas do <strong>Excel</strong> ou <strong>Google Sheets</strong> e cole aqui diretamente.</li>
                  <li>Ou digite os dados separados por <strong>ponto-e-vírgula (;)</strong>, uma unidade por linha.</li>
                  {batchDeptoLock ? (
                    hasSeccional(batchDeptoLock) ? (
                      <>
                        <li><strong>Campos na ordem (5 colunas no total, depto fixo):</strong> Seccional; Nome da Unidade; Áreas de Atuação; AIS</li>
                        <li>Como este departamento (<strong>{batchDeptoLock}</strong>) possui Seccionais, informe a <strong>Seccional</strong> na primeira coluna.</li>
                        <li>Exemplo: <code>1ª Seccional; 11ª Delegacia da Capital; Aldeota, Meireles; AIS 01</code></li>
                      </>
                    ) : (
                      <>
                        <li><strong>Campos na ordem:</strong> Nome da Unidade; Áreas de Atuação; AIS</li>
                        <li>Os campos (Nome da Unidade, Áreas de Atuação) são <strong>obrigatórios</strong>. O departamento será definido como: <strong>{batchDeptoLock}</strong>.</li>
                      </>
                    )
                  ) : (
                    <>
                      <li style={{ marginTop: '4px' }}>📌 <strong>Departamentos COM Seccional (DPC, DPM, DPI NORTE, DPI SUL) — 5 Colunas:</strong></li>
                      <li style={{ listStyle: 'none', marginLeft: '12px', color: '#1d4ed8', fontWeight: '500' }}>
                        <code>Departamento; Seccional; Nome da Unidade; Áreas de Atuação; AIS</code>
                        <br />
                        <span style={{ fontSize: '11px', color: '#3b82f6' }}>Ex: DPC; 1ª Seccional; 11ª Delegacia da Capital; Aldeota, Meireles; AIS 01</span>
                      </li>
                      <li style={{ marginTop: '6px' }}>📌 <strong>Demais Departamentos SEM Seccional (DHPP, DITRAN, DTO, etc.) — 4 Colunas:</strong></li>
                      <li style={{ listStyle: 'none', marginLeft: '12px', color: '#1d4ed8', fontWeight: '500' }}>
                        <code>Departamento; Nome da Unidade; Áreas de Atuação; AIS</code>
                        <br />
                        <span style={{ fontSize: '11px', color: '#3b82f6' }}>Ex: DHPP; 1ª DHPP; Fortaleza; AIS 05</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            ) : (
              <div style={{ padding: '12px', backgroundColor: '#ecfdf5', borderRadius: '6px', border: '1px solid #a7f3d0', marginBottom: '16px', fontSize: '13px', color: '#065f46', lineHeight: '1.5' }}>
                <strong>Como funciona a importação de departamentos em lote:</strong>
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  <li>Copie colunas do <strong>Excel</strong> ou <strong>Google Sheets</strong> e cole aqui diretamente.</li>
                  <li>Ou digite os dados separados por <strong>ponto-e-vírgula (;)</strong>, um departamento por linha.</li>
                  <li><strong>Campos na ordem:</strong> Nome do Departamento; Sigla; Responsável / Diretor</li>
                  <li>O campo <strong>Nome do Departamento</strong> é obrigatório.</li>
                </ul>
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #6ee7b7', fontSize: '12px', color: '#047857' }}>
                  💡 <strong>Departamentos com Seccionais (DPC, DPM, DPI NORTE e DPI SUL):</strong>
                  <br />
                  Nesta aba você cadastra a estrutura principal do Departamento (ex: <code>Departamento de Polícia da Capital; DPC; Dr. Diretor</code>). 
                  As <strong>Seccionais</strong> (ex: 1ª Seccional) e suas <strong>Delegacias</strong> são cadastradas na aba de <strong>Unidades Operacionais</strong> (informando a Seccional na 2ª coluna).
                </div>
              </div>
            )}

            <div className="form-group" style={{ margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontWeight: '600', margin: 0 }}>Cole os dados ou selecione um arquivo (CSV/TXT):</label>
                <label className="btn btn-outline btn-xs" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  📂 Carregar Arquivo
                  <input
                    type="file"
                    accept=".csv,.txt,.tsv,text/csv,text/plain"
                    onChange={handleBatchFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder={
                  batchType === 'units'
                    ? batchDeptoLock
                      ? hasSeccional(batchDeptoLock)
                        ? "Exemplo de linha:\n1ª Seccional; 11ª Delegacia Metropolitana; Aldeota, Meireles; AIS 01"
                        : "Exemplo de linha:\n11ª Delegacia Metropolitana; Aldeota, Meireles; AIS 01"
                      : "Exemplos de linhas:\n\n# Exemplo para departamento COM Seccional (DPC, DPM, DPI NORTE, DPI SUL):\nDPC; 1ª Seccional; 11ª Delegacia da Capital; Aldeota, Meireles; AIS 01\nDPM; 2ª Seccional Metropolitana; Delegacia de Caucaia; Caucaia; AIS 11\n\n# Exemplo para departamento SEM Seccional:\nDHPP; 1ª DHPP; Fortaleza; AIS 05"
                    : "Exemplos de linhas:\nDepartamento de Polícia da Capital; DPC; Dr. Hugo Alencar\nDepartamento de Polícia Metropolitana; DPM; Dr. Ricardo Viana"
                }
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
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>📋 Prévia dos Dados Identificados</h4>
            
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
              Foram encontradas <strong>{batchPreview.length}</strong> linhas. As linhas válidas estão marcadas em verde. Linhas com campos obrigatórios ausentes estão marcadas em vermelho e serão desconsideradas.
            </p>

            <div className="table-wrap" style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', margin: 0 }}>
              <table style={{ fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>
                  {batchType === 'units' ? (
                    <tr>
                      <th>Status</th>
                      <th>Depto *</th>
                      <th>Seccional</th>
                      <th>Nome Unidade *</th>
                      <th>Área de Atuação *</th>
                      <th>AIS</th>
                    </tr>
                  ) : (
                    <tr>
                      <th>Status</th>
                      <th>Nome do Departamento *</th>
                      <th>Sigla</th>
                      <th>Responsável / Diretor</th>
                    </tr>
                  )}
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
                      {batchType === 'units' ? (
                        <>
                          <td style={{ fontWeight: '500' }}>{item.depto || <span style={{ color: '#b91c1c', fontStyle: 'italic' }}>Ausente</span>}</td>
                          <td>{item.seccional || '—'}</td>
                          <td>{item.nome || <span style={{ color: '#b91c1c', fontStyle: 'italic' }}>Ausente</span>}</td>
                          <td>{item.cidade || <span style={{ color: '#b91c1c', fontStyle: 'italic' }}>Ausente</span>}</td>
                          <td>{item.ais || '—'}</td>
                        </>
                      ) : (
                        <>
                          <td style={{ fontWeight: '600', color: '#1a202c' }}>{item.name || <span style={{ color: '#b91c1c', fontStyle: 'italic' }}>Ausente</span>}</td>
                          <td>{item.sigla || '—'}</td>
                          <td>{item.resp || '—'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Department Delete Confirmation Modal */}
      {deptoToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <div className="card" style={{ width: '450px', backgroundColor: '#fff', margin: 0, padding: '24px', borderRadius: '8px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', fontWeight: '700', margin: '0 0 12px 0' }}>⚠️ Excluir Departamento?</h3>
            <p style={{ fontSize: '14px', color: '#4a5568', margin: '0 0 20px 0', lineHeight: '1.5' }}>
              Tem certeza que deseja excluir o departamento <strong>{deptoToDelete}</strong>?
              <br /><br />
              <strong style={{ color: '#991b1b' }}>Atenção:</strong> Esta ação removerá o departamento do sistema e também <strong>excluirá permanentemente todas as unidades operacionais</strong> associadas a ele. Esta ação não poderá ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setDeptoToDelete(null)} disabled={isDeletingDepto}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleConfirmDeleteDepto} disabled={isDeletingDepto}>
                {isDeletingDepto ? "Excluindo..." : "Confirmar Remoção"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Units */}
      {deleteConfirmId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <div className="card" style={{ width: '400px', backgroundColor: '#fff', margin: 0, padding: '24px', borderRadius: '8px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', fontWeight: '700', margin: '0 0 12px 0' }}>⚠️ Confirmar Remoção</h3>
            <p style={{ fontSize: '14px', color: '#4a5568', margin: '0 0 20px 0', lineHeight: '1.5' }}>
              Tem certeza que deseja excluir a unidade operacional <strong>{deleteConfirmName}</strong>? Esta ação não poderá ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => { setDeleteConfirmId(null); setDeleteConfirmName(''); }}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleConfirmDelete}>Confirmar Remoção</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default CadLotacoes;
