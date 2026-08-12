import React, { useState } from 'react';
import { useAuth, REQUIRED_DOMAIN, validateEmail, validatePassword, SEED_USERS } from '../context/AuthContext';

export default function LoginModal({ isOpen, onClose }) {
  const { currentUser, login, register, switchUser, logout, users } = useAuth();
  
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register'
  
  // Login Form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Register Form
  const [regNome, setRegNome] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regRole, setRegRole] = useState('armeiro'); // 'admin' | 'armeiro' | 'administrativo'
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  if (!isOpen && currentUser) return null;

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setLoginError('');

    try {
      login(email, password);
      if (onClose) onClose();
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');

    if (regPassword !== regConfirmPassword) {
      setRegError('As senhas digitadas não coincidem.');
      return;
    }

    try {
      const newUser = register(regNome, regEmail, regPassword);
      setRegSuccess(`Conta criada com sucesso para ${newUser.nome}! Perfil inicial: Administrativo. Para alteração de nível, contate o Administrador.`);
      setTimeout(() => {
        if (onClose) onClose();
      }, 1500);
    } catch (err) {
      setRegError(err.message);
    }
  };

  const handleQuickLogin = (seedUser) => {
    try {
      login(seedUser.email, seedUser.password);
      if (onClose) onClose();
    } catch (err) {
      // Fallback switch if password changed
      switchUser(seedUser.id);
      if (onClose) onClose();
    }
  };

  // Password validation indicators
  const isLenOk = regPassword.length >= 8;
  const isUpperOk = /[A-Z]/.test(regPassword);
  const isNumOk = /[0-9]/.test(regPassword);
  const isSpecOk = /[^A-Za-z0-9]/.test(regPassword);

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        maxWidth: '520px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-[#1a365d]',
          backgroundColor: '#1a365d',
          color: '#ffffff',
          padding: '24px 28px',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
            <img src="/brasao_pcce.png" alt="Brasão Polícia Civil do Ceará" style={{ height: '54px', width: 'auto', objectFit: 'contain' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em', color: '#ffffff' }}>
                POLÍCIA CIVIL DO CEARÁ
              </h2>
              <div style={{ fontSize: '12px', color: '#93c5fd', fontWeight: '600' }}>
                Controle de Armaria & Acervo Institucional
              </div>
            </div>
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#e2e8f0', lineHeight: '1.4' }}>
            Autenticação e controle por Níveis de Acesso
          </p>

          {currentUser && onClose && (
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(255, 255, 255, 0.15)',
                border: 'none',
                color: '#fff',
                fontSize: '16px',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Quick Demo Access Bar */}
        <div style={{ backgroundColor: '#f8fafc', padding: '12px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', marginBottom: '8px' }}>
            ⚡ Acesso Rápido de Teste (Escolha um Nível):
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {SEED_USERS.map(su => (
              <button
                key={su.id}
                type="button"
                onClick={() => handleQuickLogin(su)}
                style={{
                  flex: 1,
                  minWidth: '130px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: '700',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: su.badgeColor,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
                title={`Entrar diretamente como ${su.roleLabel}`}
              >
                <span>{su.role === 'admin' ? '👑' : su.role === 'armeiro' ? '🔧' : '📋'}</span>
                {su.roleLabel}
              </button>
            ))}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '14px',
              fontSize: '14px',
              fontWeight: '700',
              border: 'none',
              backgroundColor: activeTab === 'login' ? '#ffffff' : '#f1f5f9',
              color: activeTab === 'login' ? '#1a365d' : '#64748b',
              borderBottom: activeTab === 'login' ? '3px solid #1a365d' : 'none',
              cursor: 'pointer'
            }}
            onClick={() => { setActiveTab('login'); setLoginError(''); }}
          >
            🔑 Entrar (Login)
          </button>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '14px',
              fontSize: '14px',
              fontWeight: '700',
              border: 'none',
              backgroundColor: activeTab === 'register' ? '#ffffff' : '#f1f5f9',
              color: activeTab === 'register' ? '#1a365d' : '#64748b',
              borderBottom: activeTab === 'register' ? '3px solid #1a365d' : 'none',
              cursor: 'pointer'
            }}
            onClick={() => { setActiveTab('register'); setRegError(''); }}
          >
            📝 Criar Nova Conta
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: '24px 28px' }}>
          {activeTab === 'login' ? (
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {loginError && (
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  color: '#991b1b',
                  fontSize: '13px',
                  fontWeight: '600',
                  lineHeight: '1.4'
                }}>
                  ⚠️ {loginError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                  E-mail Institucional (@pc.ce.gov.br) <span style={{ color: '#e11d48' }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="exemplo@pc.ce.gov.br"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  🔒 Somente e-mails do domínio <strong>@pc.ce.gov.br</strong> são autorizados.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                  Senha de Acesso <span style={{ color: '#e11d48' }}>*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Sua senha secreta"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: '800',
                  color: '#ffffff',
                  backgroundColor: '#1a365d',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  marginTop: '8px',
                  transition: 'background-color 0.2s'
                }}
              >
                Acessar o Sistema
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {regError && (
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  color: '#991b1b',
                  fontSize: '13px',
                  fontWeight: '600'
                }}>
                  ⚠️ {regError}
                </div>
              )}

              {regSuccess && (
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                  color: '#166534',
                  fontSize: '13px',
                  fontWeight: '600'
                }}>
                  ✅ {regSuccess}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Agente Carlos Eduardo"
                  value={regNome}
                  onChange={e => setRegNome(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                  E-mail Institucional (@pc.ce.gov.br) <span style={{ color: '#e11d48' }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="usuario@pc.ce.gov.br"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Information Notice about Access Level */}
              <div style={{
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '12px',
                color: '#1e3a8a',
                lineHeight: '1.4'
              }}>
                <div style={{ fontWeight: '700', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>🔒 Definição do Nível de Acesso:</span>
                </div>
                <div>
                  O perfil do usuário é determinado exclusivamente pelo <strong>Administrador do Sistema</strong>. Novos cadastros são registrados automaticamente com perfil básico (Administrativo) até a liberação de nível superior pelo Administrador.
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                  Senha
                </label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 8 caracteres"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Password Requirements Guide */}
              <div style={{ backgroundColor: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                <div style={{ fontWeight: '700', color: '#475569', marginBottom: '4px' }}>Requisitos Obrigatórios da Senha:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                  <span style={{ color: isLenOk ? '#16a34a' : '#94a3b8', fontWeight: isLenOk ? '700' : '400' }}>
                    {isLenOk ? '✅' : '⚪'} Mínimo 8 caracteres
                  </span>
                  <span style={{ color: isUpperOk ? '#16a34a' : '#94a3b8', fontWeight: isUpperOk ? '700' : '400' }}>
                    {isUpperOk ? '✅' : '⚪'} Letra maiúscula (A-Z)
                  </span>
                  <span style={{ color: isNumOk ? '#16a34a' : '#94a3b8', fontWeight: isNumOk ? '700' : '400' }}>
                    {isNumOk ? '✅' : '⚪'} Pelo menos 1 número
                  </span>
                  <span style={{ color: isSpecOk ? '#16a34a' : '#94a3b8', fontWeight: isSpecOk ? '700' : '400' }}>
                    {isSpecOk ? '✅' : '⚪'} Caractere especial (!@#$)
                  </span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                  Confirmar Senha
                </label>
                <input
                  type="password"
                  required
                  placeholder="Repita a senha"
                  value={regConfirmPassword}
                  onChange={e => setRegConfirmPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: '800',
                  color: '#ffffff',
                  backgroundColor: '#059669',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  marginTop: '4px'
                }}
              >
                Cadastrar e Acessar
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
