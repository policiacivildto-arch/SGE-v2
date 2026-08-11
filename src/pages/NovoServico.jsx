import React, { useEffect, useMemo, useState } from 'react';
import { apiService } from '../services/api';
import { DEPARTAMENTOS_PADRAO } from '../constants/organizacao';
import { getMenuOptions } from '../services/menuOptions';
import Modal from '../components/Modal';
import { GlockIcon } from '../components/CategoryIcons';
import { getSavedDeptosList, matchDeptoFlex } from '../utils/deptoUtils';
import { useAuth } from '../context/AuthContext';

/* eslint-disable react/prop-types */

const LISTAS = {
	armeiros: ['Thales', 'Santiago', 'Sales', 'Raimundo'],
	tiposServico: ['Manutenção', 'Limpeza', 'Reposição de Peça', 'Reposição de Arma'],
	status: ['Aberto', 'Em Andamento', 'Aguardando Peça', 'Aguardando Teste', 'Encaminhado à Fábrica', 'Concluído'],
	causasNormal: ['Mau Funcionamento', 'Dano Físico', 'Rotina', 'Solicitação do Policial'],
	causasEspecial: ['Furto', 'Roubo', 'Extravio'],
	modelos: ['G17', 'G19', 'G26', 'P320', 'PT-100', 'PT-101', 'PT-640', 'PT-840', 'PT-940', 'PT-24/7', 'APX', 'REVOLVER', 'RF 14', 'IA2', 'BUSHMASTER', 'AR10', 'MPX', 'CT40', 'CTT40', 'SMT40', 'MT9', 'BENELLI'],
	calibres: ['9mm', '.40', '5.56', '7.62', '12GA', '.38', 'Outro'],
};

function getToday() {
	return new Date().toLocaleDateString('sv-SE');
}

function normalizeSerie(value) {
	return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function isSameMatricula(val1, val2) {
	if (!val1 || !val2) return false;
	const str1 = String(val1).trim().toLowerCase();
	const str2 = String(val2).trim().toLowerCase();
	if (str1 === str2) return true;
	const num1 = str1.replace(/\D/g, '');
	const num2 = str2.replace(/\D/g, '');
	return !!(num1 && num2 && num1 === num2);
}

function NovoServico({ onNavigate }) {
	const { can, currentUser } = useAuth();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');
	const [policiais, setPoliciais] = useState([]);
	const [lotacoesBase, setLotacoesBase] = useState([]);
	const [departamentosMenu, setDepartamentosMenu] = useState([]);
	const [armaEncontrada, setArmaEncontrada] = useState(null);
	const [sugestoesSeries, setSugestoesSeries] = useState([]);
	const [sugestoesPoliciais, setSugestoesPoliciais] = useState([]);
	const [showConfirmLotacaoModal, setShowConfirmLotacaoModal] = useState(false);
	const [showConfirmArmaModal, setShowConfirmArmaModal] = useState(false);
	const [pendingShowArmaModal, setPendingShowArmaModal] = useState(false);
	const [pendingPolicial, setPendingPolicial] = useState(null);
	const [lastConfirmedMatricula, setLastConfirmedMatricula] = useState('');
	const [cautelasAtivas, setCautelasAtivas] = useState([]);
	const [loadingCautelas, setLoadingCautelas] = useState(false);
	const [form, setForm] = useState({
		codigo: '',
		tipo: '',
		armeiro: '',
		data_rec: getToday(),
		data_dev: '',
		status: '',
		motivo: '',
		matricula: '',
		policial_nome: '',
		depto: '',
		lotacao: '',
		modelo: '',
		calibre: '',
		serie: '',
		descricao: '',
		marca: '',
		categoria: 'Armas',
		policial_id: null,
	});

	useEffect(() => {
		const bootstrap = async () => {
			try {
				const [policiaisData, nextCodeData, lotacoesData] = await Promise.all([
					apiService.getList('policiais', new URLSearchParams({ page_size: '500', ordering: 'nome' })),
					apiService.get('servicos/next-code'),
					apiService.getList('lotacoes', new URLSearchParams({ page_size: '500' })).catch(() => ({ results: [] })),
				]);
				setPoliciais(policiaisData?.results || []);
				setLotacoesBase(lotacoesData?.results || lotacoesData || []);
				setForm((prev) => ({ ...prev, codigo: nextCodeData.codigo }));
				const departamentosData = await getMenuOptions('departamento');
				setDepartamentosMenu(departamentosData);
			} catch {
				// Nao bloqueia o preenchimento manual do formulario se falhar o bootstrap
			}
		};

		bootstrap();
	}, []);

	const causas = useMemo(() => {
		return form.tipo === 'Reposição de Arma' ? LISTAS.causasEspecial : LISTAS.causasNormal;
	}, [form.tipo]);

	const departamentos = useMemo(() => {
		const set = new Set();

		// Priority: Departments configured in Cadastros -> Unidades
		getSavedDeptosList().forEach((d) => set.add(d));

		if (departamentosMenu.length > 0) {
			departamentosMenu.forEach((opt) => {
				const val = opt.label || opt.rotulo || opt.valor;
				if (val) set.add(val);
			});
		} else {
			DEPARTAMENTOS_PADRAO.forEach((item) => {
				if (item) set.add(item);
			});
		}

		lotacoesBase.forEach((l) => {
			if (l && l.depto) set.add(l.depto);
		});

		policiais.forEach((p) => {
			if (p && p.depto) set.add(p.depto);
		});

		return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
	}, [policiais, lotacoesBase, departamentosMenu]);

	const lotacoes = useMemo(() => {
		if (!form.depto) return [];
		const set = new Set();

		// Add units from Cadastros -> Unidades belonging to form.depto
		lotacoesBase.forEach((l) => {
			if (l && matchDeptoFlex(l.depto || l.departamento, form.depto)) {
				const unitName = l.nome || l.lotacao || l.unidade;
				if (unitName) set.add(unitName);
			}
		});

		// Add units from Officers
		policiais.forEach((p) => {
			if (p && matchDeptoFlex(p.depto, form.depto)) {
				if (p.lotacao) set.add(p.lotacao);
			}
		});

		if (form.lotacao) set.add(form.lotacao);

		return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
	}, [policiais, lotacoesBase, form.depto, form.lotacao]);

	const esconderDataDevolucao = form.tipo === 'Reposição de Arma';

	const statusOpcoes = useMemo(() => {
		if (form.tipo === 'Reposição de Arma') {
			return ['Aberto', 'Em Andamento', 'Concluído'];
		}
		return LISTAS.status;
	}, [form.tipo]);

	useEffect(() => {
		if (form.tipo === 'Reposição de Arma') {
			const allowed = ['Aberto', 'Em Andamento', 'Concluído'];
			if (form.status && !allowed.includes(form.status)) {
				setForm((prev) => ({ ...prev, status: '' }));
			}
		}
	}, [form.tipo, form.status]);

	useEffect(() => {
		if (form.motivo && !causas.includes(form.motivo)) {
			setForm((prev) => ({ ...prev, motivo: '' }));
		}
	}, [causas, form.motivo]);

	useEffect(() => {
		if (!esconderDataDevolucao) return;
		if (!form.data_dev) return;
		setForm((prev) => ({ ...prev, data_dev: '' }));
	}, [esconderDataDevolucao, form.data_dev]);

	const setField = (key, value) => {
		const nextValue = key === 'serie' ? normalizeSerie(value) : value;
		setForm((prev) => ({ ...prev, [key]: nextValue }));
	};

	const handleSelectPolicial = (p) => {
		setForm((prev) => ({
			...prev,
			policial_id: p.id,
			matricula: p.matricula,
			policial_nome: p.nome,
			depto: p.depto,
			lotacao: p.lotacao,
		}));
		setPendingPolicial(p);
		setLastConfirmedMatricula(p.matricula);
		setSugestoesPoliciais([]);
	};

	useEffect(() => {
		const mat = String(form.matricula || '').trim();
		if (!mat || mat.length < 2) {
			setSugestoesPoliciais([]);
			return;
		}

		// Filtrar sugestões para o dropdown
		const matches = policiais.filter((p) => {
			if (!p) return false;
			return isSameMatricula(p.matricula, mat) ||
				String(p.matricula || '').toLowerCase().includes(mat.toLowerCase()) ||
				String(p.nome || '').toLowerCase().includes(mat.toLowerCase());
		});
		setSugestoesPoliciais(matches.slice(0, 8));

		const timer = setTimeout(async () => {
			let found = policiais.find((item) => isSameMatricula(item.matricula, mat));

			if (!found) {
				try {
					const data = await apiService.getList('policiais', new URLSearchParams({ search: mat, page_size: '20' }));
					const results = data.results || data || [];
					found = results.find((item) => isSameMatricula(item.matricula, mat)) ||
						results.find((item) => String(item.matricula || '').includes(mat));
				} catch {
					// Mantem fluxo manual se consulta de apoio falhar.
				}
			}

			if (!found) return;

			if (isSameMatricula(found.matricula, lastConfirmedMatricula)) return;

			setForm((prev) => ({
				...prev,
				policial_id: found.id,
				matricula: found.matricula || prev.matricula,
				policial_nome: found.nome || prev.policial_nome,
				depto: found.depto || prev.depto,
				lotacao: found.lotacao || prev.lotacao,
			}));
			setPendingPolicial(found);
			setLastConfirmedMatricula(found.matricula);
		}, 200);

		return () => clearTimeout(timer);
	}, [form.matricula, policiais, lastConfirmedMatricula]);

	useEffect(() => {
		if (!form.policial_id && !form.matricula && !form.policial_nome) {
			setCautelasAtivas([]);
			setPendingShowArmaModal(false);
			return;
		}

		const fetchCautelas = async () => {
			setLoadingCautelas(true);
			try {
				const params = new URLSearchParams({ page_size: '1000' });
				const data = await apiService.getList('cautelas', params);
				const results = data.results || data || [];

				const filtered = results.filter((c) => {
					const statusLower = String(c.status || '').toLowerCase();
					if (statusLower === 'devolvida' || statusLower === 'cancelada' || statusLower === 'encerrada') {
						return false;
					}

					const matchId = form.policial_id && String(c.policial_id) === String(form.policial_id);
					const matchMatricula = form.matricula && isSameMatricula(c.matricula, form.matricula);
					const matchNome = form.policial_nome && form.policial_nome.length > 3 && String(c.policial_nome || '').trim().toLowerCase() === String(form.policial_nome).trim().toLowerCase();

					return matchId || matchMatricula || matchNome;
				});
				setCautelasAtivas(filtered);
			} catch (err) {
				console.error('Erro ao buscar cautelas ativas:', err);
				setCautelasAtivas([]);
			} finally {
				setLoadingCautelas(false);
			}
		};

		fetchCautelas();
	}, [form.policial_id, form.matricula, form.policial_nome]);

	useEffect(() => {
		if (pendingShowArmaModal && !loadingCautelas) {
			if (cautelasAtivas.length > 0) {
				setShowConfirmArmaModal(true);
			}
			setPendingShowArmaModal(false);
		}
	}, [pendingShowArmaModal, loadingCautelas, cautelasAtivas]);

	const handleSelectCautela = async (cautela) => {
		const serie = normalizeSerie(cautela.serie);
		if (!serie) return;

		let brand = cautela.marca || '';
		let model = cautela.modelo || '';
		let calibre = cautela.calibre || '';
		
		try {
			const params = new URLSearchParams({ search: serie, page_size: '5' });
			const [armasData, bensData] = await Promise.all([
				apiService.getList('armas', params),
				apiService.getList('bens', params),
			]);
			
			const armasResults = armasData.results || [];
			const bensResults = bensData.results || [];
			
			let matchedAsset = null;
			
			const foundArma = armasResults.find(a => normalizeSerie(a.numero_serie) === serie);
			if (foundArma) {
				matchedAsset = {
					id: `arma-${foundArma.id}`,
					numero_serie: foundArma.numero_serie,
					marca: foundArma.marca || 'Pistola',
					modelo: foundArma.modelo || '',
					calibre: foundArma.calibre || '9mm',
					item_descricao: foundArma.item_descricao || `${foundArma.marca} ${foundArma.modelo}`,
				};
			} else {
				const foundBem = bensResults.find(b => normalizeSerie(b.serie) === serie);
				if (foundBem) {
					matchedAsset = {
						id: `bem-${foundBem.id}`,
						numero_serie: foundBem.serie,
						marca: foundBem.item_marca || foundBem.marca || 'Pistola',
						modelo: foundBem.item_descricao || foundBem.modelo || '',
						calibre: foundBem.item_calibre || foundBem.calibre || '9mm',
						item_descricao: foundBem.item_descricao || '',
					};
				}
			}
			
			if (matchedAsset) {
				setArmaEncontrada(matchedAsset);
				setForm((prev) => ({
					...prev,
					serie: matchedAsset.numero_serie,
					modelo: matchedAsset.modelo || prev.modelo,
					calibre: matchedAsset.calibre || prev.calibre,
					marca: matchedAsset.marca || prev.marca || '',
					categoria: 'Armas',
					descricao: matchedAsset.item_descricao || prev.descricao
				}));
				return;
			}
		} catch (err) {
			console.error('Erro ao buscar detalhes do armamento da cautela:', err);
		}
		
		setForm((prev) => ({
			...prev,
			serie: cautela.serie,
			modelo: model || prev.modelo || 'G17',
			calibre: calibre || prev.calibre || '9mm',
			marca: brand || prev.marca || '',
			categoria: 'Armas',
			descricao: cautela.item_desc || cautela.item_descricao || prev.descricao
		}));
	};

	useEffect(() => {
		const serie = form.serie.trim();
		if (serie.length < 1) {
			setSugestoesSeries([]);
			setArmaEncontrada(null);
			return;
		}

		const timer = setTimeout(async () => {
			try {
				const params = new URLSearchParams({ search: serie, page_size: '10' });
				const armasData = await apiService.getList('armas', params);
				const armasResults = armasData.results || [];

				const bensData = await apiService.getList('bens', params);
				const bensResults = bensData.results || [];

				const combined = [];
				const addedSerials = new Set();

				armasResults.forEach((a) => {
					const norm = normalizeSerie(a.numero_serie);
					if (norm && !addedSerials.has(norm)) {
						addedSerials.add(norm);
						combined.push({
							id: `arma-${a.id}`,
							numero_serie: a.numero_serie,
							marca: a.marca || 'Pistola',
							modelo: a.modelo || '',
							calibre: a.calibre || '9mm',
							item_descricao: a.item_descricao || `${a.marca} ${a.modelo}`,
						});
					}
				});

				for (const b of bensResults) {
					const norm = normalizeSerie(b.serie);
					if (norm && !addedSerials.has(norm)) {
						addedSerials.add(norm);
						const isArma = String(b.item_categoria || b.categoria || '').toLowerCase().includes('arma');
						if (isArma) {
							combined.push({
								id: `bem-${b.id}`,
								numero_serie: b.serie,
								marca: b.item_marca || b.marca || 'Pistola',
								modelo: b.item_descricao || b.modelo || '',
								calibre: b.item_calibre || b.calibre || '9mm',
								item_descricao: b.item_descricao || '',
							});
						}
					}
				}

				setSugestoesSeries(combined);

				const exactMatch = combined.find(a => normalizeSerie(a.numero_serie) === normalizeSerie(serie));
				if (exactMatch) {
					setArmaEncontrada(exactMatch);
					setForm((prev) => ({ 
						...prev, 
						modelo: exactMatch.modelo || prev.modelo, 
						calibre: exactMatch.calibre || prev.calibre, 
						marca: exactMatch.marca || prev.marca || '',
						categoria: 'Armas',
						descricao: exactMatch.item_descricao || prev.descricao 
					}));
				} else {
					setArmaEncontrada(null);
				}
			} catch (err) {
				console.error(err);
				setSugestoesSeries([]);
				setArmaEncontrada(null);
			}
		}, 200);

		return () => clearTimeout(timer);
	}, [form.serie]);

	const handleSubmit = async () => {
		setLoading(true);
		setError('');
		setSuccess('');

		const required = [
			form.tipo,
			form.armeiro,
			form.data_rec,
			form.status,
			form.motivo,
			form.matricula,
			form.policial_nome,
			form.depto,
			form.lotacao,
			form.modelo,
			form.calibre,
			form.serie,
		];

		if (required.some((item) => !String(item || '').trim())) {
			setError('Preencha todos os campos obrigatórios para salvar a ordem.');
			setLoading(false);
			return;
		}

		try {
			const payload = {
				codigo: form.codigo,
				tipo: form.tipo,
				armeiro: form.armeiro,
				data_rec: form.data_rec,
				data_dev: esconderDataDevolucao ? null : (form.data_dev || null),
				status: form.status,
				motivo: form.motivo,
				modelo: form.modelo,
				calibre: form.calibre,
				serie: form.serie,
				descricao: form.descricao,
				matricula: form.matricula,
				policial_nome: form.policial_nome,
				depto: form.depto,
				lotacao: form.lotacao,
				marca: form.marca || '',
				categoria: form.categoria || 'Armas',
			};

			if (form.policial_id) {
				payload.policial_id = form.policial_id;
			}

			await apiService.create('servicos', payload);
			setSuccess('Ficha de serviço salva com sucesso!');
			setForm({
				codigo: '',
				tipo: '',
				armeiro: '',
				data_rec: getToday(),
				data_dev: '',
				status: '',
				motivo: '',
				matricula: '',
				policial_nome: '',
				depto: '',
				lotacao: '',
				modelo: '',
				calibre: '',
				serie: '',
				descricao: '',
				marca: '',
				categoria: 'Armas',
				policial_id: null,
			});
			setArmaEncontrada(null);
			// Busca o próximo código para o próximo formulário
			try {
				const nextCodeData = await apiService.get('servicos/next-code');
				setForm((prev) => ({ ...prev, codigo: nextCodeData.codigo }));
			} catch {
				// Não bloqueia se a busca falhar
			}
		} catch (err) {
			setError(err.message || 'Não foi possível salvar o serviço.');
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<div className="page-header flex justify-between items-center">
				<div>
					<h1>➕ Novo Registro de Serviço</h1>
					<p>Abertura manual de ficha de manutenção</p>
				</div>
				<button className="btn btn-outline btn-sm" onClick={() => onNavigate('pg-registros')}>
					📋 Ver Registros
				</button>
			</div>

			{success && <div className="alert alert-success show">✅ {success}</div>}
			{error && <div className="alert alert-danger show">⚠️ {error}</div>}

			<div className="card">
				<div className="form-grid">
					<div className="form-group">
						<label htmlFor="ns-tipo">Tipo de Serviço *</label>
						<select id="ns-tipo" value={form.tipo} onChange={(e) => setField('tipo', e.target.value)}>
							<option value="">Selecione o tipo de serviço...</option>
							{LISTAS.tiposServico.map((item, idx) => <option key={`tipo-${item}-${idx}`} value={item}>{item}</option>)}
						</select>
					</div>
					<div className="form-group">
						<label htmlFor="ns-armeiro">Armeiro Responsável *</label>
						<select id="ns-armeiro" value={form.armeiro} onChange={(e) => setField('armeiro', e.target.value)}>
							<option value="">Selecione o armeiro...</option>
							{LISTAS.armeiros.map((item, idx) => <option key={`arm-${item}-${idx}`} value={item}>{item}</option>)}
						</select>
					</div>
					<div className="form-group">
						<label htmlFor="ns-data-rec">Data Recebimento *</label>
						<input id="ns-data-rec" type="date" value={form.data_rec} onChange={(e) => setField('data_rec', e.target.value)} />
					</div>
					{!esconderDataDevolucao && (
						<div className="form-group">
							<label htmlFor="ns-data-dev">Data Devolução</label>
							<input id="ns-data-dev" type="date" value={form.data_dev} onChange={(e) => setField('data_dev', e.target.value)} />
						</div>
					)}
					<div className="form-group">
						<label htmlFor="ns-status">Status *</label>
						<select id="ns-status" value={form.status} onChange={(e) => setField('status', e.target.value)}>
							<option value="">Selecione o status...</option>
							{statusOpcoes.map((item, idx) => <option key={`stat-${item}-${idx}`} value={item}>{item}</option>)}
						</select>
					</div>
					<div className="form-group">
						<label htmlFor="ns-motivo">Causa / Motivo *</label>
						<select id="ns-motivo" value={form.motivo} onChange={(e) => setField('motivo', e.target.value)}>
							<option value="">Selecione a causa/motivo...</option>
							{causas.map((item, idx) => <option key={`mot-${item}-${idx}`} value={item}>{item}</option>)}
						</select>
					</div>
				</div>

				<div className="card-title mt-16">👮 Dados do Policial</div>
				<div className="form-grid">
					<div className="form-group" style={{ position: 'relative' }}>
						<label htmlFor="ns-matricula">Matrícula *</label>
						<input
							id="ns-matricula"
							type="text"
							value={form.matricula}
							onChange={(e) => setField('matricula', e.target.value)}
							placeholder="Digite a matrícula..."
							autoComplete="off"
						/>
						{sugestoesPoliciais.length > 0 && (
							<div style={{
								position: 'absolute',
								zIndex: 100,
								width: '100%',
								backgroundColor: '#ffffff',
								border: '1px solid #0284c7',
								borderRadius: '6px',
								boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
								maxHeight: '220px',
								overflowY: 'auto',
								marginTop: '4px',
								top: '100%'
							}}>
								{sugestoesPoliciais.map((p) => (
									<div
										key={p.id}
										style={{
											padding: '10px 12px',
											cursor: 'pointer',
											borderBottom: '1px solid #f0f0f0',
											color: '#1e293b',
											fontSize: '13px',
											backgroundColor: '#ffffff'
										}}
										onMouseDown={() => handleSelectPolicial(p)}
										onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f9ff'}
										onMouseLeave={(e) => e.target.style.backgroundColor = '#ffffff'}
									>
										<div style={{ fontWeight: 'bold', color: '#0369a1' }}>
											Matrícula: {p.matricula} — {p.nome}
										</div>
										<div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
											Depto: {p.depto || '—'} | Lotação: {p.lotacao || '—'}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
					<div className="form-group">
						<label htmlFor="ns-policial">Nome do Policial *</label>
						<input id="ns-policial" type="text" value={form.policial_nome} onChange={(e) => setField('policial_nome', e.target.value)} />
					</div>
					<div className="form-group">
						<label htmlFor="ns-depto">Departamento *</label>
						<select id="ns-depto" value={form.depto} onChange={(e) => setForm((prev) => ({ ...prev, depto: e.target.value, lotacao: '' }))}>
							<option value="">Selecione...</option>
							{departamentos.map((item, idx) => <option key={`dep-${item}-${idx}`} value={item}>{item}</option>)}
						</select>
					</div>
					<div className="form-group">
						<label htmlFor="ns-lotacao">Lotação da Unidade *</label>
						<select
							id="ns-lotacao"
							value={form.lotacao}
							onChange={(e) => setField('lotacao', e.target.value)}
							disabled={!form.depto}
						>
							<option value="">{form.depto ? 'Selecione...' : 'Selecione o departamento'}</option>
							{lotacoes.map((item, idx) => <option key={`lot-${item}-${idx}`} value={item}>{item}</option>)}
						</select>
					</div>
				</div>

				{form.policial_nome && !form.lotacao && (
					<div style={{
						marginTop: '12px',
						padding: '10px 14px',
						backgroundColor: '#f0fdf4',
						border: '1px solid #bbf7d0',
						borderRadius: '6px',
						color: '#166534',
						fontSize: '13px',
						display: 'flex',
						alignItems: 'center',
						gap: '8px'
					}}>
						<span>👮</span>
						<div>
							<strong>Policial Localizado:</strong> {form.policial_nome} (Matrícula: {form.matricula}) &nbsp;|&nbsp; 
							<strong>Departamento:</strong> {form.depto || 'Não informado'} &nbsp;|&nbsp; 
							<strong>Lotação:</strong> {form.lotacao || 'Não informada'}
						</div>
					</div>
				)}

				{(form.matricula || form.policial_id || form.policial_nome) && (
					<div style={{
						marginTop: '20px',
						marginBottom: '10px',
						padding: '16px',
						backgroundColor: '#f8fafc',
						border: '1px solid #cbd5e1',
						borderRadius: '8px'
					}}>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
							<h4 style={{ margin: 0, color: '#1e293b', fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
								<GlockIcon size={20} /> Armamento(s) Acautelado(s) com o Policial ({cautelasAtivas.length})
							</h4>
							{loadingCautelas && <span style={{ fontSize: '12px', color: '#3b82f6' }}>⏳ Buscando armas acauteladas...</span>}
						</div>

						{loadingCautelas ? (
							<div style={{ fontSize: '13px', color: '#64748b', padding: '10px 0' }}>
								Consultando banco de cautelas ativas do policial...
							</div>
						) : cautelasAtivas.length > 0 ? (
							<div>
								<p style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
									Clique no botão <strong>Selecionar esta Arma</strong> para preencher automaticamente os dados do armamento que necessita do serviço:
								</p>
								<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
									{cautelasAtivas.map((c) => {
										const currentSerie = normalizeSerie(form.serie);
										const cautelaSerie = normalizeSerie(c.serie || c.numero_serie);
										const isSelected = !!currentSerie && currentSerie === cautelaSerie;

										return (
											<div
												key={c.id}
												onClick={() => handleSelectCautela(c)}
												style={{
													padding: '14px',
													backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
													border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
													borderRadius: '8px',
													cursor: 'pointer',
													transition: 'all 0.15s ease',
													boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.2)' : '0 1px 3px rgba(0,0,0,0.05)'
												}}
											>
												<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
													<div>
														<span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', color: '#2563eb', display: 'block' }}>
															Nº DE SÉRIE
														</span>
														<strong style={{ fontSize: '15px', color: '#0f172a', fontFamily: 'monospace' }}>
															{c.serie || c.numero_serie || 'SEM SÉRIE'}
														</strong>
													</div>
													<span style={{
														fontSize: '11px',
														fontWeight: 'bold',
														padding: '3px 8px',
														borderRadius: '12px',
														backgroundColor: isSelected ? '#16a34a' : '#2563eb',
														color: '#ffffff'
													}}>
														{isSelected ? '✓ SELECIONADA' : 'ACAUTELADA'}
													</span>
												</div>

												<div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>
													{c.item_desc || c.item_descricao || `${c.marca || ''} ${c.modelo || ''}`.trim() || 'Armamento'}
												</div>

												<div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
													Modelo: <strong>{c.modelo || '—'}</strong> | Calibre: <strong>{c.calibre || '—'}</strong>
												</div>

												<div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
													Lotação: {c.lotacao || c.depto || form.lotacao || '—'}
												</div>

												<button
													type="button"
													style={{
														marginTop: '10px',
														width: '100%',
														padding: '6px 12px',
														fontSize: '12px',
														fontWeight: 'bold',
														borderRadius: '6px',
														border: 'none',
														cursor: 'pointer',
														backgroundColor: isSelected ? '#16a34a' : '#2563eb',
														color: '#ffffff',
														transition: 'background-color 0.15s ease'
													}}
													onClick={(e) => {
														e.stopPropagation();
														handleSelectCautela(c);
													}}
												>
													{isSelected ? '✓ Arma Selecionada' : '🎯 Selecionar Esta Arma'}
												</button>
											</div>
										);
									})}
								</div>
							</div>
						) : (
							<div style={{ fontSize: '13px', color: '#64748b', padding: '4px 0' }}>
								ℹ️ Nenhum armamento ativo acautelado registrado para a matrícula <strong>{form.matricula}</strong>. Caso o serviço seja para outra arma, informe o número de série e modelo nos campos abaixo.
							</div>
						)}
					</div>
				)}



				<div className="card-title mt-16" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><GlockIcon size={20} /> Identificação do Armamento</div>

<div className="form-grid">

	<div className="form-group" style={{ position: 'relative' }}>
		<label htmlFor="ns-serie">Número de Série *</label>
		<input
			id="ns-serie"
			type="text"
			value={form.serie}
			onChange={(e) => setField("serie", e.target.value)}
			autoComplete="off"
		/>
		{sugestoesSeries.length > 0 && !armaEncontrada && (
			<div style={{
				position: 'absolute',
				zIndex: 100,
				width: '100%',
				backgroundColor: '#ffffff',
				border: '1px solid #ccc',
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
							borderBottom: '1px solid #f0f0f0',
							color: '#333',
							fontSize: '13px',
							backgroundColor: '#ffffff',
							transition: 'background-color 0.1s ease'
						}}
						onMouseDown={() => {
							setArmaEncontrada(sug);
							setForm((prev) => ({
								...prev,
								serie: sug.numero_serie,
								modelo: sug.modelo,
								calibre: sug.calibre,
								marca: sug.marca || '',
								categoria: 'Armas',
								descricao: sug.item_descricao || prev.descricao
							}));
							setSugestoesSeries([]);
						}}
						onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
						onMouseLeave={(e) => e.target.style.backgroundColor = '#ffffff'}
					>
						<strong>{sug.numero_serie}</strong> - {sug.marca} {sug.modelo} ({sug.calibre})
					</div>
				))}
			</div>
		)}
		{armaEncontrada && (
			<small style={{ color: '#2a9d8f', display: 'block', marginTop: '4px', fontWeight: '500' }}>
				✓ Arma localizada em estoque: {armaEncontrada.marca} {armaEncontrada.modelo} ({armaEncontrada.calibre})
			</small>
		)}
	</div>

	<div className="form-group">
		<label htmlFor="ns-modelo">Modelo *</label>
		<select
			id="ns-modelo"
			value={form.modelo}
			onChange={(e) => setField("modelo", e.target.value)}
			disabled={!!armaEncontrada}
			style={armaEncontrada ? { backgroundColor: '#f0f0f0', cursor: 'not-allowed', opacity: 0.8 } : {}}
		>
			<option value="">Selecione o modelo...</option>
			{LISTAS.modelos.map((item, idx) => (
				<option key={`mod-${item}-${idx}`} value={item}>
					{item}
				</option>
			))}
		</select>
	</div>

	<div className="form-group">
		<label htmlFor="ns-calibre">Calibre *</label>
		<select
			id="ns-calibre"
			value={form.calibre}
			onChange={(e) => setField("calibre", e.target.value)}
		>
			<option value="">Selecione o calibre...</option>
			{LISTAS.calibres.map((item, idx) => (
				<option key={`cal-${item}-${idx}`} value={item}>
					{item}
				</option>
			))}
		</select>
	</div>

</div>
				<div className="form-group full mt-16">
					<label htmlFor="ns-descricao">Descrição Detalhada do Reparo</label>
					<textarea id="ns-descricao" value={form.descricao} onChange={(e) => setField('descricao', e.target.value)} />
				</div>

				<button className="btn btn-primary mt-16" onClick={handleSubmit} disabled={loading}>
					{loading ? 'Salvando...' : '💾 Salvar Ordem de Serviço'}
				</button>
			</div>

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
								if (loadingCautelas) {
									setPendingShowArmaModal(true);
								} else if (cautelasAtivas.length > 0) {
									setShowConfirmArmaModal(true);
								}
							}}
						>
							Não, alterar lotação
						</button>
						<button 
							className="btn btn-primary" 
							onClick={() => {
								setShowConfirmLotacaoModal(false);
								if (loadingCautelas) {
									setPendingShowArmaModal(true);
								} else if (cautelasAtivas.length > 0) {
									setShowConfirmArmaModal(true);
								}
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
					<p>Ele permanece atuando nesta mesma lotação para esta solicitação de serviço?</p>
				</div>
			</Modal>

			<Modal
				isOpen={showConfirmArmaModal}
				title="Confirmar Arma do Policial para Manutenção"
				onClose={() => setShowConfirmArmaModal(false)}
				footer={(
					<button 
						className="btn btn-outline" 
						onClick={() => setShowConfirmArmaModal(false)}
					>
						Informar outro armamento manualmente
					</button>
				)}
			>
				<div style={{ padding: '10px 0', fontSize: '15px', lineHeight: '1.6' }}>
					<p>
						O policial <strong>{form.policial_nome || pendingPolicial?.nome}</strong> (Matrícula: {form.matricula || pendingPolicial?.matricula}) possui os seguintes armamentos acautelados ativos. Selecione qual deles é o objeto da manutenção:
					</p>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '15px 0' }}>
						{cautelasAtivas.map((c) => (
							<button
								key={c.id}
								type="button"
								onClick={() => {
									handleSelectCautela(c);
									setShowConfirmArmaModal(false);
								}}
								style={{
									display: 'block',
									width: '100%',
									textAlign: 'left',
									padding: '16px',
									border: 'none',
									borderLeft: '4px solid #3b82f6',
									backgroundColor: '#f3f4f6',
									borderRadius: '6px',
									cursor: 'pointer',
									transition: 'all 0.2s',
								}}
								className="hover:bg-blue-50/50 hover:shadow-xs group"
							>
								<div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#1e293b', fontSize: '15px' }}>
									<span>Série: {c.serie || c.numero_serie || 'Sem série'}</span>
									<span style={{ color: '#3b82f6', fontSize: '12px', fontWeight: '600' }} className="group-hover:translate-x-1 transition-transform inline-block">Selecionar ➔</span>
								</div>
								<div style={{ fontSize: '13px', color: '#475569', marginTop: '6px' }}>
									{c.item_desc || c.item_descricao || 'Armamento'}
								</div>
								<div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
									<strong>Lotação:</strong> {c.lotacao || c.depto || '—'}
								</div>
							</button>
						))}
					</div>
				</div>
			</Modal>
		</>
	);
}

export default NovoServico;
